import fs from 'fs-extra';
import path from 'node:path';
import type { Command } from 'commander';
import { listLeeSpecFeatures } from '../adapters/schema/lee-spec-kit/feature.js';
import { getConfig } from '../utils/config.js';
import { parseTaskLine } from '../utils/task-lines.js';
import { runGitCapture } from '../utils/git-run.js';
import { resolveGitTopLevelOrNull } from '../utils/standalone-workspace.js';
import { toCliError } from '../utils/cli-error.js';

export function featureAuditCommand(program: Command): void {
  program
    .command('feature-audit')
    .description(
      'Validate Feature identities and task state across the docs tree (CI safe)'
    )
    .option(
      '--base-ref <ref>',
      'Compare immutable metadata against a fetched base ref'
    )
    .option('--json')
    .option('--enforce', 'Fail when violations are found')
    .action(async (options: { baseRef?: string; enforce?: boolean }) => {
      try {
        const config = await getConfig(process.cwd());
        if (!config) throw new Error('Docs configuration not found.');
        const root = resolveGitTopLevelOrNull(config.docsDir);
        if (
          options.baseRef &&
          (!root ||
            !runGitCapture(
              ['rev-parse', '--verify', `${options.baseRef}^{commit}`],
              root
            ))
        )
          throw new Error('Base ref must resolve to a fetched commit.');
        const refs = await listLeeSpecFeatures(process.cwd());
        const violations: Array<{ feature: string; reason: string }> = [];
        const identities = new Set<string>();
        const boundIdentities = new Map<
          string,
          { id: string; branch: string }
        >();
        for (const ref of refs) {
          const directory = path.join(
            config.docsDir,
            'features',
            ref.component || '',
            ref.folderName
          );
          const report = (reason: string): void => {
            violations.push({ feature: ref.folderName, reason });
          };
          const identity = `${ref.component || 'single'}:${ref.id}`;
          if (identities.has(identity))
            report('Duplicate Feature ID in the same component.');
          identities.add(identity);
          const metadataPath = path.join(directory, '.feature.json');
          if (await fs.pathExists(metadataPath)) {
            try {
              const metadata = await fs.readJson(metadataPath);
              if (
                metadata.version !== 1 ||
                metadata.id !== ref.id ||
                typeof metadata.branch !== 'string' ||
                typeof metadata.identity !== 'string' ||
                (metadata.owner !== null && typeof metadata.owner !== 'string')
              )
                report('Invalid Feature metadata.');
              if (boundIdentities.has(metadata.identity))
                report(
                  'Duplicate repository/Issue or local identity across components.'
                );
              boundIdentities.set(metadata.identity, {
                id: metadata.id,
                branch: metadata.branch,
              });
              if (
                metadata.issue &&
                (String(metadata.issue.number) !== ref.id ||
                  metadata.identity !== metadata.issue.url)
              )
                report('Issue identity does not match the Feature ID.');
              if (options.baseRef && root) {
                const original = runGitCapture(
                  [
                    'show',
                    `${options.baseRef}:${path.relative(root, metadataPath).replace(/\\/g, '/')}`,
                  ],
                  root
                );
                if (original) {
                  const previous = JSON.parse(original);
                  if (
                    previous.id !== metadata.id ||
                    previous.identity !== metadata.identity ||
                    previous.branch !== metadata.branch
                  )
                    report('Immutable Feature identity or branch changed.');
                }
              }
              const tasks = await fs.readFile(
                path.join(directory, 'tasks.md'),
                'utf8'
              );
              const branch = tasks.match(
                /^- \*\*(?:Branch|브랜치)\*\*:\s*`?([^`\n]+)`?\s*$/m
              )?.[1];
              if (branch !== metadata.branch)
                report('Branch metadata and tasks.md disagree.');
              if (
                metadata.issue &&
                !new RegExp(
                  `^- \\*\\*Issue\\*\\*:\\s*#${metadata.issue.number}\\s*$`,
                  'm'
                ).test(tasks)
              )
                report('Issue metadata and tasks.md disagree.');
            } catch {
              report('Unreadable Feature metadata or tasks.md.');
            }
          } else if (!/^F\d{3,}$/.test(ref.id || ''))
            report('New Features require .feature.json.');
          const content = await fs
            .readFile(path.join(directory, 'tasks.md'), 'utf8')
            .catch(() => '');
          let fenced = false;
          const tasks = content.split('\n').flatMap((line) => {
            if (/^\s*(```|~~~)/.test(line)) {
              fenced = !fenced;
              return [];
            }
            const task = fenced ? null : parseTaskLine(line);
            return task ? [task] : [];
          });
          if (
            tasks.filter((task) => ['DOING', 'REVIEW'].includes(task.status))
              .length > 1
          )
            report('Multiple active tasks in a single-owner Feature.');
          if (new Set(tasks.map((task) => task.taskId)).size !== tasks.length)
            report('Duplicate task IDs.');
        }
        if (options.baseRef && root) {
          const prefix = path
            .relative(root, config.docsDir)
            .replace(/\\/g, '/');
          const files =
            runGitCapture(
              [
                'ls-tree',
                '-r',
                '--name-only',
                options.baseRef,
                '--',
                `${prefix ? `${prefix}/` : ''}features`,
              ],
              root
            )?.split('\n') || [];
          for (const file of files.filter((file) =>
            file.endsWith('/.feature.json')
          )) {
            const previous = JSON.parse(
              runGitCapture(['show', `${options.baseRef}:${file}`], root) ||
                '{}'
            );
            const current = boundIdentities.get(previous.identity);
            if (
              !current ||
              current.id !== previous.id ||
              current.branch !== previous.branch
            ) {
              violations.push({
                feature: file,
                reason: 'An existing Feature identity was removed or changed.',
              });
            }
          }
        }
        console.log(
          JSON.stringify(
            { status: violations.length ? 'blocked' : 'ok', violations },
            null,
            2
          )
        );
        if (violations.length && options.enforce) process.exitCode = 1;
      } catch (error) {
        const parsed = toCliError(error);
        console.log(
          JSON.stringify({
            status: 'error',
            reasonCode: parsed.code,
            error: parsed.message,
          })
        );
        process.exitCode = 1;
      }
    });
}

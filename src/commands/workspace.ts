import { resolveFeatureCommitScope } from '../utils/commit-conventions.js';
import { collectWorkflowStage } from '../utils/workflow-stage.js';
import fs from 'fs-extra';
import path from 'node:path';
import type { Command } from 'commander';
import { resolveFeatureSelection } from '../utils/feature-resolver.js';
import { docsIntegrationMarker, resolveDocsWorkspace } from '../utils/feature-workspace.js';
import { getRepositoryLockPath, withFileLock } from '../utils/lock.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import { runGitCapture, runGitOrThrow } from '../utils/git-run.js';
import { resolveLocalIntegrationContext } from '../utils/local-integration.js';
import { runProcess } from './github/process.js';

export function workspaceCommand(program: Command): void {
  const workspace = program
    .command('workspace')
    .description('Isolate and integrate standalone Feature docs');
  for (const action of [
    'prepare',
    'sync-docs',
    'merge-docs',
    'cleanup-docs',
  ] as const) {
    workspace
      .command(`${action} <feature>`)
      .option('--component <component>')
      .option('--json')
      .action(async (selector: string, options: { component?: string }) => {
        try {
          const selection = await resolveFeatureSelection(
            process.cwd(),
            selector,
            options.component
          );
          if (!selection.matchedFeature)
            throw createCliError(
              'FEATURE_SELECTION_REQUIRED',
              'Select one Feature.'
            );
          const { config, matchedFeature: feature } = selection;
          const state = await resolveDocsWorkspace(config, feature);
          if (!state)
            throw createCliError(
              'PRECONDITION_FAILED',
              'A new standalone Feature is required.'
            );
          const result = await withFileLock(
            getRepositoryLockPath(state.root, 'docs-integration'),
            async () => {
              const git = (cwd: string, args: string[]): string =>
                runGitOrThrow(args, cwd, { stdio: ['ignore', 'pipe', 'pipe'] });
              const clean = (cwd: string): void => {
                if (git(cwd, ['status', '--porcelain']))
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    `Commit or resolve changes first: ${cwd}`
                  );
              };
              if (!state.baseBranch || state.baseBranch === state.branch)
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'A separate docs base branch is required.'
                );
              if (action === 'prepare') {
                clean(state.root);
                if (!(await fs.pathExists(state.directory))) {
                  await fs.ensureDir(path.dirname(state.directory));
                  const exists = runGitCapture(
                    ['show-ref', '--verify', `refs/heads/${state.branch}`],
                    state.root
                  );
                  git(state.root, [
                    'worktree',
                    'add',
                    ...(exists ? [] : ['-b', state.branch]),
                    state.directory,
                    exists ? state.branch : state.baseBranch,
                  ]);
                }
                if (
                  git(state.directory, ['branch', '--show-current']) !==
                  state.branch
                )
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    'Workspace branch mismatch; existing files were preserved.'
                  );
                await fs.outputJson(state.statePath, {
                  baseBranch: state.baseBranch,
                  status: 'active',
                });
                return {
                  docsDirectory: state.docsDirectory,
                  projectDirectory: feature.git.projectGitCwd,
                  next: `Run subsequent Feature commands from ${state.docsDirectory}; workflow-stage creates the paired project worktree after approval.`,
                };
              }
              if (!(await fs.pathExists(state.directory)))
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'Prepare the docs workspace first.'
                );
              clean(state.directory);
              if (
                git(state.directory, ['branch', '--show-current']) !==
                state.branch
              )
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'Workspace branch changed.'
                );
              if (action === 'sync-docs') {
                // Conflicts stay in this Feature's worktree, never in the shared base checkout.
                git(state.directory, [
                  'merge',
                  '--no-edit',
                  `refs/heads/${state.baseBranch}`,
                ]);
                return {
                  docsDirectory: state.directory,
                  revalidationRequired: true,
                };
              }
              const tip = git(state.directory, ['rev-parse', 'HEAD']);
              if (action === 'merge-docs') {
                const workflow = await collectWorkflowStage(
                  process.cwd(),
                  selector,
                  options.component
                );
                if (workflow.nextAction?.category !== 'workspace_merge_docs') {
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    'Complete the current workflow gate before integrating docs.'
                  );
                }
                const docsRelative = path
                  .relative(state.directory, state.docsDirectory)
                  .replace(/\\/g, '/');
                const featurePrefix = `${docsRelative ? `${docsRelative}/` : ''}features/`;
                const ownPrefix = `${docsRelative ? `${docsRelative}/` : ''}${feature.docs.featurePathFromDocs}/`;
                const changed = git(state.directory, [
                  'diff',
                  '--name-only',
                  `refs/heads/${state.baseBranch}`,
                  tip,
                ]).split('\n');
                if (
                  changed.some(
                    (file) =>
                      file.startsWith(featurePrefix) &&
                      !file.startsWith(ownPrefix)
                  )
                ) {
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    'Another Feature document changed in this workspace. Separate those changes before integration.'
                  );
                }
                if (config.workflow?.mode === 'local') {
                  const integration = await resolveLocalIntegrationContext(
                    config,
                    feature
                  );
                  if (
                    !integration.integrationComplete ||
                    integration.state?.status !== 'verified'
                  ) {
                    throw createCliError(
                      'PRECONDITION_FAILED',
                      'Verify project integration before merging its docs.'
                    );
                  }
                } else {
                  const tasks = await fs.readFile(
                    path.join(feature.path, 'tasks.md'),
                    'utf8'
                  );
                  const pr = tasks.match(/^- \*\*PR\*\*:\s*(\S+)/m)?.[1];
                  if (!pr || pr === '-')
                    throw createCliError(
                      'PRECONDITION_FAILED',
                      'A merged PR is required.'
                    );
                  const viewed = runProcess(
                    'gh',
                    ['pr', 'view', pr, '--json', 'state'],
                    feature.git.projectGitCwd
                  );
                  if (
                    viewed.code ||
                    JSON.parse(viewed.stdout).state !== 'MERGED'
                  )
                    throw createCliError(
                      'PRECONDITION_FAILED',
                      'Merge the project PR before its docs.'
                    );
                }
                clean(state.root);
                if (
                  git(state.root, ['branch', '--show-current']) !==
                    state.baseBranch ||
                  runGitCapture(
                    [
                      'merge-base',
                      '--is-ancestor',
                      `refs/heads/${state.baseBranch}`,
                      tip,
                    ],
                    state.root
                  ) === undefined
                ) {
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    'Docs base advanced. Run workspace sync-docs and revalidate before merging.'
                  );
                }
                const scope = resolveFeatureCommitScope({ issueNumber: feature.issueNumber,
                  featureId: feature.id, workflowMode: config.workflow?.mode });
                if (!scope) throw createCliError('PRECONDITION_FAILED', 'Feature commit scope is required.');
                // Empty receipt commit preserves reviewed docs content and survives clones/cache loss.
                git(state.directory, ['commit', '--allow-empty', '-m',
                  `docs(${scope}): integrate ${feature.slug} documentation\n\n${docsIntegrationMarker(feature)}`]);
                const receiptTip = git(state.directory, ['rev-parse', 'HEAD']);
                git(state.root, ['merge', '--ff-only', receiptTip]);
                await fs.outputJson(state.statePath, {
                  baseBranch: state.baseBranch,
                  status: 'integrated',
                  tip: receiptTip,
                });
                return { integratedTip: receiptTip };
              }
              if (
                runGitCapture(
                  [
                    'merge-base',
                    '--is-ancestor',
                    tip,
                    `refs/heads/${state.baseBranch}`,
                  ],
                  state.root
                ) === undefined
              ) {
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'Unmerged docs must be preserved.'
                );
              }
              git(state.root, ['worktree', 'remove', state.directory]);
              git(state.root, ['branch', '-d', state.branch]);
              return { cleaned: true, docsDirectory: state.root };
            },
            { owner: `workspace ${action}` }
          );
          console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
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
}

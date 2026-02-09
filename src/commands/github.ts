import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import chalk from 'chalk';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { getConfig } from '../utils/config.js';
import {
  ContextSelectionOptions,
  resolveContextSelection,
} from '../utils/context-selection.js';
import { FeatureContext } from '../utils/context/index.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

interface GithubBaseOptions {
  json?: boolean;
  repo?: string;
  component?: string;
}

interface GithubIssueOptions extends GithubBaseOptions {
  create?: boolean;
  title?: string;
  labels?: string;
  bodyFile?: string;
  assignee?: string;
}

interface GithubPrOptions extends GithubBaseOptions {
  create?: boolean;
  merge?: boolean;
  pr?: string;
  title?: string;
  labels?: string;
  bodyFile?: string;
  assignee?: string;
  base?: string;
  retry?: string;
  syncTasks?: boolean;
  commitSync?: boolean;
}

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface PrViewMeta {
  url: string;
  headRefName: string;
  baseRefName: string;
}

function resolveComponentOption(
  options: Pick<GithubBaseOptions, 'repo' | 'component'>
): string | undefined {
  if (
    options.repo &&
    options.component &&
    options.repo.trim().toLowerCase() !== options.component.trim().toLowerCase()
  ) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--repo` and `--component` must reference the same value when both are provided.'
    );
  }
  const component = (options.component || options.repo || '').trim().toLowerCase();
  return component || undefined;
}

function parseLabels(raw: string | undefined): string[] {
  const labels = (raw || 'enhancement')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (labels.length === 0) {
    throw createCliError(
      'INVALID_ARGUMENT',
      'At least one label is required. Use `--labels enhancement`.'
    );
  }
  return [...new Set(labels)];
}

function runProcess(
  bin: string,
  args: string[],
  cwd: string
): ProcessResult {
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      LEE_SPEC_KIT_NO_UPDATE_CHECK: '1',
      LEE_SPEC_KIT_NO_BANNER: '1',
    },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runProcessOrThrow(
  bin: string,
  args: string[],
  cwd: string,
  failureMessage: string
): ProcessResult {
  const result = runProcess(bin, args, cwd);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw createCliError(
      'EXECUTION_FAILED',
      `${failureMessage}${detail ? `: ${detail}` : ''}`
    );
  }
  return result;
}

function runGhJson<T>(args: string[], cwd: string): T {
  const result = runProcessOrThrow('gh', args, cwd, 'GitHub CLI command failed');
  const text = result.stdout.trim();
  if (!text) {
    throw createCliError('EXECUTION_FAILED', 'GitHub CLI returned empty JSON output.');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw createCliError(
      'EXECUTION_FAILED',
      `GitHub CLI returned invalid JSON: ${text.slice(0, 160)}`
    );
  }
}

function ensureSections(body: string, sections: string[], kind: 'Issue' | 'PR'): void {
  const missing = sections.filter((section) => {
    const re = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
    return !re.test(body);
  });
  if (missing.length > 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      `${kind} body is missing required sections: ${missing.join(', ')}`
    );
  }
}

function ensureDocsExist(docsDir: string, relativePaths: string[]): void {
  const missing = relativePaths.filter(
    (relativePath) => !fs.existsSync(path.join(docsDir, relativePath))
  );
  if (missing.length > 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      `Related document paths do not exist: ${missing.join(', ')}`
    );
  }
}

function toBodyFilePath(raw: string | undefined, fallbackName: string): string {
  const selected = raw?.trim() || path.join(os.tmpdir(), fallbackName);
  return path.resolve(selected);
}

async function resolveFeatureOrThrow(
  featureName: string | undefined,
  options: ContextSelectionOptions
): Promise<{ config: NonNullable<Awaited<ReturnType<typeof getConfig>>>; feature: FeatureContext }> {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  const state = await resolveContextSelection(config, featureName, options);
  if (!state.matchedFeature) {
    if (state.status === 'no_features') {
      throw createCliError('PRECONDITION_FAILED', 'No features found.');
    }
    if (state.status === 'multiple_active') {
      throw createCliError(
        'CONTEXT_SELECTION_REQUIRED',
        'Multiple features matched. Specify feature name (slug | F001 | F001-slug).'
      );
    }
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'Failed to auto-select a feature. Specify feature name explicitly.'
    );
  }

  return { config, feature: state.matchedFeature };
}

function getFeatureDocPaths(feature: FeatureContext): {
  featurePathFromDocs: string;
  specPath: string;
  planPath: string;
  tasksPath: string;
} {
  const featurePathFromDocs = feature.docs.featurePathFromDocs;
  return {
    featurePathFromDocs,
    specPath: `${featurePathFromDocs}/spec.md`,
    planPath: `${featurePathFromDocs}/plan.md`,
    tasksPath: `${featurePathFromDocs}/tasks.md`,
  };
}

function buildIssueBody(
  feature: FeatureContext,
  labels: string[],
  paths: ReturnType<typeof getFeatureDocPaths>
): string {
  return `## Overview

Implement feature \`${feature.folderName}\`.

## Goals

- Finalize feature scope and implementation outcome
- Keep spec/plan/tasks aligned with delivery

## Completion Criteria

- [ ] Scope and approach are documented clearly
- [ ] Tasks are complete and verifiable
- [ ] Related docs are synchronized

## Related Documents

- **Spec**: \`${paths.specPath}\`
- **Plan**: \`${paths.planPath}\`
- **Tasks**: \`${paths.tasksPath}\`

## Labels

${labels.map((label) => `- \`${label}\``).join('\n')}
`;
}

function buildPrBody(
  feature: FeatureContext,
  paths: ReturnType<typeof getFeatureDocPaths>
): string {
  const closes = feature.issueNumber ? `\nCloses #${feature.issueNumber}\n` : '\n';
  return `## Overview

Implement and document feature \`${feature.folderName}\`.

## Changes

- Deliver implementation for the feature scope
- Update docs to match implementation and workflow state
- Keep PR metadata synchronized in tasks.md

## Tests

### Tests Run

- [x] \`<test command>\` — PASS

## Related Documents

- **Spec**: \`${paths.specPath}\`
- **Tasks**: \`${paths.tasksPath}\`${closes}`;
}

function replaceListField(
  content: string,
  keys: string[],
  value: string
): { content: string; changed: boolean; found: boolean } {
  for (const key of keys) {
    const re = new RegExp(
      `^(\\s*-\\s*\\*\\*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\s*:\\s*).*$`,
      'm'
    );
    if (!re.test(content)) continue;
    const next = content.replace(re, `$1${value}`);
    return { content: next, changed: next !== content, found: true };
  }
  return { content, changed: false, found: false };
}

function insertFieldInGithubIssueSection(
  content: string,
  key: string,
  value: string
): { content: string; changed: boolean } {
  const lines = content.split('\n');
  const headingIndex = lines.findIndex((line) =>
    /^\s*##\s+(GitHub Issue|로컬 추적 정보|Local Tracking)\s*$/.test(line)
  );
  if (headingIndex < 0) return { content, changed: false };

  let end = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (/^\s*##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }

  lines.splice(end, 0, `- **${key}**: ${value}`);
  return { content: lines.join('\n'), changed: true };
}

function syncTasksPrMetadata(
  tasksPath: string,
  prUrl: string,
  nextStatus: 'Review' | 'Approved'
): { changed: boolean; path: string } {
  if (!fs.existsSync(tasksPath)) {
    throw createCliError('DOCS_NOT_FOUND', `tasks.md not found: ${tasksPath}`);
  }

  const original = fs.readFileSync(tasksPath, 'utf-8');
  let next = original;
  let changed = false;

  const prReplaced = replaceListField(next, ['PR', 'Pull Request'], prUrl);
  next = prReplaced.content;
  changed = changed || prReplaced.changed;
  if (!prReplaced.found) {
    const inserted = insertFieldInGithubIssueSection(next, 'PR', prUrl);
    next = inserted.content;
    changed = changed || inserted.changed;
  }

  const statusReplaced = replaceListField(
    next,
    ['PR Status', 'PR 상태'],
    nextStatus
  );
  next = statusReplaced.content;
  changed = changed || statusReplaced.changed;
  if (!statusReplaced.found) {
    const inserted = insertFieldInGithubIssueSection(next, 'PR Status', nextStatus);
    next = inserted.content;
    changed = changed || inserted.changed;
  }

  if (changed) {
    fs.writeFileSync(tasksPath, next, 'utf-8');
  }
  return { changed, path: tasksPath };
}

function gitCurrentBranch(cwd: string): string {
  const result = runProcessOrThrow(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    cwd,
    'Failed to detect current git branch'
  );
  return result.stdout.trim();
}

function ensureCleanWorktree(cwd: string): void {
  const result = runProcessOrThrow(
    'git',
    ['status', '--porcelain=v1'],
    cwd,
    'Failed to inspect git worktree'
  );
  if (result.stdout.trim().length > 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      'Git worktree is not clean. Commit or stash changes before merge retry sync.'
    );
  }
}

function commitAndPushPath(cwd: string, absPath: string, message: string): void {
  const relativePath = path.relative(cwd, absPath) || absPath;
  const status = runProcessOrThrow(
    'git',
    ['status', '--porcelain=v1', '--', relativePath],
    cwd,
    'Failed to inspect git file status'
  );
  if (status.stdout.trim().length === 0) return;

  runProcessOrThrow('git', ['add', '--', relativePath], cwd, 'Failed to stage file');
  runProcessOrThrow('git', ['commit', '-m', message], cwd, 'Failed to commit synced metadata');

  const branch = gitCurrentBranch(cwd);
  runProcessOrThrow(
    'git',
    ['push', '-u', 'origin', branch],
    cwd,
    'Failed to push synced metadata commit'
  );
}

function shouldRefreshHeadBranch(stderr: string, stdout: string): boolean {
  const text = `${stderr}\n${stdout}`;
  return /out of date|not possible to fast-forward|must be up to date|not up to date/i.test(
    text
  );
}

function refreshPrHeadBranch(prRef: string, cwd: string): void {
  ensureCleanWorktree(cwd);

  const meta = runGhJson<PrViewMeta>(
    ['pr', 'view', prRef, '--json', 'url,headRefName,baseRefName'],
    cwd
  );
  const originalBranch = gitCurrentBranch(cwd);

  runProcessOrThrow(
    'git',
    ['fetch', 'origin', meta.baseRefName, meta.headRefName],
    cwd,
    'Failed to fetch PR branches'
  );

  const hasLocalHead = runProcess(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${meta.headRefName}`],
    cwd
  ).code === 0;

  if (hasLocalHead) {
    runProcessOrThrow(
      'git',
      ['checkout', meta.headRefName],
      cwd,
      'Failed to checkout PR head branch'
    );
  } else {
    runProcessOrThrow(
      'git',
      ['checkout', '-B', meta.headRefName, `origin/${meta.headRefName}`],
      cwd,
      'Failed to create local PR head branch'
    );
  }

  runProcessOrThrow(
    'git',
    ['rebase', `origin/${meta.baseRefName}`],
    cwd,
    'Failed to rebase PR head branch'
  );
  runProcessOrThrow(
    'git',
    ['push', '--force-with-lease', 'origin', meta.headRefName],
    cwd,
    'Failed to push rebased PR head branch'
  );

  if (originalBranch !== meta.headRefName) {
    runProcessOrThrow(
      'git',
      ['checkout', originalBranch],
      cwd,
      'Failed to restore previous branch after PR refresh'
    );
  }
}

function mergePrWithRetry(
  prRef: string,
  cwd: string,
  retryCount: number
): { merged: true; attempts: number } {
  const attempts = Number.isFinite(retryCount) ? Math.max(1, retryCount) : 3;
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const merged = runProcess(
      'gh',
      ['pr', 'merge', prRef, '--squash', '--delete-branch'],
      cwd
    );
    if (merged.code === 0) {
      return { merged: true, attempts: attempt };
    }

    lastError = (merged.stderr || merged.stdout || '').trim();
    if (shouldRefreshHeadBranch(merged.stderr, merged.stdout)) {
      refreshPrHeadBranch(prRef, cwd);
      continue;
    }
  }

  throw createCliError(
    'EXECUTION_FAILED',
    `Failed to merge PR after retry attempts.${lastError ? ` Last error: ${lastError}` : ''}`
  );
}

function toRetryCount(raw: string | undefined): number {
  if (!raw) return 3;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createCliError('INVALID_ARGUMENT', '`--retry` must be a positive integer.');
  }
  return parsed;
}

export function githubCommand(program: Command): void {
  const github = program
    .command('github')
    .description('GitHub workflow helpers (issue/pr templates, validation, merge retry)');

  github
    .command('issue [feature-name]')
    .description('Generate/create GitHub issue body from feature docs with validation')
    .option('--json', 'Output in JSON format for agents')
    .option('--repo <repo>', 'Component name for multi projects')
    .option('--component <component>', 'Component name for multi projects')
    .option('--title <title>', 'Issue title')
    .option('--labels <labels>', 'Comma-separated labels (default: enhancement)')
    .option('--body-file <path>', 'Issue body file output path')
    .option('--assignee <assignee>', 'Issue assignee (default: @me)')
    .option('--create', 'Create issue via gh CLI')
    .action(async (featureName: string | undefined, options: GithubIssueOptions) => {
      try {
        const selectedComponent = resolveComponentOption(options);
        const { config, feature } = await resolveFeatureOrThrow(featureName, {
          component: selectedComponent,
        });

        const labels = parseLabels(options.labels);
        const paths = getFeatureDocPaths(feature);
        ensureDocsExist(config.docsDir, [paths.specPath, paths.planPath, paths.tasksPath]);

        const title =
          options.title?.trim() ||
          `${feature.slug} (${feature.folderName} documentation update)`;
        const body = buildIssueBody(feature, labels, paths);
        ensureSections(body, ['Overview', 'Goals', 'Completion Criteria', 'Related Documents', 'Labels'], 'Issue');

        const bodyFile = toBodyFilePath(
          options.bodyFile,
          `lee-spec-kit.issue.${feature.folderName}.md`
        );
        await fs.ensureDir(path.dirname(bodyFile));
        await fs.writeFile(bodyFile, body, 'utf-8');

        let issueUrl: string | undefined;
        if (options.create) {
          const args = [
            'issue',
            'create',
            '--title',
            title,
            '--body-file',
            bodyFile,
            '--assignee',
            options.assignee?.trim() || '@me',
          ];
          for (const label of labels) {
            args.push('--label', label);
          }
          const created = runProcessOrThrow(
            'gh',
            args,
            process.cwd(),
            'Failed to create GitHub issue'
          );
          issueUrl = created.stdout.trim() || undefined;
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                reasonCode: options.create ? 'ISSUE_CREATED' : 'ISSUE_TEMPLATE_GENERATED',
                feature: feature.folderName,
                component: feature.type,
                title,
                labels,
                bodyFile,
                issueUrl,
              },
              null,
              2
            )
          );
          return;
        }

        console.log();
        console.log(chalk.bold('🧾 GitHub Issue Helper'));
        console.log(chalk.gray(`- Feature: ${feature.folderName}`));
        console.log(chalk.gray(`- Body file: ${bodyFile}`));
        console.log(chalk.gray(`- Labels: ${labels.join(', ')}`));
        if (issueUrl) {
          console.log(chalk.green(`✅ Created: ${issueUrl}`));
        } else {
          console.log(chalk.blue('Template generated. Add --create to open the issue automatically.'));
        }
        console.log();
      } catch (error) {
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        if (options.json) {
          console.log(
            JSON.stringify({
              status: 'error',
              reasonCode: cliError.code,
              error: cliError.message,
              suggestions,
            })
          );
        } else {
          console.error(
            chalk.red(tr(lang, 'cli', 'common.errorLabel')),
            chalk.red(`[${cliError.code}] ${cliError.message}`)
          );
          printCliErrorSuggestions(suggestions, lang);
        }
        process.exit(1);
      }
    });

  github
    .command('pr [feature-name]')
    .description(
      'Generate/create GitHub PR body with validation, tasks PR sync, and merge retry'
    )
    .option('--json', 'Output in JSON format for agents')
    .option('--repo <repo>', 'Component name for multi projects')
    .option('--component <component>', 'Component name for multi projects')
    .option('--title <title>', 'PR title')
    .option('--labels <labels>', 'Comma-separated labels (default: enhancement)')
    .option('--body-file <path>', 'PR body file output path')
    .option('--assignee <assignee>', 'PR assignee (default: @me)')
    .option('--base <branch>', 'PR base branch (default: main)', 'main')
    .option('--create', 'Create PR via gh CLI')
    .option('--pr <ref>', 'Existing PR URL/number (used by --merge)')
    .option('--merge', 'Merge PR with retry and head-branch refresh')
    .option('--retry <count>', 'Retry count for merge (default: 3)')
    .option('--no-sync-tasks', 'Do not sync PR URL/PR status into tasks.md')
    .option('--commit-sync', 'Commit and push tasks.md metadata sync automatically')
    .action(async (featureName: string | undefined, options: GithubPrOptions) => {
      try {
        const selectedComponent = resolveComponentOption(options);
        const { config, feature } = await resolveFeatureOrThrow(featureName, {
          component: selectedComponent,
        });

        const labels = parseLabels(options.labels);
        const paths = getFeatureDocPaths(feature);
        ensureDocsExist(config.docsDir, [paths.specPath, paths.tasksPath]);

        const defaultTitle = feature.issueNumber
          ? `feat(#${feature.issueNumber}): ${feature.slug} (implementation update)`
          : `feat: ${feature.slug} (implementation update)`;
        const title = options.title?.trim() || defaultTitle;
        const body = buildPrBody(feature, paths);
        ensureSections(body, ['Overview', 'Changes', 'Tests', 'Related Documents'], 'PR');

        const bodyFile = toBodyFilePath(
          options.bodyFile,
          `lee-spec-kit.pr.${feature.folderName}.md`
        );
        await fs.ensureDir(path.dirname(bodyFile));
        await fs.writeFile(bodyFile, body, 'utf-8');

        const retryCount = toRetryCount(options.retry);
        let prUrl = options.pr?.trim() || '';
        let mergedAttempts: number | undefined;
        let syncChanged = false;

        if (options.create) {
          const args = [
            'pr',
            'create',
            '--title',
            title,
            '--body-file',
            bodyFile,
            '--base',
            options.base || 'main',
            '--assignee',
            options.assignee?.trim() || '@me',
          ];
          for (const label of labels) {
            args.push('--label', label);
          }
          const created = runProcessOrThrow(
            'gh',
            args,
            process.cwd(),
            'Failed to create GitHub PR'
          );
          prUrl = created.stdout.trim();
        }

        if (!prUrl && options.merge) {
          throw createCliError(
            'INVALID_ARGUMENT',
            '`--merge` requires `--create` or `--pr <url|number>`.'
          );
        }

        if (prUrl && options.syncTasks !== false) {
          const synced = syncTasksPrMetadata(
            path.join(config.docsDir, paths.tasksPath),
            prUrl,
            'Review'
          );
          syncChanged = synced.changed;
          const shouldCommitSync = !!options.commitSync || !!options.merge;
          if (syncChanged && shouldCommitSync) {
            const issueSuffix = feature.issueNumber ? `#${feature.issueNumber}` : feature.folderName;
            commitAndPushPath(
              process.cwd(),
              synced.path,
              `docs(${issueSuffix}): sync PR metadata for ${feature.folderName}`
            );
          }
        }

        if (options.merge) {
          const merged = mergePrWithRetry(prUrl, process.cwd(), retryCount);
          mergedAttempts = merged.attempts;

          const baseBranch = options.base || 'main';
          runProcessOrThrow(
            'git',
            ['checkout', baseBranch],
            process.cwd(),
            `Failed to checkout ${baseBranch} after merge`
          );
          runProcessOrThrow(
            'git',
            ['pull', '--rebase', 'origin', baseBranch],
            process.cwd(),
            `Failed to update ${baseBranch} after merge`
          );
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                reasonCode: options.merge
                  ? 'PR_CREATED_SYNCED_MERGED'
                  : options.create
                    ? 'PR_CREATED_SYNCED'
                    : 'PR_TEMPLATE_GENERATED',
                feature: feature.folderName,
                component: feature.type,
                title,
                labels,
                bodyFile,
                prUrl: prUrl || undefined,
                syncChanged,
                merged: !!options.merge,
                mergeAttempts: mergedAttempts,
              },
              null,
              2
            )
          );
          return;
        }

        console.log();
        console.log(chalk.bold('🔀 GitHub PR Helper'));
        console.log(chalk.gray(`- Feature: ${feature.folderName}`));
        console.log(chalk.gray(`- Body file: ${bodyFile}`));
        console.log(chalk.gray(`- Labels: ${labels.join(', ')}`));
        if (prUrl) {
          console.log(chalk.gray(`- PR: ${prUrl}`));
        }
        if (syncChanged) {
          console.log(chalk.green('✅ tasks.md PR metadata synced.'));
        }
        if (options.merge) {
          console.log(chalk.green(`✅ PR merged (attempts: ${mergedAttempts ?? 1}).`));
        } else if (!options.create) {
          console.log(chalk.blue('Template generated. Add --create to open the PR automatically.'));
        }
        console.log();
      } catch (error) {
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        if (options.json) {
          console.log(
            JSON.stringify({
              status: 'error',
              reasonCode: cliError.code,
              error: cliError.message,
              suggestions,
            })
          );
        } else {
          console.error(
            chalk.red(tr(lang, 'cli', 'common.errorLabel')),
            chalk.red(`[${cliError.code}] ${cliError.message}`)
          );
          printCliErrorSuggestions(suggestions, lang);
        }
        process.exit(1);
      }
    });
}


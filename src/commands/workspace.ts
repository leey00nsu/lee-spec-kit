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
import {
  buildManagedWorktreeEnvCopyCommand,
  isRegisteredGitWorktree,
  resolveGitPrimaryWorktreeRoot,
  resolveManagedWorktreePath,
} from '../utils/standalone-workspace.js';

export function workspaceCommand(program: Command): void {
  const workspace = program
    .command('workspace')
    .description('Prepare and integrate managed Feature workspaces');
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
          if (
            action === 'prepare' &&
            config.docsRepo !== 'standalone' &&
            !/^F\d{3,}$/.test(feature.id)
          ) {
            const root = resolveGitPrimaryWorktreeRoot(feature.git.projectGitCwd);
            const metadataPath = path.join(feature.path, '.feature.json');
            if (!(await fs.pathExists(metadataPath))) {
              throw createCliError(
                'PRECONDITION_FAILED',
                'Modern embedded Features require .feature.json registration metadata.'
              );
            }
            const metadata = await fs.readJson(metadataPath);
            const branch =
              typeof metadata.branch === 'string' ? metadata.branch.trim() : '';
            if (!branch || !branch.startsWith('feat/')) {
              throw createCliError(
                'PRECONDITION_FAILED',
                'Feature registration metadata does not contain a valid feat/ branch.'
              );
            }
            const directory = resolveManagedWorktreePath(config, root, branch);
            const relativeFeature = path
              .relative(root, feature.path)
              .replace(/\\/g, '/');
            const result = await withFileLock(
              getRepositoryLockPath(root, 'embedded-workspace'),
              async () => {
                if (feature.git.managedWorktree) {
                  const checkedOutBranch = runGitCapture(
                    ['branch', '--show-current'],
                    feature.git.projectGitCwd
                  );
                  if (checkedOutBranch !== branch) {
                    throw createCliError(
                      'PRECONDITION_FAILED',
                      `Managed workspace branch mismatch: expected ${branch}, received ${checkedOutBranch || '(detached)'}. Existing files were preserved.`
                    );
                  }
                  return {
                    docsDirectory: path.join(
                      feature.git.projectGitCwd,
                      path.relative(root, config.docsDir)
                    ),
                    projectDirectory: feature.git.projectGitCwd,
                    next: `Run subsequent Feature commands from ${feature.git.projectGitCwd}.`,
                  };
                }
                runGitOrThrow(['add', '--', relativeFeature], root);
                const staged = runProcess(
                  'git',
                  ['diff', '--cached', '--quiet', '--', relativeFeature],
                  root
                );
                if (staged.code !== 0) {
                  const scope = resolveFeatureCommitScope({
                    issueNumber: feature.issueNumber,
                    featureId: feature.id,
                    workflowMode: config.workflow?.mode,
                  });
                  if (!scope) {
                    throw createCliError(
                      'PRECONDITION_FAILED',
                      'Feature commit scope is required.'
                    );
                  }
                  runGitOrThrow(
                    [
                      'commit',
                      '--only',
                      '-m',
                      `docs(${scope}): seed ${feature.slug} workspace`,
                      '--',
                      relativeFeature,
                    ],
                    root
                  );
                }
                if (await fs.pathExists(directory)) {
                  if (!isRegisteredGitWorktree(root, directory)) {
                    throw createCliError(
                      'PRECONDITION_FAILED',
                      `A non-worktree path blocks the managed workspace: ${directory}`
                    );
                  }
                  const checkedOutBranch = runGitCapture(
                    ['branch', '--show-current'],
                    directory
                  );
                  if (checkedOutBranch !== branch) {
                    throw createCliError(
                      'PRECONDITION_FAILED',
                      `Managed workspace branch mismatch: expected ${branch}, received ${checkedOutBranch || '(detached)'}. Existing files were preserved.`
                    );
                  }
                } else {
                  await fs.ensureDir(path.dirname(directory));
                  const exists = runGitCapture(
                    ['show-ref', '--verify', `refs/heads/${branch}`],
                    root
                  );
                  if (exists) {
                    const branchTree = runGitCapture(
                      ['rev-parse', `${branch}:${relativeFeature}`],
                      root
                    );
                    const headTree = runGitCapture(
                      ['rev-parse', `HEAD:${relativeFeature}`],
                      root
                    );
                    if (branchTree !== headTree) {
                      const branchBehind = runProcess(
                        'git',
                        ['merge-base', '--is-ancestor', branch, 'HEAD'],
                        root
                      );
                      const branchAhead = runProcess(
                        'git',
                        ['merge-base', '--is-ancestor', 'HEAD', branch],
                        root
                      );
                      if (branchBehind.code !== 0 && branchAhead.code !== 0) {
                        throw createCliError(
                          'PRECONDITION_FAILED',
                          `Feature branch ${branch} diverged before workspace preparation. Existing branch and seed were preserved; reconcile them explicitly.`
                        );
                      }
                      if (branchBehind.code === 0)
                        runGitOrThrow(['branch', '-f', branch, 'HEAD'], root);
                    }
                  }
                  runGitOrThrow(
                    [
                      'worktree',
                      'add',
                      ...(exists ? [] : ['-b', branch]),
                      directory,
                      exists ? branch : 'HEAD',
                    ],
                    root
                  );
                  const envCopy = buildManagedWorktreeEnvCopyCommand(
                    root,
                    directory
                  );
                  const copied = runProcess('sh', ['-c', envCopy], root);
                  if (copied.code !== 0) {
                    throw createCliError(
                      'EXECUTION_FAILED',
                      copied.stderr || copied.stdout
                    );
                  }
                }
                return {
                  docsDirectory: path.join(
                    directory,
                    path.relative(root, config.docsDir)
                  ),
                  projectDirectory: directory,
                  next: `Run subsequent Feature commands from ${directory}.`,
                };
              },
              { owner: 'workspace prepare' }
            );
            console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
            return;
          }
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
                const status = git(cwd, ['status', '--porcelain']);
                if (status)
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    `Commit or resolve changes first: ${cwd}\n${status}`
                  );
              };
              if (!state.baseBranch || state.baseBranch === state.branch)
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'A separate docs base branch is required.'
                );
              if (action === 'prepare') {
                const relativeFeature = path
                  .relative(state.root, feature.path)
                  .replace(/\\/g, '/');
                runGitOrThrow(['add', '--', relativeFeature], state.root);
                const staged = runProcess(
                  'git',
                  ['diff', '--cached', '--quiet', '--', relativeFeature],
                  state.root
                );
                if (staged.code !== 0) {
                  const scope = resolveFeatureCommitScope({
                    issueNumber: feature.issueNumber,
                    featureId: feature.id,
                    workflowMode: config.workflow?.mode,
                  });
                  if (!scope) {
                    throw createCliError(
                      'PRECONDITION_FAILED',
                      'Feature commit scope is required.'
                    );
                  }
                  runGitOrThrow(
                    [
                      'commit',
                      '--only',
                      '-m',
                      `docs(${scope}): seed ${feature.slug} workspace`,
                      '--',
                      relativeFeature,
                    ],
                    state.root
                  );
                }
                const branchExists = runGitCapture(
                  ['show-ref', '--verify', `refs/heads/${state.branch}`],
                  state.root
                );
                const branchTree = branchExists
                  ? runGitCapture(
                      ['rev-parse', `${state.branch}:${relativeFeature}`],
                      state.root
                    )
                  : undefined;
                const headTree = runGitCapture(
                  ['rev-parse', `HEAD:${relativeFeature}`],
                  state.root
                );
                if (await fs.pathExists(state.directory)) {
                  if (
                    git(state.directory, ['branch', '--show-current']) !==
                    state.branch
                  )
                    throw createCliError(
                      'PRECONDITION_FAILED',
                      'Workspace branch mismatch; existing files were preserved.'
                    );
                  if (branchTree !== headTree) {
                    clean(state.directory);
                    git(state.directory, [
                      'merge',
                      '--ff-only',
                      git(state.root, ['rev-parse', 'HEAD']),
                    ]);
                  }
                } else {
                  await fs.ensureDir(path.dirname(state.directory));
                  if (branchExists && branchTree !== headTree) {
                    const branchBehind = runProcess(
                      'git',
                      ['merge-base', '--is-ancestor', state.branch, 'HEAD'],
                      state.root
                    );
                    const branchAhead = runProcess(
                      'git',
                      ['merge-base', '--is-ancestor', 'HEAD', state.branch],
                      state.root
                    );
                    if (branchBehind.code !== 0 && branchAhead.code !== 0)
                      throw createCliError(
                        'PRECONDITION_FAILED',
                        `Docs branch ${state.branch} diverged before workspace preparation. Existing branch and seed were preserved; reconcile them explicitly.`
                      );
                    if (branchBehind.code === 0)
                      git(state.root, ['branch', '-f', state.branch, 'HEAD']);
                  }
                  git(state.root, [
                    'worktree',
                    'add',
                    ...(branchExists ? [] : ['-b', state.branch]),
                    state.directory,
                    branchExists ? state.branch : state.baseBranch,
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

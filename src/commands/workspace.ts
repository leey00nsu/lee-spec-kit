import {
  assertCleanDocsWorktree,
  cleanupDocsWorkspace,
  docsIntegrationResult,
  integrateDocsWorkspace,
  writeDocsWorkspaceState,
} from '../utils/docs-integration.js';
import type { DocsCodeIntegrationEvidence } from '../utils/docs-integration-receipt.js';
import { isFeatureVerificationCurrent } from '../utils/local-integration.js';
import { resolveFeatureCommitScope } from '../utils/commit-conventions.js';
import { collectWorkflowStage } from '../utils/workflow-stage.js';
import fs from 'fs-extra';
import path from 'node:path';
import type { Command } from 'commander';
import { resolveFeatureSelection } from '../utils/feature-resolver.js';
import { resolveDocsWorkspace } from '../utils/feature-workspace.js';
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
      .description(
        action === 'merge-docs'
          ? 'Integrate approved docs using the inherited/overridden docs strategy and preserve source evidence'
          : action === 'sync-docs'
            ? 'Merge the current docs base into the isolated docs branch for revalidation'
            : action === 'cleanup-docs'
              ? 'Remove only the docs workspace validated by its integration receipt and evidence'
              : 'Prepare the managed Feature workspace'
      )
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
            const root = resolveGitPrimaryWorktreeRoot(
              feature.git.projectGitCwd
            );
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
              if (state.validationError)
                throw createCliError(
                  state.validationError.code,
                  state.validationError.detail
                );
              if (
                state.integrated &&
                (action === 'prepare' || action === 'sync-docs')
              ) {
                return {
                  ...docsIntegrationResult(state),
                  alreadyIntegrated: true,
                  docsDirectory: state.root,
                };
              }
              if (state.strategy === 'none' && !state.integrated) {
                throw createCliError(
                  'INVALID_CONFIG',
                  'Managed standalone docs require code completionStrategy=local-ff or local-squash; inherit with none disables integration. Configure an integration strategy before preparing a docs workspace.'
                );
              }
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
                await writeDocsWorkspaceState(state, {
                  status: 'active',
                  originalBaseTip:
                    state.originalBaseTip ||
                    git(state.root, ['rev-parse', 'HEAD']),
                  docsCompletionStrategy: state.strategy,
                });
                return {
                  docsDirectory: state.docsDirectory,
                  docsCompletionStrategy: state.strategy,
                  projectDirectory: feature.git.projectGitCwd,
                  next: `Run subsequent Feature commands from ${state.docsDirectory}; workflow-stage creates the paired project worktree after approval.`,
                };
              }
              if (action === 'sync-docs') {
                if (!(await fs.pathExists(state.directory)))
                  throw createCliError(
                    'DOCS_WORKSPACE_REQUIRED',
                    'Prepare the docs workspace first.'
                  );
                assertCleanDocsWorktree(state.directory);
                if (
                  git(state.directory, ['branch', '--show-current']) !==
                  state.branch
                )
                  throw createCliError(
                    'DOCS_BRANCH_CHANGED',
                    'Docs source branch changed.'
                  );
                // Conflicts stay in the Feature worktree. Its checkpoints and the
                // original docs base are retained; only final integration is squash.
                try {
                  git(state.directory, [
                    'merge',
                    '--no-edit',
                    `refs/heads/${state.baseBranch}`,
                  ]);
                } catch (error) {
                  throw createCliError(
                    'DOCS_SYNC_CONFLICT',
                    `Docs sync needs conflict resolution in ${state.directory}. No base changes were made. ${(error as Error).message}`
                  );
                }
                return {
                  docsDirectory: state.docsDirectory,
                  docsCompletionStrategy: state.strategy,
                  revalidationRequired: true,
                };
              }
              const workflow = await collectWorkflowStage(
                process.cwd(),
                selector,
                options.component
              );
              const expectedAction =
                action === 'merge-docs'
                  ? 'workspace_merge_docs'
                  : 'workspace_cleanup_docs';
              const integratedRetry =
                action === 'merge-docs' &&
                state.integrated &&
                (workflow.stage === 'done' ||
                  ['workspace_cleanup_docs', 'local_cleanup'].includes(
                    workflow.nextAction?.category || ''
                  ));
              if (
                workflow.nextAction?.category !== expectedAction &&
                !integratedRetry &&
                !(action === 'cleanup-docs' && workflow.stage === 'done')
              ) {
                throw createCliError(
                  workflow.nextAction?.category === 'workspace_sync_docs'
                    ? 'DOCS_BASE_ADVANCED'
                    : 'DOCS_WORKFLOW_GATE_REQUIRED',
                  `Complete the current workflow gate before docs ${action}. Current action: ${workflow.nextAction?.category || workflow.stage}. ${workflow.nextAction?.summary || ''}`,
                  {
                    nextAction: workflow.nextAction,
                    docsCompletionStrategy: state.strategy,
                  }
                );
              }
              let code: DocsCodeIntegrationEvidence | undefined;
              if (config.workflow?.mode === 'local') {
                const integration = await resolveLocalIntegrationContext(
                  config,
                  feature
                );
                if (
                  (!integration.integrationComplete &&
                    !integration.cleanedIntegrationStillValid) ||
                  !integration.state ||
                  !['verified', 'cleaned'].includes(integration.state.status) ||
                  !isFeatureVerificationCurrent(integration)
                ) {
                  throw createCliError(
                    'DOCS_CODE_INTEGRATION_NOT_VERIFIED',
                    'Verify project integration and its current checks before docs integration or cleanup.'
                  );
                }
                code = {
                  strategy: integration.completionStrategy,
                  sourceTip: integration.state.featureTip,
                  sourceTree:
                    integration.state.verifiedFeatureTree ||
                    integration.featureTree ||
                    '',
                  integratedCommit:
                    integration.state.integratedCommit ||
                    integration.state.mergedBaseTip,
                  integratedTree:
                    integration.state.integratedTree ||
                    integration.featureTree ||
                    '',
                  checksHash: integration.featureChecksHash,
                };
                if (
                  state.receipt?.code &&
                  Object.entries(code).some(
                    ([key, value]) =>
                      state.receipt!.code![
                        key as keyof DocsCodeIntegrationEvidence
                      ] !== value
                  )
                ) {
                  throw createCliError(
                    'DOCS_CODE_VERIFICATION_CHANGED',
                    'Recorded docs receipt does not match the current verified code integration. Preserve evidence and reconcile before cleanup.'
                  );
                }
              } else if (action === 'merge-docs') {
                const tasks = await fs.readFile(
                  path.join(feature.path, 'tasks.md'),
                  'utf8'
                );
                const pr = tasks.match(/^- \*\*PR\*\*:\s*(\S+)/m)?.[1];
                if (!pr || pr === '-')
                  throw createCliError(
                    'DOCS_CODE_INTEGRATION_NOT_VERIFIED',
                    'A merged project PR is required before docs integration.'
                  );
                const viewed = runProcess(
                  'gh',
                  ['pr', 'view', pr, '--json', 'state'],
                  feature.git.projectGitCwd
                );
                if (viewed.code || JSON.parse(viewed.stdout).state !== 'MERGED')
                  throw createCliError(
                    'DOCS_CODE_INTEGRATION_NOT_VERIFIED',
                    'Merge the project PR before its docs.'
                  );
              }
              return action === 'merge-docs'
                ? state.integrated
                  ? {
                      ...docsIntegrationResult(state),
                      alreadyIntegrated: true,
                      docsDirectory: state.root,
                    }
                  : integrateDocsWorkspace(config, feature, state, code)
                : cleanupDocsWorkspace(state, feature);
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
              ...parsed.details,
            })
          );
          process.exitCode = 1;
        }
      });
  }
}

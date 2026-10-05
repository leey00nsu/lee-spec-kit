import path from 'node:path';
import fs from 'fs-extra';
import type { ProjectConfig } from '../config/types.js';
import type { ResolvedFeature } from './feature-resolver.js';
import {
  resolveGitPrimaryWorktreeRoot,
  resolveGitTopLevelOrNull,
  resolveConfiguredStandaloneWorkspaceRoot,
} from './standalone-workspace.js';
import { getRepositoryLockPath } from './lock.js';
import { runGitCapture } from './git-run.js';
import type { CliReasonCode } from './cli-error.js';
import {
  resolveDocsCompletionStrategy,
  type EffectiveDocsCompletionStrategy,
} from '../config/docs-completion.js';
import {
  readDocsIntegrationReceipt,
  type DocsIntegrationReceipt,
} from './docs-integration-receipt.js';
export { docsIntegrationMarker } from './docs-integration-receipt.js';

export interface DocsWorkspace {
  root: string;
  baseBranch: string;
  branch: string;
  directory: string;
  docsDirectory: string;
  statePath: string;
  current: boolean;
  branchExists: boolean;
  integrated: boolean;
  strategy: EffectiveDocsCompletionStrategy;
  originalBaseTip: string | null;
  sourceTip: string | null;
  integratedCommit?: string;
  receipt?: DocsIntegrationReceipt;
  legacyReceipt?: boolean;
  validationError?: { code: CliReasonCode; detail: string };
}
export async function resolveDocsWorkspace(
  config: ProjectConfig,
  feature: ResolvedFeature
): Promise<DocsWorkspace | null> {
  if (
    config.docsRepo !== 'standalone' ||
    !(await fs.pathExists(path.join(feature.path, '.feature.json')))
  )
    return null;
  const root = resolveGitPrimaryWorktreeRoot(config.docsDir);
  const workspace = resolveConfiguredStandaloneWorkspaceRoot(config);
  if (!workspace) return null;
  const key = `${feature.type}-${feature.id}`;
  const statePath = path.join(
    path.dirname(getRepositoryLockPath(root)),
    `docs-workspace-${key}.json`
  );
  const state = (await fs.pathExists(statePath))
    ? await fs.readJson(statePath).catch(() => null)
    : null;
  const directory = path.join(
    workspace,
    '.worktrees',
    path.basename(root),
    `docs-${key}`
  );
  const baseBranch =
    state?.baseBranch ||
    runGitCapture(['branch', '--show-current'], root) ||
    '';
  const docsRelative = path.relative(
    resolveGitTopLevelOrNull(config.docsDir) || config.docsDir,
    config.docsDir
  );
  const branch = `docs/${key}`;
  const pendingTip = (await fs.pathExists(directory))
    ? runGitCapture(['rev-parse', 'HEAD'], directory)
    : runGitCapture(['rev-parse', '--verify', `refs/heads/${branch}`], root);
  // The integration commit travels with the docs repository; runtime state is a cache.
  const strategy = resolveDocsCompletionStrategy(config);
  const integration = readDocsIntegrationReceipt(
    root,
    feature,
    baseBranch,
    strategy,
    pendingTip,
    docsRelative.replace(/\\/gu, '/'),
    config.workflow?.mode
  );
  return {
    root,
    baseBranch,
    docsDirectory: path.join(directory, docsRelative),
    branch,
    directory,
    statePath,
    current:
      path.resolve(resolveGitTopLevelOrNull(config.docsDir) || '') ===
      path.resolve(directory),
    branchExists: !!runGitCapture(
      ['rev-parse', '--verify', `refs/heads/${branch}`],
      root
    ),
    integrated:
      integration.integrated ||
      (!integration.integratedCommit &&
        state?.status === 'integrated' &&
        state.version !== 2 &&
        !!state.tip &&
        pendingTip === state.tip &&
        runGitCapture(
          [
            'merge-base',
            '--is-ancestor',
            state.tip,
            `refs/heads/${baseBranch}`,
          ],
          root
        ) !== undefined),
    strategy,
    originalBaseTip:
      integration.receipt?.originalBaseTip || state?.originalBaseTip || null,
    sourceTip: integration.receipt?.sourceTip || pendingTip || null,
    integratedCommit: integration.integratedCommit,
    receipt: integration.receipt,
    legacyReceipt: integration.legacy,
    validationError: integration.error,
  };
}

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

export interface DocsWorkspace {
  root: string;
  baseBranch: string;
  branch: string;
  directory: string;
  docsDirectory: string;
  statePath: string;
  current: boolean;
  integrated: boolean;
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
    ? await fs.readJson(statePath)
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
  const pendingTip = (await fs.pathExists(directory))
    ? runGitCapture(['rev-parse', 'HEAD'], directory)
    : state?.tip;
  // The integration commit travels with the docs repository; runtime state is a cache.
  const marker = docsIntegrationMarker(feature);
  const receipt = runGitCapture(['log', `refs/heads/${baseBranch}`, '--format=%H',
    '--fixed-strings', `--grep=${marker}`, '-1'], root);
  const receiptMessage = receipt ? runGitCapture(['show', '-s', '--format=%B', receipt], root) : undefined;
  const durableIntegration = !!receipt && !!receiptMessage?.split('\n').includes(marker) &&
    (!pendingTip || runGitCapture(['merge-base', '--is-ancestor', pendingTip, `refs/heads/${baseBranch}`], root) !== undefined);
  return {
    root,
    baseBranch,
    docsDirectory: path.join(directory, docsRelative),
    branch: `docs/${key}`,
    directory,
    statePath,
    current:
      path.resolve(resolveGitTopLevelOrNull(config.docsDir) || '') ===
      path.resolve(directory),
    integrated: durableIntegration || (
      state?.status === 'integrated' &&
      !!state.tip &&
      pendingTip === state.tip &&
      runGitCapture(
        ['merge-base', '--is-ancestor', state.tip, `refs/heads/${baseBranch}`],
        root
      ) !== undefined),
  };
}

export function docsIntegrationMarker(feature: ResolvedFeature): string {
  return `Lee-Spec-Docs-Integration: ${feature.type}/${feature.folderName}`;
}

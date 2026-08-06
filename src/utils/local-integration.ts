import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import type { LocalPostMergeCheck, ProjectConfig } from '../config/types.js';
import type { ResolvedFeature } from './feature-resolver.js';
import { runGitCapture } from './git-run.js';
import { runProcess } from '../commands/github/process.js';
import { resolveStandaloneProjectRoots } from './standalone-workspace.js';

export type LocalIntegrationStateStatus = 'merged' | 'verified' | 'cleaned';

export interface LocalIntegrationState {
  version: 1;
  featureRef: string;
  component: string;
  baseBranch: string;
  featureBranch: string;
  featureTip: string;
  mergedBaseTip: string;
  status: LocalIntegrationStateStatus;
  mergedAt: string;
  verifiedAt: string | null;
  cleanedAt: string | null;
  verification: Array<{
    command: string;
    args: string[];
    exitCode: number;
  }>;
}

export interface LocalIntegrationContext {
  projectRoot: string;
  featureWorktree: string;
  docsGitCwd: string;
  baseBranch: string;
  featureBranch: string;
  featureTip: string | null;
  baseTip: string | null;
  currentBranch: string | null;
  state: LocalIntegrationState | null;
  baseContainsFeature: boolean;
  projectRootClean: boolean;
  featureWorktreeClean: boolean;
  docsClean: boolean;
  managedFeatureWorktree: boolean;
  featureBranchExists: boolean;
  postMergeChecks: LocalPostMergeCheck[];
  deleteFeatureBranchAfterMerge: boolean;
}

const BRANCH_LABELS = ['Branch', '브랜치'];

export function resolveLocalCompletionStrategy(
  config: ProjectConfig
): 'local-ff' | 'none' {
  return config.workflow?.completionStrategy === 'local-ff'
    ? 'local-ff'
    : 'none';
}

export async function resolveLocalIntegrationContext(
  config: ProjectConfig,
  feature: ResolvedFeature
): Promise<LocalIntegrationContext> {
  const projectRoot = resolveProjectRoot(config, feature);
  const featureWorktree = path.resolve(feature.git.projectGitCwd);
  const baseBranch =
    String(config.workflow?.baseBranch || 'main').trim() || 'main';
  assertValidBranch(projectRoot, baseBranch, 'baseBranch');

  const tasksContent = await readTasks(feature.path);
  const configuredFeatureBranch = extractMetadataValue(
    tasksContent,
    BRANCH_LABELS
  );
  const featureBranch = configuredFeatureBranch || `feat/${feature.slug}`;
  assertValidBranch(projectRoot, featureBranch, 'feature branch');
  if (featureBranch === baseBranch) {
    throw new Error(
      'Local feature branch must differ from workflow.baseBranch.'
    );
  }

  const state = await readLocalIntegrationState(projectRoot, feature);
  const featureBranchTip = resolveRef(
    projectRoot,
    `refs/heads/${featureBranch}`
  );
  const featureTip = featureBranchTip || state?.featureTip || null;
  const baseTip = resolveRef(projectRoot, `refs/heads/${baseBranch}`);
  const currentBranch = currentGitBranch(projectRoot);
  const registeredWorktree = resolveRegisteredBranchWorktree(
    projectRoot,
    featureBranch
  );
  const managedFeatureWorktree =
    !!registeredWorktree &&
    path.resolve(registeredWorktree) !== path.resolve(projectRoot);
  const effectiveFeatureWorktree =
    registeredWorktree ||
    (fs.existsSync(featureWorktree) ? featureWorktree : projectRoot);

  return {
    projectRoot,
    featureWorktree: effectiveFeatureWorktree,
    docsGitCwd: feature.git.docsGitCwd,
    baseBranch,
    featureBranch,
    featureTip,
    baseTip,
    currentBranch,
    state,
    baseContainsFeature:
      !!featureTip &&
      !!baseTip &&
      isAncestor(projectRoot, featureTip, `refs/heads/${baseBranch}`),
    projectRootClean: isClean(projectRoot),
    featureWorktreeClean: isClean(effectiveFeatureWorktree),
    docsClean: isClean(feature.git.docsGitCwd),
    managedFeatureWorktree,
    featureBranchExists: !!featureBranchTip,
    postMergeChecks: normalizePostMergeChecks(config.workflow?.postMergeChecks),
    deleteFeatureBranchAfterMerge:
      config.workflow?.deleteFeatureBranchAfterMerge !== false,
  };
}

export async function writeLocalIntegrationState(
  projectRoot: string,
  feature: ResolvedFeature,
  state: LocalIntegrationState
): Promise<void> {
  const statePath = resolveStatePath(projectRoot, feature);
  await fs.ensureDir(path.dirname(statePath));
  await fs.writeJson(statePath, state, { spaces: 2 });
}

export async function readLocalIntegrationState(
  projectRoot: string,
  feature: ResolvedFeature
): Promise<LocalIntegrationState | null> {
  const statePath = resolveStatePath(projectRoot, feature);
  if (!(await fs.pathExists(statePath))) return null;
  try {
    const state = (await fs.readJson(statePath)) as LocalIntegrationState;
    if (
      state?.version !== 1 ||
      state.featureRef !== feature.folderName ||
      typeof state.featureTip !== 'string'
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function localCleanupComplete(
  context: LocalIntegrationContext
): boolean {
  return (
    context.baseContainsFeature &&
    context.currentBranch === context.baseBranch &&
    !context.managedFeatureWorktree &&
    (!context.deleteFeatureBranchAfterMerge || !context.featureBranchExists) &&
    context.projectRootClean &&
    context.docsClean &&
    context.state?.status === 'cleaned' &&
    context.state.featureTip === context.featureTip &&
    context.state.mergedBaseTip === context.baseTip
  );
}

export function runPostMergeChecks(
  projectRoot: string,
  checks: LocalPostMergeCheck[]
): LocalIntegrationState['verification'] {
  const results: LocalIntegrationState['verification'] = [];
  for (const check of checks) {
    const args = Array.isArray(check.args) ? check.args.map(String) : [];
    const result = runProcess(check.command, args, projectRoot);
    results.push({
      command: check.command,
      args,
      exitCode: result.code,
    });
    if (result.code !== 0) break;
  }
  return results;
}

export function gitRun(
  cwd: string,
  args: string[]
): { code: number; stdout: string; stderr: string } {
  return runProcess('git', args, cwd);
}

export function currentGitBranch(cwd: string): string | null {
  return (
    runGitCapture(['branch', '--show-current'], cwd) ||
    runGitCapture(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) ||
    null
  );
}

export function resolveRef(cwd: string, ref: string): string | null {
  return runGitCapture(['rev-parse', '--verify', ref], cwd) || null;
}

export function isAncestor(
  cwd: string,
  ancestor: string,
  descendant: string
): boolean {
  return (
    runProcess(
      'git',
      ['merge-base', '--is-ancestor', ancestor, descendant],
      cwd
    ).code === 0
  );
}

function resolveProjectRoot(
  config: ProjectConfig,
  feature: ResolvedFeature
): string {
  if (config.docsRepo === 'standalone') {
    const roots = resolveStandaloneProjectRoots(
      config,
      feature.type === 'single' ? undefined : feature.type
    );
    if (roots[0]) return path.resolve(roots[0]);
  }
  return (
    runGitCapture(
      ['rev-parse', '--show-toplevel'],
      feature.git.projectGitCwd
    ) || path.resolve(feature.git.projectGitCwd)
  );
}

function resolveStatePath(
  projectRoot: string,
  feature: ResolvedFeature
): string {
  const commonDirRaw =
    runGitCapture(['rev-parse', '--git-common-dir'], projectRoot) || '.git';
  const commonDir = path.isAbsolute(commonDirRaw)
    ? commonDirRaw
    : path.resolve(projectRoot, commonDirRaw);
  const key = crypto
    .createHash('sha256')
    .update(`${feature.type}:${feature.folderName}`)
    .digest('hex')
    .slice(0, 24);
  return path.join(
    commonDir,
    'lee-spec-kit',
    'local-integrations',
    `${key}.json`
  );
}

async function readTasks(featureDir: string): Promise<string> {
  const tasksPath = path.join(featureDir, 'tasks.md');
  return (await fs.pathExists(tasksPath))
    ? fs.readFile(tasksPath, 'utf-8')
    : '';
}

function extractMetadataValue(
  content: string,
  labels: string[]
): string | null {
  for (const label of labels) {
    const match = content.match(
      new RegExp(`^\\s*-\\s*\\*\\*${label}\\*\\*:\\s*(.*?)\\s*$`, 'mi')
    );
    const value = String(match?.[1] || '')
      .trim()
      .replace(/^`(.+)`$/, '$1');
    if (value && value !== '-') return value;
  }
  return null;
}

function assertValidBranch(cwd: string, branch: string, label: string): void {
  if (
    runProcess('git', ['check-ref-format', '--branch', branch], cwd).code !== 0
  ) {
    throw new Error(`Invalid ${label}: ${branch}`);
  }
}

function isClean(cwd: string): boolean {
  return (
    (runGitCapture(
      ['status', '--porcelain', '--untracked-files=normal'],
      cwd
    ) || '') === ''
  );
}

function resolveRegisteredBranchWorktree(
  projectRoot: string,
  branch: string
): string | null {
  const output =
    runGitCapture(['worktree', 'list', '--porcelain'], projectRoot) || '';
  let currentPath: string | null = null;
  for (const line of output.split(/\r?\n/u)) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim();
      continue;
    }
    if (line === `branch refs/heads/${branch}` && currentPath) {
      return currentPath;
    }
  }
  return null;
}

function normalizePostMergeChecks(value: unknown): LocalPostMergeCheck[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is LocalPostMergeCheck =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as LocalPostMergeCheck).command === 'string' &&
        !!(entry as LocalPostMergeCheck).command.trim()
    )
    .map((entry) => ({
      command: entry.command.trim(),
      args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    }));
}

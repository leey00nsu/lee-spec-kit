import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import type { LocalWorkflowCheck, ProjectConfig } from '../config/types.js';
import type { ResolvedFeature } from './feature-resolver.js';
import { runGitCapture } from './git-run.js';
import { runProcess } from '../commands/github/process.js';
import {
  resolveGitPrimaryWorktreeRoot,
  resolveStandaloneProjectRoots,
} from './standalone-workspace.js';

export type LocalIntegrationStateStatus =
  | 'feature_failed'
  | 'feature_verified'
  | 'merged'
  | 'verified'
  | 'cleaned';
export type LocalCompletionStrategy = 'local-ff' | 'local-squash' | 'none';

export interface LocalIntegrationState {
  version: 1;
  featureRef: string;
  component: string;
  baseBranch: string;
  featureBranch: string;
  featureTip: string;
  mergedBaseTip: string;
  strategy?: Exclude<LocalCompletionStrategy, 'none'>;
  integratedCommit?: string;
  integratedTree?: string;
  evidenceRef?: string;
  status: LocalIntegrationStateStatus;
  mergedAt: string;
  featureVerifiedAt?: string | null;
  verifiedAt: string | null;
  cleanedAt: string | null;
  verifiedFeatureTip?: string;
  verifiedFeatureTree?: string;
  originalBaseTip?: string;
  featureVerification?: LocalCheckResult[];
  postMergeVerification?: LocalCheckResult[];
  verification: LocalCheckResult[];
}

export interface LocalCheckResult {
  command: string;
  args: string[];
  cwd: string;
  targetSha: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number;
  runtime: {
    node: string;
    platform: string;
    arch: string;
    path: string;
  };
  stdoutPreview?: string;
  stderrPreview?: string;
  logPath: string;
}

export interface LocalIntegrationContext {
  projectRoot: string;
  featureWorktree: string;
  docsGitCwd: string;
  baseBranch: string;
  featureBranch: string;
  featureTip: string | null;
  featureTree: string | null;
  baseTip: string | null;
  currentBranch: string | null;
  state: LocalIntegrationState | null;
  completionStrategy: Exclude<LocalCompletionStrategy, 'none'>;
  baseContainsFeature: boolean;
  integrationComplete: boolean;
  cleanedIntegrationStillValid: boolean;
  evidenceRef: string;
  squashCommitMatchesSource: boolean;
  squashEvidencePresent: boolean;
  projectRootClean: boolean;
  featureWorktreeClean: boolean;
  docsClean: boolean;
  managedFeatureWorktree: boolean;
  featureBranchExists: boolean;
  featureChecks: LocalWorkflowCheck[];
  postMergeChecks: LocalWorkflowCheck[];
  deleteFeatureBranchAfterMerge: boolean;
}

const BRANCH_LABELS = ['Branch', '브랜치'];

export function resolveLocalCompletionStrategy(
  config: ProjectConfig
): LocalCompletionStrategy {
  const strategy = config.workflow?.completionStrategy;
  return strategy === 'local-ff' || strategy === 'local-squash'
    ? strategy
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
  const configuredStrategy = resolveLocalCompletionStrategy(config);
  const completionStrategy =
    configuredStrategy === 'local-squash' ? 'local-squash' : 'local-ff';
  const evidenceRef = resolveEvidenceRef(feature);
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

  const baseContainsFeature =
    !!featureTip &&
    !!baseTip &&
    isAncestor(projectRoot, featureTip, `refs/heads/${baseBranch}`);
  const integratedCommit = state?.integratedCommit || state?.mergedBaseTip;
  const evidenceTip = resolveRef(projectRoot, evidenceRef);
  const featureTree = featureTip ? resolveTree(projectRoot, featureTip) : null;
  const integratedTree = integratedCommit
    ? resolveTree(projectRoot, integratedCommit)
    : null;
  const squashCommitMatchesSource =
    completionStrategy === 'local-squash' &&
    state?.strategy === 'local-squash' &&
    !!featureTip &&
    state.featureTip === featureTip &&
    !!integratedCommit &&
    !!baseTip &&
    integratedCommit === baseTip &&
    !!featureTree &&
    integratedTree === featureTree &&
    state.integratedTree === featureTree;
  const squashEvidencePresent = !!featureTip && evidenceTip === featureTip;
  const squashIntegrationComplete =
    squashCommitMatchesSource && squashEvidencePresent;
  const recordedStrategy = state?.strategy || 'local-ff';
  const recordedIntegratedCommit =
    state?.integratedCommit || state?.mergedBaseTip || null;
  const baseContainsRecordedIntegration =
    !!recordedIntegratedCommit &&
    isAncestor(
      projectRoot,
      recordedIntegratedCommit,
      `refs/heads/${baseBranch}`
    );
  const cleanedIntegrationStillValid =
    state?.status === 'cleaned' &&
    recordedStrategy === completionStrategy &&
    state.featureTip === featureTip &&
    baseContainsRecordedIntegration &&
    (completionStrategy === 'local-squash'
      ? state.integratedCommit === recordedIntegratedCommit &&
        state.integratedTree === featureTree &&
        squashEvidencePresent
      : state.mergedBaseTip === featureTip && baseContainsFeature);

  return {
    projectRoot,
    featureWorktree: effectiveFeatureWorktree,
    docsGitCwd: feature.git.docsGitCwd,
    baseBranch,
    featureBranch,
    featureTip,
    featureTree,
    baseTip,
    currentBranch,
    state,
    completionStrategy,
    baseContainsFeature,
    integrationComplete:
      completionStrategy === 'local-squash'
        ? squashIntegrationComplete
        : !!featureTip && baseTip === featureTip,
    cleanedIntegrationStillValid,
    evidenceRef,
    squashCommitMatchesSource,
    squashEvidencePresent,
    projectRootClean: isClean(projectRoot),
    featureWorktreeClean: isClean(effectiveFeatureWorktree),
    docsClean: isClean(feature.git.docsGitCwd),
    managedFeatureWorktree,
    featureBranchExists: !!featureBranchTip,
    featureChecks: Array.isArray(config.workflow?.featureChecks)
      ? normalizeWorkflowChecks(config.workflow.featureChecks)
      : normalizeWorkflowChecks(config.workflow?.postMergeChecks),
    // Compatibility: pre-0.9.2 postMergeChecks are treated as Feature checks.
    // Projects can opt into true post-integration checks by defining featureChecks.
    postMergeChecks: Array.isArray(config.workflow?.featureChecks)
      ? normalizeWorkflowChecks(config.workflow?.postMergeChecks)
      : [],
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
    context.integrationComplete &&
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

export function runLocalChecks(
  cwd: string,
  checks: LocalWorkflowCheck[],
  targetSha: string,
  logDir: string,
  phase: 'feature' | 'post-merge'
): LocalIntegrationState['verification'] {
  const results: LocalIntegrationState['verification'] = [];
  fs.ensureDirSync(logDir);
  for (const check of checks) {
    const args = Array.isArray(check.args) ? check.args.map(String) : [];
    const startedAt = new Date();
    const result = runProcess(check.command, args, cwd);
    const finishedAt = new Date();
    const runtime = {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      path: process.env.PATH || '',
    };
    const index = results.length + 1;
    const logPath = path.join(logDir, `${phase}-${String(index).padStart(2, '0')}.log`);
    const log = [
      `phase: ${phase}`,
      `targetSha: ${targetSha}`,
      `cwd: ${cwd}`,
      `command: ${JSON.stringify([check.command, ...args])}`,
      `startedAt: ${startedAt.toISOString()}`,
      `finishedAt: ${finishedAt.toISOString()}`,
      `exitCode: ${result.code}`,
      `runtime: ${JSON.stringify(runtime)}`,
      '',
      '--- stdout ---',
      result.stdout,
      '--- stderr ---',
      result.stderr,
    ].join('\n');
    fs.writeFileSync(logPath, log, { encoding: 'utf-8', mode: 0o600 });
    results.push({
      command: check.command,
      args,
      cwd,
      targetSha,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      exitCode: result.code,
      runtime,
      ...(preview(result.stdout) ? { stdoutPreview: preview(result.stdout) } : {}),
      ...(preview(result.stderr) ? { stderrPreview: preview(result.stderr) } : {}),
      logPath,
    });
    if (result.code !== 0) break;
  }
  return results;
}

export function resolveLocalIntegrationLogDir(
  projectRoot: string,
  feature: ResolvedFeature,
  targetSha: string
): string {
  return path.join(
    path.dirname(resolveStatePath(projectRoot, feature)),
    'logs',
    resolveFeatureStateKey(feature),
    targetSha.slice(0, 12)
  );
}

function preview(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}\n…[truncated]` : trimmed;
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

export function resolveTree(cwd: string, commit: string): string | null {
  return resolveRef(cwd, `${commit}^{tree}`);
}

export function preserveLocalIntegrationEvidence(
  projectRoot: string,
  evidenceRef: string,
  featureTip: string
): { code: number; stdout: string; stderr: string } {
  return gitRun(projectRoot, ['update-ref', evidenceRef, featureTip]);
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
  return resolveGitPrimaryWorktreeRoot(feature.git.projectGitCwd);
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
  const key = resolveFeatureStateKey(feature);
  return path.join(
    commonDir,
    'lee-spec-kit',
    'local-integrations',
    `${key}.json`
  );
}

function resolveEvidenceRef(feature: ResolvedFeature): string {
  return `refs/lee-spec-kit/integrations/${resolveFeatureStateKey(feature)}`;
}

function resolveFeatureStateKey(feature: ResolvedFeature): string {
  return crypto
    .createHash('sha256')
    .update(`${feature.type}:${feature.folderName}`)
    .digest('hex')
    .slice(0, 24);
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

function normalizeWorkflowChecks(value: unknown): LocalWorkflowCheck[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is LocalWorkflowCheck =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as LocalWorkflowCheck).command === 'string' &&
        !!(entry as LocalWorkflowCheck).command.trim()
    )
    .map((entry) => ({
      command: entry.command.trim(),
      args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    }));
}

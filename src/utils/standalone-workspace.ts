import path from 'path';
import { createHash } from 'node:crypto';
import type { ProjectConfig } from '../config/types.js';
import { runGitCapture } from './git-run.js';

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function isSameOrWithin(parentDir: string, candidateDir: string): boolean {
  const resolvedParent = path.resolve(parentDir);
  const resolvedCandidate = path.resolve(candidateDir);
  return (
    resolvedParent === resolvedCandidate ||
    resolvedCandidate.startsWith(`${resolvedParent}${path.sep}`)
  );
}

export function resolveStandaloneWorkspaceRoot(
  cwd: string,
  docsDir: string
): string {
  const resolvedCwd = path.resolve(cwd);
  const resolvedDocsDir = path.resolve(docsDir);

  if (resolvedCwd === resolvedDocsDir) {
    return resolvedCwd;
  }

  if (resolvedDocsDir.startsWith(`${resolvedCwd}${path.sep}`)) {
    return resolvedCwd;
  }

  return path.dirname(resolvedDocsDir);
}

export function serializeStandaloneWorkspaceRoot(
  docsDir: string,
  workspaceRoot: string
): string {
  const relative = normalizeSlashes(
    path.relative(path.resolve(docsDir), path.resolve(workspaceRoot))
  );
  return relative || '.';
}

function collectStandaloneProjectRoots(
  config: Pick<ProjectConfig, 'projectRoot'>,
  workspaceRoot: string,
  component?: string
): string[] {
  if (!config.projectRoot) {
    return [];
  }

  const rawRoots =
    typeof config.projectRoot === 'string'
      ? [config.projectRoot]
      : component
        ? [config.projectRoot[component]].filter(Boolean)
        : Object.values(config.projectRoot);

  const deduped = new Set<string>();
  for (const rawRoot of rawRoots) {
    const value = String(rawRoot || '').trim();
    if (!value) continue;
    deduped.add(path.resolve(workspaceRoot, value));
  }

  return [...deduped];
}

function isValidStandaloneWorkspaceRoot(
  config: Pick<ProjectConfig, 'docsRepo' | 'docsDir' | 'projectRoot'>,
  workspaceRoot: string
): boolean {
  if (config.docsRepo !== 'standalone') return false;

  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedDocsDir = path.resolve(config.docsDir);
  if (
    resolvedWorkspaceRoot === resolvedDocsDir ||
    !isSameOrWithin(resolvedWorkspaceRoot, resolvedDocsDir)
  ) {
    return false;
  }

  const projectRoots = collectStandaloneProjectRoots(config, resolvedWorkspaceRoot);
  for (const projectRoot of projectRoots) {
    const resolvedProjectRoot = path.resolve(projectRoot);
    if (resolvedProjectRoot === resolvedWorkspaceRoot) {
      return false;
    }
    if (isSameOrWithin(resolvedProjectRoot, resolvedWorkspaceRoot)) {
      return false;
    }
    if (isSameOrWithin(resolvedProjectRoot, resolvedDocsDir)) {
      return false;
    }
  }

  return true;
}

export function resolveConfiguredStandaloneWorkspaceRoot(
  config: Pick<ProjectConfig, 'docsRepo' | 'docsDir' | 'workspaceRoot' | 'projectRoot'>
): string | null {
  if (config.docsRepo !== 'standalone' || !config.projectRoot) return null;
  const raw = String(config.workspaceRoot || '').trim();
  if (!raw) return null;
  const resolvedWorkspaceRoot = path.resolve(config.docsDir, raw);
  return isValidStandaloneWorkspaceRoot(config, resolvedWorkspaceRoot)
    ? resolvedWorkspaceRoot
    : null;
}

export function canBackfillStandaloneWorkspaceRoot(
  cwd: string,
  docsDir: string
): boolean {
  const resolvedCwd = path.resolve(cwd);
  const resolvedDocsDir = path.resolve(docsDir);
  return (
    resolvedCwd !== resolvedDocsDir &&
    isSameOrWithin(resolvedCwd, resolvedDocsDir)
  );
}

export function resolveStandaloneProjectRoots(
  config: ProjectConfig,
  component?: string
): string[] {
  if (config.docsRepo !== 'standalone' || !config.projectRoot) {
    return [];
  }

  const workspaceRoot = resolveConfiguredStandaloneWorkspaceRoot(config);
  if (!workspaceRoot) {
    return [];
  }

  return collectStandaloneProjectRoots(config, workspaceRoot, component);
}

export function resolveGitTopLevelOrNull(cwd: string): string | null {
  return runGitCapture(['rev-parse', '--show-toplevel'], cwd) || null;
}

export function resolveGitTopLevelOrSelf(cwd: string): string {
  return resolveGitTopLevelOrNull(cwd) || path.resolve(cwd);
}

export function resolveGitPrimaryWorktreeRoot(cwd: string): string {
  const output = runGitCapture(['worktree', 'list', '--porcelain'], cwd) || '';
  const primary = output
    .split(/\r?\n/u)
    .find((line) => line.startsWith('worktree '))
    ?.slice('worktree '.length)
    .trim();
  return primary
    ? path.resolve(primary)
    : resolveGitTopLevelOrNull(cwd) || path.resolve(cwd);
}

export function normalizeBranchNameForWorktree(branchName: string): string {
  return branchName.trim().replace(/[\\/]/g, '-');
}

export function resolveStandaloneManagedWorktreeRoot(
  config: Pick<ProjectConfig, 'docsRepo' | 'docsDir' | 'workspaceRoot' | 'projectRoot'>,
  projectRoot: string
): string | null {
  if (config.docsRepo !== 'standalone') return null;
  const workspaceRoot = resolveConfiguredStandaloneWorkspaceRoot(config);
  if (!workspaceRoot) return null;
  const resolvedProjectRoot = path.resolve(projectRoot);
  const baseName = path.basename(resolvedProjectRoot);
  const collidingRoots = collectStandaloneProjectRoots(config, workspaceRoot)
    .map((entry) => path.resolve(entry))
    .filter(
      (entry) => path.basename(entry).toLowerCase() === baseName.toLowerCase()
    );
  const worktreeNamespace =
    collidingRoots.length > 1
      ? `${baseName}-${createHash('sha256')
          .update(resolvedProjectRoot)
          .digest('hex')
          .slice(0, 8)}`
      : baseName;
  return path.resolve(workspaceRoot, '.worktrees', worktreeNamespace);
}

export function resolveManagedWorktreePath(
  config: Pick<ProjectConfig, 'docsRepo' | 'docsDir' | 'workspaceRoot' | 'projectRoot'>,
  projectRoot: string,
  branchName: string
): string {
  const standaloneRoot = resolveStandaloneManagedWorktreeRoot(config, projectRoot);
  if (standaloneRoot) {
    return path.resolve(
      standaloneRoot,
      normalizeBranchNameForWorktree(branchName)
    );
  }

  return path.resolve(
    path.resolve(projectRoot),
    '.worktrees',
    normalizeBranchNameForWorktree(branchName)
  );
}

const registeredWorktreeCache = new Map<string, Set<string>>();

function listRegisteredGitWorktrees(projectRoot: string): Set<string> {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const cached = registeredWorktreeCache.get(resolvedProjectRoot);
  if (cached) return cached;

  const output = runGitCapture(
    ['worktree', 'list', '--porcelain'],
    resolvedProjectRoot
  ) || '';
  const worktrees = new Set<string>();

  for (const line of output.split(/\r?\n/u)) {
    if (!line.startsWith('worktree ')) continue;
    const listedPath = line.slice('worktree '.length).trim();
    if (listedPath) worktrees.add(path.resolve(listedPath));
  }

  registeredWorktreeCache.set(resolvedProjectRoot, worktrees);
  return worktrees;
}

export function isRegisteredGitWorktree(
  projectRoot: string,
  worktreePath: string
): boolean {
  const resolvedTarget = path.resolve(worktreePath);
  return listRegisteredGitWorktrees(projectRoot).has(resolvedTarget);
}

export function buildManagedWorktreeStaleCleanupCommand(
  projectRoot: string,
  worktreePath: string
): string {
  return `if [ -d "${worktreePath}" ] && ! git -C "${projectRoot}" worktree list --porcelain | grep -Fxq "worktree ${worktreePath}"; then rm -rf "${worktreePath}"; fi`;
}

export function buildManagedWorktreeEnvCopyCommand(
  projectRoot: string,
  worktreePath: string
): string {
  return `sh -c 'source_dir=$1; target_dir=$2; for source_env in "$source_dir"/.env "$source_dir"/.env.*; do [ -e "$source_env" ] || [ -L "$source_env" ] || continue; target_env="$target_dir/$(basename "$source_env")"; if [ ! -e "$target_env" ] && [ ! -L "$target_env" ]; then cp -p "$source_env" "$target_env"; fi; done' sh "${path.resolve(projectRoot)}" "${path.resolve(worktreePath)}"`;
}

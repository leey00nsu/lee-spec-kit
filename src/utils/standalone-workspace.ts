import path from 'path';
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

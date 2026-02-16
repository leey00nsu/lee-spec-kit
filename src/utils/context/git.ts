import { execFileSync, execSync } from 'child_process';
import path from 'path';
import { ProjectConfig } from '../config.js';
import { DEFAULT_LANG, Lang, tr } from '../i18n.js';

export function getCurrentBranch(cwd: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

export function getGitStatusPorcelain(
  cwd: string,
  relativePaths: string[]
): string | undefined {
  try {
    const args =
      relativePaths.length > 0
        ? ` -- ${relativePaths.map((p) => `"${p}"`).join(' ')}`
        : '';
    return execSync(`git status --porcelain=v1${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return undefined;
  }
}

function normalizeInputPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

function toUniqueNormalizedPaths(relativePaths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of relativePaths) {
    const normalized = normalizeInputPath(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function getTrackedGitPaths(
  cwd: string,
  relativePaths: string[]
): Set<string> | undefined {
  const inputs = toUniqueNormalizedPaths(relativePaths);
  if (inputs.length === 0) return new Set<string>();
  try {
    const out = execFileSync('git', ['ls-files', '--', ...inputs], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Set(
      out
        .split('\n')
        .map((line) => normalizeInputPath(line))
        .filter(Boolean)
    );
  } catch {
    return undefined;
  }
}

export function getIgnoredGitPaths(
  cwd: string,
  relativePaths: string[]
): Set<string> | undefined {
  const inputs = toUniqueNormalizedPaths(relativePaths);
  if (inputs.length === 0) return new Set<string>();

  try {
    const out = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd,
      encoding: 'utf-8',
      input: `${inputs.join('\n')}\n`,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return new Set(
      out
        .split('\n')
        .map((line) => normalizeInputPath(line))
        .filter(Boolean)
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status?: number }).status;
      if (status === 1) return new Set<string>();
    }
    return undefined;
  }
}

export function getLastCommitForPath(
  cwd: string,
  relativePath: string
): string | undefined {
  try {
    const out = execSync(`git rev-list -n 1 HEAD -- "${relativePath}"`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

export function isGitPathIgnored(
  cwd: string,
  relativePath: string
): boolean | undefined {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relativePath], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status?: number }).status;
      if (status === 1) return false;
    }
    return undefined;
  }
}

interface GitWorktreeEntry {
  path: string;
  branch?: string;
}

const GIT_WORKTREE_CACHE = new Map<string, GitWorktreeEntry[]>();

function getGitTopLevel(cwd: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function listGitWorktrees(cwd: string): GitWorktreeEntry[] | undefined {
  const topLevel = getGitTopLevel(cwd) || cwd;
  const cacheKey = path.resolve(topLevel);
  const cached = GIT_WORKTREE_CACHE.get(cacheKey);
  if (cached) return cached;

  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: topLevel,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const entries: GitWorktreeEntry[] = [];
    let current: GitWorktreeEntry | null = null;

    for (const rawLine of out.split('\n')) {
      const line = rawLine.trim();
      if (!line) {
        if (current?.path) entries.push(current);
        current = null;
        continue;
      }

      if (line.startsWith('worktree ')) {
        if (current?.path) entries.push(current);
        current = { path: line.slice('worktree '.length).trim() };
        continue;
      }

      if (line.startsWith('branch ')) {
        if (!current) continue;
        const fullRef = line.slice('branch '.length).trim();
        current.branch = fullRef.replace(/^refs\/heads\//, '');
      }
    }

    if (current?.path) entries.push(current);
    GIT_WORKTREE_CACHE.set(cacheKey, entries);
    return entries;
  } catch {
    return undefined;
  }
}

export function findWorktreePathForBranch(
  cwd: string,
  branchName: string
): string | undefined {
  const target = branchName.trim();
  if (!target) return undefined;
  const entries = listGitWorktrees(cwd);
  if (!entries) return undefined;
  const match = entries.find((entry) => entry.branch === target);
  return match?.path;
}

export function resolveProjectGitCwd(
  config: ProjectConfig,
  repo: string,
  lang: Lang = config.lang ?? DEFAULT_LANG
): { cwd: string | null; warning?: string } {
  const docsRepo = config.docsRepo;
  if (docsRepo !== 'standalone') {
    const topLevel = getGitTopLevel(process.cwd());
    return { cwd: topLevel || process.cwd() };
  }

  if (!config.projectRoot) {
    return {
      cwd: null,
      warning: tr(lang, 'cli', 'context.git.standaloneProjectRootMissing'),
    };
  }

  if (config.projectType === 'multi') {
    if (typeof config.projectRoot === 'string') {
      return {
        cwd: null,
        warning: tr(lang, 'cli', 'context.git.multiProjectRootShapeInvalid'),
      };
    }
    const root = config.projectRoot[repo];
    if (!root) {
      return {
        cwd: null,
        warning: tr(lang, 'cli', 'context.git.multiProjectRootRepoMissing', {
          repo,
        }),
      };
    }
    return { cwd: getGitTopLevel(root) || root };
  }

  if (typeof config.projectRoot !== 'string') {
    return {
      cwd: null,
      warning: tr(lang, 'cli', 'context.git.singleProjectRootShapeInvalid'),
    };
  }
  return { cwd: getGitTopLevel(config.projectRoot) || config.projectRoot };
}

export function isExpectedFeatureBranch(
  branchName: string,
  issueNumber: string | undefined,
  slug: string,
  folderName: string
): boolean {
  if (!branchName || !issueNumber) return false;
  const match = branchName.match(new RegExp(`^feat\\/${issueNumber}-(.+)$`));
  if (!match) return false;
  const rest = match[1];
  return rest === slug || rest === folderName;
}

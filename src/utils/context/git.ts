import path from 'path';
import { CliContext } from '../cli-context.js';
import { DEFAULT_LANG, Lang, tr } from '../i18n.js';

export function getCurrentBranch(ctx: CliContext, cwd: string): string {
  try {
    return ctx.cmd
      .execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

export function getGitStatusPorcelain(
  ctx: CliContext,
  cwd: string,
  relativePaths: string[]
): string | undefined {
  const normalizedPaths = toUniqueNormalizedPaths(relativePaths);
  try {
    const args = ['status', '--porcelain=v1'];
    if (normalizedPaths.length > 0) {
      args.push('--', ...normalizedPaths);
    }
    return ctx.cmd
      .execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      .toString();
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
  ctx: CliContext,
  cwd: string,
  relativePaths: string[]
): Set<string> | undefined {
  const inputs = toUniqueNormalizedPaths(relativePaths);
  if (inputs.length === 0) return new Set<string>();
  try {
    const out = ctx.cmd
      .execFileSync('git', ['ls-files', '--', ...inputs], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      .toString();
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
  ctx: CliContext,
  cwd: string,
  relativePaths: string[]
): Set<string> | undefined {
  const inputs = toUniqueNormalizedPaths(relativePaths);
  if (inputs.length === 0) return new Set<string>();

  try {
    const out = ctx.cmd
      .execFileSync('git', ['check-ignore', '--stdin'], {
        cwd,
        encoding: 'utf-8',
        input: `${inputs.join('\n')}\n`,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      .toString();
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
  ctx: CliContext,
  cwd: string,
  relativePath: string
): string | undefined {
  const normalizedPath = normalizeInputPath(relativePath);
  if (!normalizedPath) return undefined;
  try {
    const out = ctx.cmd
      .execFileSync(
        'git',
        ['rev-list', '-n', '1', 'HEAD', '--', normalizedPath],
        {
          cwd,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      .toString()
      .trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

export function isGitPathIgnored(
  ctx: CliContext,
  cwd: string,
  relativePath: string
): boolean | undefined {
  try {
    ctx.cmd.execFileSync('git', ['check-ignore', '-q', '--', relativePath], {
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
const WORKTREE_MARKER = `${path.sep}.worktrees${path.sep}`;

export function resetContextGitCaches(): void {
  GIT_WORKTREE_CACHE.clear();
}

export function isManagedWorktreePath(cwd: string | undefined): boolean {
  if (!cwd) return false;
  const normalized = path.resolve(cwd);
  return normalized.includes(WORKTREE_MARKER);
}

export function resolveProjectRootFromGitCwd(cwd: string): string {
  const normalized = path.resolve(cwd);
  const markerIndex = normalized.lastIndexOf(WORKTREE_MARKER);
  if (markerIndex <= 0) return normalized;
  const projectRoot = normalized.slice(0, markerIndex);
  return projectRoot || normalized;
}

function getGitTopLevel(ctx: CliContext, cwd: string): string | null {
  try {
    return ctx.cmd
      .execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function listGitWorktrees(
  ctx: CliContext,
  cwd: string
): GitWorktreeEntry[] | undefined {
  const topLevel = getGitTopLevel(ctx, cwd) || cwd;
  const cacheKey = path.resolve(topLevel);
  const cached = GIT_WORKTREE_CACHE.get(cacheKey);
  if (cached) return cached;

  try {
    const out = ctx.cmd
      .execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: topLevel,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      .toString();
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
  ctx: CliContext,
  cwd: string,
  branchName: string
): string | undefined {
  const target = branchName.trim();
  if (!target) return undefined;
  const entries = listGitWorktrees(ctx, cwd);
  if (!entries) return undefined;
  const match = entries.find((entry) => entry.branch === target);
  return match?.path;
}

export function resolveProjectGitCwd(
  ctx: CliContext,
  repo: string,
  lang: Lang = ctx.config.lang ?? DEFAULT_LANG
): { cwd: string | null; warning?: string } {
  const config = ctx.config;
  const docsRepo = config.docsRepo;
  if (docsRepo !== 'standalone') {
    const topLevel = getGitTopLevel(ctx, process.cwd());
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
    return { cwd: getGitTopLevel(ctx, root) || root };
  }

  if (typeof config.projectRoot !== 'string') {
    return {
      cwd: null,
      warning: tr(lang, 'cli', 'context.git.singleProjectRootShapeInvalid'),
    };
  }
  return { cwd: getGitTopLevel(ctx, config.projectRoot) || config.projectRoot };
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

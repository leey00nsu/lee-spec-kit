import { execFileSync, execSync } from 'child_process';
import { ProjectConfig } from '../config.js';

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

export function resolveProjectGitCwd(
  config: ProjectConfig,
  repo: string
): { cwd: string | null; warning?: string } {
  const docsRepo = config.docsRepo;
  if (docsRepo !== 'standalone') {
    const topLevel = getGitTopLevel(process.cwd());
    return { cwd: topLevel || process.cwd() };
  }

  if (!config.projectRoot) {
    return {
      cwd: null,
      warning:
        'standalone 모드입니다. projectRoot가 설정되지 않아 프로젝트 브랜치 확인이 불가능합니다. (npx lee-spec-kit config --project-root ...)',
    };
  }

  if (config.projectType === 'multi') {
    if (typeof config.projectRoot === 'string') {
      return {
        cwd: null,
        warning:
          'multi standalone 모드인데 projectRoot 형태가 올바르지 않습니다. (예: { "fe": "...", "be": "...", "worker": "..." })',
      };
    }
    const root = config.projectRoot[repo];
    if (!root) {
      return {
        cwd: null,
        warning: `projectRoot.${repo}가 비어있습니다. (npx lee-spec-kit config --project-root ... --component ${repo})`,
      };
    }
    return { cwd: getGitTopLevel(root) || root };
  }

  if (typeof config.projectRoot !== 'string') {
    return {
      cwd: null,
      warning:
        'single standalone 모드인데 projectRoot 형태가 올바르지 않습니다. (예: "/path/to/project")',
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

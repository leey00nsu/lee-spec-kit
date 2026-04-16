import { Command } from 'commander';
import path from 'node:path';
import { getConfig } from '../utils/config.js';
import { runGitCapture } from '../utils/git-run.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import { resolveStandaloneProjectRoots } from '../utils/standalone-workspace.js';
import {
  DEFAULT_MANAGED_DOC_DIRS,
  DEFAULT_MANAGED_DOC_FILES,
  type AllowedDocsEntriesConfig,
} from '../utils/unmanaged-docs.js';

interface CommitAuditOptions {
  json?: boolean;
  gitRoot?: string;
}

type CommitAuditReasonCode =
  | 'COMMIT_ALLOWED'
  | 'UNSUPPORTED_GIT_TARGET'
  | 'UNMANAGED_DOCS_COMMIT'
  | 'NON_CANONICAL_FEATURE_DOC_COMMIT'
  | 'CANONICAL_FEATURE_DOC_DELETION'
  | 'DOCS_COMMIT_POLICY_VIOLATION'
  | 'NO_GIT_REPOSITORY'
  | 'CONFIG_NOT_FOUND'
  | 'UNEXPECTED_ERROR';

interface CommitAuditViolation {
  path: string;
  kind:
    | 'unmanaged_docs_entry'
    | 'non_canonical_feature_doc'
    | 'canonical_feature_doc_deletion'
    | 'unsupported_git_target';
  detail: string;
}

interface StagedPathEntry {
  path: string;
  status: string;
  role: 'path' | 'source' | 'target';
}

interface CommitAuditPayload {
  status: 'ok' | 'blocked' | 'skipped' | 'error';
  reasonCode: CommitAuditReasonCode;
  docsDir: string | null;
  stagedPaths: string[];
  blockedPaths: string[];
  violations: CommitAuditViolation[];
}

const CANONICAL_FEATURE_DOC_PATTERN =
  /^features\/(?:[^/]+\/)?F\d{3,}[^/]*\/(spec|plan|tasks|decisions|issue|pr)\.md$/i;
const FEATURE_DOC_CANDIDATE_PATTERN =
  /^features\/(?:[^/]+\/)?F\d{3,}[^/]*\/(.+)$/i;

export function commitAuditCommand(program: Command): void {
  program
    .command('commit-audit')
    .description('Validate staged docs paths before commit')
    .option('--json', 'Output JSON for hooks and agents')
    .option('--git-root <path>', 'Override the git root used for staged-path inspection')
    .action(async (options: CommitAuditOptions) => {
      try {
        const payload = await collectCommitAudit(process.cwd(), options.gitRoot);
        if (options.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        console.log(`${payload.status}: ${payload.reasonCode}`);
      } catch (error) {
        const cliError = toCliError(error);
        const payload: CommitAuditPayload = {
          status: 'error',
          reasonCode: cliError.code === 'CONFIG_NOT_FOUND'
            ? 'CONFIG_NOT_FOUND'
            : 'UNEXPECTED_ERROR',
          docsDir: null,
          stagedPaths: [],
          blockedPaths: [],
          violations: [],
        };
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                ...payload,
                error: cliError.message,
              },
              null,
              2
            )
          );
          return;
        }
        process.stderr.write(`[${cliError.code}] ${cliError.message}\n`);
        process.exitCode = 1;
      }
    });
}

async function collectCommitAudit(
  cwd: string,
  gitRootOverride?: string
): Promise<CommitAuditPayload> {
  const config = await getConfig(cwd);
  if (!config) {
    throw createCliError('CONFIG_NOT_FOUND', 'Config file not found. Run `init` first.');
  }

  const overrideRoot = gitRootOverride
    ? path.resolve(cwd, gitRootOverride)
    : null;
  const repoRoot =
    (overrideRoot
      ? runGitCapture(['rev-parse', '--show-toplevel'], overrideRoot)
      : runGitCapture(['rev-parse', '--show-toplevel'], cwd)) || null;
  if (!repoRoot) {
    return {
      status: 'skipped',
      reasonCode: 'NO_GIT_REPOSITORY',
      docsDir: config.docsDir,
      stagedPaths: [],
      blockedPaths: [],
      violations: [],
    };
  }

  const stagedOutput =
    runGitCapture(['diff', '--cached', '--name-status', '--diff-filter=ACMRD'], repoRoot) || '';
  const stagedEntries = parseStagedPaths(stagedOutput);
  const stagedPaths = [...new Set(stagedEntries.map((entry) => entry.path))];
  const targetRepoViolation = collectUnsupportedTargetRepoViolation(
    config,
    cwd,
    repoRoot
  );
  if (targetRepoViolation) {
    return {
      status: 'blocked',
      reasonCode: 'UNSUPPORTED_GIT_TARGET',
      docsDir: config.docsDir,
      stagedPaths,
      blockedPaths: [targetRepoViolation.path],
      violations: [targetRepoViolation],
    };
  }
  const violations = collectCommitViolations(
    repoRoot,
    config.docsDir,
    stagedEntries,
    config.allowedDocsEntries
  );

  if (violations.length === 0) {
    return {
      status: 'ok',
      reasonCode: 'COMMIT_ALLOWED',
      docsDir: config.docsDir,
      stagedPaths,
      blockedPaths: [],
      violations: [],
    };
  }

  return {
    status: 'blocked',
    reasonCode: resolveReasonCode(violations),
    docsDir: config.docsDir,
    stagedPaths,
    blockedPaths: [...new Set(violations.map((entry) => entry.path))].sort(),
    violations,
  };
}

function collectUnsupportedTargetRepoViolation(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  cwd: string,
  repoRoot: string
): CommitAuditViolation | null {
  const allowedRepoRoots = collectAllowedCommitRepoRoots(config, cwd);
  const normalizedRepoRoot = path.resolve(repoRoot);
  if (allowedRepoRoots.has(normalizedRepoRoot)) {
    return null;
  }
  return {
    path: normalizeSlashes(normalizedRepoRoot),
    kind: 'unsupported_git_target',
    detail:
      'Commit target repo is outside the current lee-spec-kit project topology. Re-run the commit from the active workspace or target repo root instead.',
  };
}

function collectAllowedCommitRepoRoots(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  cwd: string
): Set<string> {
  const allowed = new Set<string>();
  const docsRepoRoot = runGitCapture(['rev-parse', '--show-toplevel'], config.docsDir);
  if (docsRepoRoot) {
    allowed.add(path.resolve(docsRepoRoot));
  }

  if (config.docsRepo === 'standalone') {
    const scopedProjectRoots = resolveStandaloneProjectRoots(config);
    for (const projectRoot of scopedProjectRoots) {
      const projectRepoRoot = runGitCapture(['rev-parse', '--show-toplevel'], projectRoot);
      if (projectRepoRoot) {
        allowed.add(path.resolve(projectRepoRoot));
      }
    }
    return allowed;
  }

  const cwdRepoRoot = runGitCapture(['rev-parse', '--show-toplevel'], cwd);
  if (cwdRepoRoot) {
    allowed.add(path.resolve(cwdRepoRoot));
  }
  return allowed;
}

function parseStagedPaths(output: string): StagedPathEntry[] {
  const staged = new Map<string, string>();

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split('\t').map((entry) => entry.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const status = parts[0];
    if (/^[RC]/i.test(status) && parts.length >= 3) {
      staged.set(`source:${normalizeSlashes(parts[1])}`, `${status}:source`);
      staged.set(`target:${normalizeSlashes(parts[2])}`, `${status}:target`);
      continue;
    }

    staged.set(`path:${normalizeSlashes(parts[1])}`, `${status}:path`);
  }

  return [...staged.entries()].map(([encodedPath, encodedStatus]) => {
    const [role, path] = encodedPath.split(':', 2);
    const [status, entryRole] = encodedStatus.split(':', 2);
    return {
      path,
      status,
      role: (entryRole || role || 'path') as StagedPathEntry['role'],
    };
  });
}

function collectCommitViolations(
  repoRoot: string,
  docsDir: string,
  stagedEntries: StagedPathEntry[],
  allowed?: AllowedDocsEntriesConfig
): CommitAuditViolation[] {
  const allowedDirs = toAllowedSet(DEFAULT_MANAGED_DOC_DIRS, allowed?.dirs);
  const allowedFiles = toAllowedSet(DEFAULT_MANAGED_DOC_FILES, allowed?.files);
  const violations = new Map<string, CommitAuditViolation>();

  for (const stagedEntry of stagedEntries) {
    const stagedPath = stagedEntry.path;
    const absolutePath = path.resolve(repoRoot, stagedPath);
    const relativeToDocs = normalizeSlashes(path.relative(docsDir, absolutePath));
    if (
      !relativeToDocs ||
      relativeToDocs === '' ||
      relativeToDocs.startsWith('..')
    ) {
      continue;
    }

    const segments = relativeToDocs.split('/');
    const topLevel = segments[0]?.trim();
    if (!topLevel) continue;

    if (
      (/^D/i.test(stagedEntry.status) ||
        (/^R/i.test(stagedEntry.status) && stagedEntry.role === 'source')) &&
      CANONICAL_FEATURE_DOC_PATTERN.test(relativeToDocs)
    ) {
      violations.set(stagedPath, {
        path: stagedPath,
        kind: 'canonical_feature_doc_deletion',
        detail:
          'Deleting canonical feature docs requires restoring the file or moving the change into canonical replacements first.',
      });
      continue;
    }

    if (segments.length === 1) {
      if (!allowedFiles.has(normalizeEntryName(topLevel))) {
        violations.set(stagedPath, {
          path: stagedPath,
          kind: 'unmanaged_docs_entry',
          detail: `Top-level docs file is outside the canonical surface: docs/${topLevel}`,
        });
      }
      continue;
    }

    if (!allowedDirs.has(normalizeEntryName(topLevel))) {
      violations.set(stagedPath, {
        path: stagedPath,
        kind: 'unmanaged_docs_entry',
        detail: `Top-level docs directory is outside the canonical surface: docs/${topLevel}`,
      });
      continue;
    }

    if (
      topLevel === 'features' &&
      FEATURE_DOC_CANDIDATE_PATTERN.test(relativeToDocs) &&
      !CANONICAL_FEATURE_DOC_PATTERN.test(relativeToDocs)
    ) {
      violations.set(stagedPath, {
        path: stagedPath,
        kind: 'non_canonical_feature_doc',
        detail:
          'Feature-local files must use the canonical file names only: spec.md, plan.md, tasks.md, decisions.md, issue.md, pr.md',
      });
    }
  }

  return [...violations.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function resolveReasonCode(violations: CommitAuditViolation[]): CommitAuditReasonCode {
  const kinds = new Set(violations.map((entry) => entry.kind));
  if (kinds.size > 1) return 'DOCS_COMMIT_POLICY_VIOLATION';
  if (kinds.has('unsupported_git_target')) return 'UNSUPPORTED_GIT_TARGET';
  if (kinds.has('unmanaged_docs_entry')) return 'UNMANAGED_DOCS_COMMIT';
  if (kinds.has('canonical_feature_doc_deletion')) {
    return 'CANONICAL_FEATURE_DOC_DELETION';
  }
  return 'NON_CANONICAL_FEATURE_DOC_COMMIT';
}

function normalizeEntryName(value: string): string {
  return value.trim().toLowerCase();
}

function toAllowedSet(values: readonly string[], extras?: string[]): Set<string> {
  return new Set(
    [...values, ...(extras || [])]
      .map((entry) => normalizeEntryName(entry))
      .filter(Boolean)
  );
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

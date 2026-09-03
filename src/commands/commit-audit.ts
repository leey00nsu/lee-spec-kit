import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../utils/config.js';
import { runGitCapture } from '../utils/git-run.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import {
  resolveStandaloneManagedWorktreeRoot,
  resolveStandaloneProjectRoots,
} from '../utils/standalone-workspace.js';
import { resolveFeatureSelection } from '../utils/feature-resolver.js';
import {
  DEFAULT_MANAGED_DOC_DIRS,
  DEFAULT_MANAGED_DOC_FILES,
  type AllowedDocsEntriesConfig,
} from '../utils/unmanaged-docs.js';
import {
  matchesDocsCommitConvention,
  matchesProjectCommitConvention,
  resolveFeatureCommitScope,
} from '../utils/commit-conventions.js';
import {
  collectGitChangedPaths,
  isOpenWikiEnabled,
  isOpenWikiKnowledgePath,
  inspectOpenWikiKnowledge,
  OPENWIKI_RECEIPT_PATH,
  OPENWIKI_RUN_OWNER_PATH,
  readOpenWikiReceipt,
} from '../utils/openwiki-knowledge.js';

interface CommitAuditOptions {
  json?: boolean;
  gitRoot?: string;
  message?: string;
  messageFile?: string;
  enforce?: boolean;
}

type CommitAuditReasonCode =
  | 'COMMIT_ALLOWED'
  | 'UNSUPPORTED_GIT_TARGET'
  | 'UNMANAGED_DOCS_COMMIT'
  | 'NON_CANONICAL_FEATURE_DOC_COMMIT'
  | 'CANONICAL_FEATURE_DOC_DELETION'
  | 'DOCS_COMMIT_POLICY_VIOLATION'
  | 'COMMIT_MESSAGE_POLICY_VIOLATION'
  | 'KNOWLEDGE_COMMIT_POLICY_VIOLATION'
  | 'NO_GIT_REPOSITORY'
  | 'CONFIG_NOT_FOUND'
  | 'UNEXPECTED_ERROR';

interface CommitAuditViolation {
  path: string;
  kind:
    | 'unmanaged_docs_entry'
    | 'non_canonical_feature_doc'
    | 'canonical_feature_doc_deletion'
    | 'unsupported_git_target'
    | 'knowledge_output_scope'
    | 'commit_message_policy';
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
    .description(
      'Validate staged docs paths and canonical commit subjects before commit'
    )
    .option('--json', 'Output JSON for hooks and agents')
    .option(
      '--git-root <path>',
      'Override the git root used for staged-path inspection'
    )
    .option(
      '--message <message>',
      'Validate a commit subject against the current workflow convention'
    )
    .option(
      '--message-file <path>',
      'Read and validate the commit subject from a commit message file'
    )
    .option('--enforce', 'Exit non-zero when commit-audit blocks the commit')
    .action(async (options: CommitAuditOptions) => {
      try {
        const commitMessage = await resolveCommitMessageInput(
          process.cwd(),
          options
        );
        const payload = await collectCommitAudit(
          process.cwd(),
          options.gitRoot,
          commitMessage
        );
        if (options.enforce && payload.status === 'blocked') {
          process.exitCode = 1;
        }
        if (options.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        console.log(`${payload.status}: ${payload.reasonCode}`);
      } catch (error) {
        const cliError = toCliError(error);
        const payload: CommitAuditPayload = {
          status: 'error',
          reasonCode:
            cliError.code === 'CONFIG_NOT_FOUND'
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
          if (options.enforce) process.exitCode = 1;
          return;
        }
        process.stderr.write(`[${cliError.code}] ${cliError.message}\n`);
        process.exitCode = 1;
      }
    });
}

async function resolveCommitMessageInput(
  cwd: string,
  options: CommitAuditOptions
): Promise<string | undefined> {
  if (options.message && options.messageFile) {
    throw createCliError(
      'INVALID_ARGUMENT',
      'Use either --message or --message-file, not both.'
    );
  }
  if (options.message) return options.message;
  if (!options.messageFile) return undefined;

  const content = await fs.readFile(
    path.resolve(cwd, options.messageFile),
    'utf-8'
  );
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));
}

async function collectCommitAudit(
  cwd: string,
  gitRootOverride?: string,
  commitMessage?: string
): Promise<CommitAuditPayload> {
  const config = await getConfig(cwd);
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'Config file not found. Run `init` first.'
    );
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
    runGitCapture(
      ['diff', '--cached', '--name-status', '--diff-filter=ACMRD'],
      repoRoot
    ) || '';
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
  violations.push(
    ...(await collectKnowledgeCommitViolations(
      config,
      stagedEntries,
      cwd,
      repoRoot
    ))
  );
  const commitMessageViolation = await collectCommitMessageViolation(
    cwd,
    config,
    repoRoot,
    stagedEntries,
    commitMessage
  );
  if (commitMessageViolation) {
    violations.push(commitMessageViolation);
  }

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
  const docsRepoRoot = runGitCapture(
    ['rev-parse', '--show-toplevel'],
    config.docsDir
  );
  if (docsRepoRoot) {
    allowed.add(path.resolve(docsRepoRoot));
  }

  if (config.docsRepo === 'standalone') {
    const scopedProjectRoots = resolveStandaloneProjectRoots(config);
    for (const projectRoot of scopedProjectRoots) {
      const projectRepoRoot = runGitCapture(
        ['rev-parse', '--show-toplevel'],
        projectRoot
      );
      if (projectRepoRoot) {
        allowed.add(path.resolve(projectRepoRoot));
      }
      for (const worktreeRepoRoot of collectManagedWorktreeRepoRoots(
        config,
        projectRoot
      )) {
        allowed.add(path.resolve(worktreeRepoRoot));
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

function collectManagedWorktreeRepoRoots(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  projectRoot: string
): string[] {
  const managedRoot = resolveStandaloneManagedWorktreeRoot(config, projectRoot);
  if (!managedRoot) {
    return [];
  }

  const output =
    runGitCapture(['worktree', 'list', '--porcelain'], projectRoot) || '';
  const roots = new Set<string>();

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('worktree ')) continue;
    const worktreePath = path.resolve(line.slice('worktree '.length).trim());
    if (isSameOrWithin(path.resolve(managedRoot), worktreePath)) {
      roots.add(worktreePath);
    }
  }

  return [...roots];
}

function isSameOrWithin(parentDir: string, candidateDir: string): boolean {
  const resolvedParent = path.resolve(parentDir);
  const resolvedCandidate = path.resolve(candidateDir);
  return (
    resolvedParent === resolvedCandidate ||
    resolvedCandidate.startsWith(`${resolvedParent}${path.sep}`)
  );
}

function parseStagedPaths(output: string): StagedPathEntry[] {
  const staged = new Map<string, string>();

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line
      .split('\t')
      .map((entry) => entry.trim())
      .filter(Boolean);
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
    const relativeToDocs = normalizeSlashes(
      path.relative(docsDir, absolutePath)
    );
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

function resolveReasonCode(
  violations: CommitAuditViolation[]
): CommitAuditReasonCode {
  const kinds = new Set(violations.map((entry) => entry.kind));
  if (kinds.size > 1) return 'DOCS_COMMIT_POLICY_VIOLATION';
  if (kinds.has('commit_message_policy')) {
    return 'COMMIT_MESSAGE_POLICY_VIOLATION';
  }
  if (kinds.has('knowledge_output_scope')) {
    return 'KNOWLEDGE_COMMIT_POLICY_VIOLATION';
  }
  if (kinds.has('unsupported_git_target')) return 'UNSUPPORTED_GIT_TARGET';
  if (kinds.has('unmanaged_docs_entry')) return 'UNMANAGED_DOCS_COMMIT';
  if (kinds.has('canonical_feature_doc_deletion')) {
    return 'CANONICAL_FEATURE_DOC_DELETION';
  }
  return 'NON_CANONICAL_FEATURE_DOC_COMMIT';
}

async function collectCommitMessageViolation(
  cwd: string,
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  repoRoot: string,
  stagedEntries: StagedPathEntry[],
  commitMessage?: string
): Promise<CommitAuditViolation | null> {
  const normalizedMessage = String(commitMessage || '').trim();
  if (!normalizedMessage) {
    return null;
  }

  const selection = await resolveCommitFeatureSelection(
    cwd,
    repoRoot,
    stagedEntries
  );
  if (selection.status !== 'selected' || !selection.matchedFeature) {
    return null;
  }

  const scope = resolveFeatureCommitScope({
    issueNumber: selection.matchedFeature.issueNumber,
    featureId: selection.matchedFeature.id,
    workflowMode: config.workflow?.mode,
  });
  if (!scope) {
    return null;
  }
  if (isOpenWikiEnabled(config) && isKnowledgeCommit(stagedEntries)) {
    const expected = `chore(${scope}): refresh OpenWiki knowledge layer`;
    if (normalizedMessage === expected) return null;
    return {
      path: '(commit message)',
      kind: 'commit_message_policy',
      detail: `Knowledge commit subject must be exactly "${expected}".`,
    };
  }
  const docsRepoRoot = runGitCapture(
    ['rev-parse', '--show-toplevel'],
    config.docsDir
  );
  const normalizedRepoRoot = path.resolve(repoRoot);
  const normalizedDocsRepoRoot = docsRepoRoot
    ? path.resolve(docsRepoRoot)
    : null;
  const docsOnlyCommit =
    stagedEntries.length > 0 &&
    stagedEntries.every((entry) => {
      const absolutePath = path.resolve(repoRoot, entry.path);
      const relativeToDocs = normalizeSlashes(
        path.relative(config.docsDir, absolutePath)
      );
      return (
        !!relativeToDocs &&
        relativeToDocs !== '' &&
        !relativeToDocs.startsWith('..')
      );
    });
  const isDocsCommit =
    !!normalizedDocsRepoRoot &&
    normalizedDocsRepoRoot === normalizedRepoRoot &&
    (config.docsRepo === 'standalone' || docsOnlyCommit);
  const valid = isDocsCommit
    ? matchesDocsCommitConvention(normalizedMessage, scope)
    : matchesProjectCommitConvention(normalizedMessage, scope);
  if (valid) {
    return null;
  }

  const expected = isDocsCommit
    ? `docs(${scope}): ...`
    : `type(${scope}): ... (feat/fix/refactor/test/style/chore)`;
  return {
    path: '(commit message)',
    kind: 'commit_message_policy',
    detail: `Commit subject must follow the canonical feature-scoped convention. Expected ${expected}, received "${normalizedMessage}".`,
  };
}

async function collectKnowledgeCommitViolations(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  stagedEntries: StagedPathEntry[],
  cwd: string,
  repoRoot: string
): Promise<CommitAuditViolation[]> {
  if (!isOpenWikiEnabled(config) || !isKnowledgeCommit(stagedEntries))
    return [];
  const violations: CommitAuditViolation[] = [];
  const stagedPaths = new Set(stagedEntries.map((entry) => entry.path));
  const changedKnowledgePaths = collectGitChangedPaths(repoRoot).filter(
    isOpenWikiKnowledgePath
  );
  for (const changedPath of changedKnowledgePaths) {
    if (stagedPaths.has(changedPath)) continue;
    violations.push({
      path: changedPath,
      kind: 'knowledge_output_scope',
      detail:
        'A Knowledge commit must stage the complete current Knowledge change set.',
    });
  }
  for (const changedPath of collectUnstagedKnowledgePaths(repoRoot)) {
    violations.push({
      path: changedPath,
      kind: 'knowledge_output_scope',
      detail:
        'A Knowledge commit cannot leave unstaged or untracked changes on a Knowledge path.',
    });
  }
  if (!stagedPaths.has(OPENWIKI_RECEIPT_PATH)) {
    violations.push({
      path: OPENWIKI_RECEIPT_PATH,
      kind: 'knowledge_output_scope',
      detail:
        'A Knowledge commit must include the lee-spec-kit verification receipt.',
    });
  }
  for (const entry of stagedEntries) {
    if (isOpenWikiKnowledgePath(entry.path)) continue;
    violations.push({
      path: entry.path,
      kind: 'knowledge_output_scope',
      detail:
        'Knowledge commits may contain only openwiki/**, the receipt, and OpenWiki-managed AGENTS.md/CLAUDE.md changes.',
    });
  }
  const selection = await resolveCommitFeatureSelection(
    cwd,
    repoRoot,
    stagedEntries
  );
  if (selection.status !== 'selected' || !selection.matchedFeature) {
    violations.push({
      path: OPENWIKI_RECEIPT_PATH,
      kind: 'knowledge_output_scope',
      detail: 'A Knowledge commit must resolve exactly one active Feature.',
    });
    return violations;
  }
  const knowledgeState = await inspectOpenWikiKnowledge({
    config,
    featureRef: selection.matchedFeature.folderName,
    component: selection.matchedFeature.type,
    projectCwd: repoRoot,
  });
  if (knowledgeState.status !== 'commit_required') {
    violations.push({
      path: OPENWIKI_RECEIPT_PATH,
      kind: 'knowledge_output_scope',
      detail: `Knowledge audit must report commit_required before commit; received ${knowledgeState.status} (${knowledgeState.reasonCode}).`,
    });
  }
  return violations;
}

async function resolveCommitFeatureSelection(
  cwd: string,
  repoRoot: string,
  stagedEntries: StagedPathEntry[]
): Promise<Awaited<ReturnType<typeof resolveFeatureSelection>>> {
  if (isKnowledgeCommit(stagedEntries)) {
    const receipt = await readOpenWikiReceipt(repoRoot);
    if (receipt) {
      return resolveFeatureSelection(
        cwd,
        receipt.triggerFeatureRef,
        receipt.triggerComponent
      );
    }
  }
  return resolveFeatureSelection(cwd);
}

function isKnowledgeCommit(stagedEntries: StagedPathEntry[]): boolean {
  return stagedEntries.some(
    (entry) =>
      entry.path === OPENWIKI_RECEIPT_PATH ||
      entry.path === OPENWIKI_RUN_OWNER_PATH ||
      entry.path === '.openwikiignore' ||
      entry.path === 'AGENTS.md' ||
      entry.path === 'CLAUDE.md' ||
      entry.path === 'openwiki' ||
      entry.path.startsWith('openwiki/')
  );
}

function collectUnstagedKnowledgePaths(repoRoot: string): string[] {
  const paths = new Set<string>();
  const collect = (args: string[]) => {
    const output = String(
      execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }) || ''
    );
    for (const entry of output.split('\0')) {
      const normalized = normalizeSlashes(entry.trim());
      if (normalized && isOpenWikiKnowledgePath(normalized)) {
        paths.add(normalized);
      }
    }
  };
  collect(['diff', '--name-only', '-z']);
  collect(['ls-files', '--others', '--exclude-standard', '-z']);
  return [...paths].sort();
}

function normalizeEntryName(value: string): string {
  return value.trim().toLowerCase();
}

function toAllowedSet(
  values: readonly string[],
  extras?: string[]
): Set<string> {
  return new Set(
    [...values, ...(extras || [])]
      .map((entry) => normalizeEntryName(entry))
      .filter(Boolean)
  );
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

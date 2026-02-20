import path from 'path';
import { CliContext } from '../cli-context.js';
import { tr } from '../i18n.js';
import {
  findWorktreePathForBranch,
  getCurrentBranch,
  getGitStatusPorcelain,
  getLastCommitForPath,
  isExpectedFeatureBranch,
  isGitPathIgnored,
} from './git.js';
import { resolveFeatureProgress } from './progress.js';
import {
  CompletionChecklistSummary,
  DocStatus,
  FeatureContext,
  FeatureState,
  Lang,
  PrePrDecisionOutcome,
  PrePrReviewStatus,
  PrRemoteStatus,
  PrReviewStatus,
  RepoType,
  StepDefinition,
  TaskRef,
  WorkflowDocStatus,
} from './types.js';
import { ProjectConfig } from '../config.js';
import {
  resolveCodeDirtyScopePolicy,
  resolvePrePrReviewPolicy,
  resolveWorkflowPolicy,
} from '../workflow.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSpecValue(content: string, key: string): string | undefined {
  const regex = new RegExp(
    `^\\s*-\\s*\\*\\*${escapeRegExp(key)}\\*\\*\\s*:\\s*(.*)$`,
    'm'
  );
  const match = content.match(regex);
  return match ? match[1].trim() : undefined;
}

function hasSpecKey(content: string, key: string): boolean {
  const regex = new RegExp(
    `^\\s*-\\s*\\*\\*${escapeRegExp(key)}\\*\\*\\s*:`,
    'm'
  );
  return regex.test(content);
}

function hasAnySpecKey(content: string, keys: string[]): boolean {
  return keys.some((key) => hasSpecKey(content, key));
}

function extractFirstSpecValue(
  content: string,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = extractSpecValue(content, key);
    if (value) return value;
  }
  return undefined;
}

function parseDocStatus(value: string | undefined): DocStatus | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.includes('|')) return undefined;

  const match = trimmed.match(/\b(Draft|Review|In[ -_]?Review|Approved)\b/i);
  if (!match) return undefined;
  const normalized = match[1].toLowerCase().replace(/[\s_-]/g, '');
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'review' || normalized === 'inreview') return 'Review';
  return 'Approved';
}

function parseWorkflowDocStatus(
  value: string | undefined
): WorkflowDocStatus | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('|')) return undefined;

  const match = trimmed.match(/\b(Draft|Ready|Opened|Open|Merged)\b/i);
  if (!match) return undefined;
  const normalized = match[1].toLowerCase();
  if (normalized === 'draft') return 'Draft';
  // Backward compatibility:
  // Legacy workflow docs used Opened/Merged, but current branching treats
  // "ready to execute/create" as a single state.
  if (
    normalized === 'ready' ||
    normalized === 'opened' ||
    normalized === 'open' ||
    normalized === 'merged'
  ) {
    return 'Ready';
  }
  return undefined;
}

function parsePrReviewStatus(
  value: string | undefined
): PrReviewStatus | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('|')) return undefined;

  const match = trimmed.match(/\b(Review|Approved)\b/i);
  if (!match) return undefined;
  const normalized = match[1].toLowerCase();
  if (normalized === 'review') return 'Review';
  return 'Approved';
}

function parsePrePrReviewStatus(
  value: string | undefined
): PrePrReviewStatus | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('|')) return undefined;
  if (/^(done|complete|completed)$/i.test(trimmed)) return 'Done';
  if (/^pending$/i.test(trimmed)) return 'Pending';
  return undefined;
}

function isPlaceholderReviewEvidence(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(?:-|#)?\s*(?:tbd|todo|n\/a|na|none|pending|미정|없음|-)\s*$/i.test(
    trimmed
  );
}

function hasStructuredReviewSummary(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(?:summary|요약)\s*[:：]\s*\S.+$/i.test(trimmed);
}

function hasStructuredReviewDecision(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(?:decision|결정)\s*[:：]\s*\S.+$/i.test(trimmed);
}

function parsePrePrDecisionOutcome(
  value: string | undefined
): PrePrDecisionOutcome | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const structured = trimmed.match(/^(?:decision|결정)\s*[:：]\s*(.+)$/i);
  if (!structured) return undefined;

  const payload = structured[1].trim().toLowerCase();
  const normalized = payload.split(/[,\s-]+/)[0]?.replace(/[^a-z_]/g, '');
  if (!normalized) return undefined;

  if (normalized === 'approve' || normalized === 'approved') {
    return 'approve';
  }
  if (
    normalized === 'changes_requested' ||
    normalized === 'changes' ||
    normalized === 'change'
  ) {
    return 'changes_requested';
  }
  if (normalized === 'blocked' || normalized === 'block') {
    return 'blocked';
  }
  return undefined;
}

function resolveEvidencePathValue(value: string): string {
  const trimmed = value.trim();
  const mdLink = trimmed.match(/\(([^)]+)\)/);
  if (mdLink && mdLink[1]) return mdLink[1].trim();
  return trimmed.split(/\s+/)[0] || '';
}

function splitReviewLogSections(
  content: string,
  headerRegex: RegExp
): string[] {
  const normalizedHeaderRegex = new RegExp(
    headerRegex.source,
    headerRegex.flags
  );
  const matches = [...content.matchAll(normalizedHeaderRegex)];
  if (matches.length === 0) return [];

  const sections: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0;
    const end =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? content.length)
        : content.length;
    sections.push(content.slice(start, end));
  }
  return sections;
}

function collectStructuredReviewEntries(
  section: string,
  keys: string[]
): string[] {
  const lines = section.split('\n');
  const escaped = keys.map((key) => escapeRegExp(key));
  const fieldRegex = new RegExp(
    `^\\s*-\\s*\\*\\*(?:${escaped.join('|')})\\*\\*\\s*:\\s*(.*)$`,
    'i'
  );
  const entries: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(fieldRegex);
    if (!match) continue;

    const inlineValue = (match[1] || '').trim();
    if (inlineValue) entries.push(inlineValue);

    let cursor = i + 1;
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (/^\s*-\s*\*\*.+\*\*\s*:/.test(line)) break;
      if (/^\s*##\s+/.test(line)) break;

      const nestedBullet = line.match(/^\s{2,}-\s+(.+)\s*$/);
      if (nestedBullet && nestedBullet[1]) {
        entries.push(nestedBullet[1].trim());
      }
      cursor += 1;
    }
    break;
  }

  return entries.filter((entry) => entry.length > 0);
}

function isReviewDraftPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(?:-|#)?\s*(?:tbd|todo|pending|fill(?:\s+in)?|template|example|미정|작성|기입|n\/a|na)\b/i.test(
    trimmed
  );
}

function hasValidReviewLogEntries(entries: string[]): boolean {
  return entries
    .map((entry) => entry.trim())
    .some(
      (entry) =>
        entry.length > 0 &&
        !isReviewDraftPlaceholder(entry) &&
        !isPlaceholderReviewEvidence(entry)
    );
}

function hasReviewLogQuality(
  content: string,
  headerRegex: RegExp,
  summaryKeys: string[],
  decisionKeys: string[]
): boolean {
  const sections = splitReviewLogSections(content, headerRegex);
  for (const section of sections) {
    const summaryEntries = collectStructuredReviewEntries(section, summaryKeys);
    if (!hasValidReviewLogEntries(summaryEntries)) continue;
    const decisionEntries = collectStructuredReviewEntries(
      section,
      decisionKeys
    );
    if (!hasValidReviewLogEntries(decisionEntries)) continue;

    return true;
  }
  return false;
}

function isExplicitZeroFindingsEntry(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  return (
    /^0+\s*findings?\b/.test(trimmed) ||
    /^no\s+findings?\b/.test(trimmed) ||
    /^findings?\s*[:：]\s*0+\b/.test(trimmed) ||
    /^지적\s*사항?\s*[:：]?\s*0+\b/.test(trimmed) ||
    /^지적\s*없음\b/.test(trimmed)
  );
}

function hasPrePrReviewLogQuality(content: string): boolean {
  const sections = splitReviewLogSections(content, PRE_PR_REVIEW_LOG_HEADER);
  for (const section of sections) {
    const summaryEntries = collectStructuredReviewEntries(section, [
      'Summary',
      '요약',
      'Note',
      '노트',
    ]);
    if (!hasValidReviewLogEntries(summaryEntries)) continue;

    const decisionEntries = collectStructuredReviewEntries(section, [
      'Decision',
      '결정',
    ]);
    if (!hasValidReviewLogEntries(decisionEntries)) continue;

    const findingsEntries = collectStructuredReviewEntries(section, [
      'Findings',
      '지적사항',
      '지적 사항',
    ]);
    const hasActionableFindings = findingsEntries
      .map((entry) => entry.trim())
      .some(
        (entry) =>
          entry.length > 0 &&
          !isReviewDraftPlaceholder(entry) &&
          !isPlaceholderReviewEvidence(entry) &&
          /\S+:\d+/.test(entry)
      );
    const hasExplicitZeroFindings = findingsEntries.some((entry) =>
      isExplicitZeroFindingsEntry(entry)
    );
    if (!hasActionableFindings && !hasExplicitZeroFindings) continue;

    const residualRiskEntries = collectStructuredReviewEntries(section, [
      'Residual Risks',
      'Residual Risk',
      '잔여 리스크',
      '잔여 위험',
    ]);
    if (!hasValidReviewLogEntries(residualRiskEntries)) continue;

    const testsRunEntries = collectStructuredReviewEntries(section, [
      'Tests Run',
      'Test Run',
      '실행 테스트',
      '테스트 실행',
    ]);
    if (!hasValidReviewLogEntries(testsRunEntries)) continue;

    return true;
  }
  return false;
}

const PRE_PR_REVIEW_LOG_HEADER =
  /^##\s+(?:Pre-PR Review Log|PR 전 리뷰 로그)\b.*$/gim;
const PR_REVIEW_LOG_HEADER = /^##\s+(?:PR Review Log|PR 리뷰 로그)\b.*$/gim;

async function hasPrePrReviewLogEvidence(
  ctx: CliContext,
  candidatePath: string
): Promise<boolean> {
  try {
    const content = await ctx.fs.readFile(candidatePath, 'utf-8');
    return hasPrePrReviewLogQuality(content);
  } catch {
    return false;
  }
}

async function hasPrReviewLogEvidence(
  ctx: CliContext,
  candidatePath: string
): Promise<boolean> {
  try {
    const content = await ctx.fs.readFile(candidatePath, 'utf-8');
    return hasReviewLogQuality(
      content,
      PR_REVIEW_LOG_HEADER,
      ['Summary', '요약', 'Note', '노트'],
      ['Decision', '결정']
    );
  } catch {
    return false;
  }
}

function resolveLocalEvidencePathCandidates(
  rawValue: string | undefined,
  context: { featurePath: string; docsDir: string }
): string[] {
  if (!rawValue) return [];
  const evidencePath = resolveEvidencePathValue(rawValue);
  if (!evidencePath) return [];
  if (/^https?:\/\//i.test(evidencePath)) return [];

  const candidates = new Set<string>();
  if (path.isAbsolute(evidencePath)) {
    candidates.add(path.resolve(evidencePath));
  } else {
    candidates.add(path.resolve(context.featurePath, evidencePath));
    candidates.add(path.resolve(context.docsDir, evidencePath));
    candidates.add(path.resolve(path.dirname(context.docsDir), evidencePath));
  }
  return [...candidates];
}

async function resolveExistingEvidencePath(
  ctx: CliContext,
  rawValue: string | undefined,
  context: { featurePath: string; docsDir: string }
): Promise<string | undefined> {
  const candidates = resolveLocalEvidencePathCandidates(rawValue, context);
  for (const candidate of candidates) {
    if (await ctx.fs.pathExists(candidate)) return candidate;
  }
  return undefined;
}

async function isPrePrEvidenceProvided(
  ctx: CliContext,
  rawValue: string | undefined,
  policy: ReturnType<typeof resolvePrePrReviewPolicy>,
  context: {
    featurePath: string;
    docsDir: string;
  }
): Promise<boolean> {
  if (isPlaceholderReviewEvidence(rawValue)) return false;
  const existingEvidencePath = await resolveExistingEvidencePath(
    ctx,
    rawValue,
    context
  );

  if (policy.evidenceMode !== 'path_required') {
    if (!existingEvidencePath) return true;
    return hasPrePrReviewLogEvidence(ctx, existingEvidencePath);
  }
  if (!existingEvidencePath) return false;
  return hasPrePrReviewLogEvidence(ctx, existingEvidencePath);
}

async function isPrReviewEvidenceProvided(
  ctx: CliContext,
  rawValue: string | undefined,
  context: {
    featurePath: string;
    docsDir: string;
  }
): Promise<boolean> {
  if (isPlaceholderReviewEvidence(rawValue)) return false;
  if (hasStructuredReviewSummary(rawValue)) return true;
  const existingEvidencePath = await resolveExistingEvidencePath(
    ctx,
    rawValue,
    context
  );
  if (!existingEvidencePath) return false;
  return hasPrReviewLogEvidence(ctx, existingEvidencePath);
}

function parseIssueNumber(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/#?(\d+)/);
  return match ? match[1] : undefined;
}

function parsePrLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed === '#' || trimmed === '-') return undefined;
  // Common placeholders that shouldn't count as "PR exists"
  // e.g. "#TBD", "TBD", "TODO", "N/A", "미정", "없음"
  if (/^(?:#\s*)?(?:tbd|todo|n\/a|na|none|pending|미정|없음)$/i.test(trimmed)) {
    return undefined;
  }
  if (trimmed.includes('{') || trimmed.includes('}')) return undefined;
  return trimmed;
}

function normalizeGitPath(value: string): string {
  return value.split(path.sep).join('/');
}

function resolveProjectStatusPaths(
  projectGitCwd: string,
  docsDir: string
): string[] {
  const relativeDocsDir = path.relative(projectGitCwd, docsDir);
  if (!relativeDocsDir) return [];
  if (path.isAbsolute(relativeDocsDir)) return [];
  if (relativeDocsDir === '..' || relativeDocsDir.startsWith(`..${path.sep}`)) {
    return [];
  }

  const normalizedDocsDir = normalizeGitPath(relativeDocsDir).replace(
    /\/+$/,
    ''
  );
  if (!normalizedDocsDir) return [];
  return ['.', `:(exclude)${normalizedDocsDir}/**`];
}

function uniqueNormalizedPaths(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeGitPath(value)
      .replace(/^\.\/+/, '')
      .replace(/\/+$/, '');
    if (!normalized || normalized === '.' || normalized === '..') continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

const PROJECT_DIRTY_STATUS_CACHE = new Map<
  string,
  { hasUncommittedChanges: boolean; statusUnavailable: boolean }
>();

const COMPONENT_STATUS_PATH_CACHE = new Map<string, string[]>();
const PR_REMOTE_STATUS_CACHE = new Map<string, PrRemoteStatus | null>();
const FEATURE_WORKTREE_CACHE = new Map<string, string | null>();

export function resetContextParseCaches(): void {
  PROJECT_DIRTY_STATUS_CACHE.clear();
  COMPONENT_STATUS_PATH_CACHE.clear();
  PR_REMOTE_STATUS_CACHE.clear();
  FEATURE_WORKTREE_CACHE.clear();
}

function resolveFeatureWorktreePath(
  ctx: CliContext,
  projectGitCwd: string,
  issueNumber: string,
  slug: string,
  folderName: string
): { cwd: string; branch: string } | undefined {
  const expectedBranches = [
    `feat/${issueNumber}-${slug}`,
    `feat/${issueNumber}-${folderName}`,
  ];

  for (const branchName of expectedBranches) {
    const cacheKey = `${projectGitCwd}::${branchName}`;
    let foundPath = FEATURE_WORKTREE_CACHE.get(cacheKey);
    if (typeof foundPath === 'undefined') {
      foundPath =
        findWorktreePathForBranch(ctx, projectGitCwd, branchName) || null;
      FEATURE_WORKTREE_CACHE.set(cacheKey, foundPath);
    }
    if (!foundPath) continue;
    return {
      cwd: foundPath,
      branch: getCurrentBranch(ctx, foundPath) || branchName,
    };
  }
  return undefined;
}

function toUpperToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return normalized || undefined;
}

function parseCheckSignal(check: unknown): {
  failing: boolean;
  pending: boolean;
} {
  if (!check || typeof check !== 'object')
    return { failing: false, pending: false };
  const row = check as Record<string, unknown>;
  const tokens = new Set<string>();
  for (const key of ['conclusion', 'status', 'state']) {
    const token = toUpperToken(row[key]);
    if (token) tokens.add(token);
  }

  for (const token of tokens) {
    if (
      token === 'FAILURE' ||
      token === 'FAILED' ||
      token === 'ERROR' ||
      token === 'TIMED_OUT' ||
      token === 'CANCELLED' ||
      token === 'ACTION_REQUIRED' ||
      token === 'STARTUP_FAILURE'
    ) {
      return { failing: true, pending: false };
    }
  }

  for (const token of tokens) {
    if (
      token === 'PENDING' ||
      token === 'IN_PROGRESS' ||
      token === 'QUEUED' ||
      token === 'EXPECTED' ||
      token === 'WAITING' ||
      token === 'REQUESTED'
    ) {
      return { failing: false, pending: true };
    }
  }

  return { failing: false, pending: false };
}

function isMergeBlockedState(value: string | undefined): boolean {
  if (!value) return false;
  return (
    value === 'BLOCKED' ||
    value === 'DIRTY' ||
    value === 'BEHIND' ||
    value === 'DRAFT' ||
    value === 'HAS_HOOKS' ||
    value === 'UNKNOWN' ||
    value === 'UNSTABLE'
  );
}

function resolvePrRemoteStatus(
  ctx: CliContext,
  prRef: string,
  projectGitCwd: string
): PrRemoteStatus | null {
  const cacheKey = `${projectGitCwd}::${prRef}`;
  if (PR_REMOTE_STATUS_CACHE.has(cacheKey)) {
    return PR_REMOTE_STATUS_CACHE.get(cacheKey) || null;
  }

  try {
    const raw = ctx.cmd
      .execFileSync(
        'gh',
        [
          'pr',
          'view',
          prRef,
          '--json',
          'state,mergedAt,reviewDecision,mergeStateStatus,isDraft,statusCheckRollup',
        ],
        {
          cwd: projectGitCwd,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000,
          maxBuffer: 1024 * 1024,
        }
      )
      .toString()
      .trim();
    if (!raw) {
      PR_REMOTE_STATUS_CACHE.set(cacheKey, null);
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state = toUpperToken(parsed.state);
    const mergedAt =
      typeof parsed.mergedAt === 'string' && parsed.mergedAt.trim().length > 0
        ? parsed.mergedAt.trim()
        : undefined;
    const isMerged = state === 'MERGED' || !!mergedAt;
    const reviewDecision = toUpperToken(parsed.reviewDecision);
    const mergeStateStatus = toUpperToken(parsed.mergeStateStatus);
    const isDraft = parsed.isDraft === true;

    let failingChecks = 0;
    let pendingChecks = 0;
    const rollup = Array.isArray(parsed.statusCheckRollup)
      ? parsed.statusCheckRollup
      : [];
    for (const check of rollup) {
      const signal = parseCheckSignal(check);
      if (signal.failing) failingChecks++;
      else if (signal.pending) pendingChecks++;
    }

    const remote: PrRemoteStatus = {
      source: 'gh',
      available: true,
      state,
      mergedAt,
      isMerged,
      reviewDecision,
      mergeStateStatus,
      isDraft,
      hasBlockingReview:
        reviewDecision === 'CHANGES_REQUESTED' ||
        reviewDecision === 'REVIEW_REQUIRED',
      mergeBlocked:
        !isMerged && (isDraft || isMergeBlockedState(mergeStateStatus)),
      failingChecks,
      pendingChecks,
    };
    PR_REMOTE_STATUS_CACHE.set(cacheKey, remote);
    return remote;
  } catch {
    PR_REMOTE_STATUS_CACHE.set(cacheKey, null);
    return null;
  }
}

function resolveBranchDivergence(
  ctx: CliContext,
  projectGitCwd: string
): {
  hasUpstream: boolean;
  ahead: number;
  behind: number;
} {
  try {
    const raw = ctx.cmd
      .execFileSync(
        'git',
        ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
        {
          cwd: projectGitCwd,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      .toString()
      .trim();
    const match = raw.match(/^(\d+)\s+(\d+)$/);
    if (!match) {
      return { hasUpstream: false, ahead: 0, behind: 0 };
    }
    const ahead = Number(match[1]);
    const behind = Number(match[2]);
    if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
      return { hasUpstream: false, ahead: 0, behind: 0 };
    }
    return { hasUpstream: true, ahead, behind };
  } catch {
    return { hasUpstream: false, ahead: 0, behind: 0 };
  }
}

async function resolveComponentStatusPaths(
  ctx: CliContext,
  projectGitCwd: string,
  component: string,
  workflow?: ProjectConfig['workflow']
): Promise<string[]> {
  const configured = workflow?.componentPaths?.[component];
  const configuredCandidates = Array.isArray(configured)
    ? configured.map((value) => String(value).trim()).filter(Boolean)
    : [];

  const candidates =
    configuredCandidates.length > 0
      ? configuredCandidates
      : [
          component,
          `apps/${component}`,
          `packages/${component}`,
          `services/${component}`,
          `modules/${component}`,
        ];

  const normalizedCandidates = uniqueNormalizedPaths(
    candidates
      .map((candidate) => {
        if (!candidate) return '';
        if (!path.isAbsolute(candidate)) return candidate;
        const relative = path.relative(projectGitCwd, candidate);
        if (!relative) return '';
        if (relative === '..' || relative.startsWith(`..${path.sep}`))
          return '';
        return relative;
      })
      .filter(Boolean)
  );

  const cacheKey = JSON.stringify({
    projectGitCwd,
    component,
    normalizedCandidates,
  });
  const cached = COMPONENT_STATUS_PATH_CACHE.get(cacheKey);
  if (cached) return [...cached];

  const existing: string[] = [];
  for (const candidate of normalizedCandidates) {
    if (await ctx.fs.pathExists(path.join(projectGitCwd, candidate))) {
      existing.push(candidate);
    }
  }
  COMPONENT_STATUS_PATH_CACHE.set(cacheKey, [...existing]);
  return existing;
}

function parseTasks(content: string): {
  summary: FeatureState['tasks'];
  activeTask?: TaskRef;
  lastDoneTask?: TaskRef;
  nextTodoTask?: TaskRef;
} {
  const summary = { total: 0, todo: 0, doing: 0, done: 0 };
  let activeTask: TaskRef | undefined;
  let lastDoneTask: TaskRef | undefined;
  let nextTodoTask: TaskRef | undefined;

  const lines = content.split('\n');
  let inCodeBlock = false;
  for (const line of lines) {
    // Ignore fenced code blocks (templates/examples).
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(
      /^\s*-\s*\[([A-Z]+)\]((?:\[[^\]]+\])*)\s*(.+?)\s*$/
    );
    if (!match) continue;

    const status = match[1].toUpperCase();
    const title = match[3].trim();
    const taskIdMatch = title.match(/\b(T-[A-Za-z0-9-]+)\b/);
    const taskId = taskIdMatch ? taskIdMatch[1] : undefined;

    summary.total++;
    if (status === 'DONE') summary.done++;
    else if (status === 'DOING' || status === 'REVIEW') summary.doing++;
    else if (status === 'TODO') summary.todo++;

    if (!activeTask && (status === 'DOING' || status === 'REVIEW')) {
      activeTask = { id: taskId, status: status as TaskRef['status'], title };
    }
    if (status === 'DONE') {
      lastDoneTask = { id: taskId, status: 'DONE', title };
    }
    if (!nextTodoTask && status === 'TODO') {
      nextTodoTask = { id: taskId, status: 'TODO', title };
    }
  }

  return { summary, activeTask, lastDoneTask, nextTodoTask };
}

function parseCompletionChecklist(
  content: string
): CompletionChecklistSummary | undefined {
  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) =>
    /^\s*##\s+(완료 조건|Completion Criteria)\s*$/.test(line)
  );
  if (startIndex === -1) return undefined;

  let total = 0;
  let checked = 0;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*##\s+/.test(line)) break;

    const match = line.match(/^\s*-\s*\[([ xX])\]\s+/);
    if (!match) continue;
    total++;
    if (match[1].toLowerCase() === 'x') checked++;
  }

  return total > 0 ? { total, checked } : undefined;
}

function isCompletionChecklistDone(feature: {
  completionChecklist?: CompletionChecklistSummary;
}): boolean {
  return (
    !!feature.completionChecklist &&
    feature.completionChecklist.total > 0 &&
    feature.completionChecklist.checked === feature.completionChecklist.total
  );
}

function isPrMetadataConfigured(feature: {
  docs: { prFieldExists: boolean; prStatusFieldExists: boolean };
}): boolean {
  return feature.docs.prFieldExists && feature.docs.prStatusFieldExists;
}

function isPrePrReviewSatisfied(
  feature: {
    docs: {
      prePrReviewFieldExists: boolean;
      prePrEvidenceFieldExists: boolean;
      prePrDecisionFieldExists: boolean;
    };
    prePrReview: {
      status?: PrePrReviewStatus;
      evidenceProvided: boolean;
      decisionOutcome?: PrePrDecisionOutcome;
      decisionProvided: boolean;
    };
  },
  policy: ReturnType<typeof resolvePrePrReviewPolicy>
): boolean {
  if (!policy.enabled) return true;
  if (
    !feature.docs.prePrReviewFieldExists ||
    feature.prePrReview.status !== 'Done'
  ) {
    return false;
  }
  if (
    !feature.docs.prePrEvidenceFieldExists ||
    !feature.prePrReview.evidenceProvided
  ) {
    return false;
  }
  if (
    !feature.docs.prePrDecisionFieldExists ||
    !feature.prePrReview.decisionProvided
  ) {
    return false;
  }
  if (feature.prePrReview.decisionOutcome !== 'approve') {
    return false;
  }
  return true;
}

export async function parseFeature(
  ctx: CliContext,
  featurePath: string,
  type: RepoType,
  context: {
    projectBranch: string;
    docsBranch: string;
    docsGitCwd: string;
    projectGitCwd?: string;
    docsDir: string;
    projectBranchAvailable: boolean;
    docsPathIgnored?: boolean;
    docsHasUncommittedChanges?: boolean;
    docsEverCommitted?: boolean;
    docsGitUnavailable?: boolean;
    projectHasUncommittedChanges?: boolean;
    projectStatusUnavailable?: boolean;
  },
  options: {
    lang: Lang;
    stepDefinitions: StepDefinition[];
    approval?: ProjectConfig['approval'];
    workflow?: ProjectConfig['workflow'];
    projectType: 'single' | 'multi';
  }
): Promise<FeatureContext> {
  const lang = options.lang;
  const workflowPolicy = resolveWorkflowPolicy(options.workflow);
  const prePrReviewPolicy = resolvePrePrReviewPolicy(options.workflow);
  const folderName = path.basename(featurePath);
  const match = folderName.match(/^(F\d+)-(.+)$/);
  const id = match?.[1];
  const slug = match?.[2] || folderName;

  const specPath = path.join(featurePath, 'spec.md');
  const planPath = path.join(featurePath, 'plan.md');
  const tasksPath = path.join(featurePath, 'tasks.md');
  const issueDocPath = path.join(featurePath, 'issue.md');
  const prDocPath = path.join(featurePath, 'pr.md');

  let specStatus: DocStatus | undefined;
  let issueNumber: string | undefined;
  const specExists = await ctx.fs.pathExists(specPath);

  if (specExists) {
    const content = await ctx.fs.readFile(specPath, 'utf-8');
    const statusValue = extractFirstSpecValue(content, ['상태', 'Status']);
    specStatus = parseDocStatus(statusValue);

    const issueValue = extractFirstSpecValue(content, [
      '이슈 번호',
      'Issue Number',
      'Issue',
    ]);
    issueNumber = parseIssueNumber(issueValue);
  }

  let effectiveProjectGitCwd = context.projectGitCwd;
  let effectiveProjectBranch = context.projectBranch;
  let effectiveProjectBranchAvailable = context.projectBranchAvailable;

  if (effectiveProjectGitCwd && issueNumber) {
    const alreadyExpected = isExpectedFeatureBranch(
      effectiveProjectBranch,
      issueNumber,
      slug,
      folderName
    );
    if (!alreadyExpected) {
      const worktree = resolveFeatureWorktreePath(
        ctx,
        effectiveProjectGitCwd,
        issueNumber,
        slug,
        folderName
      );
      if (worktree) {
        effectiveProjectGitCwd = worktree.cwd;
        effectiveProjectBranch = worktree.branch;
        effectiveProjectBranchAvailable = true;
      }
    }
  }

  let planStatus: DocStatus | undefined;
  const planExists = await ctx.fs.pathExists(planPath);

  if (planExists) {
    const content = await ctx.fs.readFile(planPath, 'utf-8');
    const statusValue = extractFirstSpecValue(content, ['상태', 'Status']);
    planStatus = parseDocStatus(statusValue);
  }

  const tasksExists = await ctx.fs.pathExists(tasksPath);
  const tasksSummary = { total: 0, todo: 0, doing: 0, done: 0 };
  let activeTask: TaskRef | undefined;
  let lastDoneTask: TaskRef | undefined;
  let nextTodoTask: TaskRef | undefined;
  let tasksDocStatus: DocStatus | undefined;
  let tasksDocStatusFieldExists = false;
  let completionChecklist: CompletionChecklistSummary | undefined;
  let prePrReviewStatus: PrePrReviewStatus | undefined;
  let prePrEvidence: string | undefined;
  let prePrEvidenceProvided = false;
  let prePrDecision: string | undefined;
  let prePrDecisionOutcome: PrePrDecisionOutcome | undefined;
  let prePrDecisionProvided = false;
  let prReviewEvidence: string | undefined;
  let prReviewEvidenceProvided = false;
  let prReviewDecision: string | undefined;
  let prReviewDecisionProvided = false;
  let prLink: string | undefined;
  let prStatus: PrReviewStatus | undefined;
  let prRemote: PrRemoteStatus | undefined;
  let prFieldExists = false;
  let prStatusFieldExists = false;
  let issueDocStatus: WorkflowDocStatus | undefined;
  let issueDocStatusFieldExists = false;
  let issueDocIssueFieldExists = false;
  let prDocStatus: WorkflowDocStatus | undefined;
  let prDocStatusFieldExists = false;
  let prDocPrFieldExists = false;
  let prDocReviewStatusFieldExists = false;
  let prePrReviewFieldExists = false;
  let prePrEvidenceFieldExists = false;
  let prePrDecisionFieldExists = false;
  let prReviewEvidenceFieldExists = false;
  let prReviewDecisionFieldExists = false;

  if (tasksExists) {
    const content = await ctx.fs.readFile(tasksPath, 'utf-8');
    const {
      summary,
      activeTask: active,
      lastDoneTask: lastDone,
      nextTodoTask: nextTodo,
    } = parseTasks(content);
    tasksSummary.total = summary.total;
    tasksSummary.todo = summary.todo;
    tasksSummary.doing = summary.doing;
    tasksSummary.done = summary.done;
    activeTask = active;
    lastDoneTask = lastDone;
    nextTodoTask = nextTodo;
    completionChecklist = parseCompletionChecklist(content);

    const issueValue = extractFirstSpecValue(content, [
      '이슈 번호',
      'Issue Number',
      'Issue',
    ]);
    // tasks.md is the primary source of operational tracking metadata.
    issueNumber = parseIssueNumber(issueValue);

    const tasksDocStatusValue = extractFirstSpecValue(content, [
      '문서 상태',
      'Doc Status',
    ]);
    tasksDocStatusFieldExists = hasAnySpecKey(content, [
      '문서 상태',
      'Doc Status',
    ]);
    tasksDocStatus = parseDocStatus(tasksDocStatusValue);

    const prValue = extractFirstSpecValue(content, ['PR', 'Pull Request']);
    prFieldExists = hasAnySpecKey(content, ['PR', 'Pull Request']);
    prLink = parsePrLink(prValue);

    const prStatusValue = extractFirstSpecValue(content, [
      'PR 상태',
      'PR Status',
    ]);
    prStatusFieldExists = hasAnySpecKey(content, ['PR 상태', 'PR Status']);
    prStatus = parsePrReviewStatus(prStatusValue);

    const prePrReviewValue = extractFirstSpecValue(content, [
      'PR 전 리뷰',
      'Pre-PR Review',
    ]);
    prePrReviewFieldExists = hasAnySpecKey(content, [
      'PR 전 리뷰',
      'Pre-PR Review',
    ]);
    prePrReviewStatus = parsePrePrReviewStatus(prePrReviewValue);

    const prePrEvidenceValue = extractFirstSpecValue(content, [
      'PR 전 리뷰 Evidence',
      'Pre-PR Evidence',
    ]);
    prePrEvidenceFieldExists = hasAnySpecKey(content, [
      'PR 전 리뷰 Evidence',
      'Pre-PR Evidence',
    ]);
    prePrEvidence = prePrEvidenceValue?.trim();
    prePrEvidenceProvided = await isPrePrEvidenceProvided(
      ctx,
      prePrEvidenceValue,
      prePrReviewPolicy,
      { featurePath, docsDir: context.docsDir }
    );

    const prePrDecisionValue = extractFirstSpecValue(content, [
      'PR 전 리뷰 Decision',
      'Pre-PR Decision',
    ]);
    prePrDecisionFieldExists = hasAnySpecKey(content, [
      'PR 전 리뷰 Decision',
      'Pre-PR Decision',
    ]);
    prePrDecision = prePrDecisionValue?.trim();
    prePrDecisionOutcome = parsePrePrDecisionOutcome(prePrDecisionValue);
    prePrDecisionProvided =
      !isPlaceholderReviewEvidence(prePrDecisionValue) &&
      hasStructuredReviewDecision(prePrDecisionValue) &&
      !!prePrDecisionOutcome &&
      prePrReviewPolicy.decisionEnum.includes(prePrDecisionOutcome);

    const prReviewEvidenceValue = extractFirstSpecValue(content, [
      'PR 리뷰 Evidence',
      'PR Review Evidence',
    ]);
    prReviewEvidenceFieldExists = hasAnySpecKey(content, [
      'PR 리뷰 Evidence',
      'PR Review Evidence',
    ]);
    prReviewEvidence = prReviewEvidenceValue?.trim();
    prReviewEvidenceProvided = await isPrReviewEvidenceProvided(
      ctx,
      prReviewEvidenceValue,
      { featurePath, docsDir: context.docsDir }
    );

    const prReviewDecisionValue = extractFirstSpecValue(content, [
      'PR 리뷰 Decision',
      'PR Review Decision',
    ]);
    prReviewDecisionFieldExists = hasAnySpecKey(content, [
      'PR 리뷰 Decision',
      'PR Review Decision',
    ]);
    prReviewDecision = prReviewDecisionValue?.trim();
    prReviewDecisionProvided =
      !isPlaceholderReviewEvidence(prReviewDecisionValue) &&
      hasStructuredReviewDecision(prReviewDecisionValue);
  }

  // tasks.md is the primary source of issue metadata. Re-resolve feature worktree
  // after parsing tasks so branch detection reflects newly created worktrees
  // even when spec.md still has placeholder issue values.
  if (effectiveProjectGitCwd && issueNumber) {
    const alreadyExpected = isExpectedFeatureBranch(
      effectiveProjectBranch,
      issueNumber,
      slug,
      folderName
    );
    if (!alreadyExpected) {
      const worktree = resolveFeatureWorktreePath(
        ctx,
        effectiveProjectGitCwd,
        issueNumber,
        slug,
        folderName
      );
      if (worktree) {
        effectiveProjectGitCwd = worktree.cwd;
        effectiveProjectBranch = worktree.branch;
        effectiveProjectBranchAvailable = true;
      }
    }
  }

  const issueDocExists = await ctx.fs.pathExists(issueDocPath);
  if (issueDocExists) {
    const content = await ctx.fs.readFile(issueDocPath, 'utf-8');
    const issueDocStatusValue = extractFirstSpecValue(content, [
      '상태',
      'Status',
    ]);
    issueDocStatusFieldExists = hasAnySpecKey(content, ['상태', 'Status']);
    issueDocStatus = parseWorkflowDocStatus(issueDocStatusValue);

    issueDocIssueFieldExists = hasAnySpecKey(content, [
      '이슈 번호',
      'Issue Number',
      'Issue',
    ]);
  }

  const prDocExists = await ctx.fs.pathExists(prDocPath);
  if (prDocExists) {
    const content = await ctx.fs.readFile(prDocPath, 'utf-8');
    const prDocStatusValue = extractFirstSpecValue(content, ['상태', 'Status']);
    prDocStatusFieldExists = hasAnySpecKey(content, ['상태', 'Status']);
    prDocStatus = parseWorkflowDocStatus(prDocStatusValue);

    prDocPrFieldExists = hasAnySpecKey(content, ['PR', 'Pull Request']);

    prDocReviewStatusFieldExists = hasAnySpecKey(content, [
      'PR 상태',
      'PR Status',
    ]);
  }

  if (
    workflowPolicy.requireMerge &&
    prStatus === 'Review' &&
    prLink &&
    effectiveProjectGitCwd
  ) {
    prRemote =
      resolvePrRemoteStatus(ctx, prLink, effectiveProjectGitCwd) || undefined;
  }

  const warnings: string[] = [];
  if (effectiveProjectBranchAvailable === false) {
    warnings.push(tr(lang, 'warnings', 'projectBranchUnavailable'));
  }

  const onExpectedBranch = isExpectedFeatureBranch(
    effectiveProjectBranch,
    issueNumber,
    slug,
    folderName
  );

  const relativeFeaturePathFromDocs = path.relative(
    context.docsDir,
    featurePath
  );
  const normalizedFeaturePathFromDocs = normalizeGitPath(
    relativeFeaturePathFromDocs
  );
  const docsPathIgnored =
    typeof context.docsPathIgnored === 'boolean'
      ? context.docsPathIgnored
      : isGitPathIgnored(
          ctx,
          context.docsGitCwd,
          normalizedFeaturePathFromDocs
        );

  let docsHasUncommittedChanges =
    typeof context.docsHasUncommittedChanges === 'boolean'
      ? context.docsHasUncommittedChanges
      : false;
  let docsEverCommitted =
    typeof context.docsEverCommitted === 'boolean'
      ? context.docsEverCommitted
      : false;
  let docsGitUnavailable = !!context.docsGitUnavailable;

  if (typeof context.docsHasUncommittedChanges !== 'boolean') {
    const docsStatus = getGitStatusPorcelain(ctx, context.docsGitCwd, [
      normalizedFeaturePathFromDocs,
    ]);
    if (docsStatus === undefined) {
      docsGitUnavailable = true;
      docsHasUncommittedChanges = true;
    } else {
      docsHasUncommittedChanges = docsStatus.trim().length > 0;
    }
  }

  if (typeof context.docsEverCommitted !== 'boolean') {
    const docsLastCommit = getLastCommitForPath(
      ctx,
      context.docsGitCwd,
      normalizedFeaturePathFromDocs
    );
    docsEverCommitted = !!docsLastCommit;
  }

  let projectHasUncommittedChanges =
    typeof context.projectHasUncommittedChanges === 'boolean'
      ? context.projectHasUncommittedChanges
      : false;
  let projectStatusUnavailable = !!context.projectStatusUnavailable;
  let projectHasUpstream = false;
  let projectBranchAhead = 0;
  let projectBranchBehind = 0;

  if (
    typeof context.projectHasUncommittedChanges !== 'boolean' &&
    effectiveProjectGitCwd
  ) {
    const dirtyScopePolicy = resolveCodeDirtyScopePolicy(
      options.workflow,
      options.projectType
    );
    const projectCacheKey = JSON.stringify({
      projectGitCwd: effectiveProjectGitCwd,
      docsDir: context.docsDir,
      type,
      dirtyScopePolicy,
      componentPaths: options.workflow?.componentPaths?.[type] || [],
    });
    const cachedStatus = PROJECT_DIRTY_STATUS_CACHE.get(projectCacheKey);
    if (cachedStatus) {
      projectHasUncommittedChanges = cachedStatus.hasUncommittedChanges;
      projectStatusUnavailable = cachedStatus.statusUnavailable;
    } else {
      let projectStatusPaths: string[] = [];
      if (dirtyScopePolicy === 'component' && type !== 'single') {
        const componentStatusPaths = await resolveComponentStatusPaths(
          ctx,
          effectiveProjectGitCwd,
          type,
          options.workflow
        );
        projectStatusPaths =
          componentStatusPaths.length > 0
            ? componentStatusPaths
            : resolveProjectStatusPaths(
                effectiveProjectGitCwd,
                context.docsDir
              );
      } else {
        projectStatusPaths = resolveProjectStatusPaths(
          effectiveProjectGitCwd,
          context.docsDir
        );
      }
      const projectStatus = getGitStatusPorcelain(
        ctx,
        effectiveProjectGitCwd,
        projectStatusPaths
      );
      projectStatusUnavailable = projectStatus === undefined;
      projectHasUncommittedChanges =
        projectStatus === undefined ? false : projectStatus.trim().length > 0;
      PROJECT_DIRTY_STATUS_CACHE.set(projectCacheKey, {
        hasUncommittedChanges: projectHasUncommittedChanges,
        statusUnavailable: projectStatusUnavailable,
      });
    }
  }

  if (effectiveProjectGitCwd) {
    const divergence = resolveBranchDivergence(ctx, effectiveProjectGitCwd);
    projectHasUpstream = divergence.hasUpstream;
    projectBranchAhead = divergence.ahead;
    projectBranchBehind = divergence.behind;
  }

  if (docsGitUnavailable) {
    warnings.push(tr(lang, 'warnings', 'docsGitUnavailable'));
  }
  if (docsPathIgnored === true) {
    warnings.push(
      tr(lang, 'warnings', 'docsPathIgnored', {
        path: normalizedFeaturePathFromDocs,
      })
    );
  }
  if (
    tasksExists &&
    workflowPolicy.requirePr &&
    !prDocExists &&
    (!prFieldExists || !prStatusFieldExists)
  ) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrFields'));
  }
  if (tasksExists && prePrReviewPolicy.enabled && !prePrReviewFieldExists) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrePrReviewField'));
  }
  if (tasksExists && prePrReviewPolicy.enabled && !prePrEvidenceFieldExists) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrePrEvidenceField'));
  }
  if (tasksExists && prePrReviewPolicy.enabled && !prePrDecisionFieldExists) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrePrDecisionField'));
  }
  if (
    tasksExists &&
    workflowPolicy.requireReview &&
    !prReviewEvidenceFieldExists
  ) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrReviewEvidenceField'));
  }
  if (
    tasksExists &&
    workflowPolicy.requireReview &&
    !prReviewDecisionFieldExists
  ) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrReviewDecisionField'));
  }
  if (tasksExists && !tasksDocStatusFieldExists) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksDocStatusField'));
  }

  if (docsEverCommitted && docsHasUncommittedChanges) {
    warnings.push(tr(lang, 'warnings', 'docsUncommittedChanges'));
  }
  if (projectHasUncommittedChanges) {
    warnings.push(tr(lang, 'warnings', 'projectUncommittedChanges'));
  }
  if (prRemote?.hasBlockingReview) {
    warnings.push(tr(lang, 'warnings', 'workflowPrRemoteChangesRequested'));
  }
  if ((prRemote?.failingChecks || 0) > 0) {
    warnings.push(
      tr(lang, 'warnings', 'workflowPrRemoteChecksFailing', {
        count: prRemote?.failingChecks || 0,
      })
    );
  }
  if ((prRemote?.pendingChecks || 0) > 0) {
    warnings.push(
      tr(lang, 'warnings', 'workflowPrRemoteChecksPending', {
        count: prRemote?.pendingChecks || 0,
      })
    );
  }

  const tasksDocApproved =
    !tasksDocStatusFieldExists || tasksDocStatus === 'Approved';
  const implementationDone =
    tasksExists &&
    tasksSummary.total > 0 &&
    tasksSummary.total === tasksSummary.done &&
    isCompletionChecklistDone({ completionChecklist }) &&
    tasksDocApproved;

  const workflowDone =
    implementationDone &&
    !docsHasUncommittedChanges &&
    !projectHasUncommittedChanges &&
    specStatus === 'Approved' &&
    planStatus === 'Approved' &&
    (!workflowPolicy.requireIssue || !!issueNumber) &&
    (!workflowPolicy.requirePr ||
      (isPrMetadataConfigured({
        docs: { prFieldExists, prStatusFieldExists },
      }) &&
        !!prLink)) &&
    (!workflowPolicy.requireMerge || prStatus === 'Approved') &&
    isPrePrReviewSatisfied(
      {
        docs: {
          prePrReviewFieldExists,
          prePrEvidenceFieldExists,
          prePrDecisionFieldExists,
        },
        prePrReview: {
          status: prePrReviewStatus,
          evidenceProvided: prePrEvidenceProvided,
          decisionOutcome: prePrDecisionOutcome,
          decisionProvided: prePrDecisionProvided,
        },
      },
      prePrReviewPolicy
    );

  if (implementationDone && !workflowDone) {
    if (specStatus !== 'Approved') {
      warnings.push(tr(lang, 'warnings', 'workflowSpecNotApproved'));
    }
    if (planStatus !== 'Approved') {
      warnings.push(tr(lang, 'warnings', 'workflowPlanNotApproved'));
    }

    if (workflowPolicy.requireIssue && !issueNumber) {
      warnings.push(tr(lang, 'warnings', 'workflowIssueMissing'));
    }
    if (projectHasUncommittedChanges) {
      warnings.push(tr(lang, 'warnings', 'workflowProjectUncommittedChanges'));
    }

    // PR 필드가 없다면 legacyTasksPrFields가 이미 경고로 올라감
    if (workflowPolicy.requirePr && prFieldExists && prStatusFieldExists) {
      if (!prLink) warnings.push(tr(lang, 'warnings', 'workflowPrLinkMissing'));
      if (workflowPolicy.requireMerge) {
        if (!prStatus)
          warnings.push(tr(lang, 'warnings', 'workflowPrStatusMissing'));
        if (prStatus && prStatus !== 'Approved') {
          warnings.push(tr(lang, 'warnings', 'workflowPrStatusNotApproved'));
          if (workflowPolicy.requireReview && prStatus === 'Review') {
            if (!prReviewEvidenceFieldExists || !prReviewEvidenceProvided) {
              warnings.push(
                tr(lang, 'warnings', 'workflowPrReviewEvidenceMissing')
              );
            }
            if (!prReviewDecisionFieldExists || !prReviewDecisionProvided) {
              warnings.push(
                tr(lang, 'warnings', 'workflowPrReviewDecisionMissing')
              );
            }
          }
        }
      }
    }
    if (prePrReviewPolicy.enabled) {
      if (!prePrReviewFieldExists) {
        warnings.push(tr(lang, 'warnings', 'workflowPrePrReviewMissing'));
      } else if (prePrReviewStatus !== 'Done') {
        warnings.push(tr(lang, 'warnings', 'workflowPrePrReviewNotDone'));
      } else if (!prePrEvidenceFieldExists || !prePrEvidenceProvided) {
        warnings.push(tr(lang, 'warnings', 'workflowPrePrEvidenceMissing'));
      } else if (!prePrDecisionFieldExists || !prePrDecisionProvided) {
        warnings.push(tr(lang, 'warnings', 'workflowPrePrDecisionMissing'));
      } else if (prePrDecisionOutcome !== 'approve') {
        warnings.push(
          tr(lang, 'warnings', 'workflowPrePrDecisionNotApproved', {
            outcome: prePrDecisionOutcome || '-',
          })
        );
      }
    }
  }

  const featureState: FeatureState = {
    id,
    slug,
    folderName,
    type,
    path: featurePath,
    completion: {
      implementationDone,
      workflowDone,
    },
    issueNumber,
    specStatus,
    planStatus,
    tasksDocStatus,
    tasks: tasksSummary,
    activeTask,
    lastDoneTask,
    nextTodoTask,
    completionChecklist,
    prePrReview: {
      status: prePrReviewStatus,
      evidence: prePrEvidence,
      evidenceProvided: prePrEvidenceProvided,
      decision: prePrDecision,
      decisionOutcome: prePrDecisionOutcome,
      decisionProvided: prePrDecisionProvided,
    },
    prReview: {
      evidence: prReviewEvidence,
      evidenceProvided: prReviewEvidenceProvided,
      decision: prReviewDecision,
      decisionProvided: prReviewDecisionProvided,
    },
    pr: { link: prLink, status: prStatus, remote: prRemote },
    git: {
      docsBranch: context.docsBranch,
      projectBranch: effectiveProjectBranch,
      projectBranchAvailable: effectiveProjectBranchAvailable,
      docsGitCwd: context.docsGitCwd,
      projectGitCwd: effectiveProjectGitCwd,
      onExpectedBranch,
      docsEverCommitted,
      docsHasUncommittedChanges,
      projectHasUncommittedChanges,
      docsPathIgnored: docsPathIgnored === true,
      projectHasUpstream,
      projectBranchAhead,
      projectBranchBehind,
    },
    docs: {
      featurePathFromDocs: relativeFeaturePathFromDocs,
      specExists,
      planExists,
      tasksExists,
      issueDocExists,
      issueDocStatus,
      issueDocStatusFieldExists,
      issueDocIssueFieldExists,
      prDocExists,
      prDocStatus,
      prDocStatusFieldExists,
      prDocPrFieldExists,
      prDocReviewStatusFieldExists,
      tasksDocStatusFieldExists,
      prFieldExists,
      prStatusFieldExists,
      prePrReviewFieldExists,
      prePrEvidenceFieldExists,
      prePrDecisionFieldExists,
      prReviewEvidenceFieldExists,
      prReviewDecisionFieldExists,
    },
  };

  const { currentStep, actions, nextAction } = resolveFeatureProgress(
    featureState,
    options.stepDefinitions,
    lang,
    options.approval
  );

  return { ...featureState, currentStep, actions, nextAction, warnings };
}

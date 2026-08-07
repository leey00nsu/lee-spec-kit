import fs from 'fs-extra';
import path from 'node:path';
import {
  createDefaultPrePrReviewerConfig,
  PRE_PR_REVIEW_REASONING_EFFORTS,
  type PrePrReviewerConfig,
  type ProjectConfig,
} from '../config/types.js';
import { LEGACY_APPROVAL_CATEGORY_STEPS } from '../config/legacy-approval.js';
import { createDefaultApprovalConfig, getConfig } from './config.js';
import {
  getFeatureDocPaths,
  resolveFeatureSelection,
  type FeatureSelectionState,
  type ResolvedFeature,
} from './feature-resolver.js';
import { runGitCapture } from './git-run.js';
import {
  buildManagedWorktreeEnvCopyCommand,
  buildManagedWorktreeStaleCleanupCommand,
  isRegisteredGitWorktree,
  resolveManagedWorktreePath,
  resolveStandaloneProjectRoots,
} from './standalone-workspace.js';
import {
  parseWorkflowDraftMetadata,
  type WorkflowDraftMetadata,
} from '../services/GithubWorkflowService.js';
import { runProcess } from '../commands/github/process.js';
import { isPrePrEvidenceSatisfied } from './pre-pr-evidence.js';
import {
  localCleanupComplete,
  resolveLocalCompletionStrategy,
  resolveLocalIntegrationContext,
} from './local-integration.js';

export type WorkflowStageId =
  | 'spec'
  | 'plan'
  | 'tasks'
  | 'issue'
  | 'branch'
  | 'implementation'
  | 'task_commit'
  | 'implementation_approve'
  | 'local_merge'
  | 'local_verify'
  | 'local_cleanup'
  | 'pre_pr_review'
  | 'pr'
  | 'code_review'
  | 'merge'
  | 'cleanup'
  | 'done';

export interface WorkflowStageAction {
  category:
    | 'spec_write'
    | 'spec_approve'
    | 'plan_write'
    | 'plan_approve'
    | 'tasks_write'
    | 'tasks_approve'
    | 'issue_prepare'
    | 'issue_create'
    | 'branch_create'
    | 'task_execute'
    | 'task_commit'
    | 'implementation_approve'
    | 'local_merge'
    | 'local_verify'
    | 'local_cleanup'
    | 'pre_pr_review'
    | 'pr_prepare'
    | 'pr_create'
    | 'code_review'
    | 'pr_merge'
    | 'merge_cleanup';
  summary: string;
  approvalRequired: boolean;
  command: string | null;
  executor?: 'subagent';
  model?: string;
  reasoningEffort?: PrePrReviewerConfig['reasoningEffort'];
  onUnavailable?: PrePrReviewerConfig['onUnavailable'];
}

export type WorkflowReviewState =
  | 'waiting_review'
  | 'review_pending_latest_commit'
  | 'review_rate_limited'
  | 'changes_requested'
  | 'approved'
  | 'draft'
  | 'merged'
  | 'merge_blocked'
  | 'unknown';

export interface WorkflowStageOption {
  label: string;
  reply: string;
  category:
    | 'approve_continue'
    | 'request_changes'
    | 'remote_execute'
    | 'review_wait'
    | 'review_fix'
    | 'review_sync_approved'
    | 'pr_merge'
    | 'hold';
  summary: string;
  command: string | null;
}

export interface WorkflowStagePayload {
  status: 'ok' | 'error';
  reasonCode:
    | 'WORKFLOW_STAGE_RESOLVED'
    | 'CONFIG_NOT_FOUND'
    | 'NO_FEATURES'
    | 'FEATURE_SELECTION_REQUIRED';
  docsDir: string | null;
  featureRef: string | null;
  stage: WorkflowStageId | null;
  nextAction: WorkflowStageAction | null;
  approvalRequired: boolean;
  implementationAllowed: boolean;
  reviewState?: WorkflowReviewState;
  primaryActionLabel?: string | null;
  actionOptions?: WorkflowStageOption[];
  blockedReasonCode:
    | 'SPEC_NOT_APPROVED'
    | 'PLAN_NOT_APPROVED'
    | 'TASKS_NOT_READY'
    | 'ISSUE_NOT_CREATED'
    | 'BRANCH_NOT_READY'
    | 'TASK_COMMIT_REQUIRED'
    | 'IMPLEMENTATION_APPROVAL_REQUIRED'
    | 'LOCAL_MERGE_REQUIRED'
    | 'LOCAL_VERIFICATION_REQUIRED'
    | 'LOCAL_CLEANUP_REQUIRED'
    | 'PRE_PR_REVIEW_NOT_APPROVED'
    | 'PR_NOT_CREATED'
    | 'PR_REVIEW_NOT_APPROVED'
    | 'POST_MERGE_CLEANUP_REQUIRED'
    | null;
}

type WorkflowRequirements = {
  requireIssue: boolean;
  requireBranch: boolean;
  requireWorktree: boolean;
  requirePr: boolean;
  requireReview: boolean;
  requireMerge: boolean;
  prePrReviewEnabled: boolean;
};

type DocApprovalStatus = 'draft' | 'review' | 'approved' | null;
type SimpleTaskStatus = 'TODO' | 'DOING' | 'DONE' | 'REVIEW';

type ParsedTasks = {
  docStatus: DocApprovalStatus;
  issueNumber: number | null;
  branch: string | null;
  prLink: string | null;
  prStatus: 'review' | 'approved' | null;
  prePrReviewStatus: 'pending' | 'running' | 'done' | null;
  prePrEvidence: string | null;
  prePrDecision: string | null;
  prePrDecisionOutcome: 'approve' | 'changes_requested' | 'blocked' | null;
  tasks: Array<{
    raw: string;
    status: SimpleTaskStatus;
    title: string;
  }>;
  completion: {
    allTasksChecked: boolean;
    testsChecked: boolean;
    finalOutcomeChecked: boolean;
  };
};

type ParsedWorkflowDraft = WorkflowDraftMetadata & {
  issueRef: string | null;
  prRef: string | null;
  prStatus: 'review' | 'approved' | null;
};

type TaskCommitGatePolicy = 'off' | 'warn' | 'strict';

type TaskCommitGateCheck = {
  pass: boolean;
  reason?:
    | 'DONE_TRANSITIONS_COUNT'
    | 'NO_PROJECT_COMMIT'
    | 'PROJECT_LOG_UNAVAILABLE'
    | 'MISMATCH_LAST_DONE';
  doneTransitions?: number;
};

type PostMergeCleanupState = {
  complete: boolean;
  projectRootGitCwd: string;
  baseBranch: string;
  headBranch: string | null;
  worktreePath: string | null;
  hasOriginRemote: boolean;
  localBaseCheckedOut: boolean;
  baseSyncedWithOrigin: boolean;
  localFeatureBranchExists: boolean;
  remoteFeatureBranchExists: boolean;
  managedWorktreeExists: boolean;
};

type CodeRabbitReviewThreadsState = 'unknown' | 'none' | 'open' | 'resolved';

const DOC_STATUS_LABELS = ['Doc Status', '문서 상태'];
const ISSUE_LABELS = ['Issue', 'Issue Number', '이슈', '이슈 번호'];
const BRANCH_LABELS = ['Branch', '브랜치'];
const PR_LABELS = ['PR', 'Pull Request'];
const PR_STATUS_LABELS = ['PR Status', 'PR 상태'];
const PRE_PR_REVIEW_LABELS = ['Pre-PR Review', 'PR 전 리뷰'];
const PRE_PR_EVIDENCE_LABELS = ['Pre-PR Evidence', 'PR 전 리뷰 Evidence'];
const PRE_PR_DECISION_LABELS = ['Pre-PR Decision', 'PR 전 리뷰 Decision'];

function resolveWorkflowRequirements(config: ProjectConfig): WorkflowRequirements {
  const workflow = config.workflow || {};
  const hasCanonicalMode =
    workflow.mode === 'github' || workflow.mode === 'local';
  const workflowMode = hasCanonicalMode
    ? workflow.mode
    : workflow.preset === 'local'
      ? 'local'
      : 'github';
  const isLocalWorkflow = workflowMode === 'local';
  const legacyStrictRequiresWorktree =
    !hasCanonicalMode && workflow.preset === 'strict';
  return {
    requireIssue: workflow.requireIssue ?? !isLocalWorkflow,
    requireBranch: workflow.requireBranch ?? true,
    requireWorktree: config.docsRepo === 'standalone'
      ? true
      : workflow.requireWorktree ?? legacyStrictRequiresWorktree,
    requirePr: workflow.requirePr ?? !isLocalWorkflow,
    requireReview: workflow.requireReview ?? !isLocalWorkflow,
    requireMerge: workflow.requireMerge ?? !isLocalWorkflow,
    prePrReviewEnabled: workflow.prePrReview?.enabled ?? !isLocalWorkflow,
  };
}

function parseApprovalStatus(raw: string | undefined): DocApprovalStatus {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'draft') return 'draft';
  if (value === 'review') return 'review';
  if (value === 'approved') return 'approved';
  return null;
}

function extractFieldValue(
  content: string,
  labels: string | string[]
): string | null {
  for (const label of Array.isArray(labels) ? labels : [labels]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(
      new RegExp(`^\\s*-\\s*\\*\\*${escaped}\\*\\*:\\s*(.*?)\\s*$`, 'mi')
    );
    if (!match) continue;
    const value = match[1].trim();
    if (value) return value;
  }
  return null;
}

function parseMarkdownCheckbox(line: string): boolean | null {
  const match = line.match(/^\s*-\s*\[([ xX])\]\s+/);
  if (!match) return null;
  return match[1].toLowerCase() === 'x';
}

function withoutFencedCodeBlocks(content: string): string[] {
  const lines: string[] = [];
  let inFence = false;

  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) {
      lines.push(line);
    }
  }

  return lines;
}

function parseTasksDoc(content: string): ParsedTasks {
  const issueRaw = extractFieldValue(content, ISSUE_LABELS);
  const issueNumberMatch = issueRaw?.match(/^#(\d+)$/);
  const issueNumber = issueNumberMatch ? Number(issueNumberMatch[1]) : null;
  const branchRaw = extractFieldValue(content, BRANCH_LABELS);
  const prRaw = extractFieldValue(content, PR_LABELS);
  const prePrDecision = extractFieldValue(content, PRE_PR_DECISION_LABELS);
  const tasks: ParsedTasks['tasks'] = [];
  const nonCodeLines = withoutFencedCodeBlocks(content);

  for (const line of nonCodeLines) {
    const match = line.match(
      /^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\](?:\[[^\]]+\])*\s+(.+?)\s*$/i
    );
    if (!match) continue;
    tasks.push({
      raw: line,
      status: match[1].toUpperCase() as SimpleTaskStatus,
      title: match[2].trim(),
    });
  }

  const allTasksChecked = nonCodeLines
    .some(
      (line) =>
        /(All tasks are|모든 태스크가)/i.test(line) &&
        parseMarkdownCheckbox(line) === true
    );
  const testsChecked = nonCodeLines
    .some(
      (line) =>
        /(Tests executed and passing|테스트 실행 및 통과)/i.test(line) &&
        parseMarkdownCheckbox(line) === true
    );
  const finalOutcomeChecked = nonCodeLines
    .some(
      (line) =>
        /(Final outcome shared and any required user confirmation recorded|Final user approval|최종 결과를 공유했고, 필요한 사용자 확인을 문서화된 workflow checkpoint 기준으로 기록함)/i.test(
          line
        ) && parseMarkdownCheckbox(line) === true
    );

  const prStatus = (() => {
    const value = (extractFieldValue(content, PR_STATUS_LABELS) || '')
      .trim()
      .toLowerCase();
    if (value === 'review') return 'review';
    if (value === 'approved') return 'approved';
    return null;
  })();

  const prePrReviewStatus = (() => {
    const value = (extractFieldValue(content, PRE_PR_REVIEW_LABELS) || '')
      .trim()
      .toLowerCase();
    if (value === 'pending') return 'pending';
    if (value === 'running') return 'running';
    if (value === 'done') return 'done';
    return null;
  })();

  const prePrDecisionOutcome = (() => {
    const value = (prePrDecision || '').trim().toLowerCase();
    const match = value.match(/\b(approve|changes_requested|blocked)\b/);
    return (match?.[1] as ParsedTasks['prePrDecisionOutcome']) || null;
  })();

  return {
    docStatus: parseApprovalStatus(
      extractFieldValue(content, DOC_STATUS_LABELS) || undefined
    ),
    issueNumber,
    branch: sanitizeMetadataValue(branchRaw),
    prLink: sanitizeMetadataValue(prRaw),
    prStatus,
    prePrReviewStatus,
    prePrEvidence: sanitizeMetadataValue(
      extractFieldValue(content, PRE_PR_EVIDENCE_LABELS)
    ),
    prePrDecision: sanitizeMetadataValue(prePrDecision),
    prePrDecisionOutcome,
    tasks,
    completion: {
      allTasksChecked,
      testsChecked,
      finalOutcomeChecked,
    },
  };
}

function sanitizeMetadataValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^`(.+)`$/, '$1');
  if (!trimmed || trimmed === '-') return null;
  return trimmed;
}

function normalizeCommitTopicText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTaskTopic(value: string): string {
  return normalizeCommitTopicText(value).replace(/^T-[A-Za-z0-9-]+\s+/, '');
}

function normalizeCommitSubjectForGate(value: string): string {
  return normalizeCommitTopicText(value)
    .replace(/^[a-z]+(?:\([^)]*\))?!?:\s*/i, '')
    .toLowerCase();
}

function toTaskKey(rawTitle: string): string {
  const trimmed = normalizeCommitTopicText(rawTitle);
  if (!trimmed) return '';
  const idMatch = trimmed.match(/^(T-[A-Za-z0-9-]+)/i);
  if (idMatch) return idMatch[1].toUpperCase();
  return normalizeTaskTopic(trimmed).toLowerCase();
}

function normalizeGitRelativePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

function toRepoRelativePath(cwd: string, relativePathFromCwd: string): string {
  const prefix = (runGitCapture(['rev-parse', '--show-prefix'], cwd) || '')
    .trim()
    .replace(/\/+$/, '');
  if (!prefix) return normalizeGitRelativePath(relativePathFromCwd);
  return normalizeGitRelativePath(`${prefix}/${relativePathFromCwd}`);
}

function parseDoneTransitionsFromDiff(diff: string): number {
  const removedByTask = new Map<
    string,
    Set<'TODO' | 'DOING' | 'DONE' | 'REVIEW'>
  >();
  const addedByTask = new Map<
    string,
    Set<'TODO' | 'DOING' | 'DONE' | 'REVIEW'>
  >();

  const parseTaskDiffLine = (
    line: string
  ): { key: string; status: 'TODO' | 'DOING' | 'DONE' | 'REVIEW' } | null => {
    const match = line.match(
      /^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\](?:\[[^\]]+\])*\s+(.+?)\s*$/i
    );
    if (!match) return null;
    const key = toTaskKey(match[2]);
    if (!key) return null;
    return {
      key,
      status: match[1].toUpperCase() as 'TODO' | 'DOING' | 'DONE' | 'REVIEW',
    };
  };

  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;

    if (line.startsWith('-')) {
      const parsed = parseTaskDiffLine(line.slice(1));
      if (!parsed) continue;
      const existing = removedByTask.get(parsed.key) || new Set();
      existing.add(parsed.status);
      removedByTask.set(parsed.key, existing);
      continue;
    }

    if (line.startsWith('+')) {
      const parsed = parseTaskDiffLine(line.slice(1));
      if (!parsed) continue;
      const existing = addedByTask.get(parsed.key) || new Set();
      existing.add(parsed.status);
      addedByTask.set(parsed.key, existing);
    }
  }

  let doneTransitions = 0;
  for (const [taskKey, addedStatuses] of addedByTask.entries()) {
    if (!addedStatuses.has('DONE')) continue;
    const removedStatuses = removedByTask.get(taskKey);
    if (!removedStatuses) continue;
    if (
      removedStatuses.has('TODO') ||
      removedStatuses.has('DOING') ||
      removedStatuses.has('REVIEW')
    ) {
      doneTransitions += 1;
    }
  }

  return doneTransitions;
}

function parseDoneTaskTopicCounts(content: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of withoutFencedCodeBlocks(content)) {
    const match = line.match(
      /^\s*-\s*\[(DONE)\](?:\[[^\]]+\])*\s+(.+?)\s*$/i
    );
    if (!match) continue;
    const topic = normalizeTaskTopic(match[2] || '');
    if (!topic) continue;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return counts;
}

function countDoneTransitionsInLatestTasksCommit(
  feature: ResolvedFeature
): number | undefined {
  const docsGitCwd = feature.git.docsGitCwd;
  const tasksRelativePathFromDocs = normalizeGitRelativePath(
    path.join(feature.docs.featurePathFromDocs, 'tasks.md')
  );
  const latestTasksCommit = (
    runGitCapture(
      ['rev-list', '-n', '1', 'HEAD', '--', tasksRelativePathFromDocs],
      docsGitCwd
    ) || ''
  ).trim();
  if (!latestTasksCommit) return undefined;

  const repoTasksPath = toRepoRelativePath(docsGitCwd, tasksRelativePathFromDocs);
  const currentContent = runGitCapture(
    ['show', `${latestTasksCommit}:${repoTasksPath}`],
    docsGitCwd
  );
  if (currentContent === undefined) return undefined;
  const previousContent =
    runGitCapture(['show', `${latestTasksCommit}^:${repoTasksPath}`], docsGitCwd) || '';
  const currentDone = parseDoneTaskTopicCounts(currentContent);
  const previousDone = parseDoneTaskTopicCounts(previousContent);

  let doneTransitions = 0;
  for (const [topic, currentCount] of currentDone.entries()) {
    const previousCount = previousDone.get(topic) || 0;
    if (currentCount > previousCount) {
      doneTransitions += currentCount - previousCount;
    }
  }

  return doneTransitions;
}

function countPendingDoneTransitions(
  feature: ResolvedFeature
): number | undefined {
  const docsGitCwd = feature.git.docsGitCwd;
  const tasksRelativePath = normalizeGitRelativePath(
    path.join(feature.docs.featurePathFromDocs, 'tasks.md')
  );
  const diff =
    runGitCapture(
      ['diff', '--unified=0', '--no-color', 'HEAD', '--', tasksRelativePath],
      docsGitCwd
    ) || '';
  if (!diff.trim()) return 0;
  return parseDoneTransitionsFromDiff(diff);
}

function getLastDoneTask(tasks: ParsedTasks): ParsedTasks['tasks'][number] | null {
  for (let index = tasks.tasks.length - 1; index >= 0; index -= 1) {
    if (tasks.tasks[index].status === 'DONE') return tasks.tasks[index];
  }
  return null;
}

function hasOpenTask(tasks: ParsedTasks): boolean {
  return tasks.tasks.some(
    (task) => task.status === 'DOING' || task.status === 'REVIEW'
  );
}

function hasUncommittedChanges(gitCwd: string | null | undefined): boolean {
  if (!gitCwd) return false;
  const status =
    runGitCapture(
      ['status', '--porcelain', '--untracked-files=no'],
      gitCwd
    ) || '';
  return status.trim().length > 0;
}

function resolveTaskCommitGatePolicy(config: ProjectConfig): TaskCommitGatePolicy {
  const raw = config.workflow?.taskCommitGate;
  return raw === 'off' || raw === 'strict' ? raw : 'warn';
}

function checkTaskCommitGate(
  feature: ResolvedFeature,
  effectiveProjectGitCwd: string,
  lastDoneTask: ParsedTasks['tasks'][number] | null
): TaskCommitGateCheck {
  const doneTransitions = countDoneTransitionsInLatestTasksCommit(feature);
  if (doneTransitions === 0) {
    return { pass: true, doneTransitions };
  }
  if (typeof doneTransitions === 'number' && doneTransitions > 1) {
    return {
      pass: false,
      reason: 'DONE_TRANSITIONS_COUNT',
      doneTransitions,
    };
  }

  const lastDoneTopic = normalizeTaskTopic(lastDoneTask?.title || '');
  if (!effectiveProjectGitCwd || !lastDoneTopic) {
    return { pass: true };
  }

  const args = ['log', '-n', '1', '--pretty=%s', '--', '.'];
  const relativeDocsDir = path.relative(
    effectiveProjectGitCwd,
    feature.git.docsGitCwd
  );
  const normalizedDocsDir = normalizeGitRelativePath(relativeDocsDir);
  if (
    normalizedDocsDir &&
    normalizedDocsDir !== '.' &&
    normalizedDocsDir !== '..' &&
    !normalizedDocsDir.startsWith('../')
  ) {
    args.push(`:(exclude)${normalizedDocsDir}/**`);
  }

  const latestProjectSubject = runGitCapture(args, effectiveProjectGitCwd);
  if (latestProjectSubject === undefined) {
    return { pass: false, reason: 'PROJECT_LOG_UNAVAILABLE' };
  }
  const normalizedSubject = normalizeCommitSubjectForGate(latestProjectSubject);
  if (!normalizedSubject) {
    return { pass: false, reason: 'NO_PROJECT_COMMIT' };
  }

  if (!normalizedSubject.includes(normalizeTaskTopic(lastDoneTopic).toLowerCase())) {
    return { pass: false, reason: 'MISMATCH_LAST_DONE' };
  }

  return { pass: true };
}

function describeTaskCommitGateFailure(
  check: TaskCommitGateCheck
): string {
  switch (check.reason) {
    case 'DONE_TRANSITIONS_COUNT':
      return `latest tasks.md commit includes ${check.doneTransitions || 0} DONE transitions`;
    case 'NO_PROJECT_COMMIT':
      return 'no recent project code commit was found for the just-finished task';
    case 'PROJECT_LOG_UNAVAILABLE':
      return 'the latest project commit subject could not be inspected';
    case 'MISMATCH_LAST_DONE':
    default:
      return 'the latest project commit subject does not match the just-finished task';
  }
}

function resolveProjectCommitTopic(
  feature: ResolvedFeature,
  tasks: ParsedTasks
): string {
  const activeTask = tasks.tasks.find(
    (task) => task.status === 'DOING' || task.status === 'REVIEW'
  );
  const raw =
    activeTask?.title ||
    getLastDoneTask(tasks)?.title ||
    nextTodoTask(tasks)?.title ||
    feature.folderName;
  const withoutTaskId = normalizeCommitTopicText(raw || '').replace(
    /^T-[A-Za-z0-9-]+\s+/,
    ''
  );
  return withoutTaskId || feature.folderName;
}

function buildTaskCommitSummary(input: {
  feature: ResolvedFeature;
  tasks: ParsedTasks;
  effectiveProjectGitCwd: string;
  docsDirty: boolean;
  projectDirty: boolean;
  gateFailureReason?: string | null;
}): string {
  const { feature, tasks, effectiveProjectGitCwd, docsDirty, projectDirty, gateFailureReason } = input;
  const docsMessage = tasks.issueNumber
    ? `git -C "${feature.git.docsGitCwd}" add "${feature.docs.featurePathFromDocs}" && git -C "${feature.git.docsGitCwd}" commit -m "docs(#${tasks.issueNumber}): ${feature.folderName} 문서 업데이트"`
    : `git -C "${feature.git.docsGitCwd}" add "${feature.docs.featurePathFromDocs}" && git -C "${feature.git.docsGitCwd}" commit -m "docs: ${feature.folderName} 문서 업데이트"`;
  const projectMessage = tasks.issueNumber
    ? `Stage only the files touched by the just-finished task in "${effectiveProjectGitCwd}", then commit with: git -C "${effectiveProjectGitCwd}" commit -m "feat(#${tasks.issueNumber}): ${resolveProjectCommitTopic(feature, tasks)}"`
    : `Stage only the files touched by the just-finished task in "${effectiveProjectGitCwd}", then commit with: git -C "${effectiveProjectGitCwd}" commit -m "feat(${feature.folderName}): ${resolveProjectCommitTopic(feature, tasks)}"`;

  const lines = ['Finish the task-level commit checkpoint before continuing.'];
  if (gateFailureReason) {
    lines.push(`Current gate failure: ${gateFailureReason}`);
  }
  if (docsDirty) {
    lines.push(`Docs commit: ${docsMessage}`);
  }
  if (projectDirty) {
    lines.push(`Project commit: ${projectMessage}`);
  }
  if (!docsDirty && !projectDirty) {
    lines.push(`Re-check the last task commits. Docs commit should contain exactly one DONE transition, and the latest project commit should match "${normalizeTaskTopic(getLastDoneTask(tasks)?.title || '')}".`);
  }
  return lines.join('\n');
}

function parseWorkflowDraftMetadataExtended(content: string): ParsedWorkflowDraft {
  const metadata = parseWorkflowDraftMetadata(content);
  const prStatusRaw = extractFieldValue(content, PR_STATUS_LABELS);
  const normalizedPrStatus = (prStatusRaw || '').trim().toLowerCase();
  return {
    ...metadata,
    issueRef: sanitizeMetadataValue(extractFieldValue(content, ISSUE_LABELS)),
    prRef: sanitizeMetadataValue(extractFieldValue(content, PR_LABELS)),
    prStatus:
      normalizedPrStatus === 'review'
        ? 'review'
        : normalizedPrStatus === 'approved'
          ? 'approved'
          : null,
  };
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  if (!(await fs.pathExists(filePath))) return null;
  return fs.readFile(filePath, 'utf-8');
}

function buildFeatureRef(feature: ResolvedFeature): string {
  return feature.folderName;
}

function buildFeatureArgs(feature: ResolvedFeature): string {
  return feature.type && feature.type !== 'single'
    ? `${buildFeatureRef(feature)} --component ${feature.type}`
    : buildFeatureRef(feature);
}

function resolveExpectedBranch(feature: ResolvedFeature, tasks: ParsedTasks): string | null {
  if (tasks.branch) return tasks.branch;
  if (!tasks.issueNumber) return null;
  return `feat/${tasks.issueNumber}-${feature.slug}`;
}

function resolveProjectRootFromGitCwd(projectGitCwd: string): string {
  return runGitCapture(['rev-parse', '--show-toplevel'], projectGitCwd) || path.resolve(projectGitCwd);
}

function resolveProjectRootGitCwd(
  config: ProjectConfig,
  feature: ResolvedFeature
): string {
  if (config.docsRepo === 'standalone') {
    const roots = resolveStandaloneProjectRoots(
      config,
      feature.type === 'single' ? undefined : feature.type
    );
    if (roots.length > 0) {
      return roots[0];
    }
  }

  return resolveProjectRootFromGitCwd(feature.git.projectGitCwd);
}

function getExpectedWorktreePath(
  config: ProjectConfig,
  projectGitCwd: string,
  branchName: string
): string {
  const projectRoot = resolveProjectRootFromGitCwd(projectGitCwd);
  return resolveManagedWorktreePath(config, projectRoot, branchName);
}

async function resolveExistingExpectedWorktreePath(
  config: ProjectConfig,
  projectGitCwd: string,
  branchName: string
): Promise<string | null> {
  const projectRoot = resolveProjectRootFromGitCwd(projectGitCwd);
  const candidate = getExpectedWorktreePath(config, projectGitCwd, branchName);
  return (await fs.pathExists(candidate)) &&
    isRegisteredGitWorktree(projectRoot, candidate)
    ? candidate
    : null;
}

function buildManagedWorktreeCreateCommand(
  config: ProjectConfig,
  projectGitCwd: string,
  branchName: string
): string {
  const projectRoot = resolveProjectRootFromGitCwd(projectGitCwd);
  const worktreePath = getExpectedWorktreePath(config, projectGitCwd, branchName);
  const worktreeParent = path.dirname(worktreePath);
  const staleCleanupCommand = buildManagedWorktreeStaleCleanupCommand(
    projectRoot,
    worktreePath
  );
  const envCopyCommand = buildManagedWorktreeEnvCopyCommand(projectRoot, worktreePath);
  return `${staleCleanupCommand} && mkdir -p "${worktreeParent}" && (git -C "${projectRoot}" worktree add "${worktreePath}" "${branchName}" || git -C "${projectRoot}" worktree add -b "${branchName}" "${worktreePath}") && ${envCopyCommand}`;
}

function resolveRemotePrMergeMeta(
  prRef: string | null,
  projectGitCwd: string
): { headRefName: string | null; baseRefName: string | null } | null {
  if (!prRef) return null;
  const result = runProcess(
    'gh',
    ['pr', 'view', prRef, '--json', 'headRefName,baseRefName'],
    projectGitCwd
  );
  if (result.code !== 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(String(result.stdout || '{}')) as Record<string, unknown>;
    return {
      headRefName: sanitizeMetadataValue(String(parsed.headRefName || '')),
      baseRefName: sanitizeMetadataValue(String(parsed.baseRefName || '')),
    };
  } catch {
    return null;
  }
}

function localBranchExists(cwd: string, branchName: string | null): boolean {
  if (!branchName) return false;
  return runProcess(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
    cwd
  ).code === 0;
}

function remoteBranchExists(cwd: string, branchName: string | null): boolean {
  if (!branchName) return false;
  return runProcess(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branchName}`],
    cwd
  ).code === 0;
}

function resolvePostMergeCleanupState(
  config: ProjectConfig,
  feature: ResolvedFeature,
  tasks: ParsedTasks
): PostMergeCleanupState {
  const projectRootGitCwd = resolveProjectRootGitCwd(config, feature);
  const prMeta = resolveRemotePrMergeMeta(tasks.prLink, projectRootGitCwd);
  const baseBranch = (prMeta?.baseRefName || 'main').trim() || 'main';
  const headBranch = (
    prMeta?.headRefName ||
    resolveExpectedBranch(feature, tasks)
  )?.trim() || null;
  const hasOriginRemote = runProcess(
    'git',
    ['remote', 'get-url', 'origin'],
    projectRootGitCwd
  ).code === 0;
  if (hasOriginRemote) {
    runProcess('git', ['fetch', '--prune', 'origin'], projectRootGitCwd);
  }

  const currentBranch =
    runGitCapture(['branch', '--show-current'], projectRootGitCwd) ||
    runGitCapture(['rev-parse', '--abbrev-ref', 'HEAD'], projectRootGitCwd) ||
    '';
  const localBaseSha = runGitCapture(['rev-parse', baseBranch], projectRootGitCwd) || '';
  const remoteBaseSha =
    hasOriginRemote
      ? runGitCapture(['rev-parse', `origin/${baseBranch}`], projectRootGitCwd) || ''
      : '';
  const worktreePath =
    config.docsRepo === 'standalone' && headBranch
      ? resolveManagedWorktreePath(config, projectRootGitCwd, headBranch)
      : null;
  const managedWorktreeExists = !!worktreePath && fs.existsSync(worktreePath);
  const localFeatureBranchExists = localBranchExists(projectRootGitCwd, headBranch);
  const remoteFeatureBranchExists =
    hasOriginRemote && remoteBranchExists(projectRootGitCwd, headBranch);
  const localBaseCheckedOut = currentBranch === baseBranch;
  const baseSyncedWithOrigin =
    !hasOriginRemote ||
    (localBaseSha.length > 0 &&
      remoteBaseSha.length > 0 &&
      localBaseSha === remoteBaseSha);

  return {
    complete:
      localBaseCheckedOut &&
      baseSyncedWithOrigin &&
      !localFeatureBranchExists &&
      !remoteFeatureBranchExists &&
      !managedWorktreeExists,
    projectRootGitCwd,
    baseBranch,
    headBranch,
    worktreePath,
    hasOriginRemote,
    localBaseCheckedOut,
    baseSyncedWithOrigin,
    localFeatureBranchExists,
    remoteFeatureBranchExists,
    managedWorktreeExists,
  };
}

function buildPostMergeCleanupCommand(state: PostMergeCleanupState): string {
  const commandParts: string[] = [];
  if (state.hasOriginRemote) {
    commandParts.push(
      `git -C "${state.projectRootGitCwd}" fetch --prune origin`
    );
  }
  commandParts.push(
    `git -C "${state.projectRootGitCwd}" checkout "${state.baseBranch}"`
  );
  if (state.hasOriginRemote) {
    commandParts.push(
      `git -C "${state.projectRootGitCwd}" pull --ff-only origin "${state.baseBranch}"`
    );
  }
  if (state.worktreePath) {
    commandParts.push(
      `if [ -d "${state.worktreePath}" ]; then if git -C "${state.worktreePath}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then meaningful_changes=$(git -C "${state.worktreePath}" status --porcelain --untracked-files=normal 2>/dev/null || true); if [ -n "$meaningful_changes" ]; then printf '%s\\n' "Managed worktree has tracked or meaningful untracked changes; refusing cleanup: ${state.worktreePath}" >&2; exit 1; fi; git -C "${state.projectRootGitCwd}" worktree remove --force "${state.worktreePath}" || { git -C "${state.projectRootGitCwd}" worktree prune; rm -rf "${state.worktreePath}"; }; else leftover_meaningful=$(find "${state.worktreePath}" -mindepth 1 \\( -name ".next" -o -name "node_modules" -o -name "storybook-static" -o -name "dist" -o -name "build" -o -name "coverage" -o -name ".turbo" -o -name ".cache" \\) -prune -o -print -quit); if [ -n "$leftover_meaningful" ]; then printf '%s\\n' "Managed worktree leftover has files outside generated artifact directories; refusing cleanup: ${state.worktreePath}" >&2; exit 1; fi; git -C "${state.projectRootGitCwd}" worktree prune; rm -rf "${state.worktreePath}"; fi; fi`
    );
  }
  if (state.headBranch) {
    commandParts.push(
      `if git -C "${state.projectRootGitCwd}" show-ref --verify --quiet "refs/heads/${state.headBranch}"; then git -C "${state.projectRootGitCwd}" branch -D "${state.headBranch}"; fi`
    );
    if (state.hasOriginRemote) {
      commandParts.push(
        `if git -C "${state.projectRootGitCwd}" show-ref --verify --quiet "refs/remotes/origin/${state.headBranch}"; then HUSKY=0 git -C "${state.projectRootGitCwd}" push origin --delete "${state.headBranch}"; fi`
      );
      commandParts.push(
        `git -C "${state.projectRootGitCwd}" fetch --prune origin`
      );
    }
  }

  return commandParts.join(' && ');
}

function buildPostMergeCleanupSummary(state: PostMergeCleanupState): string {
  const remaining: string[] = [];
  if (!state.localBaseCheckedOut) {
    remaining.push(`check out ${state.baseBranch}`);
  }
  if (!state.baseSyncedWithOrigin) {
    remaining.push(`sync ${state.baseBranch} with origin/${state.baseBranch}`);
  }
  if (state.managedWorktreeExists) {
    remaining.push('remove the managed feature worktree');
  }
  if (state.localFeatureBranchExists) {
    remaining.push('delete the local feature branch');
  }
  if (state.remoteFeatureBranchExists) {
    remaining.push('delete the remote feature branch');
  }

  if (remaining.length === 0) {
    return 'Finish the post-merge cleanup before closing the feature.';
  }

  return `Finish the post-merge cleanup before closing the feature: ${remaining.join(', ')}.`;
}

function nextTodoTask(tasks: ParsedTasks): ParsedTasks['tasks'][number] | null {
  return tasks.tasks.find((task) => task.status === 'DOING') ||
    tasks.tasks.find((task) => task.status === 'TODO') ||
    null;
}

function allTasksDone(tasks: ParsedTasks): boolean {
  return tasks.tasks.length > 0 && tasks.tasks.every((task) => task.status === 'DONE');
}

function prePrSatisfied(
  config: ProjectConfig,
  feature: ResolvedFeature,
  tasks: ParsedTasks
): boolean {
  return (
    tasks.prePrReviewStatus === 'done' &&
    isPrePrEvidenceSatisfied({
      docsDir: config.docsDir,
      featureDir: feature.path,
      evidence: tasks.prePrEvidence,
      evidenceMode: config.workflow?.prePrReview?.evidenceMode,
    }) &&
    !!tasks.prePrDecision &&
    tasks.prePrDecisionOutcome === 'approve'
  );
}

function issueExistsRemotely(
  issueNumber: number | null,
  feature: ResolvedFeature
): boolean {
  if (!issueNumber) return false;
  const result = runProcess(
    'gh',
    ['issue', 'view', String(issueNumber), '--json', 'number'],
    feature.git.projectGitCwd
  );
  return result.code === 0;
}

function prExistsRemotely(prRef: string | null, feature: ResolvedFeature): boolean {
  if (!prRef) return false;
  const result = runProcess(
    'gh',
    ['pr', 'view', prRef, '--json', 'url'],
    feature.git.projectGitCwd
  );
  return result.code === 0;
}

function buildAction(
  category: WorkflowStageAction['category'],
  summary: string,
  approvalRequired: boolean,
  command: string | null = null,
  reviewer?: PrePrReviewerConfig
): WorkflowStageAction {
  return {
    category,
    summary,
    approvalRequired,
    command,
    ...(reviewer
      ? {
          executor: reviewer.type,
          model: reviewer.model,
          reasoningEffort: reviewer.reasoningEffort,
          onUnavailable: reviewer.onUnavailable,
        }
      : {}),
  };
}

function resolvePrePrReviewer(config: ProjectConfig): PrePrReviewerConfig {
  const defaults = createDefaultPrePrReviewerConfig();
  const configured = config.workflow?.prePrReview?.reviewer;
  const model =
    typeof configured?.model === 'string' && configured.model.trim()
      ? configured.model.trim()
      : defaults.model;
  const reasoningEffort = PRE_PR_REVIEW_REASONING_EFFORTS.includes(
    configured?.reasoningEffort as PrePrReviewerConfig['reasoningEffort']
  )
    ? (configured?.reasoningEffort as PrePrReviewerConfig['reasoningEffort'])
    : defaults.reasoningEffort;

  return {
    type: 'subagent',
    model,
    reasoningEffort,
    onUnavailable:
      configured?.onUnavailable === 'error' ? 'error' : defaults.onUnavailable,
  };
}

function buildStageOption(
  label: string,
  reply: string,
  category: WorkflowStageOption['category'],
  summary: string,
  command: string | null = null
): WorkflowStageOption {
  return {
    label,
    reply,
    category,
    summary,
    command,
  };
}

function normalizeApprovalToken(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function resolveActionApprovalRequired(
  config: ProjectConfig,
  category: WorkflowStageAction['category'],
  builtinRequiresUserCheck: boolean
): boolean {
  const approval =
    config.approval?.mode === 'builtin'
      ? createDefaultApprovalConfig()
      : config.approval ?? createDefaultApprovalConfig();
  const mode = approval.mode ?? 'category';

  if (mode === 'steps') {
    const requiredSteps = new Set(
      (approval.requireCheckSteps ?? [])
        .map((value) => (typeof value === 'number' ? value : Number(value)))
        .filter((value) => Number.isFinite(value))
    );
    const legacyStep = LEGACY_APPROVAL_CATEGORY_STEPS.find(
      ([legacyCategory]) => legacyCategory === category
    )?.[1];
    return typeof legacyStep === 'number'
      ? requiredSteps.has(legacyStep)
      : builtinRequiresUserCheck;
  }

  const requiredCategories = new Set(
    (approval.requireCheckCategories ?? [])
      .map((value) => normalizeApprovalToken(value))
      .filter(Boolean)
  );
  const skippedCategories = new Set(
    (approval.skipCheckCategories ?? [])
      .map((value) => normalizeApprovalToken(value))
      .filter(Boolean)
  );
  const defaultPolicy = approval.default ?? createDefaultApprovalConfig().default ?? 'skip';
  const normalizedCategory = normalizeApprovalToken(category);
  const explicitlyRequired =
    requiredCategories.has('*') || requiredCategories.has(normalizedCategory);

  if (explicitlyRequired) return true;
  if (
    skippedCategories.has('*') ||
    skippedCategories.has(normalizedCategory)
  ) {
    return false;
  }
  if (defaultPolicy === 'require') return true;
  if (defaultPolicy === 'skip') return false;
  return builtinRequiresUserCheck;
}

function resolveRemotePrReviewState(
  prRef: string | null,
  feature: ResolvedFeature
): WorkflowReviewState {
  if (!prRef) return 'unknown';
  const result = runProcess(
    'gh',
    [
      'pr',
      'view',
      prRef,
      '--json',
      'reviewDecision,state,mergedAt,mergeStateStatus,isDraft,headRefOid,latestReviews,comments,statusCheckRollup',
    ],
    feature.git.projectGitCwd
  );

  if (result.code !== 0) {
    return 'unknown';
  }

  try {
    const parsed = JSON.parse(String(result.stdout || '{}')) as Record<string, unknown>;
    const reviewDecision = String(parsed.reviewDecision || '')
      .trim()
      .toUpperCase();
    const state = String(parsed.state || '')
      .trim()
      .toUpperCase();
    const mergeStateStatus = String(parsed.mergeStateStatus || '')
      .trim()
      .toUpperCase();
    const isDraft = parsed.isDraft === true;
    const headRefOid = String(parsed.headRefOid || '').trim().toLowerCase();
    const mergedAt = typeof parsed.mergedAt === 'string'
      ? parsed.mergedAt.trim()
      : '';
    const codeRabbitThreadState = reviewDecision.length === 0
      ? resolveCodeRabbitReviewThreadsState(prRef, feature)
      : 'unknown';
    const codeRabbitCheckSucceeded = hasSuccessfulCodeRabbitStatusCheck(
      parsed.statusCheckRollup
    );

    if (state === 'MERGED' || mergedAt.length > 0) {
      return 'merged';
    }
    if (isDraft) {
      return 'draft';
    }
    if (reviewDecision === 'CHANGES_REQUESTED') {
      return 'changes_requested';
    }
    if (reviewDecision === 'APPROVED') {
      return mergeStateStatus === 'CLEAN' || mergeStateStatus === 'HAS_HOOKS'
        ? 'approved'
        : 'merge_blocked';
    }
    if (reviewDecision.length === 0 && codeRabbitThreadState === 'open') {
      return 'changes_requested';
    }
    if (reviewDecision.length === 0 && hasLatestHeadRateLimitSignal(parsed, headRefOid)) {
      return 'review_rate_limited';
    }
    if (
      reviewDecision.length === 0 &&
      hasStaleLatestCommitReviewSignal(parsed, headRefOid) &&
      !(codeRabbitThreadState === 'resolved' && codeRabbitCheckSucceeded)
    ) {
      return 'review_pending_latest_commit';
    }
    if (reviewDecision.length === 0 && hasCodeRabbitActionableReview(parsed.latestReviews)) {
      if (codeRabbitThreadState === 'resolved' && codeRabbitCheckSucceeded) {
        return mergeStateStatus === 'CLEAN' || mergeStateStatus === 'HAS_HOOKS'
          ? 'approved'
          : 'merge_blocked';
      }
      return 'changes_requested';
    }
    if (
      reviewDecision.length === 0 &&
      codeRabbitCheckSucceeded &&
      codeRabbitThreadState !== 'open' &&
      hasCodeRabbitNoActionableComment(parsed.comments)
    ) {
      return mergeStateStatus === 'CLEAN' || mergeStateStatus === 'HAS_HOOKS'
        ? 'approved'
        : 'merge_blocked';
    }
    if (
      reviewDecision.length === 0 &&
      codeRabbitThreadState === 'resolved' &&
      codeRabbitCheckSucceeded
    ) {
      return mergeStateStatus === 'CLEAN' || mergeStateStatus === 'HAS_HOOKS'
        ? 'approved'
        : 'merge_blocked';
    }
    if (reviewDecision === 'REVIEW_REQUIRED' || reviewDecision.length === 0) {
      return 'waiting_review';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolveCurrentReviewState(
  tasks: ParsedTasks,
  prDraft: ParsedWorkflowDraft,
  remoteReviewState: WorkflowReviewState
): WorkflowReviewState {
  if (remoteReviewState === 'merged') {
    return 'merged';
  }
  if (remoteReviewState === 'draft') {
    return 'draft';
  }
  if (remoteReviewState === 'merge_blocked') {
    return 'merge_blocked';
  }
  if (remoteReviewState === 'changes_requested') {
    return 'changes_requested';
  }
  if (remoteReviewState === 'review_rate_limited') {
    return 'review_rate_limited';
  }
  if (remoteReviewState === 'review_pending_latest_commit') {
    return 'review_pending_latest_commit';
  }
  if (remoteReviewState === 'waiting_review') {
    return 'waiting_review';
  }
  if (remoteReviewState === 'approved') {
    return 'approved';
  }
  if (remoteReviewState === 'unknown') {
    return 'unknown';
  }
  if (tasks.prStatus === 'approved' || prDraft.prStatus === 'approved') {
    return 'approved';
  }
  return 'unknown';
}

function buildCodeReviewActionOptions(
  reviewState: WorkflowReviewState,
  reviewSyncCommand: string | null = null
): WorkflowStageOption[] {
  if (reviewState === 'merged') {
    return [
      buildStageOption(
        'A',
        'A',
        'review_sync_approved',
        'Sync the already-merged PR state into tasks.md and pr.md before closing the feature.',
        reviewSyncCommand
      ),
      buildStageOption(
        'B',
        'B',
        'hold',
        'Stop here and leave the merged-state sync for later.'
      ),
    ];
  }

  if (reviewState === 'approved') {
    return [
      buildStageOption(
        'A',
        'A',
        'review_sync_approved',
        'Sync the approved PR review state into tasks.md and pr.md, then continue to the merge gate.',
        reviewSyncCommand
      ),
      buildStageOption(
        'B',
        'B',
        'hold',
        'Hold the merge boundary for now and leave the PR open.'
      ),
    ];
  }

  if (reviewState === 'draft' || reviewState === 'merge_blocked') {
    return [
      buildStageOption(
        'A',
        'A',
        'review_wait',
        'Inspect the current PR state, resolve the draft/merge blocker, and sync the review fields before proceeding.'
      ),
      buildStageOption(
        'B',
        'B',
        'hold',
        'Stop here and keep the PR open until the blocker is resolved.'
      ),
    ];
  }

  if (reviewState === 'changes_requested') {
    return [
      buildStageOption(
        'A',
        'A',
        'review_fix',
        'Address the requested review changes, update review evidence/decision, and continue the feature.'
      ),
      buildStageOption(
        'B',
        'B',
        'hold',
        'Stop here and wait before taking another review-fix pass.'
      ),
    ];
  }

  if (reviewState === 'review_rate_limited') {
    return [
      buildStageOption(
        'A',
        'A',
        'review_wait',
        'Re-check the PR review state after the CodeRabbit rate limit window resets, then sync tasks.md when a fresh review arrives.'
      ),
      buildStageOption(
        'B',
        'B',
        'hold',
        'Stop here and wait for the review rate limit window to clear.'
      ),
    ];
  }

  if (reviewState === 'review_pending_latest_commit') {
    return [
      buildStageOption(
        'A',
        'A',
        'review_wait',
        'Re-check the PR review state after a reviewer processes the latest commit, then sync tasks.md when fresh review feedback arrives.'
      ),
      buildStageOption(
        'B',
        'B',
        'hold',
        'Stop here and wait for a fresh review on the latest commit.'
      ),
    ];
  }

  return [
    buildStageOption(
      'A',
      'A',
      'review_wait',
      'Check the PR review state again and sync tasks.md when reviewer feedback or approval arrives.'
    ),
    buildStageOption(
      'B',
      'B',
      'hold',
      'Stop here and wait for external reviewer feedback.'
    ),
  ];
}

function buildMergeActionOptions(
  command: string
): WorkflowStageOption[] {
  return [
    buildStageOption(
      'A',
      'A OK',
      'pr_merge',
      'Merge the PR now and sync the merged state back into tasks.md.',
      command
    ),
    buildStageOption(
      'B',
      'B',
      'hold',
      'Keep the PR open and do not merge yet.'
    ),
  ];
}

function buildApprovalActionOptions(params: {
  approveSummary: string;
  holdSummary: string;
  remoteCommand?: string | null;
}): WorkflowStageOption[] {
  const remoteCommand = params.remoteCommand?.trim() || null;
  if (remoteCommand && remoteCommand.includes('--confirm OK')) {
    return [
      buildStageOption(
        'A',
        'A OK',
        'remote_execute',
        params.approveSummary,
        remoteCommand
      ),
      buildStageOption('B', 'B', 'hold', params.holdSummary),
    ];
  }

  return [
    buildStageOption('A', 'A', 'approve_continue', params.approveSummary),
    buildStageOption('B', 'B', 'request_changes', params.holdSummary),
  ];
}

function resolveFeatureSelectionError(
  selection: FeatureSelectionState
): WorkflowStagePayload {
  const reasonCode =
    selection.status === 'no_features'
      ? 'NO_FEATURES'
      : 'FEATURE_SELECTION_REQUIRED';
  return {
    status: 'error',
    reasonCode,
    docsDir: selection.config.docsDir,
    featureRef: null,
    stage: null,
    nextAction: null,
    approvalRequired: false,
    implementationAllowed: false,
    blockedReasonCode: null,
  };
}

export async function collectWorkflowStage(
  cwd: string,
  selector?: string,
  component?: string
): Promise<WorkflowStagePayload> {
  const config = await getConfig(cwd);
  if (!config) {
    return {
      status: 'error',
      reasonCode: 'CONFIG_NOT_FOUND',
      docsDir: null,
      featureRef: null,
      stage: null,
      nextAction: null,
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: null,
    };
  }

  const selection = await resolveFeatureSelection(cwd, selector, component);
  if (selection.status !== 'selected' || !selection.matchedFeature) {
    return resolveFeatureSelectionError(selection);
  }

  const feature = selection.matchedFeature;
  const requirements = resolveWorkflowRequirements(config);
  const taskCommitGatePolicy = resolveTaskCommitGatePolicy(config);
  const paths = getFeatureDocPaths(feature);
  const specContent = await readFileIfExists(path.join(config.docsDir, paths.specPath));
  const planContent = await readFileIfExists(path.join(config.docsDir, paths.planPath));
  const tasksContent = await readFileIfExists(path.join(config.docsDir, paths.tasksPath));
  const issueContent = await readFileIfExists(path.join(config.docsDir, paths.issuePath));
  const prContent = await readFileIfExists(path.join(config.docsDir, paths.prPath));

  const specStatus = parseApprovalStatus(
    extractFieldValue(specContent || '', ['Status', '상태']) || undefined
  );
  const planStatus = parseApprovalStatus(
    extractFieldValue(planContent || '', ['Status', '상태']) || undefined
  );
  const tasks = parseTasksDoc(tasksContent || '');
  const issueDraft = parseWorkflowDraftMetadataExtended(issueContent || '');
  const prDraft = parseWorkflowDraftMetadataExtended(prContent || '');
  const remoteReviewState = requirements.requireReview && tasks.prLink
    ? resolveRemotePrReviewState(tasks.prLink, feature)
    : 'unknown';
  const currentReviewState = resolveCurrentReviewState(
    tasks,
    prDraft,
    remoteReviewState
  );

  if (specStatus !== 'approved') {
    const isReviewStage = specStatus === 'review';
    const approvalRequired = isReviewStage
      ? resolveActionApprovalRequired(config, 'spec_approve', true)
      : false;
    const actionOptions = approvalRequired
      ? buildApprovalActionOptions({
          approveSummary: 'Approve spec.md and continue to the plan stage.',
          holdSummary: 'Request spec changes before continuing.',
        })
      : undefined;
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'spec',
      nextAction: buildAction(
        isReviewStage ? 'spec_approve' : 'spec_write',
        isReviewStage
          ? approvalRequired
            ? 'Get user approval and update spec.md status to Approved.'
            : 'Promote spec.md from Review to Approved and continue automatically.'
          : 'Write or refine spec.md until it is ready for approval.',
        approvalRequired
        ),
      approvalRequired,
      implementationAllowed: false,
      primaryActionLabel: actionOptions ? 'A' : undefined,
      actionOptions,
      blockedReasonCode: 'SPEC_NOT_APPROVED',
    };
  }

  if (planStatus !== 'approved') {
    const isReviewStage = planStatus === 'review';
    const approvalRequired = isReviewStage
      ? resolveActionApprovalRequired(config, 'plan_approve', true)
      : false;
    const actionOptions = approvalRequired
      ? buildApprovalActionOptions({
          approveSummary: 'Approve plan.md and continue to the tasks stage.',
          holdSummary: 'Request plan changes before continuing.',
        })
      : undefined;
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'plan',
      nextAction: buildAction(
        isReviewStage ? 'plan_approve' : 'plan_write',
        isReviewStage
          ? approvalRequired
            ? 'Get user approval and update plan.md status to Approved.'
            : 'Promote plan.md from Review to Approved and continue automatically.'
          : 'Write or refine plan.md until it is ready for approval.',
        approvalRequired
        ),
      approvalRequired,
      implementationAllowed: false,
      primaryActionLabel: actionOptions ? 'A' : undefined,
      actionOptions,
      blockedReasonCode: 'PLAN_NOT_APPROVED',
    };
  }

  if (tasks.tasks.length === 0 || tasks.docStatus !== 'approved') {
    const isReviewStage = tasks.docStatus === 'review';
    const approvalRequired = isReviewStage
      ? resolveActionApprovalRequired(config, 'tasks_approve', true)
      : false;
    const actionOptions = approvalRequired
      ? buildApprovalActionOptions({
          approveSummary: 'Approve tasks.md and continue to issue preparation.',
          holdSummary: 'Request task-list changes before continuing.',
        })
      : undefined;
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'tasks',
      nextAction: buildAction(
        isReviewStage ? 'tasks_approve' : 'tasks_write',
        isReviewStage
          ? approvalRequired
            ? 'Get user approval and update tasks.md Doc Status to Approved.'
            : 'Promote tasks.md Doc Status from Review to Approved and continue automatically.'
          : 'Add and refine tasks until tasks.md is execution-ready and Approved.',
        approvalRequired
        ),
      approvalRequired,
      implementationAllowed: false,
      primaryActionLabel: actionOptions ? 'A' : undefined,
      actionOptions,
      blockedReasonCode: 'TASKS_NOT_READY',
    };
  }

  if (requirements.requireIssue) {
    const issueReady = issueDraft.status === 'ready';
    const issueCreated =
      tasks.issueNumber !== null &&
      issueExistsRemotely(tasks.issueNumber, feature);
    if (!issueCreated || !issueReady) {
      const issueCreateApprovalRequired =
        issueReady && !issueCreated;
      const issueCreateCommand = `npx lee-spec-kit github issue ${buildFeatureArgs(feature)} --create --confirm OK`;
      const issueCreateOptions = issueCreateApprovalRequired
        ? buildApprovalActionOptions({
            approveSummary:
              'Create the GitHub issue now and sync the issue number back into tasks.md.',
            holdSummary:
              'Keep the issue in Ready state but do not create it yet.',
            remoteCommand: issueCreateCommand,
          })
        : undefined;
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'issue',
        nextAction: issueReady && !issueCreated
          ? buildAction(
              'issue_create',
              'Create the GitHub issue from issue.md and sync the issue number into tasks.md.',
              issueCreateApprovalRequired,
              issueCreateCommand
            )
          : buildAction(
              'issue_prepare',
              'Prepare issue.md and set its Status to Ready before issue creation.',
              false
            ),
        approvalRequired: issueCreateApprovalRequired,
        implementationAllowed: false,
        primaryActionLabel: issueCreateOptions ? 'A' : undefined,
        actionOptions: issueCreateOptions,
        blockedReasonCode: 'ISSUE_NOT_CREATED',
      };
    }
  }

  let effectiveProjectGitCwd = feature.git.projectGitCwd;
  if (requirements.requireWorktree) {
    const expectedBranch = resolveExpectedBranch(feature, tasks);
    if (expectedBranch) {
      const existingWorktreePath = await resolveExistingExpectedWorktreePath(
        config,
        feature.git.projectGitCwd,
        expectedBranch
      );
      if (existingWorktreePath) {
        effectiveProjectGitCwd = existingWorktreePath;
      }
    }
  }

  if (requirements.requireBranch && !allTasksDone(tasks)) {
    const expectedBranch = resolveExpectedBranch(feature, tasks);
    const currentBranch =
      runGitCapture(['branch', '--show-current'], effectiveProjectGitCwd) ||
      runGitCapture(['rev-parse', '--abbrev-ref', 'HEAD'], effectiveProjectGitCwd) ||
      null;
    if (expectedBranch && currentBranch !== expectedBranch) {
      const branchCommand = requirements.requireWorktree
        ? buildManagedWorktreeCreateCommand(config, feature.git.projectGitCwd, expectedBranch)
        : `git checkout -b ${expectedBranch}`;
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'branch',
        nextAction: buildAction(
          'branch_create',
          requirements.requireWorktree
            ? `Create or reuse the managed worktree for ${expectedBranch} before implementation starts.`
            : `Switch the project repo to ${expectedBranch} before implementation starts.`,
          false,
          branchCommand
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'BRANCH_NOT_READY',
      };
    }
  }

  const activeTaskOpen = hasOpenTask(tasks);
  const lastDoneTask = getLastDoneTask(tasks);
  const docsDirty = hasUncommittedChanges(feature.git.docsGitCwd);
  const projectDirty = hasUncommittedChanges(effectiveProjectGitCwd);
  const pendingDoneTransitions = countPendingDoneTransitions(feature) || 0;
  const taskCommitCheckpointRequired =
    !activeTaskOpen &&
    !!lastDoneTask &&
    (projectDirty || pendingDoneTransitions > 0);

  if (taskCommitCheckpointRequired) {
    const pendingReason =
      pendingDoneTransitions > 1
        ? `working tree currently contains ${pendingDoneTransitions} uncommitted DONE transitions`
        : null;
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'task_commit',
      nextAction: buildAction(
        'task_commit',
        buildTaskCommitSummary({
          feature,
          tasks,
          effectiveProjectGitCwd,
          docsDirty,
          projectDirty,
          gateFailureReason: pendingReason,
        }),
        false
      ),
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: 'TASK_COMMIT_REQUIRED',
    };
  }

  const committedTaskGate =
    taskCommitGatePolicy !== 'off' && lastDoneTask
      ? checkTaskCommitGate(feature, effectiveProjectGitCwd, lastDoneTask)
      : { pass: true };
  const committedTaskGateRequiresCheckpoint =
    taskCommitGatePolicy === 'strict' ||
    committedTaskGate.reason === 'DONE_TRANSITIONS_COUNT';

  if (!allTasksDone(tasks)) {
    const currentTask = nextTodoTask(tasks);
    if (committedTaskGateRequiresCheckpoint && !committedTaskGate.pass) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'task_commit',
        nextAction: buildAction(
          'task_commit',
          buildTaskCommitSummary({
            feature,
            tasks,
            effectiveProjectGitCwd,
            docsDirty,
            projectDirty,
            gateFailureReason: describeTaskCommitGateFailure(committedTaskGate),
          }),
          false
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'TASK_COMMIT_REQUIRED',
      };
    }

    const commitWarning =
      taskCommitGatePolicy === 'warn' && !committedTaskGate.pass
        ? `\nTask commit boundary warning: ${describeTaskCommitGateFailure(committedTaskGate)}`
        : '';
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'implementation',
      nextAction: buildAction(
        'task_execute',
        currentTask
          ? `Continue the next implementation task: ${currentTask.title}${commitWarning}`
          : 'Continue the active implementation task.',
        false
      ),
      approvalRequired: false,
      implementationAllowed: true,
      blockedReasonCode: null,
    };
  }

  if (
    !tasks.completion.allTasksChecked ||
    !tasks.completion.testsChecked ||
    !tasks.completion.finalOutcomeChecked
  ) {
    if (committedTaskGateRequiresCheckpoint && !committedTaskGate.pass) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'task_commit',
        nextAction: buildAction(
          'task_commit',
          buildTaskCommitSummary({
            feature,
            tasks,
            effectiveProjectGitCwd,
            docsDirty,
            projectDirty,
            gateFailureReason: describeTaskCommitGateFailure(committedTaskGate),
          }),
          false
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'TASK_COMMIT_REQUIRED',
      };
    }

    const approvalRequired = resolveActionApprovalRequired(
      config,
      'implementation_approve',
      true
    );
    const localIntegrationApproval =
      config.workflow?.mode === 'local' &&
      resolveLocalCompletionStrategy(config) !== 'none';
    const separateLocalMergeApproval =
      localIntegrationApproval &&
      resolveActionApprovalRequired(config, 'local_merge', false);
    const localBaseBranch = config.workflow?.baseBranch?.trim() || 'main';
    const localIntegrationLabel =
      resolveLocalCompletionStrategy(config) === 'local-squash'
        ? `squash integration into ${localBaseBranch}`
        : `fast-forward integration into ${localBaseBranch}`;
    const localCleanupSummary =
      config.workflow?.deleteFeatureBranchAfterMerge === false
        ? 'remove any managed Feature worktree'
        : 'remove any managed Feature worktree and delete the integrated local Feature branch';
    const actionOptions = approvalRequired
      ? buildApprovalActionOptions({
          approveSummary: separateLocalMergeApproval
            ? `Approve the completed implementation and continue to the separate local merge approval before ${localIntegrationLabel}.`
            : localIntegrationApproval
              ? `Approve the completed implementation and authorize ${localIntegrationLabel}, post-merge verification, and cleanup that will ${localCleanupSummary}.`
            : 'Approve the completed implementation and continue to the pre-PR or PR preparation stage.',
          holdSummary:
            'Request implementation changes before the workflow continues.',
        })
      : undefined;
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'implementation_approve',
      nextAction: buildAction(
        'implementation_approve',
        separateLocalMergeApproval
          ? `Share the completed implementation and get user approval for the implementation itself. Record it in tasks.md; ${localIntegrationLabel} will require a separate local_merge approval.`
          : localIntegrationApproval
            ? `Share the completed implementation and get user approval for the remaining local completion flow: ${localIntegrationLabel}, run post-merge checks, then ${localCleanupSummary}. Record that approval in tasks.md.`
          : 'Share the completed implementation, get user approval, and record the completion checkpoint in tasks.md.',
        approvalRequired
      ),
      approvalRequired,
      implementationAllowed: false,
      primaryActionLabel: actionOptions ? 'A' : undefined,
      actionOptions,
      blockedReasonCode: 'IMPLEMENTATION_APPROVAL_REQUIRED',
    };
  }

  if (
    requirements.prePrReviewEnabled &&
    !prePrSatisfied(config, feature, tasks)
  ) {
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'pre_pr_review',
      nextAction: buildAction(
        'pre_pr_review',
        'Delegate an independent read-only Pre-PR review to a fresh subagent and record its findings, decision, and reviewer metadata as evidence.',
        false,
        null,
        resolvePrePrReviewer(config)
      ),
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: 'PRE_PR_REVIEW_NOT_APPROVED',
    };
  }

  if (
    config.workflow?.mode === 'local' &&
    resolveLocalCompletionStrategy(config) !== 'none'
  ) {
    const localState = await resolveLocalIntegrationContext(config, feature);
    const localMergeBaseCommand =
      `npx lee-spec-kit local merge ${buildFeatureArgs(feature)} --json`;

    if (!localState.integrationComplete) {
      const approvalRequired = resolveActionApprovalRequired(
        config,
        'local_merge',
        false
      );
      const command = approvalRequired
        ? `${localMergeBaseCommand} --confirm OK`
        : localMergeBaseCommand;
      const actionOptions = approvalRequired
        ? buildApprovalActionOptions({
          approveSummary:
              localState.completionStrategy === 'local-squash'
                ? `Squash ${localState.featureBranch} into ${localState.baseBranch}, preserve the source Feature tip, and run the configured post-merge checks.`
                : `Fast-forward ${localState.featureBranch} into ${localState.baseBranch} and run the configured post-merge checks.`,
            holdSummary: 'Keep the completed Feature branch unmerged for now.',
          })
        : undefined;
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'local_merge',
        nextAction: buildAction(
          'local_merge',
          localState.completionStrategy === 'local-squash'
            ? `Create one squash commit from ${localState.featureBranch} on ${localState.baseBranch} and preserve the source Feature tip as internal integration evidence.`
            : `Fast-forward ${localState.featureBranch} into ${localState.baseBranch}; do not create a merge commit.`,
          approvalRequired,
          command
        ),
        approvalRequired,
        implementationAllowed: false,
        primaryActionLabel: actionOptions ? 'A' : undefined,
        actionOptions,
        blockedReasonCode: 'LOCAL_MERGE_REQUIRED',
      };
    }

    if (
      !localState.state ||
      !['verified', 'cleaned'].includes(localState.state.status) ||
      localState.state.featureTip !== localState.featureTip ||
      localState.state.mergedBaseTip !== localState.baseTip
    ) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'local_verify',
        nextAction: buildAction(
          'local_verify',
          'Run the configured post-merge checks and record verification against the integrated Feature tip.',
          false,
          localMergeBaseCommand
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'LOCAL_VERIFICATION_REQUIRED',
      };
    }

    if (!localCleanupComplete(localState)) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'local_cleanup',
        nextAction: buildAction(
          'local_cleanup',
          'Remove the clean managed worktree and delete the local Feature branch according to workflow policy.',
          false,
          `npx lee-spec-kit local cleanup ${buildFeatureArgs(feature)} --json`
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'LOCAL_CLEANUP_REQUIRED',
      };
    }

    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'done',
      nextAction: null,
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: null,
    };
  }

  if (requirements.requirePr) {
    const prReady = prDraft.status === 'ready';
    const prCreated =
      !!tasks.prLink &&
      prExistsRemotely(tasks.prLink, feature);
    if (!prCreated || !prReady) {
      const prCreateApprovalRequired =
        prReady && !prCreated;
      const prCreateCommand = `npx lee-spec-kit github pr ${buildFeatureArgs(feature)} --create --confirm OK`;
      const prCreateOptions = prCreateApprovalRequired
        ? buildApprovalActionOptions({
            approveSummary:
              'Create the GitHub PR now and sync the PR metadata back into tasks.md.',
            holdSummary:
              'Keep the PR in Ready state but do not create it yet.',
            remoteCommand: prCreateCommand,
          })
        : undefined;
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'pr',
        nextAction: prReady && !prCreated
          ? buildAction(
              'pr_create',
              'Create the GitHub PR from pr.md and sync the PR metadata into tasks.md.',
              prCreateApprovalRequired,
              prCreateCommand
            )
          : buildAction(
              'pr_prepare',
              'Prepare pr.md and set its Status to Ready before PR creation.',
              false
            ),
        approvalRequired: prCreateApprovalRequired,
        implementationAllowed: false,
        primaryActionLabel: prCreateOptions ? 'A' : undefined,
        actionOptions: prCreateOptions,
        blockedReasonCode: 'PR_NOT_CREATED',
      };
    }
  }

  const reviewApprovedInDocs =
    tasks.prStatus === 'approved' && prDraft.prStatus === 'approved';

  if (requirements.requireReview && currentReviewState === 'merged' && reviewApprovedInDocs) {
    const cleanupState = resolvePostMergeCleanupState(config, feature, tasks);
    if (!cleanupState.complete) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'cleanup',
        nextAction: buildAction(
          'merge_cleanup',
          buildPostMergeCleanupSummary(cleanupState),
          false,
          buildPostMergeCleanupCommand(cleanupState)
        ),
        approvalRequired: false,
        implementationAllowed: false,
        reviewState: 'merged',
        blockedReasonCode: 'POST_MERGE_CLEANUP_REQUIRED',
      };
    }

    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'done',
      nextAction: null,
      approvalRequired: false,
      implementationAllowed: false,
      reviewState: 'merged',
      primaryActionLabel: null,
      actionOptions: [],
      blockedReasonCode: null,
    };
  }

  if (requirements.requireReview && (!reviewApprovedInDocs || currentReviewState !== 'approved')) {
    const reviewFixAllowed = currentReviewState === 'changes_requested';
    const reviewApprovalRequired = !reviewFixAllowed;
    const reviewSyncCommand =
      currentReviewState === 'merged'
        ? `npx lee-spec-kit github pr ${buildFeatureArgs(feature)} --merge --confirm OK`
        : null;
    const reviewActionOptions = reviewApprovalRequired
      ? buildCodeReviewActionOptions(currentReviewState, reviewSyncCommand)
      : undefined;
    const reviewSummary =
      currentReviewState === 'approved'
        ? 'Record the approved PR review state in tasks.md and pr.md before proceeding to merge.'
        : currentReviewState === 'merged'
          ? 'Sync the already-merged PR state into tasks.md and pr.md before marking the workflow as complete.'
        : currentReviewState === 'changes_requested'
          ? 'Address the requested review changes and update the PR review evidence/decision before continuing.'
          : currentReviewState === 'review_pending_latest_commit'
            ? 'Wait for a fresh review on the latest PR commit before taking the next review action.'
          : currentReviewState === 'review_rate_limited'
            ? 'Wait for the current CodeRabbit review rate limit to clear, then re-check the latest PR review state before continuing.'
          : currentReviewState === 'draft'
            ? 'Resolve the draft PR state before continuing to the merge boundary.'
            : currentReviewState === 'merge_blocked'
              ? 'Resolve the current PR merge blocker before continuing to merge.'
        : 'Wait for PR review or inspect the current review state before taking the next review action.';
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'code_review',
      nextAction: buildAction(
        'code_review',
        reviewSummary,
        reviewApprovalRequired,
        reviewSyncCommand
      ),
      approvalRequired: reviewApprovalRequired,
      implementationAllowed: reviewFixAllowed,
      reviewState: currentReviewState,
      primaryActionLabel: reviewActionOptions ? 'A' : undefined,
      actionOptions: reviewActionOptions,
      blockedReasonCode: 'PR_REVIEW_NOT_APPROVED',
    };
  }

  if (requirements.requireMerge) {
    const mergeCommand =
      `npx lee-spec-kit github pr ${buildFeatureArgs(feature)} --merge --confirm OK`;
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'merge',
      nextAction: buildAction(
        'pr_merge',
        'Merge the PR and sync the merged state back into tasks.md.',
        true,
        mergeCommand
      ),
      approvalRequired: true,
      implementationAllowed: false,
      reviewState: 'approved',
      primaryActionLabel: 'A',
      actionOptions: buildMergeActionOptions(mergeCommand),
      blockedReasonCode: null,
    };
  }

  return {
    status: 'ok',
    reasonCode: 'WORKFLOW_STAGE_RESOLVED',
    docsDir: config.docsDir,
    featureRef: buildFeatureRef(feature),
    stage: 'done',
    nextAction: null,
    approvalRequired: false,
    implementationAllowed: false,
    blockedReasonCode: null,
  };
}

function hasLatestHeadRateLimitSignal(
  parsed: Record<string, unknown>,
  headRefOid: string
): boolean {
  const latestRateLimitCommentAt = findLatestCodeRabbitRateLimitCommentAt(
    parsed.comments,
    headRefOid
  );
  if (!latestRateLimitCommentAt) {
    return false;
  }

  const latestReviewAt = findLatestCodeRabbitReviewAt(parsed.latestReviews);
  return !latestReviewAt || latestReviewAt <= latestRateLimitCommentAt;
}

function hasStaleLatestCommitReviewSignal(
  parsed: Record<string, unknown>,
  headRefOid: string
): boolean {
  if (!headRefOid) {
    return false;
  }

  const latestReviewHead = findLatestCodeRabbitReviewedHead(parsed.latestReviews);
  if (!latestReviewHead) {
    return false;
  }

  return !matchesCommitReference(headRefOid, latestReviewHead);
}

function resolveCodeRabbitReviewThreadsState(
  prRef: string,
  feature: ResolvedFeature
): CodeRabbitReviewThreadsState {
  const coordinates = parseGithubPullRequestRef(prRef);
  if (!coordinates) {
    return 'unknown';
  }

  const result = runProcess(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `owner=${coordinates.owner}`,
      '-f',
      `name=${coordinates.name}`,
      '-F',
      `number=${coordinates.number}`,
      '-f',
      'query=query($owner:String!, $name:String!, $number:Int!) { repository(owner:$owner, name:$name) { pullRequest(number:$number) { headRefOid reviewThreads(first:100) { nodes { isResolved isOutdated comments(first:20) { nodes { author { login } body } } } } } } }',
    ],
    feature.git.projectGitCwd
  );

  if (result.code !== 0) {
    return 'unknown';
  }

  try {
    const parsed = JSON.parse(String(result.stdout || '{}')) as Record<string, unknown>;
    const nodes = extractNestedArray(parsed, [
      'data',
      'repository',
      'pullRequest',
      'reviewThreads',
      'nodes',
    ]);
    if (!nodes) {
      return 'unknown';
    }

    const codeRabbitThreads = nodes.filter(isCodeRabbitReviewThread);
    if (codeRabbitThreads.length === 0) {
      return 'none';
    }

    return codeRabbitThreads.some((thread) => !isReviewThreadResolved(thread))
      ? 'open'
      : 'resolved';
  } catch {
    return 'unknown';
  }
}

function parseGithubPullRequestRef(
  prRef: string | null
): { owner: string; name: string; number: number } | null {
  const value = prRef?.trim();
  if (!value) {
    return null;
  }

  const urlMatch = value.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/i
  );
  if (!urlMatch?.[1] || !urlMatch[2] || !urlMatch[3]) {
    return null;
  }

  return {
    owner: urlMatch[1],
    name: urlMatch[2],
    number: Number(urlMatch[3]),
  };
}

function hasSuccessfulCodeRabbitStatusCheck(statusChecksValue: unknown): boolean {
  if (!Array.isArray(statusChecksValue)) {
    return false;
  }

  return statusChecksValue.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    const label = [
      record.context,
      record.name,
      extractNestedString(record, ['app', 'name']),
      extractNestedString(record, ['checkSuite', 'app', 'name']),
    ]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();
    if (!label.includes('coderabbit')) return false;

    const state = String(record.state || record.conclusion || '')
      .trim()
      .toUpperCase();
    return state === 'SUCCESS';
  });
}

function isCodeRabbitReviewThread(threadValue: unknown): boolean {
  const comments = extractNestedArray(threadValue, ['comments', 'nodes']);
  if (!comments) {
    return false;
  }

  return comments.some((comment) =>
    extractNestedString(comment, ['author', 'login'])
      .toLowerCase()
      .startsWith('coderabbitai')
  );
}

function isReviewThreadResolved(threadValue: unknown): boolean {
  if (!threadValue || typeof threadValue !== 'object') {
    return false;
  }
  const record = threadValue as Record<string, unknown>;
  return record.isResolved === true || record.isOutdated === true;
}

function hasCodeRabbitActionableReview(reviewsValue: unknown): boolean {
  if (!Array.isArray(reviewsValue)) {
    return false;
  }

  return reviewsValue.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const authorLogin = extractNestedString(entry, ['author', 'login']).toLowerCase();
    if (authorLogin !== 'coderabbitai') return false;

    const state = String((entry as Record<string, unknown>).state || '')
      .trim()
      .toUpperCase();
    if (state === 'CHANGES_REQUESTED') return true;
    if (state !== 'COMMENTED') return false;

    const body = String((entry as Record<string, unknown>).body || '');
    const actionableMatch = body.match(/Actionable comments posted:\s*(\d+)/i);
    return actionableMatch ? Number(actionableMatch[1]) > 0 : false;
  });
}

function hasCodeRabbitNoActionableComment(commentsValue: unknown): boolean {
  if (!Array.isArray(commentsValue)) {
    return false;
  }

  return commentsValue.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const authorLogin = extractNestedString(entry, ['author', 'login']).toLowerCase();
    if (!authorLogin.startsWith('coderabbitai')) return false;

    const body = String((entry as Record<string, unknown>).body || '');
    if (/Actionable comments posted:\s*0\b/i.test(body)) return true;
    return /no actionable comments (?:were )?(?:generated|found|posted)/i.test(body);
  });
}

function extractNestedArray(
  value: unknown,
  pathSegments: string[]
): unknown[] | null {
  let current: unknown = value;
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object') {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return Array.isArray(current) ? current : null;
}

function findLatestCodeRabbitRateLimitCommentAt(
  commentsValue: unknown,
  headRefOid: string
): string | null {
  if (!Array.isArray(commentsValue)) {
    return null;
  }

  let latest: string | null = null;
  for (const entry of commentsValue) {
    if (!entry || typeof entry !== 'object') continue;
    const authorLogin = extractNestedString(entry, ['author', 'login']).toLowerCase();
    if (authorLogin !== 'coderabbitai') continue;
    const body = String((entry as Record<string, unknown>).body || '');
    if (!isCodeRabbitRateLimitBody(body, headRefOid)) continue;
    const createdAt = String((entry as Record<string, unknown>).createdAt || '').trim();
    if (!createdAt) continue;
    if (!latest || createdAt > latest) {
      latest = createdAt;
    }
  }

  return latest;
}

function findLatestCodeRabbitReviewAt(reviewsValue: unknown): string | null {
  if (!Array.isArray(reviewsValue)) {
    return null;
  }

  let latest: string | null = null;
  for (const entry of reviewsValue) {
    if (!entry || typeof entry !== 'object') continue;
    const authorLogin = extractNestedString(entry, ['author', 'login']).toLowerCase();
    if (authorLogin !== 'coderabbitai') continue;
    const submittedAt = String((entry as Record<string, unknown>).submittedAt || '').trim();
    if (!submittedAt) continue;
    if (!latest || submittedAt > latest) {
      latest = submittedAt;
    }
  }

  return latest;
}

function findLatestCodeRabbitReviewedHead(reviewsValue: unknown): string | null {
  if (!Array.isArray(reviewsValue)) {
    return null;
  }

  let latestReview: { submittedAt: string; reviewedHead: string | null } | null = null;
  for (const entry of reviewsValue) {
    if (!entry || typeof entry !== 'object') continue;
    const authorLogin = extractNestedString(entry, ['author', 'login']).toLowerCase();
    if (authorLogin !== 'coderabbitai') continue;
    const submittedAt = String((entry as Record<string, unknown>).submittedAt || '').trim();
    if (!submittedAt) continue;
    const body = String((entry as Record<string, unknown>).body || '');
    const reviewedHead = extractReviewedHeadFromReviewBody(body);
    if (!latestReview || submittedAt > latestReview.submittedAt) {
      latestReview = { submittedAt, reviewedHead };
    }
  }

  return latestReview?.reviewedHead ?? null;
}

function isCodeRabbitRateLimitBody(body: string, headRefOid: string): boolean {
  const normalized = body.toLowerCase();
  if (
    !normalized.includes('rate limited by coderabbit.ai') &&
    !normalized.includes('rate limit exceeded')
  ) {
    return false;
  }

  if (!headRefOid) {
    return true;
  }

  const shortHead = headRefOid.slice(0, 7);
  return normalized.includes(headRefOid) || normalized.includes(shortHead);
}

function extractReviewedHeadFromReviewBody(body: string): string | null {
  const match = body.match(/between\s+[0-9a-f]{7,40}\s+and\s+([0-9a-f]{7,40})/i);
  if (!match) {
    return null;
  }
  return match[1].trim().toLowerCase();
}

function matchesCommitReference(headRefOid: string, reviewedHead: string): boolean {
  const normalizedHead = headRefOid.trim().toLowerCase();
  const normalizedReviewedHead = reviewedHead.trim().toLowerCase();
  return (
    normalizedHead === normalizedReviewedHead ||
    normalizedHead.startsWith(normalizedReviewedHead) ||
    normalizedReviewedHead.startsWith(normalizedHead)
  );
}

function extractNestedString(
  value: unknown,
  pathSegments: string[]
): string {
  let current: unknown = value;
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object') {
      return '';
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current.trim() : '';
}

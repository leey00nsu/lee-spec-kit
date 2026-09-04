import fs from 'fs-extra';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  AGENT_REVIEW_REASONING_EFFORTS,
  createDefaultAgentExecutionTaskConfig,
  createDefaultAgentReviewerConfig,
  type AgentExecutorConfig,
  type AgentReviewPhaseConfig,
  type AgentReviewerConfig,
  type ProjectConfig,
} from '../config/types.js';
import { LEGACY_APPROVAL_CATEGORY_STEPS } from '../config/legacy-approval.js';
import { resolveLegacyBackfilledAgentAutomation } from '../config/agent-automation.js';
import { createDefaultApprovalConfig, getConfig } from './config.js';
import {
  getFeatureDocPaths,
  requiresManagedFeatureWorktree,
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
  resolveGitPrimaryWorktreeRoot,
  resolveStandaloneProjectRoots,
} from './standalone-workspace.js';
import {
  parseWorkflowDraftMetadata,
  type WorkflowDraftMetadata,
} from '../services/GithubWorkflowService.js';
import { resolveFeatureCommitScope } from './commit-conventions.js';
import { runProcess } from '../commands/github/process.js';
import { isPrePrEvidenceSatisfied } from './pre-pr-evidence.js';
import { parseTaskLine } from './task-lines.js';
import {
  isAncestor,
  localCleanupComplete,
  resolveLocalCompletionStrategy,
  resolveLocalIntegrationContext,
} from './local-integration.js';
import {
  computeFeatureDocumentationFingerprint,
  isTerminalFeatureForCuratedImpact,
  parseCuratedDocumentationImpact,
  parseTaskDocumentationTargets,
} from './documentation-impact.js';
import {
  areChangesOpenWikiOnly,
  inspectOpenWikiKnowledge,
  isOpenWikiEnabled,
  OPENWIKI_RECEIPT_PATH,
} from './openwiki-knowledge.js';

export type WorkflowStageId =
  | 'spec'
  | 'plan'
  | 'plan_review'
  | 'plan_review_fix'
  | 'tasks'
  | 'issue'
  | 'branch'
  | 'implementation'
  | 'task_commit'
  | 'task_review'
  | 'task_review_fix'
  | 'knowledge_setup'
  | 'knowledge_sync'
  | 'knowledge_commit'
  | 'implementation_approve'
  | 'feature_verify'
  | 'feature_remediation'
  | 'local_merge'
  | 'local_verify'
  | 'local_cleanup'
  | 'pre_pr_review'
  | 'feature_review_fix'
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
    | 'plan_review'
    | 'plan_review_fix'
    | 'plan_approve'
    | 'tasks_write'
    | 'tasks_approve'
    | 'issue_prepare'
    | 'issue_create'
    | 'branch_create'
    | 'task_execute'
    | 'task_commit'
    | 'task_review'
    | 'task_review_complete'
    | 'task_review_fix'
    | 'knowledge_setup'
    | 'knowledge_sync'
    | 'knowledge_commit'
    | 'implementation_approve'
    | 'feature_verify'
    | 'feature_remediation'
    | 'local_merge'
    | 'local_verify'
    | 'local_cleanup'
    | 'pre_pr_review'
    | 'feature_review_fix'
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
  reasoningEffort?: AgentReviewerConfig['reasoningEffort'];
  onUnavailable?: AgentReviewerConfig['onUnavailable'];
  reviewScope?: 'plan' | 'task' | 'feature';
  reviewRound?: number;
  maxReviewRounds?: number;
  taskId?: string;
  taskIdSource?: 'document' | 'synthetic';
  taskTitle?: string;
  baseSha?: string;
  targetSha?: string;
  targetTree?: string;
  specHash?: string;
  planHash?: string;
  workingDirectory?: string;
  docsDirectory?: string;
  workerContract?: WorkflowTaskWorkerContract;
  delegationContext?: WorkflowDelegationContext;
}

export interface WorkflowDelegationDocument {
  path: string;
  purpose: string;
  hash?: string;
}

export interface WorkflowDelegationContext {
  version: 1;
  role:
    | 'plan_reviewer'
    | 'task_implementation_worker'
    | 'task_reviewer'
    | 'feature_reviewer';
  featureRef: string;
  docsDirectory: string;
  workingDirectory?: string;
  requiredDocuments: WorkflowDelegationDocument[];
  referenceDocuments?: WorkflowDelegationDocument[];
  task?: {
    id: string;
    title: string;
    instructions: string;
    acceptanceCriteria: string[];
  };
  verificationContract?: string;
  reviewTarget?: {
    baseSha?: string;
    targetSha?: string;
    targetTree?: string;
    specHash?: string;
    planHash?: string;
  };
}

export interface WorkflowTaskWorkerContract {
  role: 'task_implementation_worker';
  executeDirectly: true;
  spawnSubagents: false;
  runWorkflowStage: false;
  editProjectCode: true;
  runTaskScopedVerification: true;
  followVerificationContract: true;
  addUnplannedDurableTests: false;
  editDocs: false;
  changeTaskState: false;
  commit: false;
  requestApproval: false;
  remoteActions: false;
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
    | 'PLAN_REVIEW_NOT_APPROVED'
    | 'TASKS_NOT_READY'
    | 'ISSUE_NOT_CREATED'
    | 'BRANCH_NOT_READY'
    | 'TASK_COMMIT_REQUIRED'
    | 'TASK_REVIEW_NOT_APPROVED'
    | 'KNOWLEDGE_SETUP_REQUIRED'
    | 'KNOWLEDGE_SYNC_REQUIRED'
    | 'KNOWLEDGE_COMMIT_REQUIRED'
    | 'IMPLEMENTATION_APPROVAL_REQUIRED'
    | 'FEATURE_VERIFICATION_REQUIRED'
    | 'FEATURE_REMEDIATION_REQUIRED'
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
  planReviewEnabled: boolean;
  taskReviewEnabled: boolean;
  featureReviewEnabled: boolean;
  taskExecutionEnabled: boolean;
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
  prePrReviewRound: number | null;
  prePrReviewedHead: string | null;
  prePrReviewedTree: string | null;
  tasks: Array<{
    raw: string;
    status: SimpleTaskStatus;
    taskId: string;
    taskIdSource: 'document' | 'synthetic';
    title: string;
    instructions: string;
    acceptanceCriteria: string[];
    documentationTargets: string[];
    reviewEvidence: string | null;
    reviewDecision: string | null;
    reviewDecisionOutcome: 'approve' | 'changes_requested' | 'blocked' | null;
    reviewRound: number | null;
    reviewedHead: string | null;
    reviewedTree: string | null;
  }>;
  completion: {
    allTasksChecked: boolean;
    testsChecked: boolean;
    finalOutcomeChecked: boolean;
  };
};

type ParsedPlanReview = {
  status: 'pending' | 'running' | 'done' | null;
  evidence: string | null;
  decision: string | null;
  decisionOutcome: 'approve' | 'changes_requested' | 'blocked' | null;
  reviewRound: number | null;
  reviewedSpecHash: string | null;
  reviewedPlanHash: string | null;
  hasMetadata: boolean;
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
const PRE_PR_REVIEW_LABELS = [
  'Pre-PR Review',
  'PR 전 리뷰',
  'Feature Review',
  'Feature 리뷰',
];
const PRE_PR_EVIDENCE_LABELS = [
  'Pre-PR Evidence',
  'PR 전 리뷰 Evidence',
  'Feature Review Evidence',
  'Feature 리뷰 Evidence',
];
const PRE_PR_DECISION_LABELS = [
  'Pre-PR Decision',
  'PR 전 리뷰 Decision',
  'Feature Review Decision',
  'Feature 리뷰 Decision',
];
const PRE_PR_REVIEW_ROUND_LABELS = [
  'Pre-PR Review Round',
  'PR 전 리뷰 Round',
  'Feature Review Round',
  'Feature 리뷰 Round',
];
const PRE_PR_REVIEWED_HEAD_LABELS = [
  'Pre-PR Reviewed Head',
  'PR 전 리뷰 Head',
  'Feature Reviewed Head',
  'Feature 리뷰 Head',
];
const PRE_PR_REVIEWED_TREE_LABELS = [
  'Pre-PR Reviewed Tree',
  'PR 전 리뷰 Tree',
  'Feature Reviewed Tree',
  'Feature 리뷰 Tree',
];
const PLAN_REVIEW_STATUS_LABELS = ['Plan Review', 'Plan 검수', 'Plan 리뷰'];
const PLAN_REVIEW_EVIDENCE_LABELS = [
  'Plan Review Evidence',
  'Plan 검수 Evidence',
  'Plan 리뷰 Evidence',
];
const PLAN_REVIEW_DECISION_LABELS = [
  'Plan Review Decision',
  'Plan 검수 Decision',
  'Plan 리뷰 Decision',
];
const PLAN_REVIEW_ROUND_LABELS = [
  'Plan Review Round',
  'Plan 검수 Round',
  'Plan 리뷰 Round',
];
const PLAN_REVIEWED_SPEC_HASH_LABELS = [
  'Plan Reviewed Spec Hash',
  'Plan 검수 Spec Hash',
  'Plan 리뷰 Spec Hash',
];
const PLAN_REVIEWED_PLAN_HASH_LABELS = [
  'Plan Reviewed Plan Hash',
  'Plan 검수 Plan Hash',
  'Plan 리뷰 Plan Hash',
];
const COMPLETION_MARKERS = {
  allTasks: 'lee-spec-kit:completion:all-tasks',
  tests: 'lee-spec-kit:completion:tests',
  finalOutcome: 'lee-spec-kit:completion:final-outcome',
} as const;

function resolveWorkflowRequirements(
  config: ProjectConfig
): WorkflowRequirements {
  const workflow = config.workflow || {};
  const legacyBackfilledAgentAutomation =
    resolveLegacyBackfilledAgentAutomation(config);
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
    requireWorktree:
      config.docsRepo === 'standalone'
        ? true
        : (workflow.requireWorktree ?? legacyStrictRequiresWorktree),
    requirePr: workflow.requirePr ?? !isLocalWorkflow,
    requireReview: workflow.requireReview ?? !isLocalWorkflow,
    requireMerge: workflow.requireMerge ?? !isLocalWorkflow,
    // Missing agent automation keys identify projects created before these
    // policies existed. Keep their historical main-agent/no-Plan-review
    // behavior; new projects opt in explicitly through init.
    planReviewEnabled: legacyBackfilledAgentAutomation.planReview
      ? false
      : (workflow.agentReview?.plan?.enabled ?? false),
    taskReviewEnabled: workflow.agentReview?.task?.enabled ?? false,
    featureReviewEnabled:
      isOpenWikiEnabled(config) ||
      (workflow.agentReview?.feature?.enabled ??
        workflow.prePrReview?.enabled ??
        !isLocalWorkflow),
    taskExecutionEnabled: legacyBackfilledAgentAutomation.taskExecution
      ? false
      : (workflow.agentExecution?.task?.enabled ?? false),
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

function parseCompletionCheckbox(
  lines: string[],
  marker: string,
  legacyPattern: RegExp
): boolean {
  const markerToken = `<!-- ${marker} -->`;
  const markedLines = lines.filter((line) => line.includes(markerToken));

  if (markedLines.length > 0) {
    return (
      markedLines.length === 1 && parseMarkdownCheckbox(markedLines[0]) === true
    );
  }

  return lines.some(
    (line) => legacyPattern.test(line) && parseMarkdownCheckbox(line) === true
  );
}

function parseReviewDecisionOutcome(
  value: string | null
): 'approve' | 'changes_requested' | 'blocked' | null {
  const match = (value || '')
    .trim()
    .toLowerCase()
    .match(/\b(approve|changes_requested|blocked)\b/);
  return (match?.[1] as 'approve' | 'changes_requested' | 'blocked') || null;
}

function parseReviewRound(value: string | null): number | null {
  const parsed = Number((value || '').trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveMaxReviewRounds(config: ProjectConfig): number {
  const configured = config.workflow?.agentReview?.maxRounds;
  return typeof configured === 'number' &&
    Number.isInteger(configured) &&
    configured > 0
    ? configured
    : 1;
}

function reviewRoundLimitReached(
  config: ProjectConfig,
  reviewRound: number | null,
  decisionOutcome: 'approve' | 'changes_requested' | 'blocked' | null
): boolean {
  return (
    decisionOutcome === 'changes_requested' &&
    (reviewRound || 1) >= resolveMaxReviewRounds(config)
  );
}

function parseWorkflowTaskLine(
  line: string,
  index = -1
): {
  index: number;
  raw: string;
  status: SimpleTaskStatus;
  taskId: string | null;
  title: string;
} | null {
  const canonical = parseTaskLine(line, index);
  if (canonical) {
    return {
      index,
      raw: line,
      status: canonical.status,
      taskId: canonical.taskId,
      title: canonical.title,
    };
  }

  const legacy = line.match(
    /^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\](?:\[[^\]]+\])*\s+(?:(T-[A-Za-z0-9-]+)\s+)?(.+?)\s*$/i
  );
  if (!legacy) return null;
  return {
    index,
    raw: line,
    status: legacy[1].toUpperCase() as SimpleTaskStatus,
    taskId: legacy[2] || null,
    title: legacy[3].trim(),
  };
}

function extractTaskReviewValue(
  lines: string[],
  startIndex: number,
  labels: string[]
): string | null {
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (parseWorkflowTaskLine(lines[index]) || /^\s*##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = lines[index].match(
        new RegExp(
          `^\\s*-\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?:\\s*(.*?)\\s*$`,
          'i'
        )
      );
      if (match) return sanitizeMetadataValue(match[1]);
    }
  }
  return null;
}

function extractTaskInstructions(lines: string[], startIndex: number): string {
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (parseWorkflowTaskLine(lines[index]) || /^\s*##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }
  return lines.slice(startIndex, endIndex).join('\n').trim();
}

function extractTaskAcceptanceCriteria(
  lines: string[],
  startIndex: number
): string[] {
  const instructions = extractTaskInstructions(lines, startIndex).split('\n');
  const acceptance: string[] = [];
  let inAcceptance = false;

  for (const line of instructions.slice(1)) {
    if (/^\s{2,}-\s+(?:\*\*)?Acceptance(?:\*\*)?:\s*$/i.test(line)) {
      inAcceptance = true;
      continue;
    }
    if (inAcceptance && /^\s{2,}-\s+(?:\*\*)?[A-Za-z][^:]*:\s*/.test(line)) {
      break;
    }
    if (!inAcceptance) continue;
    const match = line.match(/^\s{4,}-\s+(?:\[[ xX]\]\s*)?(.+?)\s*$/);
    if (match) acceptance.push(match[1]);
  }

  return acceptance;
}

function buildSyntheticTaskId(
  feature: ResolvedFeature,
  title: string,
  sameTitleOccurrence: number
): string {
  const fingerprint = createHash('sha256')
    .update(
      `${feature.folderName}\0${normalizeCommitTopicText(title).toLowerCase()}\0${sameTitleOccurrence}`
    )
    .digest('hex')
    .slice(0, 10);
  return `T-${feature.id}-legacy-${fingerprint}`;
}

function parseTasksDoc(content: string, feature: ResolvedFeature): ParsedTasks {
  const issueRaw = extractFieldValue(content, ISSUE_LABELS);
  const issueNumberMatch = issueRaw?.match(/^#(\d+)$/);
  const issueNumber = issueNumberMatch ? Number(issueNumberMatch[1]) : null;
  const branchRaw = extractFieldValue(content, BRANCH_LABELS);
  const prRaw = extractFieldValue(content, PR_LABELS);
  const prePrDecision = extractFieldValue(content, PRE_PR_DECISION_LABELS);
  const tasks: ParsedTasks['tasks'] = [];
  const nonCodeLines = withoutFencedCodeBlocks(content);
  const legacyTitleOccurrences = new Map<string, number>();

  for (let index = 0; index < nonCodeLines.length; index += 1) {
    const line = nonCodeLines[index];
    const parsed = parseWorkflowTaskLine(line, index);
    if (!parsed) continue;
    const reviewDecision = extractTaskReviewValue(nonCodeLines, index, [
      'Review Decision',
      'Task Review Decision',
      '태스크 리뷰 Decision',
    ]);
    const reviewRound = parseReviewRound(
      extractTaskReviewValue(nonCodeLines, index, [
        'Review Round',
        'Task Review Round',
        '태스크 리뷰 Round',
      ])
    );
    const legacyTitleKey = normalizeCommitTopicText(parsed.title).toLowerCase();
    const sameTitleOccurrence =
      (legacyTitleOccurrences.get(legacyTitleKey) || 0) + 1;
    legacyTitleOccurrences.set(legacyTitleKey, sameTitleOccurrence);
    const taskId =
      parsed.taskId ||
      buildSyntheticTaskId(feature, parsed.title, sameTitleOccurrence);
    tasks.push({
      raw: line,
      status: parsed.status,
      taskId,
      taskIdSource: parsed.taskId ? 'document' : 'synthetic',
      title: parsed.title,
      instructions: extractTaskInstructions(nonCodeLines, index),
      acceptanceCriteria: extractTaskAcceptanceCriteria(nonCodeLines, index),
      documentationTargets: parseTaskDocumentationTargets(nonCodeLines, index),
      reviewEvidence: extractTaskReviewValue(nonCodeLines, index, [
        'Review Evidence',
        'Task Review Evidence',
        '태스크 리뷰 Evidence',
      ]),
      reviewDecision,
      reviewDecisionOutcome: parseReviewDecisionOutcome(reviewDecision),
      reviewRound,
      reviewedHead: extractTaskReviewValue(nonCodeLines, index, [
        'Reviewed Head',
        'Task Reviewed Head',
        '태스크 리뷰 Head',
      ]),
      reviewedTree: extractTaskReviewValue(nonCodeLines, index, [
        'Reviewed Tree',
        'Task Reviewed Tree',
        '태스크 리뷰 Tree',
      ]),
    });
  }

  const allTasksChecked = parseCompletionCheckbox(
    nonCodeLines,
    COMPLETION_MARKERS.allTasks,
    /(All tasks are|모든 태스크가)/i
  );
  const testsChecked = parseCompletionCheckbox(
    nonCodeLines,
    COMPLETION_MARKERS.tests,
    /(Tests executed and passing|테스트 실행 및 통과)/i
  );
  const finalOutcomeChecked = parseCompletionCheckbox(
    nonCodeLines,
    COMPLETION_MARKERS.finalOutcome,
    /(Final outcome shared and any required user confirmation recorded|Final user approval|최종 결과를 공유했고, 필요한 사용자 확인을 문서화된 workflow checkpoint 기준으로 기록함)/i
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

  const prePrDecisionOutcome = parseReviewDecisionOutcome(prePrDecision);

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
    prePrReviewRound: parseReviewRound(
      extractFieldValue(content, PRE_PR_REVIEW_ROUND_LABELS)
    ),
    prePrReviewedHead: sanitizeMetadataValue(
      extractFieldValue(content, PRE_PR_REVIEWED_HEAD_LABELS)
    ),
    prePrReviewedTree: sanitizeMetadataValue(
      extractFieldValue(content, PRE_PR_REVIEWED_TREE_LABELS)
    ),
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

function parsePlanReview(content: string): ParsedPlanReview {
  const statusValue = sanitizeMetadataValue(
    extractFieldValue(content, PLAN_REVIEW_STATUS_LABELS)
  )?.toLowerCase();
  const status =
    statusValue === 'pending' ||
    statusValue === 'running' ||
    statusValue === 'done'
      ? statusValue
      : null;
  const evidence = sanitizeMetadataValue(
    extractFieldValue(content, PLAN_REVIEW_EVIDENCE_LABELS)
  );
  const decision = sanitizeMetadataValue(
    extractFieldValue(content, PLAN_REVIEW_DECISION_LABELS)
  );
  const reviewRound = parseReviewRound(
    extractFieldValue(content, PLAN_REVIEW_ROUND_LABELS)
  );
  const reviewedSpecHash = sanitizeMetadataValue(
    extractFieldValue(content, PLAN_REVIEWED_SPEC_HASH_LABELS)
  );
  const reviewedPlanHash = sanitizeMetadataValue(
    extractFieldValue(content, PLAN_REVIEWED_PLAN_HASH_LABELS)
  );

  return {
    status,
    evidence,
    decision,
    decisionOutcome: parseReviewDecisionOutcome(decision),
    reviewRound,
    reviewedSpecHash,
    reviewedPlanHash,
    hasMetadata: PLAN_REVIEW_STATUS_LABELS.some((label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^\\s*-\\s*\\*\\*${escaped}\\*\\*:`, 'mi').test(
        content
      );
    }),
  };
}

function buildReviewDocumentHash(
  content: string,
  excludedLabels: string[]
): string {
  const excluded = new Set(
    [...excludedLabels, 'Status', '상태'].map((label) => label.toLowerCase())
  );
  const normalized = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => {
      const match = line.match(/^\s*-\s*\*\*(.+?)\*\*\s*:/);
      return !match || !excluded.has(match[1].trim().toLowerCase());
    })
    .join('\n')
    .trim();
  return createHash('sha256').update(normalized).digest('hex');
}

function buildPlanReviewTarget(
  specContent: string,
  planContent: string
): { specHash: string; planHash: string } {
  return {
    specHash: buildReviewDocumentHash(specContent, []),
    planHash: buildReviewDocumentHash(planContent, [
      ...PLAN_REVIEW_STATUS_LABELS,
      ...PLAN_REVIEW_EVIDENCE_LABELS,
      ...PLAN_REVIEW_DECISION_LABELS,
      ...PLAN_REVIEW_ROUND_LABELS,
      ...PLAN_REVIEWED_SPEC_HASH_LABELS,
      ...PLAN_REVIEWED_PLAN_HASH_LABELS,
    ]),
  };
}

function extractMarkdownSection(content: string, heading: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const startIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase()
  );
  if (startIndex < 0) return '';
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }
  return lines.slice(startIndex, endIndex).join('\n').trim();
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
    const match = line.match(/^\s*-\s*\[(DONE)\](?:\[[^\]]+\])*\s+(.+?)\s*$/i);
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

  const repoTasksPath = toRepoRelativePath(
    docsGitCwd,
    tasksRelativePathFromDocs
  );
  const currentContent = runGitCapture(
    ['show', `${latestTasksCommit}:${repoTasksPath}`],
    docsGitCwd
  );
  if (currentContent === undefined) return undefined;
  const previousContent =
    runGitCapture(
      ['show', `${latestTasksCommit}^:${repoTasksPath}`],
      docsGitCwd
    ) || '';
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

function getLastDoneTask(
  tasks: ParsedTasks
): ParsedTasks['tasks'][number] | null {
  for (let index = tasks.tasks.length - 1; index >= 0; index -= 1) {
    if (tasks.tasks[index].status === 'DONE') return tasks.tasks[index];
  }
  return null;
}

async function collectDocumentationTargetEvidenceErrors(input: {
  config: ProjectConfig;
  feature: ResolvedFeature;
  tasks: ParsedTasks;
  projectGitCwd: string;
  targets: string[];
}): Promise<string[]> {
  const scope = resolveFeatureCommitScope({
    issueNumber: input.tasks.issueNumber,
    featureId: input.feature.id,
    workflowMode: input.config.workflow?.mode,
  });
  if (!scope) {
    return ['The active Feature commit scope could not be resolved.'];
  }
  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scopedSubject = new RegExp(`\\(${escapedScope}\\)`, 'u');
  const errors: string[] = [];

  for (const target of input.targets) {
    const separator = target.indexOf(':');
    const namespace = target.slice(0, separator);
    const relativeTarget = target.slice(separator + 1);
    const namespaceRoot =
      namespace === 'docs'
        ? input.config.docsDir
        : resolveProjectRootFromGitCwd(input.projectGitCwd);
    const absoluteTarget = path.resolve(namespaceRoot, relativeTarget);
    const containment = path.relative(namespaceRoot, absoluteTarget);
    if (
      !relativeTarget ||
      containment === '..' ||
      containment.startsWith(`..${path.sep}`) ||
      path.isAbsolute(containment)
    ) {
      errors.push(`${target} escapes its declared documentation namespace.`);
      continue;
    }
    let isRegularFile = false;
    try {
      const stat = await fs.lstat(absoluteTarget);
      isRegularFile = stat.isFile() && !stat.isSymbolicLink();
    } catch {
      errors.push(`${target} does not exist.`);
      continue;
    }
    if (!isRegularFile) {
      errors.push(`${target} must resolve to a regular file.`);
      continue;
    }
    try {
      const [realNamespaceRoot, realTarget] = await Promise.all([
        fs.realpath(namespaceRoot),
        fs.realpath(absoluteTarget),
      ]);
      const realContainment = path.relative(realNamespaceRoot, realTarget);
      if (
        realContainment === '..' ||
        realContainment.startsWith(`..${path.sep}`) ||
        path.isAbsolute(realContainment)
      ) {
        errors.push(
          `${target} escapes its declared documentation namespace through a symbolic-link parent.`
        );
        continue;
      }
    } catch {
      errors.push(`${target} could not be resolved safely.`);
      continue;
    }
    const gitRoot =
      runGitCapture(['rev-parse', '--show-toplevel'], namespaceRoot) || '';
    if (!gitRoot) {
      errors.push(`${target} is not inside a Git repository.`);
      continue;
    }
    const gitRelativeTarget = normalizeGitRelativePath(
      path.relative(gitRoot, absoluteTarget)
    );
    const standaloneDocsTarget =
      input.config.docsRepo === 'standalone' && namespace === 'docs';
    const baseSha = standaloneDocsTarget
      ? null
      : resolveFeatureDiffBase(input.config, gitRoot, scopedSubject);
    const targetChanged = standaloneDocsTarget
      ? hasScopedCommitForPath(gitRoot, gitRelativeTarget, scopedSubject)
      : !!baseSha &&
        !!runGitCapture(
          ['diff', '--name-only', `${baseSha}...HEAD`, '--', gitRelativeTarget],
          gitRoot
        );
    const scopedCommit = standaloneDocsTarget
      ? targetChanged
      : !!baseSha &&
        hasScopedCommitForPath(
          gitRoot,
          gitRelativeTarget,
          scopedSubject,
          `${baseSha}..HEAD`
        );
    if (!targetChanged || !scopedCommit) {
      errors.push(
        `${target} has no committed change in the active Feature diff using scope ${scope}.`
      );
    }
  }
  return errors;
}

function resolveFeatureDiffBase(
  config: ProjectConfig,
  gitRoot: string,
  scopedSubject?: RegExp
): string | null {
  const head = runGitCapture(['rev-parse', 'HEAD'], gitRoot) || '';
  if (!head) return null;
  const baseBranch = config.workflow?.baseBranch?.trim() || 'main';
  for (const candidate of [`origin/${baseBranch}`, baseBranch]) {
    const mergeBase =
      runGitCapture(['merge-base', candidate, head], gitRoot) || '';
    if (mergeBase && mergeBase !== head) return mergeBase;
  }
  if (scopedSubject) {
    const commits = runGitCapture(
      ['log', '--reverse', '--pretty=%H%x00%s'],
      gitRoot
    );
    for (const line of (commits || '').split('\n')) {
      const separator = line.indexOf('\0');
      if (separator < 0 || !scopedSubject.test(line.slice(separator + 1))) {
        continue;
      }
      const firstScopedCommit = line.slice(0, separator);
      const parent =
        runGitCapture(['rev-parse', `${firstScopedCommit}^`], gitRoot) || '';
      if (parent) return parent;
    }
    return null;
  }
  return runGitCapture(['rev-parse', `${head}^`], gitRoot) || null;
}

function hasScopedCommitForPath(
  gitRoot: string,
  gitRelativePath: string,
  scopedSubject: RegExp,
  range?: string
): boolean {
  const args = ['log', '--pretty=%s'];
  if (range) args.push(range);
  args.push('--', gitRelativePath);
  const subjects = runGitCapture(args, gitRoot) || '';
  return subjects.split('\n').some((subject) => scopedSubject.test(subject));
}

async function collectUndeclaredCuratedDocumentationChanges(input: {
  config: ProjectConfig;
  feature: ResolvedFeature;
  tasks: ParsedTasks;
  projectGitCwd: string;
  declaredTargets: string[];
}): Promise<string[]> {
  const scope = resolveFeatureCommitScope({
    issueNumber: input.tasks.issueNumber,
    featureId: input.feature.id,
    workflowMode: input.config.workflow?.mode,
  });
  if (!scope) return [];
  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scopedSubject = new RegExp(`\\(${escapedScope}\\)`, 'u');
  const docsGitRoot =
    runGitCapture(['rev-parse', '--show-toplevel'], input.config.docsDir) || '';
  const projectRoot = resolveProjectRootFromGitCwd(input.projectGitCwd);
  const projectGitRoot =
    runGitCapture(['rev-parse', '--show-toplevel'], projectRoot) || '';
  const candidates = new Set<string>();

  if (docsGitRoot) {
    const committed =
      input.config.docsRepo === 'standalone'
        ? collectScopedCommitPaths(docsGitRoot, scopedSubject)
        : collectFeatureRangePaths(input.config, docsGitRoot, scopedSubject);
    const changed = [
      ...new Set([...committed, ...collectWorkingTreePaths(docsGitRoot)]),
    ];
    for (const gitRelativePath of changed) {
      const absolutePath = path.resolve(docsGitRoot, gitRelativePath);
      const relativeToDocs = path.relative(input.config.docsDir, absolutePath);
      const insideDocs =
        relativeToDocs !== '..' &&
        !relativeToDocs.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativeToDocs);
      if (insideDocs) {
        const normalized = normalizeGitRelativePath(relativeToDocs);
        if (isCuratedDocsPath(normalized)) {
          candidates.add(`docs:${normalized}`);
        }
      }
    }
  }

  if (projectGitRoot) {
    const changed = [
      ...new Set([
        ...collectFeatureRangePaths(
          input.config,
          projectGitRoot,
          scopedSubject
        ),
        ...collectWorkingTreePaths(projectGitRoot),
      ]),
    ];
    for (const gitRelativePath of changed) {
      const absolutePath = path.resolve(projectGitRoot, gitRelativePath);
      const relativeToDocs = path.relative(input.config.docsDir, absolutePath);
      const insideDocs =
        relativeToDocs === '' ||
        (!relativeToDocs.startsWith(`..${path.sep}`) &&
          relativeToDocs !== '..' &&
          !path.isAbsolute(relativeToDocs));
      if (!insideDocs && isCuratedProjectPath(gitRelativePath)) {
        candidates.add(`project:${normalizeGitRelativePath(gitRelativePath)}`);
      }
    }
  }

  const declared = new Set(
    input.declaredTargets.map((target) =>
      normalizeTargetForReconciliation(
        target,
        input.config.docsDir,
        projectRoot
      )
    )
  );
  return [...candidates].filter((target) => !declared.has(target)).sort();
}

function collectWorkingTreePaths(gitRoot: string): string[] {
  const paths = new Set<string>();
  for (const args of [
    ['diff', '--name-only'],
    ['diff', '--cached', '--name-only'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const changed = runGitCapture(args, gitRoot) || '';
    changed
      .split('\n')
      .filter(Boolean)
      .forEach((relativePath) => paths.add(relativePath));
  }
  return [...paths];
}

function normalizeTargetForReconciliation(
  target: string,
  docsDir: string,
  projectRoot: string
): string {
  const separator = target.indexOf(':');
  if (separator < 0) return target;
  const namespace = target.slice(0, separator);
  const relativeTarget = target.slice(separator + 1);
  if (namespace !== 'project') return target;
  const absoluteTarget = path.resolve(projectRoot, relativeTarget);
  const relativeToDocs = path.relative(docsDir, absoluteTarget);
  const insideDocs =
    relativeToDocs === '' ||
    (relativeToDocs !== '..' &&
      !relativeToDocs.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativeToDocs));
  return insideDocs
    ? `docs:${normalizeGitRelativePath(relativeToDocs)}`
    : target;
}

function collectFeatureRangePaths(
  config: ProjectConfig,
  gitRoot: string,
  scopedSubject: RegExp
): string[] {
  const baseSha = resolveFeatureDiffBase(config, gitRoot, scopedSubject);
  if (!baseSha) return [];
  const range = `${baseSha}..HEAD`;
  const paths = new Set(
    (runGitCapture(['diff', '--name-only', `${baseSha}...HEAD`], gitRoot) || '')
      .split('\n')
      .filter(Boolean)
  );
  const scopedPaths = collectScopedCommitPaths(gitRoot, scopedSubject, range);
  return scopedPaths.filter((relativePath) => paths.has(relativePath));
}

function collectScopedCommitPaths(
  gitRoot: string,
  scopedSubject: RegExp,
  range?: string
): string[] {
  const logArgs = ['log', '--pretty=%H%x00%s'];
  if (range) logArgs.push(range);
  const commits = runGitCapture(logArgs, gitRoot) || '';
  const paths = new Set<string>();
  for (const line of commits.split('\n')) {
    const separator = line.indexOf('\0');
    if (separator < 0) continue;
    const sha = line.slice(0, separator);
    const subject = line.slice(separator + 1);
    if (!scopedSubject.test(subject)) continue;
    const changed =
      runGitCapture(
        ['show', '--pretty=format:', '--name-only', sha],
        gitRoot
      ) || '';
    changed
      .split('\n')
      .filter(Boolean)
      .forEach((relativePath) => paths.add(relativePath));
  }
  return [...paths];
}

function isCuratedDocsPath(relativePath: string): boolean {
  const normalized = normalizeGitRelativePath(relativePath);
  if (
    !normalized ||
    normalized === '.lee-spec-kit.json' ||
    normalized === '.gitignore' ||
    normalized === 'AGENTS.md'
  ) {
    return false;
  }
  return !/^(?:features|ideas|scripts)(?:\/|$)/u.test(normalized);
}

function isCuratedProjectPath(relativePath: string): boolean {
  const normalized = normalizeGitRelativePath(relativePath);
  return (
    /^README(?:\.[^/]+)?\.md$/iu.test(normalized) ||
    normalized.startsWith('docs/')
  );
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
      ['status', '--porcelain', '--untracked-files=normal'],
      gitCwd
    ) || '';
  return status.trim().length > 0;
}

function resolveTaskCommitGatePolicy(
  config: ProjectConfig
): TaskCommitGatePolicy {
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
  args.push(
    ':(exclude)openwiki/**',
    `:(exclude)${OPENWIKI_RECEIPT_PATH}`,
    ':(exclude)AGENTS.md',
    ':(exclude)CLAUDE.md'
  );

  const latestProjectSubject = runGitCapture(args, effectiveProjectGitCwd);
  if (latestProjectSubject === undefined) {
    return { pass: false, reason: 'PROJECT_LOG_UNAVAILABLE' };
  }
  const normalizedSubject = normalizeCommitSubjectForGate(latestProjectSubject);
  if (!normalizedSubject) {
    return { pass: false, reason: 'NO_PROJECT_COMMIT' };
  }

  if (
    !normalizedSubject.includes(normalizeTaskTopic(lastDoneTopic).toLowerCase())
  ) {
    return { pass: false, reason: 'MISMATCH_LAST_DONE' };
  }

  return { pass: true };
}

function describeTaskCommitGateFailure(check: TaskCommitGateCheck): string {
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
    tasks.tasks.find((task) => task.status === 'TODO')?.title ||
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
  const {
    feature,
    tasks,
    effectiveProjectGitCwd,
    docsDirty,
    projectDirty,
    gateFailureReason,
  } = input;
  const scope =
    resolveFeatureCommitScope({
      issueNumber: tasks.issueNumber,
      featureId: feature.id,
      workflowMode: tasks.issueNumber ? 'github' : 'local',
    }) || feature.id;
  const docsMessage = `git -C "${feature.git.docsGitCwd}" add "${feature.docs.featurePathFromDocs}" && git -C "${feature.git.docsGitCwd}" commit -m "docs(${scope}): ${feature.folderName} 문서 업데이트"`;
  const projectMessage = `Stage only the files touched by the just-finished task in "${effectiveProjectGitCwd}", then commit with: git -C "${effectiveProjectGitCwd}" commit -m "feat(${scope}): ${resolveProjectCommitTopic(feature, tasks)}"`;

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
    lines.push(
      `Re-check the last task commits. Docs commit should contain exactly one DONE transition, and the latest project commit should match "${normalizeTaskTopic(getLastDoneTask(tasks)?.title || '')}".`
    );
  }
  return lines.join('\n');
}

function parseWorkflowDraftMetadataExtended(
  content: string
): ParsedWorkflowDraft {
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

function resolveExpectedBranch(
  feature: ResolvedFeature,
  tasks: ParsedTasks
): string | null {
  if (tasks.branch) return tasks.branch;
  if (!tasks.issueNumber) return null;
  return `feat/${tasks.issueNumber}-${feature.slug}`;
}

function buildExpectedBranchCommand(
  config: ProjectConfig,
  feature: ResolvedFeature,
  expectedBranch: string,
  requireWorktree: boolean
): string {
  if (requireWorktree) {
    return buildManagedWorktreeCreateCommand(
      config,
      feature.git.projectGitCwd,
      expectedBranch
    );
  }
  return localBranchExists(
    resolveProjectRootGitCwd(config, feature),
    expectedBranch
  )
    ? `git checkout ${expectedBranch}`
    : `git checkout -b ${expectedBranch}`;
}

function resolveProjectRootFromGitCwd(projectGitCwd: string): string {
  return (
    runGitCapture(['rev-parse', '--show-toplevel'], projectGitCwd) ||
    path.resolve(projectGitCwd)
  );
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

  return resolveGitPrimaryWorktreeRoot(feature.git.projectGitCwd);
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
  const worktreePath = getExpectedWorktreePath(
    config,
    projectGitCwd,
    branchName
  );
  const worktreeParent = path.dirname(worktreePath);
  const staleCleanupCommand = buildManagedWorktreeStaleCleanupCommand(
    projectRoot,
    worktreePath
  );
  const envCopyCommand = buildManagedWorktreeEnvCopyCommand(
    projectRoot,
    worktreePath
  );
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
    const parsed = JSON.parse(String(result.stdout || '{}')) as Record<
      string,
      unknown
    >;
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
  return (
    runProcess(
      'git',
      ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
      cwd
    ).code === 0
  );
}

function remoteBranchExists(cwd: string, branchName: string | null): boolean {
  if (!branchName) return false;
  return (
    runProcess(
      'git',
      ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branchName}`],
      cwd
    ).code === 0
  );
}

function resolvePostMergeCleanupState(
  config: ProjectConfig,
  feature: ResolvedFeature,
  tasks: ParsedTasks
): PostMergeCleanupState {
  const projectRootGitCwd = resolveProjectRootGitCwd(config, feature);
  const prMeta = resolveRemotePrMergeMeta(tasks.prLink, projectRootGitCwd);
  const baseBranch = (prMeta?.baseRefName || 'main').trim() || 'main';
  const headBranch =
    (prMeta?.headRefName || resolveExpectedBranch(feature, tasks))?.trim() ||
    null;
  const hasOriginRemote =
    runProcess('git', ['remote', 'get-url', 'origin'], projectRootGitCwd)
      .code === 0;
  if (hasOriginRemote) {
    runProcess('git', ['fetch', '--prune', 'origin'], projectRootGitCwd);
  }

  const currentBranch =
    runGitCapture(['branch', '--show-current'], projectRootGitCwd) ||
    runGitCapture(['rev-parse', '--abbrev-ref', 'HEAD'], projectRootGitCwd) ||
    '';
  const localBaseSha =
    runGitCapture(['rev-parse', baseBranch], projectRootGitCwd) || '';
  const remoteBaseSha = hasOriginRemote
    ? runGitCapture(['rev-parse', `origin/${baseBranch}`], projectRootGitCwd) ||
      ''
    : '';
  const worktreePath =
    requiresManagedFeatureWorktree(config) && headBranch
      ? resolveManagedWorktreePath(config, projectRootGitCwd, headBranch)
      : null;
  const managedWorktreeExists = !!worktreePath && fs.existsSync(worktreePath);
  const localFeatureBranchExists = localBranchExists(
    projectRootGitCwd,
    headBranch
  );
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

function nextExecutableTask(tasks: ParsedTasks): ParsedTasks['tasks'][number] {
  return (
    tasks.tasks.find((task) => task.status === 'DOING') ||
    tasks.tasks.find((task) => task.status === 'REVIEW') ||
    tasks.tasks.find((task) => task.status === 'TODO') ||
    tasks.tasks.find((task) => task.status !== 'DONE')!
  );
}

function allTasksDone(tasks: ParsedTasks): boolean {
  return (
    tasks.tasks.length > 0 &&
    tasks.tasks.every((task) => task.status === 'DONE')
  );
}

type ReviewTarget = {
  baseSha: string;
  targetSha: string;
  targetTree: string;
};

type TaskReviewBase = {
  reviewedHead: string;
  reviewedTree: string;
};

function resolveAgentReviewPhase(
  config: ProjectConfig,
  scope: 'plan' | 'task' | 'feature'
): AgentReviewPhaseConfig {
  if (scope === 'plan') {
    return config.workflow?.agentReview?.plan || {};
  }
  if (scope === 'task') {
    return config.workflow?.agentReview?.task || {};
  }
  return (
    config.workflow?.agentReview?.feature || config.workflow?.prePrReview || {}
  );
}

function resolveProjectReviewTarget(
  config: ProjectConfig,
  projectGitCwd: string,
  scope: 'task' | 'feature',
  taskBase: TaskReviewBase | null = null
): ReviewTarget | null {
  const pathArgs = ['--', '.'];
  const relativeDocsDir = path.relative(projectGitCwd, config.docsDir);
  const normalizedDocsDir = normalizeGitRelativePath(relativeDocsDir);
  if (
    normalizedDocsDir &&
    normalizedDocsDir !== '.' &&
    normalizedDocsDir !== '..' &&
    !normalizedDocsDir.startsWith('../')
  ) {
    pathArgs.push(`:(exclude)${normalizedDocsDir}/**`);
  }

  const targetSha =
    runGitCapture(
      ['log', '-n', '1', '--pretty=%H', ...pathArgs],
      projectGitCwd
    ) ||
    runGitCapture(['rev-parse', 'HEAD'], projectGitCwd) ||
    '';
  if (!targetSha) return null;
  const targetTree =
    runGitCapture(['rev-parse', `${targetSha}^{tree}`], projectGitCwd) || '';
  if (!targetTree) return null;

  let baseSha = '';
  if (scope === 'task' && taskBase) {
    const actualBaseTree =
      runGitCapture(
        ['rev-parse', `${taskBase.reviewedHead}^{tree}`],
        projectGitCwd
      ) || '';
    if (
      actualBaseTree === taskBase.reviewedTree &&
      taskBase.reviewedHead !== targetSha &&
      isAncestor(projectGitCwd, taskBase.reviewedHead, targetSha)
    ) {
      baseSha = taskBase.reviewedHead;
    }
  }

  if (!baseSha) {
    const baseBranch = config.workflow?.baseBranch?.trim() || 'main';
    for (const candidate of [`origin/${baseBranch}`, baseBranch]) {
      const candidateBase =
        runGitCapture(['merge-base', candidate, targetSha], projectGitCwd) ||
        '';
      if (candidateBase && candidateBase !== targetSha) {
        baseSha = candidateBase;
        break;
      }
    }
  }

  if (!baseSha) {
    baseSha =
      runGitCapture(['rev-parse', `${targetSha}^`], projectGitCwd) || targetSha;
  }

  return { baseSha, targetSha, targetTree };
}

function reviewEvidenceSatisfied(
  config: ProjectConfig,
  feature: ResolvedFeature,
  scope: 'plan' | 'task' | 'feature',
  evidence: string | null
): boolean {
  return isPrePrEvidenceSatisfied({
    docsDir: config.docsDir,
    featureDir: feature.path,
    evidence,
    evidenceMode: resolveAgentReviewPhase(config, scope).evidenceMode,
  });
}

function planReviewSatisfied(
  config: ProjectConfig,
  feature: ResolvedFeature,
  review: ParsedPlanReview,
  target: { specHash: string; planHash: string }
): boolean {
  const reviewLimitReached = reviewRoundLimitReached(
    config,
    review.reviewRound,
    review.decisionOutcome
  );
  const targetMatches =
    review.reviewedSpecHash === target.specHash &&
    review.reviewedPlanHash === target.planHash;
  return (
    review.status === 'done' &&
    reviewEvidenceSatisfied(config, feature, 'plan', review.evidence) &&
    ((review.decisionOutcome === 'approve' && targetMatches) ||
      (reviewLimitReached && !targetMatches))
  );
}

function featureReviewSatisfied(
  config: ProjectConfig,
  feature: ResolvedFeature,
  tasks: ParsedTasks,
  target: ReviewTarget | null
): boolean {
  const reviewLimitReached = reviewRoundLimitReached(
    config,
    tasks.prePrReviewRound,
    tasks.prePrDecisionOutcome
  );
  const targetMatches =
    !!target &&
    tasks.prePrReviewedHead === target.targetSha &&
    tasks.prePrReviewedTree === target.targetTree;
  return (
    !!target &&
    tasks.prePrReviewStatus === 'done' &&
    reviewEvidenceSatisfied(config, feature, 'feature', tasks.prePrEvidence) &&
    !!tasks.prePrDecision &&
    ((tasks.prePrDecisionOutcome === 'approve' && targetMatches) ||
      (reviewLimitReached && !targetMatches))
  );
}

function taskReviewEvidenceSatisfied(
  config: ProjectConfig,
  feature: ResolvedFeature,
  task: ParsedTasks['tasks'][number],
  target: ReviewTarget | null
): boolean {
  const reviewLimitReached = reviewRoundLimitReached(
    config,
    task.reviewRound,
    task.reviewDecisionOutcome
  );
  const targetMatches =
    !!target &&
    task.reviewedHead === target.targetSha &&
    task.reviewedTree === target.targetTree;
  return (
    !!target &&
    reviewEvidenceSatisfied(config, feature, 'task', task.reviewEvidence) &&
    ((task.reviewDecisionOutcome === 'approve' && targetMatches) ||
      (reviewLimitReached && !targetMatches))
  );
}

function recordedTaskReviewSatisfied(
  config: ProjectConfig,
  feature: ResolvedFeature,
  projectGitCwd: string,
  task: ParsedTasks['tasks'][number],
  currentTargetSha: string | null
): boolean {
  if (
    !currentTargetSha ||
    !task.reviewedHead ||
    !task.reviewedTree ||
    (task.reviewDecisionOutcome !== 'approve' &&
      !reviewRoundLimitReached(
        config,
        task.reviewRound,
        task.reviewDecisionOutcome
      )) ||
    !reviewEvidenceSatisfied(config, feature, 'task', task.reviewEvidence)
  ) {
    return false;
  }

  const actualTree =
    runGitCapture(
      ['rev-parse', `${task.reviewedHead}^{tree}`],
      projectGitCwd
    ) || '';
  return (
    actualTree === task.reviewedTree &&
    isAncestor(projectGitCwd, task.reviewedHead, currentTargetSha) &&
    (task.reviewDecisionOutcome === 'approve' ||
      task.reviewedHead !== currentTargetSha)
  );
}

function resolvePreviousTaskReviewBase(
  config: ProjectConfig,
  feature: ResolvedFeature,
  tasks: ParsedTasks,
  task: ParsedTasks['tasks'][number]
): TaskReviewBase | null {
  const taskIndex = tasks.tasks.indexOf(task);
  for (let index = taskIndex - 1; index >= 0; index -= 1) {
    const previous = tasks.tasks[index];
    if (
      previous.reviewDecisionOutcome === 'approve' &&
      previous.reviewedHead &&
      previous.reviewedTree &&
      reviewEvidenceSatisfied(config, feature, 'task', previous.reviewEvidence)
    ) {
      return {
        reviewedHead: previous.reviewedHead,
        reviewedTree: previous.reviewedTree,
      };
    }
  }
  return null;
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

function prExistsRemotely(
  prRef: string | null,
  feature: ResolvedFeature
): boolean {
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
  agent?: AgentReviewerConfig | AgentExecutorConfig,
  actionContext?: {
    reviewScope?: 'plan' | 'task' | 'feature';
    reviewRound?: number;
    maxReviewRounds?: number;
    taskId?: string;
    taskIdSource?: 'document' | 'synthetic';
    taskTitle?: string;
    baseSha?: string;
    targetSha?: string;
    targetTree?: string;
    specHash?: string;
    planHash?: string;
    workingDirectory?: string;
    docsDirectory?: string;
    workerContract?: WorkflowTaskWorkerContract;
    delegationContext?: WorkflowDelegationContext;
  }
): WorkflowStageAction {
  return {
    category,
    summary,
    approvalRequired,
    command,
    ...(agent
      ? {
          executor: agent.type,
          model: agent.model,
          reasoningEffort: agent.reasoningEffort,
          onUnavailable: agent.onUnavailable,
        }
      : {}),
    ...(actionContext || {}),
  };
}

function resolveAgentReviewer(
  config: ProjectConfig,
  scope: 'plan' | 'task' | 'feature'
): AgentReviewerConfig {
  const defaults = createDefaultAgentReviewerConfig();
  const configured = resolveAgentReviewPhase(config, scope).reviewer;
  const model =
    typeof configured?.model === 'string' && configured.model.trim()
      ? configured.model.trim()
      : defaults.model;
  const reasoningEffort = AGENT_REVIEW_REASONING_EFFORTS.includes(
    configured?.reasoningEffort as AgentReviewerConfig['reasoningEffort']
  )
    ? (configured?.reasoningEffort as AgentReviewerConfig['reasoningEffort'])
    : defaults.reasoningEffort;

  return {
    type: 'subagent',
    model,
    reasoningEffort,
    onUnavailable:
      configured?.onUnavailable === 'error' ? 'error' : defaults.onUnavailable,
  };
}

function resolveTaskExecutor(config: ProjectConfig): AgentExecutorConfig {
  const defaults = createDefaultAgentExecutionTaskConfig();
  const configured = config.workflow?.agentExecution?.task;
  const model =
    typeof configured?.model === 'string' && configured.model.trim()
      ? configured.model.trim()
      : defaults.model;
  const reasoningEffort = AGENT_REVIEW_REASONING_EFFORTS.includes(
    configured?.reasoningEffort as AgentExecutorConfig['reasoningEffort']
  )
    ? (configured?.reasoningEffort as AgentExecutorConfig['reasoningEffort'])
    : defaults.reasoningEffort;

  return {
    type: 'subagent',
    model,
    reasoningEffort,
    onUnavailable:
      configured?.onUnavailable === 'error' ? 'error' : defaults.onUnavailable,
  };
}

function createTaskWorkerContract(): WorkflowTaskWorkerContract {
  return {
    role: 'task_implementation_worker',
    executeDirectly: true,
    spawnSubagents: false,
    runWorkflowStage: false,
    editProjectCode: true,
    runTaskScopedVerification: true,
    followVerificationContract: true,
    addUnplannedDurableTests: false,
    editDocs: false,
    changeTaskState: false,
    commit: false,
    requestApproval: false,
    remoteActions: false,
  };
}

function createDelegationDocument(
  pathValue: string,
  purpose: string,
  hash?: string
): WorkflowDelegationDocument {
  return { path: pathValue, purpose, ...(hash ? { hash } : {}) };
}

function createPlanReviewDelegationContext(
  config: ProjectConfig,
  feature: ResolvedFeature,
  target: { specHash: string; planHash: string }
): WorkflowDelegationContext {
  const paths = getFeatureDocPaths(feature);
  return {
    version: 1,
    role: 'plan_reviewer',
    featureRef: buildFeatureRef(feature),
    docsDirectory: config.docsDir,
    requiredDocuments: [
      createDelegationDocument(
        paths.specPath,
        'Review the approved requirements and acceptance boundaries.',
        target.specHash
      ),
      createDelegationDocument(
        paths.planPath,
        'Review the implementation plan and Verification Contract.',
        target.planHash
      ),
    ],
    reviewTarget: { specHash: target.specHash, planHash: target.planHash },
  };
}

function createTaskDelegationContext(
  config: ProjectConfig,
  feature: ResolvedFeature,
  task: ParsedTasks['tasks'][number],
  workingDirectory: string,
  planContent: string,
  role: 'task_implementation_worker' | 'task_reviewer',
  reviewTarget?: { baseSha: string; targetSha: string; targetTree: string }
): WorkflowDelegationContext {
  const paths = getFeatureDocPaths(feature);
  return {
    version: 1,
    role,
    featureRef: buildFeatureRef(feature),
    docsDirectory: config.docsDir,
    workingDirectory,
    requiredDocuments: [
      createDelegationDocument(
        paths.tasksPath,
        `Use only the ${task.taskId} task block as the implementation and acceptance scope.`
      ),
      createDelegationDocument(
        paths.planPath,
        'Use the approved Verification Contract and implementation constraints.'
      ),
    ],
    referenceDocuments: [
      createDelegationDocument(
        paths.specPath,
        'Read only when the delegated task or Verification Contract references a requirement that needs clarification.'
      ),
      createDelegationDocument(
        paths.decisionsPath,
        'Read only when the delegated task or Verification Contract references a recorded technical decision.'
      ),
    ],
    task: {
      id: task.taskId,
      title: task.title,
      instructions: task.instructions,
      acceptanceCriteria: task.acceptanceCriteria,
    },
    verificationContract: extractMarkdownSection(
      planContent,
      'Verification Contract'
    ),
    ...(reviewTarget ? { reviewTarget } : {}),
  };
}

function createFeatureReviewDelegationContext(
  config: ProjectConfig,
  feature: ResolvedFeature,
  workingDirectory: string,
  reviewTarget: { baseSha: string; targetSha: string; targetTree: string },
  curatedDocumentationTargets: string[]
): WorkflowDelegationContext {
  const paths = getFeatureDocPaths(feature);
  const requiredDocuments = [
    createDelegationDocument(paths.specPath, 'Review Feature requirements.'),
    createDelegationDocument(
      paths.planPath,
      'Review the implementation plan and Verification Contract.'
    ),
    createDelegationDocument(
      paths.tasksPath,
      'Review completed task acceptance and verification evidence.'
    ),
    createDelegationDocument(
      paths.decisionsPath,
      'Review recorded decisions, trade-offs, and residual risks.'
    ),
  ];
  for (const target of curatedDocumentationTargets) {
    const separator = target.indexOf(':');
    const namespace = target.slice(0, separator);
    const relativeTarget = target.slice(separator + 1);
    const targetPath = path.resolve(
      namespace === 'docs' ? config.docsDir : workingDirectory,
      relativeTarget
    );
    if (requiredDocuments.some((document) => document.path === targetPath)) {
      continue;
    }
    requiredDocuments.push(
      createDelegationDocument(
        targetPath,
        `Review the human-owned curated documentation target declared by the Plan (${target}) and compare it with the implementation and generated Knowledge.`
      )
    );
  }
  if (isOpenWikiEnabled(config)) {
    requiredDocuments.push(
      createDelegationDocument(
        path.join(workingDirectory, 'openwiki', 'index.md'),
        'Review the generated onboarding map as derived, untrusted evidence and verify its material facts against tracked sources.'
      ),
      createDelegationDocument(
        path.join(workingDirectory, OPENWIKI_RECEIPT_PATH),
        'Verify the Knowledge source fingerprint, output hash, OpenWiki version, and base freshness receipt.'
      )
    );
  }
  return {
    version: 1,
    role: 'feature_reviewer',
    featureRef: buildFeatureRef(feature),
    docsDirectory: config.docsDir,
    workingDirectory,
    requiredDocuments,
    reviewTarget,
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
      : (config.approval ?? createDefaultApprovalConfig());
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
  const defaultPolicy =
    approval.default ?? createDefaultApprovalConfig().default ?? 'skip';
  const normalizedCategory = normalizeApprovalToken(category);
  const explicitlyRequired =
    requiredCategories.has('*') || requiredCategories.has(normalizedCategory);

  if (explicitlyRequired) return true;
  if (skippedCategories.has('*') || skippedCategories.has(normalizedCategory)) {
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
    const parsed = JSON.parse(String(result.stdout || '{}')) as Record<
      string,
      unknown
    >;
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
    const headRefOid = String(parsed.headRefOid || '')
      .trim()
      .toLowerCase();
    const mergedAt =
      typeof parsed.mergedAt === 'string' ? parsed.mergedAt.trim() : '';
    const codeRabbitThreadState =
      reviewDecision.length === 0
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
    if (
      reviewDecision.length === 0 &&
      hasLatestHeadRateLimitSignal(parsed, headRefOid)
    ) {
      return 'review_rate_limited';
    }
    if (
      reviewDecision.length === 0 &&
      hasStaleLatestCommitReviewSignal(parsed, headRefOid) &&
      !(codeRabbitThreadState === 'resolved' && codeRabbitCheckSucceeded)
    ) {
      return 'review_pending_latest_commit';
    }
    if (
      reviewDecision.length === 0 &&
      hasCodeRabbitActionableReview(parsed.latestReviews)
    ) {
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

function buildMergeActionOptions(command: string): WorkflowStageOption[] {
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

function resolvePlanReviewPayload(
  config: ProjectConfig,
  feature: ResolvedFeature,
  review: ParsedPlanReview,
  target: { specHash: string; planHash: string }
): WorkflowStagePayload {
  const targetMatches =
    review.reviewedSpecHash === target.specHash &&
    review.reviewedPlanHash === target.planHash;
  const maxReviewRounds = resolveMaxReviewRounds(config);
  const reviewRound = review.reviewRound || 1;
  const requestedReviewRound =
    !targetMatches && review.decisionOutcome ? reviewRound + 1 : reviewRound;
  const nextReviewRound = Math.min(requestedReviewRound, maxReviewRounds);
  const actionContext = {
    reviewScope: 'plan' as const,
    reviewRound: nextReviewRound,
    maxReviewRounds,
    specHash: target.specHash,
    planHash: target.planHash,
    docsDirectory: config.docsDir,
    delegationContext: createPlanReviewDelegationContext(
      config,
      feature,
      target
    ),
  };

  if (review.decisionOutcome === 'changes_requested') {
    if (targetMatches && reviewRound <= maxReviewRounds) {
      const finalReviewRound = reviewRound >= maxReviewRounds;
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'plan_review_fix',
        nextAction: buildAction(
          'plan_review_fix',
          finalReviewRound
            ? `Address the independent Plan review findings in spec.md or plan.md, keep review round ${reviewRound}, and do not request another review. The resulting document hash changes will be preserved with the remaining findings as residual risks before automatic Plan promotion.`
            : `Address the independent Plan review findings in spec.md or plan.md, record review round ${reviewRound + 1}, keep implementation blocked, and request a fresh review for the resulting document hashes.`,
          false,
          null,
          undefined,
          { ...actionContext, reviewRound }
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'PLAN_REVIEW_NOT_APPROVED',
      };
    }
  }

  if (
    review.decisionOutcome === 'changes_requested' &&
    reviewRound >= maxReviewRounds
  ) {
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'plan_review',
      nextAction: buildAction(
        'plan_review',
        `The Plan review round limit was reached at round ${reviewRound}. Do not delegate another review. Repair or record the final-round evidence if needed, preserve the remaining findings and any post-review hash changes as residual risks, and continue through automatic Plan promotion.`,
        false,
        null,
        undefined,
        { ...actionContext, reviewRound: maxReviewRounds }
      ),
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: 'PLAN_REVIEW_NOT_APPROVED',
    };
  }

  if (targetMatches && review.decisionOutcome === 'blocked') {
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'plan_review',
      nextAction: buildAction(
        'plan_review',
        'Resolve the recorded Plan review blocker before Plan approval.',
        false,
        null,
        undefined,
        { ...actionContext, reviewRound }
      ),
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: 'PLAN_REVIEW_NOT_APPROVED',
    };
  }

  return {
    status: 'ok',
    reasonCode: 'WORKFLOW_STAGE_RESOLVED',
    docsDir: config.docsDir,
    featureRef: buildFeatureRef(feature),
    stage: 'plan_review',
    nextAction: buildAction(
      'plan_review',
      `Delegate fresh read-only Plan review round ${nextReviewRound} of spec.md and plan.md. Verify the Verification Contract, NONE/UPDATE/ADD decisions, requirement coverage, independent oracles, stable observation boundaries, realistic failure/rollback cases, exclusions, and focused/full verification scope. Record Plan Review Round, status, evidence, decision, reviewer metadata, Reviewed Spec Hash, and Reviewed Plan Hash without modifying the documents.`,
      false,
      null,
      resolveAgentReviewer(config, 'plan'),
      actionContext
    ),
    approvalRequired: false,
    implementationAllowed: false,
    blockedReasonCode: 'PLAN_REVIEW_NOT_APPROVED',
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
  const specContent = await readFileIfExists(
    path.join(config.docsDir, paths.specPath)
  );
  const planContent = await readFileIfExists(
    path.join(config.docsDir, paths.planPath)
  );
  const tasksContent = await readFileIfExists(
    path.join(config.docsDir, paths.tasksPath)
  );
  const issueContent = await readFileIfExists(
    path.join(config.docsDir, paths.issuePath)
  );
  const prContent = await readFileIfExists(
    path.join(config.docsDir, paths.prPath)
  );

  const specStatus = parseApprovalStatus(
    extractFieldValue(specContent || '', ['Status', '상태']) || undefined
  );
  const planStatus = parseApprovalStatus(
    extractFieldValue(planContent || '', ['Status', '상태']) || undefined
  );
  const tasks = parseTasksDoc(tasksContent || '', feature);
  const planReview = parsePlanReview(planContent || '');
  const planReviewTarget = buildPlanReviewTarget(
    specContent || '',
    planContent || ''
  );
  const curatedDocumentationImpact = parseCuratedDocumentationImpact(
    planContent || ''
  );
  const curatedDocumentationImpactErrors = [
    ...curatedDocumentationImpact.errors,
  ];
  if (curatedDocumentationImpact.grandfathered) {
    const terminal = isTerminalFeatureForCuratedImpact({
      spec: specContent || '',
      plan: planContent || '',
      tasks: tasksContent || '',
    });
    const fingerprint = await computeFeatureDocumentationFingerprint(
      feature.path
    );
    if (!terminal.terminal) {
      curatedDocumentationImpactErrors.push(
        `Grandfathered Feature is no longer terminal: ${terminal.reasons.join(', ')}.`
      );
    }
    if (curatedDocumentationImpact.grandfatheredFingerprint !== fingerprint) {
      curatedDocumentationImpactErrors.push(
        'Grandfathered Feature documentation changed after its provenance marker was recorded.'
      );
    }
  }
  const curatedDocumentationImpactValid =
    curatedDocumentationImpact.valid &&
    curatedDocumentationImpactErrors.length === 0;
  const planReviewAutoCompleted =
    planReview.status === 'done' &&
    reviewEvidenceSatisfied(config, feature, 'plan', planReview.evidence) &&
    reviewRoundLimitReached(
      config,
      planReview.reviewRound,
      planReview.decisionOutcome
    ) &&
    (planReview.reviewedSpecHash !== planReviewTarget.specHash ||
      planReview.reviewedPlanHash !== planReviewTarget.planHash);
  const enforcePlanReview =
    requirements.planReviewEnabled &&
    (tasks.docStatus !== 'approved' || planReview.hasMetadata);
  const issueDraft = parseWorkflowDraftMetadataExtended(issueContent || '');
  const prDraft = parseWorkflowDraftMetadataExtended(prContent || '');
  const remoteReviewState =
    requirements.requireReview && tasks.prLink
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

  if (
    (planStatus === 'review' || planStatus === 'approved') &&
    !curatedDocumentationImpactValid
  ) {
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'plan',
      nextAction: buildAction(
        'plan_write',
        `Complete the Curated Documentation Impact assessment before Plan review or approval. ${curatedDocumentationImpactErrors.join(' ')}`,
        false
      ),
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: 'PLAN_NOT_APPROVED',
    };
  }

  if (planStatus !== 'approved') {
    const isReviewStage = planStatus === 'review';
    if (
      isReviewStage &&
      enforcePlanReview &&
      !planReviewSatisfied(config, feature, planReview, planReviewTarget)
    ) {
      return resolvePlanReviewPayload(
        config,
        feature,
        planReview,
        planReviewTarget
      );
    }
    const approvalRequired =
      isReviewStage && !planReviewAutoCompleted
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
          ? planReviewAutoCompleted
            ? 'The Plan review round limit was reached. Preserve the remaining findings and post-review hash changes as residual risks, promote plan.md from Review to Approved, and continue automatically without asking the user for review approval.'
            : approvalRequired
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

  if (
    enforcePlanReview &&
    !planReviewSatisfied(config, feature, planReview, planReviewTarget)
  ) {
    return resolvePlanReviewPayload(
      config,
      feature,
      planReview,
      planReviewTarget
    );
  }

  const taskDocumentationTargets = new Set(
    tasks.tasks.flatMap((task) => task.documentationTargets)
  );
  const uncoveredDocumentationTargets =
    curatedDocumentationImpact.targets.filter(
      (target) => !taskDocumentationTargets.has(target)
    );
  const curatedTargetCoverageMissing =
    uncoveredDocumentationTargets.length > 0 &&
    (tasks.docStatus === 'review' || tasks.docStatus === 'approved');

  if (
    tasks.tasks.length === 0 ||
    tasks.docStatus !== 'approved' ||
    curatedTargetCoverageMissing
  ) {
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
        curatedTargetCoverageMissing
          ? 'tasks_write'
          : isReviewStage
            ? 'tasks_approve'
            : 'tasks_write',
        curatedTargetCoverageMissing
          ? `Link every Curated Documentation Impact target from a task Docs section. Missing: ${uncoveredDocumentationTargets.join(', ')}`
          : isReviewStage
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
      const issueCreateApprovalRequired = issueReady && !issueCreated;
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
        nextAction:
          issueReady && !issueCreated
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
  let missingExpectedWorktreeBranch: string | null = null;
  if (requirements.requireWorktree) {
    const expectedBranch = resolveExpectedBranch(feature, tasks);
    if (expectedBranch) {
      const existingWorktreePath = feature.git.managedWorktree
        ? feature.git.projectGitCwd
        : await resolveExistingExpectedWorktreePath(
            config,
            feature.git.projectGitCwd,
            expectedBranch
          );
      if (existingWorktreePath) {
        effectiveProjectGitCwd = existingWorktreePath;
      } else {
        missingExpectedWorktreeBranch = expectedBranch;
      }
    }
  }

  let resolvedLocalState: Awaited<
    ReturnType<typeof resolveLocalIntegrationContext>
  > | null = null;
  if (
    allTasksDone(tasks) &&
    config.workflow?.mode === 'local' &&
    resolveLocalCompletionStrategy(config) !== 'none'
  ) {
    resolvedLocalState = await resolveLocalIntegrationContext(config, feature);
  }

  const remoteReviewAlreadyComplete =
    currentReviewState === 'merged' &&
    tasks.prStatus === 'approved' &&
    prDraft.prStatus === 'approved';
  const localIntegrationReachedBase =
    resolvedLocalState?.state?.status === 'merged' ||
    resolvedLocalState?.state?.status === 'verified' ||
    resolvedLocalState?.state?.status === 'cleaned';
  const completedKnowledgeStillOnFeatureBranch =
    allTasksDone(tasks) &&
    isOpenWikiEnabled(config) &&
    !resolvedLocalState?.integrationComplete &&
    !localIntegrationReachedBase &&
    !remoteReviewAlreadyComplete;

  if (
    requirements.requireBranch &&
    (!allTasksDone(tasks) || completedKnowledgeStillOnFeatureBranch)
  ) {
    const expectedBranch = resolveExpectedBranch(feature, tasks);
    const currentBranch =
      runGitCapture(['branch', '--show-current'], effectiveProjectGitCwd) ||
      runGitCapture(
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        effectiveProjectGitCwd
      ) ||
      null;
    if (
      expectedBranch &&
      (currentBranch !== expectedBranch || !!missingExpectedWorktreeBranch)
    ) {
      const branchCommand = buildExpectedBranchCommand(
        config,
        feature,
        expectedBranch,
        requirements.requireWorktree
      );
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'branch',
        nextAction: buildAction(
          'branch_create',
          requirements.requireWorktree
            ? `Create or reuse the managed worktree for ${expectedBranch} before ${allTasksDone(tasks) ? 'the completed Feature Knowledge gate' : 'implementation starts'}.`
            : `Switch the project repo to ${expectedBranch} before ${allTasksDone(tasks) ? 'the completed Feature Knowledge gate' : 'implementation starts'}.`,
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
  const currentTaskReviewTip = requirements.taskReviewEnabled
    ? resolveProjectReviewTarget(config, effectiveProjectGitCwd, 'task')
    : null;
  const unreviewedDoneTask = requirements.taskReviewEnabled
    ? tasks.tasks.find(
        (task) =>
          task.status === 'DONE' &&
          !recordedTaskReviewSatisfied(
            config,
            feature,
            effectiveProjectGitCwd,
            task,
            currentTaskReviewTip?.targetSha || null
          )
      ) || null
    : null;
  const reviewTask =
    unreviewedDoneTask ||
    tasks.tasks.find((task) => task.status === 'REVIEW') ||
    null;

  if (requirements.taskReviewEnabled && reviewTask) {
    if (docsDirty || projectDirty) {
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
            gateFailureReason:
              'the task must have a clean checkpoint commit before independent review',
          }),
          false
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'TASK_COMMIT_REQUIRED',
      };
    }

    const reviewTarget = resolveProjectReviewTarget(
      config,
      effectiveProjectGitCwd,
      'task',
      resolvePreviousTaskReviewBase(config, feature, tasks, reviewTask)
    );
    if (!reviewTarget) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'task_commit',
        nextAction: buildAction(
          'task_commit',
          'Create a project commit for the task before requesting independent review.',
          false
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'TASK_COMMIT_REQUIRED',
      };
    }
    const reviewContext = {
      reviewScope: 'task' as const,
      reviewRound: reviewTask.reviewRound || 1,
      maxReviewRounds: resolveMaxReviewRounds(config),
      ...(reviewTask.taskId ? { taskId: reviewTask.taskId } : {}),
      ...reviewTarget,
      delegationContext: createTaskDelegationContext(
        config,
        feature,
        reviewTask,
        effectiveProjectGitCwd,
        planContent || '',
        'task_reviewer',
        reviewTarget
      ),
    };
    const evidenceMatchesTarget =
      reviewTask.reviewedHead === reviewTarget.targetSha &&
      reviewTask.reviewedTree === reviewTarget.targetTree;

    if (reviewTask.reviewDecisionOutcome === 'changes_requested') {
      if (
        evidenceMatchesTarget &&
        reviewContext.reviewRound <= reviewContext.maxReviewRounds
      ) {
        const finalReviewRound =
          reviewContext.reviewRound >= reviewContext.maxReviewRounds;
        return {
          status: 'ok',
          reasonCode: 'WORKFLOW_STAGE_RESOLVED',
          docsDir: config.docsDir,
          featureRef: buildFeatureRef(feature),
          stage: 'task_review_fix',
          nextAction: buildAction(
            'task_review_fix',
            finalReviewRound
              ? `Address the independent review findings for ${reviewTask.taskId || reviewTask.title}, return the task to REVIEW, and commit the new code tip without requesting another review. Preserve any remaining findings and the post-review target change as residual risks before automatic task completion.`
              : `Address the independent review findings for ${reviewTask.taskId || reviewTask.title}, return the task to REVIEW, commit the new code tip, and request fresh review round ${reviewContext.reviewRound + 1}.`,
            false,
            null,
            undefined,
            reviewContext
          ),
          approvalRequired: false,
          implementationAllowed: true,
          blockedReasonCode: 'TASK_REVIEW_NOT_APPROVED',
        };
      }
    }

    if (
      evidenceMatchesTarget &&
      reviewTask.reviewDecisionOutcome === 'blocked'
    ) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'task_review',
        nextAction: buildAction(
          'task_review',
          `Resolve the recorded review blocker for ${reviewTask.taskId || reviewTask.title} before continuing.`,
          false,
          null,
          undefined,
          reviewContext
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'TASK_REVIEW_NOT_APPROVED',
      };
    }

    if (
      taskReviewEvidenceSatisfied(config, feature, reviewTask, reviewTarget)
    ) {
      const completionSummary =
        reviewTask.reviewDecisionOutcome === 'approve'
          ? reviewTask.status === 'DONE'
            ? `The independent review approved ${reviewTask.taskId || reviewTask.title} at the current code tree. Commit the review evidence before continuing.`
            : `The independent review approved ${reviewTask.taskId || reviewTask.title} at the current code tree. Mark the task DONE and commit the review evidence before starting another task.`
          : reviewTask.status === 'DONE'
            ? `The review round limit was reached for ${reviewTask.taskId || reviewTask.title}. Keep the remaining findings${evidenceMatchesTarget ? '' : ' and any post-review unreviewed target changes'} as residual risks and commit the review evidence before continuing automatically.`
            : `The review round limit was reached for ${reviewTask.taskId || reviewTask.title}. Keep the remaining findings${evidenceMatchesTarget ? '' : ' and any post-review unreviewed target changes'} as residual risks, mark the task DONE, and commit the review evidence before continuing automatically.`;
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'task_review',
        nextAction: buildAction(
          'task_review_complete',
          completionSummary,
          false,
          null,
          undefined,
          reviewContext
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'TASK_REVIEW_NOT_APPROVED',
      };
    }

    if (
      reviewTask.reviewDecisionOutcome === 'changes_requested' &&
      reviewContext.reviewRound >= reviewContext.maxReviewRounds
    ) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'task_review',
        nextAction: buildAction(
          'task_review',
          `The review round limit was reached for ${reviewTask.taskId || reviewTask.title} at round ${reviewContext.reviewRound}. Do not delegate another review. Repair or record the final-round evidence if needed and preserve the remaining findings and any post-review target changes as residual risks before completing the task automatically.`,
          false,
          null,
          undefined,
          reviewContext
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'TASK_REVIEW_NOT_APPROVED',
      };
    }

    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'task_review',
      nextAction: buildAction(
        'task_review',
        `Delegate fresh read-only review round ${evidenceMatchesTarget ? reviewContext.reviewRound : reviewTask.reviewDecisionOutcome ? Math.min(reviewContext.reviewRound + 1, reviewContext.maxReviewRounds) : reviewContext.reviewRound} of ${reviewTask.taskId || reviewTask.title} for ${reviewTarget.baseSha}..${reviewTarget.targetSha}. Record Review Round, evidence, decision, reviewer metadata, Reviewed Head, and Reviewed Tree without modifying code.`,
        false,
        null,
        resolveAgentReviewer(config, 'task'),
        {
          ...reviewContext,
          reviewRound:
            !evidenceMatchesTarget && reviewTask.reviewDecisionOutcome
              ? Math.min(
                  reviewContext.reviewRound + 1,
                  reviewContext.maxReviewRounds
                )
              : reviewContext.reviewRound,
        }
      ),
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: 'TASK_REVIEW_NOT_APPROVED',
    };
  }

  const pendingDoneTransitions = countPendingDoneTransitions(feature) || 0;
  const knowledgeOnlyDirty =
    isOpenWikiEnabled(config) &&
    allTasksDone(tasks) &&
    areChangesOpenWikiOnly(effectiveProjectGitCwd);
  const taskProjectDirty = projectDirty && !knowledgeOnlyDirty;
  const taskCommitCheckpointRequired =
    !activeTaskOpen &&
    !!lastDoneTask &&
    (taskProjectDirty ||
      (config.docsRepo === 'standalone' && docsDirty) ||
      pendingDoneTransitions > 0);

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
          projectDirty: taskProjectDirty,
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

  if (
    allTasksDone(tasks) &&
    missingExpectedWorktreeBranch &&
    !resolvedLocalState?.integrationComplete &&
    !localIntegrationReachedBase &&
    !remoteReviewAlreadyComplete
  ) {
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'branch',
      nextAction: buildAction(
        'branch_create',
        `Restore or create the managed worktree for ${missingExpectedWorktreeBranch} before project-wide documentation or Knowledge synchronization.`,
        false,
        buildExpectedBranchCommand(
          config,
          feature,
          missingExpectedWorktreeBranch,
          true
        )
      ),
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: 'BRANCH_NOT_READY',
    };
  }

  if (
    allTasksDone(tasks) &&
    curatedDocumentationImpact.schemaStatus === 'current-v2'
  ) {
    const undeclaredCuratedChanges =
      await collectUndeclaredCuratedDocumentationChanges({
        config,
        feature,
        tasks,
        projectGitCwd: effectiveProjectGitCwd,
        declaredTargets: curatedDocumentationImpact.targets,
      });
    if (undeclaredCuratedChanges.length > 0) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'task_commit',
        nextAction: buildAction(
          'task_commit',
          `Reconcile curated documentation changes before Knowledge sync or Feature review. Declare these changed targets in the Plan and a task Docs list, or revert changes that do not belong to this Feature: ${undeclaredCuratedChanges.join(', ')}.`,
          false
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'TASK_COMMIT_REQUIRED',
      };
    }
  }

  if (allTasksDone(tasks) && curatedDocumentationImpact.targets.length > 0) {
    const documentationEvidenceErrors =
      await collectDocumentationTargetEvidenceErrors({
        config,
        feature,
        tasks,
        projectGitCwd: effectiveProjectGitCwd,
        targets: curatedDocumentationImpact.targets,
      });
    if (documentationEvidenceErrors.length > 0) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'task_commit',
        nextAction: buildAction(
          'task_commit',
          `Complete and commit every curated documentation target with the active Feature scope before Knowledge sync or Feature review. ${documentationEvidenceErrors.join(' ')}`,
          false
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'TASK_COMMIT_REQUIRED',
      };
    }
  }

  if (allTasksDone(tasks) && isOpenWikiEnabled(config)) {
    const knowledgeState = await inspectOpenWikiKnowledge({
      config,
      featureRef: feature.folderName,
      component: feature.type,
      projectCwd: effectiveProjectGitCwd,
    });
    const knowledgeCommand = `npx lee-spec-kit knowledge sync ${buildFeatureArgs(feature)} --json`;

    if (knowledgeState.status === 'setup_required') {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'knowledge_setup',
        nextAction: buildAction(
          'knowledge_setup',
          `${knowledgeState.detail || 'Prepare a supported OpenWiki runtime.'} Run the doctor again after setup; lee-spec-kit will not install OpenWiki implicitly.`,
          false,
          `npx lee-spec-kit knowledge doctor ${buildFeatureArgs(feature)} --json`
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'KNOWLEDGE_SETUP_REQUIRED',
      };
    }

    if (knowledgeState.status === 'sync_required') {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'knowledge_sync',
        nextAction: buildAction(
          'knowledge_sync',
          `Synchronize the required OpenWiki layer in ${knowledgeState.projectRoot}. Current state: ${knowledgeState.reasonCode}.`,
          false,
          knowledgeCommand
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'KNOWLEDGE_SYNC_REQUIRED',
      };
    }

    if (knowledgeState.status === 'commit_required') {
      const scope =
        resolveFeatureCommitScope({
          issueNumber: tasks.issueNumber,
          featureId: feature.id,
          workflowMode: config.workflow?.mode,
        }) || feature.id;
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'knowledge_commit',
        nextAction: buildAction(
          'knowledge_commit',
          `Commit only the verified Knowledge paths (${knowledgeState.changedPaths.join(', ')}) with subject "chore(${scope}): refresh OpenWiki knowledge layer".`,
          false
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'KNOWLEDGE_COMMIT_REQUIRED',
      };
    }

    if (knowledgeState.status === 'blocked') {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'knowledge_sync',
        nextAction: buildAction(
          'knowledge_sync',
          `Resolve the Knowledge blocker before continuing: ${knowledgeState.detail || knowledgeState.reasonCode}`,
          false
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'KNOWLEDGE_SYNC_REQUIRED',
      };
    }
  }

  const featureReviewNeededForLifecycle =
    allTasksDone(tasks) &&
    requirements.featureReviewEnabled &&
    !resolvedLocalState?.integrationComplete &&
    !remoteReviewAlreadyComplete;

  if (featureReviewNeededForLifecycle) {
    const expectedBranch = resolveExpectedBranch(feature, tasks);
    const currentBranch =
      runGitCapture(['branch', '--show-current'], effectiveProjectGitCwd) ||
      runGitCapture(
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        effectiveProjectGitCwd
      ) ||
      null;
    if (
      requirements.requireBranch &&
      expectedBranch &&
      currentBranch !== expectedBranch
    ) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'branch',
        nextAction: buildAction(
          'branch_create',
          requirements.requireWorktree
            ? `Restore or create the managed worktree for ${expectedBranch} before Feature review.`
            : `Switch back to ${expectedBranch} before Feature review.`,
          false,
          buildExpectedBranchCommand(
            config,
            feature,
            expectedBranch,
            requirements.requireWorktree
          )
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'BRANCH_NOT_READY',
      };
    }

    const reviewTarget = resolveProjectReviewTarget(
      config,
      effectiveProjectGitCwd,
      'feature'
    );
    const reviewContext = reviewTarget
      ? {
          reviewScope: 'feature' as const,
          reviewRound: tasks.prePrReviewRound || 1,
          maxReviewRounds: resolveMaxReviewRounds(config),
          ...reviewTarget,
          delegationContext: createFeatureReviewDelegationContext(
            config,
            feature,
            effectiveProjectGitCwd,
            reviewTarget,
            curatedDocumentationImpact.targets
          ),
        }
      : null;
    const evidenceMatchesTarget =
      !!reviewTarget &&
      tasks.prePrReviewedHead === reviewTarget.targetSha &&
      tasks.prePrReviewedTree === reviewTarget.targetTree;

    if (reviewContext && tasks.prePrDecisionOutcome === 'changes_requested') {
      if (
        evidenceMatchesTarget &&
        reviewContext.reviewRound <= reviewContext.maxReviewRounds
      ) {
        const finalReviewRound =
          reviewContext.reviewRound >= reviewContext.maxReviewRounds;
        return {
          status: 'ok',
          reasonCode: 'WORKFLOW_STAGE_RESOLVED',
          docsDir: config.docsDir,
          featureRef: buildFeatureRef(feature),
          stage: 'feature_review_fix',
          nextAction: buildAction(
            'feature_review_fix',
            finalReviewRound
              ? `Address the Feature review findings and commit the remediation without requesting another review. Preserve any remaining findings and the post-review target change as residual risks before continuing automatically.`
              : `Address the Feature review findings, commit the remediation, record review round ${reviewContext.reviewRound + 1}, and request a fresh review of the new code tree before implementation approval.`,
            false,
            null,
            undefined,
            reviewContext
          ),
          approvalRequired: false,
          implementationAllowed: true,
          blockedReasonCode: 'PRE_PR_REVIEW_NOT_APPROVED',
        };
      }
    }

    if (
      reviewContext &&
      evidenceMatchesTarget &&
      tasks.prePrDecisionOutcome === 'blocked'
    ) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'pre_pr_review',
        nextAction: buildAction(
          'pre_pr_review',
          'Resolve the recorded Feature review blocker before implementation approval or integration.',
          false,
          null,
          undefined,
          reviewContext
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'PRE_PR_REVIEW_NOT_APPROVED',
      };
    }

    if (!featureReviewSatisfied(config, feature, tasks, reviewTarget)) {
      const rawRequestedRound =
        reviewContext && !evidenceMatchesTarget && tasks.prePrDecisionOutcome
          ? reviewContext.reviewRound + 1
          : reviewContext?.reviewRound;
      const requestedRound =
        reviewContext && typeof rawRequestedRound === 'number'
          ? Math.min(rawRequestedRound, reviewContext.maxReviewRounds)
          : rawRequestedRound;
      const reviewLimitExhausted =
        !!reviewContext &&
        tasks.prePrDecisionOutcome === 'changes_requested' &&
        reviewContext.reviewRound >= reviewContext.maxReviewRounds;
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'pre_pr_review',
        nextAction: buildAction(
          'pre_pr_review',
          reviewLimitExhausted
            ? `The Feature review round limit was reached at round ${reviewContext.reviewRound}. Do not delegate another review. Repair or record the final-round evidence if needed and preserve the remaining findings and any post-review target changes as residual risks before continuing automatically.`
            : reviewTarget
              ? `Delegate independent read-only Feature review round ${requestedRound} to a fresh subagent for ${reviewTarget.baseSha}..${reviewTarget.targetSha}. Record Review Round, findings, decision, reviewer metadata, Pre-PR Reviewed Head, and Pre-PR Reviewed Tree as evidence.`
              : 'Create a project commit before requesting the independent Feature review.',
          false,
          null,
          reviewTarget && !reviewLimitExhausted
            ? resolveAgentReviewer(config, 'feature')
            : undefined,
          reviewContext
            ? { ...reviewContext, reviewRound: requestedRound }
            : undefined
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'PRE_PR_REVIEW_NOT_APPROVED',
      };
    }
  }

  if (!allTasksDone(tasks)) {
    const currentTask = nextExecutableTask(tasks);
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
    const delegationGuidance = requirements.taskExecutionEnabled
      ? ' Delegate implementation and task-scoped verification to a fresh configured subagent under the returned workerContract. The worker executes directly and must not run workflow-stage or delegate again. The main agent retains docs updates, task state transitions, commits, approvals, and remote actions'
      : '';
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'implementation',
      nextAction: buildAction(
        'task_execute',
        `Continue the next implementation task: ${currentTask.title}.${delegationGuidance}${requirements.taskReviewEnabled ? ' When implementation and checks are complete, move it to REVIEW instead of DONE' : ''}${commitWarning}`,
        false,
        null,
        requirements.taskExecutionEnabled
          ? resolveTaskExecutor(config)
          : undefined,
        {
          taskId: currentTask.taskId,
          taskIdSource: currentTask.taskIdSource,
          taskTitle: currentTask.title,
          workingDirectory: effectiveProjectGitCwd,
          ...(requirements.taskExecutionEnabled
            ? {
                docsDirectory: config.docsDir,
                workerContract: createTaskWorkerContract(),
                delegationContext: createTaskDelegationContext(
                  config,
                  feature,
                  currentTask,
                  effectiveProjectGitCwd,
                  planContent || '',
                  'task_implementation_worker'
                ),
              }
            : {}),
        }
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
    config.workflow?.mode === 'local' &&
    resolveLocalCompletionStrategy(config) !== 'none'
  ) {
    const localState =
      resolvedLocalState ||
      (await resolveLocalIntegrationContext(config, feature));
    const localVerifyCommand = `npx lee-spec-kit local verify ${buildFeatureArgs(feature)} --json`;
    const localMergeBaseCommand = `npx lee-spec-kit local merge ${buildFeatureArgs(feature)} --json`;

    if (localState.cleanedIntegrationStillValid) {
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

    if (!localState.integrationComplete) {
      const featureVerified =
        !!localState.state &&
        ['feature_verified', 'merged', 'verified', 'cleaned'].includes(
          localState.state.status
        ) &&
        localState.state.verifiedFeatureTip === localState.featureTip &&
        localState.state.verifiedFeatureTree === localState.featureTree;
      const featureVerificationFailed =
        localState.state?.status === 'feature_failed' &&
        localState.state.featureTip === localState.featureTip;

      if (featureVerificationFailed) {
        return {
          status: 'ok',
          reasonCode: 'WORKFLOW_STAGE_RESOLVED',
          docsDir: config.docsDir,
          featureRef: buildFeatureRef(feature),
          stage: 'feature_remediation',
          nextAction: buildAction(
            'feature_remediation',
            `Fix the failed checks in ${localState.featureBranch} at ${localState.featureWorktree}, commit the remediation, then verify the new Feature tip. Re-run the command without code changes to retry an environmental failure.`,
            false,
            localVerifyCommand
          ),
          approvalRequired: false,
          implementationAllowed: true,
          blockedReasonCode: 'FEATURE_REMEDIATION_REQUIRED',
        };
      }

      if (!featureVerified) {
        return {
          status: 'ok',
          reasonCode: 'WORKFLOW_STAGE_RESOLVED',
          docsDir: config.docsDir,
          featureRef: buildFeatureRef(feature),
          stage: 'feature_verify',
          nextAction: buildAction(
            'feature_verify',
            `Run the configured Feature checks in ${localState.featureBranch} before integration and bind the result to its exact commit and tree.`,
            false,
            localVerifyCommand
          ),
          approvalRequired: false,
          implementationAllowed: false,
          blockedReasonCode: 'FEATURE_VERIFICATION_REQUIRED',
        };
      }

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
    const prCreated = !!tasks.prLink && prExistsRemotely(tasks.prLink, feature);
    if (!prCreated || !prReady) {
      const prCreateApprovalRequired = prReady && !prCreated;
      const prCreateCommand = `npx lee-spec-kit github pr ${buildFeatureArgs(feature)} --create --confirm OK`;
      const prCreateOptions = prCreateApprovalRequired
        ? buildApprovalActionOptions({
            approveSummary:
              'Create the GitHub PR now and sync the PR metadata back into tasks.md.',
            holdSummary: 'Keep the PR in Ready state but do not create it yet.',
            remoteCommand: prCreateCommand,
          })
        : undefined;
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'pr',
        nextAction:
          prReady && !prCreated
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

  if (
    requirements.requireReview &&
    currentReviewState === 'merged' &&
    reviewApprovedInDocs
  ) {
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

  if (
    requirements.requireReview &&
    (!reviewApprovedInDocs || currentReviewState !== 'approved')
  ) {
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
    const mergeCommand = `npx lee-spec-kit github pr ${buildFeatureArgs(feature)} --merge --confirm OK`;
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

  const latestReviewHead = findLatestCodeRabbitReviewedHead(
    parsed.latestReviews
  );
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
    const parsed = JSON.parse(String(result.stdout || '{}')) as Record<
      string,
      unknown
    >;
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

function hasSuccessfulCodeRabbitStatusCheck(
  statusChecksValue: unknown
): boolean {
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
    const authorLogin = extractNestedString(entry, [
      'author',
      'login',
    ]).toLowerCase();
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
    const authorLogin = extractNestedString(entry, [
      'author',
      'login',
    ]).toLowerCase();
    if (!authorLogin.startsWith('coderabbitai')) return false;

    const body = String((entry as Record<string, unknown>).body || '');
    if (/Actionable comments posted:\s*0\b/i.test(body)) return true;
    return /no actionable comments (?:were )?(?:generated|found|posted)/i.test(
      body
    );
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
    const authorLogin = extractNestedString(entry, [
      'author',
      'login',
    ]).toLowerCase();
    if (authorLogin !== 'coderabbitai') continue;
    const body = String((entry as Record<string, unknown>).body || '');
    if (!isCodeRabbitRateLimitBody(body, headRefOid)) continue;
    const createdAt = String(
      (entry as Record<string, unknown>).createdAt || ''
    ).trim();
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
    const authorLogin = extractNestedString(entry, [
      'author',
      'login',
    ]).toLowerCase();
    if (authorLogin !== 'coderabbitai') continue;
    const submittedAt = String(
      (entry as Record<string, unknown>).submittedAt || ''
    ).trim();
    if (!submittedAt) continue;
    if (!latest || submittedAt > latest) {
      latest = submittedAt;
    }
  }

  return latest;
}

function findLatestCodeRabbitReviewedHead(
  reviewsValue: unknown
): string | null {
  if (!Array.isArray(reviewsValue)) {
    return null;
  }

  let latestReview: {
    submittedAt: string;
    reviewedHead: string | null;
  } | null = null;
  for (const entry of reviewsValue) {
    if (!entry || typeof entry !== 'object') continue;
    const authorLogin = extractNestedString(entry, [
      'author',
      'login',
    ]).toLowerCase();
    if (authorLogin !== 'coderabbitai') continue;
    const submittedAt = String(
      (entry as Record<string, unknown>).submittedAt || ''
    ).trim();
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
  const match = body.match(
    /between\s+[0-9a-f]{7,40}\s+and\s+([0-9a-f]{7,40})/i
  );
  if (!match) {
    return null;
  }
  return match[1].trim().toLowerCase();
}

function matchesCommitReference(
  headRefOid: string,
  reviewedHead: string
): boolean {
  const normalizedHead = headRefOid.trim().toLowerCase();
  const normalizedReviewedHead = reviewedHead.trim().toLowerCase();
  return (
    normalizedHead === normalizedReviewedHead ||
    normalizedHead.startsWith(normalizedReviewedHead) ||
    normalizedReviewedHead.startsWith(normalizedHead)
  );
}

function extractNestedString(value: unknown, pathSegments: string[]): string {
  let current: unknown = value;
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object') {
      return '';
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current.trim() : '';
}

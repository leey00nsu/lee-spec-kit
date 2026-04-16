import fs from 'fs-extra';
import path from 'node:path';
import type { ProjectConfig } from '../config/types.js';
import { getConfig } from './config.js';
import { createCliError } from './cli-error.js';
import {
  getFeatureDocPaths,
  resolveFeatureSelection,
  type FeatureSelectionState,
  type ResolvedFeature,
} from './feature-resolver.js';
import { runGitCapture } from './git-run.js';
import {
  parseWorkflowDraftMetadata,
  type WorkflowDraftMetadata,
} from '../services/GithubWorkflowService.js';
import { runProcess } from '../commands/github/process.js';

export type WorkflowStageId =
  | 'spec'
  | 'plan'
  | 'tasks'
  | 'issue'
  | 'branch'
  | 'implementation'
  | 'implementation_approve'
  | 'pre_pr_review'
  | 'pr'
  | 'code_review'
  | 'merge'
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
    | 'implementation_approve'
    | 'pre_pr_review'
    | 'pr_prepare'
    | 'pr_create'
    | 'code_review'
    | 'pr_merge';
  summary: string;
  approvalRequired: boolean;
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
  blockedReasonCode:
    | 'SPEC_NOT_APPROVED'
    | 'PLAN_NOT_APPROVED'
    | 'TASKS_NOT_READY'
    | 'ISSUE_NOT_CREATED'
    | 'BRANCH_NOT_READY'
    | 'IMPLEMENTATION_APPROVAL_REQUIRED'
    | 'PRE_PR_REVIEW_NOT_APPROVED'
    | 'PR_NOT_CREATED'
    | 'PR_REVIEW_NOT_APPROVED'
    | null;
}

type WorkflowRequirements = {
  requireIssue: boolean;
  requireBranch: boolean;
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
  const workflowMode = workflow.mode || workflow.preset || 'github';
  const isLocalWorkflow = workflowMode === 'local';
  return {
    requireIssue: workflow.requireIssue ?? !isLocalWorkflow,
    requireBranch: workflow.requireBranch ?? true,
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

function getCurrentProjectBranch(feature: ResolvedFeature): string | null {
  return (
    runGitCapture(['branch', '--show-current'], feature.git.projectGitCwd) ||
    runGitCapture(['rev-parse', '--abbrev-ref', 'HEAD'], feature.git.projectGitCwd) ||
    null
  );
}

function nextTodoTask(tasks: ParsedTasks): ParsedTasks['tasks'][number] | null {
  return tasks.tasks.find((task) => task.status === 'DOING') ||
    tasks.tasks.find((task) => task.status === 'TODO') ||
    null;
}

function allTasksDone(tasks: ParsedTasks): boolean {
  return tasks.tasks.length > 0 && tasks.tasks.every((task) => task.status === 'DONE');
}

function prePrSatisfied(tasks: ParsedTasks): boolean {
  return (
    tasks.prePrReviewStatus === 'done' &&
    !!tasks.prePrEvidence &&
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
  command: string | null = null
): WorkflowStageAction {
  return {
    category,
    summary,
    approvalRequired,
    command,
  };
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

  if (specStatus !== 'approved') {
    const approvalRequired = specStatus === 'review';
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'spec',
      nextAction: buildAction(
        approvalRequired ? 'spec_approve' : 'spec_write',
        approvalRequired
          ? 'Get user approval and update spec.md status to Approved.'
          : 'Write or refine spec.md until it is ready for approval.',
        approvalRequired
      ),
      approvalRequired,
      implementationAllowed: false,
      blockedReasonCode: 'SPEC_NOT_APPROVED',
    };
  }

  if (planStatus !== 'approved') {
    const approvalRequired = planStatus === 'review';
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'plan',
      nextAction: buildAction(
        approvalRequired ? 'plan_approve' : 'plan_write',
        approvalRequired
          ? 'Get user approval and update plan.md status to Approved.'
          : 'Write or refine plan.md until it is ready for approval.',
        approvalRequired
      ),
      approvalRequired,
      implementationAllowed: false,
      blockedReasonCode: 'PLAN_NOT_APPROVED',
    };
  }

  if (tasks.tasks.length === 0 || tasks.docStatus !== 'approved') {
    const approvalRequired = tasks.docStatus === 'review';
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'tasks',
      nextAction: buildAction(
        approvalRequired ? 'tasks_approve' : 'tasks_write',
        approvalRequired
          ? 'Get user approval and update tasks.md Doc Status to Approved.'
          : 'Add and refine tasks until tasks.md is execution-ready and Approved.',
        approvalRequired
      ),
      approvalRequired,
      implementationAllowed: false,
      blockedReasonCode: 'TASKS_NOT_READY',
    };
  }

  if (requirements.requireIssue) {
    const issueReady = issueDraft.status === 'ready';
    const issueCreated =
      tasks.issueNumber !== null &&
      issueExistsRemotely(tasks.issueNumber, feature);
    if (!issueCreated || !issueReady) {
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
              true,
              `npx lee-spec-kit github issue ${buildFeatureArgs(feature)} --create --confirm OK`
            )
          : buildAction(
              'issue_prepare',
              'Prepare issue.md and set its Status to Ready before issue creation.',
              false
            ),
        approvalRequired: issueReady && !issueCreated,
        implementationAllowed: false,
        blockedReasonCode: 'ISSUE_NOT_CREATED',
      };
    }
  }

  if (requirements.requireBranch && !allTasksDone(tasks)) {
    const expectedBranch = resolveExpectedBranch(feature, tasks);
    const currentBranch = getCurrentProjectBranch(feature);
    if (expectedBranch && currentBranch !== expectedBranch) {
      return {
        status: 'ok',
        reasonCode: 'WORKFLOW_STAGE_RESOLVED',
        docsDir: config.docsDir,
        featureRef: buildFeatureRef(feature),
        stage: 'branch',
        nextAction: buildAction(
          'branch_create',
          `Switch the project repo to ${expectedBranch} before implementation starts.`,
          false,
          `git checkout -b ${expectedBranch}`
        ),
        approvalRequired: false,
        implementationAllowed: false,
        blockedReasonCode: 'BRANCH_NOT_READY',
      };
    }
  }

  if (!allTasksDone(tasks)) {
    const currentTask = nextTodoTask(tasks);
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'implementation',
      nextAction: buildAction(
        'task_execute',
        currentTask
          ? `Continue the next implementation task: ${currentTask.title}`
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
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'implementation_approve',
      nextAction: buildAction(
        'implementation_approve',
        'Share the completed implementation, get user approval, and record the completion checkpoint in tasks.md.',
        true
      ),
      approvalRequired: true,
      implementationAllowed: false,
      blockedReasonCode: 'IMPLEMENTATION_APPROVAL_REQUIRED',
    };
  }

  if (requirements.prePrReviewEnabled && !prePrSatisfied(tasks)) {
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'pre_pr_review',
      nextAction: buildAction(
        'pre_pr_review',
        'Run and record the Pre-PR review until tasks.md shows an approve decision with evidence.',
        false
      ),
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: 'PRE_PR_REVIEW_NOT_APPROVED',
    };
  }

  if (requirements.requirePr) {
    const prReady = prDraft.status === 'ready';
    const prCreated =
      !!tasks.prLink &&
      prExistsRemotely(tasks.prLink, feature);
    if (!prCreated || !prReady) {
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
              true,
              `npx lee-spec-kit github pr ${buildFeatureArgs(feature)} --create --confirm OK`
            )
          : buildAction(
              'pr_prepare',
              'Prepare pr.md and set its Status to Ready before PR creation.',
              false
            ),
        approvalRequired: prReady && !prCreated,
        implementationAllowed: false,
        blockedReasonCode: 'PR_NOT_CREATED',
      };
    }
  }

  if (requirements.requireReview && (tasks.prStatus !== 'approved' || prDraft.prStatus !== 'approved')) {
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_STAGE_RESOLVED',
      docsDir: config.docsDir,
      featureRef: buildFeatureRef(feature),
      stage: 'code_review',
      nextAction: buildAction(
        'code_review',
        'Complete PR review and record the final approved review state in tasks.md.',
        false
      ),
      approvalRequired: false,
      implementationAllowed: false,
      blockedReasonCode: 'PR_REVIEW_NOT_APPROVED',
    };
  }

  if (requirements.requireMerge) {
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
        `npx lee-spec-kit github pr ${buildFeatureArgs(feature)} --merge --confirm OK`
      ),
      approvalRequired: true,
      implementationAllowed: false,
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

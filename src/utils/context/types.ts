export type RepoType = string;
export type DocStatus = 'Draft' | 'Review' | 'Approved';
export type WorkflowDocStatus = 'Draft' | 'Ready';
export type PrReviewStatus = 'Review' | 'Approved';
export interface PrRemoteStatus {
  source: 'gh';
  available: boolean;
  reviewDecision?: string;
  state?: string;
  mergedAt?: string;
  isMerged: boolean;
  mergeStateStatus?: string;
  isDraft: boolean;
  hasBlockingReview: boolean;
  mergeBlocked: boolean;
  failingChecks: number;
  pendingChecks: number;
}
export type { Lang } from '../i18n.js';

export type ActionScope = 'project' | 'docs';

export const ACTION_CATEGORIES = [
  'feature_folder',
  'spec_write',
  'spec_approve',
  'plan_write',
  'plan_approve',
  'tasks_write',
  'tasks_approve',
  'docs_commit',
  'issue_create',
  'branch_create',
  'task_execute',
  'implementation_approve',
  'review_fix_commit',
  'pr_create',
  'pr_metadata_migrate',
  'pre_pr_review_run',
  'pre_pr_review_record',
  'pr_status_update',
  'code_review_run',
  'code_review',
  'feature_scope_split',
  'worktree_cleanup',
  'user_request_replan',
  'feature_done',
  'fallback',
] as const;

export type ActionCategory = (typeof ACTION_CATEGORIES)[number];
export const LEGACY_LONG_RUNNING_DELEGATION_CATEGORIES = [
  'task_execute',
  'code_review_run',
  'code_review',
  'review_fix_commit',
  'pre_pr_review_run',
] as const;

export type OperationType = 'local' | 'remote' | 'manual';
export type TaskExecutePhase = 'start' | 'complete';
export type StepOwner = 'main' | 'subagent';
export type StepPhase =
  | 'ready'
  | 'run'
  | 'running'
  | 'finalize'
  | 'record'
  | 'commit_pending'
  | 'blocked';

export type NextAction =
  | {
      type: 'command';
      scope: ActionScope;
      cwd: string;
      cmd: string;
      requiresUserCheck?: boolean;
      category?: ActionCategory;
      operationType?: OperationType;
      taskExecutePhase?: TaskExecutePhase;
      uiSummaryKey?: string;
      uiDetailKey?: string;
      uiDetailParams?: Record<string, string | number>;
    }
  | {
      type: 'instruction';
      message: string;
      requiresUserCheck?: boolean;
      category?: ActionCategory;
      operationType?: OperationType;
      taskExecutePhase?: TaskExecutePhase;
      uiSummaryKey?: string;
      uiDetailKey?: string;
      uiDetailParams?: Record<string, string | number>;
    };

export interface TaskRef {
  id?: string;
  status: 'TODO' | 'DOING' | 'DONE' | 'REVIEW';
  title: string;
}

export interface CompletionChecklistSummary {
  total: number;
  checked: number;
}

export type ReviewRunStatus = 'Pending' | 'Running' | 'Done';
export type PrePrReviewStatus = ReviewRunStatus;
export type PrReviewRunStatus = ReviewRunStatus;

export type PrePrDecisionOutcome = 'approve' | 'changes_requested' | 'blocked';
export type FeatureScopeSplitReason = 'task_count' | 'decisions_lines';
export type FeatureScopeSplitRecommendation = 'none' | 'split_2' | 'split_4';

export interface FeatureScopeSplitSignal {
  suggested: boolean;
  reasons: FeatureScopeSplitReason[];
  recommendation: FeatureScopeSplitRecommendation;
  taskCount: number;
  decisionsLineCount: number;
  suggestTaskCountThreshold: number;
  suggestDecisionsLineCountThreshold: number;
  recommendSplitFourTaskCountThreshold: number;
  recommendSplitFourDecisionsLineCountThreshold: number;
}

export interface FeatureState {
  id?: string;
  slug: string;
  folderName: string;
  type: RepoType;
  path: string;
  completion: {
    /**
     * Implementation is considered done when:
     * - tasks.md exists
     * - all tasks are DONE
     * - completion checklist is fully checked
     */
    implementationDone: boolean;
    /**
     * Workflow is considered done when required workflow conditions are met.
     * Requirements can be configured (e.g. local mode can skip issue/PR/review).
     */
    workflowDone: boolean;
    /**
     * Cleanup is pending when workflow requirements are satisfied but a managed
     * feature worktree still needs local cleanup before final completion.
     */
    cleanupPending: boolean;
  };
  issueNumber?: string;
  specStatus?: DocStatus;
  planStatus?: DocStatus;
  tasksDocStatus?: DocStatus;
  tasks: {
    total: number;
    todo: number;
    doing: number;
    done: number;
  };
  scopeSplit: FeatureScopeSplitSignal;
  activeTask?: TaskRef;
  lastDoneTask?: TaskRef;
  nextTodoTask?: TaskRef;
  completionChecklist?: CompletionChecklistSummary;
  prePrReview: {
    status?: PrePrReviewStatus;
    evidence?: string;
    evidenceProvided: boolean;
    decision?: string;
    decisionOutcome?: PrePrDecisionOutcome;
    decisionProvided: boolean;
  };
  prReview: {
    status?: PrReviewRunStatus;
    evidence?: string;
    evidenceProvided: boolean;
    decision?: string;
    decisionProvided: boolean;
  };
  pr: {
    link?: string;
    status?: PrReviewStatus;
    remote?: PrRemoteStatus;
  };
  git: {
    docsBranch: string;
    projectBranch: string;
    projectBranchAvailable: boolean;
    docsGitCwd: string;
    projectGitCwd?: string;
    onExpectedBranch: boolean;
    projectInManagedWorktree: boolean;
    expectedWorktreePath?: string;
    docsEverCommitted: boolean;
    docsHasUncommittedChanges: boolean;
    docsHasCommitRequiredChanges: boolean;
    projectHasUncommittedChanges: boolean;
    docsPathIgnored?: boolean;
    projectHasUpstream?: boolean;
    projectBranchAhead?: number;
    projectBranchBehind?: number;
  };
  docs: {
    featurePathFromDocs: string;
    specExists: boolean;
    planExists: boolean;
    tasksExists: boolean;
    issueDocExists: boolean;
    issueDocStatus?: WorkflowDocStatus;
    issueDocStatusFieldExists: boolean;
    issueDocIssueFieldExists: boolean;
    prDocExists: boolean;
    prDocStatus?: WorkflowDocStatus;
    prDocStatusFieldExists: boolean;
    prDocPrFieldExists: boolean;
    prDocReviewStatusFieldExists: boolean;
    tasksDocStatusFieldExists: boolean;
    prFieldExists: boolean;
    prStatusFieldExists: boolean;
    prePrReviewFieldExists: boolean;
    prePrEvidenceFieldExists: boolean;
    prePrDecisionFieldExists: boolean;
    prReviewEvidenceFieldExists: boolean;
    prReviewDecisionFieldExists: boolean;
  };
}

export interface StepDefinition {
  step: number;
  name: string;
  checklist: {
    done: (feature: FeatureState) => boolean;
    detail?: (feature: FeatureState) => string;
  };
  substates?: StepSubstate[];
  current?: {
    when: (feature: FeatureState) => boolean;
    actions: (feature: FeatureState) => NextAction[];
  };
}

export interface StepSubstate {
  id: string;
  phase: StepPhase;
  owner: StepOwner;
  category: ActionCategory;
  when: (feature: FeatureState) => boolean;
  actions: (feature: FeatureState) => NextAction[];
}

export interface FeatureContext extends FeatureState {
  currentStep: number;
  currentSubstateId?: string;
  currentSubstateOwner?: StepOwner;
  currentSubstatePhase?: StepPhase;
  actions: NextAction[];
  nextAction: string;
  warnings: string[];
}

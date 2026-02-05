export type RepoType = 'single' | 'fe' | 'be';
export type DocStatus = 'Draft' | 'Review' | 'Approved';
export type { Lang } from '../i18n.js';

export type ActionScope = 'project' | 'docs';

export type ActionCategory =
  | 'feature_folder'
  | 'spec_write'
  | 'spec_approve'
  | 'plan_write'
  | 'plan_approve'
  | 'tasks_write'
  | 'docs_commit'
  | 'issue_create'
  | 'branch_create'
  | 'task_execute'
  | 'pr_create'
  | 'pr_metadata_migrate'
  | 'pr_status_update'
  | 'code_review'
  | 'feature_done'
  | 'fallback';

export type NextAction =
  | {
      type: 'command';
      scope: ActionScope;
      cwd: string;
      cmd: string;
      requiresUserCheck?: boolean;
      category?: ActionCategory;
    }
  | {
      type: 'instruction';
      message: string;
      requiresUserCheck?: boolean;
      category?: ActionCategory;
    };

export interface TaskRef {
  status: 'TODO' | 'DOING' | 'DONE' | 'REVIEW';
  title: string;
}

export interface CompletionChecklistSummary {
  total: number;
  checked: number;
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
     * Workflow is considered done when:
     * - spec/plan are Approved
     * - PR metadata is configured (PR + PR Status fields exist)
     * - PR link exists and PR Status is Approved
     */
    workflowDone: boolean;
  };
  issueNumber?: string;
  specStatus?: DocStatus;
  planStatus?: DocStatus;
  tasks: {
    total: number;
    todo: number;
    doing: number;
    done: number;
  };
  activeTask?: TaskRef;
  nextTodoTask?: TaskRef;
  completionChecklist?: CompletionChecklistSummary;
  pr: {
    link?: string;
    status?: DocStatus;
  };
  git: {
    docsBranch: string;
    projectBranch: string;
    projectBranchAvailable: boolean;
    docsGitCwd: string;
    projectGitCwd?: string;
    onExpectedBranch: boolean;
    docsEverCommitted: boolean;
    docsHasUncommittedChanges: boolean;
  };
  docs: {
    featurePathFromDocs: string;
    specExists: boolean;
    planExists: boolean;
    tasksExists: boolean;
    prFieldExists: boolean;
    prStatusFieldExists: boolean;
  };
}

export interface StepDefinition {
  step: number;
  name: string;
  checklist: {
    done: (feature: FeatureState) => boolean;
    detail?: (feature: FeatureState) => string;
  };
  current?: {
    when: (feature: FeatureState) => boolean;
    actions: (feature: FeatureState) => NextAction[];
  };
}

export interface FeatureContext extends FeatureState {
  currentStep: number;
  actions: NextAction[];
  nextAction: string;
  warnings: string[];
}

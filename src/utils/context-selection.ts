import { createHash } from 'crypto';
import { ProjectConfig } from './config.js';
import {
  ActionCategory,
  FeatureContext,
  NextAction,
  OperationType,
  scanFeatures,
} from './context/index.js';

export type ContextStatus =
  | 'no_features'
  | 'no_open'
  | 'single_matched'
  | 'multiple_active'
  | 'no_match';

export type ContextSelectionMode = 'explicit' | 'branch' | 'open' | 'done' | 'all';
export type ContextSelectionFallback =
  | 'none'
  | 'open_features'
  | 'all_features'
  | 'done_features';

export interface ContextSelectionOptions {
  repo?: string;
  component?: string;
  all?: boolean;
  done?: boolean;
}

export type ContextAction = NextAction & { operationType: OperationType };

export interface ActionOption {
  label: string;
  summary: string;
  detail: string;
  approvalPrompt: string;
  action: ContextAction;
}

export interface ContextSelectionState {
  features: FeatureContext[];
  branches: {
    docs: string;
    project: Record<string, string>;
  };
  warnings: string[];
  doneFeatures: FeatureContext[];
  openFeatures: FeatureContext[];
  inProgressFeatures: FeatureContext[];
  readyToCloseFeatures: FeatureContext[];
  selectionMode: ContextSelectionMode;
  selectionFallback: ContextSelectionFallback;
  targetFeatures: FeatureContext[];
  status: ContextStatus;
  matchedFeature: FeatureContext | null;
  actions: ContextAction[];
  actionOptions: ActionOption[];
  contextVersion: string | null;
}

const REMOTE_ACTION_CATEGORIES: ReadonlySet<ActionCategory> = new Set([
  'issue_create',
  'pr_create',
  'pr_status_update',
  'code_review',
]);

const LOCAL_ACTION_CATEGORIES: ReadonlySet<ActionCategory> = new Set([
  'docs_commit',
  'branch_create',
  'task_execute',
]);

const REMOTE_COMMAND_PATTERN = /\b(?:git\s+push|git\s+merge|gh\s+(?:issue|pr)\b)/i;

function resolveComponentOption(options: ContextSelectionOptions): string | undefined {
  const component = (options.component || options.repo || '').trim().toLowerCase();
  return component || undefined;
}

function getActionLabel(index: number): string {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function resolveActionOperationType(
  action: FeatureContext['actions'][number]
): OperationType {
  if (action.operationType) return action.operationType;
  if (action.type === 'command') {
    if (REMOTE_COMMAND_PATTERN.test(action.cmd)) return 'remote';
    return 'local';
  }

  if (action.category && REMOTE_ACTION_CATEGORIES.has(action.category)) {
    return 'remote';
  }
  if (action.category && LOCAL_ACTION_CATEGORIES.has(action.category)) {
    return 'local';
  }

  return 'manual';
}

function annotateActionOperationType(
  action: FeatureContext['actions'][number]
): ContextAction {
  return {
    ...action,
    operationType: resolveActionOperationType(action),
  } as ContextAction;
}

function annotateActions(actions: FeatureContext['actions']): ContextAction[] {
  return actions.map((action) => annotateActionOperationType(action));
}

function getActionSummary(action: ContextAction): string {
  if (action.category === 'docs_commit') return 'Commit docs updates';
  if (action.category === 'issue_create') return 'Create and record issue';
  if (action.category === 'branch_create') return 'Create feature branch';
  if (action.category === 'pr_create') return 'Create PR and record link';
  if (action.category === 'pre_pr_review') return 'Run pre-PR self review';
  if (action.category === 'pr_status_update') return 'Update PR status';
  if (action.category === 'code_review') return 'Process code review feedback';
  if (action.category === 'task_execute') return 'Proceed with task execution';
  if (action.category === 'feature_done') return 'Feature is complete';
  if (action.category === 'spec_approve') return 'Request spec approval';
  if (action.category === 'plan_approve') return 'Request plan approval';
  if (action.category === 'tasks_approve') return 'Request tasks approval';
  if (action.category === 'pr_metadata_migrate') return 'Update tasks.md to latest PR fields';
  if (action.category === 'fallback') return 'Re-check context and rerun';
  if (action.type === 'command') {
    return action.scope === 'docs'
      ? 'Run docs command'
      : 'Run project command';
  }
  return action.message;
}

function formatActionSummary(action: ContextAction): string {
  if (action.type === 'command') {
    return `(${action.scope}) ${action.cmd}`;
  }
  return action.message;
}

function toActionOptions(actions: ContextAction[]): ActionOption[] {
  return actions.map((action, index) => {
    const label = getActionLabel(index);
    const summary = getActionSummary(action);
    const detail = formatActionSummary(action);
    return {
      label,
      summary,
      detail,
      approvalPrompt: `${label}: ${summary}`,
      action,
    };
  });
}

function buildActionSnapshot(actionOptions: ActionOption[]): Array<Record<string, string | boolean | undefined>> {
  return actionOptions.map(({ label, action }) => {
    if (action.type === 'command') {
      return {
        label,
        type: action.type,
        scope: action.scope,
        cwd: action.cwd,
        cmd: action.cmd,
        category: action.category,
        operationType: action.operationType,
        requiresUserCheck: !!action.requiresUserCheck,
      };
    }
    return {
      label,
      type: action.type,
      message: action.message,
      category: action.category,
      operationType: action.operationType,
      requiresUserCheck: !!action.requiresUserCheck,
    };
  });
}

function getContextVersion(
  feature: FeatureContext | null,
  actionOptions: ActionOption[]
): string | null {
  if (!feature) return null;
  const payload = JSON.stringify({
    id: feature.id || '',
    folderName: feature.folderName,
    currentStep: feature.currentStep,
    actionSnapshot: buildActionSnapshot(actionOptions),
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

function matchesFeatureSelector(f: FeatureContext, selector: string): boolean {
  const s = selector.trim();
  if (!s) return false;
  if (f.folderName.toLowerCase() === s.toLowerCase()) return true;
  if (f.slug.toLowerCase() === s.toLowerCase()) return true;
  if (f.id && f.id.toLowerCase() === s.toLowerCase()) return true;
  return false;
}

function detectFromBranch(
  branchName: string,
  features: FeatureContext[]
): FeatureContext[] {
  const match = branchName.match(/^feat\/\d+-(.+)$/);
  if (!match) return [];
  const detected = match[1];
  return features.filter(
    (f) =>
      f.slug.toLowerCase() === detected.toLowerCase() ||
      f.folderName.toLowerCase() === detected.toLowerCase()
  );
}

function toSelectionStatus(
  features: FeatureContext[],
  selectionMode: ContextSelectionMode,
  openFeatures: FeatureContext[],
  targetFeatures: FeatureContext[]
): ContextStatus {
  const isNoOpen =
    selectionMode === 'open' && features.length > 0 && openFeatures.length === 0;
  if (features.length === 0) return 'no_features';
  if (isNoOpen) return 'no_open';
  if (targetFeatures.length === 1) return 'single_matched';
  if (targetFeatures.length > 1) return 'multiple_active';
  return 'no_match';
}

export function toReasonCode(status: ContextStatus): string {
  if (status === 'no_features') return 'NO_FEATURES';
  if (status === 'no_open') return 'NO_OPEN_FEATURES';
  if (status === 'single_matched') return 'SINGLE_MATCHED';
  if (status === 'multiple_active') return 'MULTIPLE_ACTIVE_FEATURES';
  return 'NO_MATCHED_FEATURES';
}

export async function resolveContextSelection(
  config: ProjectConfig,
  featureName: string | undefined,
  options: ContextSelectionOptions
): Promise<ContextSelectionState> {
  const { features, branches, warnings } = await scanFeatures(config);
  const selectedComponent = resolveComponentOption(options);
  const scopedFeatures = selectedComponent
    ? features.filter((f) => f.type === selectedComponent)
    : features;

  const doneFeatures = scopedFeatures.filter((f) => f.completion.workflowDone);
  const openFeatures = scopedFeatures.filter((f) => !f.completion.workflowDone);
  const inProgressFeatures = openFeatures.filter(
    (f) => !f.completion.implementationDone
  );
  const readyToCloseFeatures = openFeatures.filter(
    (f) => f.completion.implementationDone
  );

  let targetFeatures: FeatureContext[] = [];
  let selectionMode: ContextSelectionMode = 'explicit';
  let selectionFallback: ContextSelectionFallback = 'none';

  if (featureName) {
    targetFeatures = scopedFeatures.filter((f) =>
      matchesFeatureSelector(f, featureName)
    );
    selectionMode = 'explicit';
  } else {
    if (config.projectType === 'single') {
      const branchName = branches.project.single || '';
      targetFeatures = detectFromBranch(branchName, scopedFeatures);
    } else if (selectedComponent) {
      const branchName = branches.project[selectedComponent] || '';
      targetFeatures = detectFromBranch(
        branchName,
        scopedFeatures
      );
    } else {
      const matches: FeatureContext[] = [];
      const componentKeys = [...new Set(scopedFeatures.map((f) => f.type))]
        .filter((key) => key !== 'single');
      for (const component of componentKeys) {
        const branchName = branches.project[component] || '';
        if (!branchName) continue;
        matches.push(
          ...detectFromBranch(
            branchName,
            scopedFeatures.filter((f) => f.type === component)
          )
        );
      }
      targetFeatures = matches;
    }

    if (targetFeatures.length > 0) {
      selectionMode = 'branch';
      selectionFallback = 'none';
    } else if (options.all) {
      targetFeatures = scopedFeatures;
      selectionMode = 'all';
      selectionFallback = 'all_features';
    } else if (options.done) {
      targetFeatures = doneFeatures;
      selectionMode = 'done';
      selectionFallback = 'done_features';
    } else {
      targetFeatures = openFeatures;
      selectionMode = 'open';
      selectionFallback = 'open_features';
    }
  }

  const status = toSelectionStatus(
    scopedFeatures,
    selectionMode,
    openFeatures,
    targetFeatures
  );
  const matchedFeature = targetFeatures.length === 1 ? targetFeatures[0] : null;
  const actions = annotateActions(matchedFeature?.actions ?? []);
  const actionOptions = toActionOptions(actions);
  const contextVersion = getContextVersion(matchedFeature, actionOptions);

  return {
    features: scopedFeatures,
    branches,
    warnings,
    doneFeatures,
    openFeatures,
    inProgressFeatures,
    readyToCloseFeatures,
    selectionMode,
    selectionFallback,
    targetFeatures,
    status,
    matchedFeature,
    actions,
    actionOptions,
    contextVersion,
  };
}

import { createHash } from 'crypto';
import { ProjectConfig } from './config.js';
import { FeatureContext, scanFeatures } from './context/index.js';

export type ContextStatus =
  | 'no_features'
  | 'no_open'
  | 'single_matched'
  | 'multiple_active'
  | 'no_match';

export type ContextSelectionMode = 'explicit' | 'branch' | 'open' | 'done' | 'all';

export interface ContextSelectionOptions {
  repo?: 'fe' | 'be';
  all?: boolean;
  done?: boolean;
}

export interface ActionOption {
  label: string;
  action: FeatureContext['actions'][number];
}

export interface ContextSelectionState {
  features: FeatureContext[];
  branches: {
    docs: string;
    project: { single?: string; fe?: string; be?: string };
  };
  warnings: string[];
  doneFeatures: FeatureContext[];
  openFeatures: FeatureContext[];
  inProgressFeatures: FeatureContext[];
  readyToCloseFeatures: FeatureContext[];
  selectionMode: ContextSelectionMode;
  targetFeatures: FeatureContext[];
  status: ContextStatus;
  matchedFeature: FeatureContext | null;
  actions: FeatureContext['actions'];
  actionOptions: ActionOption[];
  contextVersion: string | null;
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

function toActionOptions(actions: FeatureContext['actions']): ActionOption[] {
  return actions.map((action, index) => ({
    label: getActionLabel(index),
    action,
  }));
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
        requiresUserCheck: !!action.requiresUserCheck,
      };
    }
    return {
      label,
      type: action.type,
      message: action.message,
      category: action.category,
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
  const doneFeatures = features.filter((f) => f.completion.workflowDone);
  const openFeatures = features.filter((f) => !f.completion.workflowDone);
  const inProgressFeatures = openFeatures.filter(
    (f) => !f.completion.implementationDone
  );
  const readyToCloseFeatures = openFeatures.filter(
    (f) => f.completion.implementationDone
  );

  let targetFeatures: FeatureContext[] = [];
  let selectionMode: ContextSelectionMode = 'explicit';

  if (featureName) {
    targetFeatures = features.filter((f) => matchesFeatureSelector(f, featureName));
    if (options.repo) {
      targetFeatures = targetFeatures.filter((f) => f.type === options.repo);
    }
    selectionMode = 'explicit';
  } else {
    if (config.projectType === 'single') {
      const branchName = branches.project.single || '';
      targetFeatures = detectFromBranch(branchName, features);
    } else if (options.repo) {
      const branchName = branches.project[options.repo] || '';
      targetFeatures = detectFromBranch(
        branchName,
        features.filter((f) => f.type === options.repo)
      );
    } else {
      const feMatches = branches.project.fe
        ? detectFromBranch(
            branches.project.fe,
            features.filter((f) => f.type === 'fe')
          )
        : [];
      const beMatches = branches.project.be
        ? detectFromBranch(
            branches.project.be,
            features.filter((f) => f.type === 'be')
          )
        : [];
      targetFeatures = [...feMatches, ...beMatches];
    }

    if (targetFeatures.length > 0) {
      selectionMode = 'branch';
    } else if (options.all) {
      targetFeatures = features;
      selectionMode = 'all';
    } else if (options.done) {
      targetFeatures = doneFeatures;
      selectionMode = 'done';
    } else {
      targetFeatures = openFeatures;
      selectionMode = 'open';
    }
  }

  const status = toSelectionStatus(
    features,
    selectionMode,
    openFeatures,
    targetFeatures
  );
  const matchedFeature = targetFeatures.length === 1 ? targetFeatures[0] : null;
  const actions = matchedFeature?.actions ?? [];
  const actionOptions = toActionOptions(actions);
  const contextVersion = getContextVersion(matchedFeature, actionOptions);

  return {
    features,
    branches,
    warnings,
    doneFeatures,
    openFeatures,
    inProgressFeatures,
    readyToCloseFeatures,
    selectionMode,
    targetFeatures,
    status,
    matchedFeature,
    actions,
    actionOptions,
    contextVersion,
  };
}

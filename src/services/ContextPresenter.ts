import chalk from 'chalk';
import { createHash } from 'crypto';
import { FeatureContext, ACTION_CATEGORIES } from '../utils/context.js';
import {
  ActionOption,
  ContextSelectionOptions,
  ContextSelectionState,
} from '../utils/context-selection.js';
import {
  BuiltinDocId,
  getRecommendedDocIdsForCategories,
  toBuiltinDocCommand,
} from '../utils/builtin-docs.js';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  resolvePrePrReviewPolicy,
  resolveWorkflowPolicy,
} from '../utils/workflow.js';
import { createCliError } from '../utils/cli-error.js';
import { resolveContextSelection } from '../utils/context-selection.js';
import { CliContext } from '../utils/cli-context.js';

export type ResolvedContextState = ContextSelectionState;
export interface RequiredDocHint {
  id: BuiltinDocId;
  command: string;
}

export interface SuggestionOption {
  label: string;
  summary: string;
  detail: string;
  command: string;
}

export type ApprovalConfig = NonNullable<
  Awaited<ReturnType<typeof getConfig>>
>['approval'];

export type AutoRunReasonCode =
  | 'AVAILABLE'
  | 'NOT_SINGLE_MATCHED'
  | 'NO_ACTION_OPTIONS'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_MODE_NOT_CATEGORY'
  | 'DEFAULT_NOT_SKIP'
  | 'NO_REQUIRE_CHECK_CATEGORIES';

export interface AutoRunPlan {
  available: boolean;
  reasonCode: AutoRunReasonCode;
  summary: string;
  command: string;
  untilCategories: string[];
  unknownCategories: string[];
}

export interface AgentOrchestrationPolicy {
  mode: 'main_orchestrates_subagent_execution';
  delegationPolicy: 'prefer_main_delegate_long_running_fallback_main';
  delegateCommandExecution: 'long_running_only';
  delegateAutoRunExecution: true;
  fallbackToMainAgentWhenSubAgentUnavailable: true;
  longRunningCategories: string[];
  currentActionShouldDelegate: boolean;
  autoRunDelegationAvailable: boolean;
  autoRunShouldDelegate: boolean;
  currentActionCategory: string | null;
  mainAgentResponsibilities: string[];
  subAgentResponsibilities: string[];
  pauseAndReportWhen: string[];
  resumePriority: string[];
  subAgentHandoff: {
    required: boolean;
    mode: 'command' | 'auto_run' | null;
    featureRef: string | null;
    category: string | null;
    cwd: string | null;
    cmd: string | null;
    verify: {
      runOncePerSession: true;
      cacheKey: string;
      expectedCwd: string;
      commands: string[];
      onMismatch: 'stop_and_report';
      collectDetailedLogsOnMismatchOnly: true;
    } | null;
  };
}

export const LONG_RUNNING_DELEGATION_CATEGORIES = [
  'task_execute',
  'code_review',
  'review_fix_commit',
  'pre_pr_review_run',
] as const;

export function isTaskExecuteProjectCommitCommand(
  option: ActionOption | undefined
): boolean {
  if (!option || option.action.type !== 'command') return false;
  if (option.action.category !== 'task_execute') return false;
  if (option.action.scope !== 'project') return false;
  return /\bgit\s+commit\b/i.test(option.action.cmd);
}

export function shouldDelegateCurrentAction(actionOptions: ActionOption[]): {
  shouldDelegate: boolean;
  category: string | null;
}
export function shouldDelegateCurrentAction(
  actionOptions: ActionOption[],
  currentSubstateOwner?: FeatureContext['currentSubstateOwner']
): {
  shouldDelegate: boolean;
  category: string | null;
} {
  const primaryOption = actionOptions[0];
  const primaryCategory = primaryOption?.action?.category || null;
  const longRunningSet = new Set<string>(LONG_RUNNING_DELEGATION_CATEGORIES);
  const isCommand = primaryOption?.action?.type === 'command';
  const isRemoteCommand =
    isCommand && primaryOption?.action?.operationType === 'remote';
  const ownerDelegates = currentSubstateOwner === 'subagent';
  const legacyCategoryDelegates =
    !currentSubstateOwner &&
    !!primaryCategory &&
    longRunningSet.has(primaryCategory);
  const shouldDelegate =
    (ownerDelegates || legacyCategoryDelegates) &&
    isCommand &&
    !isRemoteCommand &&
    !isTaskExecuteProjectCommitCommand(primaryOption);
  return {
    shouldDelegate,
    category: primaryCategory,
  };
}

export function buildAgentOrchestrationPolicy(
  actionOptions: ActionOption[],
  autoRunAvailable: boolean,
  autoRunCommand: string,
  featureRef: string | null,
  currentSubstateOwner?: FeatureContext['currentSubstateOwner']
): AgentOrchestrationPolicy {
  const delegation = shouldDelegateCurrentAction(
    actionOptions,
    currentSubstateOwner
  );
  const primaryOption = actionOptions[0];
  const delegatedCommandOption =
    primaryOption &&
    primaryOption.action.type === 'command' &&
    delegation.shouldDelegate
      ? primaryOption
      : null;
  const shouldDelegateAutoRunNow =
    autoRunAvailable && actionOptions.length === 0;
  const handoffMode: 'command' | 'auto_run' | null = delegatedCommandOption
    ? 'command'
    : shouldDelegateAutoRunNow
      ? 'auto_run'
      : null;
  const delegatedAction = delegatedCommandOption?.action as
    | { cwd?: string; cmd?: string }
    | undefined;
  const handoffCwd =
    delegatedAction?.cwd || (shouldDelegateAutoRunNow ? process.cwd() : null);
  const handoffCmd =
    delegatedAction?.cmd || (shouldDelegateAutoRunNow ? autoRunCommand : null);
  const handoffRequired = !!handoffMode && !!handoffCwd && !!handoffCmd;
  const verifyCacheKey = handoffRequired
    ? createHash('sha1')
        .update(
          [
            handoffMode,
            featureRef || '',
            handoffCwd || '',
            handoffCmd || '',
          ].join('|')
        )
        .digest('hex')
        .slice(0, 12)
    : '';
  return {
    mode: 'main_orchestrates_subagent_execution',
    delegationPolicy: 'prefer_main_delegate_long_running_fallback_main',
    delegateCommandExecution: 'long_running_only',
    delegateAutoRunExecution: true,
    fallbackToMainAgentWhenSubAgentUnavailable: true,
    longRunningCategories: [...LONG_RUNNING_DELEGATION_CATEGORIES],
    currentActionShouldDelegate: delegation.shouldDelegate,
    autoRunDelegationAvailable: autoRunAvailable,
    autoRunShouldDelegate: shouldDelegateAutoRunNow,
    currentActionCategory: delegation.category,
    mainAgentResponsibilities: [
      'Keep user conversation state and approval boundaries',
      'Run the same execution loop directly when sub-agent is unavailable',
      'Delegate only long-running command/auto loops to sub-agents',
      'Report only on approval/manual/error boundaries',
    ],
    subAgentResponsibilities: [
      'Run flow/context command loops',
      'Execute only currently selected atomic command actions',
      'Return structured status to main agent',
    ],
    pauseAndReportWhen: [
      'approvalRequest.required=true',
      'AUTO_GATE_REACHED',
      'AUTO_MANUAL_REQUIRED',
      'command execution error',
    ],
    resumePriority: [
      'flow --resume <RUN_ID>',
      'autoRun.resume.flowCommand',
      'context --json-compact',
    ],
    subAgentHandoff: {
      required: handoffRequired,
      mode: handoffMode,
      featureRef,
      category: handoffMode === 'command' ? delegation.category : null,
      cwd: handoffCwd,
      cmd: handoffCmd,
      verify: handoffRequired
        ? {
            runOncePerSession: true,
            cacheKey: verifyCacheKey,
            expectedCwd: handoffCwd as string,
            commands: ['pwd', 'git rev-parse --show-toplevel'],
            onMismatch: 'stop_and_report',
            collectDetailedLogsOnMismatchOnly: true,
          }
        : null,
    },
  };
}

export async function resolveContextState(
  ctx: CliContext,
  featureName: string | undefined,
  options: ContextSelectionOptions
): Promise<ResolvedContextState> {
  const { config } = ctx;
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }
  return resolveContextSelection(ctx, featureName, options);
}

export function listLabels(actionOptions: ActionOption[]): string {
  if (actionOptions.length === 0) return '-';
  return actionOptions.map((o) => o.label).join(', ');
}

export function listSuggestionLabels(
  suggestionOptions: SuggestionOption[]
): string {
  if (suggestionOptions.length === 0) return '-';
  return suggestionOptions.map((o) => o.label).join(', ');
}

export function listActiveCategories(actionOptions: ActionOption[]): string[] {
  const unique = new Set<string>();
  for (const option of actionOptions) {
    if (option.action.category) unique.add(option.action.category);
  }
  return Array.from(unique);
}

export function listUncategorizedLabels(
  actionOptions: ActionOption[]
): string[] {
  return actionOptions
    .filter((option) => !option.action.category)
    .map((option) => option.label);
}

export function resolveFeatureRefForApproval(
  state: ResolvedContextState,
  featureName: string | undefined
): string {
  const raw =
    featureName?.trim() ||
    state.matchedFeature?.folderName ||
    '<slug|F001|F001-slug>';
  return raw;
}

export function buildApprovalCommand(
  state: ResolvedContextState,
  featureName: string | undefined,
  selectedComponent: string,
  execute: boolean
): string {
  const featureRef = resolveFeatureRefForApproval(state, featureName);
  const componentArg = selectedComponent
    ? ` --component ${selectedComponent}`
    : '';
  if (execute) {
    return `npx lee-spec-kit context ${featureRef}${componentArg} --approve <LABEL> --execute [--ticket <TICKET>]`;
  }
  return `npx lee-spec-kit context ${featureRef}${componentArg} --approve <LABEL>`;
}

export function buildFinalApprovalPrompt(
  lang: 'ko' | 'en',
  actionOptions: ActionOption[]
): string {
  if (actionOptions.length === 0) return '';
  const labels = listLabels(actionOptions);
  const example =
    actionOptions[0]?.replyExample || `${actionOptions[0]?.label || 'A'} OK`;
  const requestExamples = actionOptions
    .filter((option) => option.requiresRequestText)
    .map((option) => `\`${option.replyExample}\``);
  if (requestExamples.length === 0) {
    return tr(lang, 'cli', 'context.finalLabelPrompt', {
      labels,
      example,
    });
  }
  return tr(lang, 'cli', 'context.finalLabelPromptWithRequest', {
    labels,
    example,
    requestExamples: requestExamples.join(', '),
  });
}

export function buildSuggestionFinalPrompt(
  lang: 'ko' | 'en',
  suggestionOptions: SuggestionOption[]
): string {
  if (suggestionOptions.length === 0) return '';
  const labels = listSuggestionLabels(suggestionOptions);
  const example = suggestionOptions[0]?.label || 'A';
  return tr(lang, 'cli', 'context.suggestionFinalPrompt', {
    labels,
    example,
  });
}

export function normalizeCategoryToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return normalized;
}

export function resolveAutoRunCategories(approval: ApprovalConfig): {
  untilCategories: string[];
  unknownCategories: string[];
} {
  const known = new Set<string>(ACTION_CATEGORIES);
  const unique = new Set<string>();
  const unknown = new Set<string>();
  for (const raw of approval?.requireCheckCategories ??
    approval?.requireOkCategories ??
    []) {
    const normalized = normalizeCategoryToken(raw);
    if (!normalized) continue;
    if (known.has(normalized)) {
      unique.add(normalized);
    } else {
      unknown.add(normalized);
    }
  }
  return {
    untilCategories: Array.from(unique),
    unknownCategories: Array.from(unknown),
  };
}

export function buildAutoRunCommand(
  state: ResolvedContextState,
  featureName: string | undefined,
  selectedComponent: string,
  untilCategories: string[]
): string {
  if (untilCategories.length === 0) return '';
  const featureRef = resolveFeatureRefForApproval(state, featureName);
  const componentArg = selectedComponent
    ? ` --component ${selectedComponent}`
    : '';
  return `npx lee-spec-kit flow ${featureRef}${componentArg} --auto-until-category ${untilCategories.join(',')}`;
}

export function resolveAutoRunPlan(
  lang: 'ko' | 'en',
  state: ResolvedContextState,
  featureName: string | undefined,
  selectedComponent: string,
  approval: ApprovalConfig,
  approvalRequired: boolean
): AutoRunPlan {
  const base = (
    reasonCode: AutoRunReasonCode,
    untilCategories: string[] = [],
    unknownCategories: string[] = []
  ): AutoRunPlan => ({
    available: false,
    reasonCode,
    summary: tr(lang, 'cli', 'context.autoRunUnavailable'),
    command: '',
    untilCategories,
    unknownCategories,
  });

  if (state.status !== 'single_matched') return base('NOT_SINGLE_MATCHED');
  if (state.actionOptions.length === 0) return base('NO_ACTION_OPTIONS');
  if (approvalRequired) return base('APPROVAL_REQUIRED');

  const mode = approval?.mode ?? 'builtin';
  if (mode !== 'category') return base('APPROVAL_MODE_NOT_CATEGORY');

  const defaultPolicy = approval?.default ?? 'keep';
  if (defaultPolicy !== 'skip') return base('DEFAULT_NOT_SKIP');

  const { untilCategories, unknownCategories } =
    resolveAutoRunCategories(approval);
  if (untilCategories.length === 0) {
    return base('NO_REQUIRE_CHECK_CATEGORIES', [], unknownCategories);
  }

  return {
    available: true,
    reasonCode: 'AVAILABLE',
    summary: tr(lang, 'cli', 'context.autoRunSummary', {
      categories: untilCategories.join(', '),
    }),
    command: buildAutoRunCommand(
      state,
      featureName,
      selectedComponent,
      untilCategories
    ),
    untilCategories,
    unknownCategories,
  };
}

export function toSuggestionLabel(index: number): string {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function buildSuggestionOptions(
  lang: 'ko' | 'en',
  state: ResolvedContextState,
  projectType: 'single' | 'multi',
  selectedComponent: string
): SuggestionOption[] {
  const componentArg = selectedComponent
    ? ` --component ${selectedComponent}`
    : '';
  const createFeatureCommand =
    projectType === 'multi'
      ? selectedComponent
        ? `npx lee-spec-kit feature <name> --component ${selectedComponent}`
        : 'npx lee-spec-kit feature <name> --component <component>'
      : 'npx lee-spec-kit feature <name>';
  const selectFeatureCommand =
    projectType === 'multi'
      ? selectedComponent
        ? `npx lee-spec-kit context <slug|F001|F001-slug> --component ${selectedComponent}`
        : 'npx lee-spec-kit context <slug|F001|F001-slug> --component <component>'
      : 'npx lee-spec-kit context <slug|F001|F001-slug>';
  const showDoneCommand = `npx lee-spec-kit context --done${componentArg}`;
  const showAllCommand = `npx lee-spec-kit context --all${componentArg}`;
  const showOpenCommand = `npx lee-spec-kit context${componentArg}`;
  const runOnboardCommand = 'npx lee-spec-kit onboard --strict';

  const rawSuggestions: Array<{ summary: string; command: string }> = [];
  switch (state.status) {
    case 'no_features':
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.runOnboard'),
        command: runOnboardCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.createFeature'),
        command: createFeatureCommand,
      });
      break;
    case 'no_open':
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showDone'),
        command: showDoneCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.createFeature'),
        command: createFeatureCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showAll'),
        command: showAllCommand,
      });
      break;
    case 'multiple_active':
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.selectFeature'),
        command: selectFeatureCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showAll'),
        command: showAllCommand,
      });
      break;
    case 'no_match':
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showOpen'),
        command: showOpenCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showAll'),
        command: showAllCommand,
      });
      break;
    case 'single_matched':
    default:
      break;
  }

  return rawSuggestions.map((item, index) => {
    const label = toSuggestionLabel(index);
    return {
      label,
      summary: item.summary,
      detail: `${item.summary}: ${item.command}`,
      command: item.command,
    };
  });
}

export function printSuggestionOptions(
  lang: 'ko' | 'en',
  suggestionOptions: SuggestionOption[]
): void {
  if (suggestionOptions.length === 0) return;
  const finalPrompt = buildSuggestionFinalPrompt(lang, suggestionOptions);
  console.log(
    chalk.green(chalk.bold(`👉 ${tr(lang, 'cli', 'context.suggestionHeader')}`))
  );
  suggestionOptions.forEach((option) => {
    console.log(`   ${option.label}: ${option.summary}`);
    console.log(
      chalk.gray(
        `   ↳ ${tr(lang, 'cli', 'context.suggestionCommandHint', {
          command: option.command,
        })}`
      )
    );
  });
  if (finalPrompt) {
    console.log(chalk.cyan(`   ↳ ${finalPrompt}`));
  }
}

export function buildRequiredDocHints(
  actionOptions: ActionOption[]
): RequiredDocHint[] {
  const ids = getRecommendedDocIdsForCategories(
    actionOptions.map((option) => option.action.category)
  );
  return ids.map((id) => ({
    id,
    command: toBuiltinDocCommand(id),
  }));
}

export function getListLabel(
  f: FeatureContext,
  stepsMap: Record<number, string>,
  lang: 'ko' | 'en',
  workflowPolicy: ReturnType<typeof resolveWorkflowPolicy>,
  prePrReviewPolicy: ReturnType<typeof resolvePrePrReviewPolicy>
): string {
  // For "ready to close" features, show the closest missing workflow requirement
  // instead of generic step names like "tasks.md 작성".
  if (f.completion.implementationDone && !f.completion.workflowDone) {
    if (f.git.docsHasUncommittedChanges) {
      return tr(lang, 'cli', 'context.list.docsCommitNeeded');
    }
    if (f.git.projectHasUncommittedChanges) {
      return tr(lang, 'cli', 'context.list.projectCommitNeeded');
    }
    if (workflowPolicy.requireIssue && !f.issueNumber) {
      return tr(lang, 'cli', 'context.list.issueNumberNeeded');
    }
    if (
      workflowPolicy.requirePr &&
      (!f.docs.prFieldExists || !f.docs.prStatusFieldExists)
    ) {
      return tr(lang, 'cli', 'context.list.addPrMetadata');
    }
    if (prePrReviewPolicy.enabled && !f.docs.prePrReviewFieldExists) {
      return tr(lang, 'cli', 'context.list.addPrePrReviewField');
    }
    if (prePrReviewPolicy.enabled && f.prePrReview.status !== 'Done') {
      return tr(lang, 'cli', 'context.list.completePrePrReview');
    }
    if (
      prePrReviewPolicy.enabled &&
      (!f.docs.prePrEvidenceFieldExists || !f.prePrReview.evidenceProvided)
    ) {
      return tr(lang, 'cli', 'context.list.addPrePrEvidence');
    }
    if (
      prePrReviewPolicy.enabled &&
      (!f.docs.prePrDecisionFieldExists || !f.prePrReview.decisionProvided)
    ) {
      return tr(lang, 'cli', 'context.list.addPrePrDecision');
    }
    if (
      prePrReviewPolicy.enabled &&
      f.prePrReview.decisionOutcome !== 'approve'
    ) {
      return tr(lang, 'cli', 'context.list.resolvePrePrDecision');
    }
    if (workflowPolicy.requirePr && !f.pr.link) {
      return tr(lang, 'cli', 'context.list.recordPrLink');
    }
    if (workflowPolicy.requireMerge && !f.pr.status) {
      return tr(lang, 'cli', 'context.list.setPrStatus');
    }
    if (
      workflowPolicy.requireMerge &&
      workflowPolicy.requireReview &&
      f.pr.status === 'Review' &&
      (!f.docs.prReviewEvidenceFieldExists || !f.prReview.evidenceProvided)
    ) {
      return tr(lang, 'cli', 'context.list.addPrReviewEvidence');
    }
    if (
      workflowPolicy.requireMerge &&
      workflowPolicy.requireReview &&
      f.pr.status === 'Review' &&
      (!f.docs.prReviewDecisionFieldExists || !f.prReview.decisionProvided)
    ) {
      return tr(lang, 'cli', 'context.list.addPrReviewDecision');
    }
    if (workflowPolicy.requireMerge && f.pr.status !== 'Approved') {
      return tr(lang, 'cli', 'context.list.prStatusToApproved', {
        status: f.pr.status,
      });
    }
    if (f.specStatus !== 'Approved') {
      return tr(lang, 'cli', 'context.list.approveSpec');
    }
    if (f.planStatus !== 'Approved') {
      return tr(lang, 'cli', 'context.list.approvePlan');
    }
  }

  return stepsMap[f.currentStep] || 'Unknown';
}

export function getMultipleFeaturesRecommendation(
  projectType: 'single' | 'multi',
  selectedComponent: string
): string {
  if (projectType === 'single') {
    return 'Multiple features detected. Please specify feature name (slug | F001 | F001-slug).';
  }
  if (selectedComponent) {
    return `Multiple features detected in component "${selectedComponent}". Please specify feature name (slug | F001 | F001-slug).`;
  }
  return 'Multiple features detected across components. Please specify feature name (slug | F001 | F001-slug) or use --component.';
}

export function getFeatureRef(feature: FeatureContext): string {
  return feature.folderName || `${feature.type}:${feature.slug}`;
}

export function toCompactFeature(
  feature: FeatureContext | null | undefined
): Record<string, unknown> | null {
  if (!feature) return null;

  return {
    ref: getFeatureRef(feature),
    id: feature.id ?? null,
    slug: feature.slug,
    folderName: feature.folderName,
    type: feature.type,
    path: feature.path,
    currentStep: feature.currentStep,
    nextAction: feature.nextAction,
    completion: feature.completion,
    specStatus: feature.specStatus,
    planStatus: feature.planStatus,
    tasks: feature.tasks,
    prePrReview: {
      status: feature.prePrReview.status,
      evidenceProvided: feature.prePrReview.evidenceProvided,
      decisionOutcome: feature.prePrReview.decisionOutcome,
      decisionProvided: feature.prePrReview.decisionProvided,
    },
    prReview: {
      evidenceProvided: feature.prReview.evidenceProvided,
      decisionProvided: feature.prReview.decisionProvided,
    },
    pr: {
      link: feature.pr.link,
      status: feature.pr.status,
      remote: feature.pr.remote,
    },
    git: {
      docsBranch: feature.git.docsBranch,
      projectBranch: feature.git.projectBranch,
      projectBranchAvailable: feature.git.projectBranchAvailable,
      onExpectedBranch: feature.git.onExpectedBranch,
      docsEverCommitted: feature.git.docsEverCommitted,
      docsHasUncommittedChanges: feature.git.docsHasUncommittedChanges,
      projectHasUncommittedChanges: feature.git.projectHasUncommittedChanges,
      docsPathIgnored: feature.git.docsPathIgnored,
      projectHasUpstream: feature.git.projectHasUpstream,
      projectBranchAhead: feature.git.projectBranchAhead,
      projectBranchBehind: feature.git.projectBranchBehind,
    },
    docs: {
      specExists: feature.docs.specExists,
      planExists: feature.docs.planExists,
      tasksExists: feature.docs.tasksExists,
      issueDocIssueFieldExists: feature.docs.issueDocIssueFieldExists,
      prDocPrFieldExists: feature.docs.prDocPrFieldExists,
      prDocReviewStatusFieldExists: feature.docs.prDocReviewStatusFieldExists,
      prFieldExists: feature.docs.prFieldExists,
      prStatusFieldExists: feature.docs.prStatusFieldExists,
      prePrReviewFieldExists: feature.docs.prePrReviewFieldExists,
      prePrEvidenceFieldExists: feature.docs.prePrEvidenceFieldExists,
      prePrDecisionFieldExists: feature.docs.prePrDecisionFieldExists,
      prReviewEvidenceFieldExists: feature.docs.prReviewEvidenceFieldExists,
      prReviewDecisionFieldExists: feature.docs.prReviewDecisionFieldExists,
    },
    warnings: feature.warnings,
  };
}

export function toCompactActionOption(
  option: ActionOption
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    label: option.label,
    summary: option.summary,
    detail: option.detail,
    approvalPrompt: option.approvalPrompt,
    requiresRequestText: option.requiresRequestText,
    replyExample: option.replyExample,
    actionType: option.action.type,
    category: option.action.category,
    operationType: option.action.operationType,
    requiresUserCheck: !!option.action.requiresUserCheck,
  };

  if (option.action.type === 'command') {
    base.scope = option.action.scope;
    base.cwd = option.action.cwd;
    base.cmd = option.action.cmd;
    return base;
  }

  base.message = option.action.message;
  return base;
}

export function toCompactSuggestionOption(
  option: SuggestionOption
): Record<string, string> {
  return {
    label: option.label,
    summary: option.summary,
    command: option.command,
  };
}

export function resolveContextRecommendation(
  state: ResolvedContextState,
  projectType: 'single' | 'multi',
  selectedComponent: string
): string {
  if (state.status === 'multiple_active') {
    return getMultipleFeaturesRecommendation(projectType, selectedComponent);
  }
  if (state.status === 'no_features') {
    return 'No features found. Run onboarding checks first, then create a feature.';
  }
  if (state.status === 'no_open') {
    return 'No open features found. Use `context --done` to inspect completed features.';
  }
  if (state.status === 'no_match') {
    return 'No features found.';
  }
  if (state.targetFeatures.length === 1) {
    return state.targetFeatures[0].nextAction;
  }
  return 'No matched feature.';
}

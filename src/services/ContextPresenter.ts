import chalk from 'chalk';
import { createHash } from 'crypto';
import {
  FeatureContext,
  ACTION_CATEGORIES,
  SUBAGENT_HANDOFF_CATEGORIES,
} from '../utils/context.js';
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
import type {
  ActionExecutionMetadata,
  AgentOrchestrationPolicy,
  AutoRunPlan,
  AutoRunReasonCode,
  DelegatedActionContract,
} from '../core/workflow/types.js';

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

export function getActionExecutionMetadata(
  action: ActionOption['action']
): ActionExecutionMetadata | null {
  if (
    action.category === 'task_execute' &&
    action.taskExecutePhase === 'start'
  ) {
    return {
      handoffOnly: true,
      advancesWorkflow: false,
      nextMainState: 'task_complete',
    };
  }
  if (action.category === 'code_review_run') {
    return {
      handoffOnly: true,
      advancesWorkflow: false,
      nextMainState: 'code_review_running',
    };
  }
  if (action.category === 'pre_pr_review_run') {
    return {
      handoffOnly: true,
      advancesWorkflow: false,
      nextMainState: 'pre_pr_review_in_progress',
    };
  }
  return null;
}

export function isTaskExecuteProjectCommitCommand(
  option: ActionOption | undefined
): boolean {
  if (!option || option.action.type !== 'command') return false;
  if (option.action.category !== 'task_execute') return false;
  if (option.action.scope !== 'project') return false;
  return /\bgit\s+commit\b/i.test(option.action.cmd);
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
  const handoffCategories = new Set<string>(SUBAGENT_HANDOFF_CATEGORIES);
  const isCommand = primaryOption?.action?.type === 'command';
  const isRemoteCommand =
    isCommand && primaryOption?.action?.operationType === 'remote';
  const ownerDelegates = currentSubstateOwner === 'subagent';
  const categoryFallbackDelegates =
    !currentSubstateOwner &&
    !!primaryCategory &&
    handoffCategories.has(primaryCategory);
  const shouldDelegate =
    (ownerDelegates || categoryFallbackDelegates) &&
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
    mainAgentResponsibilities: [
      'Keep user conversation state and approval boundaries',
      'Run the same execution loop directly when sub-agent is unavailable',
      'Prefer substate-owner routing when available and keep fallback control in main',
      'Report only on approval/manual/error boundaries',
    ],
    subAgentResponsibilities: [
      'Run only delegated command/auto loops',
      'Execute only currently selected atomic command actions',
      'Return structured status to main agent',
    ],
    pauseAndReportWhen: [
      'approvalRequest.required=true',
      'AUTO_GATE_REACHED',
      'AUTO_DELEGATED_HANDOFF',
      'AUTO_MANUAL_REQUIRED',
      'command execution error',
    ],
    resumePriority: [
      'latest flow --json-compact: autoRun.run.resumeCommand',
      'latest flow --json-compact: autoRun.resume.flowCommand',
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

function buildFeatureComponentArgs(feature: FeatureContext): string[] {
  return feature.type && feature.type !== 'single'
    ? ['--component', feature.type]
    : [];
}

function buildPrePrRecordCommand(
  feature: FeatureContext,
  decision: 'changes_requested' | 'approve'
): string {
  const args = [
    'pre-pr-review',
    feature.folderName,
    ...buildFeatureComponentArgs(feature),
    '--evidence',
    'review-trace.json',
    '--decision',
    decision,
  ];
  return `npx lee-spec-kit ${args.join(' ')}`;
}

export function buildDelegatedActionContract(
  state: ResolvedContextState
): DelegatedActionContract | null {
  const feature = state.matchedFeature;
  const substateId = feature?.currentSubstateId;
  if (!feature || !substateId) return null;

  if (substateId === 'pre_pr_review_run' || substateId === 'pre_pr_review_in_progress') {
    return {
      required: true,
      mode: 'command',
      category: 'pre_pr_review_run',
      currentSubstateId: substateId,
      delegatedWorkRequired: true,
      handoffOnly: true,
      advancesWorkflow: false,
      doNotReapproveSameLabel: substateId === 'pre_pr_review_in_progress',
      nextMainState: 'pre_pr_review_in_progress',
      reuseKey: `pre-pr:${feature.folderName}`,
      evidenceFile: 'review-trace.json',
      nextStepRequirement: 'generate_review_trace_then_record',
      recordCommands: {
        changesRequested: buildPrePrRecordCommand(
          feature,
          'changes_requested'
        ),
        approve: buildPrePrRecordCommand(feature, 'approve'),
      },
      guidance:
        substateId === 'pre_pr_review_in_progress'
          ? 'A pre-PR review is already in progress. Reuse or resume the delegated review, generate structured review evidence, then record the result with pre-pr-review. Do not re-approve the same label.'
          : 'After approval, spawn_agent first and hand off the delegated pre-PR review. Handoff-only execution only prepares the review session; continue the delegated review immediately after approval.',
    };
  }

  if (substateId === 'code_review_run' || substateId === 'code_review_running') {
    return {
      required: true,
      mode: 'command',
      category: 'code_review_run',
      currentSubstateId: substateId,
      delegatedWorkRequired: true,
      handoffOnly: true,
      advancesWorkflow: false,
      doNotReapproveSameLabel: substateId === 'code_review_running',
      nextMainState: 'code_review_running',
      reuseKey: `code-review:${feature.folderName}`,
      guidance:
        substateId === 'code_review_running'
          ? 'A PR review handoff is already prepared. Reuse or resume the delegated review-fix work, then refresh PR Review Evidence and PR Review Decision before continuing. Do not re-approve the same label.'
          : 'After approval, spawn_agent first and hand off the delegated PR review-fix work. Handoff-only execution only prepares the delegated session; continue the delegated work immediately after approval.',
    };
  }

  return null;
}

export function buildDelegatedApprovalGuidance(
  handoffRequired: boolean,
  handoffMode: 'command' | 'auto_run' | null
): string {
  const base =
    'Before asking for approval, show only `actionOptions[].approvalPrompt` lines and `approvalRequest.finalPrompt` to the user. Keep `requiredDocs`, `checkPolicy`, and raw execution commands as internal guidance. For commit actions, include scope (`docs`/`project`) and commit message in the visible prompt. User replies should include the label token (e.g. `A`, `A OK`, `A proceed`, `A 진행해`).';
  const delegatedCommand =
    handoffRequired && handoffMode === 'command'
      ? ' When `matchedFeature.currentSubstateOwner="subagent"` and `agentOrchestration.subAgentHandoff.required=true` with `mode="command"`, call spawn_agent first and do not execute the delegated command directly from the main agent. If the delegated command is handoff-only, `--execute` only prepares the handoff; continue the delegated work immediately and do not re-approve the same label.'
      : '';
  const nonDelegated =
    ' For non-delegated command actions, prefer one-shot `npx lee-spec-kit flow <featureRef> --approve <LABEL> --execute` to avoid session mismatch after context compression/reset. Use ticket-based `context --execute --ticket` only when explicitly needed.';
  const orchestration =
    ' Use main-agent orchestration: keep short steps in main agent. Prefer `matchedFeature.currentSubstateOwner` + `agentOrchestration.subAgentHandoff` as the delegation SSOT. Delegate auto-run only when `agentOrchestration.subAgentHandoff.required=true` with `mode="auto_run"`.';
  return `${base}${delegatedCommand}${nonDelegated}${orchestration}`;
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
  for (const raw of approval?.requireCheckCategories ?? []) {
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
    policyEligible: false,
    executableNow: false,
    reasonCode,
    summary: tr(lang, 'cli', 'context.autoRunUnavailable'),
    command: '',
    untilCategories,
    unknownCategories,
    manualBoundary: null,
  });

  if (state.status !== 'single_matched') return base('NOT_SINGLE_MATCHED');
  if (state.actionOptions.length === 0) return base('NO_ACTION_OPTIONS');
  if (approvalRequired) return base('APPROVAL_REQUIRED');

  const mode = approval?.mode ?? 'category';
  if (mode !== 'category') return base('APPROVAL_MODE_NOT_CATEGORY');

  const defaultPolicy = approval?.default ?? 'keep';
  if (defaultPolicy !== 'skip') return base('DEFAULT_NOT_SKIP');

  const { untilCategories, unknownCategories } =
    resolveAutoRunCategories(approval);
  if (untilCategories.length === 0) {
    return base('NO_REQUIRE_CHECK_CATEGORIES', [], unknownCategories);
  }

  const executable = state.actionOptions.find(
    (option) => option.action.type === 'command'
  );
  if (!executable) {
    const manualBoundary = state.actionOptions[0]
      ? {
          label: state.actionOptions[0].label,
          category: state.actionOptions[0].action.category,
          detail: state.actionOptions[0].detail,
        }
      : null;
    return {
      available: false,
      policyEligible: true,
      executableNow: false,
      reasonCode: 'MANUAL_BOUNDARY',
      summary: tr(lang, 'cli', 'context.autoRunManualBoundary', {
        detail: manualBoundary?.detail || '',
      }),
      command: buildAutoRunCommand(
        state,
        featureName,
        selectedComponent,
        untilCategories
      ),
      untilCategories,
      unknownCategories,
      manualBoundary,
    };
  }

  return {
    available: true,
    policyEligible: true,
    executableNow: true,
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
    manualBoundary: null,
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
    if (f.completion.cleanupPending) {
      return tr(lang, 'cli', 'context.list.cleanupPending');
    }
    if (f.git.docsHasCommitRequiredChanges) {
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

  const compactFeature: Record<string, unknown> = {
    ref: getFeatureRef(feature),
    currentStep: feature.currentStep,
    currentSubstateId: feature.currentSubstateId,
    currentSubstateOwner: feature.currentSubstateOwner,
    currentSubstatePhase: feature.currentSubstatePhase,
    completion: {
      implementationDone: feature.completion.implementationDone,
      workflowDone: feature.completion.workflowDone,
    },
    specStatus: feature.specStatus,
    planStatus: feature.planStatus,
    tasks: feature.tasks,
  };

  if (feature.warnings.length > 0) {
    compactFeature.warnings = feature.warnings;
  }

  return compactFeature;
}

export function toCompactActionOption(
  option: ActionOption
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    label: option.label,
    detail: option.detail,
    actionType: option.action.type,
    category: option.action.category,
    operationType: option.action.operationType,
    requiresUserCheck: !!option.action.requiresUserCheck,
  };
  const executionMetadata = getActionExecutionMetadata(option.action);
  if (executionMetadata) {
    base.handoffOnly = executionMetadata.handoffOnly;
    base.advancesWorkflow = executionMetadata.advancesWorkflow;
    if (executionMetadata.nextMainState) {
      base.nextMainState = executionMetadata.nextMainState;
    }
  }

  if (option.action.taskExecutePhase) {
    base.taskExecutePhase = option.action.taskExecutePhase;
  }

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

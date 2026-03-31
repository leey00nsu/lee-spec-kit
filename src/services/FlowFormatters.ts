import { Buffer } from 'buffer';
import {
  ActionOption,
  ContextSelectionState,
  toReasonCode,
} from '../utils/context-selection.js';
import { AutoRunSummary } from './FlowOrchestrator.js';
import { buildDelegatedActionContract } from './ContextPresenter.js';

export interface CompactFlowFeatureSummary {
  ref: string;
  id?: string;
  slug: string;
  type: string;
  issueNumber?: string;
  specStatus?: string;
  planStatus?: string;
  tasksDocStatus?: string;
  currentStep: number;
  currentSubstateId?: string;
  currentSubstateOwner?: string;
  currentSubstatePhase?: string;
  completion: {
    implementationDone: boolean;
    workflowDone: boolean;
  };
  tasks?: {
    total: number;
    todo: number;
    doing: number;
    done: number;
  };
  completionChecklist?: {
    total: number;
    checked: number;
  };
  warnings: string[];
}

export interface AgentOrchestrationPolicy {
  mode: 'main_orchestrates_subagent_execution';
  mainAgentResponsibilities: string[];
  subAgentResponsibilities: string[];
  pauseAndReportWhen: string[];
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

export function getFeatureRef(
  feature: Pick<ContextSelectionState['features'][number], 'folderName'>
): string {
  return feature.folderName;
}

export function toCompactFlowFeature(
  feature: ContextSelectionState['matchedFeature']
): CompactFlowFeatureSummary | null {
  if (!feature) return null;
  return {
    ref: getFeatureRef(feature),
    id: feature.id,
    slug: feature.slug,
    type: feature.type,
    issueNumber: feature.issueNumber,
    specStatus: feature.specStatus,
    planStatus: feature.planStatus,
    tasksDocStatus: feature.tasksDocStatus,
    currentStep: feature.currentStep,
    currentSubstateId: feature.currentSubstateId,
    currentSubstateOwner: feature.currentSubstateOwner,
    currentSubstatePhase: feature.currentSubstatePhase,
    completion: {
      implementationDone: feature.completion.implementationDone,
      workflowDone: feature.completion.workflowDone,
    },
    tasks: feature.tasks,
    completionChecklist: feature.completionChecklist,
    warnings: feature.warnings,
  };
}

export function toCompactFlowActionOption(
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

export function toCompactFlowContextSnapshot(
  state: ContextSelectionState
): Record<string, unknown> {
  const primaryAction = state.actionOptions[0] ?? null;
  return {
    status: state.status,
    reasonCode: toReasonCode(state.status),
    selectionMode: state.selectionMode,
    selectionFallback: state.selectionFallback,
    branches: state.branches,
    warnings: state.warnings,
    contextVersion: state.contextVersion,
    matchedFeature: toCompactFlowFeature(state.matchedFeature),
    candidateRefs:
      state.targetFeatures.length > 1
        ? state.targetFeatures.map((feature) => getFeatureRef(feature))
        : [],
    completedCandidateRefs:
      state.selectionMode === 'open'
        ? state.doneFeatures.map((feature) => getFeatureRef(feature))
        : [],
    openCandidateRefs:
      state.selectionMode === 'open'
        ? state.openFeatures.map((feature) => getFeatureRef(feature))
        : [],
    inProgressCandidateRefs:
      state.selectionMode === 'open'
        ? state.inProgressFeatures.map((feature) => getFeatureRef(feature))
        : [],
    readyToCloseCandidateRefs:
      state.selectionMode === 'open'
        ? state.readyToCloseFeatures.map((feature) => getFeatureRef(feature))
        : [],
    actionOptions: state.actionOptions.map((option) =>
      toCompactFlowActionOption(option)
    ),
    delegatedAction: buildDelegatedActionContract(state),
    primaryActionLabel: primaryAction?.label ?? null,
    primaryActionType: primaryAction?.action.type ?? null,
    primaryActionCategory: primaryAction?.action.category ?? null,
    primaryActionOperationType: primaryAction?.action.operationType ?? null,
  };
}

export function toCompactAutoRun(
  autoRun: AutoRunSummary | null
): Record<string, unknown> | null {
  if (!autoRun) return null;
  const lastExecution =
    autoRun.executions.length > 0
      ? autoRun.executions[autoRun.executions.length - 1]
      : null;
  return {
    enabled: autoRun.enabled,
    status: autoRun.status,
    reasonCode: autoRun.reasonCode,
    untilCategories: autoRun.untilCategories,
    request: autoRun.request,
    preset: autoRun.preset ?? null,
    source: autoRun.source ?? null,
    iterations: autoRun.iterations,
    executionCount: autoRun.executions.length,
    lastExecution,
    delegated: autoRun.delegated ?? null,
    gate: autoRun.gate ?? null,
    manual: autoRun.manual ?? null,
    resume: autoRun.resume,
    run: autoRun.run ?? null,
    error: autoRun.error ?? null,
  };
}

export function toCompactStatusReport(
  report: unknown
): Record<string, unknown> | null {
  if (!report || typeof report !== 'object') return null;
  const payload = report as {
    status?: string;
    reasonCode?: string;
    counts?: unknown;
    recommendation?: unknown;
  };
  return {
    status: payload.status ?? null,
    reasonCode: payload.reasonCode ?? null,
    counts: payload.counts ?? null,
    recommendation: payload.recommendation ?? null,
  };
}

export function buildAgentOrchestrationPolicy(
  autoRun: AutoRunSummary | null,
  featureRef: string | null
): AgentOrchestrationPolicy {
  const resumeCommand =
    autoRun?.run?.resumeCommand || autoRun?.resume?.flowCommand || null;
  const handoffRequired = !!autoRun && !!resumeCommand;
  const verifyCacheKey = handoffRequired
    ? `${(featureRef || 'unknown').toLowerCase()}|${Buffer.from(
        resumeCommand as string
      )
        .toString('base64')
        .slice(0, 12)}`
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
    subAgentHandoff: {
      required: handoffRequired,
      mode: handoffRequired ? 'auto_run' : null,
      featureRef,
      category: null,
      cwd: handoffRequired ? process.cwd() : null,
      cmd: handoffRequired ? resumeCommand : null,
      verify: handoffRequired
        ? {
            runOncePerSession: true,
            cacheKey: verifyCacheKey,
            expectedCwd: process.cwd(),
            commands: ['pwd', 'git rev-parse --show-toplevel'],
            onMismatch: 'stop_and_report',
            collectDetailedLogsOnMismatchOnly: true,
          }
        : null,
    },
  };
}

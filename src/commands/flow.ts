import { spawnSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import {
  type ActionOption,
  type ContextSelectionState,
  ContextSelectionOptions,
  resolveContextSelection,
  toReasonCode,
} from '../utils/context-selection.js';
import { createCliContext } from '../utils/cli-context.js';
import { Buffer } from 'buffer';
import { ACTION_CATEGORIES } from '../utils/context.js';
import { resolveComponentOption } from '../utils/context/component-option.js';
import {
  createFlowRunRecord,
  getFlowRunRecord,
  type FlowRunRecord,
  type FlowRunStatus,
  updateFlowRunRecord,
} from '../utils/flow-run.js';

type LoadedConfig = NonNullable<Awaited<ReturnType<typeof getConfig>>>;

interface FlowOptions extends ContextSelectionOptions {
  json?: boolean;
  jsonCompact?: boolean;
  approve?: string;
  execute?: boolean;
  executeStrict?: boolean;
  strict?: boolean;
  request?: string;
  autoUntilCategory?: string;
  autoPreset?: string;
  startAuto?: boolean;
  resume?: string;
}

interface AutoRunExecution {
  kind: 'request' | 'command';
  iteration: number;
  contextVersion: string | null;
  label: string;
  category?: string;
  detail: string;
  approveStatus?: string;
  executeStatus?: string;
  executeReasonCode?: string;
}

interface AutoRunResume {
  flowArgs: string[];
  flowCommand: string;
  contextArgs: string[];
  contextCommand: string;
  requiresFreshContext: true;
  requestPending: boolean;
}

interface AutoRunSummary {
  enabled: true;
  untilCategories: string[];
  request?: string;
  preset?: string | null;
  source?: string | null;
  resume: AutoRunResume;
  run?: {
    runId: string;
    mode: 'started' | 'resumed';
    status: FlowRunStatus;
    resumeCommand: string;
  };
  status:
    | 'gate_reached'
    | 'manual_required'
    | 'no_action_options'
    | 'selection_required'
    | 'no_progress'
    | 'request_label_missing'
    | 'request_failed'
    | 'execution_failed';
  reasonCode:
    | 'AUTO_GATE_REACHED'
    | 'AUTO_MANUAL_REQUIRED'
    | 'AUTO_NO_ACTION_OPTIONS'
    | 'AUTO_SELECTION_REQUIRED'
    | 'AUTO_NO_PROGRESS'
    | 'AUTO_REQUEST_LABEL_MISSING'
    | 'AUTO_REQUEST_FAILED'
    | 'AUTO_EXECUTION_FAILED';
  iterations: number;
  executions: AutoRunExecution[];
  gate?: {
    label: string;
    category?: string;
    detail: string;
    finalPrompt?: string;
    userFacingLines?: string[];
  } | null;
  manual?: {
    label: string;
    category?: string;
    detail: string;
  } | null;
  error?: string;
}

interface AgentOrchestrationPolicy {
  mode: 'main_orchestrates_subagent_execution';
  delegationPolicy: 'prefer_main_delegate_long_running_fallback_main';
  delegateCommandExecution: 'long_running_only';
  delegateAutoRunExecution: true;
  fallbackToMainAgentWhenSubAgentUnavailable: true;
  longRunningCategories: string[];
  mainAgentResponsibilities: string[];
  subAgentResponsibilities: string[];
  pauseAndReportWhen: string[];
  preferredResumeCommand: string | null;
  subAgentHandoff: {
    required: boolean;
    mode: 'auto_run' | null;
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

interface CompactFlowFeatureSummary {
  ref: string;
  id?: string;
  slug: string;
  type: string;
  issueNumber?: string;
  specStatus?: string;
  planStatus?: string;
  tasksDocStatus?: string;
  currentStep: number;
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

const LONG_RUNNING_DELEGATION_CATEGORIES = [
  'task_execute',
  'code_review',
  'review_fix_commit',
  'pre_pr_review',
];

const BUILTIN_AUTO_PRESETS: Record<string, string[]> = {
  'pr-handoff': ['pr_create', 'code_review', 'pr_status_update'],
};

interface AutoPresetResolution {
  preset: string;
  categories: string[];
}

interface AutoModeResolution {
  untilCategories: string[];
  preset: string | null;
  source: string;
}

interface CliRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function shellEscape(arg: string): string {
  if (/^[A-Za-z0-9_./:@%-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function toLeeSpecKitCommand(args: string[]): string {
  return ['npx', 'lee-spec-kit', ...args]
    .map((arg) => shellEscape(arg))
    .join(' ');
}

function buildResumeRunCommand(runId: string): string {
  return toLeeSpecKitCommand(['flow', '--resume', runId]);
}

function buildAutoResume(
  featureName: string,
  selectionOptions: ContextSelectionOptions,
  untilCategories: string[],
  requestText: string | undefined,
  requestPending: boolean
): AutoRunResume {
  const selectionArgs = buildSelectionArgs(featureName, selectionOptions);
  const flowArgs = ['flow', ...selectionArgs];
  if (requestPending && requestText) {
    flowArgs.push('--request', requestText);
  }
  flowArgs.push('--auto-until-category', untilCategories.join(','));
  const contextArgs = ['context', ...selectionArgs];
  return {
    flowArgs,
    flowCommand: toLeeSpecKitCommand(flowArgs),
    contextArgs,
    contextCommand: toLeeSpecKitCommand(contextArgs),
    requiresFreshContext: true,
    requestPending,
  };
}

function runSelfCli(args: string[]): CliRunResult {
  const entry = process.argv[1];
  const result = spawnSync(process.execPath, [entry, '--no-banner', ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: {
      ...process.env,
      LEE_SPEC_KIT_NO_UPDATE_CHECK: '1',
      LEE_SPEC_KIT_NO_BANNER: '1',
    },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runSelfCliJson(args: string[], allowFailure = false): unknown {
  const result = runSelfCli([...args, '--json']);
  if (result.code !== 0 && !allowFailure) {
    const detail =
      result.stderr.trim() || result.stdout.trim() || args.join(' ');
    throw createCliError(
      'EXECUTION_FAILED',
      `Flow sub-command failed: ${detail}`
    );
  }
  const text = result.stdout.trim();
  if (!text) return { status: 'empty' };
  try {
    return JSON.parse(text);
  } catch {
    if (allowFailure) {
      return { status: 'parse_error', raw: text };
    }
    throw createCliError(
      'EXECUTION_FAILED',
      `Flow sub-command returned non-JSON output: ${args.join(' ')}`
    );
  }
}

function buildSelectionArgs(
  featureName: string | undefined,
  options: ContextSelectionOptions
): string[] {
  const args: string[] = [];
  if (featureName) args.push(featureName);
  const component = (options.component || '').trim();
  if (component) args.push('--component', component);
  if (options.all) args.push('--all');
  if (options.done) args.push('--done');
  return args;
}

function normalizeAutoCategories(
  values: string[],
  sourceLabel: string
): string[] {
  const requested = values.map((value) => value.trim()).filter(Boolean);
  if (requested.length === 0) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `${sourceLabel} requires at least one category.`
    );
  }
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const category of requested) {
    if (seen.has(category)) continue;
    seen.add(category);
    deduped.push(category);
  }
  const allowed = new Set<string>(ACTION_CATEGORIES);
  const invalid = deduped.filter((category) => !allowed.has(category));
  if (invalid.length > 0) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Unknown category in ${sourceLabel}: ${invalid.join(', ')}. Known categories: ${ACTION_CATEGORIES.join(', ')}`
    );
  }
  return deduped;
}

function parseAutoUntilCategories(raw: string): string[] {
  return normalizeAutoCategories(raw.split(','), '`--auto-until-category`');
}

function normalizePresetName(raw: string): string {
  return raw.trim().toLowerCase();
}

function resolveConfiguredPresetMap(
  config: LoadedConfig
): Map<string, string[]> {
  const presets = new Map<string, string[]>();
  for (const [name, categories] of Object.entries(BUILTIN_AUTO_PRESETS)) {
    presets.set(
      name,
      normalizeAutoCategories(categories, `builtin preset "${name}"`)
    );
  }
  const configuredPresets = config.workflow?.auto?.presets;
  if (!configuredPresets || typeof configuredPresets !== 'object')
    return presets;
  for (const [rawName, rawCategories] of Object.entries(configuredPresets)) {
    const name = normalizePresetName(rawName);
    if (!name) continue;
    if (!Array.isArray(rawCategories)) {
      throw createCliError(
        'INVALID_ARGUMENT',
        `workflow.auto.presets.${name} must be a string array of categories.`
      );
    }
    presets.set(
      name,
      normalizeAutoCategories(
        rawCategories.map((value) => String(value || '')),
        `workflow.auto.presets.${name}`
      )
    );
  }
  return presets;
}

function resolvePresetCategories(
  config: LoadedConfig,
  rawPresetName: string
): AutoPresetResolution {
  const presetName = normalizePresetName(rawPresetName);
  if (!presetName) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--auto-preset` requires a preset name.'
    );
  }
  const presetMap = resolveConfiguredPresetMap(config);
  const categories = presetMap.get(presetName);
  if (!categories) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Unknown auto preset: ${presetName}. Known presets: ${[...presetMap.keys()].sort().join(', ')}`
    );
  }
  return {
    preset: presetName,
    categories,
  };
}

function resolveConfigDefaultAutoMode(
  config: LoadedConfig
): AutoModeResolution | null {
  const autoPolicy = config.workflow?.auto;
  if (!autoPolicy) return null;
  if (
    Array.isArray(autoPolicy.defaultUntilCategories) &&
    autoPolicy.defaultUntilCategories.length > 0
  ) {
    return {
      untilCategories: normalizeAutoCategories(
        autoPolicy.defaultUntilCategories.map((value) => String(value || '')),
        'workflow.auto.defaultUntilCategories'
      ),
      preset: null,
      source: 'config:workflow.auto.defaultUntilCategories',
    };
  }
  const defaultPreset = normalizePresetName(autoPolicy.defaultPreset || '');
  if (!defaultPreset) return null;
  const resolved = resolvePresetCategories(config, defaultPreset);
  return {
    untilCategories: resolved.categories,
    preset: resolved.preset,
    source: 'config:workflow.auto.defaultPreset',
  };
}

function resolveAutoMode(
  config: LoadedConfig,
  options: FlowOptions,
  requestText: string | undefined
): AutoModeResolution | null {
  if (options.autoUntilCategory) {
    return {
      untilCategories: parseAutoUntilCategories(options.autoUntilCategory),
      preset: null,
      source: 'flag:--auto-until-category',
    };
  }
  if (options.autoPreset) {
    const resolved = resolvePresetCategories(config, options.autoPreset);
    return {
      untilCategories: resolved.categories,
      preset: resolved.preset,
      source: 'flag:--auto-preset',
    };
  }
  if (requestText) {
    return resolveConfigDefaultAutoMode(config);
  }
  return null;
}

function toAutoReasonCode(
  status: AutoRunSummary['status']
): AutoRunSummary['reasonCode'] {
  switch (status) {
    case 'gate_reached':
      return 'AUTO_GATE_REACHED';
    case 'manual_required':
      return 'AUTO_MANUAL_REQUIRED';
    case 'no_action_options':
      return 'AUTO_NO_ACTION_OPTIONS';
    case 'selection_required':
      return 'AUTO_SELECTION_REQUIRED';
    case 'no_progress':
      return 'AUTO_NO_PROGRESS';
    case 'request_label_missing':
      return 'AUTO_REQUEST_LABEL_MISSING';
    case 'request_failed':
      return 'AUTO_REQUEST_FAILED';
    case 'execution_failed':
    default:
      return 'AUTO_EXECUTION_FAILED';
  }
}

function isAutoRunFailureStatus(status: AutoRunSummary['status']): boolean {
  return (
    status === 'manual_required' ||
    status === 'selection_required' ||
    status === 'no_progress' ||
    status === 'request_label_missing' ||
    status === 'request_failed' ||
    status === 'execution_failed'
  );
}

function toFlowRunStatus(status: AutoRunSummary['status']): FlowRunStatus {
  switch (status) {
    case 'gate_reached':
    case 'manual_required':
      return 'paused';
    case 'no_action_options':
      return 'completed';
    case 'selection_required':
    case 'no_progress':
    case 'request_label_missing':
    case 'request_failed':
    case 'execution_failed':
    default:
      return 'failed';
  }
}

function buildAgentOrchestrationPolicy(
  autoRun: AutoRunSummary | null,
  featureRef: string | null
): AgentOrchestrationPolicy {
  const preferredResumeCommand =
    autoRun?.run?.resumeCommand || autoRun?.resume?.flowCommand || null;
  const handoffRequired = !!autoRun && !!preferredResumeCommand;
  const verifyCacheKey = handoffRequired
    ? `${(featureRef || 'unknown').toLowerCase()}|${Buffer.from(
        preferredResumeCommand as string
      )
        .toString('base64')
        .slice(0, 12)}`
    : '';
  return {
    mode: 'main_orchestrates_subagent_execution',
    delegationPolicy: 'prefer_main_delegate_long_running_fallback_main',
    delegateCommandExecution: 'long_running_only',
    delegateAutoRunExecution: true,
    fallbackToMainAgentWhenSubAgentUnavailable: true,
    longRunningCategories: [...LONG_RUNNING_DELEGATION_CATEGORIES],
    mainAgentResponsibilities: [
      'Keep user conversation state and approval boundaries',
      'Run the same execution loop directly when sub-agent is unavailable',
      'Delegate only long-running command/auto loops to sub-agents',
      'Report only on approval/manual/error boundaries',
    ],
    subAgentResponsibilities: [
      'Run flow/context command loops',
      'Execute selected atomic command actions',
      'Return structured status and errors to main agent',
    ],
    pauseAndReportWhen: [
      'approvalRequest.required=true',
      'AUTO_GATE_REACHED',
      'AUTO_MANUAL_REQUIRED',
      'command execution error',
    ],
    preferredResumeCommand,
    subAgentHandoff: {
      required: handoffRequired,
      mode: handoffRequired ? 'auto_run' : null,
      featureRef,
      category: null,
      cwd: handoffRequired ? process.cwd() : null,
      cmd: handoffRequired ? preferredResumeCommand : null,
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

function getFeatureRef(
  feature: Pick<ContextSelectionState['features'][number], 'folderName'>
): string {
  return feature.folderName;
}

function toCompactFlowFeature(
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
    completion: {
      implementationDone: feature.completion.implementationDone,
      workflowDone: feature.completion.workflowDone,
    },
    tasks: feature.tasks,
    completionChecklist: feature.completionChecklist,
    warnings: feature.warnings,
  };
}

function toCompactFlowActionOption(
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

function toCompactFlowContextSnapshot(
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
    primaryActionLabel: primaryAction?.label ?? null,
    primaryActionType: primaryAction?.action.type ?? null,
    primaryActionCategory: primaryAction?.action.category ?? null,
    primaryActionOperationType: primaryAction?.action.operationType ?? null,
  };
}

function toCompactAutoRun(
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
    gate: autoRun.gate ?? null,
    manual: autoRun.manual ?? null,
    resume: autoRun.resume,
    run: autoRun.run ?? null,
    error: autoRun.error ?? null,
  };
}

function toCompactStatusReport(
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

async function runAutoUntilCategory(
  config: LoadedConfig,
  featureName: string,
  selectionOptions: ContextSelectionOptions,
  untilCategories: string[],
  requestText: string | undefined,
  metadata?: { preset?: string | null; source?: string | null }
): Promise<AutoRunSummary> {
  const contextArgs = [
    'context',
    ...buildSelectionArgs(featureName, selectionOptions),
  ];
  const gateSet = new Set(untilCategories);
  const executions: AutoRunExecution[] = [];
  const stagnantLimit = 3;
  let stagnantCount = 0;
  let previousSignature: string | null = null;
  let requestHandled = !requestText;
  let iterations = 0;

  while (true) {
    const resume = buildAutoResume(
      featureName,
      selectionOptions,
      untilCategories,
      requestText,
      !requestHandled
    );
    iterations += 1;
    const ctx = (await createCliContext({ cwd: process.cwd() }))!;
    const state = await resolveContextSelection(
      ctx,
      featureName,
      selectionOptions
    );
    const actionOptions = state.actionOptions;
    const signature = JSON.stringify({
      contextVersion: state.contextVersion,
      actions: actionOptions.map((option) => ({
        label: option.label,
        category: option.action.category || null,
        type: option.action.type,
        detail: option.detail,
      })),
    });

    if (signature === previousSignature) {
      stagnantCount += 1;
    } else {
      stagnantCount = 0;
      previousSignature = signature;
    }
    if (stagnantCount >= stagnantLimit) {
      return {
        enabled: true,
        untilCategories,
        request: requestText,
        preset: metadata?.preset ?? null,
        source: metadata?.source ?? null,
        resume,
        status: 'no_progress',
        reasonCode: toAutoReasonCode('no_progress'),
        iterations,
        executions,
        gate: null,
        manual: null,
        error:
          'Auto-run stopped because the same context/action set repeated without progress.',
      };
    }

    if (state.status !== 'single_matched' || !state.matchedFeature) {
      return {
        enabled: true,
        untilCategories,
        request: requestText,
        preset: metadata?.preset ?? null,
        source: metadata?.source ?? null,
        resume,
        status: 'selection_required',
        reasonCode: toAutoReasonCode('selection_required'),
        iterations,
        executions,
        gate: null,
        manual: null,
        error:
          'Auto-run requires a single matched feature. Specify the feature explicitly.',
      };
    }

    if (actionOptions.length === 0) {
      return {
        enabled: true,
        untilCategories,
        request: requestText,
        preset: metadata?.preset ?? null,
        source: metadata?.source ?? null,
        resume,
        status: 'no_action_options',
        reasonCode: toAutoReasonCode('no_action_options'),
        iterations,
        executions,
        gate: null,
        manual: null,
      };
    }

    if (!requestHandled) {
      const requestOption = actionOptions.find(
        (option) => option.action.category === 'user_request_replan'
      );
      if (!requestOption) {
        return {
          enabled: true,
          untilCategories,
          request: requestText,
          preset: metadata?.preset ?? null,
          source: metadata?.source ?? null,
          resume,
          status: 'request_label_missing',
          reasonCode: toAutoReasonCode('request_label_missing'),
          iterations,
          executions,
          gate: null,
          manual: null,
          error:
            'The current action options do not include `user_request_replan`; cannot apply --request automatically.',
        };
      }
      const approvalReply = `${requestOption.label}, ${requestText}`;
      const approveResult = runSelfCliJson(
        [...contextArgs, '--approve', approvalReply],
        true
      ) as { status?: string; reasonCode?: string; error?: string } | undefined;
      const approveStatus = approveResult?.status ?? 'unknown';
      executions.push({
        kind: 'request',
        iteration: iterations,
        contextVersion: state.contextVersion,
        label: requestOption.label,
        category: requestOption.action.category,
        detail: requestOption.detail,
        approveStatus,
        executeStatus: 'skipped_instruction',
        executeReasonCode: approveResult?.reasonCode,
      });
      if (approveStatus !== 'approved_selected') {
        return {
          enabled: true,
          untilCategories,
          request: requestText,
          preset: metadata?.preset ?? null,
          source: metadata?.source ?? null,
          resume,
          status: 'request_failed',
          reasonCode: toAutoReasonCode('request_failed'),
          iterations,
          executions,
          gate: null,
          manual: null,
          error:
            approveResult?.error ||
            `Request injection failed with status: ${approveStatus}`,
        };
      }
      requestHandled = true;
      continue;
    }

    const gateOption = actionOptions.find((option) =>
      gateSet.has(option.action.category || '')
    );
    if (gateOption) {
      const contextPayload = runSelfCliJson(contextArgs, true) as
        | {
            approvalRequest?: {
              finalPrompt?: string;
              userFacingLines?: string[];
            };
          }
        | undefined;
      return {
        enabled: true,
        untilCategories,
        request: requestText,
        preset: metadata?.preset ?? null,
        source: metadata?.source ?? null,
        resume,
        status: 'gate_reached',
        reasonCode: toAutoReasonCode('gate_reached'),
        iterations,
        executions,
        gate: {
          label: gateOption.label,
          category: gateOption.action.category,
          detail: gateOption.detail,
          finalPrompt: contextPayload?.approvalRequest?.finalPrompt,
          userFacingLines: contextPayload?.approvalRequest?.userFacingLines,
        },
        manual: null,
      };
    }

    const executable = actionOptions.find(
      (option) => option.action.type === 'command'
    );
    if (!executable) {
      return {
        enabled: true,
        untilCategories,
        request: requestText,
        preset: metadata?.preset ?? null,
        source: metadata?.source ?? null,
        resume,
        status: 'manual_required',
        reasonCode: toAutoReasonCode('manual_required'),
        iterations,
        executions,
        gate: null,
        manual: {
          label: actionOptions[0].label,
          category: actionOptions[0].action.category,
          detail: actionOptions[0].detail,
        },
      };
    }

    const approveResult = runSelfCliJson(
      [...contextArgs, '--approve', executable.label],
      true
    ) as
      | {
          status?: string;
          reasonCode?: string;
          approvalTicket?: { token?: string };
          executeRequiresTicket?: boolean;
          error?: string;
        }
      | undefined;
    const approveStatus = approveResult?.status ?? 'unknown';
    if (approveStatus !== 'approved_selected') {
      executions.push({
        kind: 'command',
        iteration: iterations,
        contextVersion: state.contextVersion,
        label: executable.label,
        category: executable.action.category,
        detail: executable.detail,
        approveStatus,
        executeStatus: 'skipped',
        executeReasonCode: approveResult?.reasonCode,
      });
      return {
        enabled: true,
        untilCategories,
        request: requestText,
        preset: metadata?.preset ?? null,
        source: metadata?.source ?? null,
        resume,
        status: 'execution_failed',
        reasonCode: toAutoReasonCode('execution_failed'),
        iterations,
        executions,
        gate: null,
        manual: null,
        error:
          approveResult?.error ||
          `Auto approval failed for label ${executable.label} (${approveStatus}).`,
      };
    }

    const executeArgs = [
      ...contextArgs,
      '--approve',
      executable.label,
      '--execute',
    ];
    if (
      approveResult?.executeRequiresTicket &&
      approveResult.approvalTicket?.token
    ) {
      executeArgs.push('--ticket', approveResult.approvalTicket.token);
    }
    const executeResult = runSelfCliJson(executeArgs, true) as
      | { status?: string; reasonCode?: string; error?: string }
      | undefined;
    executions.push({
      kind: 'command',
      iteration: iterations,
      contextVersion: state.contextVersion,
      label: executable.label,
      category: executable.action.category,
      detail: executable.detail,
      approveStatus,
      executeStatus: executeResult?.status ?? 'unknown',
      executeReasonCode: executeResult?.reasonCode,
    });
    if (executeResult?.status !== 'approved_executed') {
      return {
        enabled: true,
        untilCategories,
        request: requestText,
        preset: metadata?.preset ?? null,
        source: metadata?.source ?? null,
        resume,
        status: 'execution_failed',
        reasonCode: toAutoReasonCode('execution_failed'),
        iterations,
        executions,
        gate: null,
        manual: null,
        error:
          executeResult?.error ||
          `Auto execution failed for label ${executable.label} (${executeResult?.status ?? 'unknown'}).`,
      };
    }
  }
}

export function flowCommand(program: Command): void {
  program
    .command('flow [feature-name]')
    .description('Run combined workflow checks (context + status + doctor)')
    .option('--json', 'Output in JSON format for agents')
    .option(
      '--json-compact',
      'Output compact JSON for agents (implies --json, reduced duplication)'
    )
    .option('--component <component>', 'Component name for multi projects')
    .option('--all', 'Include completed features when auto-detecting')
    .option('--done', 'Show completed (workflow-done) features only')
    .option(
      '--request <text>',
      'Apply a new user request first via user_request_replan when auto mode is enabled'
    )
    .option(
      '--auto-preset <name>',
      'Auto-run command actions using a named preset (example: pr-handoff)'
    )
    .option(
      '--auto-until-category <categories>',
      'Auto-run command actions until one of categories appears (comma-separated)'
    )
    .option(
      '--start-auto',
      'Persist auto-run checkpoint and emit resumable run id in JSON output'
    )
    .option(
      '--resume <run-id>',
      'Resume previously started auto-run checkpoint by run id'
    )
    .option(
      '--approve <reply>',
      'Approve one labeled context option (examples: A, A OK, A proceed, A 진행해)'
    )
    .option('--execute', 'Execute approved option when it is a command')
    .option(
      '--execute-strict',
      'With --execute, fail if approved option is instruction-only'
    )
    .option('--strict', 'Also run status --strict and doctor --strict')
    .action(async (featureName: string | undefined, options: FlowOptions) => {
      try {
        await runFlow(featureName, options);
      } catch (error) {
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        if (options.json || options.jsonCompact) {
          console.log(
            JSON.stringify({
              status: 'error',
              reasonCode: cliError.code,
              error: cliError.message,
              suggestions,
            })
          );
        } else {
          console.error(
            chalk.red(tr(lang, 'cli', 'common.errorLabel')),
            chalk.red(`[${cliError.code}] ${cliError.message}`)
          );
          printCliErrorSuggestions(suggestions, lang);
        }
        process.exitCode = 1;
        return;
      }
    });
}

async function runFlow(
  featureName: string | undefined,
  options: FlowOptions
): Promise<void> {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  if (options.executeStrict && !options.execute) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--execute-strict` requires `--execute`.'
    );
  }

  if (options.execute && !options.approve) {
    throw createCliError(
      'APPROVAL_REQUIRED',
      '`--execute` requires `--approve <reply>`.'
    );
  }
  const resumeRunId = (options.resume || '').trim() || undefined;
  if (options.startAuto && resumeRunId) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--start-auto` cannot be combined with `--resume`.'
    );
  }
  if (resumeRunId) {
    if (featureName) {
      throw createCliError(
        'INVALID_ARGUMENT',
        '`--resume` cannot be combined with <feature-name>.'
      );
    }
    if (options.autoPreset || options.autoUntilCategory || options.request) {
      throw createCliError(
        'INVALID_ARGUMENT',
        '`--resume` cannot be combined with `--auto-*` or `--request`.'
      );
    }
    if (options.component || options.all || options.done) {
      throw createCliError(
        'INVALID_ARGUMENT',
        '`--resume` cannot be combined with `--component`, `--all`, or `--done`.'
      );
    }
  }

  let requestText = options.request?.trim() || undefined;
  if (options.autoPreset && options.autoUntilCategory) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--auto-preset` cannot be combined with `--auto-until-category`.'
    );
  }
  let resolvedFeatureName = featureName;
  let selectedComponent = resolveComponentOption(options.component);
  const selectionOptions: ContextSelectionOptions = {
    component: selectedComponent,
    all: options.all,
    done: options.done,
  };
  let autoMode = resolveAutoMode(config, options, requestText);
  let flowRunRecord: FlowRunRecord | null = null;
  let flowRunMode: 'started' | 'resumed' | null = null;
  if (resumeRunId) {
    flowRunRecord = await getFlowRunRecord(process.cwd(), resumeRunId);
    if (flowRunRecord.status === 'completed') {
      throw createCliError(
        'INVALID_ARGUMENT',
        `Flow run ${resumeRunId} is already completed.`
      );
    }
    resolvedFeatureName = flowRunRecord.featureName;
    selectedComponent = resolveComponentOption(
      flowRunRecord.selection.component
    );
    selectionOptions.component = selectedComponent;
    selectionOptions.all = !!flowRunRecord.selection.all;
    selectionOptions.done = !!flowRunRecord.selection.done;
    requestText = flowRunRecord.auto.requestPending
      ? flowRunRecord.auto.requestText?.trim() || undefined
      : undefined;
    autoMode = {
      untilCategories: [...flowRunRecord.auto.untilCategories],
      preset: flowRunRecord.auto.preset ?? null,
      source: `resume:${resumeRunId}`,
    };
    flowRunMode = 'resumed';
    flowRunRecord = await updateFlowRunRecord(
      process.cwd(),
      resumeRunId,
      (current) => ({
        ...current,
        status: 'running',
      })
    );
  }

  if (autoMode && options.approve) {
    throw createCliError(
      'INVALID_ARGUMENT',
      'Auto mode cannot be combined with `--approve`.'
    );
  }
  if (autoMode && options.execute) {
    throw createCliError(
      'INVALID_ARGUMENT',
      'Auto mode cannot be combined with `--execute`.'
    );
  }
  if (requestText && !autoMode) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--request` requires auto mode. Use `--auto-until-category`, `--auto-preset`, or configure `workflow.auto.defaultPreset`.'
    );
  }
  if (autoMode && !featureName) {
    if (!resolvedFeatureName) {
      throw createCliError(
        'CONTEXT_SELECTION_REQUIRED',
        'Auto mode requires explicit <feature-name> (e.g. F004).'
      );
    }
  }

  if (options.startAuto && !autoMode) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--start-auto` requires auto mode (`--auto-until-category` or `--auto-preset`).'
    );
  }

  if (options.startAuto && autoMode && !flowRunRecord && resolvedFeatureName) {
    flowRunRecord = await createFlowRunRecord(process.cwd(), {
      featureName: resolvedFeatureName,
      selection: {
        component: selectedComponent || undefined,
        all: !!selectionOptions.all,
        done: !!selectionOptions.done,
      },
      auto: {
        untilCategories: [...autoMode.untilCategories],
        requestText,
        requestPending: !!requestText,
        preset: autoMode.preset ?? null,
        source: autoMode.source,
      },
    });
    flowRunMode = 'started';
  }

  const componentHint = selectedComponent
    ? ` --component ${selectedComponent}`
    : '';

  const ctx = (await createCliContext({ cwd: process.cwd() }))!;
  const before = await resolveContextSelection(
    ctx,
    resolvedFeatureName,
    selectionOptions
  );
  let approvalResult: unknown = null;
  let autoRun: AutoRunSummary | null = null;
  const contextArgs = [
    'context',
    ...buildSelectionArgs(resolvedFeatureName, selectionOptions),
  ];
  if (autoMode) {
    autoRun = await runAutoUntilCategory(
      config,
      resolvedFeatureName as string,
      selectionOptions,
      autoMode.untilCategories,
      requestText,
      { preset: autoMode.preset, source: autoMode.source }
    );
  } else if (options.approve) {
    const approveArgs = [...contextArgs, '--approve', options.approve];
    const selected = runSelfCliJson(approveArgs, true);

    if (options.execute) {
      const selectedPayload = selected as
        | {
            status?: string;
            executeRequiresTicket?: boolean;
            approvalTicket?: { token?: string };
          }
        | undefined;
      const executeRequiresTicket =
        selectedPayload?.executeRequiresTicket === true;
      const ticket = selectedPayload?.approvalTicket?.token;
      if (selectedPayload?.status === 'approved_selected') {
        const executeArgs = [
          ...contextArgs,
          '--approve',
          options.approve,
          '--execute',
        ];
        if (executeRequiresTicket && ticket) {
          executeArgs.push('--ticket', ticket);
        }
        if (options.executeStrict) executeArgs.push('--execute-strict');
        approvalResult = runSelfCliJson(executeArgs, true);
      } else {
        approvalResult = selected;
      }
    } else {
      approvalResult = selected;
    }
  }

  if (autoRun && flowRunRecord && flowRunMode) {
    const runStatus = toFlowRunStatus(autoRun.status);
    flowRunRecord = await updateFlowRunRecord(
      process.cwd(),
      flowRunRecord.runId,
      (current) => ({
        ...current,
        status: runStatus,
        auto: {
          ...current.auto,
          requestPending: autoRun.resume.requestPending,
        },
        lastAutoStatus: autoRun.status,
        lastReasonCode: autoRun.reasonCode,
        lastError: autoRun.error,
      })
    );
    autoRun.run = {
      runId: flowRunRecord.runId,
      mode: flowRunMode,
      status: flowRunRecord.status,
      resumeCommand: buildResumeRunCommand(flowRunRecord.runId),
    };
  }

  const after = await resolveContextSelection(
    ctx,
    resolvedFeatureName,
    selectionOptions
  );
  const statusReport = runSelfCliJson(['status']);
  const doctorReport = runSelfCliJson(['doctor']);

  let strictChecks: {
    enabled: boolean;
    statusStrictOk: boolean;
    doctorStrictOk: boolean;
  } | null = null;

  if (options.strict) {
    const statusStrict = runSelfCli(['status', '--strict']);
    const doctorStrict = runSelfCli(['doctor', '--strict']);
    strictChecks = {
      enabled: true,
      statusStrictOk: statusStrict.code === 0,
      doctorStrictOk: doctorStrict.code === 0,
    };

    if (!strictChecks.statusStrictOk || !strictChecks.doctorStrictOk) {
      throw createCliError(
        'PRECONDITION_FAILED',
        'Flow strict checks failed. Run `status --strict` and `doctor --strict` to inspect details.'
      );
    }
  }

  const jsonMode = !!options.json || !!options.jsonCompact;
  if (jsonMode) {
    const autoRunFailed = !!(autoRun && isAutoRunFailureStatus(autoRun.status));
    const agentOrchestration = buildAgentOrchestrationPolicy(
      autoRun,
      resolvedFeatureName || null
    );
    const status = autoRunFailed ? 'error' : 'ok';
    const reasonCode = autoRunFailed
      ? autoRun?.reasonCode || 'AUTO_EXECUTION_FAILED'
      : 'FLOW_SUMMARY';

    if (options.jsonCompact) {
      const compactPayload = {
        schema: 'flow.v2.compact',
        status,
        reasonCode,
        context: {
          before: toCompactFlowContextSnapshot(before),
          after: toCompactFlowContextSnapshot(after),
        },
        approval: approvalResult,
        autoRun: toCompactAutoRun(autoRun),
        agentOrchestration,
        statusReport: toCompactStatusReport(statusReport),
        doctorReport: toCompactStatusReport(doctorReport),
        strictChecks,
        suggestion: after.matchedFeature
          ? `npx lee-spec-kit context ${after.matchedFeature.folderName}${componentHint}`
          : `npx lee-spec-kit context${componentHint}`,
      };
      console.log(JSON.stringify(compactPayload, null, 2));
      if (autoRunFailed) {
        process.exitCode = 1;
      }
      return;
    }

    const payload = {
      status,
      reasonCode,
      context: {
        before: {
          status: before.status,
          reasonCode: toReasonCode(before.status),
          selectionMode: before.selectionMode,
          selectionFallback: before.selectionFallback,
          matchedFeature: before.matchedFeature,
          actionOptions: before.actionOptions,
          contextVersion: before.contextVersion,
        },
        after: {
          status: after.status,
          reasonCode: toReasonCode(after.status),
          selectionMode: after.selectionMode,
          selectionFallback: after.selectionFallback,
          matchedFeature: after.matchedFeature,
          actionOptions: after.actionOptions,
          contextVersion: after.contextVersion,
        },
      },
      approval: approvalResult,
      autoRun,
      agentOrchestration,
      statusReport,
      doctorReport,
      strictChecks,
      suggestion: after.matchedFeature
        ? `npx lee-spec-kit context ${after.matchedFeature.folderName}${componentHint}`
        : `npx lee-spec-kit context${componentHint}`,
    };
    console.log(JSON.stringify(payload, null, 2));
    if (autoRunFailed) {
      process.exitCode = 1;
    }
    return;
  }

  console.log();
  console.log(chalk.bold('🔁 Flow Summary'));
  console.log(
    chalk.gray(
      `- Before: ${before.status} (${toReasonCode(before.status)}) / After: ${after.status} (${toReasonCode(after.status)})`
    )
  );

  if (approvalResult && typeof approvalResult === 'object') {
    const result = approvalResult as { status?: string; reasonCode?: string };
    console.log(
      chalk.gray(
        `- Approval: ${result.status ?? 'unknown'} (${result.reasonCode ?? '-'})`
      )
    );
  }
  if (autoRun) {
    const presetSuffix = autoRun.preset ? `, preset ${autoRun.preset}` : '';
    console.log(
      chalk.gray(
        `- Auto: ${autoRun.status} (${autoRun.reasonCode}), iterations ${autoRun.iterations}, executions ${autoRun.executions.length}${presetSuffix}`
      )
    );
    console.log(chalk.gray(`- Auto resume: ${autoRun.resume.flowCommand}`));
    if (autoRun.run) {
      console.log(
        chalk.gray(
          `- Auto run: ${autoRun.run.mode} ${autoRun.run.runId} (${autoRun.run.status})`
        )
      );
      console.log(chalk.gray(`- Resume with: ${autoRun.run.resumeCommand}`));
    }
  }
  const agentOrchestration = buildAgentOrchestrationPolicy(
    autoRun,
    resolvedFeatureName || null
  );
  console.log(
    chalk.gray(
      `- Orchestration: ${agentOrchestration.mode}, delegate long-running loops to sub-agent`
    )
  );

  const statusCounts = (statusReport as { counts?: { features?: number } })
    .counts;
  const doctorCounts = (
    doctorReport as {
      counts?: { issues?: number; warnings?: number; errors?: number };
    }
  ).counts;
  console.log(chalk.gray(`- Status features: ${statusCounts?.features ?? 0}`));
  console.log(
    chalk.gray(
      `- Doctor issues: ${doctorCounts?.issues ?? 0} (errors ${doctorCounts?.errors ?? 0}, warnings ${doctorCounts?.warnings ?? 0})`
    )
  );

  if (strictChecks) {
    const strictLabel =
      strictChecks.statusStrictOk && strictChecks.doctorStrictOk
        ? chalk.green('PASS')
        : chalk.red('FAIL');
    console.log(chalk.gray(`- Strict checks: ${strictLabel}`));
  }

  console.log();
  if (
    autoRun?.status === 'gate_reached' &&
    autoRun.gate?.userFacingLines?.length
  ) {
    for (const line of autoRun.gate.userFacingLines) {
      console.log(line);
    }
    console.log(
      chalk.gray(
        'Auto gate reached. Reply with one of the labels shown above (example: A OK).'
      )
    );
    console.log();
  }
  if (autoRun && isAutoRunFailureStatus(autoRun.status)) {
    process.exitCode = 1;
  }
  if (after.matchedFeature) {
    console.log(
      chalk.blue(
        `Next: npx lee-spec-kit context ${after.matchedFeature.folderName}${componentHint}`
      )
    );
  } else {
    console.log(chalk.blue(`Next: npx lee-spec-kit context${componentHint}`));
  }
  console.log(
    chalk.gray(
      'Tip: add --approve <LABEL> [--execute] to run the selected atomic action.'
    )
  );
  console.log();
}

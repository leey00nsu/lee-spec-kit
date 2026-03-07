import { spawnSync } from 'child_process';
import { getConfig } from '../utils/config.js';
import { createCliError } from '../utils/cli-error.js';
import {
  ContextSelectionOptions,
  resolveContextSelection,
} from '../utils/context-selection.js';
import { ACTION_CATEGORIES } from '../utils/context.js';
import { createCliContext } from '../utils/cli-context.js';
import type { FlowRunStatus } from '../utils/flow-run.js';
import type { FlowOptions } from '../commands/flow.js';

export type LoadedConfig = NonNullable<Awaited<ReturnType<typeof getConfig>>>;

export interface AutoRunExecution {
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

export interface AutoRunResume {
  flowArgs: string[];
  flowCommand: string;
  contextArgs: string[];
  contextCommand: string;
  requiresFreshContext: true;
  requestPending: boolean;
}

export interface AutoRunSummary {
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

export interface AutoPresetResolution {
  preset: string;
  categories: string[];
}

export interface AutoModeResolution {
  untilCategories: string[];
  preset: string | null;
  source: string;
}

export interface CliRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export const BUILTIN_AUTO_PRESETS: Record<string, string[]> = {
  'pr-handoff': ['pr_create', 'code_review', 'pr_status_update'],
};

export function shellEscape(arg: string): string {
  if (/^[A-Za-z0-9_./:@%-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function toLeeSpecKitCommand(args: string[]): string {
  return ['npx', 'lee-spec-kit', ...args]
    .map((arg) => shellEscape(arg))
    .join(' ');
}

export function buildResumeRunCommand(runId: string): string {
  return toLeeSpecKitCommand(['flow', '--resume', runId]);
}

export function buildSelectionArgs(
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

export function buildAutoResume(
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

export function runSelfCli(args: string[]): CliRunResult {
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
    stdout: result.stdout?.toString() || '',
    stderr: result.stderr?.toString() || '',
  };
}

export function runSelfCliJson(args: string[], allowFailure = false): unknown {
  const result = runSelfCli(
    args.includes('--json') || args.includes('--json-compact')
      ? args
      : [...args, '--json']
  );
  if (result.code !== 0 && !allowFailure) {
    const detail = result.stderr.trim() || result.stdout.trim() || args.join(' ');
    throw createCliError('EXECUTION_FAILED', `Flow sub-command failed: ${detail}`);
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

export function normalizeAutoCategories(
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

export function parseAutoUntilCategories(raw: string): string[] {
  return normalizeAutoCategories(raw.split(','), '`--auto-until-category`');
}

export function normalizePresetName(raw: string): string {
  return raw.trim().toLowerCase();
}

export function resolveConfiguredPresetMap(
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
  if (!configuredPresets || typeof configuredPresets !== 'object') {
    return presets;
  }
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

export function resolvePresetCategories(
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
  return { preset: presetName, categories };
}

export function resolveConfigDefaultAutoMode(
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
  const res = resolvePresetCategories(config, defaultPreset);
  return {
    untilCategories: res.categories,
    preset: res.preset,
    source: 'config:workflow.auto.defaultPreset',
  };
}

export function resolveAutoMode(
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
    const res = resolvePresetCategories(config, options.autoPreset);
    return {
      untilCategories: res.categories,
      preset: res.preset,
      source: 'flag:--auto-preset',
    };
  }
  if (requestText) {
    return resolveConfigDefaultAutoMode(config);
  }
  return null;
}

export function toAutoReasonCode(
  status: AutoRunSummary['status']
): AutoRunSummary['reasonCode'] {
  const map: Record<AutoRunSummary['status'], AutoRunSummary['reasonCode']> = {
    gate_reached: 'AUTO_GATE_REACHED',
    manual_required: 'AUTO_MANUAL_REQUIRED',
    no_action_options: 'AUTO_NO_ACTION_OPTIONS',
    selection_required: 'AUTO_SELECTION_REQUIRED',
    no_progress: 'AUTO_NO_PROGRESS',
    request_label_missing: 'AUTO_REQUEST_LABEL_MISSING',
    request_failed: 'AUTO_REQUEST_FAILED',
    execution_failed: 'AUTO_EXECUTION_FAILED',
  };
  return map[status];
}

export function isAutoRunFailureStatus(
  status: AutoRunSummary['status']
): boolean {
  return [
    'manual_required',
    'selection_required',
    'no_progress',
    'request_label_missing',
    'request_failed',
    'execution_failed',
  ].includes(status);
}

export function toFlowRunStatus(
  status: AutoRunSummary['status']
): FlowRunStatus {
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

export async function runAutoUntilCategory(
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

    const gateOption = actionOptions.find(
      (option) =>
        gateSet.has(option.action.category || '') &&
        !!option.action.requiresUserCheck
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

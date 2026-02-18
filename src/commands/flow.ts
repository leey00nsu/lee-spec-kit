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
  ContextSelectionOptions,
  resolveContextSelection,
  toReasonCode,
} from '../utils/context-selection.js';
import { ACTION_CATEGORIES } from '../utils/context.js';
import { resolveComponentOption } from '../utils/context/component-option.js';

type LoadedConfig = NonNullable<Awaited<ReturnType<typeof getConfig>>>;

interface FlowOptions extends ContextSelectionOptions {
  json?: boolean;
  approve?: string;
  execute?: boolean;
  executeStrict?: boolean;
  strict?: boolean;
  request?: string;
  autoUntilCategory?: string;
  autoPreset?: string;
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

interface AutoRunSummary {
  enabled: true;
  untilCategories: string[];
  request?: string;
  preset?: string | null;
  source?: string | null;
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
  gate?:
    | {
        label: string;
        category?: string;
        detail: string;
        finalPrompt?: string;
        userFacingLines?: string[];
      }
    | null;
  manual?:
    | {
        label: string;
        category?: string;
        detail: string;
      }
    | null;
  error?: string;
}

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

function normalizeAutoCategories(values: string[], sourceLabel: string): string[] {
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

function resolveConfiguredPresetMap(config: LoadedConfig): Map<string, string[]> {
  const presets = new Map<string, string[]>();
  for (const [name, categories] of Object.entries(BUILTIN_AUTO_PRESETS)) {
    presets.set(name, normalizeAutoCategories(categories, `builtin preset "${name}"`));
  }
  const configuredPresets = config.workflow?.auto?.presets;
  if (!configuredPresets || typeof configuredPresets !== 'object') return presets;
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
    throw createCliError('INVALID_ARGUMENT', '`--auto-preset` requires a preset name.');
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

function resolveConfigDefaultAutoMode(config: LoadedConfig): AutoModeResolution | null {
  const autoPolicy = config.workflow?.auto;
  if (!autoPolicy) return null;
  if (Array.isArray(autoPolicy.defaultUntilCategories) && autoPolicy.defaultUntilCategories.length > 0) {
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

function toAutoReasonCode(status: AutoRunSummary['status']): AutoRunSummary['reasonCode'] {
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

async function runAutoUntilCategory(
  config: LoadedConfig,
  featureName: string,
  selectionOptions: ContextSelectionOptions,
  untilCategories: string[],
  requestText: string | undefined,
  metadata?: { preset?: string | null; source?: string | null }
): Promise<AutoRunSummary> {
  const contextArgs = ['context', ...buildSelectionArgs(featureName, selectionOptions)];
  const gateSet = new Set(untilCategories);
  const executions: AutoRunExecution[] = [];
  const stagnantLimit = 3;
  let stagnantCount = 0;
  let previousSignature: string | null = null;
  let requestHandled = !requestText;
  let iterations = 0;

  while (true) {
    iterations += 1;
    const state = await resolveContextSelection(config, featureName, selectionOptions);
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
      ) as
        | { status?: string; reasonCode?: string; error?: string }
        | undefined;
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

    const executable = actionOptions.find((option) => option.action.type === 'command');
    if (!executable) {
      return {
        enabled: true,
        untilCategories,
        request: requestText,
        preset: metadata?.preset ?? null,
        source: metadata?.source ?? null,
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
    if (approveResult?.executeRequiresTicket && approveResult.approvalTicket?.token) {
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
        if (options.json) {
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
  const requestText = options.request?.trim() || undefined;
  if (options.autoPreset && options.autoUntilCategory) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--auto-preset` cannot be combined with `--auto-until-category`.'
    );
  }
  const autoMode = resolveAutoMode(config, options, requestText);
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
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'Auto mode requires explicit <feature-name> (e.g. F004).'
    );
  }

  const selectedComponent = resolveComponentOption(options.component);
  const selectionOptions: ContextSelectionOptions = {
    component: selectedComponent,
    all: options.all,
    done: options.done,
  };
  const componentHint = selectedComponent
    ? ` --component ${selectedComponent}`
    : '';

  const before = await resolveContextSelection(config, featureName, selectionOptions);
  let approvalResult: unknown = null;
  let autoRun: AutoRunSummary | null = null;
  const contextArgs = ['context', ...buildSelectionArgs(featureName, selectionOptions)];
  if (autoMode) {
    autoRun = await runAutoUntilCategory(
      config,
      featureName as string,
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
      const executeRequiresTicket = selectedPayload?.executeRequiresTicket === true;
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

  const after = await resolveContextSelection(config, featureName, selectionOptions);
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

  if (options.json) {
    const autoRunFailed = !!(autoRun && isAutoRunFailureStatus(autoRun.status));
    const payload = {
      status: autoRunFailed ? 'error' : 'ok',
      reasonCode: autoRunFailed
        ? autoRun?.reasonCode || 'AUTO_EXECUTION_FAILED'
        : 'FLOW_SUMMARY',
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
  }

  const statusCounts = (statusReport as { counts?: { features?: number } }).counts;
  const doctorCounts = (
    doctorReport as { counts?: { issues?: number; warnings?: number; errors?: number } }
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
  if (autoRun?.status === 'gate_reached' && autoRun.gate?.userFacingLines?.length) {
    for (const line of autoRun.gate.userFacingLines) {
      console.log(line);
    }
    console.log(chalk.gray('Auto gate reached. Reply with one of the labels shown above (example: A OK).'));
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
  console.log(chalk.gray('Tip: add --approve <LABEL> [--execute] to run the selected atomic action.'));
  console.log();
}

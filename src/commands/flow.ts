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
import { createCliContext } from '../utils/cli-context.js';
import { resolveComponentOption } from '../utils/context/component-option.js';
import {
  createFlowRunRecord,
  getFlowRunRecord,
  type FlowRunRecord,
  updateFlowRunRecord,
} from '../utils/flow-run.js';

export interface FlowOptions extends ContextSelectionOptions {
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

import {
  toCompactFlowContextSnapshot,
  toCompactStatusReport,
  toCompactAutoRun,
  buildAgentOrchestrationPolicy,
} from '../services/FlowFormatters.js';

import {
  type AutoRunSummary,
  resolveAutoMode,
  isAutoRunFailureStatus,
  toFlowRunStatus,
  runAutoUntilCategory,
  buildSelectionArgs,
  runSelfCliJson,
  runSelfCli,
  buildResumeRunCommand,
} from '../services/FlowOrchestrator.js';

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

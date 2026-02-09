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

interface FlowOptions extends ContextSelectionOptions {
  json?: boolean;
  approve?: string;
  execute?: boolean;
  executeStrict?: boolean;
  strict?: boolean;
}

function resolveComponentOption(options: Pick<FlowOptions, 'repo' | 'component'>): string | undefined {
  if (
    options.repo &&
    options.component &&
    options.repo.trim().toLowerCase() !== options.component.trim().toLowerCase()
  ) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--repo` and `--component` must reference the same value when both are provided.'
    );
  }
  const component = (options.component || options.repo || '').trim().toLowerCase();
  return component || undefined;
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
  const component = (options.component || options.repo || '').trim();
  if (component) args.push('--component', component);
  if (options.all) args.push('--all');
  if (options.done) args.push('--done');
  return args;
}

export function flowCommand(program: Command): void {
  program
    .command('flow [feature-name]')
    .description('Run combined workflow checks (context + status + doctor)')
    .option('--json', 'Output in JSON format for agents')
    .option('--repo <repo>', 'Component name for multi projects')
    .option('--component <component>', 'Component name for multi projects')
    .option('--all', 'Include completed features when auto-detecting')
    .option('--done', 'Show completed (workflow-done) features only')
    .option('--approve <reply>', 'Approve one labeled context option')
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
        process.exit(1);
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

  const selectedComponent = resolveComponentOption(options);
  const selectionOptions: ContextSelectionOptions = {
    component: selectedComponent,
    all: options.all,
    done: options.done,
  };
  const componentHint = selectedComponent
    ? ` --component ${selectedComponent}`
    : '';

  const before = await resolveContextSelection(config, featureName, selectionOptions);

  const contextArgs = ['context', ...buildSelectionArgs(featureName, selectionOptions)];
  let approvalResult: unknown = null;
  if (options.approve) {
    const approveArgs = [...contextArgs, '--approve', options.approve];
    if (options.execute) approveArgs.push('--execute');
    if (options.executeStrict) approveArgs.push('--execute-strict');
    approvalResult = runSelfCliJson(approveArgs, true);
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
    const payload = {
      status: 'ok',
      reasonCode: 'FLOW_SUMMARY',
      context: {
        before: {
          status: before.status,
          reasonCode: toReasonCode(before.status),
          selectionMode: before.selectionMode,
          matchedFeature: before.matchedFeature,
          actionOptions: before.actionOptions,
          contextVersion: before.contextVersion,
        },
        after: {
          status: after.status,
          reasonCode: toReasonCode(after.status),
          selectionMode: after.selectionMode,
          matchedFeature: after.matchedFeature,
          actionOptions: after.actionOptions,
          contextVersion: after.contextVersion,
        },
      },
      approval: approvalResult,
      statusReport,
      doctorReport,
      strictChecks,
      suggestion: after.matchedFeature
        ? `npx lee-spec-kit context ${after.matchedFeature.folderName}${componentHint}`
        : `npx lee-spec-kit context${componentHint}`,
    };
    console.log(JSON.stringify(payload, null, 2));
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

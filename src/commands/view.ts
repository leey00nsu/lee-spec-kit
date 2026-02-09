import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
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

interface ViewOptions extends ContextSelectionOptions {
  json?: boolean;
}

function resolveComponentOption(options: Pick<ViewOptions, 'repo' | 'component'>): string | undefined {
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

export function viewCommand(program: Command): void {
  program
    .command('view [feature-name]')
    .description('Show workflow dashboard for features')
    .option('--json', 'Output in JSON format for agents')
    .option('--repo <repo>', 'Component name for multi projects')
    .option('--component <component>', 'Component name for multi projects')
    .option('--all', 'Include completed features when auto-detecting')
    .option('--done', 'Show completed (workflow-done) features only')
    .action(async (featureName: string | undefined, options: ViewOptions) => {
      try {
        await runView(featureName, options);
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

async function runView(
  featureName: string | undefined,
  options: ViewOptions
): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  const selectedComponent = resolveComponentOption(options);
  const state = await resolveContextSelection(config, featureName, {
    component: selectedComponent,
    all: options.all,
    done: options.done,
  });

  if (options.json) {
    const payload = {
      status: state.status,
      reasonCode: toReasonCode(state.status),
      selectionMode: state.selectionMode,
      counts: {
        features: state.features.length,
        open: state.openFeatures.length,
        inProgress: state.inProgressFeatures.length,
        readyToClose: state.readyToCloseFeatures.length,
        done: state.doneFeatures.length,
      },
      branches: state.branches,
      warnings: state.warnings,
      matchedFeature: state.matchedFeature,
      targetFeatures: state.targetFeatures,
      actionOptions: state.actionOptions,
      contextVersion: state.contextVersion,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('📊 Workflow View'));
  console.log(chalk.gray(`- Docs: ${path.relative(cwd, config.docsDir)}`));
  console.log(
    chalk.gray(
      `- Features: ${state.features.length} (open ${state.openFeatures.length} / done ${state.doneFeatures.length})`
    )
  );
  console.log(
    chalk.gray(
      `- In Progress: ${state.inProgressFeatures.length}, Ready To Close: ${state.readyToCloseFeatures.length}`
    )
  );
  if (state.warnings.length > 0) {
    console.log();
    console.log(chalk.yellow('⚠️  Environment warnings:'));
    for (const warning of state.warnings) {
      console.log(chalk.yellow(`  - ${warning}`));
    }
  }

  if (state.features.length === 0) {
    console.log();
    console.log(chalk.yellow('No features found.'));
    console.log(chalk.gray('Try: npx lee-spec-kit feature <name>'));
    console.log();
    return;
  }

  if (!state.matchedFeature) {
    console.log();
    console.log(chalk.blue(`Selection: ${state.status} (${toReasonCode(state.status)})`));
    const rows =
      state.targetFeatures.length > 0 ? state.targetFeatures : state.features;
    for (const f of rows) {
      const statusText = f.completion.workflowDone
        ? chalk.green('WORKFLOW_DONE')
        : f.completion.implementationDone
          ? chalk.cyan('DONE')
          : chalk.yellow('IN_PROGRESS');
      console.log(
        `- ${f.folderName} (${f.tasks.done}/${f.tasks.total}) ${statusText} step:${f.currentStep}`
      );
      console.log(chalk.gray(`  next: ${f.nextAction}`));
    }
    console.log();
    console.log(
      chalk.gray(
        'Tip: npx lee-spec-kit view <slug|F001|F001-slug> [--component <component>]'
      )
    );
    console.log();
    return;
  }

  const f = state.matchedFeature;
  const completion = `${f.tasks.done}/${f.tasks.total}`;
  const stateLabel = f.completion.workflowDone
    ? 'WORKFLOW_DONE'
    : f.completion.implementationDone
      ? 'DONE'
      : 'IN_PROGRESS';

  console.log();
  console.log(chalk.blue(`Feature: ${chalk.bold(f.folderName)}`));
  console.log(`- State: ${stateLabel}`);
  console.log(`- Progress: ${completion}`);
  console.log(`- Step: ${f.currentStep}`);
  console.log(`- Next: ${f.nextAction}`);

  if (state.actionOptions.length > 0) {
    console.log();
    console.log(chalk.green('Atomic options:'));
    for (const option of state.actionOptions) {
      if (option.action.type === 'command') {
        console.log(`  ${option.label}. (${option.action.scope}) ${option.action.cmd}`);
      } else {
        console.log(`  ${option.label}. ${option.action.message}`);
      }
    }
    console.log(
      chalk.gray(
        `Approve with: npx lee-spec-kit context ${f.folderName} --approve <LABEL>`
      )
    );
  }
  console.log();
}

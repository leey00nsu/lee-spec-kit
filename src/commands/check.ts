import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { runFlow, type FlowOptions } from './flow.js';

export function checkCommand(program: Command): void {
  program
    .command('check [feature-name]')
    .description('Summarize project health and workflow status')
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
      }
    });
}

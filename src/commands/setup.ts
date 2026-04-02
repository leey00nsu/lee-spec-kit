import { Command } from 'commander';
import chalk from 'chalk';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  getCodexConfigPath,
  removeLeeSpecKitCodexBootstrap,
  upsertLeeSpecKitCodexBootstrap,
} from '../utils/codex-bootstrap.js';
import {
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

interface CodexBootstrapOptions {
  remove?: boolean;
}

export function setupCommand(program: Command): void {
  const setup = program
    .command('setup')
    .description('Developer environment setup helpers');

  setup
    .command('codex-bootstrap')
    .description(
      'Install a small Codex global bootstrap that reads ./AGENTS.md or ./docs/AGENTS.md'
    )
    .option(
      '--remove',
      'Remove the lee-spec-kit managed Codex bootstrap block'
    )
    .action(async (options: CodexBootstrapOptions) => {
      const lang = DEFAULT_LANG;
      try {
        const filePath = getCodexConfigPath();
        if (options.remove) {
          const result = await removeLeeSpecKitCodexBootstrap(filePath);
          const message = result.changed
            ? tr(lang, 'cli', 'setup.codexBootstrapRemoved', {
                path: filePath,
              })
            : tr(lang, 'cli', 'setup.codexBootstrapAlreadyAbsent', {
                path: filePath,
              });
          console.log(chalk.green(message));
          return;
        }

        const result = await upsertLeeSpecKitCodexBootstrap(filePath);
        const key =
          result.action === 'noop'
            ? 'setup.codexBootstrapAlreadyInstalled'
            : 'setup.codexBootstrapInstalled';
        console.log(chalk.green(tr(lang, 'cli', key, { path: filePath })));
      } catch (error) {
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        console.error(
          chalk.red(tr(lang, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        printCliErrorSuggestions(suggestions, lang);
        process.exitCode = 1;
      }
    });
}

import { Command } from 'commander';
import chalk from 'chalk';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { getConfig } from '../utils/config.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import {
  resolveConfiguredStandaloneWorkspaceRoot,
  resolveStandaloneProjectRoots,
} from '../utils/standalone-workspace.js';

interface CodexOptions {
  remove?: boolean;
}

interface CodexHooksOptions {
  remove?: boolean;
}

function registerCodexIntegration(parent: Command): void {
  parent
    .command('codex')
    .alias('codex-bootstrap')
    .description(
      'Install or remove the optional Codex bootstrap that re-reads the current workspace ./AGENTS.md'
    )
    .option('--remove', 'Remove the lee-spec-kit managed Codex bootstrap block')
    .action(async (options: CodexOptions) => {
      const lang = DEFAULT_LANG;
      try {
        const {
          getCodexConfigPath,
          removeLeeSpecKitCodexBootstrap,
          upsertLeeSpecKitCodexBootstrap,
        } = await import('../integrations/codex/bootstrap.js');
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

function registerCodexHooksIntegration(parent: Command): void {
  parent
    .command('codex-hooks')
    .description(
      'Install or remove workspace-local Codex official hooks for the lee-spec-kit docs workflow'
    )
    .option(
      '--remove',
      'Remove lee-spec-kit managed workspace-local Codex hooks'
    )
    .action(async (options: CodexHooksOptions) => {
      const lang = DEFAULT_LANG;
      try {
        const config = await getConfig(process.cwd());
        if (!config) {
          throw createCliError(
            'DOCS_NOT_FOUND',
            'lee-spec-kit docs were not detected from the current directory. Run this command from the embedded repo root or the standalone workspace/docs root.'
          );
        }
        const {
          getRepoHooksConfigPath,
          removeLeeSpecKitCodexHooks,
          resolveCodexHooksRepoRoot,
          upsertLeeSpecKitCodexHooks,
        } = await import('../integrations/codex/hooks.js');
        const workflowRoot =
          config.docsRepo === 'standalone'
            ? resolveConfiguredStandaloneWorkspaceRoot(config)
            : resolveCodexHooksRepoRoot(process.cwd());
        if (!workflowRoot) {
          throw createCliError(
            'PRECONDITION_FAILED',
            'Standalone workspaceRoot is missing or invalid. Run `npx lee-spec-kit update --agents-md` from the shared workspace root to migrate this project.'
          );
        }
        const repoRoots =
          config.docsRepo === 'standalone'
            ? [workflowRoot, ...resolveStandaloneProjectRoots(config)]
            : [workflowRoot];
        const uniqueRepoRoots = [...new Set(repoRoots)];
        const filePaths = uniqueRepoRoots.map((repoRoot) =>
          getRepoHooksConfigPath(repoRoot)
        );
        const displayPath = filePaths.join(', ');
        if (options.remove) {
          const results = await Promise.all(
            uniqueRepoRoots.map((repoRoot) =>
              removeLeeSpecKitCodexHooks(repoRoot)
            )
          );
          const key = results.some((result) => result.changed)
            ? 'setup.codexHooksRemoved'
            : 'setup.codexHooksAlreadyAbsent';
          console.log(chalk.green(tr(lang, 'cli', key, { path: displayPath })));
          return;
        }

        const results = await Promise.all(
          uniqueRepoRoots.map((repoRoot) =>
            upsertLeeSpecKitCodexHooks(repoRoot, workflowRoot)
          )
        );
        const key = results.every((result) => result.action === 'noop')
          ? 'setup.codexHooksAlreadyInstalled'
          : 'setup.codexHooksInstalled';
        console.log(chalk.green(tr(lang, 'cli', key, { path: displayPath })));
        console.log(
          chalk.yellow(tr(lang, 'cli', 'setup.codexHooksTrustRequired'))
        );
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

export function integrationsCommand(program: Command): void {
  const integrations = program
    .command('integrations')
    .description('Optional developer integration helpers');

  registerCodexIntegration(integrations);
  registerCodexHooksIntegration(integrations);
}

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import prompts from 'prompts';
import { getConfig } from '../utils/config.js';
import {
  assertAllowedComponent,
  resolveProjectComponents,
} from '../utils/components.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { normalizeProjectType } from '../utils/project-type.js';
import { getDocsLockPath, withFileLock } from '../utils/lock.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

interface ConfigOptions {
  dir?: string;
  projectRoot?: string;
  component?: string;
  nonInteractive?: boolean;
}

export function configCommand(program: Command): void {
  program
    .command('config')
    .description('View or modify project configuration')
    .option('--dir <dir>', 'Docs directory or project path to target')
    .option('--project-root <path>', 'Set project root path')
    .option('--component <component>', 'Component name for multi projects')
    .option('--non-interactive', 'Fail instead of prompting for input')
    .action(async (options: ConfigOptions) => {
      try {
        await runConfig(options);
      } catch (error) {
        if (error instanceof Error && error.message === 'canceled') {
          const config = await getConfig(process.cwd());
          const lang = config?.lang ?? DEFAULT_LANG;
          console.log(chalk.yellow(`\n${tr(lang, 'cli', 'common.canceled')}`));
          process.exit(0);
        }
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        console.error(
          chalk.red(tr(lang, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        printCliErrorSuggestions(suggestions, lang);
        process.exit(1);
      }
    });
}

async function runConfig(options: ConfigOptions): Promise<void> {
  const cwd = process.cwd();
  const targetCwd = options.dir ? path.resolve(cwd, options.dir) : cwd;
  const config = await getConfig(targetCwd);

  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  const configPath = path.join(config.docsDir, '.lee-spec-kit.json');

  // 옵션 없이 실행: 현재 설정 출력
  if (!options.projectRoot) {
    console.log();
    console.log(chalk.blue(tr(config.lang, 'cli', 'config.currentTitle')));
    console.log();
    console.log(
      chalk.gray(
        `  ${tr(config.lang, 'cli', 'config.pathLabel')}: ${configPath}`
      )
    );
    console.log();

    const configFile = await fs.readJson(configPath);
    console.log(JSON.stringify(configFile, null, 2));
    console.log();
    return;
  }

  await withFileLock(
    getDocsLockPath(config.docsDir),
    async () => {
      // projectRoot 수정
      const configFile = await fs.readJson(configPath);

      // embedded인 경우 projectRoot 설정 불필요
      if (configFile.docsRepo !== 'standalone') {
        console.log(
          chalk.yellow(tr(config.lang, 'cli', 'config.projectRootStandaloneOnly'))
        );
        return;
      }

      const projectType = normalizeProjectType(String(configFile.projectType || 'single'));
      const targetFromOptions = options.component?.trim().toLowerCase();

      if (projectType === 'multi') {
        const components = resolveProjectComponents(projectType, configFile.components);
        let targetComponent = targetFromOptions;

        if (!targetComponent) {
          if (options.nonInteractive) {
            throw createCliError(
              'PROMPT_BLOCKED',
              '`--component` is required for multi projectRoot update when using `--non-interactive`.'
            );
          }
          // 대화형으로 선택
          const response = await prompts(
            [
              {
                type: 'select',
                name: 'component',
                message: tr(config.lang, 'cli', 'config.selectRepoToUpdate'),
                choices: components.map((value) => ({
                  title: value.toUpperCase(),
                  value,
                })),
              },
            ],
            {
              onCancel: () => {
                throw new Error('canceled');
              },
            }
          );
          targetComponent = response.component;
        }
        if (!targetComponent) {
          throw createCliError(
            'INVALID_ARGUMENT',
            'Component selection is required.'
          );
        }

        assertAllowedComponent(targetComponent, components);

        // 기존 projectRoot 가져오기 또는 초기화
        const currentRoot: Record<string, string> =
          typeof configFile.projectRoot === 'object' && configFile.projectRoot
            ? configFile.projectRoot
            : {};
        currentRoot[targetComponent] = options.projectRoot;
        configFile.projectRoot = currentRoot;

        console.log(
          chalk.green(
            tr(config.lang, 'cli', 'config.projectRootSet', {
              repo: targetComponent.toUpperCase(),
              path: options.projectRoot,
            })
          )
        );
      } else {
        if (targetFromOptions) {
          throw createCliError(
            'INVALID_ARGUMENT',
            '`--component` is only valid for multi projectRoot updates.'
          );
        }
        // Single: 바로 설정
        configFile.projectRoot = options.projectRoot;
        console.log(
          chalk.green(
            tr(config.lang, 'cli', 'config.projectRootSetSingle', {
              path: options.projectRoot,
            })
          )
        );
      }

      await fs.writeJson(configPath, configFile, { spaces: 2 });
      console.log();
    },
    { owner: 'config' }
  );
}

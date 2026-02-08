import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import prompts from 'prompts';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { getDocsLockPath, withFileLock } from '../utils/lock.js';
import { createCliError, toCliError } from '../utils/cli-error.js';

interface ConfigOptions {
  projectRoot?: string;
  repo?: 'fe' | 'be';
  nonInteractive?: boolean;
}

export function configCommand(program: Command): void {
  program
    .command('config')
    .description('View or modify project configuration')
    .option('--project-root <path>', 'Set project root path')
    .option('--repo <repo>', 'Repository type for fullstack: fe | be')
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
        const cliError = toCliError(error);
        console.error(
          chalk.red(tr(DEFAULT_LANG, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        process.exit(1);
      }
    });
}

async function runConfig(options: ConfigOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

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

      const projectType = configFile.projectType as 'single' | 'fullstack';

      if (projectType === 'fullstack') {
        // Fullstack: --repo 필수
        if (!options.repo) {
          if (options.nonInteractive) {
            throw createCliError(
              'PROMPT_BLOCKED',
              '`--repo` is required for fullstack projectRoot update when using `--non-interactive`.'
            );
          }
          // 대화형으로 선택
          const response = await prompts(
            [
              {
                type: 'select',
                name: 'repo',
                message: tr(config.lang, 'cli', 'config.selectRepoToUpdate'),
                choices: [
                  { title: 'Frontend (fe)', value: 'fe' },
                  { title: 'Backend (be)', value: 'be' },
                ],
              },
            ],
            {
              onCancel: () => {
                throw new Error('canceled');
              },
            }
          );
          options.repo = response.repo;
        }

        if (!options.repo || !['fe', 'be'].includes(options.repo)) {
          throw createCliError(
            'INVALID_ARGUMENT',
            tr(config.lang, 'cli', 'config.fullstackRepoRequired')
          );
        }

        // 기존 projectRoot 가져오기 또는 초기화
        const currentRoot = configFile.projectRoot || { fe: '', be: '' };
        if (typeof currentRoot === 'string') {
          // 잘못된 형태면 객체로 변환
          configFile.projectRoot = {
            fe: options.repo === 'fe' ? options.projectRoot : '',
            be: options.repo === 'be' ? options.projectRoot : '',
          };
        } else {
          currentRoot[options.repo] = options.projectRoot;
          configFile.projectRoot = currentRoot;
        }

        console.log(
          chalk.green(
            tr(config.lang, 'cli', 'config.projectRootSet', {
              repo: options.repo.toUpperCase(),
              path: options.projectRoot,
            })
          )
        );
      } else {
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

import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { copyTemplates, replaceInFiles } from '../utils/template.js';
import { getTemplatesDir } from '../utils/paths.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  validateSafeName,
  validateProjectType,
  validateLanguage,
  validateWorkflowMode,
  assertValid,
} from '../utils/validation.js';
import { execFileSync, execSync } from 'child_process';
import { getInitLockPath, withFileLock } from '../utils/lock.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

// Git 레포지토리 내부인지 확인
function checkGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

interface InitOptions {
  name?: string;
  type?: 'single' | 'fullstack';
  lang?: 'ko' | 'en';
  workflow?: 'github' | 'local';
  dir?: string;
  yes?: boolean;
  nonInteractive?: boolean;
}

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize project documentation structure')
    .option('-n, --name <name>', 'Project name (default: current folder name)')
    .option('-t, --type <type>', 'Project type: single | fullstack')
    .option('-l, --lang <lang>', 'Language: ko | en (default: en)')
    .option('--workflow <mode>', 'Workflow mode: github | local')
    .option('-d, --dir <dir>', 'Target directory (default: ./docs)', './docs')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .option('--non-interactive', 'Fail instead of prompting for input')
    .action(async (options: InitOptions) => {
      try {
        await runInit(options);
      } catch (error) {
        if (error instanceof Error && error.message === 'canceled') {
          const lang = options.lang ?? DEFAULT_LANG;
          console.log(
            chalk.yellow(`\n${tr(lang, 'cli', 'common.canceled')}`)
          );
          process.exit(0);
        }
        const lang = options.lang ?? DEFAULT_LANG;
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

async function runInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const defaultName = path.basename(cwd);

  let projectName = options.name || defaultName;
  let projectType = options.type;
  let lang = options.lang || 'en';
  let workflowMode = options.workflow || 'github';
  let docsRepo: 'embedded' | 'standalone' = 'embedded';
  let pushDocs: boolean | undefined;
  let docsRemote: string | undefined;
  let projectRoot: string | { fe: string; be: string } | undefined;
  const targetDir = path.resolve(cwd, options.dir || './docs');
  const skipPrompts = !!options.yes || !!options.nonInteractive;

  // Git 환경 감지
  const isInsideGitRepo = checkGitRepo(cwd);

  // 대화형 프롬프트 (--yes / --non-interactive가 없을 때)
  if (!skipPrompts) {
    // 언어 선택을 먼저 받아 이후 모든 프롬프트/메시지를 동일 언어로 출력
    if (!options.lang) {
      const langResponse = await prompts(
        [
          {
            type: 'select',
            name: 'lang',
            message: tr(DEFAULT_LANG, 'cli', 'init.selectLangPrompt'),
            choices: [
              { title: 'English (en)', value: 'en' },
              { title: '한국어 (ko)', value: 'ko' },
            ],
            initial: 0,
          },
        ],
        {
          onCancel: () => {
            throw new Error('canceled');
          },
        }
      );
      lang = langResponse.lang || lang;
    }

    // Git 환경 안내
    console.log();
    console.log(
      chalk.blue(`${tr(lang, 'cli', 'init.currentDirectoryLabel')}: ${cwd}`)
    );
    if (isInsideGitRepo) {
      console.log(chalk.green(tr(lang, 'cli', 'init.gitDetected')));
      console.log();
      console.log(
        chalk.gray(
          tr(lang, 'cli', 'init.insideProjectRoot')
        )
      );
      console.log(
        chalk.gray(
          tr(lang, 'cli', 'init.modeEmbeddedDesc')
        )
      );
      console.log(
        chalk.gray(
          tr(lang, 'cli', 'init.modeStandaloneDesc')
        )
      );
      console.log(
        chalk.gray(
          tr(lang, 'cli', 'init.modeStandaloneMove')
        )
      );
    } else {
      console.log(
        chalk.yellow(
          tr(lang, 'cli', 'init.gitNotDetected')
        )
      );
      console.log(chalk.gray(tr(lang, 'cli', 'init.gitNotDetectedDetail')));
    }
    console.log();

    const response = await prompts(
      [
        {
          type: options.name ? null : 'text',
          name: 'projectName',
          message: tr(lang, 'cli', 'init.prompt.projectName'),
          initial: defaultName,
        },
        {
          type: options.type ? null : 'select',
          name: 'projectType',
          message: tr(lang, 'cli', 'init.prompt.projectType'),
          choices: [
            {
              title: tr(lang, 'cli', 'init.choice.projectType.single.title'),
              value: 'single',
              description: tr(lang, 'cli', 'init.choice.projectType.single.desc'),
            },
            {
              title: tr(lang, 'cli', 'init.choice.projectType.fullstack.title'),
              value: 'fullstack',
              description: tr(lang, 'cli', 'init.choice.projectType.fullstack.desc'),
            },
          ],
          initial: 0,
        },
        {
          type: 'select',
          name: 'docsRepo',
          message: tr(lang, 'cli', 'init.prompt.docsMode'),
          choices: [
            {
              title: tr(lang, 'cli', 'init.choice.docsRepo.embedded.title'),
              value: 'embedded',
              description: tr(lang, 'cli', 'init.choice.docsRepo.embedded.desc'),
            },
            {
              title: tr(lang, 'cli', 'init.choice.docsRepo.standalone.title'),
              value: 'standalone',
              description: tr(lang, 'cli', 'init.choice.docsRepo.standalone.desc'),
            },
          ],
          initial: 0,
        },
      ],
      {
        onCancel: () => {
          throw new Error('canceled');
        },
      }
    );

    projectName = response.projectName || projectName;
    projectType = response.projectType || projectType;
    docsRepo = response.docsRepo || 'embedded';

    // standalone 선택 시 추가 질문
    if (docsRepo === 'standalone') {
      // projectRoot 입력 (프로젝트 타입에 따라 다름)
      const resolvedType = projectType || response.projectType || 'single';

      if (resolvedType === 'fullstack') {
        const projectRootResponse = await prompts(
          [
            {
              type: 'text',
              name: 'feRoot',
              message: tr(lang, 'cli', 'init.prompt.feRepoPath'),
              validate: (value: string) =>
                value.trim()
                  ? true
                  : tr(lang, 'cli', 'init.validation.enterPath'),
            },
            {
              type: 'text',
              name: 'beRoot',
              message: tr(lang, 'cli', 'init.prompt.beRepoPath'),
              validate: (value: string) =>
                value.trim()
                  ? true
                  : tr(lang, 'cli', 'init.validation.enterPath'),
            },
          ],
          {
            onCancel: () => {
              throw new Error('canceled');
            },
          }
        );

        projectRoot = {
          fe: projectRootResponse.feRoot,
          be: projectRootResponse.beRoot,
        };
      } else {
        const projectRootResponse = await prompts(
          [
            {
              type: 'text',
              name: 'projectRoot',
              message: tr(lang, 'cli', 'init.prompt.projectRepoPath'),
              validate: (value: string) =>
                value.trim()
                  ? true
                  : tr(lang, 'cli', 'init.validation.enterPath'),
            },
          ],
          {
            onCancel: () => {
              throw new Error('canceled');
            },
          }
        );

        projectRoot = projectRootResponse.projectRoot;
      }

      const standaloneResponse = await prompts(
        [
          {
            type: 'select',
            name: 'pushDocs',
            message: tr(lang, 'cli', 'init.prompt.pushMode'),
            choices: [
              {
                title: tr(lang, 'cli', 'init.choice.push.local'),
                value: false,
              },
              {
                title: tr(lang, 'cli', 'init.choice.push.remote'),
                value: true,
              },
            ],
            initial: 0,
          },
        ],
        {
          onCancel: () => {
            throw new Error('canceled');
          },
        }
      );

      pushDocs = standaloneResponse.pushDocs;

      // remote 선택 시 URL 입력
      if (pushDocs === true) {
        const remoteResponse = await prompts(
          [
            {
              type: 'text',
              name: 'docsRemote',
              message: tr(lang, 'cli', 'init.prompt.remoteUrl'),
              validate: (value: string) =>
                value.trim()
                  ? true
                  : tr(lang, 'cli', 'init.validation.enterUrl'),
            },
          ],
          {
            onCancel: () => {
              throw new Error('canceled');
            },
          }
        );

        docsRemote = remoteResponse.docsRemote;
      }
    }
  }

  // 타입 기본값
  if (!projectType) {
    projectType = 'single';
  }

  // 입력 검증
  assertValid(validateSafeName(projectName), '프로젝트 이름');
  assertValid(validateProjectType(projectType), '프로젝트 타입');
  assertValid(validateLanguage(lang), '언어');
  assertValid(validateWorkflowMode(workflowMode), '워크플로우 모드');
  const initLockPath = getInitLockPath(targetDir);
  await withFileLock(
    initLockPath,
    async () => {
      // 디렉토리 존재 확인
      if (await fs.pathExists(targetDir)) {
        const files = await fs.readdir(targetDir);
        if (files.length > 0) {
          if (options.nonInteractive) {
            throw createCliError(
              'PROMPT_BLOCKED',
              `Target directory is not empty: ${targetDir}. Re-run without --non-interactive to confirm overwrite.`
            );
          }

          const { overwrite } = await prompts({
            type: 'confirm',
            name: 'overwrite',
            message: tr(lang, 'cli', 'init.prompt.overwrite', { dir: targetDir }),
            initial: false,
          });

          if (!overwrite) {
            console.log(chalk.yellow(tr(lang, 'cli', 'common.canceled')));
            return;
          }
        }
      }

      console.log();
      console.log(chalk.blue(tr(lang, 'cli', 'init.log.creatingDocs')));
      console.log(
        chalk.gray(`  ${tr(lang, 'cli', 'init.log.projectLabel')}: ${projectName}`)
      );
      console.log(
        chalk.gray(`  ${tr(lang, 'cli', 'init.log.typeLabel')}: ${projectType}`)
      );
      console.log(chalk.gray(`  ${tr(lang, 'cli', 'init.log.langLabel')}: ${lang}`));
      console.log(
        chalk.gray(`  ${tr(lang, 'cli', 'init.log.pathLabel')}: ${targetDir}`)
      );
      console.log();

      // 템플릿 복사 (common 먼저, 타입별 오버라이드)
      const templatesDir = getTemplatesDir();
      const commonPath = path.join(templatesDir, lang, 'common');
      const typePath = path.join(templatesDir, lang, projectType);

      // common 템플릿 먼저 복사
      if (await fs.pathExists(commonPath)) {
        await copyTemplates(commonPath, targetDir);
      }

      // 타입별 템플릿으로 오버라이드
      if (!(await fs.pathExists(typePath))) {
        throw new Error(
          tr(lang, 'cli', 'init.error.templateNotFound', { path: typePath })
        );
      }
      await copyTemplates(typePath, targetDir);

      // 플레이스홀더 치환
      const featurePath =
        projectType === 'fullstack' ? 'docs/features/{be|fe}' : 'docs/features';
      const replacements: Record<string, string> = {
        '{{projectName}}': projectName,
        '{{date}}': new Date().toISOString().split('T')[0],
        '{{featurePath}}': featurePath,
      };

      await replaceInFiles(targetDir, replacements);

      // Config 파일 생성
      const config: Record<string, unknown> = {
        projectName,
        projectType,
        lang,
        createdAt: new Date().toISOString().split('T')[0],
        docsRepo,
        workflow: { mode: workflowMode },
        pr: {
          screenshots: { upload: false },
        },
        // Approval policy for "requiresUserCheck" actions shown by `context`.
        // - builtin (default): Use requiresUserCheck embedded in steps/actions.
        // - category: Override by action category (recommended for automation).
        // - steps: Override by step number (fragile; not recommended).
        approval: { mode: 'builtin' },
      };

      // standalone일 때만 pushDocs, projectRoot 추가
      if (docsRepo === 'standalone') {
        config.pushDocs = pushDocs;
        if (pushDocs && docsRemote) {
          config.docsRemote = docsRemote;
        }
        if (projectRoot) {
          config.projectRoot = projectRoot;
        }
      }

      const configPath = path.join(targetDir, '.lee-spec-kit.json');
      await fs.writeJson(configPath, config, { spaces: 2 });

      console.log(chalk.green(tr(lang, 'cli', 'init.log.docsCreated')));
      console.log();

      // Git 초기화
      await initGit(cwd, targetDir, docsRepo, lang, pushDocs, docsRemote);

      console.log(chalk.blue(tr(lang, 'cli', 'init.log.nextStepsTitle')));
      console.log(
        chalk.gray(tr(lang, 'cli', 'init.log.nextSteps1', { docsDir: targetDir }))
      );
      console.log(chalk.gray(tr(lang, 'cli', 'init.log.nextSteps2')));
      console.log();
    },
    { owner: 'init' }
  );
}

async function initGit(
  cwd: string,
  targetDir: string,
  docsRepo: 'embedded' | 'standalone',
  lang: 'ko' | 'en',
  pushDocs?: boolean,
  docsRemote?: string
): Promise<void> {
  try {
    const runGit = (args: string[], workdir: string): void => {
      execFileSync('git', args, { cwd: workdir, stdio: 'ignore' });
    };

    const getCachedStagedFiles = (workdir: string): string[] | null => {
      try {
        const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
          cwd: workdir,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (!out) return [];
        return out.split('\n').map((s) => s.trim()).filter(Boolean);
      } catch {
        return null;
      }
    };

    // Git이 이미 초기화되어 있는지 확인
    try {
      runGit(['rev-parse', '--is-inside-work-tree'], cwd);
      // Git이 이미 있으면 docs만 커밋
      console.log(chalk.blue(tr(lang, 'cli', 'init.log.gitRepoDetectedCommit')));
    } catch {
      // Git이 없으면 초기화
      console.log(chalk.blue(tr(lang, 'cli', 'init.log.gitInit')));
      runGit(['init'], cwd);
    }

    // docs 폴더 스테이징
    const relativePath = path.relative(cwd, targetDir);
    const stagedBeforeAdd = getCachedStagedFiles(cwd);
    if (relativePath === '.' && stagedBeforeAdd && stagedBeforeAdd.length > 0) {
      console.log(
        chalk.yellow(
          tr(lang, 'cli', 'init.warn.stagedChangesSkip')
        )
      );
      console.log(chalk.gray(tr(lang, 'cli', 'init.warn.commitManually')));
      console.log();
      return;
    }

    runGit(['add', relativePath], cwd);

    // 커밋
    // pathspec을 사용해 "docs만" 커밋 (다른 staged 변경이 있어도 포함되지 않음)
    runGit(
      ['commit', '-m', 'init: docs 구조 초기화 (lee-spec-kit)', '--', relativePath],
      cwd
    );

    // standalone + remote 선택 시 origin 추가
    if (docsRepo === 'standalone' && pushDocs && docsRemote) {
      try {
        runGit(['remote', 'add', 'origin', docsRemote], cwd);
        console.log(
          chalk.green(tr(lang, 'cli', 'init.log.gitRemoteSet', { remote: docsRemote }))
        );
      } catch {
        // remote가 이미 존재할 수 있음
        console.log(chalk.yellow(tr(lang, 'cli', 'init.warn.gitRemoteExists')));
      }
    }

    console.log(chalk.green(tr(lang, 'cli', 'init.log.gitInitialCommitDone')));
    console.log();
  } catch {
    // Git 관련 오류는 무시하고 경고만 출력
    console.log(
      chalk.yellow(tr(lang, 'cli', 'init.warn.skipGitInit'))
    );
    console.log();
  }
}

import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { copyTemplates, replaceInFiles } from '../utils/template.js';
import { DefaultFileSystemAdapter } from '../adapters/DefaultFileSystemAdapter.js';
import { getTemplatesDir } from '../utils/paths.js';
import {
  assertValidComponentId,
  parseComponentsOption,
} from '../utils/components.js';
import { normalizeProjectType } from '../utils/project-type.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  validateSafeNameWithLang,
  validateProjectTypeWithLang,
  validateLanguageWithLang,
  validateWorkflowModeWithLang,
  assertValid,
} from '../utils/validation.js';
import { execFileSync } from 'child_process';
import { getInitLockPath, withFileLock } from '../utils/lock.js';
import { getLocalDateString } from '../utils/date.js';
import { pruneEngineManagedDocs } from '../utils/engine-managed-docs.js';
import { runGitOrThrow } from '../utils/git-run.js';
import { upsertLeeSpecKitAgentsMd } from '../utils/agents-md.js';
import { hasLeeSpecKitCodexBootstrap } from '../integrations/codex/bootstrap.js';
import {
  resolveStandaloneWorkspaceRoot,
  serializeStandaloneWorkspaceRoot,
} from '../utils/standalone-workspace.js';
import {
  getComponentFeaturesReadme,
  parseComponentProjectRootsOption,
  parseStandaloneMultiProjectRootJson,
  validatePromptPathValue,
  validatePromptUrlValue,
} from '../utils/init/options.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { createDefaultApprovalConfig } from '../utils/config.js';

// Git 레포지토리 내부인지 확인
function checkGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function getGitTopLevelOrNull(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const value = String(out || '').trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

function isSameOrWithinDir(parentDir: string, candidateDir: string): boolean {
  const resolvedParent = path.resolve(parentDir);
  const resolvedCandidate = path.resolve(candidateDir);
  return (
    resolvedParent === resolvedCandidate ||
    resolvedCandidate.startsWith(`${resolvedParent}${path.sep}`)
  );
}

function getContainingGitRoot(targetDir: string): string | null {
  let current = path.resolve(targetDir);

  while (true) {
    if (fs.existsSync(current)) {
      return getGitTopLevelOrNull(current);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveStandaloneInitProjectRoots(
  projectRoot: string | Record<string, string> | undefined,
  cwd: string
): string[] {
  if (!projectRoot) return [];
  const rawRoots =
    typeof projectRoot === 'string' ? [projectRoot] : Object.values(projectRoot);
  const deduped = new Set<string>();
  for (const rawRoot of rawRoots) {
    const value = String(rawRoot || '').trim();
    if (!value) continue;
    deduped.add(path.resolve(cwd, value));
  }
  return [...deduped];
}

function hasStandaloneProjectRepoOutsideWorkspaceGitRoot(
  workspaceGitRoot: string,
  projectRoots: string[]
): boolean {
  return projectRoots.some((projectRoot) => {
    const resolvedProjectRoot = path.resolve(projectRoot);
    if (!isSameOrWithinDir(workspaceGitRoot, resolvedProjectRoot)) {
      return true;
    }
    const projectGitRoot = getContainingGitRoot(resolvedProjectRoot);
    return !!projectGitRoot && path.resolve(projectGitRoot) !== path.resolve(workspaceGitRoot);
  });
}

interface InitOptions {
  name?: string;
  type?: 'single' | 'multi' | 'fullstack';
  components?: string;
  lang?: 'ko' | 'en';
  workflow?: 'github' | 'local';
  dir?: string;
  docsRepo?: 'embedded' | 'standalone';
  projectRoot?: string;
  componentProjectRoots?: string;
  pushDocs?: boolean;
  docsRemote?: string;
  yes?: boolean;
  force?: boolean;
  nonInteractive?: boolean;
}

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize project documentation structure')
    .option('-n, --name <name>', 'Project name (default: current folder name)')
    .option(
      '-t, --type <type>',
      'Project type: single | multi (fullstack alias)'
    )
    .option(
      '--components <list>',
      'Component list for multi (comma-separated, e.g. app,api,worker)'
    )
    .option('-l, --lang <lang>', 'Language: ko | en (default: en)')
    .option('--workflow <mode>', 'Workflow mode: github | local')
    .option('-d, --dir <dir>', 'Target directory (default: ./docs)', './docs')
    .option('--docs-repo <mode>', 'Docs repository mode: embedded | standalone')
    .option(
      '--project-root <path>',
      'Project root path (standalone single) or JSON map for standalone multi'
    )
    .option(
      '--component-project-roots <pairs>',
      'Component roots for standalone multi (comma-separated, e.g. app=/path/app,api=/path/api,worker=/path/worker)'
    )
    .option('--push-docs', 'Push standalone docs to remote')
    .option('--docs-remote <url>', 'Remote URL for standalone docs repository')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .option('-f, --force', 'Overwrite target directory if not empty')
    .option('--non-interactive', 'Fail instead of prompting for input')
    .action(async (options: InitOptions) => {
      try {
        await runInit(options);
      } catch (error) {
        if (error instanceof Error && error.message === 'canceled') {
          const lang = options.lang ?? DEFAULT_LANG;
          console.log(chalk.yellow(`\n${tr(lang, 'cli', 'common.canceled')}`));
          return;
        }
        const lang = options.lang ?? DEFAULT_LANG;
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        console.error(
          chalk.red(tr(lang, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        printCliErrorSuggestions(suggestions, lang);
        process.exitCode = 1;
        return;
      }
    });
}

async function runInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const defaultName = path.basename(cwd);

  let projectName = options.name || defaultName;
  let projectType = options.type;
  let components = parseComponentsOption(options.components);
  let lang = options.lang || 'en';
  let workflowMode = options.workflow || 'github';
  let docsRepo: 'embedded' | 'standalone' = options.docsRepo || 'embedded';
  let pushDocs: boolean | undefined =
    typeof options.pushDocs === 'boolean' ? options.pushDocs : undefined;
  let docsRemote: string | undefined = options.docsRemote;
  let projectRoot: string | Record<string, string> | undefined;
  let standaloneWorkspaceRoot: string | null = null;
  const componentProjectRoots = options.componentProjectRoots
    ? parseComponentProjectRootsOption(options.componentProjectRoots)
    : {};
  const targetDir = path.resolve(cwd, options.dir || './docs');
  const skipPrompts = !!options.yes || !!options.nonInteractive;

  if (
    options.docsRepo &&
    !['embedded', 'standalone'].includes(options.docsRepo)
  ) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--docs-repo` must be `embedded` or `standalone`.'
    );
  }

  if (docsRemote && typeof pushDocs === 'undefined') {
    // docs remote is meaningful only when standalone docs push is enabled.
    pushDocs = true;
  }

  if (options.projectRoot) {
    projectRoot = options.projectRoot;
  }

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
      console.log(chalk.gray(tr(lang, 'cli', 'init.insideProjectRoot')));
      console.log(chalk.gray(tr(lang, 'cli', 'init.modeEmbeddedDesc')));
      console.log(chalk.gray(tr(lang, 'cli', 'init.modeStandaloneDesc')));
      console.log(chalk.gray(tr(lang, 'cli', 'init.modeStandaloneMove')));
    } else {
      console.log(chalk.yellow(tr(lang, 'cli', 'init.gitNotDetected')));
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
              description: tr(
                lang,
                'cli',
                'init.choice.projectType.single.desc'
              ),
            },
            {
              title: tr(lang, 'cli', 'init.choice.projectType.fullstack.title'),
              value: 'multi',
              description: tr(
                lang,
                'cli',
                'init.choice.projectType.fullstack.desc'
              ),
            },
          ],
          initial: 1,
        },
        {
          type: options.docsRepo ? null : 'select',
          name: 'docsRepo',
          message: tr(lang, 'cli', 'init.prompt.docsMode'),
          choices: [
            {
              title: tr(lang, 'cli', 'init.choice.docsRepo.embedded.title'),
              value: 'embedded',
              description: tr(
                lang,
                'cli',
                'init.choice.docsRepo.embedded.desc'
              ),
            },
            {
              title: tr(lang, 'cli', 'init.choice.docsRepo.standalone.title'),
              value: 'standalone',
              description: tr(
                lang,
                'cli',
                'init.choice.docsRepo.standalone.desc'
              ),
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
      const resolvedType = normalizeProjectType(
        String(projectType || response.projectType || 'multi')
      );

      if (resolvedType === 'multi') {
        const promptComponents = components.length > 0 ? components : ['app'];
        const rootMap: Record<string, string> = {};

        if (typeof projectRoot === 'string' && projectRoot.trim()) {
          Object.assign(
            rootMap,
            parseStandaloneMultiProjectRootJson(projectRoot)
          );
        } else if (projectRoot && typeof projectRoot === 'object') {
          for (const [component, root] of Object.entries(projectRoot)) {
            const normalized = component.trim().toLowerCase();
            const normalizedRoot = String(root || '').trim();
            if (!normalized || !normalizedRoot) continue;
            rootMap[normalized] = normalizedRoot;
          }
        }

        Object.assign(rootMap, componentProjectRoots);

        for (const component of promptComponents) {
          const seeded = (rootMap[component] || '').trim();
          if (seeded) {
            rootMap[component] = seeded;
            continue;
          }
          const message = tr(lang, 'cli', 'init.prompt.componentRepoPath', {
            component,
          });

          const response = await prompts(
            [
              {
                type: 'text',
                name: 'componentRoot',
                message,
                validate: (value: string) =>
                  validatePromptPathValue(value, lang),
              },
            ],
            {
              onCancel: () => {
                throw new Error('canceled');
              },
            }
          );
          rootMap[component] = (response.componentRoot || '').trim();
        }

        projectRoot = rootMap;
      } else {
        const projectRootResponse = await prompts(
          [
            {
              type: options.projectRoot ? null : 'text',
              name: 'projectRoot',
              message: tr(lang, 'cli', 'init.prompt.projectRepoPath'),
              validate: (value: string) => validatePromptPathValue(value, lang),
            },
          ],
          {
            onCancel: () => {
              throw new Error('canceled');
            },
          }
        );

        projectRoot =
          projectRootResponse.projectRoot ||
          (typeof projectRoot === 'string' ? projectRoot : '');
      }

      const standaloneResponse = await prompts(
        [
          {
            type: typeof options.pushDocs === 'boolean' ? null : 'select',
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

      pushDocs =
        typeof standaloneResponse.pushDocs === 'boolean'
          ? standaloneResponse.pushDocs
          : pushDocs;

      // remote 선택 시 URL 입력
      if (pushDocs === true) {
        const remoteResponse = await prompts(
          [
            {
              type: options.docsRemote ? null : 'text',
              name: 'docsRemote',
              message: tr(lang, 'cli', 'init.prompt.remoteUrl'),
              validate: (value: string) => validatePromptUrlValue(value, lang),
            },
          ],
          {
            onCancel: () => {
              throw new Error('canceled');
            },
          }
        );

        docsRemote = remoteResponse.docsRemote || docsRemote;
      }
    }
  }

  // 타입 기본값
  if (!projectType) {
    projectType = 'multi';
  }

  // 입력 검증
  assertValid(
    validateSafeNameWithLang(projectName, lang),
    tr(lang, 'cli', 'validation.context.projectName'),
    lang
  );
  assertValid(
    validateProjectTypeWithLang(projectType, lang),
    tr(lang, 'cli', 'validation.context.projectType'),
    lang
  );
  projectType = normalizeProjectType(projectType);
  assertValid(
    validateLanguageWithLang(lang, lang),
    tr(lang, 'cli', 'validation.context.language'),
    lang
  );
  assertValid(
    validateWorkflowModeWithLang(workflowMode, lang),
    tr(lang, 'cli', 'validation.context.workflowMode'),
    lang
  );

  if (projectType === 'single') {
    if (components.length > 0) {
      throw createCliError(
        'INVALID_ARGUMENT',
        '`--components` can only be used when `--type multi`.'
      );
    }
  } else {
    if (components.length === 0) {
      components = ['app'];
    }
    components.forEach(assertValidComponentId);
  }

  if (docsRepo !== 'standalone') {
    if (
      options.projectRoot ||
      options.componentProjectRoots ||
      typeof options.pushDocs === 'boolean' ||
      options.docsRemote
    ) {
      throw createCliError(
        'INVALID_ARGUMENT',
        'Standalone-only options require `--docs-repo standalone`.'
      );
    }
    projectRoot = undefined;
    pushDocs = undefined;
    docsRemote = undefined;
  } else {
    if (projectType === 'multi') {
      const multiRoot: Record<string, string> = {};

      if (typeof projectRoot === 'string' && projectRoot.trim()) {
        Object.assign(
          multiRoot,
          parseStandaloneMultiProjectRootJson(projectRoot)
        );
      } else if (projectRoot && typeof projectRoot === 'object') {
        for (const [component, root] of Object.entries(projectRoot)) {
          const normalized = component.trim().toLowerCase();
          const normalizedRoot = String(root || '').trim();
          if (!normalized || !normalizedRoot) continue;
          multiRoot[normalized] = normalizedRoot;
        }
      }

      Object.assign(multiRoot, componentProjectRoots);

      const unknownComponents = Object.keys(multiRoot).filter(
        (component) => !components.includes(component)
      );
      if (unknownComponents.length > 0) {
        throw createCliError(
          'INVALID_ARGUMENT',
          `Standalone multi project roots contain unknown components: ${unknownComponents.join(', ')}. Allowed: ${components.join(', ')}`
        );
      }

      const missingComponents = components.filter(
        (component) => !(multiRoot[component] || '').trim()
      );
      if (missingComponents.length > 0) {
        throw createCliError(
          'PROMPT_BLOCKED',
          `Standalone multi mode requires project roots for all components: ${missingComponents.join(', ')}. Use \`--component-project-roots <component=/path,...>\` or \`--project-root '{"component":"/path"}'\`.`
        );
      }

      projectRoot = Object.fromEntries(
        components.map((component) => [component, multiRoot[component].trim()])
      );
    } else {
      if (options.componentProjectRoots) {
        throw createCliError(
          'INVALID_ARGUMENT',
          '`--component-project-roots` can only be used when `--type multi`.'
        );
      }
      const singleRoot =
        typeof projectRoot === 'string' ? projectRoot.trim() : '';
      if (!singleRoot) {
        throw createCliError(
          'PROMPT_BLOCKED',
          'Standalone single mode requires `--project-root`.'
        );
      }
      projectRoot = singleRoot;
    }

    if (typeof pushDocs !== 'boolean') {
      pushDocs = false;
    }

    if (pushDocs === true && !docsRemote?.trim()) {
      throw createCliError(
        'PROMPT_BLOCKED',
        '`--push-docs` requires `--docs-remote <url>` in standalone mode.'
      );
    }
    if (pushDocs === false) {
      docsRemote = undefined;
    }

    const cwdGitRoot = getGitTopLevelOrNull(cwd);
    const standaloneProjectRoots = resolveStandaloneInitProjectRoots(projectRoot, cwd);
    standaloneWorkspaceRoot = resolveStandaloneWorkspaceRoot(cwd, targetDir);
    const targetMatchesProjectRoot = standaloneProjectRoots.some(
      (projectRootPath) => path.resolve(projectRootPath) === path.resolve(targetDir)
    );
    const allowWorkspaceGitRoot =
      !!cwdGitRoot &&
      path.resolve(cwdGitRoot) === path.resolve(cwd) &&
      hasStandaloneProjectRepoOutsideWorkspaceGitRoot(
        cwdGitRoot,
        standaloneProjectRoots
      );

    if (cwdGitRoot && isSameOrWithinDir(cwdGitRoot, targetDir) && !allowWorkspaceGitRoot) {
      throw createCliError(
        'PRECONDITION_FAILED',
        'Standalone init must be started from the shared workspace root, not from inside an existing project git repository. Choose a docs directory outside the current git repo.'
      );
    }

    if (targetMatchesProjectRoot) {
      throw createCliError(
        'PRECONDITION_FAILED',
        'Standalone init cannot place docs at the project repo root. Choose a dedicated docs directory outside the project repo.'
      );
    }

    if (path.resolve(standaloneWorkspaceRoot) === path.resolve(targetDir)) {
      throw createCliError(
        'PRECONDITION_FAILED',
        'Standalone init must be started from the shared workspace root above the docs directory, not from the docs repo root.'
      );
    }

    const targetGitRoot = getContainingGitRoot(targetDir);
    const targetIsGitRoot =
      !!targetGitRoot && path.resolve(targetGitRoot) === path.resolve(targetDir);
    const targetIsVerifiedWorkspaceRoot =
      !!targetGitRoot &&
      !!cwdGitRoot &&
      allowWorkspaceGitRoot &&
      path.resolve(targetGitRoot) === path.resolve(cwdGitRoot) &&
      path.resolve(targetDir) === path.resolve(cwd);
    if (targetIsGitRoot && !targetIsVerifiedWorkspaceRoot) {
      throw createCliError(
        'PRECONDITION_FAILED',
        'Standalone init cannot place docs at an existing git repo root unless that root is the verified shared workspace root. Choose a dedicated docs directory instead.'
      );
    }
    if (
      targetGitRoot &&
      isSameOrWithinDir(targetGitRoot, targetDir) &&
      !targetIsGitRoot &&
      !(
        allowWorkspaceGitRoot &&
        cwdGitRoot &&
        path.resolve(targetGitRoot) === path.resolve(cwdGitRoot)
      )
    ) {
      throw createCliError(
        'PRECONDITION_FAILED',
        'Standalone init cannot place docs inside an existing project git repository. Choose the shared workspace root and a docs directory outside any project repo.'
      );
    }
  }

  const initLockPath = getInitLockPath(targetDir);
  await withFileLock(
    initLockPath,
    async () => {
      // 디렉토리 존재 확인
      if (await fs.pathExists(targetDir)) {
        const files = await fs.readdir(targetDir);
        if (files.length > 0) {
          if (options.force) {
            // Continue without confirmation in force mode.
          } else if (options.nonInteractive) {
            throw createCliError(
              'PROMPT_BLOCKED',
              `Target directory is not empty: ${targetDir}. Re-run with \`--force\` or without \`--non-interactive\` to confirm overwrite.`
            );
          } else {
            const { overwrite } = await prompts({
              type: 'confirm',
              name: 'overwrite',
              message: tr(lang, 'cli', 'init.prompt.overwrite', {
                dir: targetDir,
              }),
              initial: false,
            });

            if (!overwrite) {
              console.log(chalk.yellow(tr(lang, 'cli', 'common.canceled')));
              return;
            }
          }
        }
      }

      console.log();
      console.log(chalk.blue(tr(lang, 'cli', 'init.log.creatingDocs')));
      console.log(
        chalk.gray(
          `  ${tr(lang, 'cli', 'init.log.projectLabel')}: ${projectName}`
        )
      );
      console.log(
        chalk.gray(`  ${tr(lang, 'cli', 'init.log.typeLabel')}: ${projectType}`)
      );
      console.log(
        chalk.gray(`  ${tr(lang, 'cli', 'init.log.langLabel')}: ${lang}`)
      );
      console.log(
        chalk.gray(`  ${tr(lang, 'cli', 'init.log.pathLabel')}: ${targetDir}`)
      );
      console.log();

      // 템플릿 복사 (common only)
      const templatesDir = getTemplatesDir();
      const commonPath = path.join(templatesDir, lang, 'common');
      if (!(await fs.pathExists(commonPath))) {
        throw new Error(
          tr(lang, 'cli', 'init.error.templateNotFound', { path: commonPath })
        );
      }
      const fsAdapter = new DefaultFileSystemAdapter();
      await copyTemplates(fsAdapter, commonPath, targetDir);

      if (projectType === 'multi') {
        const featuresRoot = path.join(targetDir, 'features');
        for (const component of components) {
          const componentDir = path.join(featuresRoot, component);
          await fs.ensureDir(componentDir);
          const readmePath = path.join(componentDir, 'README.md');
          if (!(await fs.pathExists(readmePath))) {
            await fs.writeFile(
              readmePath,
              getComponentFeaturesReadme(lang, component),
              'utf-8'
            );
          }
        }
      }

      // 플레이스홀더 치환
      const featurePath =
        projectType === 'multi' ? 'docs/features/{component}' : 'docs/features';
      const replacements: Record<string, string> = {
        '{{projectName}}': projectName,
        '{{projectType}}': projectType,
        '{{date}}': getLocalDateString(),
        '{{featurePath}}': featurePath,
      };

      await replaceInFiles(fsAdapter, targetDir, replacements);

      // CLI-managed docs/templates are not project-managed artifacts.
      await pruneEngineManagedDocs(targetDir);

      // Config 파일 생성
      const config: Record<string, unknown> = {
        projectName,
        projectType,
        ...(projectType === 'multi' ? { components } : {}),
        lang,
        createdAt: getLocalDateString(),
        docsRepo,
        workflow: {
          preset: workflowMode,
          mode: workflowMode,
          requireWorktree: false,
          codeDirtyScope: 'auto',
          taskCommitGate: 'warn',
          auto: {
            defaultPreset: 'pr-handoff',
          },
          prePrReview: {
            skills: ['code-review-excellence'],
            fallback: 'builtin-checklist',
            evidenceMode: 'path_required',
            decisionEnum: ['approve', 'changes_requested', 'blocked'],
            enforceExecutionEvidence: false,
            executionCommandPrefixes: [],
          },
        },
        pr: {
          screenshots: { upload: false },
        },
        // Default to spec-first execution: stop at spec approval, then run
        // through implementation until the final checklist review gate.
        approval: createDefaultApprovalConfig(),
      };

      // standalone일 때만 pushDocs, projectRoot 추가
      if (docsRepo === 'standalone') {
        if (!standaloneWorkspaceRoot) {
          throw createCliError(
            'PRECONDITION_FAILED',
            'Standalone workspace root could not be resolved. Re-run init from the shared workspace root above the docs directory.'
          );
        }
        config.workspaceRoot = serializeStandaloneWorkspaceRoot(
          targetDir,
          standaloneWorkspaceRoot
        );
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

      // Ensure agent entrypoint exists (idempotent managed block).
      // - embedded: write to repo root (git toplevel when available) so it can be committed.
      // - standalone: write to shared workspace root only, without touching project repos.
      const extraCommitPathsAbs: string[] = [];
      try {
        if (docsRepo === 'embedded') {
          const repoRoot = getGitTopLevelOrNull(cwd) || cwd;
          const agentsMdPath = path.join(repoRoot, 'AGENTS.md');
          const result = await upsertLeeSpecKitAgentsMd(agentsMdPath, {
            lang,
            docsRepo,
          });
          if (result.changed) extraCommitPathsAbs.push(agentsMdPath);
        } else {
          if (!standaloneWorkspaceRoot) {
            throw createCliError(
              'PRECONDITION_FAILED',
              'Standalone workspace root could not be resolved. Re-run init from the shared workspace root above the docs directory.'
            );
          }
          await upsertLeeSpecKitAgentsMd(path.join(standaloneWorkspaceRoot, 'AGENTS.md'), {
            lang,
            docsRepo,
          });
        }
      } catch {
        // Best-effort: do not fail init due to agent docs.
      }

      console.log(chalk.green(tr(lang, 'cli', 'init.log.docsCreated')));
      console.log();

      // Git 초기화
      await initGit(
        cwd,
        targetDir,
        docsRepo,
        lang,
        pushDocs,
        docsRemote,
        extraCommitPathsAbs
      );

      console.log(chalk.blue(tr(lang, 'cli', 'init.log.nextStepsTitle')));
      console.log(
        chalk.gray(
          tr(lang, 'cli', 'init.log.nextSteps1', { docsDir: targetDir })
        )
      );
      console.log(chalk.gray(tr(lang, 'cli', 'init.log.nextSteps2')));
      console.log(chalk.gray(tr(lang, 'cli', 'init.log.nextSteps3')));
      console.log(chalk.gray(tr(lang, 'cli', 'init.log.nextSteps4')));
      if (!(await hasLeeSpecKitCodexBootstrap())) {
        console.log(chalk.gray(tr(lang, 'cli', 'init.log.nextSteps5')));
      }
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
  docsRemote?: string,
  extraCommitPathsAbs: string[] = []
): Promise<void> {
  try {
    // embedded: manage git at repo root (if available)
    // standalone: manage git in docs directory itself
    const embeddedRoot = getGitTopLevelOrNull(cwd) || cwd;
    const gitWorkdir = docsRepo === 'standalone' ? targetDir : embeddedRoot;

    const getCachedStagedFiles = (workdir: string): string[] | null => {
      try {
        const out = runGitOrThrow(
          ['diff', '--cached', '--name-only'],
          workdir,
          {
            stdio: ['ignore', 'pipe', 'ignore'],
          }
        );
        if (!out) return [];
        return out
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
      } catch {
        return null;
      }
    };

    const isPathIgnored = (workdir: string, relativePath: string): boolean => {
      try {
        execFileSync('git', ['check-ignore', '-q', '--', relativePath], {
          cwd: workdir,
          stdio: 'ignore',
        });
        return true;
      } catch (error) {
        const status = (error as { status?: number } | undefined)?.status;
        if (status === 1) return false;
        return false;
      }
    };

    const toGitPath = (input: string): string =>
      input.replace(/\\/g, '/').replace(/^\.\//, '');

    const toRepoRelativePath = (
      workdir: string,
      relativePath: string
    ): string => {
      if (relativePath === '.') return '.';
      try {
        const prefix = runGitOrThrow(['rev-parse', '--show-prefix'], workdir, {
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const normalizedPrefix = toGitPath(prefix).replace(/\/+$/, '');
        const normalizedPath = toGitPath(relativePath);
        return normalizedPrefix
          ? `${normalizedPrefix}/${normalizedPath}`
          : normalizedPath;
      } catch {
        return toGitPath(relativePath);
      }
    };

    // Git이 이미 초기화되어 있는지 확인
    try {
      runGitOrThrow(['rev-parse', '--is-inside-work-tree'], gitWorkdir);
      // Git이 이미 있으면 docs만 커밋
      console.log(
        chalk.blue(tr(lang, 'cli', 'init.log.gitRepoDetectedCommit'))
      );
    } catch {
      // Git이 없으면 초기화
      console.log(chalk.blue(tr(lang, 'cli', 'init.log.gitInit')));
      runGitOrThrow(['init'], gitWorkdir);
    }

    // docs 폴더 스테이징
    const relativePath =
      docsRepo === 'standalone' ? '.' : path.relative(gitWorkdir, targetDir);
    const stagedBeforeAdd = getCachedStagedFiles(gitWorkdir);
    if (relativePath === '.' && stagedBeforeAdd && stagedBeforeAdd.length > 0) {
      console.log(chalk.yellow(tr(lang, 'cli', 'init.warn.stagedChangesSkip')));
      console.log(chalk.gray(tr(lang, 'cli', 'init.warn.commitManually')));
      console.log();
      return;
    }

    if (relativePath !== '.' && isPathIgnored(gitWorkdir, relativePath)) {
      const repoRelativePath = toRepoRelativePath(gitWorkdir, relativePath);
      console.log(
        chalk.yellow(
          tr(lang, 'cli', 'init.warn.docsPathIgnoredSkipCommit', {
            path: repoRelativePath,
          })
        )
      );
      console.log(
        chalk.gray(
          tr(lang, 'cli', 'init.warn.docsPathIgnoredHint', {
            path: repoRelativePath,
          })
        )
      );
      console.log();
      return;
    }

    const extraRelativePaths = extraCommitPathsAbs
      .map((absPath) => path.relative(gitWorkdir, absPath))
      .map((p) => p.replace(/\\/g, '/').trim())
      .filter((p) => !!p && p !== '.' && !p.startsWith('../'));

    const pathsToStage = [relativePath, ...extraRelativePaths];
    for (const p of pathsToStage) {
      runGitOrThrow(['add', p], gitWorkdir);
    }

    // Commit only the docs scaffold + explicitly allowed extra files
    // (pathspec prevents unrelated staged changes from being included).
    runGitOrThrow(
      [
        'commit',
        '-m',
        'init: docs 구조 초기화 (lee-spec-kit)',
        '--',
        ...pathsToStage,
      ],
      gitWorkdir
    );

    // standalone + remote 선택 시 origin 추가
    if (docsRepo === 'standalone' && pushDocs && docsRemote) {
      try {
        runGitOrThrow(['remote', 'add', 'origin', docsRemote], gitWorkdir);
        console.log(
          chalk.green(
            tr(lang, 'cli', 'init.log.gitRemoteSet', { remote: docsRemote })
          )
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
    console.log(chalk.yellow(tr(lang, 'cli', 'init.warn.skipGitInit')));
    console.log();
  }
}

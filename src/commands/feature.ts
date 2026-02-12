import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '../utils/config.js';
import {
  assertAllowedComponent,
  resolveProjectComponents,
} from '../utils/components.js';
import { replaceInFiles } from '../utils/template.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  getDocsLockPath,
  getInitLockPath,
  waitForLockRelease,
  withFileLock,
} from '../utils/lock.js';
import {
  validateSafeNameWithLang,
  validateFeatureIdWithLang,
  assertValid,
} from '../utils/validation.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { getLocalDateString } from '../utils/date.js';
import { applyLocalWorkflowTemplateToFeatureDir } from '../utils/local-workflow-template.js';
import { getTemplatesDir } from '../utils/paths.js';
import { toTemplateProjectType } from '../utils/project-type.js';

interface FeatureOptions {
  component?: string;
  id?: string;
  desc?: string;
  nonInteractive?: boolean;
  json?: boolean;
}

interface FeatureRunResult {
  featureId: string;
  featureName: string;
  component?: string;
  featurePath: string;
  featurePathFromDocs: string;
}

export function featureCommand(program: Command): void {
  program
    .command('feature <name>')
    .description('Create a new feature folder')
    .option('--component <component>', 'Component name (multi only)')
    .option('--id <id>', 'Feature ID (default: auto)')
    .option('-d, --desc <description>', 'Feature description for spec.md')
    .option('--non-interactive', 'Fail instead of prompting for input')
    .option('--json', 'Output in JSON format for agents')
    .action(async (name: string, options: FeatureOptions) => {
      try {
        const result = await runFeature(name, options);
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                reasonCode: 'FEATURE_CREATED',
                featureId: result.featureId,
                featureName: result.featureName,
                component: result.component,
                featurePath: result.featurePath,
                featurePathFromDocs: result.featurePathFromDocs,
              },
              null,
              2
            )
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'canceled') {
          const config = await getConfig(process.cwd());
          const lang = config?.lang ?? DEFAULT_LANG;
          if (options.json) {
            console.log(
              JSON.stringify({
                status: 'canceled',
                reasonCode: 'CANCELED',
              })
            );
            process.exit(0);
          }
          console.log(chalk.yellow(`\n${tr(lang, 'cli', 'common.canceled')}`));
          process.exit(0);
        }
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
          process.exit(1);
        }
        console.error(
          chalk.red(tr(lang, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        printCliErrorSuggestions(suggestions, lang);
        process.exit(1);
      }
    });
}

async function runFeature(
  name: string,
  options: FeatureOptions
): Promise<FeatureRunResult> {
  const cwd = process.cwd();
  let config = await getConfig(cwd);

  if (!config) {
    config = await waitForConfigAfterInit(cwd);
  }

  if (!config) {
    throw createCliError(
      'DOCS_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.docsNotFound')
    );
  }

  const { docsDir, projectType, lang } = config;
  const projectName = config.projectName;
  const configuredComponents = resolveProjectComponents(
    projectType,
    config.components
  );

  // 기능 이름 검증 (Path Traversal 방지)
  assertValid(
    validateSafeNameWithLang(name, lang),
    tr(lang, 'cli', 'validation.context.featureName'),
    lang
  );

  let component = (options.component || '').trim().toLowerCase();
  if (!component) component = '';

  if (projectType === 'single' && component) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--component` can only be used in multi mode.'
    );
  }

  // multi인 경우 component 선택 필요
  if (projectType === 'multi' && !component) {
    if (options.nonInteractive) {
      throw createCliError(
        'PROMPT_BLOCKED',
        '`--component` is required in multi mode when using `--non-interactive`.'
      );
    }
    const response = await prompts(
      {
        type: 'select',
        name: 'component',
        message: tr(lang, 'cli', 'feature.selectRepo'),
        choices: configuredComponents.map((value) => ({
          title: value.toUpperCase(),
          value,
        })),
      },
      {
        onCancel: () => {
          throw new Error('canceled');
        },
      }
    );
    component = response.component;
  }

  if (projectType === 'multi') {
    assertAllowedComponent(component, configuredComponents);
  }

  const docsLockPath = getDocsLockPath(docsDir);
  return withFileLock(
    docsLockPath,
    async () => {
      // Feature ID 생성
      let featureId: string;
      if (options.id) {
        assertValid(
          validateFeatureIdWithLang(options.id, lang),
          tr(lang, 'cli', 'validation.context.featureId'),
          lang
        );
        featureId = options.id;
      } else {
        featureId = await getNextFeatureId(docsDir, projectType, configuredComponents);
      }

      // 기능 폴더 경로
      let featuresDir: string;
      if (projectType === 'multi') {
        featuresDir = path.join(docsDir, 'features', component);
      } else {
        featuresDir = path.join(docsDir, 'features');
      }

      const featureFolderName = `${featureId}-${name}`;
      const featureDir = path.join(featuresDir, featureFolderName);

      // 중복 확인
      if (await fs.pathExists(featureDir)) {
        throw createCliError(
          'INVALID_ARGUMENT',
          tr(lang, 'cli', 'feature.folderExists', { path: featureDir })
        );
      }

      // Feature templates are sourced from CLI built-ins (single source of truth).
      const featureBasePath = path.join(
        getTemplatesDir(),
        lang,
        toTemplateProjectType(projectType),
        'features',
        'feature-base'
      );
      if (!(await fs.pathExists(featureBasePath))) {
        throw createCliError('DOCS_NOT_FOUND', tr(lang, 'cli', 'feature.baseNotFound'));
      }

      await fs.copy(featureBasePath, featureDir);

      // 플레이스홀더 치환
      const idNumber = featureId.replace('F', '');
      const repoName =
        projectType === 'multi'
          ? `{{projectName}}-${component}`
          : '{{projectName}}';

      const replacements: Record<string, string> = {
        '{{projectName}}': projectName ?? '{{projectName}}',
        // ko placeholders
        '{기능명}': name,
        '{번호}': idNumber,
        '{결정 제목}': `${name} 결정`,
        '{YYYY-MM-DD}': getLocalDateString(),
        '{be|fe}': component || '',
        '{이슈번호}': '',
        '{{description}}': options.desc || '',

        // en placeholders
        '{feature-name}': name,
        '{number}': idNumber,
        '{Decision Title}': `${name} design decision`,
        '{issue-number}': '',
        '{{projectName}}-{be|fe}': repoName,
      };

      // 한국어 템플릿의 경우 추가 치환
      if (lang === 'en') {
        replacements['기능 ID'] = 'Feature ID';
        replacements['기능명'] = 'Feature Name';
        replacements['대상 레포'] = 'Target Repo';
        replacements['이슈 번호'] = 'Issue Number';
        replacements['작성일'] = 'Created';
        replacements['상태'] = 'Status';
      }

      await replaceInFiles(featureDir, replacements);

      if (config.workflow?.mode === 'local') {
        await applyLocalWorkflowTemplateToFeatureDir(featureDir, lang);
      }

      if (!options.json) {
        console.log();
        console.log(chalk.green(tr(lang, 'cli', 'feature.created', { path: featureDir })));
        console.log();
        console.log(chalk.blue(tr(lang, 'cli', 'feature.nextStepsTitle')));
        console.log(chalk.gray(tr(lang, 'cli', 'feature.nextSteps1', { path: featureDir })));
        console.log(chalk.gray(tr(lang, 'cli', 'feature.nextSteps2')));
        console.log(chalk.gray(tr(lang, 'cli', 'feature.nextSteps3')));
        console.log();
      }

      return {
        featureId,
        featureName: name,
        component: projectType === 'multi' ? component : undefined,
        featurePath: featureDir,
        featurePathFromDocs: path.relative(docsDir, featureDir),
      };
    },
    { owner: 'feature' }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function waitForConfigAfterInit(
  cwd: string,
  timeoutMs = 8_000
): Promise<Awaited<ReturnType<typeof getConfig>> | null> {
  const explicitDocsDir = (process.env.LEE_SPEC_KIT_DOCS_DIR || '').trim();
  const candidates = [
    ...(explicitDocsDir ? [path.resolve(explicitDocsDir)] : []),
    path.resolve(cwd, 'docs'),
    path.resolve(cwd),
  ];

  const endAt = Date.now() + timeoutMs;

  while (Date.now() < endAt) {
    const config = await getConfig(cwd);
    if (config) return config;

    let sawLock = false;
    for (const dir of candidates) {
      const initLockPath = getInitLockPath(dir);
      const docsLockPath = getDocsLockPath(dir);
      for (const lockPath of [initLockPath, docsLockPath]) {
        if (await fs.pathExists(lockPath)) {
          sawLock = true;
          await waitForLockRelease(lockPath, {
            timeoutMs: Math.max(200, endAt - Date.now()),
            pollMs: 120,
          });
        }
      }
    }

    if (!sawLock) {
      await sleep(150);
    }
  }

  return getConfig(cwd);
}

async function getNextFeatureId(
  docsDir: string,
  projectType: string,
  components: string[]
): Promise<string> {
  const featuresDir = path.join(docsDir, 'features');
  let max = 0;

  const scanDirs: string[] = [];

  if (projectType === 'multi') {
    scanDirs.push(...components.map((component) => path.join(featuresDir, component)));
  } else {
    scanDirs.push(featuresDir);
  }

  for (const dir of scanDirs) {
    if (!(await fs.pathExists(dir))) continue;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^F(\d+)-/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  }

  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `F${String(next).padStart(width, '0')}`;
}

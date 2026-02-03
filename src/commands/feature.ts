import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '../utils/config.js';
import { replaceInFiles } from '../utils/template.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  validateSafeName,
  validateRepoType,
  validateFeatureId,
  assertValid,
} from '../utils/validation.js';

interface FeatureOptions {
  repo?: 'be' | 'fe';
  id?: string;
  desc?: string;
}

export function featureCommand(program: Command): void {
  program
    .command('feature <name>')
    .description('Create a new feature folder')
    .option('-r, --repo <repo>', 'Repository type: be | fe (fullstack only)')
    .option('--id <id>', 'Feature ID (default: auto)')
    .option('-d, --desc <description>', 'Feature description for spec.md')
    .action(async (name: string, options: FeatureOptions) => {
      try {
        await runFeature(name, options);
      } catch (error) {
        if (error instanceof Error && error.message === 'canceled') {
          const config = await getConfig(process.cwd());
          const lang = config?.lang ?? DEFAULT_LANG;
          console.log(chalk.yellow(`\n${tr(lang, 'cli', 'common.canceled')}`));
          process.exit(0);
        }
        console.error(chalk.red(tr(DEFAULT_LANG, 'cli', 'common.errorLabel')), error);
        process.exit(1);
      }
    });
}

async function runFeature(
  name: string,
  options: FeatureOptions
): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    console.error(
      chalk.red(
        tr(DEFAULT_LANG, 'cli', 'common.docsNotFound')
      )
    );
    process.exit(1);
  }

  const { docsDir, projectType, lang } = config;
  const projectName = config.projectName;

  // 기능 이름 검증 (Path Traversal 방지)
  assertValid(validateSafeName(name), '기능 이름');

  let repo = options.repo;

  // fullstack인 경우 repo 선택 필요
  if (projectType === 'fullstack' && !repo) {
    const response = await prompts(
      {
        type: 'select',
        name: 'repo',
        message: tr(lang, 'cli', 'feature.selectRepo'),
        choices: [
          { title: 'Backend (be)', value: 'be' },
          { title: 'Frontend (fe)', value: 'fe' },
        ],
      },
      {
        onCancel: () => {
          throw new Error('canceled');
        },
      }
    );
    repo = response.repo;
  }

  // 레포지토리 타입 검증
  if (repo) {
    assertValid(validateRepoType(repo), '레포지토리 타입');
  }

  // Feature ID 생성
  let featureId: string;
  if (options.id) {
    assertValid(validateFeatureId(options.id), 'Feature ID');
    featureId = options.id;
  } else {
    featureId = await getNextFeatureId(docsDir, projectType);
  }

  // 기능 폴더 경로
  let featuresDir: string;
  if (projectType === 'fullstack' && repo) {
    featuresDir = path.join(docsDir, 'features', repo);
  } else {
    featuresDir = path.join(docsDir, 'features');
  }

  const featureFolderName = `${featureId}-${name}`;
  const featureDir = path.join(featuresDir, featureFolderName);

  // 중복 확인
  if (await fs.pathExists(featureDir)) {
    console.error(
      chalk.red(
        tr(lang, 'cli', 'feature.folderExists', { path: featureDir })
      )
    );
    process.exit(1);
  }

  // feature-base 복사
  const featureBasePath = path.join(docsDir, 'features', 'feature-base');
  if (!(await fs.pathExists(featureBasePath))) {
    console.error(
      chalk.red(
        tr(lang, 'cli', 'feature.baseNotFound')
      )
    );
    process.exit(1);
  }

  await fs.copy(featureBasePath, featureDir);

  // 플레이스홀더 치환
  const idNumber = featureId.replace('F', '');
  const repoName =
    projectType === 'fullstack' && repo
      ? `{{projectName}}-${repo}`
      : '{{projectName}}';

  const replacements: Record<string, string> = {
    '{{projectName}}': projectName ?? '{{projectName}}',
    // ko placeholders
    '{기능명}': name,
    '{번호}': idNumber,
    'YYYY-MM-DD': new Date().toISOString().split('T')[0],
    '{be|fe}': repo || '',
    '{이슈번호}': '',
    '{{description}}': options.desc || '',

    // en placeholders
    '{feature-name}': name,
    '{number}': idNumber,
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

  console.log();
  console.log(
    chalk.green(
      tr(lang, 'cli', 'feature.created', { path: featureDir })
    )
  );
  console.log();
  console.log(chalk.blue(tr(lang, 'cli', 'feature.nextStepsTitle')));
  console.log(
    chalk.gray(
      tr(lang, 'cli', 'feature.nextSteps1', { path: featureDir })
    )
  );
  console.log(chalk.gray(tr(lang, 'cli', 'feature.nextSteps2')));
  console.log(
    chalk.gray(
      tr(lang, 'cli', 'feature.nextSteps3')
    )
  );
  console.log();
}

async function getNextFeatureId(
  docsDir: string,
  projectType: string
): Promise<string> {
  const featuresDir = path.join(docsDir, 'features');
  let max = 0;

  const scanDirs: string[] = [];

  if (projectType === 'fullstack') {
    scanDirs.push(path.join(featuresDir, 'be'));
    scanDirs.push(path.join(featuresDir, 'fe'));
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

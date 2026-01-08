import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { copyTemplates, replaceInFiles } from '../utils/template.js';
import { getTemplatesDir } from '../utils/paths.js';
import {
  validateSafeName,
  validateProjectType,
  validateLanguage,
  assertValid,
} from '../utils/validation.js';

interface InitOptions {
  name?: string;
  type?: 'single' | 'fullstack';
  lang?: 'ko' | 'en';
  dir?: string;
  yes?: boolean;
}

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize project documentation structure')
    .option('-n, --name <name>', 'Project name (default: current folder name)')
    .option('-t, --type <type>', 'Project type: single | fullstack')
    .option('-l, --lang <lang>', 'Language: ko | en (default: ko)')
    .option('-d, --dir <dir>', 'Target directory (default: ./docs)', './docs')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .action(async (options: InitOptions) => {
      try {
        await runInit(options);
      } catch (error) {
        if (error instanceof Error && error.message === 'canceled') {
          console.log(chalk.yellow('\n작업이 취소되었습니다.'));
          process.exit(0);
        }
        console.error(chalk.red('오류:'), error);
        process.exit(1);
      }
    });
}

async function runInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const defaultName = path.basename(cwd);

  let projectName = options.name || defaultName;
  let projectType = options.type;
  let lang = options.lang || 'ko';
  const targetDir = path.resolve(cwd, options.dir || './docs');

  // 대화형 프롬프트 (--yes가 없을 때)
  if (!options.yes) {
    const response = await prompts(
      [
        {
          type: options.name ? null : 'text',
          name: 'projectName',
          message: '프로젝트 이름을 입력하세요:',
          initial: defaultName,
        },
        {
          type: options.type ? null : 'select',
          name: 'projectType',
          message: '프로젝트 타입을 선택하세요:',
          choices: [
            {
              title: 'Single - 단일 레포 프로젝트',
              value: 'single',
              description: 'features/ 폴더 하나로 관리',
            },
            {
              title: 'Fullstack - FE/BE 분리 프로젝트',
              value: 'fullstack',
              description: 'features/be/, features/fe/ 분리 관리',
            },
          ],
          initial: 0,
        },
        {
          type: options.lang ? null : 'select',
          name: 'lang',
          message: '문서 언어를 선택하세요:',
          choices: [
            { title: '한국어 (ko)', value: 'ko' },
            { title: 'English (en)', value: 'en' },
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
    lang = response.lang || lang;
  }

  // 타입 기본값
  if (!projectType) {
    projectType = 'single';
  }

  // 입력 검증
  assertValid(validateSafeName(projectName), '프로젝트 이름');
  assertValid(validateProjectType(projectType), '프로젝트 타입');
  assertValid(validateLanguage(lang), '언어');

  // 디렉토리 존재 확인
  if (await fs.pathExists(targetDir)) {
    const files = await fs.readdir(targetDir);
    if (files.length > 0) {
      const { overwrite } = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `${targetDir} 폴더가 이미 존재합니다. 덮어쓰시겠습니까?`,
        initial: false,
      });

      if (!overwrite) {
        console.log(chalk.yellow('작업이 취소되었습니다.'));
        return;
      }
    }
  }

  console.log();
  console.log(chalk.blue('📁 docs 구조 생성 중...'));
  console.log(chalk.gray(`  프로젝트: ${projectName}`));
  console.log(chalk.gray(`  타입: ${projectType}`));
  console.log(chalk.gray(`  언어: ${lang}`));
  console.log(chalk.gray(`  경로: ${targetDir}`));
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
    throw new Error(`템플릿을 찾을 수 없습니다: ${typePath}`);
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
  const config = {
    projectName,
    projectType,
    lang,
    createdAt: new Date().toISOString().split('T')[0],
  };
  const configPath = path.join(targetDir, '.lee-spec-kit.json');
  await fs.writeJson(configPath, config, { spaces: 2 });

  console.log(chalk.green('✅ docs 구조 생성 완료!'));
  console.log();

  // Git 초기화
  await initGit(cwd, targetDir);

  console.log(chalk.blue('다음 단계:'));
  console.log(chalk.gray(`  1. ${targetDir}/prd/README.md 작성`));
  console.log(
    chalk.gray('  2. npx lee-spec-kit feature <name> 으로 기능 추가')
  );
  console.log();
}

async function initGit(cwd: string, targetDir: string): Promise<void> {
  const { execSync } = await import('child_process');

  try {
    // Git이 이미 초기화되어 있는지 확인
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd,
        stdio: 'ignore',
      });
      // Git이 이미 있으면 docs만 커밋
      console.log(chalk.blue('📦 Git 레포지토리 감지, docs 커밋 중...'));
    } catch {
      // Git이 없으면 초기화
      console.log(chalk.blue('📦 Git 초기화 중...'));
      execSync('git init', { cwd, stdio: 'ignore' });
    }

    // docs 폴더 스테이징
    const relativePath = path.relative(cwd, targetDir);
    execSync(`git add "${relativePath}"`, { cwd, stdio: 'ignore' });

    // 커밋
    execSync('git commit -m "init: docs 구조 초기화 (lee-spec-kit)"', {
      cwd,
      stdio: 'ignore',
    });

    console.log(chalk.green('✅ Git 초기 커밋 완료!'));
    console.log();
  } catch (error) {
    // Git 관련 오류는 무시하고 경고만 출력
    console.log(
      chalk.yellow('⚠️  Git 초기화를 건너뜁니다 (수동으로 커밋해주세요)')
    );
    console.log();
  }
}

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '../utils/config.js';
import { getTemplatesDir } from '../utils/paths.js';

interface UpdateOptions {
  agents?: boolean;
  templates?: boolean;
  force?: boolean;
}

export function updateCommand(program: Command): void {
  program
    .command('update')
    .description('Update docs templates to the latest version')
    .option('--agents', 'Update agents/ folder only')
    .option('--templates', 'Update feature-base/ folder only')
    .option('-f, --force', 'Force overwrite without confirmation')
    .action(async (options: UpdateOptions) => {
      try {
        await runUpdate(options);
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

async function runUpdate(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    console.error(
      chalk.red('docs 폴더를 찾을 수 없습니다. 먼저 init을 실행하세요.')
    );
    process.exit(1);
  }

  const { docsDir, projectType, lang } = config;
  const templatesDir = getTemplatesDir();
  const sourceDir = path.join(templatesDir, lang, projectType);

  // 업데이트 대상 결정
  const updateAgents =
    options.agents || (!options.agents && !options.templates);
  const updateTemplates =
    options.templates || (!options.agents && !options.templates);

  console.log(chalk.blue('📦 템플릿 업데이트를 시작합니다...'));
  console.log(chalk.gray(`  - 언어: ${lang}`));
  console.log(chalk.gray(`  - 타입: ${projectType}`));
  console.log();

  let updatedCount = 0;

  // agents/ 폴더 업데이트 (common 먼저, 타입별 오버라이드)
  if (updateAgents) {
    console.log(chalk.blue('📁 agents/ 폴더 업데이트 중...'));
    const commonAgents = path.join(templatesDir, lang, 'common', 'agents');
    const typeAgents = path.join(templatesDir, lang, projectType, 'agents');
    const targetAgents = path.join(docsDir, 'agents');

    // featurePath 치환
    const featurePath =
      projectType === 'fullstack' ? 'docs/features/{be|fe}' : 'docs/features';
    const replacements: Record<string, string> = {
      '{{featurePath}}': featurePath,
    };

    // common 먼저 업데이트
    if (await fs.pathExists(commonAgents)) {
      const count = await updateFolder(
        commonAgents,
        targetAgents,
        options.force,
        replacements
      );
      updatedCount += count;
    }

    // 타입별 오버라이드
    if (await fs.pathExists(typeAgents)) {
      const count = await updateFolder(typeAgents, targetAgents, options.force);
      updatedCount += count;
    }
    console.log(chalk.green(`  ✅ agents/ 업데이트 완료`));
  }

  // feature-base/ 폴더 업데이트
  if (updateTemplates) {
    console.log(chalk.blue('📁 features/feature-base/ 폴더 업데이트 중...'));
    const sourceFeatureBase = path.join(sourceDir, 'features', 'feature-base');
    const targetFeatureBase = path.join(docsDir, 'features', 'feature-base');

    if (await fs.pathExists(sourceFeatureBase)) {
      const count = await updateFolder(
        sourceFeatureBase,
        targetFeatureBase,
        options.force
      );
      updatedCount += count;
      console.log(chalk.green(`  ✅ ${count}개 파일 업데이트 완료`));
    }
  }

  console.log();
  console.log(chalk.green(`✅ 총 ${updatedCount}개 파일 업데이트 완료!`));
}

async function updateFolder(
  sourceDir: string,
  targetDir: string,
  force?: boolean,
  replacements?: Record<string, string>
): Promise<number> {
  const protectedFiles = new Set(['custom.md', 'constitution.md']);

  // 대상 폴더가 없으면 생성
  await fs.ensureDir(targetDir);

  const files = await fs.readdir(sourceDir);
  let updatedCount = 0;

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    const stat = await fs.stat(sourcePath);

    if (stat.isFile()) {
      // 사용자 정의/정책 파일은 업데이트에서 제외
      if (protectedFiles.has(file)) {
        continue;
      }

      let sourceContent = await fs.readFile(sourcePath, 'utf-8');

      // 플레이스홀더 치환
      if (replacements) {
        for (const [key, value] of Object.entries(replacements)) {
          sourceContent = sourceContent.replaceAll(key, value);
        }
      }

      let shouldUpdate = true;

      // 대상 파일이 존재하는 경우
      if (await fs.pathExists(targetPath)) {
        const targetContent = await fs.readFile(targetPath, 'utf-8');

        // 내용이 같으면 스킵
        if (sourceContent === targetContent) {
          continue;
        }

        // force가 아니면 경고 표시
        if (!force) {
          console.log(
            chalk.yellow(`  ⚠️ ${file} - 변경 감지 (--force로 덮어쓰기)`)
          );
          shouldUpdate = false;
        }
      }

      if (shouldUpdate) {
        await fs.writeFile(targetPath, sourceContent);
        console.log(chalk.gray(`  📄 ${file} 업데이트`));
        updatedCount++;
      }
    } else if (stat.isDirectory()) {
      // 하위 디렉토리 재귀 처리
      const subCount = await updateFolder(
        sourcePath,
        targetPath,
        force,
        replacements
      );
      updatedCount += subCount;
    }
  }

  return updatedCount;
}

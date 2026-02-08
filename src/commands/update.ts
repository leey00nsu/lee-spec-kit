import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { execFileSync } from 'child_process';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { getTemplatesDir } from '../utils/paths.js';
import { applyReplacements } from '../utils/template.js';
import { getDocsLockPath, withFileLock } from '../utils/lock.js';
import { createCliError, toCliError } from '../utils/cli-error.js';

interface UpdateOptions {
  agents?: boolean;
  skills?: boolean;
  templates?: boolean;
  force?: boolean;
}

export function updateCommand(program: Command): void {
  program
    .command('update')
    .description('Update docs templates to the latest version')
    .option('--agents', 'Update agents/ folder only')
    .option('--skills', 'Update agents/skills folder only')
    .option('--templates', 'Update feature-base/ folder only')
    .option(
      '-f, --force',
      'Force overwrite even if docs has uncommitted changes'
    )
    .action(async (options: UpdateOptions) => {
      try {
        await runUpdate(options);
      } catch (error) {
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
        if (error instanceof Error && error.message === 'canceled') {
          console.log(chalk.yellow(`\n${tr(lang, 'cli', 'common.canceled')}`));
          process.exit(0);
        }
        const cliError = toCliError(error);
        console.error(
          chalk.red(tr(lang, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        process.exit(1);
      }
    });
}

async function runUpdate(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    throw createCliError(
      'DOCS_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.docsNotFound')
    );
  }

  const { docsDir, projectType, lang } = config;
  await withFileLock(
    getDocsLockPath(docsDir),
    async () => {
      const templatesDir = getTemplatesDir();
      const sourceDir = path.join(templatesDir, lang, projectType);

      // Default behavior: only allow update when docs working tree is clean.
      // Then apply updates like --force. This keeps update predictable and simple.
      const forceOverwrite =
        !!options.force || (await isDocsWorktreeCleanOrThrow(docsDir, lang));

      // 업데이트 대상 결정
      const hasExplicitSelection = !!(
        options.agents ||
        options.skills ||
        options.templates
      );
      const updateAgents = options.agents || options.skills || !hasExplicitSelection;
      const updateTemplates = options.templates || !hasExplicitSelection;
      const agentsMode: 'all' | 'skills' =
        options.skills && !options.agents ? 'skills' : 'all';

      console.log(chalk.blue(tr(lang, 'cli', 'update.start')));
      console.log(chalk.gray(`  - ${tr(lang, 'cli', 'update.langLabel')}: ${lang}`));
      console.log(
        chalk.gray(`  - ${tr(lang, 'cli', 'update.typeLabel')}: ${projectType}`)
      );
      console.log();

      let updatedCount = 0;

      // agents/ 폴더 업데이트 (common 먼저, 타입별 오버라이드)
      if (updateAgents) {
        console.log(
          chalk.blue(
            agentsMode === 'skills'
              ? tr(lang, 'cli', 'update.updatingSkills')
              : tr(lang, 'cli', 'update.updatingAgents')
          )
        );
        const commonAgentsBase = path.join(templatesDir, lang, 'common', 'agents');
        const typeAgentsBase = path.join(templatesDir, lang, projectType, 'agents');
        const targetAgentsBase = path.join(docsDir, 'agents');

        const commonAgents =
          agentsMode === 'skills'
            ? path.join(commonAgentsBase, 'skills')
            : commonAgentsBase;
        const typeAgents =
          agentsMode === 'skills'
            ? path.join(typeAgentsBase, 'skills')
            : typeAgentsBase;
        const targetAgents =
          agentsMode === 'skills'
            ? path.join(targetAgentsBase, 'skills')
            : targetAgentsBase;

        // featurePath 치환
        const featurePath =
          projectType === 'fullstack' ? 'docs/features/{be|fe}' : 'docs/features';
        const projectName = config.projectName ?? '{{projectName}}';
        const commonReplacements: Record<string, string> = {
          '{{projectName}}': projectName,
          '{{featurePath}}': featurePath,
        };
        const typeReplacements: Record<string, string> = {
          '{{projectName}}': projectName,
        };

        // common 먼저 업데이트
        if (await fs.pathExists(commonAgents)) {
          const count = await updateFolder(
            commonAgents,
            targetAgents,
            forceOverwrite,
            commonReplacements,
            lang
          );
          updatedCount += count;
        }

        // 타입별 오버라이드
        if (await fs.pathExists(typeAgents)) {
          const count = await updateFolder(
            typeAgents,
            targetAgents,
            forceOverwrite,
            typeReplacements,
            lang
          );
          updatedCount += count;
        }
        console.log(
          chalk.green(
            `  ✅ ${
              agentsMode === 'skills'
                ? tr(lang, 'cli', 'update.skillsUpdated')
                : tr(lang, 'cli', 'update.agentsUpdated')
            }`
          )
        );
      }

      // feature-base/ 폴더 업데이트
      if (updateTemplates) {
        console.log(chalk.blue(tr(lang, 'cli', 'update.updatingFeatureBase')));
        const sourceFeatureBase = path.join(sourceDir, 'features', 'feature-base');
        const targetFeatureBase = path.join(docsDir, 'features', 'feature-base');

        if (await fs.pathExists(sourceFeatureBase)) {
          const replacements: Record<string, string> = {
            '{{projectName}}': config.projectName ?? '{{projectName}}',
          };
          const count = await updateFolder(
            sourceFeatureBase,
            targetFeatureBase,
            forceOverwrite,
            replacements,
            lang
          );
          updatedCount += count;
          console.log(
            chalk.green(`  ✅ ${tr(lang, 'cli', 'update.filesUpdated', { count })}`)
          );
        }
      }

      console.log();
      console.log(
        chalk.green(`✅ ${tr(lang, 'cli', 'update.updatedTotal', { count: updatedCount })}`)
      );
    },
    { owner: 'update' }
  );
}

async function updateFolder(
  sourceDir: string,
  targetDir: string,
  force?: boolean,
  replacements?: Record<string, string>,
  lang: 'ko' | 'en' = DEFAULT_LANG
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
        sourceContent = applyReplacements(sourceContent, replacements);
      }

      let shouldUpdate = true;

      // 대상 파일이 존재하는 경우
      if (await fs.pathExists(targetPath)) {
        const targetContent = await fs.readFile(targetPath, 'utf-8');

        // 내용이 같으면 스킵
        if (sourceContent === targetContent) {
          continue;
        }

        // force가 아니면 경고 표시 (CI/파이프 환경에서는 stdout 오염/대화 불가)
        if (!force) {
          console.log(
            chalk.yellow(
              `  ⚠️ ${file} - ${tr(lang, 'cli', 'update.changeDetected')}`
            )
          );
          shouldUpdate = false;
        }
      }

      if (shouldUpdate) {
        await fs.writeFile(targetPath, sourceContent);
        console.log(
          chalk.gray(`  📄 ${tr(lang, 'cli', 'update.fileUpdated', { file })}`)
        );
        updatedCount++;
      }
    } else if (stat.isDirectory()) {
      // 하위 디렉토리 재귀 처리
      const subCount = await updateFolder(
        sourcePath,
        targetPath,
        force,
        replacements,
        lang
      );
      updatedCount += subCount;
    }
  }

  return updatedCount;
}

function getGitTopLevel(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function getDocsPorcelainStatus(docsDir: string): string | null {
  const top = getGitTopLevel(docsDir);
  if (!top) return null;
  const rel = path.relative(top, docsDir) || '.';
  try {
    return execFileSync('git', ['status', '--porcelain=v1', '--', rel], {
      cwd: top,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

async function isDocsWorktreeCleanOrThrow(
  docsDir: string,
  lang: 'ko' | 'en'
): Promise<boolean> {
  const status = getDocsPorcelainStatus(docsDir);
  if (status === null) {
    throw new Error(tr(lang, 'cli', 'update.gitStatusUnavailable'));
  }
  if (status.trim().length > 0) {
    throw new Error(tr(lang, 'cli', 'update.docsWorktreeDirty'));
  }
  return true;
}

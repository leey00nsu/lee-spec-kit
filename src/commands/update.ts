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
import {
  ENGINE_MANAGED_AGENT_DIRS,
  ENGINE_MANAGED_AGENT_FILES,
  pruneEngineManagedDocs,
} from '../utils/engine-managed-docs.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

interface UpdateOptions {
  agents?: boolean;
  skills?: boolean;
  templates?: boolean;
  force?: boolean;
}

interface ConfigBackfillResult {
  changed: boolean;
  changedPaths: string[];
}

export function updateCommand(program: Command): void {
  program
    .command('update')
    .description('Update docs templates to the latest version')
    .option('--agents', 'Update agents/ folder only')
    .option('--skills', 'Cleanup legacy agents/skills copies (CLI-managed)')
    .option('--templates', 'Cleanup legacy feature-base copies (CLI-managed)')
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
          return;
        }
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
      const docsLockPath = getDocsLockPath(docsDir);

      // Default behavior: only allow update when docs working tree is clean.
      // Then apply updates like --force. This keeps update predictable and simple.
      const forceOverwrite =
        !!options.force ||
        (await isDocsWorktreeCleanOrThrow(docsDir, lang, [docsLockPath]));

      // Backfill missing config defaults so older projects get current policy keys.
      const configBackfill = await backfillMissingConfigDefaults(docsDir);

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
        if (agentsMode === 'skills') {
          console.log(chalk.blue(tr(lang, 'cli', 'update.updatingSkills')));
          console.log(
            chalk.gray(tr(lang, 'cli', 'update.engineManagedSkillsBuiltin'))
          );
          console.log(chalk.green(`  ✅ ${tr(lang, 'cli', 'update.skillsUpdated')}`));
        } else {
          console.log(chalk.blue(tr(lang, 'cli', 'update.updatingAgents')));
        }

        if (agentsMode === 'all') {
          const commonAgentsBase = path.join(templatesDir, lang, 'common', 'agents');
          const targetAgentsBase = path.join(docsDir, 'agents');

          const commonAgents = commonAgentsBase;
          const targetAgents = targetAgentsBase;

          // featurePath 치환
          const featurePath =
            projectType === 'multi'
              ? 'docs/features/{component}'
              : 'docs/features';
          const projectName = config.projectName ?? '{{projectName}}';
          const commonReplacements: Record<string, string> = {
            '{{projectName}}': projectName,
            '{{featurePath}}': featurePath,
          };

          if (await fs.pathExists(commonAgents)) {
            const count = await updateFolder(
              commonAgents,
              targetAgents,
              forceOverwrite,
              commonReplacements,
              lang,
              {
                protectedFiles: new Set([
                  'custom.md',
                  'constitution.md',
                  ...ENGINE_MANAGED_AGENT_FILES,
                ]),
                skipDirectories: new Set(ENGINE_MANAGED_AGENT_DIRS),
              }
            );
            updatedCount += count;
          }
          console.log(
            chalk.green(
              `  ✅ ${tr(lang, 'cli', 'update.agentsUpdated')}`
            )
          );
        }
      }

      // feature-base is CLI-managed and no longer synced into docs.
      if (updateTemplates) {
        console.log(chalk.blue(tr(lang, 'cli', 'update.updatingFeatureBase')));
        console.log(chalk.gray(tr(lang, 'cli', 'update.engineManagedFeatureBaseBuiltin')));
      }

      const pruned = await pruneEngineManagedDocs(docsDir);
      if (pruned.length > 0) {
        console.log(
          chalk.gray(
            `  - ${tr(lang, 'cli', 'update.engineManagedPruned', {
              count: pruned.length,
            })}`
          )
        );
      }

      console.log();
      if (configBackfill.changed) {
        console.log(
          chalk.gray(
            `  - ${tr(lang, 'cli', 'update.fileUpdated', { file: '.lee-spec-kit.json' })}`
          )
        );
        console.log(
          chalk.gray(
            `    (${configBackfill.changedPaths.join(', ')})`
          )
        );
      }
      console.log(
        chalk.green(`✅ ${tr(lang, 'cli', 'update.updatedTotal', { count: updatedCount })}`)
      );
    },
    { owner: 'update' }
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSkillList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const deduped = new Set<string>();
  for (const item of raw) {
    const value = String(item || '').trim();
    if (!value) continue;
    deduped.add(value);
  }
  return [...deduped];
}

async function backfillMissingConfigDefaults(
  docsDir: string
): Promise<ConfigBackfillResult> {
  const configPath = path.join(docsDir, '.lee-spec-kit.json');
  if (!(await fs.pathExists(configPath))) {
    return { changed: false, changedPaths: [] };
  }

  const raw = await fs.readJson(configPath);
  if (!isPlainObject(raw)) {
    return { changed: false, changedPaths: [] };
  }

  const changedPaths: string[] = [];

  const setIfMissing = <T>(
    parent: Record<string, unknown>,
    key: string,
    nextValue: T,
    pathLabel: string
  ): void => {
    if (parent[key] !== undefined) return;
    parent[key] = nextValue;
    changedPaths.push(pathLabel);
  };

  if (!isPlainObject(raw.workflow)) {
    raw.workflow = {};
    changedPaths.push('workflow');
  }
  const workflow = raw.workflow as Record<string, unknown>;
  setIfMissing(workflow, 'mode', 'github', 'workflow.mode');
  setIfMissing(workflow, 'codeDirtyScope', 'auto', 'workflow.codeDirtyScope');
  setIfMissing(workflow, 'taskCommitGate', 'warn', 'workflow.taskCommitGate');
  if (!isPlainObject(workflow.auto)) {
    workflow.auto = {};
    changedPaths.push('workflow.auto');
  }
  const workflowAuto = workflow.auto as Record<string, unknown>;
  setIfMissing(workflowAuto, 'defaultPreset', 'pr-handoff', 'workflow.auto.defaultPreset');

  if (!isPlainObject(workflow.prePrReview)) {
    workflow.prePrReview = {};
    changedPaths.push('workflow.prePrReview');
  }
  const prePrReview = workflow.prePrReview as Record<string, unknown>;
  if (prePrReview.skills === undefined) {
    prePrReview.skills = ['code-review-excellence'];
    changedPaths.push('workflow.prePrReview.skills');
  } else {
    const normalizedSkills = normalizeSkillList(prePrReview.skills);
    if (normalizedSkills.length === 0) {
      prePrReview.skills = ['code-review-excellence'];
      changedPaths.push('workflow.prePrReview.skills');
    } else if (
      JSON.stringify(normalizedSkills) !== JSON.stringify(prePrReview.skills)
    ) {
      prePrReview.skills = normalizedSkills;
      changedPaths.push('workflow.prePrReview.skills');
    }
  }
  setIfMissing(prePrReview, 'fallback', 'builtin-checklist', 'workflow.prePrReview.fallback');
  setIfMissing(prePrReview, 'blockOnFindings', true, 'workflow.prePrReview.blockOnFindings');
  setIfMissing(prePrReview, 'minorPolicy', 'warn', 'workflow.prePrReview.minorPolicy');

  if (!isPlainObject(raw.pr)) {
    raw.pr = {};
    changedPaths.push('pr');
  }
  const pr = raw.pr as Record<string, unknown>;
  if (!isPlainObject(pr.screenshots)) {
    pr.screenshots = {};
    changedPaths.push('pr.screenshots');
  }
  const screenshots = pr.screenshots as Record<string, unknown>;
  setIfMissing(screenshots, 'upload', false, 'pr.screenshots.upload');

  if (!isPlainObject(raw.approval)) {
    raw.approval = {};
    changedPaths.push('approval');
  }
  const approval = raw.approval as Record<string, unknown>;
  setIfMissing(approval, 'mode', 'builtin', 'approval.mode');

  if (changedPaths.length === 0) {
    return { changed: false, changedPaths: [] };
  }

  await fs.writeJson(configPath, raw, { spaces: 2 });
  return { changed: true, changedPaths };
}

async function updateFolder(
  sourceDir: string,
  targetDir: string,
  force?: boolean,
  replacements?: Record<string, string>,
  lang: 'ko' | 'en' = DEFAULT_LANG,
  options: {
    protectedFiles?: Set<string>;
    skipDirectories?: Set<string>;
  } = {}
): Promise<number> {
  const protectedFiles = options.protectedFiles ?? new Set(['custom.md', 'constitution.md']);
  const skipDirectories = options.skipDirectories ?? new Set<string>();

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
      if (skipDirectories.has(file)) {
        continue;
      }
      // 하위 디렉토리 재귀 처리
      const subCount = await updateFolder(
        sourcePath,
        targetPath,
        force,
        replacements,
        lang,
        options
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

function normalizeGitPath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function stripOuterQuotes(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

function extractPorcelainPaths(line: string): string[] {
  if (line.length < 4) return [];
  const body = line.slice(3).trim();
  if (!body) return [];
  if (body.includes(' -> ')) {
    return body
      .split(' -> ')
      .map((part) => normalizeGitPath(stripOuterQuotes(part)));
  }
  return [normalizeGitPath(stripOuterQuotes(body))];
}

function getDocsPorcelainStatus(
  docsDir: string,
  ignoredAbsPaths: string[] = []
): string | null {
  const top = getGitTopLevel(docsDir);
  if (!top) return null;
  const rel = path.relative(top, docsDir) || '.';
  try {
    const output = execFileSync('git', ['status', '--porcelain=v1', '--', rel], {
      cwd: top,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (ignoredAbsPaths.length === 0) {
      return output;
    }

    const ignoredRelPaths = new Set(
      ignoredAbsPaths.map((absPath) =>
        normalizeGitPath(path.relative(top, absPath) || '.')
      )
    );
    const filtered = output
      .split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        const touchedPaths = extractPorcelainPaths(line);
        if (touchedPaths.length === 0) return true;
        return touchedPaths.some((p) => !ignoredRelPaths.has(p));
      })
      .join('\n');
    return filtered;
  } catch {
    return null;
  }
}

async function isDocsWorktreeCleanOrThrow(
  docsDir: string,
  lang: 'ko' | 'en',
  ignoredAbsPaths: string[] = []
): Promise<boolean> {
  const status = getDocsPorcelainStatus(docsDir, ignoredAbsPaths);
  if (status === null) {
    throw createCliError(
      'PRECONDITION_FAILED',
      tr(lang, 'cli', 'update.gitStatusUnavailable')
    );
  }
  if (status.trim().length > 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      tr(lang, 'cli', 'update.docsWorktreeDirty')
    );
  }
  return true;
}

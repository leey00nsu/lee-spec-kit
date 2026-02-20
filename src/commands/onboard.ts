import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { getConfig } from '../utils/config.js';
import { resolveProjectComponents } from '../utils/components.js';
import { resolveProjectGitCwd } from '../utils/context/git.js';
import { createCliContext, CliContext } from '../utils/cli-context.js';
import { listSubdirectories, walkFiles } from '../utils/fs-walk.js';
import { runGitCapture } from '../utils/git-run.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { resolveWorkflowPolicy } from '../utils/workflow.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

interface OnboardOptions {
  json?: boolean;
  strict?: boolean;
}

type CheckStatus = 'ok' | 'warn' | 'block';

interface OnboardCheck {
  id: string;
  status: CheckStatus;
  title: string;
  message: string;
  path?: string;
  suggestedCommand?: string;
}

interface OnboardResult {
  checks: OnboardCheck[];
  summary: {
    ok: number;
    warn: number;
    block: number;
  };
  status: 'ready' | 'needs_action' | 'blocked';
}

function t(lang: 'ko' | 'en', ko: string, en: string): string {
  return lang === 'ko' ? ko : en;
}

function quotePath(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function toSlug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

function isGitRepo(cwd: string): boolean {
  return runGitCapture(['rev-parse', '--is-inside-work-tree'], cwd) === 'true';
}

function hasHeadCommit(cwd: string): boolean {
  return !!runGitCapture(['rev-parse', '--verify', 'HEAD'], cwd);
}

function getOriginUrl(cwd: string): string | undefined {
  const out = runGitCapture(['remote', 'get-url', 'origin'], cwd);
  return out || undefined;
}

function hasTemplateMarkers(content: string): boolean {
  const patterns = [
    /\{\{projectName\}\}/,
    /\{\{date\}\}/,
    /\(Write your project mission here\)/,
    /\(Write project-specific architecture principles here/i,
    /\(Write project code quality standards here/i,
    /\(Write project security principles here/i,
    /\(Write your project-specific rules here\)/,
    /\(Override default rules or add additional rules here\)/,
    /\(Write project-specific workflows here\)/,
    /\(Write other rules here\)/,
    /\(프로젝트의 미션을 작성하세요\)/,
    /\(프로젝트별 아키텍처 원칙을 작성하세요/,
    /\(프로젝트의 코드 품질 기준을 작성하세요/,
    /\(프로젝트의 보안 원칙을 작성하세요/,
    /\(여기에 프로젝트만의 규칙을 작성하세요\)/,
    /\(기본 규칙을 오버라이드하거나 추가 규칙을 작성하세요\)/,
    /\(프로젝트만의 워크플로우가 있다면 작성하세요\)/,
    /\(기타 규칙을 작성하세요\)/,
  ];
  return patterns.some((pattern) => pattern.test(content));
}

async function countFeatureDirs(
  ctx: CliContext,
  docsDir: string,
  projectType: 'single' | 'multi'
): Promise<number> {
  const featuresRoot = path.join(docsDir, 'features');
  if (projectType === 'single') {
    const dirs = await listSubdirectories(ctx.fs, featuresRoot);
    return dirs.filter((value) => path.basename(value) !== 'feature-base')
      .length;
  }

  const components = await listSubdirectories(ctx.fs, featuresRoot);
  let total = 0;
  for (const componentDir of components) {
    const componentName = path.basename(componentDir).trim().toLowerCase();
    if (!componentName || componentName === 'feature-base') continue;
    const dirs = await listSubdirectories(ctx.fs, componentDir);
    total += dirs.filter(
      (value) => path.basename(value) !== 'feature-base'
    ).length;
  }
  return total;
}

async function hasUserPrdFile(
  ctx: CliContext,
  prdDir: string
): Promise<boolean> {
  if (!(await ctx.fs.pathExists(prdDir))) return false;
  const files = await walkFiles(ctx.fs, prdDir, {
    extensions: ['.md'],
    ignoreDirs: ['node_modules'],
  });
  return files.some(
    (absolutePath) => path.basename(absolutePath).toLowerCase() !== 'readme.md'
  );
}

function finalizeChecks(checks: OnboardCheck[]): OnboardResult {
  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { ok: 0, warn: 0, block: 0 }
  );
  const status =
    summary.block > 0 ? 'blocked' : summary.warn > 0 ? 'needs_action' : 'ready';

  return { checks, summary, status };
}

function printOnboardResult(lang: 'ko' | 'en', result: OnboardResult): void {
  console.log();
  console.log(
    chalk.bold(t(lang, '🧭 Onboarding 점검', '🧭 Onboarding Checks'))
  );
  for (const check of result.checks) {
    const mark =
      check.status === 'ok'
        ? chalk.green('✅')
        : check.status === 'warn'
          ? chalk.yellow('⚠️')
          : chalk.red('❌');
    const level =
      check.status === 'ok'
        ? chalk.green('OK')
        : check.status === 'warn'
          ? chalk.yellow('WARN')
          : chalk.red('BLOCK');
    console.log(`${mark} [${level}] ${check.title}`);
    console.log(`   ${check.message}`);
    if (check.path) console.log(chalk.gray(`   path: ${check.path}`));
    if (check.suggestedCommand) {
      console.log(
        chalk.gray(
          `   ${t(lang, '다음 명령', 'next')}: ${check.suggestedCommand}`
        )
      );
    }
  }
  console.log();
  console.log(
    chalk.bold(
      t(
        lang,
        `요약: OK ${result.summary.ok}, WARN ${result.summary.warn}, BLOCK ${result.summary.block}`,
        `Summary: OK ${result.summary.ok}, WARN ${result.summary.warn}, BLOCK ${result.summary.block}`
      )
    )
  );
  if (result.status === 'ready') {
    console.log(
      chalk.green(
        t(lang, '온보딩 준비가 완료되었습니다.', 'Onboarding checks passed.')
      )
    );
  } else if (result.status === 'needs_action') {
    console.log(
      chalk.yellow(
        t(
          lang,
          '추가 정리가 필요합니다.',
          'Some onboarding actions are required.'
        )
      )
    );
  } else {
    console.log(
      chalk.red(
        t(
          lang,
          '온보딩 선행 작업이 필요합니다.',
          'Onboarding is blocked by required setup.'
        )
      )
    );
  }
  console.log();
}

async function runOnboardChecks(ctx: CliContext): Promise<OnboardResult> {
  const { config } = ctx;
  const lang = config.lang;
  const checks: OnboardCheck[] = [];
  const docsDir = config.docsDir;

  const docsGitReady = isGitRepo(docsDir);
  if (!docsGitReady) {
    checks.push({
      id: 'docs_git_repo',
      status: 'block',
      title: t(lang, 'docs Git 레포 초기화', 'Docs git repository initialized'),
      message: t(
        lang,
        'docs 경로가 Git 레포지토리가 아닙니다.',
        'Docs directory is not a git repository.'
      ),
      path: docsDir,
      suggestedCommand: `git -C ${quotePath(docsDir)} init`,
    });
  } else {
    checks.push({
      id: 'docs_git_repo',
      status: 'ok',
      title: t(lang, 'docs Git 레포 초기화', 'Docs git repository initialized'),
      message: t(
        lang,
        'docs Git 레포가 확인되었습니다.',
        'Docs git repository is available.'
      ),
      path: docsDir,
    });

    if (!hasHeadCommit(docsDir)) {
      checks.push({
        id: 'docs_initial_commit',
        status: 'warn',
        title: t(lang, 'docs 초기 커밋', 'Docs initial commit'),
        message: t(
          lang,
          'docs 첫 커밋이 없습니다. 초기 설정 커밋을 먼저 생성하세요.',
          'No initial commit found in docs repo. Create an initial setup commit first.'
        ),
        path: docsDir,
        suggestedCommand:
          `git -C ${quotePath(docsDir)} add . && ` +
          `git -C ${quotePath(docsDir)} commit -m "docs: onboard setup"`,
      });
    } else {
      checks.push({
        id: 'docs_initial_commit',
        status: 'ok',
        title: t(lang, 'docs 초기 커밋', 'Docs initial commit'),
        message: t(
          lang,
          'docs 초기 커밋이 존재합니다.',
          'Initial commit exists in docs repo.'
        ),
        path: docsDir,
      });
    }

    const docsDirty = runGitCapture(['status', '--porcelain=v1'], docsDir);
    if (docsDirty === undefined) {
      checks.push({
        id: 'docs_worktree',
        status: 'warn',
        title: t(lang, 'docs 작업 트리 상태', 'Docs worktree status'),
        message: t(
          lang,
          'docs 변경 상태를 확인할 수 없습니다.',
          'Unable to read docs worktree status.'
        ),
        path: docsDir,
      });
    } else if (docsDirty.trim().length > 0) {
      checks.push({
        id: 'docs_worktree',
        status: 'warn',
        title: t(lang, 'docs 작업 트리 상태', 'Docs worktree status'),
        message: t(
          lang,
          '커밋되지 않은 docs 변경사항이 있습니다.',
          'Uncommitted docs changes were found.'
        ),
        path: docsDir,
        suggestedCommand:
          `git -C ${quotePath(docsDir)} add . && ` +
          `git -C ${quotePath(docsDir)} commit -m "docs: onboard updates"`,
      });
    } else {
      checks.push({
        id: 'docs_worktree',
        status: 'ok',
        title: t(lang, 'docs 작업 트리 상태', 'Docs worktree status'),
        message: t(
          lang,
          'docs 작업 트리가 깨끗합니다.',
          'Docs worktree is clean.'
        ),
        path: docsDir,
      });
    }
  }

  const constitutionPath = path.join(docsDir, 'agents', 'constitution.md');
  if (!(await fs.pathExists(constitutionPath))) {
    checks.push({
      id: 'constitution_exists',
      status: 'block',
      title: t(lang, 'Constitution 작성', 'Constitution setup'),
      message: t(
        lang,
        '`agents/constitution.md` 파일이 없습니다.',
        '`agents/constitution.md` is missing.'
      ),
      path: constitutionPath,
      suggestedCommand: `npx lee-spec-kit update --agents`,
    });
  } else {
    const content = await fs.readFile(constitutionPath, 'utf-8');
    if (hasTemplateMarkers(content)) {
      checks.push({
        id: 'constitution_filled',
        status: 'block',
        title: t(lang, 'Constitution 작성', 'Constitution setup'),
        message: t(
          lang,
          'Constitution에 템플릿 placeholder가 남아 있습니다. 프로젝트 기준으로 먼저 작성하세요.',
          'Constitution still contains template placeholders. Fill project-specific content first.'
        ),
        path: constitutionPath,
      });
    } else {
      checks.push({
        id: 'constitution_filled',
        status: 'ok',
        title: t(lang, 'Constitution 작성', 'Constitution setup'),
        message: t(
          lang,
          'Constitution이 작성되었습니다.',
          'Constitution looks filled.'
        ),
        path: constitutionPath,
      });
    }
  }

  const customPath = path.join(docsDir, 'agents', 'custom.md');
  if (await fs.pathExists(customPath)) {
    const content = await fs.readFile(customPath, 'utf-8');
    if (hasTemplateMarkers(content)) {
      checks.push({
        id: 'custom_optional',
        status: 'warn',
        title: t(lang, 'Custom 규칙 문서', 'Custom rules doc'),
        message: t(
          lang,
          '`agents/custom.md`는 선택 항목이지만, 현재 템플릿 상태입니다. 필요하면 규칙을 작성하세요.',
          '`agents/custom.md` is optional, but it still looks like template content. Fill it if your project needs custom rules.'
        ),
        path: customPath,
      });
    } else {
      checks.push({
        id: 'custom_optional',
        status: 'ok',
        title: t(lang, 'Custom 규칙 문서', 'Custom rules doc'),
        message: t(
          lang,
          'Custom 규칙 문서가 구성되었습니다.',
          'Custom rules doc looks configured.'
        ),
        path: customPath,
      });
    }
  }

  const prdDir = path.join(docsDir, 'prd');
  const featureCount = await countFeatureDirs(ctx, docsDir, config.projectType);
  const prdReady = await hasUserPrdFile(ctx, prdDir);
  if (!prdReady) {
    checks.push({
      id: 'prd_ready',
      status: featureCount === 0 ? 'block' : 'warn',
      title: t(lang, 'PRD 준비 상태', 'PRD readiness'),
      message:
        featureCount === 0
          ? t(
              lang,
              'PRD 문서가 비어 있습니다. Feature 생성 전에 PRD부터 작성하세요.',
              'PRD is empty. Write PRD first before creating features.'
            )
          : t(
              lang,
              'PRD 문서가 비어 있습니다. 이미 Feature가 있다면 PRD를 보강하세요.',
              'PRD is empty. If features already exist, fill PRD as soon as possible.'
            ),
      path: prdDir,
      suggestedCommand: `touch ${quotePath(path.join(prdDir, `${toSlug(config.projectName || 'project')}-prd.md`))}`,
    });
  } else {
    checks.push({
      id: 'prd_ready',
      status: 'ok',
      title: t(lang, 'PRD 준비 상태', 'PRD readiness'),
      message: t(
        lang,
        'PRD 문서가 확인되었습니다.',
        'PRD document is present.'
      ),
      path: prdDir,
    });
  }

  const workflowPolicy = resolveWorkflowPolicy(config.workflow);
  if (workflowPolicy.mode === 'github') {
    const projectKeys =
      config.projectType === 'multi'
        ? resolveProjectComponents(config.projectType, config.components)
        : ['single'];

    for (const key of projectKeys) {
      const resolved = resolveProjectGitCwd(ctx, key, lang);
      const title = t(
        lang,
        config.projectType === 'multi'
          ? `프로젝트 Git 연결 (${key})`
          : '프로젝트 Git 연결',
        config.projectType === 'multi'
          ? `Project git connectivity (${key})`
          : 'Project git connectivity'
      );
      if (resolved.warning || !resolved.cwd) {
        checks.push({
          id: `project_git_${key}`,
          status: 'block',
          title,
          message:
            resolved.warning ||
            t(
              lang,
              '프로젝트 레포 경로를 확인할 수 없습니다.',
              'Project repository path could not be resolved.'
            ),
        });
        continue;
      }

      if (!isGitRepo(resolved.cwd)) {
        checks.push({
          id: `project_git_${key}`,
          status: 'block',
          title,
          message: t(
            lang,
            '프로젝트 경로가 Git 레포지토리가 아닙니다.',
            'Project path is not a git repository.'
          ),
          path: resolved.cwd,
          suggestedCommand: `git -C ${quotePath(resolved.cwd)} init`,
        });
        continue;
      }

      const origin = getOriginUrl(resolved.cwd);
      if (!origin) {
        checks.push({
          id: `project_origin_${key}`,
          status: 'block',
          title: t(
            lang,
            config.projectType === 'multi'
              ? `프로젝트 origin 설정 (${key})`
              : '프로젝트 origin 설정',
            config.projectType === 'multi'
              ? `Project origin configured (${key})`
              : 'Project origin configured'
          ),
          message: t(
            lang,
            'GitHub 워크플로우를 위해 프로젝트 레포의 origin remote가 필요합니다.',
            'Project repo origin remote is required for github workflow.'
          ),
          path: resolved.cwd,
          suggestedCommand: `git -C ${quotePath(resolved.cwd)} remote add origin <git-url>`,
        });
      } else {
        checks.push({
          id: `project_origin_${key}`,
          status: 'ok',
          title: t(
            lang,
            config.projectType === 'multi'
              ? `프로젝트 origin 설정 (${key})`
              : '프로젝트 origin 설정',
            config.projectType === 'multi'
              ? `Project origin configured (${key})`
              : 'Project origin configured'
          ),
          message: t(
            lang,
            `origin이 설정되어 있습니다: ${origin}`,
            `origin is configured: ${origin}`
          ),
          path: resolved.cwd,
        });
      }
    }
  }

  if (config.docsRepo === 'standalone' && config.pushDocs) {
    const origin = getOriginUrl(docsDir);
    if (!origin) {
      checks.push({
        id: 'docs_origin',
        status: 'block',
        title: t(lang, 'docs origin 설정', 'Docs origin configured'),
        message: t(
          lang,
          'standalone + pushDocs=true 설정에서는 docs origin remote가 필요합니다.',
          'docs origin remote is required when standalone + pushDocs=true.'
        ),
        path: docsDir,
        suggestedCommand: `git -C ${quotePath(docsDir)} remote add origin <docs-git-url>`,
      });
    } else {
      checks.push({
        id: 'docs_origin',
        status: 'ok',
        title: t(lang, 'docs origin 설정', 'Docs origin configured'),
        message: t(
          lang,
          `origin이 설정되어 있습니다: ${origin}`,
          `origin is configured: ${origin}`
        ),
        path: docsDir,
      });
    }
  }

  return finalizeChecks(checks);
}

export function onboardCommand(program: Command): void {
  program
    .command('onboard')
    .description('Run onboarding checks for initial setup')
    .option('--json', 'Output in JSON format for agents')
    .option('--strict', 'Exit with code 1 when WARN/BLOCK exists')
    .action(async (options: OnboardOptions) => {
      try {
        await runOnboard(options);
      } catch (error) {
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
        } else {
          console.error(
            chalk.red(tr(lang, 'cli', 'common.errorLabel')),
            chalk.red(`[${cliError.code}] ${cliError.message}`)
          );
          printCliErrorSuggestions(suggestions, lang);
        }
        process.exitCode = 1;
        return;
      }
    });
}

async function runOnboard(options: OnboardOptions): Promise<void> {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }
  const lang = config.lang;
  const ctx = (await createCliContext({ cwd: process.cwd() }))!;
  const result = await runOnboardChecks(ctx);

  if (options.json) {
    const payload = {
      status: 'ok',
      reasonCode:
        result.status === 'ready'
          ? 'ONBOARD_READY'
          : result.status === 'needs_action'
            ? 'ONBOARD_NEEDS_ACTION'
            : 'ONBOARD_BLOCKED',
      docsDir: config.docsDir,
      docsRepo: config.docsRepo || 'embedded',
      workflow: resolveWorkflowPolicy(config.workflow),
      summary: result.summary,
      checks: result.checks,
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printOnboardResult(lang, result);
  }

  if (options.strict && (result.summary.warn > 0 || result.summary.block > 0)) {
    process.exitCode = 1;
  }
}

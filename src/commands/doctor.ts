import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { scanFeatures, FeatureContext } from '../utils/context.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

type IssueLevel = 'error' | 'warn';

type DoctorIssue = {
  level: IssueLevel;
  code: string;
  message: string;
  path?: string;
};

interface DoctorOptions {
  json?: boolean;
  strict?: boolean;
}

function formatPath(cwd: string, p: string | undefined): string {
  if (!p) return '';
  return path.isAbsolute(p) ? path.relative(cwd, p) : p;
}

function detectPlaceholders(content: string): string[] {
  const patterns: Array<{ key: string; re: RegExp }> = [
    { key: '{{projectName}}', re: /\{\{projectName\}\}/g },
    { key: '{{date}}', re: /\{\{date\}\}/g },
    { key: '{{featurePath}}', re: /\{\{featurePath\}\}/g },
    { key: '{{description}}', re: /\{\{description\}\}/g },
    { key: '{기능명}', re: /\{기능명\}/g },
    { key: '{번호}', re: /\{번호\}/g },
    { key: '{이슈번호}', re: /\{이슈번호\}/g },
    { key: '{feature-name}', re: /\{feature-name\}/g },
    { key: '{number}', re: /\{number\}/g },
    { key: '{issue-number}', re: /\{issue-number\}/g },
    { key: '{be|fe}', re: /\{be\|fe\}/g },
    { key: '{Story Title}', re: /\{Story Title\}/g },
    { key: '{user type}', re: /\{user type\}/g },
    { key: '{desired action}', re: /\{desired action\}/g },
    { key: '{reason/value}', re: /\{reason\/value\}/g },
    { key: '{Requirement Title}', re: /\{Requirement Title\}/g },
    { key: '{Phase Name}', re: /\{Phase Name\}/g },
    { key: '{Task Title}', re: /\{Task Title\}/g },
    { key: '{Decision Title}', re: /\{Decision Title\}/g },
    { key: '{test command you ran}', re: /\{test command you ran\}/g },
    { key: '{PASS/FAIL summary}', re: /\{PASS\/FAIL summary\}/g },
    { key: '{스토리 제목}', re: /\{스토리 제목\}/g },
    { key: '{사용자 유형}', re: /\{사용자 유형\}/g },
    { key: '{원하는 것}', re: /\{원하는 것\}/g },
    { key: '{이유/가치}', re: /\{이유\/가치\}/g },
    { key: '{요구사항 제목}', re: /\{요구사항 제목\}/g },
    { key: '{단계명}', re: /\{단계명\}/g },
    { key: '{태스크 제목}', re: /\{태스크 제목\}/g },
    { key: '{실행한 테스트 명령어}', re: /\{실행한 테스트 명령어\}/g },
    { key: '{PASS/FAIL 요약}', re: /\{PASS\/FAIL 요약\}/g },
    { key: 'YYYY-MM-DD', re: /\bYYYY-MM-DD\b/g },
  ];

  const hits = new Set<string>();
  for (const { key, re } of patterns) {
    if (re.test(content)) hits.add(key);
  }

  const genericBraceTokens = content.match(
    /\{[A-Za-z가-힣][A-Za-z0-9가-힣 _/\-|]{1,40}\}/g
  );
  if (genericBraceTokens && genericBraceTokens.length > 0) {
    hits.add('{...}');
  }

  return [...hits];
}

async function checkDocsStructure(
  config: { docsDir: string; projectType: 'single' | 'fullstack'; lang: 'ko' | 'en' },
  cwd: string
): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];
  const requiredDirs = ['agents', 'features', 'prd', 'designs', 'ideas'];

  for (const dir of requiredDirs) {
    const p = path.join(config.docsDir, dir);
    if (!(await fs.pathExists(p))) {
      issues.push({
        level: 'error',
        code: 'missing_dir',
        message: tr(config.lang, 'cli', 'doctor.issue.missingRequiredDir', { dir }),
        path: formatPath(cwd, p),
      });
    }
  }

  const configPath = path.join(config.docsDir, '.lee-spec-kit.json');
  if (!(await fs.pathExists(configPath))) {
    issues.push({
      level: 'warn',
      code: 'missing_config',
      message: tr(config.lang, 'cli', 'doctor.issue.missingConfig'),
      path: formatPath(cwd, configPath),
    });
  }

  return issues;
}

async function checkFeatures(
  config: { docsDir: string; projectType: 'single' | 'fullstack'; lang: 'ko' | 'en' },
  cwd: string,
  features: FeatureContext[]
): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];

  if (features.length === 0) {
    issues.push({
      level: 'warn',
      code: 'no_features',
      message: tr(config.lang, 'cli', 'doctor.issue.noFeatures'),
    });
    return issues;
  }

  const idMap = new Map<string, string[]>();
  for (const f of features) {
    const rel = f.docs.featurePathFromDocs || path.relative(config.docsDir, f.path);
    const id = f.id || 'UNKNOWN';
    if (!idMap.has(id)) idMap.set(id, []);
    idMap.get(id)!.push(rel);

    // placeholder 잔존 여부는 "feature 폴더 내부"만 검사 (agents/prd 등은 템플릿 성격이라 제외)
    const featureDocs = ['spec.md', 'plan.md', 'tasks.md', 'decisions.md'];
    for (const file of featureDocs) {
      const p = path.join(f.path, file);
      if (!(await fs.pathExists(p))) continue;
      const content = await fs.readFile(p, 'utf-8');
      const placeholders = detectPlaceholders(content);
      if (placeholders.length === 0) continue;
      issues.push({
        level: 'warn',
        code: 'placeholder_left',
        message: tr(config.lang, 'cli', 'doctor.issue.placeholdersLeft', {
          placeholders: placeholders.join(', '),
        }),
        path: formatPath(cwd, p),
      });
    }

    if (!f.docs.specExists) {
      issues.push({
        level: 'warn',
        code: 'missing_spec',
        message: tr(config.lang, 'cli', 'doctor.issue.missingSpec'),
        path: formatPath(cwd, f.path),
      });
    } else if (!f.specStatus) {
      issues.push({
        level: 'warn',
        code: 'spec_status_unset',
        message: tr(config.lang, 'cli', 'doctor.issue.specStatusUnset'),
        path: formatPath(cwd, path.join(f.path, 'spec.md')),
      });
    }

    if (f.docs.planExists && !f.planStatus) {
      issues.push({
        level: 'warn',
        code: 'plan_status_unset',
        message: tr(config.lang, 'cli', 'doctor.issue.planStatusUnset'),
        path: formatPath(cwd, path.join(f.path, 'plan.md')),
      });
    }

    if (f.docs.tasksExists && f.tasks.total === 0) {
      issues.push({
        level: 'warn',
        code: 'tasks_empty',
        message: tr(config.lang, 'cli', 'doctor.issue.tasksEmpty'),
        path: formatPath(cwd, path.join(f.path, 'tasks.md')),
      });
    }

    if (f.docs.tasksExists && !f.docs.tasksDocStatusFieldExists) {
      issues.push({
        level: 'warn',
        code: 'tasks_doc_status_missing',
        message: tr(config.lang, 'cli', 'doctor.issue.tasksDocStatusMissing'),
        path: formatPath(cwd, path.join(f.path, 'tasks.md')),
      });
    }

    if (f.docs.tasksExists && f.docs.tasksDocStatusFieldExists && !f.tasksDocStatus) {
      issues.push({
        level: 'warn',
        code: 'tasks_doc_status_unset',
        message: tr(config.lang, 'cli', 'doctor.issue.tasksDocStatusUnset'),
        path: formatPath(cwd, path.join(f.path, 'tasks.md')),
      });
    }
  }

  const duplicates = [...idMap.entries()].filter(
    ([id, paths]) => id !== 'UNKNOWN' && paths.length > 1
  );
  for (const [id, paths] of duplicates) {
    issues.push({
      level: 'warn',
      code: 'duplicate_feature_id',
      message: tr(config.lang, 'cli', 'doctor.issue.duplicateFeatureId', {
        id,
        count: String(paths.length),
      }),
      path: formatPath(cwd, paths[0]),
    });
  }

  const unknowns = idMap.get('UNKNOWN') || [];
  for (const p of unknowns) {
    issues.push({
      level: 'warn',
      code: 'missing_feature_id',
      message: tr(config.lang, 'cli', 'doctor.issue.missingFeatureId'),
      path: formatPath(cwd, path.join(config.docsDir, p)),
    });
  }

  return issues;
}

export function doctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Validate docs structure and feature metadata')
    .option('--json', 'Output in JSON format for agents')
    .option('-s, --strict', 'Exit with non-zero code when issues are found')
    .action(async (options: DoctorOptions) => {
      try {
        const cwd = process.cwd();
        const config = await getConfig(cwd);

        if (!config) {
          throw createCliError(
            'CONFIG_NOT_FOUND',
            tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
          );
        }

        const { docsDir, projectType, lang } = config;
        const { features, branches, warnings } = await scanFeatures(config);

        const issues: DoctorIssue[] = [];
        issues.push(...(await checkDocsStructure({ docsDir, projectType, lang }, cwd)));
        issues.push(
          ...(await checkFeatures({ docsDir, projectType, lang }, cwd, features))
        );

        const hasIssues = issues.length > 0;
        const hasErrors = issues.some((i) => i.level === 'error');
        const exitCode = options.strict && hasIssues ? 1 : 0;

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: hasErrors ? 'error' : hasIssues ? 'warn' : 'ok',
                meta: { docsDir, projectType, lang },
                branches,
                warnings,
                counts: {
                  features: features.length,
                  issues: issues.length,
                  errors: issues.filter((i) => i.level === 'error').length,
                  warnings: issues.filter((i) => i.level === 'warn').length,
                },
                issues,
              },
              null,
              2
            )
          );
          process.exit(exitCode);
        }

        console.log();
        console.log(chalk.bold(tr(lang, 'cli', 'doctor.title')));
        console.log(chalk.gray(`- Docs: ${path.relative(cwd, docsDir)}`));
        console.log(chalk.gray(`- Type: ${projectType}`));
        console.log(chalk.gray(`- Lang: ${lang}`));
        console.log();

        if (warnings.length > 0) {
          console.log(chalk.yellow(tr(lang, 'cli', 'doctor.envWarnings')));
          warnings.forEach((w) => console.log(chalk.yellow(`  - ${w}`)));
          console.log();
        }

        if (!hasIssues) {
          console.log(chalk.green(tr(lang, 'cli', 'doctor.noIssues')));
          console.log();
          process.exit(0);
        }

        const errors = issues.filter((i) => i.level === 'error');
        const warns = issues.filter((i) => i.level === 'warn');

        if (errors.length > 0) {
          console.log(
            chalk.red(
              `❌ ${tr(lang, 'cli', 'doctor.errorsTitle')} (${errors.length})`
            )
          );
          errors.forEach((i) =>
            console.log(chalk.red(`  - ${i.message}${i.path ? ` (${i.path})` : ''}`))
          );
          console.log();
        }

        if (warns.length > 0) {
          console.log(
            chalk.yellow(
              `⚠️  ${tr(lang, 'cli', 'doctor.warningsTitle')} (${warns.length})`
            )
          );
          warns.forEach((i) =>
            console.log(
              chalk.yellow(`  - ${i.message}${i.path ? ` (${i.path})` : ''}`)
            )
          );
          console.log();
        }

        console.log(
          chalk.gray(
            tr(lang, 'cli', 'doctor.tipJson', {
              strictFlag: options.strict ? ' --strict' : '',
            })
          )
        );
        console.log();

        process.exit(exitCode);
      } catch (error) {
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
        const cliError = toCliError(error, 'UNKNOWN_ERROR');
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'error',
                reasonCode: cliError.code,
                error: cliError.message,
                suggestions,
              },
              null,
              2
            )
          );
        } else {
          console.error(
            chalk.red(tr(lang, 'cli', 'common.errorLabel')),
            chalk.red(`[${cliError.code}] ${cliError.message}`)
          );
          printCliErrorSuggestions(suggestions, lang);
        }
        process.exit(1);
      }
    });
}

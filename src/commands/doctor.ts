import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { scanFeatures, FeatureContext } from '../utils/context.js';
import { getLocalDateString } from '../utils/date.js';
import { applyReplacements } from '../utils/template.js';
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
  fix?: boolean;
  dryRun?: boolean;
}

interface DoctorFixEntry {
  path: string;
  changes: string[];
}

interface DoctorFixResult {
  enabled: boolean;
  dryRun: boolean;
  changedFiles: number;
  entries: DoctorFixEntry[];
}

const FIXABLE_ISSUE_CODES = new Set([
  'placeholder_left',
  'spec_status_unset',
  'plan_status_unset',
  'tasks_doc_status_missing',
  'tasks_doc_status_unset',
]);

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

function normalizeStatusLine(
  content: string,
  keys: string[],
  target: 'Draft' | 'Review' | 'Approved'
): { content: string; changed: boolean } {
  const escaped = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(
    `^(\\s*-\\s*\\*\\*(?:${escaped.join('|')})\\*\\*\\s*:\\s*)(.*)$`,
    'm'
  );
  const match = content.match(re);
  if (!match) return { content, changed: false };
  const current = (match[2] || '').trim();
  if (/^(Draft|Review|Approved)$/i.test(current)) {
    return { content, changed: false };
  }
  return {
    content: content.replace(re, `$1${target}`),
    changed: true,
  };
}

function ensureTasksDocStatus(
  content: string,
  lang: 'ko' | 'en'
): { content: string; changed: boolean } {
  const normalized = normalizeStatusLine(content, ['Doc Status', '문서 상태'], 'Review');
  if (normalized.changed) return normalized;

  const hasField = /^\s*-\s*\*\*(Doc Status|문서 상태)\*\*\s*:/m.test(content);
  if (hasField) return { content, changed: false };

  const line =
    lang === 'ko' ? '- **문서 상태**: Review' : '- **Doc Status**: Review';
  const lines = content.split('\n');
  const headingIdx = lines.findIndex((lineText) =>
    /^\s*##\s+(GitHub Issue|Local Tracking|로컬 추적 정보)\s*$/.test(lineText)
  );

  if (headingIdx >= 0) {
    let insertAt = headingIdx + 1;
    if (lines[insertAt] !== undefined && lines[insertAt].trim() === '') {
      insertAt += 1;
    }
    lines.splice(insertAt, 0, line);
    return { content: lines.join('\n'), changed: true };
  }

  const fallbackHeading = lang === 'ko' ? '## 로컬 추적 정보' : '## Local Tracking';
  const next = `${content.trimEnd()}\n\n${fallbackHeading}\n\n${line}\n`;
  return { content: next, changed: true };
}

function applyPlaceholderFixes(
  content: string,
  context: {
    projectName?: string;
    featureName: string;
    featurePath: string;
    repoType: string;
    featureNumber: string;
  },
  lang: 'ko' | 'en'
): { content: string; changed: boolean } {
  const date = getLocalDateString();
  const replacements: Record<string, string> = {
    '{{projectName}}': context.projectName || 'project',
    '{{date}}': date,
    '{{featurePath}}': context.featurePath,
    '{{description}}': `${context.featureName} feature`,
    '{feature-name}': context.featureName,
    '{기능명}': context.featureName,
    '{number}': context.featureNumber,
    '{번호}': context.featureNumber,
    '{issue-number}': '-',
    '{이슈번호}': '-',
    '{be|fe}': context.repoType === 'single' ? '' : context.repoType,
    'YYYY-MM-DD': date,
    '{Story Title}': `${context.featureName} user flow`,
    '{user type}': 'developer',
    '{desired action}': `complete ${context.featureName}`,
    '{reason/value}': 'deliver value quickly',
    '{Requirement Title}': `${context.featureName} requirement`,
    '{Phase Name}': 'Implementation',
    '{Task Title}': `${context.featureName} task`,
    '{Decision Title}': `${context.featureName} design decision`,
    '{test command you ran}': 'npm test',
    '{PASS/FAIL summary}': 'PENDING',
    '{스토리 제목}': `${context.featureName} 사용자 흐름`,
    '{사용자 유형}': '개발자',
    '{원하는 것}': `${context.featureName} 완료`,
    '{이유/가치}': '빠른 가치 전달',
    '{요구사항 제목}': `${context.featureName} 요구사항`,
    '{단계명}': '구현',
    '{태스크 제목}': `${context.featureName} 태스크`,
    '{실행한 테스트 명령어}': 'npm test',
    '{PASS/FAIL 요약}': 'PENDING',
  };

  let next = applyReplacements(content, replacements);
  next = next.replace(/\{\d{4}-\d{2}-\d{2}\}/g, date);

  if (lang === 'en') {
    next = next.replace(/\s+\(\s*Why is this feature needed\? What problem does it solve\?\)/g, '');
  } else {
    next = next.replace(/\s+\(\s*이 기능이 왜 필요한지, 어떤 문제를 해결하는지\)/g, '');
  }

  return { content: next, changed: next !== content };
}

async function applyDoctorFixes(
  config: { docsDir: string; projectType: 'single' | 'multi'; lang: 'ko' | 'en'; projectName?: string },
  cwd: string,
  features: FeatureContext[],
  dryRun: boolean
): Promise<DoctorFixResult> {
  const entries: DoctorFixEntry[] = [];

  for (const f of features) {
    const featureNumber = f.id ? f.id.replace(/^F/, '') : '000';
    const placeholderContext = {
      projectName: config.projectName,
      featureName: f.slug,
      featurePath: f.docs.featurePathFromDocs || path.relative(config.docsDir, f.path),
      repoType: f.type,
      featureNumber,
    };

    const files: Array<'spec.md' | 'plan.md' | 'tasks.md' | 'decisions.md'> = [
      'spec.md',
      'plan.md',
      'tasks.md',
      'decisions.md',
    ];

    for (const file of files) {
      const fullPath = path.join(f.path, file);
      if (!(await fs.pathExists(fullPath))) continue;

      const original = await fs.readFile(fullPath, 'utf-8');
      let next = original;
      const changes: string[] = [];

      const placeholderFix = applyPlaceholderFixes(next, placeholderContext, config.lang);
      next = placeholderFix.content;
      if (placeholderFix.changed) {
        changes.push('replaced placeholders');
      }

      if (file === 'spec.md' || file === 'plan.md') {
        const normalized = normalizeStatusLine(next, ['Status', '상태'], 'Review');
        next = normalized.content;
        if (normalized.changed) {
          changes.push('normalized document status to Review');
        }
      }

      if (file === 'tasks.md') {
        const ensured = ensureTasksDocStatus(next, config.lang);
        next = ensured.content;
        if (ensured.changed) {
          changes.push('ensured Doc Status field is Review');
        }
      }

      if (next === original) continue;

      if (!dryRun) {
        await fs.writeFile(fullPath, next, 'utf-8');
      }

      entries.push({
        path: formatPath(cwd, fullPath),
        changes,
      });
    }
  }

  return {
    enabled: true,
    dryRun,
    changedFiles: entries.length,
    entries,
  };
}

async function checkDocsStructure(
  config: { docsDir: string; projectType: 'single' | 'multi'; lang: 'ko' | 'en' },
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
  config: { docsDir: string; projectType: 'single' | 'multi'; lang: 'ko' | 'en' },
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

    const isInitialTemplateState =
      f.docs.specExists &&
      f.docs.planExists &&
      f.docs.tasksExists &&
      !f.specStatus &&
      !f.planStatus &&
      f.tasks.total === 0 &&
      (!f.docs.tasksDocStatusFieldExists ||
        !f.tasksDocStatus ||
        f.tasksDocStatus === 'Draft');

    // placeholder 잔존 여부는 "feature 폴더 내부"만 검사 (agents/prd 등은 템플릿 성격이라 제외)
    if (!isInitialTemplateState) {
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
    }

    if (!f.docs.specExists) {
      issues.push({
        level: 'warn',
        code: 'missing_spec',
        message: tr(config.lang, 'cli', 'doctor.issue.missingSpec'),
        path: formatPath(cwd, f.path),
      });
    } else if (!f.specStatus && !isInitialTemplateState) {
      issues.push({
        level: 'warn',
        code: 'spec_status_unset',
        message: tr(config.lang, 'cli', 'doctor.issue.specStatusUnset'),
        path: formatPath(cwd, path.join(f.path, 'spec.md')),
      });
    }

    if (f.docs.planExists && !f.planStatus && !isInitialTemplateState) {
      issues.push({
        level: 'warn',
        code: 'plan_status_unset',
        message: tr(config.lang, 'cli', 'doctor.issue.planStatusUnset'),
        path: formatPath(cwd, path.join(f.path, 'plan.md')),
      });
    }

    if (f.docs.tasksExists && f.tasks.total === 0 && !isInitialTemplateState) {
      issues.push({
        level: 'warn',
        code: 'tasks_empty',
        message: tr(config.lang, 'cli', 'doctor.issue.tasksEmpty'),
        path: formatPath(cwd, path.join(f.path, 'tasks.md')),
      });
    }

    if (
      f.docs.tasksExists &&
      !f.docs.tasksDocStatusFieldExists &&
      !isInitialTemplateState
    ) {
      issues.push({
        level: 'warn',
        code: 'tasks_doc_status_missing',
        message: tr(config.lang, 'cli', 'doctor.issue.tasksDocStatusMissing'),
        path: formatPath(cwd, path.join(f.path, 'tasks.md')),
      });
    }

    if (
      f.docs.tasksExists &&
      f.docs.tasksDocStatusFieldExists &&
      !f.tasksDocStatus &&
      !isInitialTemplateState
    ) {
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

function hasFixableIssues(issues: DoctorIssue[]): boolean {
  return issues.some((issue) => FIXABLE_ISSUE_CODES.has(issue.code));
}

export function doctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Validate docs structure and feature metadata')
    .option('--json', 'Output in JSON format for agents')
    .option('--fix', 'Automatically apply safe fixes for common docs issues')
    .option('--dry-run', 'Show potential fixes without writing files (requires --fix)')
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

        if (options.dryRun && !options.fix) {
          throw createCliError(
            'INVALID_ARGUMENT',
            '`--dry-run` requires `--fix`.'
          );
        }

        const { docsDir, projectType, lang } = config;
        let scan = await scanFeatures(config);
        let features = scan.features;
        let branches = scan.branches;
        let warnings = scan.warnings;

        let issues: DoctorIssue[] = [];
        issues.push(...(await checkDocsStructure({ docsDir, projectType, lang }, cwd)));
        issues.push(...(await checkFeatures({ docsDir, projectType, lang }, cwd, features)));

        let fixResult: DoctorFixResult | null = null;
        if (options.fix) {
          if (hasFixableIssues(issues)) {
            fixResult = await applyDoctorFixes(
              { docsDir, projectType, lang, projectName: config.projectName },
              cwd,
              features,
              !!options.dryRun
            );
          } else {
            fixResult = {
              enabled: true,
              dryRun: !!options.dryRun,
              changedFiles: 0,
              entries: [],
            };
          }

          if (!options.dryRun && fixResult.changedFiles > 0) {
            scan = await scanFeatures(config);
            features = scan.features;
            branches = scan.branches;
            warnings = scan.warnings;
            issues = [];
            issues.push(...(await checkDocsStructure({ docsDir, projectType, lang }, cwd)));
            issues.push(...(await checkFeatures({ docsDir, projectType, lang }, cwd, features)));
          }
        }

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
                fixes: fixResult
                  ? {
                      enabled: fixResult.enabled,
                      dryRun: fixResult.dryRun,
                      changedFiles: fixResult.changedFiles,
                      entries: fixResult.entries,
                    }
                  : undefined,
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

        if (fixResult) {
          const label = fixResult.dryRun ? '🧪 Doctor Fix (dry-run)' : '🛠️  Doctor Fix';
          console.log(chalk.blue(`${label}: ${fixResult.changedFiles} file(s)`));
          if (fixResult.changedFiles > 0) {
            fixResult.entries.forEach((entry) =>
              console.log(chalk.gray(`  - ${entry.path}: ${entry.changes.join(', ')}`))
            );
          }
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

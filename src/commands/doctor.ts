import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { getConfig } from '../utils/config.js';
import { scanFeatures, FeatureContext } from '../utils/context.js';

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

function msg(lang: 'ko' | 'en', ko: string, en: string): string {
  return lang === 'en' ? en : ko;
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
    { key: 'YYYY-MM-DD', re: /\bYYYY-MM-DD\b/g },
  ];

  const hits: string[] = [];
  for (const { key, re } of patterns) {
    if (re.test(content)) hits.push(key);
  }
  return hits;
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
        message: msg(
          config.lang,
          `필수 폴더가 없습니다: ${dir}`,
          `Missing required directory: ${dir}`
        ),
        path: formatPath(cwd, p),
      });
    }
  }

  const configPath = path.join(config.docsDir, '.lee-spec-kit.json');
  if (!(await fs.pathExists(configPath))) {
    issues.push({
      level: 'warn',
      code: 'missing_config',
      message: msg(
        config.lang,
        '설정 파일(.lee-spec-kit.json)이 없습니다. 일부 기능이 폴더 구조 추정으로 동작할 수 있습니다.',
        'Missing .lee-spec-kit.json. Some commands may rely on folder-structure heuristics.'
      ),
      path: formatPath(cwd, configPath),
    });
  }

  // placeholder 잔존 여부 (feature-base는 SSOT이므로 제외)
  const mdFiles = await glob('**/*.md', {
    cwd: config.docsDir,
    absolute: true,
    ignore: ['**/features/feature-base/**'],
  });

  for (const file of mdFiles) {
    const content = await fs.readFile(file, 'utf-8');
    const placeholders = detectPlaceholders(content);
    if (placeholders.length === 0) continue;
    issues.push({
      level: 'warn',
      code: 'placeholder_left',
      message: msg(
        config.lang,
        `플레이스홀더가 남아있습니다: ${placeholders.join(', ')}`,
        `Leftover placeholders detected: ${placeholders.join(', ')}`
      ),
      path: formatPath(cwd, file),
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
      message: msg(
        config.lang,
        'Feature 폴더를 찾지 못했습니다. (feature-base만 존재하거나 아직 feature를 만들지 않았을 수 있습니다.)',
        'No feature folders found. (Only feature-base exists, or no features created yet.)'
      ),
    });
    return issues;
  }

  const idMap = new Map<string, string[]>();
  for (const f of features) {
    const rel = f.docs.featurePathFromDocs || path.relative(config.docsDir, f.path);
    const id = f.id || 'UNKNOWN';
    if (!idMap.has(id)) idMap.set(id, []);
    idMap.get(id)!.push(rel);

    if (!f.docs.specExists) {
      issues.push({
        level: 'warn',
        code: 'missing_spec',
        message: msg(
          config.lang,
          'spec.md가 없습니다.',
          'Missing spec.md.'
        ),
        path: formatPath(cwd, f.path),
      });
    } else if (!f.specStatus) {
      issues.push({
        level: 'warn',
        code: 'spec_status_unset',
        message: msg(
          config.lang,
          'spec.md의 Status(상태)가 설정되지 않았습니다. (템플릿 그대로일 수 있음)',
          'spec.md Status is not set. (May still be a template)'
        ),
        path: formatPath(cwd, path.join(f.path, 'spec.md')),
      });
    }

    if (f.docs.planExists && !f.planStatus) {
      issues.push({
        level: 'warn',
        code: 'plan_status_unset',
        message: msg(
          config.lang,
          'plan.md의 Status(상태)가 설정되지 않았습니다. (템플릿 그대로일 수 있음)',
          'plan.md Status is not set. (May still be a template)'
        ),
        path: formatPath(cwd, path.join(f.path, 'plan.md')),
      });
    }

    if (f.docs.tasksExists && f.tasks.total === 0) {
      issues.push({
        level: 'warn',
        code: 'tasks_empty',
        message: msg(
          config.lang,
          'tasks.md에 태스크가 없습니다.',
          'tasks.md has no tasks.'
        ),
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
      message: msg(
        config.lang,
        `중복 Feature ID 감지: ${id} (${paths.length}개)`,
        `Duplicate Feature ID detected: ${id} (${paths.length})`
      ),
      path: formatPath(cwd, paths[0]),
    });
  }

  const unknowns = idMap.get('UNKNOWN') || [];
  for (const p of unknowns) {
    issues.push({
      level: 'warn',
      code: 'missing_feature_id',
      message: msg(
        config.lang,
        'Feature 폴더명이 F001-... 형식이 아닙니다. (ID를 추출할 수 없음)',
        'Feature folder name is not in F001-... format. (Cannot extract ID)'
      ),
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
      const cwd = process.cwd();
      const config = await getConfig(cwd);

      if (!config) {
        const message = '설정 파일을 찾을 수 없습니다. 먼저 init을 실행해주세요.';
        if (options.json) {
          console.log(JSON.stringify({ status: 'error', error: message }, null, 2));
        } else {
          console.error(chalk.red('오류:'), message);
        }
        process.exit(1);
      }

      const { docsDir, projectType, lang } = config;
      const { features, branches, warnings } = await scanFeatures(config);

      const issues: DoctorIssue[] = [];
      issues.push(...(await checkDocsStructure({ docsDir, projectType, lang }, cwd)));
      issues.push(...(await checkFeatures({ docsDir, projectType, lang }, cwd, features)));

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
      console.log(chalk.bold('🔎 Docs Doctor'));
      console.log(chalk.gray(`- Docs: ${path.relative(cwd, docsDir)}`));
      console.log(chalk.gray(`- Type: ${projectType}`));
      console.log(chalk.gray(`- Lang: ${lang}`));
      console.log();

      if (warnings.length > 0) {
        console.log(chalk.yellow('⚠️  Environment warnings:'));
        warnings.forEach((w) => console.log(chalk.yellow(`  - ${w}`)));
        console.log();
      }

      if (!hasIssues) {
        console.log(chalk.green('✅ 문제를 찾지 못했습니다.'));
        console.log();
        process.exit(0);
      }

      const errors = issues.filter((i) => i.level === 'error');
      const warns = issues.filter((i) => i.level === 'warn');

      if (errors.length > 0) {
        console.log(chalk.red(`❌ Errors (${errors.length})`));
        errors.forEach((i) =>
          console.log(chalk.red(`  - ${i.message}${i.path ? ` (${i.path})` : ''}`))
        );
        console.log();
      }

      if (warns.length > 0) {
        console.log(chalk.yellow(`⚠️  Warnings (${warns.length})`));
        warns.forEach((i) =>
          console.log(
            chalk.yellow(`  - ${i.message}${i.path ? ` (${i.path})` : ''}`)
          )
        );
        console.log();
      }

      console.log(
        chalk.gray(
          `Tip: 에이전트용 JSON 출력: npx lee-spec-kit doctor --json${
            options.strict ? ' --strict' : ''
          }`
        )
      );
      console.log();

      process.exit(exitCode);
    });
}


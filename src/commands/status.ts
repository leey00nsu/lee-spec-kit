import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '../utils/config.js';
import { scanFeatures } from '../utils/context.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';

interface StatusOptions {
  write?: boolean;
  strict?: boolean;
}

interface FeatureInfo {
  id: string;
  name: string;
  repo: string;
  issue: string;
  status: string;
  progress: string;
  path: string;
}

export function statusCommand(program: Command): void {
  program
    .command('status')
    .description('Show feature status')
    .option('-w, --write', 'Write status.md file')
    .option('-s, --strict', 'Fail on missing/duplicate feature IDs')
    .action(async (options: StatusOptions) => {
      try {
        await runStatus(options);
      } catch (error) {
        console.error(chalk.red(tr(DEFAULT_LANG, 'cli', 'common.errorLabel')), error);
        process.exit(1);
      }
    });
}

async function runStatus(options: StatusOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    console.error(chalk.red(tr(DEFAULT_LANG, 'cli', 'common.errorLabel')));
    console.error(
      chalk.red(
        tr(DEFAULT_LANG, 'cli', 'common.docsNotFound')
      )
    );
    process.exit(1);
  }

  const { docsDir, projectType, projectName, lang } = config;
  const featuresDir = path.join(docsDir, 'features');

  const scan = await scanFeatures(config);
  const features: FeatureInfo[] = [];
  const idMap = new Map<string, string[]>();

  for (const f of scan.features) {
    if (!f.docs.specExists || !f.docs.tasksExists) continue;

    const id = f.id || 'UNKNOWN';
    const name = await getFeatureNameFromSpec(f.path, f.slug, f.folderName);
    const repo =
      projectType === 'fullstack'
        ? `${projectName ?? '{{projectName}}'}-${f.type === 'single' ? '' : f.type}`.replace(
            /-$/,
            ''
          )
        : projectName ?? '{{projectName}}';
    const issue = f.issueNumber ? `#${f.issueNumber}` : '-';

    const relPath = path.relative(docsDir, f.path);
    if (!idMap.has(id)) idMap.set(id, []);
    idMap.get(id)!.push(relPath);

    const total = f.tasks.total;
    const done = f.tasks.done;
    const doing = f.tasks.doing;
    const todo = f.tasks.todo;

    let status = 'TODO';
    if (total > 0 && done === total) status = 'DONE';
    else if (doing > 0) status = 'DOING';
    else if (todo > 0) status = 'TODO';
    else if (total === 0) status = 'NO_TASKS';

    features.push({
      id,
      name,
      repo,
      issue,
      status,
      progress: `${done}/${total}`,
      path: relPath,
    });
  }

  if (features.length === 0) {
    console.log(chalk.yellow(tr(lang, 'cli', 'status.noFeatures')));
    return;
  }

  // 중복 ID 확인
  if (options.strict) {
    const duplicates = [...idMap.entries()].filter(
      ([, paths]) => paths.length > 1
    );
    if (duplicates.length > 0) {
      console.error(chalk.red(tr(lang, 'cli', 'status.duplicateIds')));
      for (const [id, paths] of duplicates) {
        console.error(chalk.red(`  ${id}:`));
        for (const p of paths) {
          console.error(chalk.red(`    - ${p}`));
        }
      }
      process.exit(1);
    }

    const unknowns = [...idMap.entries()].filter(([id]) => id === "UNKNOWN");
    if (unknowns.length > 0) {
      console.error(chalk.red(tr(lang, 'cli', 'status.missingIds')));
      for (const [, paths] of unknowns) {
        for (const p of paths) {
          console.error(chalk.red(`  - ${p}`));
        }
      }
      process.exit(1);
    }
  }

  // 정렬
  features.sort((a, b) => a.id.localeCompare(b.id));

  // 테이블 출력
  const header = '| ID | Name | Repo | Issue | Status | Progress | Path |';
  const separator = '| --- | --- | --- | --- | --- | --- | --- |';

  console.log();
  console.log(header);
  console.log(separator);
  for (const f of features) {
    const statusColor =
      f.status === 'DONE'
        ? chalk.green
        : f.status === 'DOING'
          ? chalk.yellow
          : chalk.gray;
    console.log(
      `| ${f.id} | ${f.name} | ${f.repo} | ${f.issue} | ${statusColor(f.status)} | ${f.progress} | ${f.path} |`
    );
  }
  console.log();

  // 파일 쓰기
  if (options.write) {
    const outputPath = path.join(featuresDir, 'status.md');
    const date = new Date().toISOString().split('T')[0];

    const content = [
      '# Feature Status',
      '',
      `- Generated: ${date}`,
      '- Source: `tasks.md`, `spec.md`',
      '',
      header,
      separator,
      ...features.map(
        (f) =>
          `| ${f.id} | ${f.name} | ${f.repo} | ${f.issue} | ${f.status} | ${f.progress} | ${f.path} |`
      ),
      '',
    ].join('\n');

    await fs.writeFile(outputPath, content, 'utf-8');
    console.log(
      chalk.green(
        tr(lang, 'cli', 'status.wrote', { path: outputPath })
      )
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getFeatureNameFromSpec(
  featureDir: string,
  fallbackSlug: string,
  fallbackFolderName: string
): Promise<string> {
  try {
    const specPath = path.join(featureDir, 'spec.md');
    if (!(await fs.pathExists(specPath))) return fallbackSlug;
    const content = await fs.readFile(specPath, 'utf-8');

    const keys = ['기능명', 'Feature Name'];
    for (const key of keys) {
      const regex = new RegExp(
        `^\\s*-\\s*\\*\\*${escapeRegExp(key)}\\*\\*\\s*:\\s*(.*)$`,
        'm'
      );
      const match = content.match(regex);
      const value = match?.[1]?.trim();
      if (value) return value;
    }
  } catch {
    // ignore
  }
  return fallbackSlug || fallbackFolderName;
}

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '../utils/config.js';
import { scanFeatures } from '../utils/context.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { getLocalDateString } from '../utils/date.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

interface StatusOptions {
  json?: boolean;
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
  implementationDone: boolean;
  workflowDone: boolean;
}

export function statusCommand(program: Command): void {
  program
    .command('status')
    .description('Show feature status')
    .option('--json', 'Output in JSON format for agents')
    .option('-w, --write', 'Write status.md file')
    .option('-s, --strict', 'Fail on missing/duplicate feature IDs')
    .action(async (options: StatusOptions) => {
      try {
        await runStatus(options);
      } catch (error) {
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        console.error(
          chalk.red(tr(lang, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        printCliErrorSuggestions(suggestions, lang);
        process.exit(1);
      }
    });
}

async function runStatus(options: StatusOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  const { docsDir, projectType, projectName, lang } = config;
  const featuresDir = path.join(docsDir, 'features');

  const scan = await scanFeatures(config);
  const features: FeatureInfo[] = [];
  const idMap = new Map<string, string[]>();

  for (const f of scan.features) {
    const id = f.id || 'UNKNOWN';
    const relPath = path.relative(docsDir, f.path);
    if (!idMap.has(id)) idMap.set(id, []);
    idMap.get(id)!.push(relPath);

    if (!f.docs.specExists || !f.docs.tasksExists) continue;

    const name = await getFeatureNameFromSpec(f.path, f.slug, f.folderName);
    const repo =
      projectType === 'multi'
        ? `${projectName ?? '{{projectName}}'}-${f.type}`
        : projectName ?? '{{projectName}}';
    const issue = f.issueNumber ? `#${f.issueNumber}` : '-';

    const total = f.tasks.total;
    const done = f.tasks.done;
    const doing = f.tasks.doing;
    const todo = f.tasks.todo;

    let status = 'TODO';
    if (f.completion.workflowDone) status = 'WORKFLOW_DONE';
    else if (total > 0 && done === total) status = 'DONE';
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
      implementationDone: f.completion.implementationDone,
      workflowDone: f.completion.workflowDone,
    });
  }

  // 중복 ID 확인
  if (options.strict) {
    const unknowns = [...idMap.entries()].filter(([id]) => id === 'UNKNOWN');
    if (unknowns.length > 0) {
      const missingPaths = unknowns.flatMap(([, paths]) => paths).join(', ');
      throw createCliError(
        'MISSING_FEATURE_ID',
        `${tr(lang, 'cli', 'status.missingIds')} ${missingPaths}`
      );
    }

    const duplicates = [...idMap.entries()].filter(
      ([id, paths]) => id !== 'UNKNOWN' && paths.length > 1
    );
    if (duplicates.length > 0) {
      const duplicateIds = duplicates.map(([id]) => id).join(', ');
      throw createCliError(
        'DUPLICATE_FEATURE_ID',
        `${tr(lang, 'cli', 'status.duplicateIds')} ${duplicateIds}`
      );
    }
  }

  // JSON 출력
  if (options.json) {
    const payload = {
      status: 'ok',
      reasonCode: features.length === 0 ? 'NO_FEATURES' : 'FEATURES_LISTED',
      counts: {
        features: features.length,
        workflowDone: features.filter((f) => f.workflowDone).length,
        implementationDone: features.filter((f) => f.implementationDone).length,
      },
      features: [...features].sort((a, b) => a.id.localeCompare(b.id)),
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (features.length === 0) {
    console.log(chalk.yellow(tr(lang, 'cli', 'status.noFeatures')));
    return;
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
      f.status === 'WORKFLOW_DONE'
        ? chalk.green
        : f.status === 'DONE'
          ? chalk.cyan
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
    const date = getLocalDateString();

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

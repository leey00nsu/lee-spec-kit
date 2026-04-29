import fs from 'fs-extra';
import chalk from 'chalk';
import { Command } from 'commander';
import { DEFAULT_LANG } from '../utils/i18n.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import {
  collectRepeatableOption,
  findNextSecondLevelHeadingIndex,
  findSecondLevelHeadingIndex,
  findTaskInsertIndex,
  localDate,
  nextTaskSequence,
  normalizeMarkdownEnd,
  normalizeRequiredItems,
  normalizeRequiredText,
  resolveFeatureDocTarget,
} from '../utils/doc-mutation.js';

interface TaskAddOptions {
  component?: string;
  title: string;
  ref: string;
  acceptance?: string[];
  check?: string[];
  json?: boolean;
}

function normalizeTaskRef(value: string | undefined): string {
  const ref = normalizeRequiredText(value, '--ref').toUpperCase();
  if (ref === 'NON-PRD') return ref;
  if (!/^PRD-[A-Z0-9][A-Z0-9-]*$/.test(ref)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--ref` must be `NON-PRD` or a `PRD-*` requirement key.'
    );
  }
  return ref;
}

function formatTaskBlock(input: {
  ref: string;
  taskId: string;
  title: string;
  date: string;
  acceptanceItems: string[];
  checklistItems: string[];
}): string[] {
  return [
    `- [TODO][${input.ref}] ${input.taskId} ${input.title}`,
    `  - Date: ${input.date}`,
    '  - Acceptance:',
    ...input.acceptanceItems.map((item) => `    - ${item}`),
    '  - Checklist:',
    ...input.checklistItems.map((item) => `    - [ ] ${item}`),
  ];
}

async function runTaskAdd(
  featureName: string | undefined,
  options: TaskAddOptions
): Promise<void> {
  const target = await resolveFeatureDocTarget({
    cwd: process.cwd(),
    selector: featureName,
    component: options.component,
    fileName: 'tasks.md',
  });
  const title = normalizeRequiredText(options.title, '--title');
  const ref = normalizeTaskRef(options.ref);
  const acceptanceItems = normalizeRequiredItems(options.acceptance, '--acceptance');
  const checklistItems = normalizeRequiredItems(options.check, '--check');
  const content = await fs.readFile(target.path, 'utf-8');
  const lines = content.split('\n');
  const taskListIndex = findSecondLevelHeadingIndex(lines, ['Task List', '태스크 목록']);
  if (taskListIndex < 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      'tasks.md is missing a `Task List` section.'
    );
  }

  const sectionEnd = findNextSecondLevelHeadingIndex(lines, taskListIndex);
  const insertIndex = findTaskInsertIndex(lines, taskListIndex + 1, sectionEnd);
  const taskId = `T-${target.feature.folderName}-${String(
    nextTaskSequence(content, target.feature.folderName)
  ).padStart(2, '0')}`;
  const recordedAt = localDate();
  const block = formatTaskBlock({
    ref,
    taskId,
    title,
    date: recordedAt,
    acceptanceItems,
    checklistItems,
  });

  const shouldPrefixBlank =
    insertIndex > taskListIndex + 1 && (lines[insertIndex - 1] || '').trim() !== '';
  const shouldSuffixBlank =
    insertIndex < lines.length && (lines[insertIndex] || '').trim() !== '';
  lines.splice(
    insertIndex,
    0,
    ...(shouldPrefixBlank ? [''] : []),
    ...block,
    ...(shouldSuffixBlank ? [''] : [])
  );
  await fs.writeFile(target.path, normalizeMarkdownEnd(lines.join('\n')), 'utf-8');

  const payload = {
    status: 'ok',
    reasonCode: 'TASK_ADDED',
    feature: target.feature.folderName,
    taskId,
    title,
    ref,
    tasksUpdated: true,
    tasksPath: target.path,
    recordedAt,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.green(`Added task ${taskId} to ${target.feature.folderName}.`));
  console.log(chalk.gray(`- tasks.md updated: ${target.path}`));
}

export function taskCommand(program: Command): void {
  const task = program
    .command('task')
    .description('Patch feature task docs');

  task
    .command('add [feature-name]')
    .description('Append a docs-only task block to tasks.md')
    .requiredOption('--title <title>', 'Task title')
    .requiredOption('--ref <ref>', 'Requirement ref: NON-PRD or PRD-* key')
    .option(
      '--acceptance <text>',
      'Concrete acceptance item. Repeat to add more than one.',
      collectRepeatableOption,
      []
    )
    .option(
      '--check <text>',
      'Concrete checklist item. Repeat to add more than one.',
      collectRepeatableOption,
      []
    )
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON')
    .action(async (featureName: string | undefined, options: TaskAddOptions) => {
      try {
        await runTaskAdd(featureName, options);
      } catch (error) {
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, DEFAULT_LANG);
        if (options.json) {
          console.log(
            JSON.stringify({
              status: 'error',
              reasonCode: cliError.code,
              error: cliError.message,
              suggestions,
            })
          );
          process.exitCode = 1;
          return;
        }
        console.error(chalk.red(`[${cliError.code}] ${cliError.message}`));
        printCliErrorSuggestions(suggestions, DEFAULT_LANG);
        process.exitCode = 1;
      }
    });
}

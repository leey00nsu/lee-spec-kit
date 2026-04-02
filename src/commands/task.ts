import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { Command } from 'commander';
import { createCliContext } from '../utils/cli-context.js';
import { resolveContextSelection } from '../utils/context-selection.js';
import { resolveComponentOption } from '../utils/context/component-option.js';
import { DEFAULT_LANG } from '../utils/i18n.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import {
  isNonPrdTag,
  isPrdRequirementId,
  scanPrdRequirements,
} from '../utils/requirements.js';
import { getLocalDateString } from '../utils/date.js';
import { parseTaskLine } from '../utils/task-lines.js';

interface TaskAddOptions {
  component?: string;
  title: string;
  ref: string;
  json?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTaskListHeadingIndex(lines: string[]): number {
  return lines.findIndex((line) => /^\s*##\s+(Task List|태스크 목록)\s*$/.test(line));
}

function findNextSectionHeadingIndex(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*##\s+/.test(lines[i] || '')) return i;
  }
  return lines.length;
}

function findTaskInsertIndex(
  lines: string[],
  sectionStart: number,
  sectionEnd: number
): number {
  let lastTaskIndex = -1;
  for (let i = sectionStart; i < sectionEnd; i += 1) {
    if (parseTaskLine(lines[i] || '', i)) lastTaskIndex = i;
  }

  if (lastTaskIndex < 0) return sectionEnd;

  let insertIndex = lastTaskIndex + 1;
  while (insertIndex < sectionEnd) {
    const line = lines[insertIndex] || '';
    if (parseTaskLine(line, insertIndex)) break;
    if (/^\s{2,}\S/.test(line) || /^\s*$/.test(line)) {
      insertIndex += 1;
      continue;
    }
    break;
  }
  return insertIndex;
}

function normalizeTaskRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--ref` is required. Use `NON-PRD` or an existing `PRD-...` requirement ID.'
    );
  }

  if (isNonPrdTag(trimmed)) return 'NON-PRD';

  const normalized = trimmed.toUpperCase();
  if (!isPrdRequirementId(normalized)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--ref` must be `NON-PRD` or an existing `PRD-FR-001`-style requirement ID.'
    );
  }

  return normalized;
}

function getNextTaskSequence(content: string, featureFolderName: string): number {
  const taskIdPattern = new RegExp(
    `\\bT-${escapeRegExp(featureFolderName)}-(\\d+)\\b`,
    'g'
  );

  let max = 0;
  for (const match of content.matchAll(taskIdPattern)) {
    const numeric = Number(match[1] || '0');
    if (Number.isFinite(numeric) && numeric > max) max = numeric;
  }

  return max + 1;
}

function formatTaskBlock(input: {
  ref: string;
  taskId: string;
  title: string;
  recordedAt: string;
}): string[] {
  return [
    `- [TODO][${input.ref}] ${input.taskId} ${input.title}`,
    `  - Date: ${input.recordedAt}`,
    '  - Acceptance:',
    '    - -',
    '  - Checklist:',
    '    - [ ] -',
  ];
}

async function resolveTaskFeature(
  featureName: string | undefined,
  component: string | undefined
) {
  const ctx = await createCliContext({ cwd: process.cwd() });
  if (!ctx) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'No lee-spec-kit config found in this workspace.'
    );
  }

  const state = await resolveContextSelection(ctx, featureName, {
    component: resolveComponentOption(component),
  });

  if (state.status !== 'single_matched' || !state.matchedFeature) {
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'task add requires a single matched feature. Pass <feature-name> explicitly.'
    );
  }

  return {
    ctx,
    feature: state.matchedFeature,
  };
}

async function runTaskAdd(
  featureName: string | undefined,
  options: TaskAddOptions
): Promise<void> {
  const { ctx, feature } = await resolveTaskFeature(featureName, options.component);
  const title = options.title.trim();
  if (!title) {
    throw createCliError('INVALID_ARGUMENT', '`--title` must not be empty.');
  }

  const ref = normalizeTaskRef(options.ref);
  if (isPrdRequirementId(ref)) {
    const { definitions } = await scanPrdRequirements(ctx.fs, ctx.config.docsDir);
    if (!definitions.has(ref)) {
      throw createCliError(
        'PRECONDITION_FAILED',
        `Requirement "${ref}" is not defined in docs/prd or the upstream requirements doc.`
      );
    }
  }

  const tasksPath = path.join(feature.path, 'tasks.md');
  if (!(await fs.pathExists(tasksPath))) {
    throw createCliError(
      'PRECONDITION_FAILED',
      `tasks.md not found for feature: ${feature.folderName}`
    );
  }

  const content = await fs.readFile(tasksPath, 'utf-8');
  const lines = content.split('\n');
  const taskListHeadingIndex = findTaskListHeadingIndex(lines);
  if (taskListHeadingIndex < 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      'tasks.md is missing a `Task List` section.'
    );
  }

  const nextSectionHeadingIndex = findNextSectionHeadingIndex(
    lines,
    taskListHeadingIndex
  );
  const taskId = `T-${feature.folderName}-${String(
    getNextTaskSequence(content, feature.folderName)
  ).padStart(2, '0')}`;
  const insertIndex = findTaskInsertIndex(
    lines,
    taskListHeadingIndex + 1,
    nextSectionHeadingIndex
  );
  const recordedAt = getLocalDateString();
  const blockLines = formatTaskBlock({ ref, taskId, title, recordedAt });

  const shouldPrefixBlank =
    insertIndex > taskListHeadingIndex + 1 &&
    (lines[insertIndex - 1] || '').trim() !== '';
  const shouldSuffixBlank =
    insertIndex < lines.length && (lines[insertIndex] || '').trim() !== '';

  const insertLines = [
    ...(shouldPrefixBlank ? [''] : []),
    ...blockLines,
    ...(shouldSuffixBlank ? [''] : []),
  ];

  lines.splice(insertIndex, 0, ...insertLines);
  await fs.writeFile(tasksPath, lines.join('\n'), 'utf-8');

  const payload = {
    status: 'ok',
    reasonCode: 'TASK_ADDED',
    feature: feature.folderName,
    taskId,
    title,
    ref,
    tasksUpdated: true,
    tasksPath,
    recordedAt,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.green(`Added task ${taskId} to ${feature.folderName}.`));
  console.log(chalk.gray(`- ref: ${ref}`));
  console.log(chalk.gray(`- tasks.md updated: ${tasksPath}`));
}

export function taskCommand(program: Command): void {
  const task = program.command('task').description('Manage tasks');

  task
    .command('add [feature-name]')
    .description('Append a new task to the end of Task List')
    .requiredOption('--title <title>', 'Task title')
    .requiredOption('--ref <ref>', 'Requirement ref: NON-PRD or PRD-FR-001')
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON')
    .action(async (featureName: string | undefined, options: TaskAddOptions) => {
      try {
        await runTaskAdd(featureName, options);
      } catch (error) {
        const ctx = await createCliContext({ cwd: process.cwd() });
        const lang = ctx?.config?.lang ?? DEFAULT_LANG;
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
          process.exitCode = 1;
          return;
        }

        console.error(chalk.red(`[${cliError.code}] ${cliError.message}`));
        printCliErrorSuggestions(suggestions, lang);
        process.exitCode = 1;
      }
    });
}

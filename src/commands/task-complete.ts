import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { Command } from 'commander';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG } from '../utils/i18n.js';
import { resolveContextSelection } from '../utils/context-selection.js';
import { createCliContext } from '../utils/cli-context.js';
import { resolveComponentOption } from '../utils/context/component-option.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { getLocalDateString } from '../utils/date.js';

interface TaskCompleteOptions {
  component?: string;
  task?: string;
  json?: boolean;
}

interface ResolvedTaskLine {
  index: number;
  raw: string;
  status: 'TODO' | 'DOING' | 'DONE' | 'REVIEW';
  taskId: string;
  title: string;
}

function parseTaskLine(line: string): ResolvedTaskLine | null {
  const match = line.match(
    /^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\]\[[^\]]+\](?:\[[^\]]+\])*\s+(T-[A-Za-z0-9-]+)\s+(.+?)\s*$/
  );
  if (!match) return null;
  return {
    index: -1,
    raw: line,
    status: match[1] as ResolvedTaskLine['status'],
    taskId: match[2],
    title: match[3],
  };
}

function setTaskStatus(line: ResolvedTaskLine, nextStatus: 'DONE'): string {
  return line.raw.replace(
    /^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\]/,
    `- [${nextStatus}]`
  );
}

async function resolveTaskCompleteContext(
  featureName: string | undefined,
  options: TaskCompleteOptions
): Promise<{
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>;
  feature: NonNullable<
    Awaited<ReturnType<typeof resolveContextSelection>>['matchedFeature']
  >;
}> {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'No lee-spec-kit config found in this workspace.'
    );
  }

  const ctx = (await createCliContext({ cwd: process.cwd() }))!;
  const state = await resolveContextSelection(ctx, featureName, {
    component: resolveComponentOption(options.component),
  });
  if (state.status !== 'single_matched' || !state.matchedFeature) {
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'task-complete requires a single matched feature. Pass <feature-name> explicitly.'
    );
  }

  return {
    config,
    feature: state.matchedFeature,
  };
}

async function runTaskComplete(
  featureName: string | undefined,
  options: TaskCompleteOptions
): Promise<void> {
  const { feature } = await resolveTaskCompleteContext(featureName, options);
  const tasksPath = path.join(feature.path, 'tasks.md');
  if (!(await fs.pathExists(tasksPath))) {
    throw createCliError(
      'PRECONDITION_FAILED',
      `tasks.md not found for feature: ${feature.folderName}`
    );
  }

  const content = await fs.readFile(tasksPath, 'utf-8');
  const lines = content.split('\n');
  const requestedTaskId =
    options.task?.trim() || feature.activeTask?.id || feature.nextTodoTask?.id;
  if (!requestedTaskId) {
    throw createCliError(
      'PRECONDITION_FAILED',
      'No active task is available for task-complete.'
    );
  }

  const resolvedTask = lines
    .map((line, index) => {
      const parsed = parseTaskLine(line);
      return parsed ? { ...parsed, index } : null;
    })
    .find((entry) => entry?.taskId === requestedTaskId);

  if (!resolvedTask) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Task "${requestedTaskId}" was not found in tasks.md.`
    );
  }

  if (resolvedTask.status === 'DONE') {
    throw createCliError(
      'PRECONDITION_FAILED',
      `Task "${requestedTaskId}" is already DONE.`
    );
  }

  if (resolvedTask.status !== 'DOING' && resolvedTask.status !== 'REVIEW') {
    throw createCliError(
      'PRECONDITION_FAILED',
      `Task "${requestedTaskId}" must be DOING/REVIEW before marking it DONE.`
    );
  }

  lines[resolvedTask.index] = setTaskStatus(resolvedTask, 'DONE');
  await fs.writeFile(tasksPath, lines.join('\n'), 'utf-8');

  const payload = {
    status: 'ok',
    reasonCode: 'TASK_COMPLETED',
    feature: feature.folderName,
    taskId: resolvedTask.taskId,
    title: resolvedTask.title,
    previousStatus: resolvedTask.status,
    nextStatus: 'DONE',
    substateId: 'task_complete',
    owner: 'main',
    nextMainState: 'task_finalize',
    tasksUpdated: true,
    tasksPath,
    recordedAt: getLocalDateString(),
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(
    chalk.green(
      `Marked task ${resolvedTask.taskId} as DONE for ${feature.folderName}.`
    )
  );
  console.log(chalk.gray(`- tasks.md updated: ${tasksPath}`));
  console.log(chalk.gray(`- status: ${resolvedTask.status} -> DONE`));
  console.log(chalk.gray(`- next main state: ${payload.nextMainState}`));
}

export function taskCompleteCommand(program: Command): void {
  program
    .command('task-complete [feature-name]')
    .description('Mark the active DOING/REVIEW task as DONE')
    .option('--component <component>', 'Component name for multi projects')
    .option('--task <task-id>', 'Explicit task id to mark DONE')
    .option('--json', 'Output JSON')
    .action(
      async (featureName: string | undefined, options: TaskCompleteOptions) => {
        try {
          await runTaskComplete(featureName, options);
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
            console.error(chalk.red(`[${cliError.code}] ${cliError.message}`));
            printCliErrorSuggestions(suggestions, lang);
          }
          process.exitCode = 1;
        }
      }
    );
}

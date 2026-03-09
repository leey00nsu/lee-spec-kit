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

interface TaskRunOptions {
  component?: string;
  task?: string;
  json?: boolean;
}

interface ResolvedTaskLine {
  index: number;
  raw: string;
  status: 'TODO' | 'DOING' | 'DONE' | 'REVIEW';
  priority: string;
  taskId: string;
  title: string;
}

function parseTaskLine(line: string): ResolvedTaskLine | null {
  const match = line.match(
    /^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\]\[([^\]]+)\](?:\[[^\]]+\])*\s+(T-[A-Za-z0-9-]+)\s+(.+?)\s*$/
  );
  if (!match) return null;
  return {
    index: -1,
    raw: line,
    status: match[1] as ResolvedTaskLine['status'],
    priority: match[2],
    taskId: match[3],
    title: match[4],
  };
}

function buildTaskRunPrompt(input: {
  featureRef: string;
  taskId: string;
  title: string;
  mode: 'start' | 'continue';
  lang: 'ko' | 'en';
}): string {
  const shared = [
    'Read `spec.md`, `plan.md`, and `tasks.md` before editing code.',
    'Use sub-agents by default for code analysis and discovery work.',
    'Parallelize impact analysis, test-location search, and existing-pattern discovery when those can be done independently.',
    'Keep one writer for overlapping files; do not let multiple sub-agents edit the same files concurrently.',
    'Update the assigned task status and verification notes in `tasks.md` before leaving this task.',
    'Mark the task `DONE` only after code changes and verification are complete.',
  ];

  if (input.lang === 'ko') {
    return [
      `${input.mode === 'start' ? '새 task 실행용 handoff를 준비하세요.' : '진행 중인 task handoff를 이어가세요.'}`,
      `- Feature: ${input.featureRef}`,
      `- Task: ${input.taskId} ${input.title}`,
      input.mode === 'start'
        ? '- 이 명령은 `tasks.md`의 현재 task를 `DOING`으로 바꾸고, 이후 구현 handoff prompt를 준비합니다.'
        : '- 이 명령은 진행 중 task의 구현 handoff prompt를 다시 준비합니다.',
      '- 먼저 `spec.md`, `plan.md`, `tasks.md`를 읽고 범위와 완료 기준을 정리하세요.',
      '- 코드 분석과 탐색 작업은 기본적으로 서브에이전트를 사용하세요.',
      '- 영향 범위 분석, 테스트 위치 탐색, 기존 패턴 조사처럼 독립적인 분석은 병렬로 수행하세요.',
      '- 같은 파일군을 수정하는 작성자는 한 명만 두세요.',
      '- 이 task를 마치기 전 `tasks.md`에 상태와 검증 메모를 반영하세요.',
      '- 코드 변경과 검증이 끝났을 때만 task를 `DONE`으로 표시하세요.',
    ].join('\n');
  }

  return [
    input.mode === 'start'
      ? 'Prepare the handoff for this task execution.'
      : 'Prepare the handoff for this in-progress task.',
    `- Feature: ${input.featureRef}`,
    `- Task: ${input.taskId} ${input.title}`,
    `- ${
      input.mode === 'start'
        ? 'This command marks the current task as DOING in tasks.md, then prepares the implementation handoff prompt.'
        : 'This command prepares the implementation handoff prompt again for the in-progress task.'
    }`,
    ...shared.map((line) => `- ${line}`),
  ].join('\n');
}

function setTaskStatus(
  line: ResolvedTaskLine,
  nextStatus: 'DOING' | 'DONE'
): string {
  return line.raw.replace(
    /^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\]/,
    `- [${nextStatus}]`
  );
}

async function resolveTaskRunContext(
  featureName: string | undefined,
  options: TaskRunOptions
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
      'task-run requires a single matched feature. Pass <feature-name> explicitly.'
    );
  }

  return {
    config,
    feature: state.matchedFeature,
  };
}

async function runTaskRun(
  featureName: string | undefined,
  options: TaskRunOptions
): Promise<void> {
  const { config, feature } = await resolveTaskRunContext(featureName, options);
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
      'No active or next TODO task is available for task-run.'
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

  const mode = resolvedTask.status === 'TODO' ? 'start' : 'continue';
  let tasksUpdated = false;
  if (resolvedTask.status === 'TODO') {
    lines[resolvedTask.index] = setTaskStatus(resolvedTask, 'DOING');
    await fs.writeFile(tasksPath, lines.join('\n'), 'utf-8');
    tasksUpdated = true;
  }

  const prompt = buildTaskRunPrompt({
    featureRef: feature.folderName,
    taskId: resolvedTask.taskId,
    title: resolvedTask.title,
    mode,
    lang: config.lang,
  });

  const payload = {
    status: 'ready',
    reasonCode: 'TASK_RUN_READY',
    feature: feature.folderName,
    taskId: resolvedTask.taskId,
    title: resolvedTask.title,
    mode,
    substateId: mode === 'start' ? 'task_run' : 'task_running',
    owner: 'subagent',
    nextMainState: 'task_finalize',
    tasksUpdated,
    tasksPath,
    prompt,
    recordedAt: getLocalDateString(),
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(prompt);
  console.log();
  console.log(chalk.gray(`- substate: ${payload.substateId}`));
  console.log(chalk.gray(`- owner: ${payload.owner}`));
  console.log(chalk.gray(`- next main state: ${payload.nextMainState}`));
  if (tasksUpdated) {
    console.log();
    console.log(chalk.gray(`- tasks.md updated: ${tasksPath}`));
    console.log(chalk.gray(`- task status: TODO -> DOING`));
  }
}

export function taskRunCommand(program: Command): void {
  program
    .command('task-run [feature-name]')
    .description(
      'Prepare task execution handoff for sub-agent work (marks TODO tasks as DOING)'
    )
    .option('--component <component>', 'Component name for multi projects')
    .option('--task <task-id>', 'Explicit task id to execute')
    .option('--json', 'Output JSON')
    .action(async (featureName: string | undefined, options: TaskRunOptions) => {
      try {
        await runTaskRun(featureName, options);
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
    });
}

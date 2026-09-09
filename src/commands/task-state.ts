import { getConfig } from '../utils/config.js';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import type { Command } from 'commander';
import { resolveFeatureDocTarget } from '../utils/doc-mutation.js';
import { getRepositoryLockPath, withFileLock } from '../utils/lock.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import {
  parseTaskLine,
  parseTaskChecklist,
  type TaskStatus,
} from '../utils/task-lines.js';
import { collectWorkflowStage } from '../utils/workflow-stage.js';
import { runGitCapture } from '../utils/git-run.js';

interface Options {
  component?: string;
  owner?: string;
  session?: string;
  expectedHash?: string;
  from?: TaskStatus;
  to?: TaskStatus;
  json?: boolean;
}
const hash = (content: string): string =>
  createHash('sha256').update(content).digest('hex');

export function taskStateCommands(task: Command): void {
  for (const action of ['status', 'claim', 'release', 'transition'] as const) {
    task
      .command(
        `${action} <feature> ${action === 'transition' ? '<task-id>' : ''}`.trim()
      )
      .description(
        `${action} the Feature task session with optimistic document validation`
      )
      .option('--component <component>')
      .option('--owner <owner>', 'Feature owner; defaults to git user.email')
      .option('--session <session>', 'Explicit session token from task claim')
      .option('--expected-hash <hash>', 'tasks.md SHA-256 from task status')
      .option('--from <state>', 'Expected TODO, DOING, REVIEW, or DONE')
      .option('--to <state>', 'Requested TODO, DOING, REVIEW, or DONE')
      .option('--json')
      .action(async (...args: unknown[]) => {
        const feature = args[0] as string;
        const taskId =
          action === 'transition' ? (args[1] as string) : undefined;
        const options = args[action === 'transition' ? 2 : 1] as Options;
        try {
          const target = await resolveFeatureDocTarget({
            cwd: process.cwd(),
            selector: feature,
            component: options.component,
            fileName: 'tasks.md',
          });
          const sessionPath = path.join(
            path.dirname(
              getRepositoryLockPath(target.feature.git.docsGitCwd, 'sessions')
            ),
            `session-${hash(`${target.feature.type}:${target.feature.id}`)}.json`
          );
          const result = await withFileLock(
            getRepositoryLockPath(
              target.feature.git.docsGitCwd,
              `feature-${hash(`${target.feature.type}:${target.feature.id}`)}`
            ),
            async () => {
              const content = await fs.readFile(target.path, 'utf8');
              const metadataPath = path.join(
                target.feature.path,
                '.feature.json'
              );
              const metadata = (await fs.pathExists(metadataPath))
                ? await fs.readJson(metadataPath)
                : null;
              const session = (await fs.pathExists(sessionPath))
                ? await fs.readJson(sessionPath)
                : null;
              if (action === 'status')
                return {
                  hash: hash(content),
                  owner: metadata?.owner ?? null,
                  claimed: !!session,
                  tasksPath: target.path,
                };
              const owner =
                options.owner?.trim() ||
                runGitCapture(
                  ['config', 'user.email'],
                  target.feature.git.projectGitCwd
                );
              if (!owner || (metadata?.owner && metadata.owner !== owner)) {
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'Feature owner mismatch. Transfer ownership explicitly in .feature.json before claiming.'
                );
              }
              if (action === 'claim') {
                if (
                  session &&
                  (session.owner !== owner || session.token !== options.session)
                ) {
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    'Feature already has an active session. Release it using its token before handoff.'
                  );
                }
                const next = session || {
                  owner,
                  token: randomUUID(),
                  createdAt: new Date().toISOString(),
                };
                await fs.outputJson(sessionPath, next, { spaces: 2 });
                if (metadata && !metadata.owner)
                  await fs.writeJson(
                    metadataPath,
                    { ...metadata, owner },
                    { spaces: 2 }
                  );
                return { session: next.token, owner, hash: hash(content) };
              }
              if (
                !session ||
                session.owner !== owner ||
                session.token !== options.session
              ) {
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'The active owner and session token are required.'
                );
              }
              if (action === 'release') {
                await fs.remove(sessionPath);
                return { released: true };
              }
              if (options.expectedHash !== hash(content)) {
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'tasks.md changed since it was read. Read task status and retry against the new hash.'
                );
              }
              const lines = content.split('\n');
              let fence = false;
              const tasks = lines.flatMap((line, index) => {
                if (/^\s*(```|~~~)/.test(line)) {
                  fence = !fence;
                  return [];
                }
                const parsed = fence ? null : parseTaskLine(line, index);
                return parsed ? [parsed] : [];
              });
              const matches = tasks.filter((entry) => entry.taskId === taskId);
              if (matches.length !== 1 || matches[0].status !== options.from) {
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'Expected exactly one task in the --from state.'
                );
              }
              const selected = matches[0];
              const allowed: Record<TaskStatus, TaskStatus[]> = {
                TODO: ['DOING'],
                DOING: ['REVIEW', 'DONE'],
                REVIEW: ['DOING', 'DONE'],
                DONE: [],
              };
              if (
                !options.to ||
                !allowed[selected.status].includes(options.to)
              ) {
                throw createCliError(
                  'INVALID_ARGUMENT',
                  'Invalid task state transition.'
                );
              }
              if (
                tasks.some(
                  (entry) =>
                    entry.taskId !== taskId &&
                    ['DOING', 'REVIEW'].includes(entry.status)
                )
              ) {
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'Another task is active in this Feature.'
                );
              }
              const stage = await collectWorkflowStage(
                process.cwd(),
                feature,
                options.component
              );
              const reviewEnabled = (await getConfig(process.cwd()))?.workflow?.agentReview?.task?.enabled === true;
              if (options.to === 'REVIEW' && !reviewEnabled) {
                throw createCliError('PRECONDITION_FAILED', 'Task review is disabled; complete the task with DONE.');
              }
              if (options.to === 'DONE' && selected.status === 'REVIEW' && reviewEnabled) {
                if (
                  stage.nextAction?.category !== 'task_review_complete' ||
                  stage.nextAction.taskId !== taskId
                ) {
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    'The exact task review must complete before DONE.'
                  );
                }
              } else if (
                !stage.implementationAllowed ||
                (stage.nextAction?.taskId && stage.nextAction.taskId !== taskId)
              ) {
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'The workflow does not allow this task transition.'
                );
              }
              if (
                options.to === 'DONE' &&
                selected.status === 'DOING' &&
                reviewEnabled
              ) {
                throw createCliError(
                  'PRECONDITION_FAILED',
                  'Task review is required; transition to REVIEW first.'
                );
              }
              if (['REVIEW', 'DONE'].includes(options.to)) {
                const checklist = parseTaskChecklist(lines, selected.index);
                if (
                  !checklist?.total ||
                  checklist.unchecked ||
                  checklist.placeholderCount
                ) {
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    'Complete the task checklist before finishing implementation.'
                  );
                }
              }
              lines[selected.index] = selected.raw.replace(
                `[${selected.status}]`,
                `[${options.to}]`
              );
              const updated = lines.join('\n');
              const temporary = `${target.path}.${randomUUID()}.tmp`;
              try {
                await fs.writeFile(temporary, updated);
                // Protect against editors that do not participate in the CLI lock.
                if (
                  hash(await fs.readFile(target.path, 'utf8')) !==
                  options.expectedHash
                ) {
                  throw createCliError(
                    'PRECONDITION_FAILED',
                    'Concurrent document edit detected.'
                  );
                }
                await fs.rename(temporary, target.path);
              } finally {
                await fs.remove(temporary);
              }
              return {
                taskId,
                from: options.from,
                to: options.to,
                hash: hash(updated),
              };
            },
            { owner: `task ${action}` }
          );
          console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
        } catch (error) {
          const parsed = toCliError(error);
          console.log(
            JSON.stringify({
              status: 'error',
              reasonCode: parsed.code,
              error: parsed.message,
            })
          );
          process.exitCode = 1;
        }
      });
  }
}

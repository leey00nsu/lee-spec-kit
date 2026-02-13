import { FeatureState, Lang, NextAction, StepDefinition } from './types.js';
import { tr } from '../i18n.js';
import { ProjectConfig } from '../config.js';
import { execFileSync } from 'child_process';
import {
  resolvePrePrReviewPolicy,
  resolveTaskCommitGatePolicy,
  resolveWorkflowPolicy,
} from '../workflow.js';

function isCompletionChecklistDone(feature: FeatureState): boolean {
  return (
    !!feature.completionChecklist &&
    feature.completionChecklist.total > 0 &&
    feature.completionChecklist.checked === feature.completionChecklist.total
  );
}

function isTasksDocApproved(feature: FeatureState): boolean {
  return !feature.docs.tasksDocStatusFieldExists || feature.tasksDocStatus === 'Approved';
}

function isImplementationDone(feature: FeatureState): boolean {
  return (
    feature.docs.tasksExists &&
    feature.tasks.total > 0 &&
    feature.tasks.total === feature.tasks.done &&
    isCompletionChecklistDone(feature) &&
    isTasksDocApproved(feature)
  );
}

function isPrMetadataConfigured(feature: FeatureState): boolean {
  return feature.docs.prFieldExists && feature.docs.prStatusFieldExists;
}

function isPrePrReviewSatisfied(
  feature: FeatureState,
  prePrReviewPolicy: ReturnType<typeof resolvePrePrReviewPolicy>
): boolean {
  if (!prePrReviewPolicy.enabled) return true;
  if (!feature.docs.prePrReviewFieldExists || feature.prePrReview.status !== 'Done') {
    return false;
  }
  if (!feature.docs.prePrFindingsFieldExists || !feature.prePrReview.findings) {
    return false;
  }
  if (
    !feature.docs.prePrEvidenceFieldExists ||
    !feature.prePrReview.evidenceProvided
  ) {
    return false;
  }
  if (
    prePrReviewPolicy.blockOnFindings &&
    feature.prePrReview.findings.major > 0
  ) {
    return false;
  }
  if (
    prePrReviewPolicy.minorPolicy === 'block' &&
    feature.prePrReview.findings.minor > 0
  ) {
    return false;
  }
  return true;
}

function isFeatureDone(
  feature: FeatureState,
  workflowPolicy: ReturnType<typeof resolveWorkflowPolicy>,
  prePrReviewPolicy: ReturnType<typeof resolvePrePrReviewPolicy>
): boolean {
  return (
    feature.specStatus === 'Approved' &&
    feature.planStatus === 'Approved' &&
    !feature.git.docsHasUncommittedChanges &&
    !feature.git.projectHasUncommittedChanges &&
    feature.docs.tasksExists &&
    feature.tasks.total > 0 &&
    feature.tasks.total === feature.tasks.done &&
    isCompletionChecklistDone(feature) &&
    isTasksDocApproved(feature) &&
    (!workflowPolicy.requireIssue || !!feature.issueNumber) &&
    (!workflowPolicy.requirePr ||
      (isPrMetadataConfigured(feature) && !!feature.pr.link)) &&
    (!workflowPolicy.requireReview || feature.pr.status === 'Approved') &&
    isPrePrReviewSatisfied(feature, prePrReviewPolicy)
  );
}

function formatSkillList(skills: string[]): string {
  return skills.join(', ');
}

function getFindingsPolicyText(lang: Lang, blockOnFindings: boolean): string {
  return blockOnFindings
    ? tr(lang, 'messages', 'prePrReviewFindingsBlock')
    : tr(lang, 'messages', 'prePrReviewFindingsWarn');
}

function getMinorFindingsPolicyText(
  lang: Lang,
  minorPolicy: ReturnType<typeof resolvePrePrReviewPolicy>['minorPolicy']
): string {
  return minorPolicy === 'block'
    ? tr(lang, 'messages', 'prePrReviewMinorFindingsBlock')
    : tr(lang, 'messages', 'prePrReviewMinorFindingsWarn');
}

function normalizeCommitTopicText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toShellSafeCommitTopic(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
}

function resolveProjectCommitTopic(feature: FeatureState): string {
  const raw =
    feature.activeTask?.title ||
    feature.lastDoneTask?.title ||
    feature.nextTodoTask?.title ||
    feature.folderName;
  const withoutTaskId = normalizeCommitTopicText(raw).replace(
    /^T-[A-Za-z0-9-]+\s+/,
    ''
  );
  const topic = withoutTaskId || normalizeCommitTopicText(feature.folderName);
  return toShellSafeCommitTopic(topic);
}

interface TaskCommitGateCheck {
  pass: boolean;
  reason:
    | 'NO_TASKS_COMMIT'
    | 'TASKS_FILE_UNAVAILABLE'
    | 'MULTIPLE_DONE_TRANSITIONS'
    | 'MISMATCH_LAST_DONE';
  newDoneCount?: number;
}

function shouldBlockTaskCommitGate(
  policy: ReturnType<typeof resolveTaskCommitGatePolicy>,
  check: TaskCommitGateCheck
): boolean {
  if (policy !== 'strict') return false;
  // Keep strict mode simple: block only when a single tasks.md commit
  // appears to mark multiple tasks as DONE at once.
  if (check.reason === 'MULTIPLE_DONE_TRANSITIONS') {
    return (check.newDoneCount ?? 0) > 1;
  }
  return false;
}

function normalizeGitRelativePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

function toRepoRelativePath(cwd: string, relativePathFromCwd: string): string {
  const prefix = (readGitText(cwd, ['rev-parse', '--show-prefix']) || '')
    .trim()
    .replace(/\/+$/, '');
  if (!prefix) return normalizeGitRelativePath(relativePathFromCwd);
  return normalizeGitRelativePath(`${prefix}/${relativePathFromCwd}`);
}

function readGitText(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return undefined;
  }
}

function normalizeTaskTopic(value: string): string {
  return normalizeCommitTopicText(value).replace(/^T-[A-Za-z0-9-]+\s+/, '');
}

function parseDoneTaskTopicCounts(content: string): Map<string, number> {
  const counts = new Map<string, number>();
  const lines = content.split('\n');
  let inCodeBlock = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^\s*-\s*\[([A-Z]+)\]((?:\[[^\]]+\])*)\s*(.+?)\s*$/);
    if (!match) continue;
    if (match[1].toUpperCase() !== 'DONE') continue;

    const topic = normalizeTaskTopic(match[3] || '');
    if (!topic) continue;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return counts;
}

function checkTaskCommitGate(feature: FeatureState): TaskCommitGateCheck {
  const tasksPath = normalizeGitRelativePath(`${feature.docs.featurePathFromDocs}/tasks.md`);
  const docsGitCwd = feature.git.docsGitCwd;
  const repoTasksPath = toRepoRelativePath(docsGitCwd, tasksPath);

  const latestTasksCommit = (
    readGitText(docsGitCwd, ['rev-list', '-n', '1', 'HEAD', '--', tasksPath]) || ''
  ).trim();
  if (!latestTasksCommit) {
    return { pass: false, reason: 'NO_TASKS_COMMIT' };
  }

  const currentContent = readGitText(docsGitCwd, ['show', `${latestTasksCommit}:${repoTasksPath}`]);
  if (currentContent === undefined) {
    return { pass: false, reason: 'TASKS_FILE_UNAVAILABLE' };
  }

  const previousContent =
    readGitText(docsGitCwd, ['show', `${latestTasksCommit}^:${repoTasksPath}`]) || '';

  const currentDone = parseDoneTaskTopicCounts(currentContent);
  const previousDone = parseDoneTaskTopicCounts(previousContent);

  let newDoneCount = 0;
  for (const [topic, currentCount] of currentDone.entries()) {
    const previousCount = previousDone.get(topic) || 0;
    if (currentCount > previousCount) {
      newDoneCount += currentCount - previousCount;
    }
  }

  if (newDoneCount > 1) {
    return {
      pass: false,
      reason: 'MULTIPLE_DONE_TRANSITIONS',
      newDoneCount,
    };
  }

  if (newDoneCount === 1) {
    const lastDoneTopic = normalizeTaskTopic(feature.lastDoneTask?.title || '');
    if (lastDoneTopic) {
      const previousCount = previousDone.get(lastDoneTopic) || 0;
      const currentCount = currentDone.get(lastDoneTopic) || 0;
      if (currentCount <= previousCount) {
        return { pass: false, reason: 'MISMATCH_LAST_DONE', newDoneCount };
      }
    }
  }

  return { pass: true, reason: 'MULTIPLE_DONE_TRANSITIONS', newDoneCount };
}

function getTaskCommitGateReasonText(
  lang: Lang,
  check: TaskCommitGateCheck
): string {
  switch (check.reason) {
    case 'NO_TASKS_COMMIT':
      return tr(lang, 'messages', 'taskCommitGateReasonNoTasksCommit');
    case 'TASKS_FILE_UNAVAILABLE':
      return tr(lang, 'messages', 'taskCommitGateReasonTasksFileUnavailable');
    case 'MISMATCH_LAST_DONE':
      return tr(lang, 'messages', 'taskCommitGateReasonMismatchLastDone');
    case 'MULTIPLE_DONE_TRANSITIONS':
    default:
      return tr(lang, 'messages', 'taskCommitGateReasonDoneCount', {
        count: check.newDoneCount ?? 0,
      });
  }
}

export function getStepDefinitions(
  lang: Lang,
  workflow?: ProjectConfig['workflow']
): StepDefinition[] {
  const workflowPolicy = resolveWorkflowPolicy(workflow);
  const prePrReviewPolicy = resolvePrePrReviewPolicy(workflow);
  const taskCommitGatePolicy = resolveTaskCommitGatePolicy(workflow);

  return [
    {
      step: 1,
      name: tr(lang, 'steps', 'featureFolder'),
      checklist: { done: () => true },
    },
    {
      step: 2,
      name: tr(lang, 'steps', 'specWrite'),
      checklist: {
        done: (f) => f.specStatus === 'Review' || f.specStatus === 'Approved',
      },
      current: {
        when: (f) =>
          !f.docs.specExists || !f.specStatus || f.specStatus === 'Draft',
        actions: (f) => [
          {
            type: 'instruction',
            category: 'spec_write',
            message: !f.docs.specExists
              ? tr(lang, 'messages', 'specCreate')
              : tr(lang, 'messages', 'specImprove'),
          },
        ],
      },
    },
    {
      step: 3,
      name: tr(lang, 'steps', 'specApprove'),
      checklist: { done: (f) => f.specStatus === 'Approved' },
      current: {
        when: (f) => f.specStatus === 'Review',
        actions: () => [
          {
            type: 'instruction',
            category: 'spec_approve',
            requiresUserCheck: true,
            message: tr(lang, 'messages', 'specApproval'),
          },
        ],
      },
    },
    {
      step: 4,
      name: tr(lang, 'steps', 'planWrite'),
      checklist: {
        done: (f) => f.planStatus === 'Review' || f.planStatus === 'Approved',
      },
      current: {
        when: (f) =>
          f.specStatus === 'Approved' &&
          (!f.docs.planExists || !f.planStatus || f.planStatus === 'Draft'),
        actions: (f) => [
          {
            type: 'instruction',
            category: 'plan_write',
            message: !f.docs.planExists
              ? tr(lang, 'messages', 'planCreate')
              : tr(lang, 'messages', 'planImprove'),
          },
        ],
      },
    },
    {
      step: 5,
      name: tr(lang, 'steps', 'planApprove'),
      checklist: { done: (f) => f.planStatus === 'Approved' },
      current: {
        when: (f) => f.planStatus === 'Review',
        actions: () => [
          {
            type: 'instruction',
            category: 'plan_approve',
            requiresUserCheck: true,
            message: tr(lang, 'messages', 'planApproval'),
          },
        ],
      },
    },
    {
      step: 6,
      name: tr(lang, 'steps', 'tasksWrite'),
      checklist: {
        done: (f) => f.docs.tasksExists && f.tasks.total > 0 && isTasksDocApproved(f),
        detail: (f) => (f.tasks.total > 0 ? `(${f.tasks.total})` : ''),
      },
      current: {
        when: (f) =>
          f.planStatus === 'Approved' &&
          (!f.docs.tasksExists ||
            f.tasks.total === 0 ||
            (f.docs.tasksDocStatusFieldExists &&
              (!f.tasksDocStatus || f.tasksDocStatus === 'Draft' || f.tasksDocStatus === 'Review'))),
        actions: (f) => {
          if (!f.docs.tasksExists) {
            return [
              {
                type: 'instruction',
                category: 'tasks_write',
                message: tr(lang, 'messages', 'tasksCreate'),
              },
            ];
          }

          if (f.tasks.total === 0) {
            return [
              {
                type: 'instruction',
                category: 'tasks_write',
                message: tr(lang, 'messages', 'tasksNeedAtLeastOne'),
              },
            ];
          }

          if (f.docs.tasksDocStatusFieldExists && (!f.tasksDocStatus || f.tasksDocStatus === 'Draft')) {
            return [
              {
                type: 'instruction',
                category: 'tasks_write',
                message: tr(lang, 'messages', 'tasksImprove'),
              },
            ];
          }

          if (f.docs.tasksDocStatusFieldExists && f.tasksDocStatus === 'Review') {
            return [
              {
                type: 'instruction',
                category: 'tasks_approve',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'tasksApproval'),
              },
            ];
          }

          return [
            {
              type: 'instruction',
              category: 'tasks_write',
              message: tr(lang, 'messages', 'tasksImprove'),
            },
          ];
        },
      },
    },
    {
      step: 7,
      name: tr(lang, 'steps', 'docsInitialCommit'),
      checklist: {
        done: (f) =>
          f.docs.tasksExists &&
          f.tasks.total > 0 &&
          f.specStatus === 'Approved' &&
          f.planStatus === 'Approved' &&
          isTasksDocApproved(f) &&
          f.git.docsEverCommitted,
      },
      current: {
        when: (f) =>
          f.docs.tasksExists &&
          f.tasks.total > 0 &&
          f.specStatus === 'Approved' &&
          f.planStatus === 'Approved' &&
          isTasksDocApproved(f) &&
          !f.activeTask &&
          !f.git.docsEverCommitted &&
          f.git.docsHasUncommittedChanges,
        actions: (f) => {
          if (f.issueNumber) {
            return [
              {
                type: 'command',
                category: 'docs_commit',
                requiresUserCheck: true,
                scope: 'docs',
                cwd: f.git.docsGitCwd,
                cmd: tr(lang, 'messages', 'docsCommitIssueUpdate', {
                  docsGitCwd: f.git.docsGitCwd,
                  featurePath: f.docs.featurePathFromDocs,
                  issueNumber: f.issueNumber,
                  folderName: f.folderName,
                }),
              },
            ];
          }
          return [
            {
              type: 'command',
              category: 'docs_commit',
              requiresUserCheck: true,
              scope: 'docs',
              cwd: f.git.docsGitCwd,
              cmd: isImplementationDone(f)
                ? tr(lang, 'messages', 'docsCommitUpdate', {
                    docsGitCwd: f.git.docsGitCwd,
                    featurePath: f.docs.featurePathFromDocs,
                    folderName: f.folderName,
                  })
                : tr(lang, 'messages', 'docsCommitPlanning', {
                    docsGitCwd: f.git.docsGitCwd,
                    featurePath: f.docs.featurePathFromDocs,
                    folderName: f.folderName,
                  }),
            },
          ];
        },
      },
    },
    {
      step: 8,
      name: tr(lang, 'steps', 'issueCreate'),
      checklist: {
        done: (f) => !workflowPolicy.requireIssue || !!f.issueNumber,
      },
      current: {
        when: (f) =>
          workflowPolicy.requireIssue &&
          f.docs.tasksExists &&
          f.tasks.total > 0 &&
          f.specStatus === 'Approved' &&
          f.planStatus === 'Approved' &&
          isTasksDocApproved(f) &&
          !f.issueNumber,
        actions: (f) => {
          void f;
          return [
            {
              type: 'instruction',
              category: 'issue_create',
              requiresUserCheck: true,
              message: tr(lang, 'messages', 'issueCreateAndWrite', {
                featureRef: f.id || f.folderName,
              }),
            },
          ];
        },
      },
    },
    {
      step: 9,
      name: tr(lang, 'steps', 'branchCreate'),
      checklist: {
        done: (f) =>
          !workflowPolicy.requireBranch ||
          f.git.onExpectedBranch ||
          isImplementationDone(f) ||
          isFeatureDone(f, workflowPolicy, prePrReviewPolicy),
      },
      current: {
        when: (f) =>
          workflowPolicy.requireBranch &&
          !!f.issueNumber &&
          f.tasks.total > 0 &&
          f.tasks.done < f.tasks.total &&
          !isFeatureDone(f, workflowPolicy, prePrReviewPolicy) &&
          (!f.git.projectBranchAvailable || !f.git.onExpectedBranch),
        actions: (f) => {
          if (!f.git.projectBranchAvailable || !f.git.projectGitCwd) {
            return [
              {
                type: 'instruction',
                category: 'branch_create',
                message: tr(lang, 'messages', 'standaloneNeedsProjectRoot'),
              },
            ];
          }

          return [
            {
              type: 'command',
              category: 'branch_create',
              scope: 'project',
              cwd: f.git.projectGitCwd,
              cmd: tr(lang, 'messages', 'createBranch', {
                projectGitCwd: f.git.projectGitCwd,
                issueNumber: f.issueNumber,
                slug: f.slug,
              }),
            },
          ];
        },
      },
    },
    {
      step: 10,
      name: tr(lang, 'steps', 'tasksExecute'),
      checklist: {
        done: (f) =>
          f.docs.tasksExists &&
          f.tasks.total > 0 &&
          f.tasks.total === f.tasks.done &&
          isCompletionChecklistDone(f) &&
          isTasksDocApproved(f),
        detail: (f) =>
          f.tasks.total > 0 ? `(${f.tasks.done}/${f.tasks.total})` : '',
      },
      current: {
        when: (f) =>
          f.docs.tasksExists &&
          f.tasks.total > 0 &&
          (f.tasks.done < f.tasks.total || !isCompletionChecklistDone(f)) &&
          isTasksDocApproved(f) &&
          (!workflowPolicy.requireBranch ||
            f.git.onExpectedBranch ||
            f.tasks.done === f.tasks.total),
        actions: (f) => {
          if (f.tasks.total === f.tasks.done && !isCompletionChecklistDone(f)) {
            if (f.git.docsHasUncommittedChanges) {
              return [
                {
                  type: 'command',
                  category: 'docs_commit',
                  requiresUserCheck: true,
                  scope: 'docs',
                  cwd: f.git.docsGitCwd,
                  cmd: f.issueNumber
                    ? tr(lang, 'messages', 'docsCommitIssueUpdate', {
                        docsGitCwd: f.git.docsGitCwd,
                        featurePath: f.docs.featurePathFromDocs,
                        issueNumber: f.issueNumber,
                        folderName: f.folderName,
                      })
                    : tr(lang, 'messages', 'docsCommitUpdate', {
                        docsGitCwd: f.git.docsGitCwd,
                        featurePath: f.docs.featurePathFromDocs,
                        folderName: f.folderName,
                      }),
                },
              ];
            }

            if (f.git.projectHasUncommittedChanges) {
              if (!f.git.projectGitCwd) {
                return [
                  {
                    type: 'instruction',
                    category: 'task_execute',
                    message: tr(lang, 'messages', 'standaloneNeedsProjectRoot'),
                  },
                ];
              }

              return [
                {
                  type: 'command',
                  category: 'task_execute',
                  requiresUserCheck: true,
                  scope: 'project',
                  cwd: f.git.projectGitCwd,
                  cmd: f.issueNumber
                    ? tr(lang, 'messages', 'projectCommitIssueUpdate', {
                        projectGitCwd: f.git.projectGitCwd,
                        issueNumber: f.issueNumber,
                        folderName: f.folderName,
                        commitTopic: resolveProjectCommitTopic(f),
                      })
                    : tr(lang, 'messages', 'projectCommitUpdate', {
                        projectGitCwd: f.git.projectGitCwd,
                        folderName: f.folderName,
                        commitTopic: resolveProjectCommitTopic(f),
                      }),
                },
              ];
            }

            const actions: NextAction[] = [
              {
                type: 'instruction' as const,
                category: 'task_execute',
                requiresUserCheck: true,
                message: !f.completionChecklist
                  ? tr(lang, 'messages', 'tasksAllDoneButNoChecklist')
                  : tr(lang, 'messages', 'tasksAllDoneButChecklist', {
                      checked: f.completionChecklist.checked,
                      total: f.completionChecklist.total,
                    }),
              },
            ];

            if (!isPrMetadataConfigured(f)) {
              actions.push({
                type: 'instruction' as const,
                category: 'pr_metadata_migrate',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prLegacyAsk'),
              });
            }

            return actions;
          }
          if (f.activeTask) {
            return [
              {
                type: 'instruction',
                category: 'task_execute',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'finishDoingTask', {
                  title: f.activeTask.title,
                  done: f.tasks.done,
                  total: f.tasks.total,
                }),
              },
            ];
          }
          if (f.nextTodoTask) {
            if (f.git.docsHasUncommittedChanges) {
              return [
                {
                  type: 'command',
                  category: 'docs_commit',
                  requiresUserCheck: true,
                  scope: 'docs',
                  cwd: f.git.docsGitCwd,
                  cmd: f.issueNumber
                    ? tr(lang, 'messages', 'docsCommitIssueUpdate', {
                        docsGitCwd: f.git.docsGitCwd,
                        featurePath: f.docs.featurePathFromDocs,
                        issueNumber: f.issueNumber,
                        folderName: f.folderName,
                      })
                    : tr(lang, 'messages', 'docsCommitUpdate', {
                        docsGitCwd: f.git.docsGitCwd,
                        featurePath: f.docs.featurePathFromDocs,
                        folderName: f.folderName,
                  }),
                },
              ];
            }
            if (f.git.projectHasUncommittedChanges) {
              if (!f.git.projectGitCwd) {
                return [
                  {
                    type: 'instruction',
                    category: 'task_execute',
                    message: tr(lang, 'messages', 'standaloneNeedsProjectRoot'),
                  },
                ];
              }
              return [
                {
                  type: 'command',
                  category: 'task_execute',
                  requiresUserCheck: true,
                  scope: 'project',
                  cwd: f.git.projectGitCwd,
                  cmd: f.issueNumber
                    ? tr(lang, 'messages', 'projectCommitIssueUpdate', {
                        projectGitCwd: f.git.projectGitCwd,
                        issueNumber: f.issueNumber,
                        folderName: f.folderName,
                        commitTopic: resolveProjectCommitTopic(f),
                      })
                    : tr(lang, 'messages', 'projectCommitUpdate', {
                        projectGitCwd: f.git.projectGitCwd,
                        folderName: f.folderName,
                        commitTopic: resolveProjectCommitTopic(f),
                      }),
                },
              ];
            }

            if (taskCommitGatePolicy !== 'off' && f.lastDoneTask) {
              const commitGate = checkTaskCommitGate(f);
              if (!commitGate.pass) {
                const reasonText = getTaskCommitGateReasonText(lang, commitGate);
                if (shouldBlockTaskCommitGate(taskCommitGatePolicy, commitGate)) {
                  return [
                    {
                      type: 'instruction',
                      category: 'task_execute',
                      requiresUserCheck: true,
                      message: tr(lang, 'messages', 'taskCommitGateStrictBlock', {
                        reason: reasonText,
                      }),
                    },
                  ];
                }
                return [
                  {
                    type: 'instruction',
                    category: 'task_execute',
                    requiresUserCheck: true,
                    message: `${tr(lang, 'messages', 'startNextTodoTask', {
                      title: f.nextTodoTask.title,
                      done: f.tasks.done,
                      total: f.tasks.total,
                    })}\n${tr(lang, 'messages', 'taskCommitGateWarnProceed', {
                      reason: reasonText,
                    })}`,
                  },
                ];
              }
            }

            return [
              {
                type: 'instruction',
                category: 'task_execute',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'startNextTodoTask', {
                  title: f.nextTodoTask.title,
                  done: f.tasks.done,
                  total: f.tasks.total,
                }),
              },
            ];
          }
          return [
            {
              type: 'instruction',
              category: 'task_execute',
              requiresUserCheck: true,
              message: tr(lang, 'messages', 'checkTaskStatuses', {
                done: f.tasks.done,
                total: f.tasks.total,
              }),
            },
          ];
        },
      },
    },
    {
      step: 11,
      name: tr(lang, 'steps', 'docsCommitSync'),
      checklist: {
        done: (f) =>
          !f.git.docsHasUncommittedChanges && !f.git.projectHasUncommittedChanges,
      },
      current: {
        when: (f) =>
          isImplementationDone(f) &&
          (f.git.docsHasUncommittedChanges || f.git.projectHasUncommittedChanges),
        actions: (f) => {
          if (f.git.docsHasUncommittedChanges) {
            return [
              {
                type: 'command',
                category: 'docs_commit',
                requiresUserCheck: true,
                scope: 'docs',
                cwd: f.git.docsGitCwd,
                cmd: f.issueNumber
                  ? tr(lang, 'messages', 'docsCommitIssueUpdate', {
                      docsGitCwd: f.git.docsGitCwd,
                      featurePath: f.docs.featurePathFromDocs,
                      issueNumber: f.issueNumber,
                      folderName: f.folderName,
                    })
                  : tr(lang, 'messages', 'docsCommitUpdate', {
                      docsGitCwd: f.git.docsGitCwd,
                      featurePath: f.docs.featurePathFromDocs,
                      folderName: f.folderName,
                    }),
              },
            ];
          }

          if (!f.git.projectGitCwd) {
            return [
              {
                type: 'instruction',
                category: 'task_execute',
                message: tr(lang, 'messages', 'standaloneNeedsProjectRoot'),
              },
            ];
          }

          return [
            {
              type: 'command',
              category: 'task_execute',
              requiresUserCheck: true,
              scope: 'project',
              cwd: f.git.projectGitCwd,
              cmd: f.issueNumber
                ? tr(lang, 'messages', 'projectCommitIssueUpdate', {
                    projectGitCwd: f.git.projectGitCwd,
                    issueNumber: f.issueNumber,
                    folderName: f.folderName,
                    commitTopic: resolveProjectCommitTopic(f),
                  })
                : tr(lang, 'messages', 'projectCommitUpdate', {
                    projectGitCwd: f.git.projectGitCwd,
                    folderName: f.folderName,
                    commitTopic: resolveProjectCommitTopic(f),
                  }),
            },
          ];
        },
      },
    },
    {
      step: 12,
      name: tr(lang, 'steps', 'prePrReview'),
      checklist: {
        done: (f) => isPrePrReviewSatisfied(f, prePrReviewPolicy),
      },
      current: {
        when: (f) =>
          prePrReviewPolicy.enabled &&
          workflowPolicy.requirePr &&
          f.docs.tasksExists &&
          f.tasks.total > 0 &&
          f.tasks.total === f.tasks.done &&
          isCompletionChecklistDone(f) &&
          !f.git.docsHasUncommittedChanges &&
          !f.git.projectHasUncommittedChanges &&
          (!isPrMetadataConfigured(f) || !f.pr.link) &&
          !isPrePrReviewSatisfied(f, prePrReviewPolicy),
        actions: (f) => {
          if (!prePrReviewPolicy.enabled) return [];
          if (!f.docs.prePrReviewFieldExists) {
            return [
              {
                type: 'instruction',
                category: 'pr_metadata_migrate',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prePrReviewFieldMissing'),
              },
            ];
          }
          if (f.prePrReview.status !== 'Done') {
            if (!prePrReviewPolicy.skills.length) {
              return [
                {
                  type: 'instruction',
                  category: 'pre_pr_review',
                  requiresUserCheck: true,
                  message: tr(lang, 'messages', 'prePrReviewRun', {
                    skills: 'code-review-excellence',
                    fallback: prePrReviewPolicy.fallback,
                    findingsPolicy: getFindingsPolicyText(
                      lang,
                      prePrReviewPolicy.blockOnFindings
                    ),
                    minorFindingsPolicy: getMinorFindingsPolicyText(
                      lang,
                      prePrReviewPolicy.minorPolicy
                    ),
                  }),
                },
              ];
            }
            return [
              {
                type: 'instruction',
                category: 'pre_pr_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prePrReviewRun', {
                  skills: formatSkillList(prePrReviewPolicy.skills),
                  fallback: prePrReviewPolicy.fallback,
                  findingsPolicy: getFindingsPolicyText(
                    lang,
                    prePrReviewPolicy.blockOnFindings
                  ),
                  minorFindingsPolicy: getMinorFindingsPolicyText(
                    lang,
                    prePrReviewPolicy.minorPolicy
                  ),
                }),
              },
            ];
          }
          if (!f.docs.prePrFindingsFieldExists || !f.prePrReview.findings) {
            return [
              {
                type: 'instruction',
                category: 'pre_pr_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prePrReviewFindingsMissing'),
              },
            ];
          }
          if (!f.docs.prePrEvidenceFieldExists || !f.prePrReview.evidenceProvided) {
            return [
              {
                type: 'instruction',
                category: 'pre_pr_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prePrReviewEvidenceMissing'),
              },
            ];
          }
          if (
            prePrReviewPolicy.blockOnFindings &&
            f.prePrReview.findings.major > 0
          ) {
            return [
              {
                type: 'instruction',
                category: 'pre_pr_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prePrReviewMajorBlocked', {
                  count: f.prePrReview.findings.major,
                }),
              },
            ];
          }
          if (
            prePrReviewPolicy.minorPolicy === 'block' &&
            f.prePrReview.findings.minor > 0
          ) {
            return [
              {
                type: 'instruction',
                category: 'pre_pr_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prePrReviewMinorBlocked', {
                  count: f.prePrReview.findings.minor,
                }),
              },
            ];
          }
          if (!prePrReviewPolicy.skills.length) {
            return [
              {
                type: 'instruction',
                category: 'pre_pr_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prePrReviewRun', {
                  skills: 'code-review-excellence',
                  fallback: prePrReviewPolicy.fallback,
                  findingsPolicy: getFindingsPolicyText(
                    lang,
                    prePrReviewPolicy.blockOnFindings
                  ),
                  minorFindingsPolicy: getMinorFindingsPolicyText(
                    lang,
                    prePrReviewPolicy.minorPolicy
                  ),
                }),
              },
            ];
          }
          return [
            {
              type: 'instruction',
              category: 'pre_pr_review',
              requiresUserCheck: true,
              message: tr(lang, 'messages', 'prePrReviewRun', {
                skills: formatSkillList(prePrReviewPolicy.skills),
                fallback: prePrReviewPolicy.fallback,
                findingsPolicy: getFindingsPolicyText(
                  lang,
                  prePrReviewPolicy.blockOnFindings
                ),
                minorFindingsPolicy: getMinorFindingsPolicyText(
                  lang,
                  prePrReviewPolicy.minorPolicy
                ),
              }),
            },
          ];
        },
      },
    },
    {
      step: 13,
      name: tr(lang, 'steps', 'prCreate'),
      checklist: {
        done: (f) =>
          !workflowPolicy.requirePr ||
          (isPrMetadataConfigured(f) && !!f.pr.link),
      },
      current: {
        when: (f) =>
          workflowPolicy.requirePr &&
          f.docs.tasksExists &&
          f.tasks.total > 0 &&
          f.tasks.total === f.tasks.done &&
          isCompletionChecklistDone(f) &&
          (!isPrMetadataConfigured(f) || !f.pr.link),
        actions: (f) => {
          if (!isPrMetadataConfigured(f)) {
            return [
              {
                type: 'instruction',
                category: 'pr_metadata_migrate',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prLegacyAsk'),
              },
            ];
          }
          return [
            {
              type: 'instruction',
              category: 'pr_create',
              requiresUserCheck: true,
              message: tr(lang, 'messages', 'prCreate', {
                featureRef: f.id || f.folderName,
              }),
            },
          ];
        },
      },
    },
    {
      step: 14,
      name: tr(lang, 'steps', 'codeReview'),
      checklist: {
        done: (f) =>
          !workflowPolicy.requireReview ||
          (isPrMetadataConfigured(f) && f.pr.status === 'Approved'),
      },
      current: {
        when: (f) =>
          workflowPolicy.requireReview &&
          isPrMetadataConfigured(f) &&
          !!f.pr.link &&
          f.pr.status !== 'Approved',
        actions: (f) => {
          if (!f.pr.status) {
            return [
              {
                type: 'instruction',
                category: 'pr_status_update',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prFillStatus'),
              },
            ];
          }
          if (f.pr.status === 'Review') {
            return [
              {
                type: 'instruction',
                category: 'code_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prResolveReview', {
                  featureRef: f.id || f.folderName,
                }),
              },
            ];
          }
          return [
            {
              type: 'instruction',
              category: 'code_review',
              message: tr(lang, 'messages', 'prRequestReview'),
            },
          ];
        },
      },
    },
    {
      step: 15,
      name: tr(lang, 'steps', 'featureDone'),
      checklist: {
        done: (f) => isFeatureDone(f, workflowPolicy, prePrReviewPolicy),
      },
      current: {
        when: (f) => isFeatureDone(f, workflowPolicy, prePrReviewPolicy),
        actions: () => [
          {
            type: 'instruction',
            category: 'feature_done',
            message: tr(lang, 'messages', 'featureDone'),
          },
        ],
      },
    },
  ];
}

export function getStepsMap(
  lang: Lang,
  workflow?: ProjectConfig['workflow']
): Record<number, string> {
  return Object.fromEntries(
    getStepDefinitions(lang, workflow).map((d) => [d.step, d.name])
  );
}

export const STEP_DEFINITIONS: StepDefinition[] = getStepDefinitions('ko');
export const STEPS: Record<number, string> = getStepsMap('ko');

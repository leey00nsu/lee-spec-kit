import { FeatureState, Lang, NextAction, StepDefinition } from './types.js';
import { tr } from '../i18n.js';
import { ProjectConfig } from '../config.js';
import { resolveWorkflowPolicy } from '../workflow.js';

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

function isFeatureDone(
  feature: FeatureState,
  workflowPolicy: ReturnType<typeof resolveWorkflowPolicy>
): boolean {
  return (
    feature.specStatus === 'Approved' &&
    feature.planStatus === 'Approved' &&
    feature.docs.tasksExists &&
    feature.tasks.total > 0 &&
    feature.tasks.total === feature.tasks.done &&
    isCompletionChecklistDone(feature) &&
    isTasksDocApproved(feature) &&
    (!workflowPolicy.requireIssue || !!feature.issueNumber) &&
    (!workflowPolicy.requirePr ||
      (isPrMetadataConfigured(feature) && !!feature.pr.link)) &&
    (!workflowPolicy.requireReview || feature.pr.status === 'Approved')
  );
}

export function getStepDefinitions(
  lang: Lang,
  workflow?: ProjectConfig['workflow']
): StepDefinition[] {
  const workflowPolicy = resolveWorkflowPolicy(workflow);

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
              cmd: tr(lang, 'messages', 'docsCommitPlanning', {
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
              message: tr(lang, 'messages', 'issueCreateAndWrite'),
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
          isFeatureDone(f, workflowPolicy),
      },
      current: {
        when: (f) =>
          workflowPolicy.requireBranch &&
          !!f.issueNumber &&
          f.tasks.total > 0 &&
          f.tasks.done < f.tasks.total &&
          !isFeatureDone(f, workflowPolicy) &&
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
        done: (f) => !f.git.docsHasUncommittedChanges,
      },
      current: {
        when: (f) => isImplementationDone(f) && f.git.docsHasUncommittedChanges,
        actions: (f) => [
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
        ],
      },
    },
    {
      step: 12,
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
              message: tr(lang, 'messages', 'prCreate'),
            },
          ];
        },
      },
    },
    {
      step: 13,
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
                message: tr(lang, 'messages', 'prResolveReview'),
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
      step: 14,
      name: tr(lang, 'steps', 'featureDone'),
      checklist: { done: (f) => isFeatureDone(f, workflowPolicy) },
      current: {
        when: (f) => isFeatureDone(f, workflowPolicy),
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

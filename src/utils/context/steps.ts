import { FeatureState, Lang, NextAction, StepDefinition } from './types.js';
import { tr } from '../i18n.js';
import { ProjectConfig } from '../config.js';
import { execFileSync } from 'child_process';
import path from 'path';
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

function isReviewIterationPhase(
  feature: FeatureState,
  workflowPolicy: ReturnType<typeof resolveWorkflowPolicy>
): boolean {
  return (
    workflowPolicy.requirePr &&
    workflowPolicy.requireReview &&
    isPrMetadataConfigured(feature) &&
    !!feature.pr.link &&
    feature.pr.status === 'Review'
  );
}

function isPrePrReviewSatisfied(
  feature: FeatureState,
  prePrReviewPolicy: ReturnType<typeof resolvePrePrReviewPolicy>
): boolean {
  if (!prePrReviewPolicy.enabled) return true;
  if (!feature.docs.prePrReviewFieldExists || feature.prePrReview.status !== 'Done') {
    return false;
  }
  if (
    !feature.docs.prePrEvidenceFieldExists ||
    !feature.prePrReview.evidenceProvided
  ) {
    return false;
  }
  if (
    prePrReviewPolicy.findings === 'required' &&
    (!feature.docs.prePrFindingsFieldExists || !feature.prePrReview.findingsProvided)
  ) {
    return false;
  }
  if (
    !feature.docs.prePrDecisionFieldExists ||
    !feature.prePrReview.decisionProvided
  ) {
    return false;
  }
  if (feature.prePrReview.decisionOutcome !== 'approve') {
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

function getPrReviewRemoteBlockReasons(feature: FeatureState, lang: Lang): string[] {
  const remote = feature.pr.remote;
  if (!remote || !remote.available) return [];

  const reasons: string[] = [];
  if (remote.state === 'CLOSED' && !remote.isMerged) {
    reasons.push(tr(lang, 'messages', 'prReviewRemoteReasonClosed'));
  }
  if (remote.hasBlockingReview) {
    reasons.push(tr(lang, 'messages', 'prReviewRemoteReasonChangesRequested'));
  }
  if (remote.failingChecks > 0) {
    reasons.push(
      tr(lang, 'messages', 'prReviewRemoteReasonChecksFailing', {
        count: remote.failingChecks,
      })
    );
  }
  if (remote.pendingChecks > 0) {
    reasons.push(
      tr(lang, 'messages', 'prReviewRemoteReasonChecksPending', {
        count: remote.pendingChecks,
      })
    );
  }
  if (remote.mergeBlocked) {
    reasons.push(
      tr(lang, 'messages', 'prReviewRemoteReasonMergeBlocked', {
        status: remote.mergeStateStatus || 'UNKNOWN',
      })
    );
  }
  return reasons;
}

function normalizeCommitTopicText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toShellArg(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')}"`;
}

function buildSelfCliCommand(args: string[]): string {
  const entry = process.argv[1] || 'dist/index.js';
  const base = [process.execPath, entry, '--no-banner', ...args];
  return base.map((arg) => toShellArg(arg)).join(' ');
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

function resolveManagedWorktreeCleanupPaths(
  projectGitCwd: string | undefined
): { projectRoot: string; worktreePath: string } | null {
  if (!projectGitCwd) return null;
  const normalized = path.resolve(projectGitCwd);
  const marker = `${path.sep}.worktrees${path.sep}`;
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex <= 0) return null;
  const projectRoot = normalized.slice(0, markerIndex);
  if (!projectRoot) return null;
  return {
    projectRoot,
    worktreePath: normalized,
  };
}

interface TaskCommitGateCheck {
  pass: boolean;
  reason?:
    | 'DONE_TRANSITIONS_COUNT'
    | 'NO_PROJECT_COMMIT'
    | 'PROJECT_LOG_UNAVAILABLE'
    | 'MISMATCH_LAST_DONE';
  doneTransitions?: number;
}

function shouldBlockTaskCommitGate(
  policy: ReturnType<typeof resolveTaskCommitGatePolicy>,
  check: TaskCommitGateCheck
): boolean {
  if (policy !== 'strict') return false;
  return !check.pass;
}

function normalizeGitRelativePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
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

function normalizeCommitSubjectForGate(value: string): string {
  return normalizeCommitTopicText(value)
    .replace(/^[a-z]+(?:\([^)]*\))?!?:\s*/i, '')
    .toLowerCase();
}

function toTaskKey(rawTitle: string): string {
  const trimmed = normalizeCommitTopicText(rawTitle);
  if (!trimmed) return '';
  const idMatch = trimmed.match(/^(T-[A-Za-z0-9-]+)/i);
  if (idMatch) return idMatch[1].toUpperCase();
  return normalizeTaskTopic(trimmed).toLowerCase();
}

function countDoneTransitionsInLatestTasksCommit(
  feature: FeatureState
): number | undefined {
  const docsGitCwd = feature.git.docsGitCwd;
  const tasksRelativePath = normalizeGitRelativePath(
    path.join(feature.docs.featurePathFromDocs, 'tasks.md')
  );

  const diff = readGitText(docsGitCwd, [
    'diff',
    '--unified=0',
    '--no-color',
    'HEAD~1',
    'HEAD',
    '--',
    tasksRelativePath,
  ]);
  if (diff === undefined) return 0;
  if (!diff.trim()) return 0;

  const removedByTask = new Map<string, Set<'TODO' | 'DOING' | 'DONE' | 'REVIEW'>>();
  const addedByTask = new Map<string, Set<'TODO' | 'DOING' | 'DONE' | 'REVIEW'>>();

  const parseTaskLine = (
    line: string
  ): { key: string; status: 'TODO' | 'DOING' | 'DONE' | 'REVIEW' } | null => {
    const match = line.match(/^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\]\s+(.+?)\s*$/i);
    if (!match) return null;
    const key = toTaskKey(match[2]);
    if (!key) return null;
    return {
      key,
      status: match[1].toUpperCase() as 'TODO' | 'DOING' | 'DONE' | 'REVIEW',
    };
  };

  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;

    if (line.startsWith('-')) {
      const parsed = parseTaskLine(line.slice(1));
      if (!parsed) continue;
      const existing = removedByTask.get(parsed.key) || new Set();
      existing.add(parsed.status);
      removedByTask.set(parsed.key, existing);
      continue;
    }

    if (line.startsWith('+')) {
      const parsed = parseTaskLine(line.slice(1));
      if (!parsed) continue;
      const existing = addedByTask.get(parsed.key) || new Set();
      existing.add(parsed.status);
      addedByTask.set(parsed.key, existing);
    }
  }

  let doneTransitions = 0;
  for (const [taskKey, addedStatuses] of addedByTask.entries()) {
    if (!addedStatuses.has('DONE')) continue;
    const removedStatuses = removedByTask.get(taskKey);
    if (!removedStatuses) continue;
    const transitionedFromOpen =
      removedStatuses.has('TODO') || removedStatuses.has('DOING') || removedStatuses.has('REVIEW');
    if (transitionedFromOpen) {
      doneTransitions += 1;
    }
  }

  return doneTransitions;
}

function checkTaskCommitGate(feature: FeatureState): TaskCommitGateCheck {
  const doneTransitions = countDoneTransitionsInLatestTasksCommit(feature);
  if (doneTransitions === 0) {
    // Docs-only edits (e.g., adding/changing TODO text) should not trigger
    // project commit gate checks.
    return { pass: true, doneTransitions };
  }
  if (typeof doneTransitions === 'number' && doneTransitions > 1) {
    return {
      pass: false,
      reason: 'DONE_TRANSITIONS_COUNT',
      doneTransitions,
    };
  }

  const projectGitCwd = feature.git.projectGitCwd;
  const lastDoneTopic = normalizeTaskTopic(feature.lastDoneTask?.title || '');
  if (!projectGitCwd || !lastDoneTopic) {
    return { pass: true };
  }

  const args = ['log', '-n', '1', '--pretty=%s', '--', '.'];
  const relativeDocsDir = path.relative(projectGitCwd, feature.git.docsGitCwd);
  const normalizedDocsDir = normalizeGitRelativePath(relativeDocsDir);
  if (
    normalizedDocsDir &&
    normalizedDocsDir !== '.' &&
    normalizedDocsDir !== '..' &&
    !normalizedDocsDir.startsWith('../')
  ) {
    args.push(`:(exclude)${normalizedDocsDir}/**`);
  }

  const latestProjectSubject = readGitText(projectGitCwd, args);
  if (latestProjectSubject === undefined) {
    return { pass: false, reason: 'PROJECT_LOG_UNAVAILABLE' };
  }
  const normalizedSubject = normalizeCommitSubjectForGate(latestProjectSubject);
  if (!normalizedSubject) {
    return { pass: false, reason: 'NO_PROJECT_COMMIT' };
  }

  const normalizedLastDone = normalizeTaskTopic(lastDoneTopic).toLowerCase();
  if (!normalizedSubject.includes(normalizedLastDone)) {
    return { pass: false, reason: 'MISMATCH_LAST_DONE' };
  }

  return { pass: true };
}

function getTaskCommitGateReasonText(
  lang: Lang,
  check: TaskCommitGateCheck
): string {
  switch (check.reason) {
    case 'DONE_TRANSITIONS_COUNT':
      return tr(lang, 'messages', 'taskCommitGateReasonDoneCount', {
        count: check.doneTransitions || 0,
      });
    case 'NO_PROJECT_COMMIT':
      return tr(lang, 'messages', 'taskCommitGateReasonNoTasksCommit');
    case 'PROJECT_LOG_UNAVAILABLE':
      return tr(lang, 'messages', 'taskCommitGateReasonTasksFileUnavailable');
    case 'MISMATCH_LAST_DONE':
      return tr(lang, 'messages', 'taskCommitGateReasonMismatchLastDone');
    default:
      return tr(lang, 'messages', 'taskCommitGateReasonMismatchLastDone');
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
          if (!f.docs.issueDocExists) {
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
          }
          if (f.docs.issueDocStatus === 'Ready') {
            return [
              {
                type: 'instruction',
                category: 'issue_create',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'issueCreateFromDoc', {
                  featureRef: f.id || f.folderName,
                }),
              },
            ];
          }
          return [
            {
              type: 'instruction',
              category: 'issue_create',
              requiresUserCheck: true,
              message: tr(lang, 'messages', 'issuePrepareFromDoc', {
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
            if (isReviewIterationPhase(f, workflowPolicy)) {
              if (!f.git.projectGitCwd) {
                return [
                  {
                    type: 'instruction',
                    category: 'review_fix_commit',
                    message: tr(lang, 'messages', 'standaloneNeedsProjectRoot'),
                  },
                ];
              }

              return [
                {
                  type: 'instruction',
                  category: 'review_fix_commit',
                  requiresUserCheck: true,
                  message: f.issueNumber
                    ? tr(lang, 'messages', 'reviewFixCommitIssueGuidance', {
                        projectGitCwd: f.git.projectGitCwd,
                        issueNumber: f.issueNumber,
                      })
                    : tr(lang, 'messages', 'reviewFixCommitGuidance', {
                        projectGitCwd: f.git.projectGitCwd,
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
                taskExecutePhase: 'complete',
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
                    taskExecutePhase: 'start',
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
                taskExecutePhase: 'start',
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

          if (isReviewIterationPhase(f, workflowPolicy)) {
            if (!f.git.projectGitCwd) {
              return [
                {
                  type: 'instruction',
                  category: 'review_fix_commit',
                  message: tr(lang, 'messages', 'standaloneNeedsProjectRoot'),
                },
              ];
            }
            return [
              {
                type: 'instruction',
                category: 'review_fix_commit',
                requiresUserCheck: true,
                message: f.issueNumber
                  ? tr(lang, 'messages', 'reviewFixCommitIssueGuidance', {
                      projectGitCwd: f.git.projectGitCwd,
                      issueNumber: f.issueNumber,
                    })
                  : tr(lang, 'messages', 'reviewFixCommitGuidance', {
                      projectGitCwd: f.git.projectGitCwd,
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
          const commandArgs = ['pre-pr-review', f.folderName];
          if (f.type && f.type !== 'single') {
            commandArgs.push('--component', f.type);
          }
          return [
            {
              type: 'command',
              category: 'pre_pr_review',
              operationType: 'local',
              requiresUserCheck: true,
              scope: 'docs',
              cwd: f.git.docsGitCwd,
              cmd: buildSelfCliCommand(commandArgs),
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
          if (!f.docs.prDocExists) {
            return [
              {
                type: 'instruction',
                category: 'pr_create',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prCreateRequiredSequence', {
                  featureRef: f.id || f.folderName,
                }),
              },
            ];
          }
          if (f.docs.prDocStatus === 'Ready') {
            return [
              {
                type: 'instruction',
                category: 'pr_create',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prCreateExecuteFromDoc', {
                  featureRef: f.id || f.folderName,
                }),
              },
            ];
          }
          return [
            {
              type: 'instruction',
              category: 'pr_create',
              requiresUserCheck: true,
              message: tr(lang, 'messages', 'prCreatePrepareFromDoc', {
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
            if (f.pr.remote?.available && f.pr.remote.isMerged) {
              return [
                {
                  type: 'instruction',
                  category: 'pr_status_update',
                  requiresUserCheck: true,
                  message: tr(lang, 'messages', 'prReviewMergedSyncStatus'),
                },
              ];
            }
            if (!f.docs.prReviewEvidenceFieldExists) {
              return [
                {
                  type: 'instruction',
                  category: 'code_review',
                  requiresUserCheck: true,
                  message: tr(lang, 'messages', 'prReviewEvidenceFieldMissing'),
                },
              ];
            }
            if (!f.prReview.evidenceProvided) {
              return [
                {
                  type: 'instruction',
                  category: 'code_review',
                  requiresUserCheck: true,
                  message: tr(lang, 'messages', 'prReviewEvidenceMissing'),
                },
              ];
            }
            if (!f.docs.prReviewDecisionFieldExists) {
              return [
                {
                  type: 'instruction',
                  category: 'code_review',
                  requiresUserCheck: true,
                  message: tr(lang, 'messages', 'prReviewDecisionFieldMissing'),
                },
              ];
            }
            if (!f.prReview.decisionProvided) {
              return [
                {
                  type: 'instruction',
                  category: 'code_review',
                  requiresUserCheck: true,
                  message: tr(lang, 'messages', 'prReviewDecisionMissing'),
                },
              ];
            }

            const remoteBlockReasons = getPrReviewRemoteBlockReasons(f, lang);
            const remoteUnavailable =
              workflowPolicy.mode === 'github' &&
              !!f.pr.link &&
              (!f.pr.remote || !f.pr.remote.available);
            const actions: NextAction[] = [
              {
                type: 'instruction',
                category: 'code_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prReviewResolve'),
              },
            ];

            if (!f.git.projectGitCwd) {
              actions.push({
                type: 'instruction',
                category: 'code_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'standaloneNeedsProjectRoot'),
              });
            } else if ((f.git.projectBranchAhead || 0) > 0) {
              actions.push({
                type: 'command',
                category: 'code_review',
                requiresUserCheck: true,
                scope: 'project',
                cwd: f.git.projectGitCwd,
                cmd: tr(lang, 'messages', 'prReviewPush', {
                  projectGitCwd: f.git.projectGitCwd,
                }),
              });
            }

            if (remoteBlockReasons.length > 0 || remoteUnavailable) {
              const reasons = [...remoteBlockReasons];
              if (remoteUnavailable) {
                reasons.push(tr(lang, 'messages', 'prReviewRemoteReasonUnavailable'));
              }
              actions.push({
                type: 'instruction',
                category: 'code_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prReviewRemoteBlocked', {
                  reasons: reasons.join('; '),
                }),
              });
            } else if (f.git.docsGitCwd) {
              actions.push({
                type: 'command',
                category: 'code_review',
                requiresUserCheck: true,
                operationType: 'remote',
                scope: 'docs',
                cwd: f.git.docsGitCwd,
                cmd: tr(lang, 'messages', 'prReviewMergeCommand', {
                  featureRef: f.id || f.folderName,
                }),
              });
            } else {
              actions.push({
                type: 'instruction',
                category: 'code_review',
                requiresUserCheck: true,
                message: tr(lang, 'messages', 'prReviewMerge', {
                  featureRef: f.id || f.folderName,
                }),
              });
            }

            return actions;
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
        actions: (f) => {
          const actions: NextAction[] = [
            {
              type: 'instruction',
              category: 'feature_done',
              message: tr(lang, 'messages', 'featureDone'),
            },
          ];
          const cleanupPaths = resolveManagedWorktreeCleanupPaths(
            f.git.projectGitCwd
          );
          if (cleanupPaths) {
            actions.push({
              type: 'command',
              category: 'worktree_cleanup',
              requiresUserCheck: true,
              scope: 'project',
              cwd: cleanupPaths.projectRoot,
              cmd: tr(lang, 'messages', 'worktreeCleanupCommand', {
                projectGitCwd: cleanupPaths.projectRoot,
                worktreePath: cleanupPaths.worktreePath,
              }),
            });
          }
          return actions;
        },
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

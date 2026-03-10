import { FeatureState, Lang, NextAction, StepDefinition } from './types.js';
import { tr } from '../i18n.js';
import { CliContext } from '../cli-context.js';
import path from 'path';
import fs from 'fs';
import {
  resolvePrePrReviewPolicy,
  resolveTaskCommitGatePolicy,
  resolveWorkflowPolicy,
} from '../workflow.js';
import {
  getCodeReviewPrompt,
} from '../agent-orchestration.js';

function isCompletionChecklistDone(feature: FeatureState): boolean {
  return (
    !!feature.completionChecklist &&
    feature.completionChecklist.total > 0 &&
    feature.completionChecklist.checked === feature.completionChecklist.total
  );
}

function isTasksDocApproved(feature: FeatureState): boolean {
  return (
    !feature.docs.tasksDocStatusFieldExists ||
    feature.tasksDocStatus === 'Approved'
  );
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

function isPrePrFixIterationPhase(
  feature: FeatureState,
  workflowPolicy: ReturnType<typeof resolveWorkflowPolicy>,
  prePrReviewPolicy: ReturnType<typeof resolvePrePrReviewPolicy>
): boolean {
  return (
    prePrReviewPolicy.enabled &&
    workflowPolicy.requirePr &&
    feature.prePrReview.status === 'Done' &&
    !!feature.prePrReview.decisionOutcome &&
    feature.prePrReview.decisionOutcome !== 'approve' &&
    (!isPrMetadataConfigured(feature) || !feature.pr.link)
  );
}

function isPrePrReviewSatisfied(
  feature: FeatureState,
  prePrReviewPolicy: ReturnType<typeof resolvePrePrReviewPolicy>
): boolean {
  if (!prePrReviewPolicy.enabled) return true;
  if (
    !feature.docs.prePrReviewFieldExists ||
    feature.prePrReview.status !== 'Done'
  ) {
    return false;
  }
  if (
    !feature.docs.prePrEvidenceFieldExists ||
    !feature.prePrReview.evidenceProvided
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
    (!workflowPolicy.requireMerge || feature.pr.status === 'Approved') &&
    isPrePrReviewSatisfied(feature, prePrReviewPolicy)
  );
}

function getPrReviewRemoteBlockReasons(
  feature: FeatureState,
  lang: Lang
): string[] {
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

function buildPrePrReviewCommandArgs(
  feature: FeatureState,
  evidencePath?: string,
  decision?: 'approve' | 'changes_requested' | 'blocked'
): string[] {
  const commandArgs = ['pre-pr-review', feature.folderName];
  if (feature.type && feature.type !== 'single') {
    commandArgs.push('--component', feature.type);
  }
  if (evidencePath) {
    commandArgs.push('--evidence', evidencePath);
  }
  if (decision) {
    commandArgs.push('--decision', decision);
  }
  return commandArgs;
}

function buildPrePrReviewRunCommandArgs(feature: FeatureState): string[] {
  const commandArgs = ['pre-pr-review-run', feature.folderName];
  if (feature.type && feature.type !== 'single') {
    commandArgs.push('--component', feature.type);
  }
  return commandArgs;
}

function buildTaskRunCommandArgs(
  feature: FeatureState,
  taskId: string
): string[] {
  const commandArgs = ['task-run', feature.folderName, '--task', taskId];
  if (feature.type && feature.type !== 'single') {
    commandArgs.push('--component', feature.type);
  }
  return commandArgs;
}

function buildTaskCompleteCommandArgs(
  feature: FeatureState,
  taskId: string
): string[] {
  const commandArgs = ['task-complete', feature.folderName, '--task', taskId];
  if (feature.type && feature.type !== 'single') {
    commandArgs.push('--component', feature.type);
  }
  return commandArgs;
}

function buildCodeReviewRunCommandArgs(feature: FeatureState): string[] {
  const commandArgs = ['code-review-run', feature.folderName];
  if (feature.type && feature.type !== 'single') {
    commandArgs.push('--component', feature.type);
  }
  return commandArgs;
}

function isNonEmptyStringValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeIntegerValue(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isLikelyCurrentPrePrReviewEvidence(
  evidencePath: string,
  feature: FeatureState
): boolean {
  try {
    const raw = fs.readFileSync(evidencePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const evidenceFeature = (parsed.feature || '').toString().trim();
    if (evidenceFeature && evidenceFeature !== feature.folderName) {
      return false;
    }

    return (
      isNonEmptyStringValue(parsed.summary) &&
      isNonEmptyStringValue(parsed.featureIntentSummary) &&
      isNonEmptyStringValue(parsed.implementationFit) &&
      isNonEmptyStringValue(parsed.missingCases) &&
      typeof parsed.specAlignmentChecked === 'boolean' &&
      isNonNegativeIntegerValue(parsed.findingCount) &&
      isNonNegativeIntegerValue(parsed.blockingFindings) &&
      Array.isArray(parsed.files)
    );
  } catch {
    return false;
  }
}

function resolvePrePrReviewEvidencePath(feature: FeatureState): string | null {
  const docsRoot = feature.git.docsGitCwd;
  const candidates: string[] = [];
  const explicit = (feature.prePrReview.evidence || '').trim();
  if (explicit && explicit !== '-') {
    if (path.isAbsolute(explicit)) {
      candidates.push(explicit);
    } else {
      candidates.push(path.resolve(feature.path, explicit));
      candidates.push(path.resolve(docsRoot, explicit));
      const normalizedExplicit = explicit.replace(/\\/g, '/');
      if (normalizedExplicit.startsWith('docs/')) {
        const withoutDocsPrefix = normalizedExplicit.slice('docs/'.length);
        if (withoutDocsPrefix) {
          candidates.push(path.resolve(docsRoot, withoutDocsPrefix));
        }
      }
    }
  }
  candidates.push(path.join(feature.path, 'review-trace.json'));
  candidates.push(path.join(docsRoot, 'review-trace.json'));

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const abs = path.resolve(candidate);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (!fs.existsSync(abs)) continue;
    if (!abs.toLowerCase().endsWith('.json')) continue;
    if (!isLikelyCurrentPrePrReviewEvidence(abs, feature)) continue;
    const rel = path.relative(docsRoot, abs).replace(/\\/g, '/');
    if (rel && !rel.startsWith('../')) {
      return rel;
    }
    return abs.replace(/\\/g, '/');
  }
  return null;
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

function resolveTaskUiLabel(task?: FeatureState['activeTask']): string {
  if (!task) return 'T-unknown task';
  const id = task.id?.trim();
  const title = task.title.trim();
  const normalizedTitle = id
    ? title.replace(new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`), '')
    : title;
  if (id) return `${id} - ${normalizedTitle || title}`;
  return title || 'T-unknown task';
}

function getReviewFixCommitGuidance(
  feature: FeatureState,
  lang: Lang,
  options?: { prePr?: boolean }
): string {
  const prePr = !!options?.prePr;
  if (prePr) {
    return feature.issueNumber
      ? tr(lang, 'messages', 'prePrFixCommitIssueGuidance', {
          issueNumber: feature.issueNumber,
        })
      : tr(lang, 'messages', 'prePrFixCommitGuidance');
  }

  return feature.issueNumber
    ? tr(lang, 'messages', 'reviewFixCommitIssueGuidance', {
        issueNumber: feature.issueNumber,
      })
    : tr(lang, 'messages', 'reviewFixCommitGuidance');
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

function readGitText(
  ctx: Pick<CliContext, 'cmd'>,
  cwd: string,
  args: string[]
): string | undefined {
  try {
    const result = ctx.cmd.runSync('git', args, cwd);
    if (result.code !== 0) return undefined;
    if (!result.stdout) return undefined;
    return result.stdout;
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
  ctx: Pick<CliContext, 'cmd'>,
  feature: FeatureState
): number | undefined {
  const docsGitCwd = feature.git.docsGitCwd;
  const tasksRelativePath = normalizeGitRelativePath(
    path.join(feature.docs.featurePathFromDocs, 'tasks.md')
  );

  const diff = readGitText(ctx, docsGitCwd, [
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

  const removedByTask = new Map<
    string,
    Set<'TODO' | 'DOING' | 'DONE' | 'REVIEW'>
  >();
  const addedByTask = new Map<
    string,
    Set<'TODO' | 'DOING' | 'DONE' | 'REVIEW'>
  >();

  const parseTaskLine = (
    line: string
  ): { key: string; status: 'TODO' | 'DOING' | 'DONE' | 'REVIEW' } | null => {
    const match = line.match(
      /^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\]\s+(.+?)\s*$/i
    );
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
      removedStatuses.has('TODO') ||
      removedStatuses.has('DOING') ||
      removedStatuses.has('REVIEW');
    if (transitionedFromOpen) {
      doneTransitions += 1;
    }
  }

  return doneTransitions;
}

function checkTaskCommitGate(
  ctx: Pick<CliContext, 'cmd'>,
  feature: FeatureState
): TaskCommitGateCheck {
  const doneTransitions = countDoneTransitionsInLatestTasksCommit(ctx, feature);
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

  const latestProjectSubject = readGitText(ctx, projectGitCwd, args);
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

export function getStepDefinitions(ctx: CliContext): StepDefinition[] {
  const lang = ctx.config.lang;
  const workflow = ctx.config.workflow;
  const workflowPolicy = resolveWorkflowPolicy(workflow);
  const prePrReviewPolicy = resolvePrePrReviewPolicy(workflow);
  const taskCommitGatePolicy = resolveTaskCommitGatePolicy(workflow);
  const isTaskExecuteCurrent = (f: FeatureState): boolean =>
    f.docs.tasksExists &&
    f.tasks.total > 0 &&
    (f.tasks.done < f.tasks.total || !isCompletionChecklistDone(f)) &&
    isTasksDocApproved(f) &&
    (!workflowPolicy.requireBranch ||
      f.git.onExpectedBranch ||
      f.tasks.done === f.tasks.total);
  const isTaskExecuteWorktreeBlocked = (f: FeatureState): boolean =>
    isTaskExecuteCurrent(f) &&
    workflowPolicy.requireWorktree &&
    f.tasks.done < f.tasks.total &&
    !!f.issueNumber &&
    !f.git.projectInManagedWorktree;
  const isTaskExecuteFinalize = (f: FeatureState): boolean =>
    isTaskExecuteCurrent(f) &&
    f.tasks.total === f.tasks.done &&
    !isCompletionChecklistDone(f);
  const isTaskExecuteCommitPending = (f: FeatureState): boolean =>
    isTaskExecuteCurrent(f) &&
    ((isTaskExecuteFinalize(f) &&
      (f.git.docsHasUncommittedChanges || f.git.projectHasUncommittedChanges)) ||
      (!!f.nextTodoTask &&
        (f.git.docsHasUncommittedChanges || f.git.projectHasUncommittedChanges)));
  const isTaskExecuteStrictGateBlocked = (f: FeatureState): boolean => {
    if (!isTaskExecuteCurrent(f) || !f.nextTodoTask) return false;
    if (taskCommitGatePolicy === 'off' || !f.lastDoneTask || !f.git.docsGitCwd) {
      return false;
    }
    const commitGate = checkTaskCommitGate(ctx, f);
    return (
      !commitGate.pass &&
      shouldBlockTaskCommitGate(taskCommitGatePolicy, commitGate)
    );
  };
  const isTaskExecuteBlocked = (f: FeatureState): boolean =>
    isTaskExecuteWorktreeBlocked(f) ||
    isTaskExecuteStrictGateBlocked(f) ||
    (isTaskExecuteCurrent(f) &&
      ((isTaskExecuteFinalize(f) &&
        f.git.projectHasUncommittedChanges &&
        !f.git.projectGitCwd) ||
        (!!f.nextTodoTask &&
          f.git.projectHasUncommittedChanges &&
          !f.git.projectGitCwd)));
  const getTaskExecuteBlockedActions = (f: FeatureState): NextAction[] => {
    if (isTaskExecuteWorktreeBlocked(f)) {
      if (f.git.expectedWorktreePath) {
        return [
          {
            type: 'instruction',
            category: 'branch_create',
            requiresUserCheck: true,
            uiDetailKey: 'context.actionDetail.branchCreate',
            message: tr(lang, 'messages', 'moveToExistingWorktree', {
              worktreePath: f.git.expectedWorktreePath,
            }),
          },
        ];
      }
      if (!f.git.projectGitCwd) {
        return [
          {
            type: 'instruction',
            category: 'branch_create',
            requiresUserCheck: true,
            message: tr(lang, 'messages', 'standaloneNeedsProjectRoot'),
          },
        ];
      }
      if (f.git.onExpectedBranch) {
        return [
          {
            type: 'instruction',
            category: 'branch_create',
            requiresUserCheck: true,
            uiDetailKey: 'context.actionDetail.branchCreate',
            message: tr(lang, 'messages', 'worktreeRequiredFromMainBranch', {
              projectGitCwd: f.git.projectGitCwd,
              issueNumber: f.issueNumber,
              slug: f.slug,
            }),
          },
        ];
      }
      return [
        {
          type: 'command',
          category: 'branch_create',
          requiresUserCheck: true,
          scope: 'project',
          cwd: f.git.projectGitCwd,
          cmd: tr(lang, 'messages', 'createBranch', {
            projectGitCwd: f.git.projectGitCwd,
            issueNumber: f.issueNumber,
            slug: f.slug,
          }),
        },
      ];
    }

    if (isTaskExecuteStrictGateBlocked(f) && f.nextTodoTask) {
      const commitGate = checkTaskCommitGate(ctx, f);
      const reasonText = getTaskCommitGateReasonText(lang, commitGate);
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
        message: tr(lang, 'messages', 'standaloneNeedsProjectRoot'),
      },
    ];
  };
  const getTaskExecuteFinalizeActions = (f: FeatureState): NextAction[] => {
    if (f.git.docsHasUncommittedChanges || f.git.projectHasUncommittedChanges) {
      return getTaskExecuteCommitPendingActions(f);
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
        uiDetailKey: 'context.actionDetail.prMetadataMigratePrFields',
        message: tr(lang, 'messages', 'prLegacyAsk'),
      });
    }

    return actions;
  };
  const getTaskExecuteRunningActions = (f: FeatureState): NextAction[] => [
    {
      type: 'command',
      category: 'task_execute',
      operationType: 'local',
      requiresUserCheck: true,
      taskExecutePhase: 'complete',
      uiDetailKey: 'context.actionDetail.taskExecuteComplete',
      uiDetailParams: {
        task: resolveTaskUiLabel(f.activeTask),
      },
      scope: 'docs',
      cwd: f.git.docsGitCwd,
      cmd: buildSelfCliCommand(
        buildTaskCompleteCommandArgs(
          f,
          f.activeTask?.id || `T-${f.folderName}-active`
        )
      ),
    },
  ];
  const getTaskExecuteCommitPendingActions = (
    f: FeatureState
  ): NextAction[] => {
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
      const reviewIterationPhase = isReviewIterationPhase(f, workflowPolicy);
      const prePrFixIterationPhase = isPrePrFixIterationPhase(
        f,
        workflowPolicy,
        prePrReviewPolicy
      );
      if (reviewIterationPhase || prePrFixIterationPhase) {
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
            message: getReviewFixCommitGuidance(f, lang, {
              prePr: prePrFixIterationPhase,
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

    return [];
  };
  const getTaskExecuteRunActions = (f: FeatureState): NextAction[] => {
    if (
      taskCommitGatePolicy !== 'off' &&
      f.lastDoneTask &&
      f.nextTodoTask &&
      f.git.docsGitCwd
    ) {
      const commitGate = checkTaskCommitGate(ctx, f);
      if (!commitGate.pass) {
        const reasonText = getTaskCommitGateReasonText(lang, commitGate);
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
        type: 'command',
        category: 'task_execute',
        operationType: 'local',
        requiresUserCheck: true,
        taskExecutePhase: 'start',
        uiDetailKey: 'context.actionDetail.taskExecuteRun',
        uiDetailParams: {
          task: resolveTaskUiLabel(f.nextTodoTask),
        },
        scope: 'docs',
        cwd: f.git.docsGitCwd,
        cmd: buildSelfCliCommand(
          buildTaskRunCommandArgs(
            f,
            f.nextTodoTask?.id || `T-${f.folderName}-next`
          )
        ),
      },
    ];
  };
  const isPostTaskSyncCurrent = (f: FeatureState): boolean =>
    isImplementationDone(f) &&
    (f.git.docsHasUncommittedChanges || f.git.projectHasUncommittedChanges);
  const isPostTaskSyncDocs = (f: FeatureState): boolean =>
    isPostTaskSyncCurrent(f) && f.git.docsHasUncommittedChanges;
  const isPostTaskSyncReviewFix = (f: FeatureState): boolean =>
    isPostTaskSyncCurrent(f) &&
    !f.git.docsHasUncommittedChanges &&
    f.git.projectHasUncommittedChanges &&
    (isReviewIterationPhase(f, workflowPolicy) ||
      isPrePrFixIterationPhase(f, workflowPolicy, prePrReviewPolicy));
  const isPostTaskSyncProject = (f: FeatureState): boolean =>
    isPostTaskSyncCurrent(f) &&
    !f.git.docsHasUncommittedChanges &&
    f.git.projectHasUncommittedChanges &&
    !isPostTaskSyncReviewFix(f);
  const getPostTaskSyncDocsActions = (f: FeatureState): NextAction[] => [
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
  const getPostTaskSyncReviewFixActions = (f: FeatureState): NextAction[] => {
    const prePr = isPrePrFixIterationPhase(f, workflowPolicy, prePrReviewPolicy);
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
        message: getReviewFixCommitGuidance(f, lang, {
          prePr,
        }),
      },
    ];
  };
  const getPostTaskSyncProjectActions = (f: FeatureState): NextAction[] => {
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
  };
  const isPrePrReviewCurrent = (f: FeatureState): boolean =>
    prePrReviewPolicy.enabled &&
    workflowPolicy.requirePr &&
    f.docs.tasksExists &&
    f.tasks.total > 0 &&
    f.tasks.total === f.tasks.done &&
    isCompletionChecklistDone(f) &&
    !f.git.docsHasUncommittedChanges &&
    !f.git.projectHasUncommittedChanges &&
    (!isPrMetadataConfigured(f) || !f.pr.link) &&
    !isPrePrReviewSatisfied(f, prePrReviewPolicy);
  const isPrePrReviewMetadataMissing = (f: FeatureState): boolean =>
    isPrePrReviewCurrent(f) && !f.docs.prePrReviewFieldExists;
  const isPrePrReviewFixRequired = (f: FeatureState): boolean =>
    isPrePrReviewCurrent(f) &&
    !!f.prePrReview.decisionOutcome &&
    f.prePrReview.decisionOutcome !== 'approve';
  const isPrePrReviewRun = (f: FeatureState): boolean =>
    isPrePrReviewCurrent(f) &&
    f.docs.prePrReviewFieldExists &&
    !isPrePrReviewFixRequired(f) &&
    !resolvePrePrReviewEvidencePath(f) &&
    (prePrReviewPolicy.evidenceMode === 'path_required' ||
      prePrReviewPolicy.enforceExecutionEvidence);
  const isPrePrReviewRecord = (f: FeatureState): boolean =>
    isPrePrReviewCurrent(f) &&
    f.docs.prePrReviewFieldExists &&
    !isPrePrReviewFixRequired(f) &&
    (!!resolvePrePrReviewEvidencePath(f) ||
      (prePrReviewPolicy.evidenceMode === 'any' &&
        !prePrReviewPolicy.enforceExecutionEvidence));
  const getPrePrReviewMetadataActions = (): NextAction[] => [
    {
      type: 'instruction',
      category: 'pr_metadata_migrate',
      requiresUserCheck: true,
      uiDetailKey: 'context.actionDetail.prMetadataMigratePrePrReviewField',
      message: tr(lang, 'messages', 'prePrReviewFieldMissing'),
    },
  ];
  const getPrePrReviewFixActions = (f: FeatureState): NextAction[] => {
    const rerunEvidencePath =
      resolvePrePrReviewEvidencePath(f) || 'review-trace.json';
    const rerunCommand = buildSelfCliCommand(
      buildPrePrReviewCommandArgs(f, rerunEvidencePath, 'approve')
    );
    return [
      {
        type: 'instruction',
        category: 'review_fix_commit',
        requiresUserCheck: true,
        message: `${tr(lang, 'messages', 'prePrReviewFixRequired', {
          decision: f.prePrReview.decisionOutcome,
        })}\n${getReviewFixCommitGuidance(f, lang, {
          prePr: true,
        })}\n${tr(lang, 'messages', 'prePrReviewDecisionReconfirm', {
          decision: f.prePrReview.decisionOutcome,
          command: rerunCommand,
        })}`,
      },
    ];
  };
  const getPrePrReviewRunActions = (f: FeatureState): NextAction[] => [
    {
      type: 'command',
      category: 'pre_pr_review_run',
      operationType: 'local',
      requiresUserCheck: true,
      scope: 'docs',
      cwd: f.git.docsGitCwd,
      cmd: buildSelfCliCommand(buildPrePrReviewRunCommandArgs(f)),
    },
  ];
  const getPrePrReviewRecordActions = (f: FeatureState): NextAction[] => {
    const evidencePath = resolvePrePrReviewEvidencePath(f);
    return [
      {
        type: 'command',
        category: 'pre_pr_review_record',
        operationType: 'local',
        requiresUserCheck: true,
        scope: 'docs',
        cwd: f.git.docsGitCwd,
        cmd: buildSelfCliCommand(
          buildPrePrReviewCommandArgs(f, evidencePath ?? undefined)
        ),
      },
    ];
  };
  const isPrCreateCurrent = (f: FeatureState): boolean =>
    workflowPolicy.requirePr &&
    f.docs.tasksExists &&
    f.tasks.total > 0 &&
    f.tasks.total === f.tasks.done &&
    isCompletionChecklistDone(f) &&
    (!isPrMetadataConfigured(f) || !f.pr.link);
  const isPrCreateMetadataMissing = (f: FeatureState): boolean =>
    isPrCreateCurrent(f) && !isPrMetadataConfigured(f);
  const isPrCreateDocMissing = (f: FeatureState): boolean =>
    isPrCreateCurrent(f) && isPrMetadataConfigured(f) && !f.docs.prDocExists;
  const isPrCreateReady = (f: FeatureState): boolean =>
    isPrCreateCurrent(f) &&
    isPrMetadataConfigured(f) &&
    !!f.docs.prDocExists &&
    f.docs.prDocStatus === 'Ready';
  const isPrCreatePrepare = (f: FeatureState): boolean =>
    isPrCreateCurrent(f) &&
    isPrMetadataConfigured(f) &&
    !!f.docs.prDocExists &&
    f.docs.prDocStatus !== 'Ready';
  const isCodeReviewCurrent = (f: FeatureState): boolean =>
    workflowPolicy.requireMerge &&
    isPrMetadataConfigured(f) &&
    !!f.pr.link &&
    f.pr.status !== 'Approved';
  const isCodeReviewStatusMissing = (f: FeatureState): boolean =>
    isCodeReviewCurrent(f) && !f.pr.status;
  const isCodeReviewSyncApproved = (f: FeatureState): boolean =>
    isCodeReviewCurrent(f) &&
    f.pr.status === 'Review' &&
    workflowPolicy.requireReview &&
    !!f.pr.remote?.available &&
    f.pr.remote.isMerged;
  const isCodeReviewNeedEvidenceField = (f: FeatureState): boolean =>
    isCodeReviewCurrent(f) &&
    f.pr.status === 'Review' &&
    workflowPolicy.requireReview &&
    !f.docs.prReviewEvidenceFieldExists;
  const isCodeReviewNeedEvidence = (f: FeatureState): boolean =>
    isCodeReviewCurrent(f) &&
    f.pr.status === 'Review' &&
    workflowPolicy.requireReview &&
    !isCodeReviewNeedEvidenceField(f) &&
    !f.prReview.evidenceProvided;
  const isCodeReviewNeedDecisionField = (f: FeatureState): boolean =>
    isCodeReviewCurrent(f) &&
    f.pr.status === 'Review' &&
    workflowPolicy.requireReview &&
    !isCodeReviewNeedEvidenceField(f) &&
    f.prReview.evidenceProvided &&
    !f.docs.prReviewDecisionFieldExists;
  const isCodeReviewNeedDecision = (f: FeatureState): boolean =>
    isCodeReviewCurrent(f) &&
    f.pr.status === 'Review' &&
    workflowPolicy.requireReview &&
    !isCodeReviewNeedEvidenceField(f) &&
    f.prReview.evidenceProvided &&
    !isCodeReviewNeedDecisionField(f) &&
    !f.prReview.decisionProvided;
  const isCodeReviewRun = (f: FeatureState): boolean =>
    isCodeReviewCurrent(f) &&
    f.pr.status === 'Review' &&
    workflowPolicy.requireReview &&
    (f.git.projectBranchAhead || 0) === 0 &&
    !isCodeReviewNeedEvidenceField(f) &&
    !f.prReview.evidenceProvided &&
    !f.prReview.decisionProvided;
  const isCodeReviewFinalize = (f: FeatureState): boolean =>
    isCodeReviewCurrent(f) &&
    !isCodeReviewSyncApproved(f) &&
    (!workflowPolicy.requireReview ||
      (f.pr.status === 'Review' &&
        !isCodeReviewNeedEvidenceField(f) &&
        !isCodeReviewNeedEvidence(f) &&
        !isCodeReviewNeedDecisionField(f) &&
        !isCodeReviewNeedDecision(f) &&
        f.prReview.evidenceProvided &&
        f.prReview.decisionProvided));
  const isCodeReviewRequestReview = (f: FeatureState): boolean =>
    isCodeReviewCurrent(f) && !!f.pr.status && f.pr.status !== 'Review';
  const getCodeReviewRunActions = (f: FeatureState): NextAction[] => [
    {
      type: 'command',
      category: 'code_review_run',
      operationType: 'local',
      requiresUserCheck: true,
      scope: 'docs',
      cwd: f.git.docsGitCwd,
      cmd: buildSelfCliCommand(buildCodeReviewRunCommandArgs(f)),
    },
  ];
  const getCodeReviewFinalizeActions = (f: FeatureState): NextAction[] => {
    const remoteBlockReasons = getPrReviewRemoteBlockReasons(f, lang);
    const remoteUnavailable =
      workflowPolicy.mode === 'github' &&
      !!f.pr.link &&
      (!f.pr.remote || !f.pr.remote.available);
    const actions: NextAction[] = [];

    if (workflowPolicy.requireReview) {
      actions.push({
        type: 'instruction',
        category: 'code_review',
        requiresUserCheck: true,
        uiDetailKey: 'context.actionDetail.codeReviewResolve',
        message: getCodeReviewPrompt(lang),
      });
    }

    if (!f.git.projectGitCwd) {
      actions.push({
        type: 'instruction',
        category: 'code_review',
        requiresUserCheck: true,
        uiDetailKey: 'context.actionDetail.codeReviewNeedProjectRoot',
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
        uiDetailKey: 'context.actionDetail.codeReviewRemoteBlocked',
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
        uiDetailKey: 'context.actionDetail.codeReviewMergeAfterOk',
        message: tr(lang, 'messages', 'prReviewMerge', {
          featureRef: f.id || f.folderName,
        }),
      });
    }

    if (actions.length > 0) return actions;
    return [
      {
        type: 'instruction',
        category: 'code_review',
        requiresUserCheck: true,
        uiDetailKey: 'context.actionDetail.codeReviewMergeAfterOk',
        message: tr(lang, 'messages', 'prReviewMerge', {
          featureRef: f.id || f.folderName,
        }),
      },
    ];
  };

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
        done: (f) =>
          f.docs.tasksExists && f.tasks.total > 0 && isTasksDocApproved(f),
        detail: (f) => (f.tasks.total > 0 ? `(${f.tasks.total})` : ''),
      },
      current: {
        when: (f) =>
          f.planStatus === 'Approved' &&
          (!f.docs.tasksExists ||
            f.tasks.total === 0 ||
            (f.docs.tasksDocStatusFieldExists &&
              (!f.tasksDocStatus ||
                f.tasksDocStatus === 'Draft' ||
                f.tasksDocStatus === 'Review'))),
        actions: (f) => {
          if (!f.docs.tasksExists) {
            return [
              {
                type: 'instruction',
                category: 'tasks_write',
                uiDetailKey: 'context.actionDetail.tasksWriteCreate',
                message: tr(lang, 'messages', 'tasksCreate'),
              },
            ];
          }

          if (f.tasks.total === 0) {
            return [
              {
                type: 'instruction',
                category: 'tasks_write',
                uiDetailKey: 'context.actionDetail.tasksWriteNeedAtLeastOne',
                message: tr(lang, 'messages', 'tasksNeedAtLeastOne'),
              },
            ];
          }

          if (
            f.docs.tasksDocStatusFieldExists &&
            (!f.tasksDocStatus || f.tasksDocStatus === 'Draft')
          ) {
            return [
              {
                type: 'instruction',
                category: 'tasks_write',
                uiDetailKey: 'context.actionDetail.tasksWriteImprove',
                message: tr(lang, 'messages', 'tasksImprove'),
              },
            ];
          }

          if (
            f.docs.tasksDocStatusFieldExists &&
            f.tasksDocStatus === 'Review'
          ) {
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
              uiDetailKey: 'context.actionDetail.tasksWriteImprove',
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
                uiDetailKey: 'context.actionDetail.issueCreateAndWrite',
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
                uiDetailKey: 'context.actionDetail.issueCreateFromDoc',
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
              uiDetailKey: 'context.actionDetail.issueCreatePrepareFromDoc',
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
      substates: [
        {
          id: 'task_blocked',
          phase: 'blocked',
          owner: 'main',
          category: 'task_execute',
          when: (f) => isTaskExecuteBlocked(f),
          actions: (f) => getTaskExecuteBlockedActions(f),
        },
        {
          id: 'task_finalize',
          phase: 'finalize',
          owner: 'main',
          category: 'task_execute',
          when: (f) =>
            isTaskExecuteFinalize(f) && !isTaskExecuteCommitPending(f),
          actions: (f) => getTaskExecuteFinalizeActions(f),
        },
        {
          id: 'task_complete',
          phase: 'finalize',
          owner: 'main',
          category: 'task_execute',
          when: (f) => isTaskExecuteCurrent(f) && !!f.activeTask,
          actions: (f) => getTaskExecuteRunningActions(f),
        },
        {
          id: 'task_commit_pending',
          phase: 'commit_pending',
          owner: 'main',
          category: 'task_execute',
          when: (f) => isTaskExecuteCommitPending(f),
          actions: (f) => getTaskExecuteCommitPendingActions(f),
        },
        {
          id: 'task_run',
          phase: 'run',
          owner: 'subagent',
          category: 'task_execute',
          when: (f) =>
            isTaskExecuteCurrent(f) &&
            !!f.nextTodoTask &&
            !isTaskExecuteCommitPending(f),
          actions: (f) => getTaskExecuteRunActions(f),
        },
        {
          id: 'task_ready_fallback',
          phase: 'ready',
          owner: 'main',
          category: 'task_execute',
          when: (f) => isTaskExecuteCurrent(f),
          actions: (f) => [
            {
              type: 'instruction',
              category: 'task_execute',
              requiresUserCheck: true,
              message: tr(lang, 'messages', 'checkTaskStatuses', {
                done: f.tasks.done,
                total: f.tasks.total,
              }),
            },
          ],
        },
      ],
    },
    {
      step: 11,
      name: tr(lang, 'steps', 'docsCommitSync'),
      checklist: {
        done: (f) =>
          !f.git.docsHasUncommittedChanges &&
          !f.git.projectHasUncommittedChanges,
      },
      substates: [
        {
          id: 'post_task_sync_docs',
          phase: 'commit_pending',
          owner: 'main',
          category: 'docs_commit',
          when: (f) => isPostTaskSyncDocs(f),
          actions: (f) => getPostTaskSyncDocsActions(f),
        },
        {
          id: 'review_fix_loop',
          phase: 'commit_pending',
          owner: 'main',
          category: 'review_fix_commit',
          when: (f) => isPostTaskSyncReviewFix(f),
          actions: (f) => getPostTaskSyncReviewFixActions(f),
        },
        {
          id: 'post_task_sync_project',
          phase: 'commit_pending',
          owner: 'main',
          category: 'task_execute',
          when: (f) => isPostTaskSyncProject(f),
          actions: (f) => getPostTaskSyncProjectActions(f),
        },
      ],
    },
    {
      step: 12,
      name: tr(lang, 'steps', 'prePrReview'),
      checklist: {
        done: (f) => isPrePrReviewSatisfied(f, prePrReviewPolicy),
      },
      substates: [
        {
          id: 'pre_pr_review_migrate',
          phase: 'blocked',
          owner: 'main',
          category: 'pr_metadata_migrate',
          when: (f) => isPrePrReviewMetadataMissing(f),
          actions: () => getPrePrReviewMetadataActions(),
        },
        {
          id: 'pre_pr_fix_required',
          phase: 'blocked',
          owner: 'main',
          category: 'review_fix_commit',
          when: (f) => isPrePrReviewFixRequired(f),
          actions: (f) => getPrePrReviewFixActions(f),
        },
        {
          id: 'pre_pr_review_run',
          phase: 'run',
          owner: 'subagent',
          category: 'pre_pr_review_run',
          when: (f) => isPrePrReviewRun(f),
          actions: (f) => getPrePrReviewRunActions(f),
        },
        {
          id: 'pre_pr_review_record',
          phase: 'record',
          owner: 'main',
          category: 'pre_pr_review_record',
          when: (f) => isPrePrReviewRecord(f),
          actions: (f) => getPrePrReviewRecordActions(f),
        },
      ],
    },
    {
      step: 13,
      name: tr(lang, 'steps', 'prCreate'),
      checklist: {
        done: (f) =>
          !workflowPolicy.requirePr ||
          (isPrMetadataConfigured(f) && !!f.pr.link),
      },
      substates: [
        {
          id: 'pr_create_metadata_missing',
          phase: 'blocked',
          owner: 'main',
          category: 'pr_metadata_migrate',
          when: (f) => isPrCreateMetadataMissing(f),
          actions: () => [
            {
              type: 'instruction',
              category: 'pr_metadata_migrate',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.prMetadataMigratePrFields',
              message: tr(lang, 'messages', 'prLegacyAsk'),
            },
          ],
        },
        {
          id: 'pr_create_doc_missing',
          phase: 'ready',
          owner: 'main',
          category: 'pr_create',
          when: (f) => isPrCreateDocMissing(f),
          actions: (f) => [
            {
              type: 'instruction',
              category: 'pr_create',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.prCreateRequiredSequence',
              message: tr(lang, 'messages', 'prCreateRequiredSequence', {
                featureRef: f.id || f.folderName,
              }),
            },
          ],
        },
        {
          id: 'pr_create_ready',
          phase: 'ready',
          owner: 'main',
          category: 'pr_create',
          when: (f) => isPrCreateReady(f),
          actions: (f) => [
            {
              type: 'instruction',
              category: 'pr_create',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.prCreateExecuteFromDoc',
              message: tr(lang, 'messages', 'prCreateExecuteFromDoc', {
                featureRef: f.id || f.folderName,
              }),
            },
          ],
        },
        {
          id: 'pr_create_prepare',
          phase: 'ready',
          owner: 'main',
          category: 'pr_create',
          when: (f) => isPrCreatePrepare(f),
          actions: (f) => [
            {
              type: 'instruction',
              category: 'pr_create',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.prCreatePrepareFromDoc',
              message: tr(lang, 'messages', 'prCreatePrepareFromDoc', {
                featureRef: f.id || f.folderName,
              }),
            },
          ],
        },
      ],
    },
    {
      step: 14,
      name: tr(lang, 'steps', 'codeReview'),
      checklist: {
        done: (f) =>
          !workflowPolicy.requireMerge ||
          (isPrMetadataConfigured(f) && f.pr.status === 'Approved'),
      },
      substates: [
        {
          id: 'code_review_status_missing',
          phase: 'blocked',
          owner: 'main',
          category: 'pr_status_update',
          when: (f) => isCodeReviewStatusMissing(f),
          actions: () => [
            {
              type: 'instruction',
              category: 'pr_status_update',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.prStatusUpdateSetReview',
              message: tr(lang, 'messages', 'prFillStatus'),
            },
          ],
        },
        {
          id: 'code_review_sync_approved',
          phase: 'record',
          owner: 'main',
          category: 'pr_status_update',
          when: (f) => isCodeReviewSyncApproved(f),
          actions: () => [
            {
              type: 'instruction',
              category: 'pr_status_update',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.prStatusUpdateSyncApproved',
              message: tr(lang, 'messages', 'prReviewMergedSyncStatus'),
            },
          ],
        },
        {
          id: 'code_review_need_evidence_field',
          phase: 'blocked',
          owner: 'main',
          category: 'code_review',
          when: (f) => isCodeReviewNeedEvidenceField(f),
          actions: () => [
            {
              type: 'instruction',
              category: 'code_review',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.codeReviewNeedEvidenceField',
              message: tr(lang, 'messages', 'prReviewEvidenceFieldMissing'),
            },
          ],
        },
        {
          id: 'code_review_run',
          phase: 'run',
          owner: 'subagent',
          category: 'code_review_run',
          when: (f) => isCodeReviewRun(f),
          actions: (f) => getCodeReviewRunActions(f),
        },
        {
          id: 'code_review_need_evidence',
          phase: 'blocked',
          owner: 'main',
          category: 'code_review',
          when: (f) => isCodeReviewNeedEvidence(f),
          actions: () => [
            {
              type: 'instruction',
              category: 'code_review',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.codeReviewNeedEvidence',
              message: tr(lang, 'messages', 'prReviewEvidenceMissing'),
            },
          ],
        },
        {
          id: 'code_review_need_decision_field',
          phase: 'blocked',
          owner: 'main',
          category: 'code_review',
          when: (f) => isCodeReviewNeedDecisionField(f),
          actions: () => [
            {
              type: 'instruction',
              category: 'code_review',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.codeReviewNeedDecisionField',
              message: tr(lang, 'messages', 'prReviewDecisionFieldMissing'),
            },
          ],
        },
        {
          id: 'code_review_need_decision',
          phase: 'blocked',
          owner: 'main',
          category: 'code_review',
          when: (f) => isCodeReviewNeedDecision(f),
          actions: () => [
            {
              type: 'instruction',
              category: 'code_review',
              requiresUserCheck: true,
              uiDetailKey: 'context.actionDetail.codeReviewNeedDecision',
              message: tr(lang, 'messages', 'prReviewDecisionMissing'),
            },
          ],
        },
        {
          id: 'code_review_finalize',
          phase: 'finalize',
          owner: 'main',
          category: 'code_review',
          when: (f) => isCodeReviewFinalize(f),
          actions: (f) => getCodeReviewFinalizeActions(f),
        },
        {
          id: 'code_review_request_review',
          phase: 'ready',
          owner: 'main',
          category: 'code_review',
          when: (f) => isCodeReviewRequestReview(f),
          actions: () => [
            {
              type: 'instruction',
              category: 'code_review',
              uiDetailKey: 'context.actionDetail.codeReviewRequestReview',
              message: tr(lang, 'messages', 'prRequestReview'),
            },
          ],
        },
      ],
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

export function getStepsMap(ctx: CliContext): Record<number, string> {
  return Object.fromEntries(
    getStepDefinitions(ctx).map((d) => [d.step, d.name])
  );
}

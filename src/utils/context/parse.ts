import fs from 'fs-extra';
import path from 'path';
import { tr } from '../i18n.js';
import {
  getGitStatusPorcelain,
  getLastCommitForPath,
  isExpectedFeatureBranch,
  isGitPathIgnored,
} from './git.js';
import { resolveFeatureProgress } from './progress.js';
import {
  CompletionChecklistSummary,
  DocStatus,
  FeatureContext,
  FeatureState,
  Lang,
  RepoType,
  StepDefinition,
  TaskRef,
} from './types.js';
import { ProjectConfig } from '../config.js';
import { resolveWorkflowPolicy } from '../workflow.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSpecValue(content: string, key: string): string | undefined {
  const regex = new RegExp(
    `^\\s*-\\s*\\*\\*${escapeRegExp(key)}\\*\\*\\s*:\\s*(.*)$`,
    'm'
  );
  const match = content.match(regex);
  return match ? match[1].trim() : undefined;
}

function hasSpecKey(content: string, key: string): boolean {
  const regex = new RegExp(
    `^\\s*-\\s*\\*\\*${escapeRegExp(key)}\\*\\*\\s*:`,
    'm'
  );
  return regex.test(content);
}

function hasAnySpecKey(content: string, keys: string[]): boolean {
  return keys.some((key) => hasSpecKey(content, key));
}

function extractFirstSpecValue(content: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = extractSpecValue(content, key);
    if (value) return value;
  }
  return undefined;
}

function parseDocStatus(value: string | undefined): DocStatus | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.includes('|')) return undefined;

  const match = trimmed.match(/\b(Draft|Review|Approved)\b/i);
  if (!match) return undefined;
  const normalized = match[1].toLowerCase();
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'review') return 'Review';
  return 'Approved';
}

function parseIssueNumber(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/#?(\d+)/);
  return match ? match[1] : undefined;
}

function parsePrLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed === '#' || trimmed === '-') return undefined;
  // Common placeholders that shouldn't count as "PR exists"
  // e.g. "#TBD", "TBD", "TODO", "N/A", "미정", "없음"
  if (/^(?:#\s*)?(?:tbd|todo|n\/a|na|none|pending|미정|없음)$/i.test(trimmed)) {
    return undefined;
  }
  if (trimmed.includes('{') || trimmed.includes('}')) return undefined;
  return trimmed;
}

function parseTasks(content: string): {
  summary: FeatureState['tasks'];
  activeTask?: TaskRef;
  nextTodoTask?: TaskRef;
} {
  const summary = { total: 0, todo: 0, doing: 0, done: 0 };
  let activeTask: TaskRef | undefined;
  let nextTodoTask: TaskRef | undefined;

  const lines = content.split('\n');
  let inCodeBlock = false;
  for (const line of lines) {
    // Ignore fenced code blocks (templates/examples).
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^\s*-\s*\[([A-Z]+)\]((?:\[[^\]]+\])*)\s*(.+?)\s*$/);
    if (!match) continue;

    const status = match[1].toUpperCase();
    const title = match[3].trim();

    summary.total++;
    if (status === 'DONE') summary.done++;
    else if (status === 'DOING' || status === 'REVIEW') summary.doing++;
    else if (status === 'TODO') summary.todo++;

    if (!activeTask && (status === 'DOING' || status === 'REVIEW')) {
      activeTask = { status: status as TaskRef['status'], title };
    }
    if (!nextTodoTask && status === 'TODO') {
      nextTodoTask = { status: 'TODO', title };
    }
  }

  return { summary, activeTask, nextTodoTask };
}

function parseCompletionChecklist(content: string): CompletionChecklistSummary | undefined {
  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) =>
    /^\s*##\s+(완료 조건|Completion Criteria)\s*$/.test(line)
  );
  if (startIndex === -1) return undefined;

  let total = 0;
  let checked = 0;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*##\s+/.test(line)) break;

    const match = line.match(/^\s*-\s*\[([ xX])\]\s+/);
    if (!match) continue;
    total++;
    if (match[1].toLowerCase() === 'x') checked++;
  }

  return total > 0 ? { total, checked } : undefined;
}

function isCompletionChecklistDone(feature: {
  completionChecklist?: CompletionChecklistSummary;
}): boolean {
  return (
    !!feature.completionChecklist &&
    feature.completionChecklist.total > 0 &&
    feature.completionChecklist.checked === feature.completionChecklist.total
  );
}

function isPrMetadataConfigured(feature: {
  docs: { prFieldExists: boolean; prStatusFieldExists: boolean };
}): boolean {
  return feature.docs.prFieldExists && feature.docs.prStatusFieldExists;
}

export async function parseFeature(
  featurePath: string,
  type: RepoType,
  context: {
    projectBranch: string;
    docsBranch: string;
    docsGitCwd: string;
    projectGitCwd?: string;
    docsDir: string;
    projectBranchAvailable: boolean;
  },
  options: {
    lang: Lang;
    stepDefinitions: StepDefinition[];
    approval?: ProjectConfig['approval'];
    workflow?: ProjectConfig['workflow'];
  }
): Promise<FeatureContext> {
  const lang = options.lang;
  const workflowPolicy = resolveWorkflowPolicy(options.workflow);
  const folderName = path.basename(featurePath);
  const match = folderName.match(/^(F\d+)-(.+)$/);
  const id = match?.[1];
  const slug = match?.[2] || folderName;

  const specPath = path.join(featurePath, 'spec.md');
  const planPath = path.join(featurePath, 'plan.md');
  const tasksPath = path.join(featurePath, 'tasks.md');

  let specStatus: DocStatus | undefined;
  let issueNumber: string | undefined;
  const specExists = await fs.pathExists(specPath);

  if (specExists) {
    const content = await fs.readFile(specPath, 'utf-8');
    const statusValue = extractFirstSpecValue(content, ['상태', 'Status']);
    specStatus = parseDocStatus(statusValue);

    const issueValue = extractFirstSpecValue(content, ['이슈 번호', 'Issue Number', 'Issue']);
    issueNumber = parseIssueNumber(issueValue);
  }

  let planStatus: DocStatus | undefined;
  const planExists = await fs.pathExists(planPath);

  if (planExists) {
    const content = await fs.readFile(planPath, 'utf-8');
    const statusValue = extractFirstSpecValue(content, ['상태', 'Status']);
    planStatus = parseDocStatus(statusValue);
  }

  const tasksExists = await fs.pathExists(tasksPath);
  const tasksSummary = { total: 0, todo: 0, doing: 0, done: 0 };
  let activeTask: TaskRef | undefined;
  let nextTodoTask: TaskRef | undefined;
  let tasksDocStatus: DocStatus | undefined;
  let tasksDocStatusFieldExists = false;
  let completionChecklist: CompletionChecklistSummary | undefined;
  let prLink: string | undefined;
  let prStatus: DocStatus | undefined;
  let prFieldExists = false;
  let prStatusFieldExists = false;

  if (tasksExists) {
    const content = await fs.readFile(tasksPath, 'utf-8');
    const { summary, activeTask: active, nextTodoTask: nextTodo } = parseTasks(content);
    tasksSummary.total = summary.total;
    tasksSummary.todo = summary.todo;
    tasksSummary.doing = summary.doing;
    tasksSummary.done = summary.done;
    activeTask = active;
    nextTodoTask = nextTodo;
    completionChecklist = parseCompletionChecklist(content);

    if (!issueNumber) {
      const issueValue = extractFirstSpecValue(content, ['이슈 번호', 'Issue Number', 'Issue']);
      issueNumber = parseIssueNumber(issueValue);
    }

    const tasksDocStatusValue = extractFirstSpecValue(content, ['문서 상태', 'Doc Status']);
    tasksDocStatusFieldExists = hasAnySpecKey(content, ['문서 상태', 'Doc Status']);
    tasksDocStatus = parseDocStatus(tasksDocStatusValue);

    const prValue = extractFirstSpecValue(content, ['PR', 'Pull Request']);
    prFieldExists = hasAnySpecKey(content, ['PR', 'Pull Request']);
    prLink = parsePrLink(prValue);

    const prStatusValue = extractFirstSpecValue(content, ['PR 상태', 'PR Status']);
    prStatusFieldExists = hasAnySpecKey(content, ['PR 상태', 'PR Status']);
    prStatus = parseDocStatus(prStatusValue);
  }

  const warnings: string[] = [];
  if (context.projectBranchAvailable === false) {
    warnings.push(tr(lang, 'warnings', 'projectBranchUnavailable'));
  }

  const onExpectedBranch = isExpectedFeatureBranch(
    context.projectBranch,
    issueNumber,
    slug,
    folderName
  );

  const relativeFeaturePathFromDocs = path.relative(context.docsDir, featurePath);
  const docsPathIgnored = isGitPathIgnored(
    context.docsGitCwd,
    relativeFeaturePathFromDocs
  );
  const docsStatus = getGitStatusPorcelain(context.docsGitCwd, [relativeFeaturePathFromDocs]);
  const docsHasUncommittedChanges = docsStatus === undefined ? true : docsStatus.trim().length > 0;
  const docsLastCommit = getLastCommitForPath(
    context.docsGitCwd,
    relativeFeaturePathFromDocs
  );
  const docsEverCommitted = !!docsLastCommit;
  if (docsStatus === undefined) {
    warnings.push(tr(lang, 'warnings', 'docsGitUnavailable'));
  }
  if (docsPathIgnored === true) {
    warnings.push(
      tr(lang, 'warnings', 'docsPathIgnored', {
        path: relativeFeaturePathFromDocs,
      })
    );
  }
  if (tasksExists && workflowPolicy.requirePr && (!prFieldExists || !prStatusFieldExists)) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrFields'));
  }
  if (tasksExists && !tasksDocStatusFieldExists) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksDocStatusField'));
  }

  if (docsEverCommitted && docsHasUncommittedChanges) {
    warnings.push(tr(lang, 'warnings', 'docsUncommittedChanges'));
  }

  const tasksDocApproved = !tasksDocStatusFieldExists || tasksDocStatus === 'Approved';
  const implementationDone =
    tasksExists &&
    tasksSummary.total > 0 &&
    tasksSummary.total === tasksSummary.done &&
    isCompletionChecklistDone({ completionChecklist }) &&
    tasksDocApproved;

  const workflowDone =
    implementationDone &&
    specStatus === 'Approved' &&
    planStatus === 'Approved' &&
    (!workflowPolicy.requireIssue || !!issueNumber) &&
    (!workflowPolicy.requirePr ||
      (isPrMetadataConfigured({ docs: { prFieldExists, prStatusFieldExists } }) &&
        !!prLink)) &&
    (!workflowPolicy.requireReview || prStatus === 'Approved');

  if (implementationDone && !workflowDone) {
    if (specStatus !== 'Approved') {
      warnings.push(tr(lang, 'warnings', 'workflowSpecNotApproved'));
    }
    if (planStatus !== 'Approved') {
      warnings.push(tr(lang, 'warnings', 'workflowPlanNotApproved'));
    }

    if (workflowPolicy.requireIssue && !issueNumber) {
      warnings.push(tr(lang, 'warnings', 'workflowIssueMissing'));
    }

    // PR 필드가 없다면 legacyTasksPrFields가 이미 경고로 올라감
    if (workflowPolicy.requirePr && prFieldExists && prStatusFieldExists) {
      if (!prLink) warnings.push(tr(lang, 'warnings', 'workflowPrLinkMissing'));
      if (workflowPolicy.requireReview) {
        if (!prStatus) warnings.push(tr(lang, 'warnings', 'workflowPrStatusMissing'));
        if (prStatus && prStatus !== 'Approved') {
          warnings.push(tr(lang, 'warnings', 'workflowPrStatusNotApproved'));
        }
      }
    }
  }

  const featureState: FeatureState = {
    id,
    slug,
    folderName,
    type,
    path: featurePath,
    completion: {
      implementationDone,
      workflowDone,
    },
    issueNumber,
    specStatus,
    planStatus,
    tasksDocStatus,
    tasks: tasksSummary,
    activeTask,
    nextTodoTask,
    completionChecklist,
    pr: { link: prLink, status: prStatus },
    git: {
      docsBranch: context.docsBranch,
      projectBranch: context.projectBranch,
      projectBranchAvailable: context.projectBranchAvailable,
      docsGitCwd: context.docsGitCwd,
      projectGitCwd: context.projectGitCwd,
      onExpectedBranch,
      docsEverCommitted,
      docsHasUncommittedChanges,
      docsPathIgnored: docsPathIgnored === true,
    },
    docs: {
      featurePathFromDocs: relativeFeaturePathFromDocs,
      specExists,
      planExists,
      tasksExists,
      tasksDocStatusFieldExists,
      prFieldExists,
      prStatusFieldExists,
    },
  };

  const { currentStep, actions, nextAction } = resolveFeatureProgress(
    featureState,
    options.stepDefinitions,
    lang,
    options.approval
  );

  return { ...featureState, currentStep, actions, nextAction, warnings };
}

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
  PrePrReviewFindings,
  PrePrReviewStatus,
  RepoType,
  StepDefinition,
  TaskRef,
} from './types.js';
import { ProjectConfig } from '../config.js';
import {
  resolveCodeDirtyScopePolicy,
  resolvePrePrReviewPolicy,
  resolveWorkflowPolicy,
} from '../workflow.js';

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

function parsePrePrReviewStatus(
  value: string | undefined
): PrePrReviewStatus | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('|')) return undefined;
  if (/^done$/i.test(trimmed)) return 'Done';
  if (/^pending$/i.test(trimmed)) return 'Pending';
  return undefined;
}

function parsePrePrFindings(
  value: string | undefined
): PrePrReviewFindings | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('|')) return undefined;

  const majorMatch = trimmed.match(/\bmajor\s*[:=]\s*(\d+)\b/i);
  const minorMatch = trimmed.match(/\bminor\s*[:=]\s*(\d+)\b/i);
  if (!majorMatch || !minorMatch) return undefined;

  const major = Number(majorMatch[1]);
  const minor = Number(minorMatch[1]);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return undefined;
  if (major < 0 || minor < 0) return undefined;
  return { major, minor };
}

function isPlaceholderReviewEvidence(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(?:-|#)?\s*(?:tbd|todo|n\/a|na|none|pending|미정|없음|-)\s*$/i.test(
    trimmed
  );
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

function normalizeGitPath(value: string): string {
  return value.split(path.sep).join('/');
}

function resolveProjectStatusPaths(
  projectGitCwd: string,
  docsDir: string
): string[] {
  const relativeDocsDir = path.relative(projectGitCwd, docsDir);
  if (!relativeDocsDir) return [];
  if (path.isAbsolute(relativeDocsDir)) return [];
  if (relativeDocsDir === '..' || relativeDocsDir.startsWith(`..${path.sep}`)) {
    return [];
  }

  const normalizedDocsDir = normalizeGitPath(relativeDocsDir).replace(/\/+$/, '');
  if (!normalizedDocsDir) return [];
  return ['.', `:(exclude)${normalizedDocsDir}/**`];
}

function uniqueNormalizedPaths(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeGitPath(value).replace(/^\.\/+/, '').replace(/\/+$/, '');
    if (!normalized || normalized === '.' || normalized === '..') continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

const PROJECT_DIRTY_STATUS_CACHE = new Map<
  string,
  { hasUncommittedChanges: boolean; statusUnavailable: boolean }
>();

const COMPONENT_STATUS_PATH_CACHE = new Map<string, string[]>();

async function resolveComponentStatusPaths(
  projectGitCwd: string,
  component: string,
  workflow?: ProjectConfig['workflow']
): Promise<string[]> {
  const configured = workflow?.componentPaths?.[component];
  const configuredCandidates = Array.isArray(configured)
    ? configured.map((value) => String(value).trim()).filter(Boolean)
    : [];

  const candidates =
    configuredCandidates.length > 0
      ? configuredCandidates
      : [
          component,
          `apps/${component}`,
          `packages/${component}`,
          `services/${component}`,
          `modules/${component}`,
        ];

  const normalizedCandidates = uniqueNormalizedPaths(
    candidates
      .map((candidate) => {
        if (!candidate) return '';
        if (!path.isAbsolute(candidate)) return candidate;
        const relative = path.relative(projectGitCwd, candidate);
        if (!relative) return '';
        if (relative === '..' || relative.startsWith(`..${path.sep}`)) return '';
        return relative;
      })
      .filter(Boolean)
  );

  const cacheKey = JSON.stringify({
    projectGitCwd,
    component,
    normalizedCandidates,
  });
  const cached = COMPONENT_STATUS_PATH_CACHE.get(cacheKey);
  if (cached) return [...cached];

  const existing: string[] = [];
  for (const candidate of normalizedCandidates) {
    if (await fs.pathExists(path.join(projectGitCwd, candidate))) {
      existing.push(candidate);
    }
  }
  COMPONENT_STATUS_PATH_CACHE.set(cacheKey, [...existing]);
  return existing;
}

function parseTasks(content: string): {
  summary: FeatureState['tasks'];
  activeTask?: TaskRef;
  lastDoneTask?: TaskRef;
  nextTodoTask?: TaskRef;
} {
  const summary = { total: 0, todo: 0, doing: 0, done: 0 };
  let activeTask: TaskRef | undefined;
  let lastDoneTask: TaskRef | undefined;
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
    const taskIdMatch = title.match(/\b(T-[A-Za-z0-9-]+)\b/);
    const taskId = taskIdMatch ? taskIdMatch[1] : undefined;

    summary.total++;
    if (status === 'DONE') summary.done++;
    else if (status === 'DOING' || status === 'REVIEW') summary.doing++;
    else if (status === 'TODO') summary.todo++;

    if (!activeTask && (status === 'DOING' || status === 'REVIEW')) {
      activeTask = { id: taskId, status: status as TaskRef['status'], title };
    }
    if (status === 'DONE') {
      lastDoneTask = { id: taskId, status: 'DONE', title };
    }
    if (!nextTodoTask && status === 'TODO') {
      nextTodoTask = { id: taskId, status: 'TODO', title };
    }
  }

  return { summary, activeTask, lastDoneTask, nextTodoTask };
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

function isPrePrReviewSatisfied(
  feature: {
    docs: {
      prePrReviewFieldExists: boolean;
      prePrFindingsFieldExists: boolean;
      prePrEvidenceFieldExists: boolean;
    };
    prePrReview: {
      status?: PrePrReviewStatus;
      findings?: PrePrReviewFindings;
      evidenceProvided: boolean;
    };
  },
  policy: ReturnType<typeof resolvePrePrReviewPolicy>
): boolean {
  if (!policy.enabled) return true;
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
  if (policy.blockOnFindings && feature.prePrReview.findings.major > 0) {
    return false;
  }
  if (
    policy.minorPolicy === 'block' &&
    feature.prePrReview.findings.minor > 0
  ) {
    return false;
  }
  return true;
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
    docsPathIgnored?: boolean;
    docsHasUncommittedChanges?: boolean;
    docsEverCommitted?: boolean;
    docsGitUnavailable?: boolean;
    projectHasUncommittedChanges?: boolean;
    projectStatusUnavailable?: boolean;
  },
  options: {
    lang: Lang;
    stepDefinitions: StepDefinition[];
    approval?: ProjectConfig['approval'];
    workflow?: ProjectConfig['workflow'];
    projectType: 'single' | 'multi';
  }
): Promise<FeatureContext> {
  const lang = options.lang;
  const workflowPolicy = resolveWorkflowPolicy(options.workflow);
  const prePrReviewPolicy = resolvePrePrReviewPolicy(options.workflow);
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
  let lastDoneTask: TaskRef | undefined;
  let nextTodoTask: TaskRef | undefined;
  let tasksDocStatus: DocStatus | undefined;
  let tasksDocStatusFieldExists = false;
  let completionChecklist: CompletionChecklistSummary | undefined;
  let prePrReviewStatus: PrePrReviewStatus | undefined;
  let prePrFindings: PrePrReviewFindings | undefined;
  let prePrEvidence: string | undefined;
  let prePrEvidenceProvided = false;
  let prLink: string | undefined;
  let prStatus: DocStatus | undefined;
  let prFieldExists = false;
  let prStatusFieldExists = false;
  let prePrReviewFieldExists = false;
  let prePrFindingsFieldExists = false;
  let prePrEvidenceFieldExists = false;

  if (tasksExists) {
    const content = await fs.readFile(tasksPath, 'utf-8');
    const {
      summary,
      activeTask: active,
      lastDoneTask: lastDone,
      nextTodoTask: nextTodo,
    } = parseTasks(content);
    tasksSummary.total = summary.total;
    tasksSummary.todo = summary.todo;
    tasksSummary.doing = summary.doing;
    tasksSummary.done = summary.done;
    activeTask = active;
    lastDoneTask = lastDone;
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

    const prePrReviewValue = extractFirstSpecValue(content, [
      'PR 전 리뷰',
      'Pre-PR Review',
    ]);
    prePrReviewFieldExists = hasAnySpecKey(content, [
      'PR 전 리뷰',
      'Pre-PR Review',
    ]);
    prePrReviewStatus = parsePrePrReviewStatus(prePrReviewValue);

    const prePrFindingsValue = extractFirstSpecValue(content, [
      'PR 전 리뷰 Findings',
      'Pre-PR Findings',
    ]);
    prePrFindingsFieldExists = hasAnySpecKey(content, [
      'PR 전 리뷰 Findings',
      'Pre-PR Findings',
    ]);
    prePrFindings = parsePrePrFindings(prePrFindingsValue);

    const prePrEvidenceValue = extractFirstSpecValue(content, [
      'PR 전 리뷰 Evidence',
      'Pre-PR Evidence',
    ]);
    prePrEvidenceFieldExists = hasAnySpecKey(content, [
      'PR 전 리뷰 Evidence',
      'Pre-PR Evidence',
    ]);
    prePrEvidence = prePrEvidenceValue?.trim();
    prePrEvidenceProvided = !isPlaceholderReviewEvidence(prePrEvidenceValue);
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
  const normalizedFeaturePathFromDocs = normalizeGitPath(relativeFeaturePathFromDocs);
  const docsPathIgnored =
    typeof context.docsPathIgnored === 'boolean'
      ? context.docsPathIgnored
      : isGitPathIgnored(context.docsGitCwd, normalizedFeaturePathFromDocs);

  let docsHasUncommittedChanges =
    typeof context.docsHasUncommittedChanges === 'boolean'
      ? context.docsHasUncommittedChanges
      : false;
  let docsEverCommitted =
    typeof context.docsEverCommitted === 'boolean'
      ? context.docsEverCommitted
      : false;
  let docsGitUnavailable = !!context.docsGitUnavailable;

  if (typeof context.docsHasUncommittedChanges !== 'boolean') {
    const docsStatus = getGitStatusPorcelain(context.docsGitCwd, [normalizedFeaturePathFromDocs]);
    if (docsStatus === undefined) {
      docsGitUnavailable = true;
      docsHasUncommittedChanges = true;
    } else {
      docsHasUncommittedChanges = docsStatus.trim().length > 0;
    }
  }

  if (typeof context.docsEverCommitted !== 'boolean') {
    const docsLastCommit = getLastCommitForPath(
      context.docsGitCwd,
      normalizedFeaturePathFromDocs
    );
    docsEverCommitted = !!docsLastCommit;
  }

  let projectHasUncommittedChanges =
    typeof context.projectHasUncommittedChanges === 'boolean'
      ? context.projectHasUncommittedChanges
      : false;
  let projectStatusUnavailable = !!context.projectStatusUnavailable;

  if (
    typeof context.projectHasUncommittedChanges !== 'boolean' &&
    context.projectGitCwd
  ) {
    const dirtyScopePolicy = resolveCodeDirtyScopePolicy(options.workflow, options.projectType);
    const projectCacheKey = JSON.stringify({
      projectGitCwd: context.projectGitCwd,
      docsDir: context.docsDir,
      type,
      dirtyScopePolicy,
      componentPaths: options.workflow?.componentPaths?.[type] || [],
    });
    const cachedStatus = PROJECT_DIRTY_STATUS_CACHE.get(projectCacheKey);
    if (cachedStatus) {
      projectHasUncommittedChanges = cachedStatus.hasUncommittedChanges;
      projectStatusUnavailable = cachedStatus.statusUnavailable;
    } else {
      let projectStatusPaths: string[] = [];
      if (dirtyScopePolicy === 'component' && type !== 'single') {
        const componentStatusPaths = await resolveComponentStatusPaths(
          context.projectGitCwd,
          type,
          options.workflow
        );
        projectStatusPaths =
          componentStatusPaths.length > 0
            ? componentStatusPaths
            : resolveProjectStatusPaths(context.projectGitCwd, context.docsDir);
      } else {
        projectStatusPaths = resolveProjectStatusPaths(
          context.projectGitCwd,
          context.docsDir
        );
      }
      const projectStatus = getGitStatusPorcelain(
        context.projectGitCwd,
        projectStatusPaths
      );
      projectStatusUnavailable = projectStatus === undefined;
      projectHasUncommittedChanges =
        projectStatus === undefined ? false : projectStatus.trim().length > 0;
      PROJECT_DIRTY_STATUS_CACHE.set(projectCacheKey, {
        hasUncommittedChanges: projectHasUncommittedChanges,
        statusUnavailable: projectStatusUnavailable,
      });
    }
  }

  if (docsGitUnavailable) {
    warnings.push(tr(lang, 'warnings', 'docsGitUnavailable'));
  }
  if (docsPathIgnored === true) {
    warnings.push(
      tr(lang, 'warnings', 'docsPathIgnored', {
        path: normalizedFeaturePathFromDocs,
      })
    );
  }
  if (tasksExists && workflowPolicy.requirePr && (!prFieldExists || !prStatusFieldExists)) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrFields'));
  }
  if (tasksExists && prePrReviewPolicy.enabled && !prePrReviewFieldExists) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrePrReviewField'));
  }
  if (tasksExists && prePrReviewPolicy.enabled && !prePrFindingsFieldExists) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrePrFindingsField'));
  }
  if (tasksExists && prePrReviewPolicy.enabled && !prePrEvidenceFieldExists) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksPrePrEvidenceField'));
  }
  if (tasksExists && !tasksDocStatusFieldExists) {
    warnings.push(tr(lang, 'warnings', 'legacyTasksDocStatusField'));
  }

  if (docsEverCommitted && docsHasUncommittedChanges) {
    warnings.push(tr(lang, 'warnings', 'docsUncommittedChanges'));
  }
  if (projectHasUncommittedChanges) {
    warnings.push(tr(lang, 'warnings', 'projectUncommittedChanges'));
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
    !docsHasUncommittedChanges &&
    !projectHasUncommittedChanges &&
    specStatus === 'Approved' &&
    planStatus === 'Approved' &&
    (!workflowPolicy.requireIssue || !!issueNumber) &&
    (!workflowPolicy.requirePr ||
      (isPrMetadataConfigured({ docs: { prFieldExists, prStatusFieldExists } }) &&
        !!prLink)) &&
    (!workflowPolicy.requireReview || prStatus === 'Approved') &&
    isPrePrReviewSatisfied(
      {
        docs: {
          prePrReviewFieldExists,
          prePrFindingsFieldExists,
          prePrEvidenceFieldExists,
        },
        prePrReview: {
          status: prePrReviewStatus,
          findings: prePrFindings,
          evidenceProvided: prePrEvidenceProvided,
        },
      },
      prePrReviewPolicy
    );

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
    if (projectHasUncommittedChanges) {
      warnings.push(tr(lang, 'warnings', 'workflowProjectUncommittedChanges'));
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
    if (prePrReviewPolicy.enabled) {
      if (!prePrReviewFieldExists) {
        warnings.push(tr(lang, 'warnings', 'workflowPrePrReviewMissing'));
      } else if (prePrReviewStatus !== 'Done') {
        warnings.push(tr(lang, 'warnings', 'workflowPrePrReviewNotDone'));
      } else if (!prePrFindingsFieldExists || !prePrFindings) {
        warnings.push(tr(lang, 'warnings', 'workflowPrePrFindingsMissing'));
      } else if (!prePrEvidenceFieldExists || !prePrEvidenceProvided) {
        warnings.push(tr(lang, 'warnings', 'workflowPrePrEvidenceMissing'));
      } else if (prePrReviewPolicy.blockOnFindings && prePrFindings.major > 0) {
        warnings.push(
          tr(lang, 'warnings', 'workflowPrePrFindingsBlocked', {
            count: prePrFindings.major,
          })
        );
      } else if (
        prePrReviewPolicy.minorPolicy === 'block' &&
        prePrFindings.minor > 0
      ) {
        warnings.push(
          tr(lang, 'warnings', 'workflowPrePrMinorFindingsBlocked', {
            count: prePrFindings.minor,
          })
        );
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
    lastDoneTask,
    nextTodoTask,
    completionChecklist,
    prePrReview: {
      status: prePrReviewStatus,
      findings: prePrFindings,
      evidence: prePrEvidence,
      evidenceProvided: prePrEvidenceProvided,
    },
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
      projectHasUncommittedChanges,
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
      prePrReviewFieldExists,
      prePrFindingsFieldExists,
      prePrEvidenceFieldExists,
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

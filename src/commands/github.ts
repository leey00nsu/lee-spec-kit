import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import chalk from 'chalk';
import { DEFAULT_LANG, Lang, tr } from '../utils/i18n.js';
import { getConfig } from '../utils/config.js';
import {
  ContextSelectionOptions,
  resolveContextSelection,
} from '../utils/context-selection.js';
import { FeatureContext } from '../utils/context/index.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

interface GithubBaseOptions {
  json?: boolean;
  repo?: string;
  component?: string;
}

interface GithubIssueOptions extends GithubBaseOptions {
  create?: boolean;
  confirm?: string;
  title?: string;
  labels?: string;
  bodyFile?: string;
  assignee?: string;
}

interface GithubPrOptions extends GithubBaseOptions {
  create?: boolean;
  merge?: boolean;
  confirm?: string;
  pr?: string;
  title?: string;
  labels?: string;
  bodyFile?: string;
  assignee?: string;
  base?: string;
  retry?: string;
  syncTasks?: boolean;
  commitSync?: boolean;
}

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface PrViewMeta {
  url: string;
  headRefName: string;
  baseRefName: string;
}

type GithubTextKey =
  | 'approvalRequired'
  | 'checkoutBaseAfterMergeFailed'
  | 'checkoutHeadFailed'
  | 'cmdGithubDescription'
  | 'cmdIssueDescription'
  | 'cmdPrDescription'
  | 'commitSyncFailed'
  | 'createIssueFailed'
  | 'createLocalHeadFailed'
  | 'createPrFailed'
  | 'detectBranchFailed'
  | 'docsMissing'
  | 'featureSelectFailed'
  | 'fetchPrBranchesFailed'
  | 'ghCommandFailed'
  | 'ghEmptyJson'
  | 'ghInvalidJson'
  | 'inspectFileStatusFailed'
  | 'inspectWorktreeFailed'
  | 'invalidRepoComponentMismatch'
  | 'issueCreated'
  | 'issueDefaultTitle'
  | 'issueHeader'
  | 'issueTemplateGenerated'
  | 'kindIssue'
  | 'kindPr'
  | 'labelBodyFile'
  | 'labelFeature'
  | 'labelLabels'
  | 'labelPr'
  | 'labelsRequired'
  | 'mergeRequiresPr'
  | 'mergeRetryFailed'
  | 'multipleFeaturesMatched'
  | 'noFeatures'
  | 'operationIssueCreate'
  | 'operationPrCreate'
  | 'operationPrMerge'
  | 'optComponent'
  | 'optIssueAssignee'
  | 'optIssueBodyFile'
  | 'optIssueConfirm'
  | 'optIssueCreate'
  | 'optIssueTitle'
  | 'optJson'
  | 'optLabels'
  | 'optPrAssignee'
  | 'optPrBase'
  | 'optPrBodyFile'
  | 'optPrCommitSync'
  | 'optPrConfirm'
  | 'optPrCreate'
  | 'optPrMerge'
  | 'optPrNoSyncTasks'
  | 'optPrRef'
  | 'optPrRetry'
  | 'optPrTitle'
  | 'optRepo'
  | 'prDefaultTitleNoIssue'
  | 'prDefaultTitleWithIssue'
  | 'prHeader'
  | 'prMerged'
  | 'prTasksSynced'
  | 'prTemplateGenerated'
  | 'pullBaseAfterMergeFailed'
  | 'pushRebasedHeadFailed'
  | 'pushSyncFailed'
  | 'rebaseHeadFailed'
  | 'restoreBranchFailed'
  | 'retryInvalid'
  | 'sectionsMissing'
  | 'stageFileFailed'
  | 'syncCommitNoIssue'
  | 'syncCommitWithIssue'
  | 'tasksNotFound'
  | 'todoPlaceholdersRemain'
  | 'worktreeNotClean';

function tg(
  lang: Lang,
  key: GithubTextKey,
  vars: Record<string, string | number | undefined> = {}
): string {
  return tr(lang, 'cli', `github.${key}`, vars);
}

function detectGithubCliLangSync(cwd: string): Lang {
  const explicitDocsDir = (process.env.LEE_SPEC_KIT_DOCS_DIR || '').trim();
  const startDirs = [explicitDocsDir ? path.resolve(explicitDocsDir) : '', path.resolve(cwd)]
    .filter(Boolean);

  const scanOrder: string[] = [];
  const seen = new Set<string>();
  for (const start of startDirs) {
    let current = start;
    while (true) {
      const abs = path.resolve(current);
      if (!seen.has(abs)) {
        scanOrder.push(abs);
        seen.add(abs);
      }
      const parent = path.dirname(abs);
      if (parent === abs) break;
      current = parent;
    }
  }

  for (const base of scanOrder) {
    for (const docsDir of [path.join(base, 'docs'), base]) {
      const configPath = path.join(docsDir, '.lee-spec-kit.json');
      if (fs.existsSync(configPath)) {
        try {
          const parsed = fs.readJsonSync(configPath) as { lang?: unknown };
          if (parsed?.lang === 'ko' || parsed?.lang === 'en') return parsed.lang;
        } catch {
          // ignore parse errors and continue fallback probing
        }
      }

      const agentsPath = path.join(docsDir, 'agents');
      const featuresPath = path.join(docsDir, 'features');
      if (!fs.existsSync(agentsPath) || !fs.existsSync(featuresPath)) continue;

      for (const probe of ['custom.md', 'constitution.md', 'agents.md']) {
        const file = path.join(agentsPath, probe);
        if (!fs.existsSync(file)) continue;
        try {
          const content = fs.readFileSync(file, 'utf-8');
          if (/[가-힣]/.test(content)) return 'ko';
        } catch {
          // ignore and keep probing
        }
      }
      return 'en';
    }
  }

  return DEFAULT_LANG;
}

function resolveComponentOption(
  options: Pick<GithubBaseOptions, 'repo' | 'component'>,
  lang: Lang
): string | undefined {
  if (
    options.repo &&
    options.component &&
    options.repo.trim().toLowerCase() !== options.component.trim().toLowerCase()
  ) {
    throw createCliError(
      'INVALID_ARGUMENT',
      tg(lang, 'invalidRepoComponentMismatch')
    );
  }
  const component = (options.component || options.repo || '').trim().toLowerCase();
  return component || undefined;
}

function parseLabels(raw: string | undefined, lang: Lang): string[] {
  const labels = (raw || 'enhancement')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (labels.length === 0) {
    throw createCliError(
      'INVALID_ARGUMENT',
      tg(lang, 'labelsRequired')
    );
  }
  return [...new Set(labels)];
}

function hasExplicitRemoteApproval(raw: string | undefined): boolean {
  return (raw || '').trim().toUpperCase() === 'OK';
}

function assertRemoteApproval(raw: string | undefined, operation: string, lang: Lang): void {
  if (hasExplicitRemoteApproval(raw)) return;
  throw createCliError(
    'APPROVAL_REQUIRED',
    tg(lang, 'approvalRequired', { operation })
  );
}

function runProcess(
  bin: string,
  args: string[],
  cwd: string
): ProcessResult {
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      LEE_SPEC_KIT_NO_UPDATE_CHECK: '1',
      LEE_SPEC_KIT_NO_BANNER: '1',
    },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runProcessOrThrow(
  bin: string,
  args: string[],
  cwd: string,
  failureMessage: string
): ProcessResult {
  const result = runProcess(bin, args, cwd);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw createCliError(
      'EXECUTION_FAILED',
      `${failureMessage}${detail ? `: ${detail}` : ''}`
    );
  }
  return result;
}

function runGhJson<T>(args: string[], cwd: string, lang: Lang): T {
  const result = runProcessOrThrow('gh', args, cwd, tg(lang, 'ghCommandFailed'));
  const text = result.stdout.trim();
  if (!text) {
    throw createCliError('EXECUTION_FAILED', tg(lang, 'ghEmptyJson'));
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw createCliError(
      'EXECUTION_FAILED',
      tg(lang, 'ghInvalidJson', {
        snippet: text.slice(0, 160),
      })
    );
  }
}

function ensureSections(
  body: string,
  sections: string[],
  kind: string,
  lang: Lang
): void {
  const missing = sections.filter((section) => {
    const re = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
    return !re.test(body);
  });
  if (missing.length > 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      tg(lang, 'sectionsMissing', {
        kind,
        sections: missing.join(', '),
      })
    );
  }
}

function ensureDocsExist(docsDir: string, relativePaths: string[], lang: Lang): void {
  const missing = relativePaths.filter(
    (relativePath) => !fs.existsSync(path.join(docsDir, relativePath))
  );
  if (missing.length > 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      tg(lang, 'docsMissing', { paths: missing.join(', ') })
    );
  }
}

function buildDefaultBodyFileName(
  kind: 'issue' | 'pr',
  docsDir: string,
  component: string
): string {
  const key = `${path.resolve(docsDir)}::${component.trim().toLowerCase()}`;
  const digest = createHash('sha1').update(key).digest('hex').slice(0, 12);
  return `lee-spec-kit.${digest}.${kind}.md`;
}

function toBodyFilePath(
  raw: string | undefined,
  kind: 'issue' | 'pr',
  docsDir: string,
  component: string
): string {
  const selected =
    raw?.trim() ||
    path.join(os.tmpdir(), buildDefaultBodyFileName(kind, docsDir, component));
  return path.resolve(selected);
}

function toProjectRootDocsPath(relativePathFromDocs: string): string {
  const normalized = relativePathFromDocs
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  if (normalized.startsWith('docs/')) return normalized;
  return `docs/${normalized}`;
}

function toBodyDocPaths(
  paths: ReturnType<typeof getFeatureDocPaths>
): ReturnType<typeof getFeatureDocPaths> {
  return {
    ...paths,
    specPath: toProjectRootDocsPath(paths.specPath),
    planPath: toProjectRootDocsPath(paths.planPath),
    tasksPath: toProjectRootDocsPath(paths.tasksPath),
  };
}

const TODO_PLACEHOLDER_PATTERN = /(^|\n)\s*-\s*\[[ xX]\]\s*TODO:/m;

function ensureNoTodoPlaceholders(body: string, kind: string, lang: Lang): void {
  if (!TODO_PLACEHOLDER_PATTERN.test(body)) return;
  throw createCliError(
    'PRECONDITION_FAILED',
    tg(lang, 'todoPlaceholdersRemain', { kind })
  );
}

async function resolveFeatureOrThrow(
  featureName: string | undefined,
  options: ContextSelectionOptions,
  lang: Lang
): Promise<{ config: NonNullable<Awaited<ReturnType<typeof getConfig>>>; feature: FeatureContext }> {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(lang, 'cli', 'common.configNotFound')
    );
  }

  const state = await resolveContextSelection(config, featureName, options);
  if (!state.matchedFeature) {
    if (state.status === 'no_features') {
      throw createCliError('PRECONDITION_FAILED', tg(lang, 'noFeatures'));
    }
    if (state.status === 'multiple_active') {
      throw createCliError(
        'CONTEXT_SELECTION_REQUIRED',
        tg(lang, 'multipleFeaturesMatched')
      );
    }
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      tg(lang, 'featureSelectFailed')
    );
  }

  return { config, feature: state.matchedFeature };
}

function getFeatureDocPaths(feature: FeatureContext): {
  featurePathFromDocs: string;
  specPath: string;
  planPath: string;
  tasksPath: string;
} {
  const featurePathFromDocs = feature.docs.featurePathFromDocs;
  return {
    featurePathFromDocs,
    specPath: `${featurePathFromDocs}/spec.md`,
    planPath: `${featurePathFromDocs}/plan.md`,
    tasksPath: `${featurePathFromDocs}/tasks.md`,
  };
}

function normalizeHeading(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function extractMarkdownSection(content: string, headings: string[]): string | undefined {
  const targets = new Set(headings.map((heading) => normalizeHeading(heading)));
  const lines = content.split('\n');
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*##\s+(.+?)\s*$/);
    if (!match) continue;
    if (!targets.has(normalizeHeading(match[1]))) continue;
    start = i + 1;
    break;
  }

  if (start < 0) return undefined;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^\s*##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function isTemplateLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^---+$/.test(trimmed)) return true;
  if (/^\(.+\)$/.test(trimmed)) return true;
  if (/\{\{[^}]+\}\}/.test(trimmed)) return true;
  if (/^\{[^}]+\}$/.test(trimmed)) return true;
  return false;
}

function sanitizeOverviewSection(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isTemplateLine(line));
  if (lines.length === 0) return undefined;
  return lines.slice(0, 5).join('\n');
}

function resolveOverviewFromSpec(
  specContent: string,
  feature: FeatureContext,
  lang: Lang
): string {
  const fromPurpose = sanitizeOverviewSection(
    extractMarkdownSection(specContent, ['목적', 'Purpose'])
  );
  if (fromPurpose) return fromPurpose;

  const fromOverview = sanitizeOverviewSection(
    extractMarkdownSection(specContent, ['개요', 'Overview'])
  );
  if (fromOverview) return fromOverview;

  return lang === 'ko'
    ? `\`${feature.folderName}\` 기능 개요를 spec.md 기준으로 작성하세요.`
    : `Summarize feature \`${feature.folderName}\` from spec.md.`;
}

function buildIssueBody(
  overview: string,
  labels: string[],
  paths: ReturnType<typeof getFeatureDocPaths>,
  lang: Lang
): string {
  const bodyPaths = toBodyDocPaths(paths);
  if (lang === 'ko') {
    return `## 개요

${overview}

## 목표

- [ ] TODO: spec.md 목적/범위를 바탕으로 목표를 작성하세요.
- [ ] TODO: 구현 범위(포함/제외)를 구체적으로 작성하세요.

## 완료 기준

- [ ] TODO: 검증 가능한 완료 기준을 작성하세요.
- [ ] TODO: 완료 확인 방법(테스트/시나리오)을 작성하세요.

## 관련 문서

- **Spec**: \`${bodyPaths.specPath}\`
- **Plan**: \`${bodyPaths.planPath}\`
- **Tasks**: \`${bodyPaths.tasksPath}\`

## 라벨

${labels.map((label) => `- \`${label}\``).join('\n')}
`;
  }

  return `## Overview

${overview}

## Goals

- [ ] TODO: Fill concrete goals based on spec.md.
- [ ] TODO: Clarify in-scope and out-of-scope boundaries.

## Completion Criteria

- [ ] TODO: Define verifiable completion criteria.
- [ ] TODO: Add validation/test conditions for completion.

## Related Documents

- **Spec**: \`${bodyPaths.specPath}\`
- **Plan**: \`${bodyPaths.planPath}\`
- **Tasks**: \`${bodyPaths.tasksPath}\`

## Labels

${labels.map((label) => `- \`${label}\``).join('\n')}
`;
}

function buildPrBody(
  feature: FeatureContext,
  overview: string,
  paths: ReturnType<typeof getFeatureDocPaths>,
  lang: Lang
): string {
  const bodyPaths = toBodyDocPaths(paths);
  const closes = feature.issueNumber ? `\nCloses #${feature.issueNumber}\n` : '\n';
  if (lang === 'ko') {
    return `## 개요

${overview}

## 변경 사항

- [ ] TODO: 핵심 코드 변경 사항을 요약하세요.
- [ ] TODO: 영향 범위/호환성(마이그레이션 포함)을 작성하세요.

## 테스트

### 실행한 테스트

- [ ] TODO: \`<실행한 테스트 명령어>\` — PASS/FAIL
- [ ] TODO: 미실행 테스트가 있다면 사유를 작성하세요.

## 관련 문서

- **Spec**: \`${bodyPaths.specPath}\`
- **Tasks**: \`${bodyPaths.tasksPath}\`${closes}`;
  }

  return `## Overview

${overview}

## Changes

- [ ] TODO: Summarize key code changes in this PR.
- [ ] TODO: Describe impact/scope (including migration if any).

## Tests

### Tests Run

- [ ] TODO: \`<test command>\` — PASS/FAIL
- [ ] TODO: If tests were not run, explain why.

## Related Documents

- **Spec**: \`${bodyPaths.specPath}\`
- **Tasks**: \`${bodyPaths.tasksPath}\`${closes}`;
}

function getRequiredIssueSections(lang: Lang): string[] {
  return lang === 'ko'
    ? ['개요', '목표', '완료 기준', '관련 문서', '라벨']
    : ['Overview', 'Goals', 'Completion Criteria', 'Related Documents', 'Labels'];
}

function getRequiredPrSections(lang: Lang): string[] {
  return lang === 'ko'
    ? ['개요', '변경 사항', '테스트', '관련 문서']
    : ['Overview', 'Changes', 'Tests', 'Related Documents'];
}

function replaceListField(
  content: string,
  keys: string[],
  value: string
): { content: string; changed: boolean; found: boolean } {
  for (const key of keys) {
    const re = new RegExp(
      `^(\\s*-\\s*\\*\\*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\s*:\\s*).*$`,
      'm'
    );
    if (!re.test(content)) continue;
    const next = content.replace(re, `$1${value}`);
    return { content: next, changed: next !== content, found: true };
  }
  return { content, changed: false, found: false };
}

function insertFieldInGithubIssueSection(
  content: string,
  key: string,
  value: string
): { content: string; changed: boolean } {
  const lines = content.split('\n');
  const headingIndex = lines.findIndex((line) =>
    /^\s*##\s+(GitHub Issue|로컬 추적 정보|Local Tracking)\s*$/.test(line)
  );
  if (headingIndex < 0) return { content, changed: false };

  let end = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (/^\s*##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }

  lines.splice(end, 0, `- **${key}**: ${value}`);
  return { content: lines.join('\n'), changed: true };
}

function syncTasksPrMetadata(
  tasksPath: string,
  prUrl: string,
  nextStatus: 'Review' | 'Approved',
  lang: Lang
): { changed: boolean; path: string } {
  if (!fs.existsSync(tasksPath)) {
    throw createCliError('DOCS_NOT_FOUND', tg(lang, 'tasksNotFound', { path: tasksPath }));
  }

  const original = fs.readFileSync(tasksPath, 'utf-8');
  let next = original;
  let changed = false;

  const prReplaced = replaceListField(next, ['PR', 'Pull Request'], prUrl);
  next = prReplaced.content;
  changed = changed || prReplaced.changed;
  if (!prReplaced.found) {
    const inserted = insertFieldInGithubIssueSection(next, 'PR', prUrl);
    next = inserted.content;
    changed = changed || inserted.changed;
  }

  const statusReplaced = replaceListField(
    next,
    ['PR Status', 'PR 상태'],
    nextStatus
  );
  next = statusReplaced.content;
  changed = changed || statusReplaced.changed;
  if (!statusReplaced.found) {
    const inserted = insertFieldInGithubIssueSection(next, 'PR Status', nextStatus);
    next = inserted.content;
    changed = changed || inserted.changed;
  }

  if (changed) {
    fs.writeFileSync(tasksPath, next, 'utf-8');
  }
  return { changed, path: tasksPath };
}

function gitCurrentBranch(cwd: string, lang: Lang): string {
  const result = runProcessOrThrow(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    cwd,
    tg(lang, 'detectBranchFailed')
  );
  return result.stdout.trim();
}

function ensureCleanWorktree(cwd: string, lang: Lang): void {
  const result = runProcessOrThrow(
    'git',
    ['status', '--porcelain=v1'],
    cwd,
    tg(lang, 'inspectWorktreeFailed')
  );
  if (result.stdout.trim().length > 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      tg(lang, 'worktreeNotClean')
    );
  }
}

function commitAndPushPath(
  cwd: string,
  absPath: string,
  message: string,
  lang: Lang
): void {
  const relativePath = path.relative(cwd, absPath) || absPath;
  const status = runProcessOrThrow(
    'git',
    ['status', '--porcelain=v1', '--', relativePath],
    cwd,
    tg(lang, 'inspectFileStatusFailed')
  );
  if (status.stdout.trim().length === 0) return;

  runProcessOrThrow('git', ['add', '--', relativePath], cwd, tg(lang, 'stageFileFailed'));
  runProcessOrThrow('git', ['commit', '-m', message], cwd, tg(lang, 'commitSyncFailed'));

  const branch = gitCurrentBranch(cwd, lang);
  runProcessOrThrow(
    'git',
    ['push', '-u', 'origin', branch],
    cwd,
    tg(lang, 'pushSyncFailed')
  );
}

function shouldRefreshHeadBranch(stderr: string, stdout: string): boolean {
  const text = `${stderr}\n${stdout}`;
  return /out of date|not possible to fast-forward|must be up to date|not up to date/i.test(
    text
  );
}

function refreshPrHeadBranch(prRef: string, cwd: string, lang: Lang): void {
  ensureCleanWorktree(cwd, lang);

  const meta = runGhJson<PrViewMeta>(
    ['pr', 'view', prRef, '--json', 'url,headRefName,baseRefName'],
    cwd,
    lang
  );
  const originalBranch = gitCurrentBranch(cwd, lang);

  runProcessOrThrow(
    'git',
    ['fetch', 'origin', meta.baseRefName, meta.headRefName],
    cwd,
    tg(lang, 'fetchPrBranchesFailed')
  );

  const hasLocalHead = runProcess(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${meta.headRefName}`],
    cwd
  ).code === 0;

  if (hasLocalHead) {
    runProcessOrThrow(
      'git',
      ['checkout', meta.headRefName],
      cwd,
      tg(lang, 'checkoutHeadFailed')
    );
  } else {
    runProcessOrThrow(
      'git',
      ['checkout', '-B', meta.headRefName, `origin/${meta.headRefName}`],
      cwd,
      tg(lang, 'createLocalHeadFailed')
    );
  }

  runProcessOrThrow(
    'git',
    ['rebase', `origin/${meta.baseRefName}`],
    cwd,
    tg(lang, 'rebaseHeadFailed')
  );
  runProcessOrThrow(
    'git',
    ['push', '--force-with-lease', 'origin', meta.headRefName],
    cwd,
    tg(lang, 'pushRebasedHeadFailed')
  );

  if (originalBranch !== meta.headRefName) {
    runProcessOrThrow(
      'git',
      ['checkout', originalBranch],
      cwd,
      tg(lang, 'restoreBranchFailed')
    );
  }
}

function mergePrWithRetry(
  prRef: string,
  cwd: string,
  retryCount: number,
  lang: Lang
): { merged: true; attempts: number } {
  const attempts = Number.isFinite(retryCount) ? Math.max(1, retryCount) : 3;
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const merged = runProcess(
      'gh',
      ['pr', 'merge', prRef, '--squash', '--delete-branch'],
      cwd
    );
    if (merged.code === 0) {
      return { merged: true, attempts: attempt };
    }

    lastError = (merged.stderr || merged.stdout || '').trim();
    if (shouldRefreshHeadBranch(merged.stderr, merged.stdout)) {
      refreshPrHeadBranch(prRef, cwd, lang);
      continue;
    }
  }

  throw createCliError(
    'EXECUTION_FAILED',
    tg(lang, 'mergeRetryFailed', {
      lastError: lastError ? ` ${lastError}` : '',
    })
  );
}

function toRetryCount(raw: string | undefined, lang: Lang): number {
  if (!raw) return 3;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createCliError('INVALID_ARGUMENT', tg(lang, 'retryInvalid'));
  }
  return parsed;
}

export function githubCommand(program: Command): void {
  const commandLang = detectGithubCliLangSync(process.cwd());
  const github = program
    .command('github')
    .description(tg(commandLang, 'cmdGithubDescription'));

  github
    .command('issue [feature-name]')
    .description(tg(commandLang, 'cmdIssueDescription'))
    .option('--json', tg(commandLang, 'optJson'))
    .option('--repo <repo>', tg(commandLang, 'optRepo'))
    .option('--component <component>', tg(commandLang, 'optComponent'))
    .option('--title <title>', tg(commandLang, 'optIssueTitle'))
    .option('--labels <labels>', tg(commandLang, 'optLabels'))
    .option('--body-file <path>', tg(commandLang, 'optIssueBodyFile'))
    .option('--assignee <assignee>', tg(commandLang, 'optIssueAssignee'))
    .option('--create', tg(commandLang, 'optIssueCreate'))
    .option(
      '--confirm <reply>',
      tg(commandLang, 'optIssueConfirm')
    )
    .action(async (featureName: string | undefined, options: GithubIssueOptions) => {
      try {
        const selectedComponent = resolveComponentOption(options, commandLang);
        const { config, feature } = await resolveFeatureOrThrow(featureName, {
          component: selectedComponent,
        }, commandLang);

        const labels = parseLabels(options.labels, config.lang);
        const paths = getFeatureDocPaths(feature);
        ensureDocsExist(
          config.docsDir,
          [paths.specPath, paths.planPath, paths.tasksPath],
          config.lang
        );
        const specContent = await fs.readFile(path.join(config.docsDir, paths.specPath), 'utf-8');
        const overview = resolveOverviewFromSpec(specContent, feature, config.lang);

        const title =
          options.title?.trim() ||
          tg(config.lang, 'issueDefaultTitle', {
            slug: feature.slug,
            folder: feature.folderName,
          });
        const generatedBody = buildIssueBody(overview, labels, paths, config.lang);
        ensureSections(
          generatedBody,
          getRequiredIssueSections(config.lang),
          tg(config.lang, 'kindIssue'),
          config.lang
        );

        const bodyFile = toBodyFilePath(
          options.bodyFile,
          'issue',
          config.docsDir,
          feature.type
        );
        const explicitBodyFile = (options.bodyFile || '').trim();
        let body = generatedBody;
        if (options.create && explicitBodyFile && (await fs.pathExists(bodyFile))) {
          body = await fs.readFile(bodyFile, 'utf-8');
          ensureSections(
            body,
            getRequiredIssueSections(config.lang),
            tg(config.lang, 'kindIssue'),
            config.lang
          );
        } else {
          await fs.ensureDir(path.dirname(bodyFile));
          await fs.writeFile(bodyFile, generatedBody, 'utf-8');
        }

        let issueUrl: string | undefined;
        if (options.create) {
          ensureNoTodoPlaceholders(body, tg(config.lang, 'kindIssue'), config.lang);
          assertRemoteApproval(
            options.confirm,
            tg(config.lang, 'operationIssueCreate'),
            config.lang
          );
          const args = [
            'issue',
            'create',
            '--title',
            title,
            '--body-file',
            bodyFile,
            '--assignee',
            options.assignee?.trim() || '@me',
          ];
          for (const label of labels) {
            args.push('--label', label);
          }
          const created = runProcessOrThrow(
            'gh',
            args,
            process.cwd(),
            tg(config.lang, 'createIssueFailed')
          );
          issueUrl = created.stdout.trim() || undefined;
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                reasonCode: options.create ? 'ISSUE_CREATED' : 'ISSUE_TEMPLATE_GENERATED',
                feature: feature.folderName,
                component: feature.type,
                title,
                labels,
                body,
                bodyFile,
                issueUrl,
              },
              null,
              2
            )
          );
          return;
        }

        console.log();
        console.log(chalk.bold(tg(config.lang, 'issueHeader')));
        console.log(chalk.gray(`- ${tg(config.lang, 'labelFeature')}: ${feature.folderName}`));
        console.log(chalk.gray(`- ${tg(config.lang, 'labelBodyFile')}: ${bodyFile}`));
        console.log(chalk.gray(`- ${tg(config.lang, 'labelLabels')}: ${labels.join(', ')}`));
        if (issueUrl) {
          console.log(chalk.green(tg(config.lang, 'issueCreated', { url: issueUrl })));
        } else {
          console.log(chalk.blue(tg(config.lang, 'issueTemplateGenerated')));
        }
        console.log();
      } catch (error) {
        const lang = detectGithubCliLangSync(process.cwd());
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
          console.error(
            chalk.red(tr(lang, 'cli', 'common.errorLabel')),
            chalk.red(`[${cliError.code}] ${cliError.message}`)
          );
          printCliErrorSuggestions(suggestions, lang);
        }
        process.exit(1);
      }
    });

  github
    .command('pr [feature-name]')
    .description(tg(commandLang, 'cmdPrDescription'))
    .option('--json', tg(commandLang, 'optJson'))
    .option('--repo <repo>', tg(commandLang, 'optRepo'))
    .option('--component <component>', tg(commandLang, 'optComponent'))
    .option('--title <title>', tg(commandLang, 'optPrTitle'))
    .option('--labels <labels>', tg(commandLang, 'optLabels'))
    .option('--body-file <path>', tg(commandLang, 'optPrBodyFile'))
    .option('--assignee <assignee>', tg(commandLang, 'optPrAssignee'))
    .option('--base <branch>', tg(commandLang, 'optPrBase'), 'main')
    .option('--create', tg(commandLang, 'optPrCreate'))
    .option('--pr <ref>', tg(commandLang, 'optPrRef'))
    .option('--merge', tg(commandLang, 'optPrMerge'))
    .option(
      '--confirm <reply>',
      tg(commandLang, 'optPrConfirm')
    )
    .option('--retry <count>', tg(commandLang, 'optPrRetry'))
    .option('--no-sync-tasks', tg(commandLang, 'optPrNoSyncTasks'))
    .option('--commit-sync', tg(commandLang, 'optPrCommitSync'))
    .action(async (featureName: string | undefined, options: GithubPrOptions) => {
      try {
        const selectedComponent = resolveComponentOption(options, commandLang);
        const { config, feature } = await resolveFeatureOrThrow(featureName, {
          component: selectedComponent,
        }, commandLang);

        const labels = parseLabels(options.labels, config.lang);
        const paths = getFeatureDocPaths(feature);
        ensureDocsExist(config.docsDir, [paths.specPath, paths.tasksPath], config.lang);
        const specContent = await fs.readFile(path.join(config.docsDir, paths.specPath), 'utf-8');
        const overview = resolveOverviewFromSpec(specContent, feature, config.lang);

        const defaultTitle = feature.issueNumber
          ? tg(config.lang, 'prDefaultTitleWithIssue', {
              issue: feature.issueNumber,
              slug: feature.slug,
            })
          : tg(config.lang, 'prDefaultTitleNoIssue', {
              slug: feature.slug,
            });
        const title = options.title?.trim() || defaultTitle;
        const generatedBody = buildPrBody(feature, overview, paths, config.lang);
        ensureSections(
          generatedBody,
          getRequiredPrSections(config.lang),
          tg(config.lang, 'kindPr'),
          config.lang
        );

        const bodyFile = toBodyFilePath(
          options.bodyFile,
          'pr',
          config.docsDir,
          feature.type
        );
        const explicitBodyFile = (options.bodyFile || '').trim();
        let body = generatedBody;
        if (options.create && explicitBodyFile && (await fs.pathExists(bodyFile))) {
          body = await fs.readFile(bodyFile, 'utf-8');
          ensureSections(
            body,
            getRequiredPrSections(config.lang),
            tg(config.lang, 'kindPr'),
            config.lang
          );
        } else {
          await fs.ensureDir(path.dirname(bodyFile));
          await fs.writeFile(bodyFile, generatedBody, 'utf-8');
        }

        const retryCount = toRetryCount(options.retry, config.lang);
        let prUrl = options.pr?.trim() || '';
        let mergedAttempts: number | undefined;
        let syncChanged = false;

        if (options.create) {
          ensureNoTodoPlaceholders(body, tg(config.lang, 'kindPr'), config.lang);
          assertRemoteApproval(
            options.confirm,
            tg(config.lang, 'operationPrCreate'),
            config.lang
          );
          const args = [
            'pr',
            'create',
            '--title',
            title,
            '--body-file',
            bodyFile,
            '--base',
            options.base || 'main',
            '--assignee',
            options.assignee?.trim() || '@me',
          ];
          for (const label of labels) {
            args.push('--label', label);
          }
          const created = runProcessOrThrow(
            'gh',
            args,
            process.cwd(),
            tg(config.lang, 'createPrFailed')
          );
          prUrl = created.stdout.trim();
        }

        if (!prUrl && options.merge) {
          throw createCliError(
            'INVALID_ARGUMENT',
            tg(config.lang, 'mergeRequiresPr')
          );
        }

        if (options.merge) {
          assertRemoteApproval(
            options.confirm,
            tg(config.lang, 'operationPrMerge'),
            config.lang
          );
        }

        if (prUrl && options.syncTasks !== false) {
          const synced = syncTasksPrMetadata(
            path.join(config.docsDir, paths.tasksPath),
            prUrl,
            'Review',
            config.lang
          );
          syncChanged = synced.changed;
          const shouldCommitSync = !!options.commitSync || !!options.merge;
          if (syncChanged && shouldCommitSync) {
            const message = feature.issueNumber
              ? tg(config.lang, 'syncCommitWithIssue', {
                  issue: feature.issueNumber,
                  folder: feature.folderName,
                })
              : tg(config.lang, 'syncCommitNoIssue', {
                  folder: feature.folderName,
                });
            commitAndPushPath(
              process.cwd(),
              synced.path,
              message,
              config.lang
            );
          }
        }

        if (options.merge) {
          const merged = mergePrWithRetry(prUrl, process.cwd(), retryCount, config.lang);
          mergedAttempts = merged.attempts;

          const baseBranch = options.base || 'main';
          runProcessOrThrow(
            'git',
            ['checkout', baseBranch],
            process.cwd(),
            tg(config.lang, 'checkoutBaseAfterMergeFailed', { base: baseBranch })
          );
          runProcessOrThrow(
            'git',
            ['pull', '--rebase', 'origin', baseBranch],
            process.cwd(),
            tg(config.lang, 'pullBaseAfterMergeFailed', { base: baseBranch })
          );
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                reasonCode: options.merge
                  ? 'PR_CREATED_SYNCED_MERGED'
                  : options.create
                    ? 'PR_CREATED_SYNCED'
                    : 'PR_TEMPLATE_GENERATED',
                feature: feature.folderName,
                component: feature.type,
                title,
                labels,
                body,
                bodyFile,
                prUrl: prUrl || undefined,
                syncChanged,
                merged: !!options.merge,
                mergeAttempts: mergedAttempts,
              },
              null,
              2
            )
          );
          return;
        }

        console.log();
        console.log(chalk.bold(tg(config.lang, 'prHeader')));
        console.log(chalk.gray(`- ${tg(config.lang, 'labelFeature')}: ${feature.folderName}`));
        console.log(chalk.gray(`- ${tg(config.lang, 'labelBodyFile')}: ${bodyFile}`));
        console.log(chalk.gray(`- ${tg(config.lang, 'labelLabels')}: ${labels.join(', ')}`));
        if (prUrl) {
          console.log(chalk.gray(`- ${tg(config.lang, 'labelPr')}: ${prUrl}`));
        }
        if (syncChanged) {
          console.log(chalk.green(tg(config.lang, 'prTasksSynced')));
        }
        if (options.merge) {
          console.log(
            chalk.green(tg(config.lang, 'prMerged', { attempts: mergedAttempts ?? 1 }))
          );
        } else if (!options.create) {
          console.log(chalk.blue(tg(config.lang, 'prTemplateGenerated')));
        }
        console.log();
      } catch (error) {
        const lang = detectGithubCliLangSync(process.cwd());
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
          console.error(
            chalk.red(tr(lang, 'cli', 'common.errorLabel')),
            chalk.red(`[${cliError.code}] ${cliError.message}`)
          );
          printCliErrorSuggestions(suggestions, lang);
        }
        process.exit(1);
      }
    });
}

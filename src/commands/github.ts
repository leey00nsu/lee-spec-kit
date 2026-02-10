import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import chalk from 'chalk';
import { DEFAULT_LANG, formatTemplate, Lang, tr } from '../utils/i18n.js';
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

const GITHUB_TEXT: Record<Lang, Record<string, string>> = {
  ko: {
    cmdGithubDescription: 'GitHub 워크플로우 도우미 (issue/pr 초안, 검증, merge 재시도)',
    cmdIssueDescription: 'feature 문서 기반 GitHub issue 본문 생성/생성',
    cmdPrDescription: 'GitHub PR 본문 생성/생성 + tasks 동기화 + merge 재시도',
    optJson: '에이전트용 JSON 형식으로 출력',
    optRepo: '멀티 프로젝트 컴포넌트 이름',
    optComponent: '멀티 프로젝트 컴포넌트 이름',
    optIssueTitle: 'Issue 제목',
    optLabels: '쉼표 구분 라벨 목록 (기본: enhancement)',
    optIssueBodyFile: 'Issue 본문 파일 출력 경로',
    optIssueAssignee: 'Issue 담당자 (기본: @me)',
    optIssueCreate: 'gh CLI로 issue 생성',
    optIssueConfirm: '원격 작업(--create)용 명시적 승인 토큰. 사용값: OK',
    optPrTitle: 'PR 제목',
    optPrBodyFile: 'PR 본문 파일 출력 경로',
    optPrAssignee: 'PR 담당자 (기본: @me)',
    optPrBase: 'PR base 브랜치 (기본: main)',
    optPrCreate: 'gh CLI로 PR 생성',
    optPrRef: '--merge 시 사용할 기존 PR URL/번호',
    optPrMerge: '재시도/헤드 갱신과 함께 PR merge 수행',
    optPrConfirm: '원격 작업(--create/--merge)용 명시적 승인 토큰. 사용값: OK',
    optPrRetry: 'merge 재시도 횟수 (기본: 3)',
    optPrNoSyncTasks: 'tasks.md PR URL/PR 상태 동기화를 건너뜀',
    optPrCommitSync: 'tasks.md 동기화 변경을 자동 commit/push',
    invalidRepoComponentMismatch:
      '`--repo`와 `--component`를 함께 쓸 때는 같은 값을 지정해야 합니다.',
    labelsRequired: '최소 1개 라벨이 필요합니다. `--labels enhancement`를 사용하세요.',
    approvalRequired:
      '{operation}은(는) 사용자 명시 승인 후에만 실행할 수 있습니다. 계획 공유 후 `--confirm OK`로 다시 실행하세요.',
    ghCommandFailed: 'GitHub CLI 명령 실행에 실패했습니다',
    ghEmptyJson: 'GitHub CLI JSON 출력이 비어 있습니다.',
    ghInvalidJson: 'GitHub CLI JSON 파싱에 실패했습니다: {snippet}',
    sectionsMissing: '{kind} 본문에 필수 섹션이 없습니다: {sections}',
    docsMissing: '관련 문서 경로가 존재하지 않습니다: {paths}',
    noFeatures: 'Feature를 찾을 수 없습니다.',
    multipleFeaturesMatched:
      '여러 Feature가 매칭되었습니다. feature 이름(slug | F001 | F001-slug)을 명시하세요.',
    featureSelectFailed:
      'Feature 자동 선택에 실패했습니다. feature 이름을 명시해서 다시 실행하세요.',
    tasksNotFound: 'tasks.md를 찾을 수 없습니다: {path}',
    detectBranchFailed: '현재 git 브랜치 확인에 실패했습니다',
    inspectWorktreeFailed: 'git 워크트리 상태 확인에 실패했습니다',
    worktreeNotClean: 'git 워크트리가 깨끗하지 않습니다. merge 재시도 동기화 전에 커밋/스태시하세요.',
    inspectFileStatusFailed: '파일 git 상태 확인에 실패했습니다',
    stageFileFailed: '동기화 파일 stage에 실패했습니다',
    commitSyncFailed: '동기화 메타데이터 commit에 실패했습니다',
    pushSyncFailed: '동기화 메타데이터 push에 실패했습니다',
    fetchPrBranchesFailed: 'PR 브랜치 fetch에 실패했습니다',
    checkoutHeadFailed: 'PR 헤드 브랜치 checkout에 실패했습니다',
    createLocalHeadFailed: '로컬 PR 헤드 브랜치 생성에 실패했습니다',
    rebaseHeadFailed: 'PR 헤드 브랜치 rebase에 실패했습니다',
    pushRebasedHeadFailed: 'rebase된 PR 헤드 브랜치 push에 실패했습니다',
    restoreBranchFailed: 'PR 헤드 갱신 후 이전 브랜치 복원에 실패했습니다',
    mergeRetryFailed: '재시도 후에도 PR merge에 실패했습니다.{lastError}',
    retryInvalid: '`--retry`는 1 이상의 정수여야 합니다.',
    operationIssueCreate: 'GitHub issue 생성',
    operationPrCreate: 'GitHub PR 생성',
    operationPrMerge: 'GitHub PR merge',
    createIssueFailed: 'GitHub issue 생성에 실패했습니다',
    createPrFailed: 'GitHub PR 생성에 실패했습니다',
    mergeRequiresPr: '`--merge`를 사용하려면 `--create` 또는 `--pr <url|number>`가 필요합니다.',
    checkoutBaseAfterMergeFailed: 'merge 후 {base} 브랜치 checkout에 실패했습니다',
    pullBaseAfterMergeFailed: 'merge 후 {base} 브랜치 최신화에 실패했습니다',
    issueDefaultTitle: '{slug} ({folder} 문서 업데이트)',
    prDefaultTitleWithIssue: 'feat(#{issue}): {slug} (구현 업데이트)',
    prDefaultTitleNoIssue: 'feat: {slug} (구현 업데이트)',
    issueHeader: '🧾 GitHub Issue 도우미',
    prHeader: '🔀 GitHub PR 도우미',
    labelFeature: 'Feature',
    labelBodyFile: '본문 파일',
    labelLabels: '라벨',
    labelPr: 'PR',
    issueCreated: '✅ 생성 완료: {url}',
    issueTemplateGenerated: '초안을 생성했습니다. 자동 생성하려면 `--create`를 사용하세요.',
    prTasksSynced: '✅ tasks.md PR 메타데이터를 동기화했습니다.',
    prMerged: '✅ PR merge 완료 (시도 횟수: {attempts})',
    prTemplateGenerated: '초안을 생성했습니다. 자동 생성하려면 `--create`를 사용하세요.',
    syncCommitWithIssue: 'docs(#{issue}): {folder} PR 메타데이터 동기화',
    syncCommitNoIssue: 'docs: {folder} PR 메타데이터 동기화',
    kindIssue: 'Issue',
    kindPr: 'PR',
  },
  en: {
    cmdGithubDescription: 'GitHub workflow helpers (issue/pr templates, validation, merge retry)',
    cmdIssueDescription: 'Generate/create GitHub issue body from feature docs with validation',
    cmdPrDescription:
      'Generate/create GitHub PR body with validation, tasks PR sync, and merge retry',
    optJson: 'Output in JSON format for agents',
    optRepo: 'Component name for multi projects',
    optComponent: 'Component name for multi projects',
    optIssueTitle: 'Issue title',
    optLabels: 'Comma-separated labels (default: enhancement)',
    optIssueBodyFile: 'Issue body file output path',
    optIssueAssignee: 'Issue assignee (default: @me)',
    optIssueCreate: 'Create issue via gh CLI',
    optIssueConfirm: 'Explicit user approval token for remote operations (--create). Use: OK',
    optPrTitle: 'PR title',
    optPrBodyFile: 'PR body file output path',
    optPrAssignee: 'PR assignee (default: @me)',
    optPrBase: 'PR base branch (default: main)',
    optPrCreate: 'Create PR via gh CLI',
    optPrRef: 'Existing PR URL/number (used by --merge)',
    optPrMerge: 'Merge PR with retry and head-branch refresh',
    optPrConfirm:
      'Explicit user approval token for remote operations (--create/--merge). Use: OK',
    optPrRetry: 'Retry count for merge (default: 3)',
    optPrNoSyncTasks: 'Do not sync PR URL/PR status into tasks.md',
    optPrCommitSync: 'Commit and push tasks.md metadata sync automatically',
    invalidRepoComponentMismatch:
      '`--repo` and `--component` must reference the same value when both are provided.',
    labelsRequired: 'At least one label is required. Use `--labels enhancement`.',
    approvalRequired:
      '{operation} requires explicit user approval. Re-run with `--confirm OK` after sharing the plan with the user.',
    ghCommandFailed: 'GitHub CLI command failed',
    ghEmptyJson: 'GitHub CLI returned empty JSON output.',
    ghInvalidJson: 'GitHub CLI returned invalid JSON: {snippet}',
    sectionsMissing: '{kind} body is missing required sections: {sections}',
    docsMissing: 'Related document paths do not exist: {paths}',
    noFeatures: 'No features found.',
    multipleFeaturesMatched:
      'Multiple features matched. Specify feature name (slug | F001 | F001-slug).',
    featureSelectFailed: 'Failed to auto-select a feature. Specify feature name explicitly.',
    tasksNotFound: 'tasks.md not found: {path}',
    detectBranchFailed: 'Failed to detect current git branch',
    inspectWorktreeFailed: 'Failed to inspect git worktree',
    worktreeNotClean: 'Git worktree is not clean. Commit or stash changes before merge retry sync.',
    inspectFileStatusFailed: 'Failed to inspect git file status',
    stageFileFailed: 'Failed to stage file',
    commitSyncFailed: 'Failed to commit synced metadata',
    pushSyncFailed: 'Failed to push synced metadata commit',
    fetchPrBranchesFailed: 'Failed to fetch PR branches',
    checkoutHeadFailed: 'Failed to checkout PR head branch',
    createLocalHeadFailed: 'Failed to create local PR head branch',
    rebaseHeadFailed: 'Failed to rebase PR head branch',
    pushRebasedHeadFailed: 'Failed to push rebased PR head branch',
    restoreBranchFailed: 'Failed to restore previous branch after PR refresh',
    mergeRetryFailed: 'Failed to merge PR after retry attempts.{lastError}',
    retryInvalid: '`--retry` must be a positive integer.',
    operationIssueCreate: 'GitHub issue creation',
    operationPrCreate: 'GitHub PR creation',
    operationPrMerge: 'GitHub PR merge',
    createIssueFailed: 'Failed to create GitHub issue',
    createPrFailed: 'Failed to create GitHub PR',
    mergeRequiresPr: '`--merge` requires `--create` or `--pr <url|number>`.',
    checkoutBaseAfterMergeFailed: 'Failed to checkout {base} after merge',
    pullBaseAfterMergeFailed: 'Failed to update {base} after merge',
    issueDefaultTitle: '{slug} ({folder} documentation update)',
    prDefaultTitleWithIssue: 'feat(#{issue}): {slug} (implementation update)',
    prDefaultTitleNoIssue: 'feat: {slug} (implementation update)',
    issueHeader: '🧾 GitHub Issue Helper',
    prHeader: '🔀 GitHub PR Helper',
    labelFeature: 'Feature',
    labelBodyFile: 'Body file',
    labelLabels: 'Labels',
    labelPr: 'PR',
    issueCreated: '✅ Created: {url}',
    issueTemplateGenerated: 'Template generated. Add --create to open the issue automatically.',
    prTasksSynced: '✅ tasks.md PR metadata synced.',
    prMerged: '✅ PR merged (attempts: {attempts}).',
    prTemplateGenerated: 'Template generated. Add --create to open the PR automatically.',
    syncCommitWithIssue: 'docs(#{issue}): sync PR metadata for {folder}',
    syncCommitNoIssue: 'docs: sync PR metadata for {folder}',
    kindIssue: 'Issue',
    kindPr: 'PR',
  },
};

function tg(
  lang: Lang,
  key: keyof (typeof GITHUB_TEXT)['en'],
  vars: Record<string, string | number | undefined> = {}
): string {
  const template = GITHUB_TEXT[lang]?.[key] ?? GITHUB_TEXT.en[key];
  return formatTemplate(template, vars);
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

function toBodyFilePath(raw: string | undefined, fallbackName: string): string {
  const selected = raw?.trim() || path.join(os.tmpdir(), fallbackName);
  return path.resolve(selected);
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

function buildIssueBody(
  feature: FeatureContext,
  labels: string[],
  paths: ReturnType<typeof getFeatureDocPaths>,
  lang: Lang
): string {
  if (lang === 'ko') {
    return `## 개요

\`${feature.folderName}\` 기능을 구현합니다.

## 목표

- 기능 범위와 구현 결과를 명확히 정리합니다
- spec/plan/tasks를 결과와 동기화합니다

## 완료 기준

- [ ] 범위와 접근 방식이 문서화되어 있습니다
- [ ] 태스크가 완료되고 검증 가능합니다
- [ ] 관련 문서가 동기화되어 있습니다

## 관련 문서

- **Spec**: \`${paths.specPath}\`
- **Plan**: \`${paths.planPath}\`
- **Tasks**: \`${paths.tasksPath}\`

## 라벨

${labels.map((label) => `- \`${label}\``).join('\n')}
`;
  }

  return `## Overview

Implement feature \`${feature.folderName}\`.

## Goals

- Finalize feature scope and implementation outcome
- Keep spec/plan/tasks aligned with delivery

## Completion Criteria

- [ ] Scope and approach are documented clearly
- [ ] Tasks are complete and verifiable
- [ ] Related docs are synchronized

## Related Documents

- **Spec**: \`${paths.specPath}\`
- **Plan**: \`${paths.planPath}\`
- **Tasks**: \`${paths.tasksPath}\`

## Labels

${labels.map((label) => `- \`${label}\``).join('\n')}
`;
}

function buildPrBody(
  feature: FeatureContext,
  paths: ReturnType<typeof getFeatureDocPaths>,
  lang: Lang
): string {
  const closes = feature.issueNumber ? `\nCloses #${feature.issueNumber}\n` : '\n';
  if (lang === 'ko') {
    return `## 개요

\`${feature.folderName}\` 기능 구현과 문서 동기화 내용을 정리합니다.

## 변경 사항

- 기능 범위 구현을 완료했습니다
- 구현 결과에 맞춰 문서를 동기화했습니다
- tasks.md의 PR 메타데이터를 동기화했습니다

## 테스트

### 실행한 테스트

- [x] \`<테스트 명령어>\` — PASS

## 관련 문서

- **Spec**: \`${paths.specPath}\`
- **Tasks**: \`${paths.tasksPath}\`${closes}`;
  }

  return `## Overview

Implement and document feature \`${feature.folderName}\`.

## Changes

- Deliver implementation for the feature scope
- Update docs to match implementation and workflow state
- Keep PR metadata synchronized in tasks.md

## Tests

### Tests Run

- [x] \`<test command>\` — PASS

## Related Documents

- **Spec**: \`${paths.specPath}\`
- **Tasks**: \`${paths.tasksPath}\`${closes}`;
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

        const title =
          options.title?.trim() ||
          tg(config.lang, 'issueDefaultTitle', {
            slug: feature.slug,
            folder: feature.folderName,
          });
        const body = buildIssueBody(feature, labels, paths, config.lang);
        ensureSections(
          body,
          getRequiredIssueSections(config.lang),
          tg(config.lang, 'kindIssue'),
          config.lang
        );

        const bodyFile = toBodyFilePath(
          options.bodyFile,
          `lee-spec-kit.issue.${feature.folderName}.md`
        );
        await fs.ensureDir(path.dirname(bodyFile));
        await fs.writeFile(bodyFile, body, 'utf-8');

        let issueUrl: string | undefined;
        if (options.create) {
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

        const defaultTitle = feature.issueNumber
          ? tg(config.lang, 'prDefaultTitleWithIssue', {
              issue: feature.issueNumber,
              slug: feature.slug,
            })
          : tg(config.lang, 'prDefaultTitleNoIssue', {
              slug: feature.slug,
            });
        const title = options.title?.trim() || defaultTitle;
        const body = buildPrBody(feature, paths, config.lang);
        ensureSections(
          body,
          getRequiredPrSections(config.lang),
          tg(config.lang, 'kindPr'),
          config.lang
        );

        const bodyFile = toBodyFilePath(
          options.bodyFile,
          `lee-spec-kit.pr.${feature.folderName}.md`
        );
        await fs.ensureDir(path.dirname(bodyFile));
        await fs.writeFile(bodyFile, body, 'utf-8');

        const retryCount = toRetryCount(options.retry, config.lang);
        let prUrl = options.pr?.trim() || '';
        let mergedAttempts: number | undefined;
        let syncChanged = false;

        if (options.create) {
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

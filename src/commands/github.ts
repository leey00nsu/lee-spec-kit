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
import {
  getGithubDraftArtifactHeading,
  getGithubDraftRequiredSections,
} from '../utils/github-draft-contract.js';

interface GithubBaseOptions {
  json?: boolean;
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
  screenshots?: string;
  mermaid?: string;
}

type PrArtifactMode = 'auto' | 'on' | 'off';

interface PrArtifactPolicy {
  includeScreenshots: boolean;
  includeMermaid: boolean;
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
  | 'optPrScreenshots'
  | 'optPrMermaid'
  | 'optPrTitle'
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
  | 'artifactModeInvalid'
  | 'prScreenshotsSectionMissing'
  | 'prScreenshotImageMissing'
  | 'prMermaidSectionMissing'
  | 'prMermaidBlockMissing'
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
  options: Pick<GithubBaseOptions, 'component'>
): string | undefined {
  const component = (options.component || '').trim().toLowerCase();
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

function parsePrArtifactMode(
  raw: string | undefined,
  kind: 'screenshots' | 'mermaid',
  lang: Lang
): PrArtifactMode {
  const value = (raw || 'auto').trim().toLowerCase();
  if (value === 'auto' || value === 'on' || value === 'off') {
    return value;
  }
  throw createCliError(
    'INVALID_ARGUMENT',
    tg(lang, 'artifactModeInvalid', { kind, value })
  );
}

function resolvePrArtifactPolicy(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  feature: FeatureContext,
  options: GithubPrOptions
): PrArtifactPolicy {
  const screenshotsMode = parsePrArtifactMode(
    options.screenshots,
    'screenshots',
    config.lang
  );
  const mermaidMode = parsePrArtifactMode(
    options.mermaid,
    'mermaid',
    config.lang
  );

  const includeScreenshots =
    screenshotsMode === 'on'
      ? true
      : screenshotsMode === 'off'
        ? false
        : (config.pr?.screenshots?.upload ?? false);
  const includeMermaid =
    mermaidMode === 'on'
      ? true
      : mermaidMode === 'off'
        ? false
        : feature.type === 'be';

  return {
    includeScreenshots,
    includeMermaid,
  };
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

function resolveGithubProjectCwd(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  feature: FeatureContext
): string {
  const projectGitCwd = (feature.git.projectGitCwd || '').trim();
  if (projectGitCwd) return projectGitCwd;
  if (config.docsRepo === 'standalone') {
    throw createCliError(
      'PRECONDITION_FAILED',
      tr(config.lang, 'messages', 'standaloneNeedsProjectRoot')
    );
  }
  return process.cwd();
}

function resolveGithubDocsCwd(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  feature: FeatureContext
): string {
  const docsGitCwd = (feature.git.docsGitCwd || '').trim();
  if (docsGitCwd) return docsGitCwd;
  return config.docsDir;
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

function extractMarkdownByHeadings(
  content: string,
  headings: string[],
  levels: number[]
): string | undefined {
  const targets = new Set(headings.map((heading) => normalizeHeading(heading)));
  const lines = content.split('\n');
  let start = -1;
  let startLevel = 0;
  const levelSet = new Set(levels);

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(#{2,6})\s+(.+?)\s*$/);
    if (!match) continue;
    const level = match[1].length;
    if (!levelSet.has(level)) continue;
    if (!targets.has(normalizeHeading(match[2]))) continue;
    start = i + 1;
    startLevel = level;
    break;
  }

  if (start < 0) return undefined;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const heading = lines[i].match(/^\s*(#{2,6})\s+(.+?)\s*$/);
    if (!heading) continue;
    const level = heading[1].length;
    if (level <= startLevel) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function extractMarkdownSection(content: string, headings: string[]): string | undefined {
  return extractMarkdownByHeadings(content, headings, [2]);
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

function sanitizeDraftItem(raw: string): string | undefined {
  const trimmed = raw
    .replace(/^\s*-\s*\[[ xX]\]\s*/, '')
    .replace(/^\s*-\s+/, '')
    .replace(/^\s*###\s+/, '')
    .trim();
  const plain = trimmed.replace(/\*\*/g, '').trim();
  if (!plain) return undefined;
  if (isTemplateLine(plain)) return undefined;
  if (/^todo:/i.test(plain)) return undefined;
  if (/\{[^}]*\}/.test(plain)) return undefined;
  if (/^(as a|i want|so that)\b/i.test(plain)) return undefined;
  if (/^acceptance criteria:?$/i.test(plain)) return undefined;
  return plain.replace(/\s+/g, ' ');
}

function uniqItems(items: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const item of items) {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(item.trim());
  }
  return ordered;
}

function normalizeSemanticKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`\]\u005B'"(){}.,:;!?/\\_|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '');
}

function uniqItemsByContainment(items: string[]): string[] {
  const kept: string[] = [];
  const keys: string[] = [];

  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    const key = normalizeSemanticKey(clean);
    if (!key) continue;

    let replaced = false;
    for (let i = 0; i < keys.length; i++) {
      const current = keys[i];
      if (!current.includes(key) && !key.includes(current)) continue;
      if (key.length > current.length) {
        keys[i] = key;
        kept[i] = clean;
      }
      replaced = true;
      break;
    }

    if (!replaced) {
      keys.push(key);
      kept.push(clean);
    }
  }

  return kept;
}

function extractSectionLines(raw: string | undefined): string[] {
  if (!raw) return [];
  return uniqItems(
    raw
      .split('\n')
      .map((line) => sanitizeDraftItem(line))
      .filter((line): line is string => !!line)
  );
}

function extractSectionHeadings(raw: string | undefined): string[] {
  if (!raw) return [];
  return uniqItems(
    raw
      .split('\n')
      .map((line) => line.match(/^\s*###\s+(.+?)\s*$/)?.[1] || '')
      .map((line) => sanitizeDraftItem(line))
      .filter((line): line is string => !!line)
      .map((line) => line.replace(/^FR-\d+:\s*/i, '').trim())
  );
}

function toChecklistLines(items: string[]): string {
  return items.map((item) => `- [ ] ${item}`).join('\n');
}

function extractChecklistItems(raw: string | undefined): string[] {
  if (!raw) return [];
  return uniqItems(
    raw
      .split('\n')
      .map((line) => {
        const match = line.match(/^\s*-\s*\[[ xX]\]\s+(.+?)\s*$/);
        if (!match) return undefined;
        return sanitizeDraftItem(match[1]);
      })
      .filter((line): line is string => !!line)
  );
}

function extractTaskTitles(tasksContent: string): string[] {
  return uniqItems(
    tasksContent
      .split('\n')
      .map((line) => {
        const match = line.match(
          /^\s*-\s*\[(?:TODO|DOING|DONE)\][^\n]*?\s+(?:T-[A-Z0-9-]+\s+)?(.+?)\s*$/
        );
        if (!match) return undefined;
        return sanitizeDraftItem(match[1]);
      })
      .filter((line): line is string => !!line)
  );
}

function extractTasksAcceptanceItems(tasksContent: string): string[] {
  const lines = tasksContent.split('\n');
  const accepted: string[] = [];
  let inAcceptance = false;

  for (const line of lines) {
    if (/^\s*-\s*Acceptance\s*:\s*$/i.test(line)) {
      inAcceptance = true;
      continue;
    }
    if (inAcceptance && /^\s*-\s*Checklist\s*:\s*$/i.test(line)) {
      inAcceptance = false;
      continue;
    }
    if (!inAcceptance) continue;
    const match =
      line.match(/^\s*-\s*\[[ xX]\]\s+(.+?)\s*$/) ||
      line.match(/^\s*-\s+(.+?)\s*$/);
    if (!match) continue;
    const item = sanitizeDraftItem(match[1]);
    if (!item) continue;
    accepted.push(item);
  }

  return uniqItems(accepted);
}

function extractScopeItemsFromPlan(
  planContent: string,
  lang: Lang
): { include: string[]; exclude: string[] } {
  const section = extractMarkdownSection(
    planContent,
    ['범위(명확화)', '범위', 'Scope', 'Scope Clarification']
  );
  if (!section) return { include: [], exclude: [] };

  const lines = section.split('\n');
  const include: string[] = [];
  const exclude: string[] = [];
  let mode: 'include' | 'exclude' | null = null;

  const includePatterns =
    lang === 'ko' ? [/포함/] : [/in\s*scope/i, /^include$/i, /included/i];
  const excludePatterns =
    lang === 'ko' ? [/비포함/, /제외/] : [/out\s*of\s*scope/i, /^exclude$/i, /excluded/i];

  for (const line of lines) {
    const plain = line.replace(/\*\*/g, '').trim();
    if (!plain) continue;

    if (excludePatterns.some((re) => re.test(plain))) {
      mode = 'exclude';
      continue;
    }
    if (includePatterns.some((re) => re.test(plain))) {
      mode = 'include';
      continue;
    }

    const bullet = line.match(/^\s*-\s+(.+?)\s*$/)?.[1];
    if (!bullet) continue;
    const item = sanitizeDraftItem(bullet);
    if (!item) continue;
    if (mode === 'include') {
      include.push(item);
    } else if (mode === 'exclude') {
      exclude.push(item);
    }
  }

  return {
    include: uniqItems(include),
    exclude: uniqItems(exclude),
  };
}

function getIssueGoalsAndCriteria(
  specContent: string,
  planContent: string,
  tasksContent: string,
  overview: string,
  lang: Lang
): { goals: string[]; criteria: string[]; scope: string[] } {
  const purposeLines = extractSectionLines(
    extractMarkdownSection(specContent, ['목적', 'Purpose'])
  );
  const requirementHeadings = extractSectionHeadings(
    extractMarkdownSection(specContent, ['기능 요구사항', 'Functional Requirements'])
  );
  const userStoryChecklist = extractChecklistItems(
    extractMarkdownSection(specContent, ['사용자 스토리', 'User Stories'])
  );
  const tasksAcceptance = extractTasksAcceptanceItems(tasksContent);
  const scopeFromPlan = extractScopeItemsFromPlan(planContent, lang);
  const taskTitles = extractTaskTitles(tasksContent);

  const goals = uniqItemsByContainment(uniqItems([
    ...requirementHeadings,
    ...scopeFromPlan.include,
    ...purposeLines.slice(0, 1),
    sanitizeDraftItem(overview) || '',
  ])).slice(0, 5);

  while (goals.length < 3) {
    goals.push(
      lang === 'ko'
        ? goals.length === 0
          ? 'spec.md 목적에 맞춰 구현 범위를 확정한다.'
          : goals.length === 1
            ? '포함/제외 범위를 명확히 정의하고 문서와 구현을 일치시킨다.'
            : '관련 테스트 및 검증 경로를 포함해 기능 완성도를 확보한다.'
        : goals.length === 0
          ? 'Define implementation scope aligned with spec.md purpose.'
          : goals.length === 1
            ? 'Clarify in-scope and out-of-scope boundaries and keep docs/code aligned.'
            : 'Ensure feature completeness with concrete validation paths.'
    );
  }

  const criteria = uniqItemsByContainment(
    uniqItems([...userStoryChecklist, ...tasksAcceptance])
  ).slice(0, 6);
  while (criteria.length < 4) {
    criteria.push(
      lang === 'ko'
        ? criteria.length === 0
          ? '핵심 사용자 시나리오에서 목표 동작이 재현된다.'
          : criteria.length === 1
            ? '요구사항별 수용 기준이 모두 충족된다.'
            : criteria.length === 2
              ? '검증 방법(테스트/수동 시나리오)을 기록해 완료를 확인할 수 있다.'
              : '회귀 없이 기존 동작과의 호환성을 유지한다.'
        : criteria.length === 0
          ? 'Core user scenarios reproduce expected behavior.'
          : criteria.length === 1
            ? 'All requirement-level acceptance criteria are satisfied.'
            : criteria.length === 2
              ? 'Validation method (tests/manual scenarios) is documented for completion checks.'
              : 'Compatibility is preserved without regressions.'
    );
  }

  const scope = uniqItemsByContainment(
    uniqItems([...scopeFromPlan.include, ...taskTitles])
  ).slice(0, 6);

  return {
    goals: goals.slice(0, 5),
    criteria: criteria.slice(0, 6),
    scope,
  };
}

function extractPlanChangeTargets(planContent: string, lang: Lang): string[] {
  const section = extractMarkdownSection(
    planContent,
    [
      '변경 대상(예상)',
      '변경 대상',
      'Changed Files',
      'Change Targets',
      'Expected Changes',
    ]
  );
  if (!section) return [];

  const lines = section.split('\n');
  const out: string[] = [];
  let inCode = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!/[\\/]/.test(trimmed)) continue;
      out.push(
        lang === 'ko' ? `\`${trimmed}\` 변경` : `Update \`${trimmed}\``
      );
      continue;
    }

    const bullet = line.match(/^\s*-\s+(.+?)\s*$/)?.[1];
    if (!bullet) continue;
    const item = sanitizeDraftItem(bullet);
    if (!item) continue;
    out.push(item);
  }

  return uniqItemsByContainment(uniqItems(out));
}

function extractCommandsFromSection(raw: string | undefined): string[] {
  if (!raw) return [];
  const commands: string[] = [];

  for (const match of raw.matchAll(/`([^`]+)`/g)) {
    const candidate = match[1].trim();
    if (!candidate) continue;
    if (/\{[^}]*\}/.test(candidate)) continue;
    if (!/\b(pnpm|npm|yarn|bun|vitest|jest|tsx?|node)\b/.test(candidate)) continue;
    commands.push(candidate);
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim().replace(/^-+\s*/, '');
    if (!trimmed) continue;
    if (!/\b(pnpm|npm|yarn|bun|vitest|jest|tsx?|node)\b/.test(trimmed)) continue;
    if (/\{[^}]*\}/.test(trimmed)) continue;
    commands.push(trimmed);
  }

  return uniqItems(commands);
}

function extractRecordedTestLines(
  tasksContent: string,
  planContent: string,
  lang: Lang
): string[] {
  const section = extractMarkdownByHeadings(
    tasksContent,
    ['테스트 실행 기록', 'Tests Run', 'Test Run Log', 'Test Execution Log'],
    [3, 2]
  );

  const records: string[] = [];
  if (section) {
    for (const line of section.split('\n')) {
      if (!line.trim().startsWith('|')) continue;
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/`/g, ''));
      if (cells.length < 3) continue;
      const [cmd, time, result] = cells;
      if (!cmd || /^명령어$/i.test(cmd) || /^command$/i.test(cmd) || /^-+$/.test(cmd)) continue;
      if (/\{[^}]*\}/.test(cmd) || /\{[^}]*\}/.test(result || '')) continue;
      const renderedResult = result || (lang === 'ko' ? '미기록' : 'not recorded');
      const renderedTime = time && time !== '-' ? ` (${time})` : '';
      records.push(`\`${cmd}\` — ${renderedResult}${renderedTime}`);
    }

    const lines = section.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const commandMatch =
        lines[i].match(/^\s*-\s*(?:명령어|Command)\s*:\s*`?([^`]+?)`?\s*$/i);
      if (!commandMatch) continue;
      const command = commandMatch[1].trim();
      if (!command || /\{[^}]*\}/.test(command)) continue;
      let result = '';
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const resultMatch =
          lines[j].match(/^\s*-\s*(?:결과|Result)\s*:\s*(.+?)\s*$/i);
        if (!resultMatch) continue;
        result = resultMatch[1].replace(/`/g, '').trim();
        break;
      }
      if (!result || /\{[^}]*\}/.test(result)) continue;
      records.push(`\`${command}\` — ${result}`);
    }
  }

  if (records.length > 0) {
    return uniqItemsByContainment(uniqItems(records));
  }

  const plannedCommands = extractCommandsFromSection(
    extractMarkdownByHeadings(
      planContent,
      ['검증 명령(예정)', 'Validation Commands', 'Verification Commands'],
      [3, 2]
    )
  );

  if (plannedCommands.length > 0) {
    return plannedCommands.map((command) =>
      lang === 'ko'
        ? `\`${command}\` — 실행 결과를 기록하세요.`
        : `\`${command}\` — record execution result.`
    );
  }

  return [];
}

function getPrChangesAndTests(
  specContent: string,
  planContent: string,
  tasksContent: string,
  overview: string,
  lang: Lang
): { changes: string[]; tests: string[] } {
  const requirementHeadings = extractSectionHeadings(
    extractMarkdownSection(specContent, ['기능 요구사항', 'Functional Requirements'])
  );
  const scopeFromPlan = extractScopeItemsFromPlan(planContent, lang).include;
  const planTargets = extractPlanChangeTargets(planContent, lang);
  const taskTitles = extractTaskTitles(tasksContent);

  const changes = uniqItemsByContainment(
    uniqItems([
      ...taskTitles,
      ...scopeFromPlan,
      ...requirementHeadings,
      ...planTargets,
      sanitizeDraftItem(overview) || '',
    ])
  ).slice(0, 6);

  while (changes.length < 3) {
    changes.push(
      lang === 'ko'
        ? changes.length === 0
          ? '핵심 구현 변경 사항을 요약해 반영한다.'
          : changes.length === 1
            ? '영향 범위(호환성/마이그레이션 포함)를 명시한다.'
            : '문서와 구현 간 불일치가 없도록 정합성을 점검한다.'
        : changes.length === 0
          ? 'Summarize key implementation changes.'
          : changes.length === 1
            ? 'Document impact scope (including compatibility/migration).'
            : 'Verify document and implementation consistency.'
    );
  }

  const tests = uniqItemsByContainment(
    uniqItems(extractRecordedTestLines(tasksContent, planContent, lang))
  ).slice(0, 4);

  while (tests.length < 2) {
    tests.push(
      lang === 'ko'
        ? tests.length === 0
          ? '관련 테스트를 실행하고 결과를 기록한다.'
          : '미실행 테스트가 있으면 사유와 리스크를 기록한다.'
        : tests.length === 0
          ? 'Run relevant tests and record results.'
          : 'If tests were not run, record rationale and risk.'
    );
  }

  return {
    changes: changes.slice(0, 6),
    tests: tests.slice(0, 4),
  };
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

function getPrScreenshotsHeading(lang: Lang): string {
  return getGithubDraftArtifactHeading('pr', 'screenshots', lang) || (
    lang === 'ko' ? '스크린샷' : 'Screenshots'
  );
}

function getPrMermaidHeading(lang: Lang): string {
  return getGithubDraftArtifactHeading('pr', 'mermaid', lang) || (
    lang === 'ko' ? '아키텍처 다이어그램' : 'Architecture Diagram'
  );
}

function buildPrScreenshotsSection(lang: Lang): string {
  if (lang === 'ko') {
    return `
## 스크린샷

- [ ] 업로드한 스크린샷 URL을 포함하세요. (예: \`![](https://...)\`)
`;
  }
  return `
## Screenshots

- [ ] Include uploaded screenshot URL(s). (e.g. \`![](https://...)\`)
`;
}

function buildPrMermaidSection(lang: Lang): string {
  if (lang === 'ko') {
    return `
## 아키텍처 다이어그램

\`\`\`mermaid
sequenceDiagram
  participant Client
  participant API
  participant Service
  participant DB
  Client->>API: Request
  API->>Service: Execute
  Service->>DB: Query/Command
  DB-->>Service: Result
  Service-->>API: Response DTO
  API-->>Client: Response
\`\`\`
`;
  }
  return `
## Architecture Diagram

\`\`\`mermaid
sequenceDiagram
  participant Client
  participant API
  participant Service
  participant DB
  Client->>API: Request
  API->>Service: Execute
  Service->>DB: Query/Command
  DB-->>Service: Result
  Service-->>API: Response DTO
  API-->>Client: Response
\`\`\`
`;
}

function ensurePrArtifacts(
  body: string,
  policy: PrArtifactPolicy,
  lang: Lang
): void {
  if (policy.includeScreenshots) {
    const heading = getPrScreenshotsHeading(lang);
    const section = extractMarkdownByHeadings(body, [heading], [2]);
    if (!section) {
      throw createCliError(
        'PRECONDITION_FAILED',
        tg(lang, 'prScreenshotsSectionMissing', { section: heading })
      );
    }
    if (!/!\[[^\]]*]\((?!\s*\))[^)]+\)/m.test(section)) {
      throw createCliError(
        'PRECONDITION_FAILED',
        tg(lang, 'prScreenshotImageMissing', { section: heading })
      );
    }
  }

  if (policy.includeMermaid) {
    const heading = getPrMermaidHeading(lang);
    const section = extractMarkdownByHeadings(body, [heading], [2]);
    if (!section) {
      throw createCliError(
        'PRECONDITION_FAILED',
        tg(lang, 'prMermaidSectionMissing', { section: heading })
      );
    }
    if (!/```mermaid[\s\S]*?```/m.test(section)) {
      throw createCliError(
        'PRECONDITION_FAILED',
        tg(lang, 'prMermaidBlockMissing', { section: heading })
      );
    }
  }
}

function buildIssueBody(
  specContent: string,
  planContent: string,
  tasksContent: string,
  overview: string,
  labels: string[],
  paths: ReturnType<typeof getFeatureDocPaths>,
  lang: Lang
): string {
  const bodyPaths = toBodyDocPaths(paths);
  const draft = getIssueGoalsAndCriteria(specContent, planContent, tasksContent, overview, lang);
  const goals = toChecklistLines(draft.goals);
  const criteria = toChecklistLines(draft.criteria);
  const scopeSection =
    draft.scope.length > 0
      ? lang === 'ko'
        ? `
## 작업 범위(예정)

${draft.scope.map((item) => `- ${item}`).join('\n')}
`
        : `
## Planned Scope

${draft.scope.map((item) => `- ${item}`).join('\n')}
`
      : '';
  if (lang === 'ko') {
    return `## 개요

${overview}

## 목표

${goals}

## 완료 기준

${criteria}
${scopeSection}

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

${goals}

## Completion Criteria

${criteria}
${scopeSection}

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
  specContent: string,
  planContent: string,
  tasksContent: string,
  overview: string,
  paths: ReturnType<typeof getFeatureDocPaths>,
  artifactPolicy: PrArtifactPolicy,
  lang: Lang
): string {
  const bodyPaths = toBodyDocPaths(paths);
  const closes = feature.issueNumber ? `\nCloses #${feature.issueNumber}\n` : '\n';
  const draft = getPrChangesAndTests(
    specContent,
    planContent,
    tasksContent,
    overview,
    lang
  );
  const changes = toChecklistLines(draft.changes);
  const tests = toChecklistLines(draft.tests);
  const screenshotsSection = artifactPolicy.includeScreenshots
    ? buildPrScreenshotsSection(lang)
    : '';
  const mermaidSection = artifactPolicy.includeMermaid
    ? buildPrMermaidSection(lang)
    : '';
  if (lang === 'ko') {
    return `## 개요

${overview}

## 변경 사항

${changes}

## 테스트

### 실행한 테스트

${tests}
${screenshotsSection}
${mermaidSection}

## 관련 문서

- **Spec**: \`${bodyPaths.specPath}\`
- **Tasks**: \`${bodyPaths.tasksPath}\`${closes}`;
  }

  return `## Overview

${overview}

## Changes

${changes}

## Tests

### Tests Run

${tests}
${screenshotsSection}
${mermaidSection}

## Related Documents

- **Spec**: \`${bodyPaths.specPath}\`
- **Tasks**: \`${bodyPaths.tasksPath}\`${closes}`;
}

function getRequiredIssueSections(lang: Lang): string[] {
  return getGithubDraftRequiredSections('issue', lang);
}

function getRequiredPrSections(lang: Lang): string[] {
  return getGithubDraftRequiredSections('pr', lang);
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
        const selectedComponent = resolveComponentOption(options);
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
        const planContent = await fs.readFile(path.join(config.docsDir, paths.planPath), 'utf-8');
        const tasksContent = await fs.readFile(path.join(config.docsDir, paths.tasksPath), 'utf-8');
        const overview = resolveOverviewFromSpec(specContent, feature, config.lang);

        const title =
          options.title?.trim() ||
          tg(config.lang, 'issueDefaultTitle', {
            slug: feature.slug,
            folder: feature.folderName,
          });
        const generatedBody = buildIssueBody(
          specContent,
          planContent,
          tasksContent,
          overview,
          labels,
          paths,
          config.lang
        );
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
          const projectGitCwd = resolveGithubProjectCwd(config, feature);
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
            projectGitCwd,
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
    .option('--screenshots <mode>', tg(commandLang, 'optPrScreenshots'), 'auto')
    .option('--mermaid <mode>', tg(commandLang, 'optPrMermaid'), 'auto')
    .option('--no-sync-tasks', tg(commandLang, 'optPrNoSyncTasks'))
    .option('--commit-sync', tg(commandLang, 'optPrCommitSync'))
    .action(async (featureName: string | undefined, options: GithubPrOptions) => {
      try {
        const selectedComponent = resolveComponentOption(options);
        const { config, feature } = await resolveFeatureOrThrow(featureName, {
          component: selectedComponent,
        }, commandLang);

        const labels = parseLabels(options.labels, config.lang);
        const paths = getFeatureDocPaths(feature);
        ensureDocsExist(config.docsDir, [paths.specPath, paths.tasksPath], config.lang);
        const specContent = await fs.readFile(path.join(config.docsDir, paths.specPath), 'utf-8');
        const planPath = path.join(config.docsDir, paths.planPath);
        const planContent = (await fs.pathExists(planPath))
          ? await fs.readFile(planPath, 'utf-8')
          : '';
        const tasksContent = await fs.readFile(path.join(config.docsDir, paths.tasksPath), 'utf-8');
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
        const artifactPolicy = resolvePrArtifactPolicy(config, feature, options);
        const generatedBody = buildPrBody(
          feature,
          specContent,
          planContent,
          tasksContent,
          overview,
          paths,
          artifactPolicy,
          config.lang
        );
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
          const projectGitCwd = resolveGithubProjectCwd(config, feature);
          ensureNoTodoPlaceholders(body, tg(config.lang, 'kindPr'), config.lang);
          ensurePrArtifacts(body, artifactPolicy, config.lang);
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
            projectGitCwd,
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
            const docsGitCwd = resolveGithubDocsCwd(config, feature);
            const message = feature.issueNumber
              ? tg(config.lang, 'syncCommitWithIssue', {
                  issue: feature.issueNumber,
                  folder: feature.folderName,
                })
              : tg(config.lang, 'syncCommitNoIssue', {
                  folder: feature.folderName,
                });
            commitAndPushPath(
              docsGitCwd,
              synced.path,
              message,
              config.lang
            );
          }
        }

        if (options.merge) {
          const projectGitCwd = resolveGithubProjectCwd(config, feature);
          const merged = mergePrWithRetry(
            prUrl,
            projectGitCwd,
            retryCount,
            config.lang
          );
          mergedAttempts = merged.attempts;

          const baseBranch = options.base || 'main';
          runProcessOrThrow(
            'git',
            ['checkout', baseBranch],
            projectGitCwd,
            tg(config.lang, 'checkoutBaseAfterMergeFailed', { base: baseBranch })
          );
          runProcessOrThrow(
            'git',
            ['pull', '--rebase', 'origin', baseBranch],
            projectGitCwd,
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
                artifactPolicy: {
                  screenshots: artifactPolicy.includeScreenshots,
                  mermaid: artifactPolicy.includeMermaid,
                },
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

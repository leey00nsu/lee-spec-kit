import { createHash } from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import chalk from 'chalk';
import { DEFAULT_LANG, I18nKey, Lang, tr } from '../utils/i18n.js';
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
import { assertValid, validatePathWithLang } from '../utils/validation.js';
import {
  getGithubDraftArtifactHeading,
  getGithubDraftRequiredSections,
} from '../utils/github-draft-contract.js';
import { resolveComponentOption } from '../utils/context/component-option.js';
import {
  runGhJson as runGhJsonProcess,
  runProcess,
  runProcessOrThrow,
} from './github/process.js';

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

interface PrViewMeta {
  url: string;
  headRefName: string;
  baseRefName: string;
}

type GithubTextKey = Extract<I18nKey<'cli'>, `github.${string}`> extends `github.${infer Key}`
  ? Key
  : never;

function tg(
  lang: Lang,
  key: GithubTextKey,
  vars: Record<string, string | number | undefined> = {}
): string {
  const fullKey = `github.${key}` as I18nKey<'cli'>;
  return tr(lang, 'cli', fullKey, vars);
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDraftMetadataValue(content: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(
      `^\\s*-\\s*\\*\\*${escapeRegExp(key)}\\*\\*\\s*:\\s*(.*?)\\s*$`,
      'mi'
    );
    const match = content.match(re);
    if (!match) continue;
    const value = match[1].trim();
    if (value) return value;
  }
  return undefined;
}

function sanitizeDraftMetadataValue(raw: string | undefined): string | undefined {
  const value = (raw || '').trim();
  if (!value || value === '-') return undefined;
  if (/^\{[^}]+\}$/.test(value)) return undefined;
  if (/^\(.+\)$/.test(value)) return undefined;
  return value;
}

function parseWorkflowDraftStatus(raw: string | undefined): 'draft' | 'ready' | undefined {
  const value = (raw || '').trim();
  if (!value) return undefined;
  const matched = value.match(/\b(Draft|Ready)\b/i)?.[1]?.toLowerCase();
  if (matched === 'draft' || matched === 'ready') return matched;
  return undefined;
}

interface WorkflowDraftMetadata {
  status?: 'draft' | 'ready';
  title?: string;
  labels?: string;
}

function parseWorkflowDraftMetadata(content: string): WorkflowDraftMetadata {
  const status = parseWorkflowDraftStatus(
    extractDraftMetadataValue(content, ['Status', '상태'])
  );
  const title = sanitizeDraftMetadataValue(
    extractDraftMetadataValue(content, ['Title', '제목', 'PR Title', 'PR 제목'])
  );
  const labels = sanitizeDraftMetadataValue(
    extractDraftMetadataValue(content, ['Labels', '라벨'])
  );
  return {
    status,
    title,
    labels,
  };
}

interface PreparedGithubBody {
  body: string;
  bodyFile: string;
  source: 'generated' | 'explicit' | 'workflow-ready';
  draftMetadata?: WorkflowDraftMetadata;
}

async function prepareGithubBody(
  params: {
    create?: boolean;
    explicitBodyFile: string;
    defaultBodyFile: string;
    workflowDraftPath: string;
    generatedBody: string;
    requiredSections: string[];
    kindLabel: string;
    lang: Lang;
  }
): Promise<PreparedGithubBody> {
  const {
    create,
    explicitBodyFile,
    defaultBodyFile,
    workflowDraftPath,
    generatedBody,
    requiredSections,
    kindLabel,
    lang,
  } = params;

  if (create && explicitBodyFile && (await fs.pathExists(defaultBodyFile))) {
    const body = await fs.readFile(defaultBodyFile, 'utf-8');
    ensureSections(body, requiredSections, kindLabel, lang);
    return {
      body,
      bodyFile: defaultBodyFile,
      source: 'explicit',
    };
  }

  if (create && !explicitBodyFile && (await fs.pathExists(workflowDraftPath))) {
    const body = await fs.readFile(workflowDraftPath, 'utf-8');
    const draftMetadata = parseWorkflowDraftMetadata(body);
    if (draftMetadata.status === 'ready') {
      ensureSections(body, requiredSections, kindLabel, lang);
      return {
        body,
        bodyFile: workflowDraftPath,
        source: 'workflow-ready',
        draftMetadata,
      };
    }
  }

  await fs.ensureDir(path.dirname(defaultBodyFile));
  await fs.writeFile(defaultBodyFile, generatedBody, 'utf-8');
  return {
    body: generatedBody,
    bodyFile: defaultBodyFile,
    source: 'generated',
  };
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

function runGhJson<T>(args: string[], cwd: string, lang: Lang): T {
  return runGhJsonProcess<T>(args, cwd, {
    commandFailed: tg(lang, 'ghCommandFailed'),
    emptyJson: tg(lang, 'ghEmptyJson'),
    invalidJson: (snippet) =>
      tg(lang, 'ghInvalidJson', {
        snippet,
      }),
  });
}

function ensureSections(
  body: string,
  sections: string[],
  kind: string,
  lang: Lang
): void {
  const hasHeading = (sectionHeading: string): boolean => {
    const re = new RegExp(`^##\\s+${escapeRegExp(sectionHeading)}\\s*$`, 'm');
    return re.test(body);
  };
  const hasMetadataField = (field: string): boolean => {
    const re = new RegExp(`^\\s*-\\s*\\*\\*${escapeRegExp(field)}\\*\\*\\s*:`, 'm');
    return re.test(body);
  };
  const hasRequiredSection = (section: string): boolean => {
    if (hasHeading(section)) return true;

    const normalized = section.trim().toLowerCase();
    if (normalized === 'related documents') return hasHeading('Related Docs');
    if (normalized === 'related docs') return hasHeading('Related Documents');
    if (normalized === 'labels' || normalized === '라벨') {
      return hasMetadataField('Labels') || hasMetadataField('라벨');
    }

    return false;
  };

  const missing = sections.filter((section) => {
    return !hasRequiredSection(section);
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
  component: string,
  lang: Lang
): string {
  const selected =
    raw?.trim() ||
    path.join(os.tmpdir(), buildDefaultBodyFileName(kind, docsDir, component));
  assertValid(
    validatePathWithLang(selected, lang),
    `github.${kind}.bodyFile`,
    lang
  );
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
        : true;

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

function shouldPushDocsSync(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>
): boolean {
  if (config.docsRepo !== 'standalone') return true;
  return config.pushDocs === true;
}

function getFeatureDocPaths(feature: FeatureContext): {
  featurePathFromDocs: string;
  specPath: string;
  planPath: string;
  tasksPath: string;
  issuePath: string;
  prPath: string;
} {
  const featurePathFromDocs = feature.docs.featurePathFromDocs;
  return {
    featurePathFromDocs,
    specPath: `${featurePathFromDocs}/spec.md`,
    planPath: `${featurePathFromDocs}/plan.md`,
    tasksPath: `${featurePathFromDocs}/tasks.md`,
    issuePath: `${featurePathFromDocs}/issue.md`,
    prPath: `${featurePathFromDocs}/pr.md`,
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

function normalizeIssueTitleSummaryLine(raw: string): string {
  return raw
    .trim()
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/^\s*>\s*/, '')
    .replace(/`/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOverviewMetadataLine(line: string, lang: Lang): boolean {
  const cleaned = line.replace(/^[-*+]\s*/, '').trim().toLowerCase();
  const keys =
    lang === 'ko'
      ? ['기능 id', '기능명', '대상 레포', '이슈 번호', '작성일', '상태']
      : ['feature id', 'feature name', 'target repo', 'issue number', 'created', 'status'];
  return keys.some((key) => cleaned.startsWith(`${key}:`));
}

function truncateIssueTitleSummary(input: string, maxLength = 72): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 3).trimEnd()}...`;
}

function resolveIssueTitleSummary(
  overview: string,
  feature: FeatureContext,
  lang: Lang
): string {
  const candidates = overview
    .split('\n')
    .map((line) => normalizeIssueTitleSummaryLine(line))
    .filter((line) => !!line)
    .filter((line) => !isOverviewMetadataLine(line, lang));

  const fallback =
    lang === 'ko'
      ? `${feature.slug} 기능 구현`
      : `${feature.slug} feature implementation`;
  const picked = candidates[0] || fallback;
  return truncateIssueTitleSummary(picked);
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
  lang: Lang,
  options?: { pushToOrigin?: boolean }
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

  if (options?.pushToOrigin === false) return;

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
        const selectedComponent = resolveComponentOption(options.component);
        const { config, feature } = await resolveFeatureOrThrow(featureName, {
          component: selectedComponent,
        }, commandLang);

        const optionLabels = (options.labels || '').trim();
        const generatedLabels = parseLabels(optionLabels || undefined, config.lang);
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

        const defaultTitle = tg(config.lang, 'issueDefaultTitle', {
          slug: feature.slug,
          summary: resolveIssueTitleSummary(overview, feature, config.lang),
        });
        const generatedBody = buildIssueBody(
          specContent,
          planContent,
          tasksContent,
          overview,
          generatedLabels,
          paths,
          config.lang
        );
        ensureSections(
          generatedBody,
          getRequiredIssueSections(config.lang),
          tg(config.lang, 'kindIssue'),
          config.lang
        );

        const defaultBodyFile = toBodyFilePath(
          options.bodyFile,
          'issue',
          config.docsDir,
          feature.type,
          config.lang
        );
        const explicitBodyFile = (options.bodyFile || '').trim();
        const preparedBody = await prepareGithubBody({
          create: options.create,
          explicitBodyFile,
          defaultBodyFile,
          workflowDraftPath: path.join(config.docsDir, paths.issuePath),
          generatedBody,
          requiredSections: getRequiredIssueSections(config.lang),
          kindLabel: tg(config.lang, 'kindIssue'),
          lang: config.lang,
        });
        const body = preparedBody.body;
        const bodyFile = preparedBody.bodyFile;
        const title =
          options.title?.trim() ||
          (preparedBody.source === 'workflow-ready'
            ? preparedBody.draftMetadata?.title
            : undefined) ||
          defaultTitle;
        const labels = parseLabels(
          optionLabels ||
            (preparedBody.source === 'workflow-ready'
              ? preparedBody.draftMetadata?.labels
              : undefined),
          config.lang
        );

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
        process.exitCode = 1;
        return;
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
        const selectedComponent = resolveComponentOption(options.component);
        const { config, feature } = await resolveFeatureOrThrow(featureName, {
          component: selectedComponent,
        }, commandLang);

        const optionLabels = (options.labels || '').trim();
        const generatedLabels = parseLabels(optionLabels || undefined, config.lang);
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
        const artifactPolicy = resolvePrArtifactPolicy(config, options);
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

        const defaultBodyFile = toBodyFilePath(
          options.bodyFile,
          'pr',
          config.docsDir,
          feature.type,
          config.lang
        );
        const explicitBodyFile = (options.bodyFile || '').trim();
        const preparedBody = await prepareGithubBody({
          create: options.create,
          explicitBodyFile,
          defaultBodyFile,
          workflowDraftPath: path.join(config.docsDir, paths.prPath),
          generatedBody,
          requiredSections: getRequiredPrSections(config.lang),
          kindLabel: tg(config.lang, 'kindPr'),
          lang: config.lang,
        });
        const body = preparedBody.body;
        const bodyFile = preparedBody.bodyFile;
        const title =
          options.title?.trim() ||
          (preparedBody.source === 'workflow-ready'
            ? preparedBody.draftMetadata?.title
            : undefined) ||
          defaultTitle;
        const labels = parseLabels(
          optionLabels ||
            (preparedBody.source === 'workflow-ready'
              ? preparedBody.draftMetadata?.labels
              : undefined),
          config.lang
        );
        const baseBranch = options.base || 'main';

        const retryCount = toRetryCount(options.retry, config.lang);
        let prUrl = options.pr?.trim() || '';
        let mergedAttempts: number | undefined;
        let syncChanged = false;
        const pushDocsSync = shouldPushDocsSync(config);

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
            baseBranch,
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
          prUrl = (feature.pr.link || '').trim();
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
              config.lang,
              { pushToOrigin: pushDocsSync }
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

          if (prUrl && options.syncTasks !== false) {
            const mergedSync = syncTasksPrMetadata(
              path.join(config.docsDir, paths.tasksPath),
              prUrl,
              'Approved',
              config.lang
            );
            syncChanged = syncChanged || mergedSync.changed;
            if (mergedSync.changed) {
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
                mergedSync.path,
                message,
                config.lang,
                { pushToOrigin: pushDocsSync }
              );
            }
          }
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
        process.exitCode = 1;
        return;
      }
    });
}

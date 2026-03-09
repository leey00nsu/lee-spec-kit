import { createHash } from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { DEFAULT_LANG, I18nKey, Lang, tr } from '../utils/i18n.js';
import { getConfig } from '../utils/config.js';
import {
  ContextSelectionOptions,
  resolveContextSelection,
} from '../utils/context-selection.js';
import { createCliContext } from '../utils/cli-context.js';
import { FeatureContext } from '../utils/context/index.js';
import { createCliError } from '../utils/cli-error.js';
import { assertValid, validatePathWithLang } from '../utils/validation.js';
import {
  getGithubDraftArtifactHeading,
  getGithubDraftRequiredSections,
} from '../utils/github-draft-contract.js';
import {
  runGhJson as runGhJsonProcess,
  runProcess,
  runProcessOrThrow,
} from '../commands/github/process.js';

export interface GithubBaseOptions {
  json?: boolean;
  component?: string;
}

export interface GithubIssueOptions extends GithubBaseOptions {
  create?: boolean;
  confirm?: string;
  title?: string;
  labels?: string;
  bodyFile?: string;
  assignee?: string;
}

export interface GithubPrOptions extends GithubBaseOptions {
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

export type PrArtifactMode = 'auto' | 'on' | 'off';

export interface PrArtifactPolicy {
  includeScreenshots: boolean;
  includeMermaid: boolean;
}

export interface PrViewMeta {
  url: string;
  headRefName: string;
  baseRefName: string;
}

export interface PrMergeStateMeta {
  state?: string;
  mergedAt?: string | null;
  baseRefName?: string;
}

export type GithubTextKey =
  Extract<I18nKey<'cli'>, `github.${string}`> extends `github.${infer Key}`
    ? Key
    : never;

export function tg(
  lang: Lang,
  key: GithubTextKey,
  vars: Record<string, string | number | undefined> = {}
): string {
  const fullKey = `github.${key}` as I18nKey<'cli'>;
  return tr(lang, 'cli', fullKey, vars);
}

export function detectGithubCliLangSync(cwd: string): Lang {
  const explicitDocsDir = (process.env.LEE_SPEC_KIT_DOCS_DIR || '').trim();
  const startDirs = [
    explicitDocsDir ? path.resolve(explicitDocsDir) : '',
    path.resolve(cwd),
  ].filter(Boolean);

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
          if (parsed?.lang === 'ko' || parsed?.lang === 'en')
            return parsed.lang;
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

export function parseLabels(raw: string | undefined, lang: Lang): string[] {
  const labels = (raw || 'enhancement')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (labels.length === 0) {
    throw createCliError('INVALID_ARGUMENT', tg(lang, 'labelsRequired'));
  }
  return [...new Set(labels)];
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractDraftMetadataValue(
  content: string,
  keys: string[]
): string | undefined {
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

export function sanitizeDraftMetadataValue(
  raw: string | undefined
): string | undefined {
  const value = (raw || '').trim();
  if (!value || value === '-') return undefined;
  if (/^\{[^}]+\}$/.test(value)) return undefined;
  if (/^\(.+\)$/.test(value)) return undefined;
  return value;
}

export function sanitizeDraftTitleValue(
  raw: string | undefined
): string | undefined {
  const value = sanitizeDraftMetadataValue(raw);
  if (!value) return undefined;
  const normalized = value
    .replace(/`/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || undefined;
}

export function parseWorkflowDraftStatus(
  raw: string | undefined
): 'draft' | 'ready' | undefined {
  const value = (raw || '').trim();
  if (!value) return undefined;
  const matched = value.match(/\b(Draft|Ready)\b/i)?.[1]?.toLowerCase();
  if (matched === 'draft' || matched === 'ready') return matched;
  return undefined;
}

export interface WorkflowDraftMetadata {
  status?: 'draft' | 'ready';
  title?: string;
  labels?: string;
}

export function parseWorkflowDraftMetadata(
  content: string
): WorkflowDraftMetadata {
  const status = parseWorkflowDraftStatus(
    extractDraftMetadataValue(content, ['Status', '상태'])
  );
  const title = sanitizeDraftTitleValue(
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

export interface PreparedGithubBody {
  body: string;
  bodyFile: string;
  source: 'generated' | 'explicit' | 'workflow-ready';
  draftMetadata?: WorkflowDraftMetadata;
}

export async function prepareGithubBody(params: {
  create?: boolean;
  explicitBodyFile: string;
  defaultBodyFile: string;
  workflowDraftPath: string;
  generatedBody: string;
  requiredSections: string[];
  kindLabel: string;
  lang: Lang;
}): Promise<PreparedGithubBody> {
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

export function hasExplicitRemoteApproval(raw: string | undefined): boolean {
  return (raw || '').trim().toUpperCase() === 'OK';
}

export function assertRemoteApproval(
  raw: string | undefined,
  operation: string,
  lang: Lang
): void {
  if (hasExplicitRemoteApproval(raw)) return;
  throw createCliError(
    'APPROVAL_REQUIRED',
    tg(lang, 'approvalRequired', { operation })
  );
}

export function runGhJson<T>(args: string[], cwd: string, lang: Lang): T {
  return runGhJsonProcess<T>(args, cwd, {
    commandFailed: tg(lang, 'ghCommandFailed'),
    emptyJson: tg(lang, 'ghEmptyJson'),
    invalidJson: (snippet: string) =>
      tg(lang, 'ghInvalidJson', {
        snippet,
      }),
  });
}

export function ensureSections(
  body: string,
  sections: string[],
  kind: string,
  lang: Lang
): void {
  const hasHeading = (sectionHeading: string): boolean => {
    const target = normalizeHeading(sectionHeading);
    const lines = body.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*##\s+(.+?)\s*$/);
      if (!match) continue;
      if (normalizeHeading(match[1]) === target) return true;
    }
    return false;
  };
  const hasMetadataField = (field: string): boolean => {
    const re = new RegExp(
      `^\\s*-\\s*\\*\\*${escapeRegExp(field)}\\*\\*\\s*:`,
      'm'
    );
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

export function ensureDocsExist(
  docsDir: string,
  relativePaths: string[],
  lang: Lang
): void {
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

export function buildDefaultBodyFileName(
  kind: 'issue' | 'pr',
  docsDir: string,
  component: string
): string {
  const key = `${path.resolve(docsDir)}::${component.trim().toLowerCase()}`;
  const digest = createHash('sha1').update(key).digest('hex').slice(0, 12);
  return `lee-spec-kit.${digest}.${kind}.md`;
}

export function toBodyFilePath(
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

export function toProjectRootDocsPath(relativePathFromDocs: string): string {
  const normalized = relativePathFromDocs
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  if (normalized.startsWith('docs/')) return normalized;
  return `docs/${normalized}`;
}

export function toBodyDocPaths(
  paths: ReturnType<typeof getFeatureDocPaths>
): ReturnType<typeof getFeatureDocPaths> {
  return {
    ...paths,
    specPath: toProjectRootDocsPath(paths.specPath),
    planPath: toProjectRootDocsPath(paths.planPath),
    tasksPath: toProjectRootDocsPath(paths.tasksPath),
  };
}

export const TODO_PLACEHOLDER_PATTERN = /(^|\n)\s*-\s*\[[ xX]\]\s*TODO:/m;

export function ensureNoTodoPlaceholders(
  body: string,
  kind: string,
  lang: Lang
): void {
  if (!TODO_PLACEHOLDER_PATTERN.test(body)) return;
  throw createCliError(
    'PRECONDITION_FAILED',
    tg(lang, 'todoPlaceholdersRemain', { kind })
  );
}

export function parsePrArtifactMode(
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

export function resolvePrArtifactPolicy(
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
    mermaidMode === 'on' ? true : mermaidMode === 'off' ? false : true;

  return {
    includeScreenshots,
    includeMermaid,
  };
}

export async function resolveFeatureOrThrow(
  featureName: string | undefined,
  options: ContextSelectionOptions,
  lang: Lang
): Promise<{
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>;
  feature: FeatureContext;
}> {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(lang, 'cli', 'common.configNotFound')
    );
  }

  const ctx = (await createCliContext({ cwd: process.cwd() }))!;
  const state = await resolveContextSelection(ctx, featureName, options);
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

export function resolveGithubProjectCwd(
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

export function resolveGithubDocsCwd(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  feature: FeatureContext
): string {
  const docsGitCwd = (feature.git.docsGitCwd || '').trim();
  if (docsGitCwd) return docsGitCwd;
  return config.docsDir;
}

export function shouldPushDocsSync(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>
): boolean {
  if (config.docsRepo !== 'standalone') return true;
  return config.pushDocs === true;
}

export function getFeatureDocPaths(feature: FeatureContext): {
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

export function normalizeHeading(value: string): string {
  let normalized = value.trim();
  for (;;) {
    const next = normalized
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\s*（[^）]*）\s*$/, '')
      .trim();
    if (next === normalized) break;
    normalized = next;
  }
  return normalized.replace(/\s+/g, ' ').toLowerCase();
}

export function extractMarkdownByHeadings(
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

export function removeMarkdownByHeadings(
  content: string,
  headings: string[],
  levels: number[]
): string {
  const targets = new Set(headings.map((heading) => normalizeHeading(heading)));
  const lines = content.split('\n');
  const levelSet = new Set(levels);
  let start = -1;
  let startLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(#{2,6})\s+(.+?)\s*$/);
    if (!match) continue;
    const level = match[1].length;
    if (!levelSet.has(level)) continue;
    if (!targets.has(normalizeHeading(match[2]))) continue;
    start = i;
    startLevel = level;
    break;
  }

  if (start < 0) return content;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const heading = lines[i].match(/^\s*(#{2,6})\s+(.+?)\s*$/);
    if (!heading) continue;
    const level = heading[1].length;
    if (level <= startLevel) {
      end = i;
      break;
    }
  }

  const next = [...lines.slice(0, start), ...lines.slice(end)].join('\n');
  const hasTrailingNewline = /\n$/.test(content);
  const normalized = next.replace(/\n{3,}/g, '\n\n').trimEnd();
  if (!normalized) return '';
  return hasTrailingNewline ? `${normalized}\n` : normalized;
}

export function extractMarkdownSection(
  content: string,
  headings: string[]
): string | undefined {
  return extractMarkdownByHeadings(content, headings, [2]);
}

export function stripIssueDraftMetadataSection(content: string): string {
  return stripWorkflowDraftMetadataSection(content);
}

export function stripWorkflowDraftMetadataSection(content: string): string {
  return removeMarkdownByHeadings(content, ['Metadata', '메타데이터'], [2]);
}

export function isTemplateLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^---+$/.test(trimmed)) return true;
  if (/^\(.+\)$/.test(trimmed)) return true;
  if (/\{\{[^}]+\}\}/.test(trimmed)) return true;
  if (/^\{[^}]+\}$/.test(trimmed)) return true;
  return false;
}

export function sanitizeOverviewSection(
  raw: string | undefined
): string | undefined {
  if (!raw) return undefined;
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isTemplateLine(line));
  if (lines.length === 0) return undefined;
  return lines.slice(0, 5).join('\n');
}

export function sanitizeDraftItem(raw: string): string | undefined {
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

export function uniqItems(items: string[]): string[] {
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

export function normalizeSemanticKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`\]\u005B'"(){}.,:;!?/\\_|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '');
}

export function uniqItemsByContainment(items: string[]): string[] {
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

export function extractSectionLines(raw: string | undefined): string[] {
  if (!raw) return [];
  return uniqItems(
    raw
      .split('\n')
      .map((line) => sanitizeDraftItem(line))
      .filter((line): line is string => !!line)
  );
}

export function extractSectionHeadings(raw: string | undefined): string[] {
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

export function toChecklistLines(items: string[]): string {
  return items.map((item) => `- [ ] ${item}`).join('\n');
}

export function extractChecklistItems(raw: string | undefined): string[] {
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

export function extractTaskTitles(tasksContent: string): string[] {
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

export function extractTasksAcceptanceItems(tasksContent: string): string[] {
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

export function extractScopeItemsFromPlan(
  planContent: string,
  lang: Lang
): { include: string[]; exclude: string[] } {
  const section = extractMarkdownSection(planContent, [
    '범위(명확화)',
    '범위',
    'Scope',
    'Scope Clarification',
  ]);
  if (!section) return { include: [], exclude: [] };

  const lines = section.split('\n');
  const include: string[] = [];
  const exclude: string[] = [];
  let mode: 'include' | 'exclude' | null = null;

  const includePatterns =
    lang === 'ko' ? [/포함/] : [/in\s*scope/i, /^include$/i, /included/i];
  const excludePatterns =
    lang === 'ko'
      ? [/비포함/, /제외/]
      : [/out\s*of\s*scope/i, /^exclude$/i, /excluded/i];

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

export function getIssueGoalsAndCriteria(
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
    extractMarkdownSection(specContent, [
      '기능 요구사항',
      'Functional Requirements',
    ])
  );
  const userStoryChecklist = extractChecklistItems(
    extractMarkdownSection(specContent, ['사용자 스토리', 'User Stories'])
  );
  const tasksAcceptance = extractTasksAcceptanceItems(tasksContent);
  const scopeFromPlan = extractScopeItemsFromPlan(planContent, lang);
  const taskTitles = extractTaskTitles(tasksContent);

  const goals = uniqItemsByContainment(
    uniqItems([
      ...requirementHeadings,
      ...scopeFromPlan.include,
      ...purposeLines.slice(0, 1),
      sanitizeDraftItem(overview) || '',
    ])
  ).slice(0, 5);

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

export function extractPlanChangeTargets(
  planContent: string,
  lang: Lang
): string[] {
  const section = extractMarkdownSection(planContent, [
    '변경 대상(예상)',
    '변경 대상',
    'Changed Files',
    'Change Targets',
    'Expected Changes',
  ]);
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
      out.push(lang === 'ko' ? `\`${trimmed}\` 변경` : `Update \`${trimmed}\``);
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

export function extractCommandsFromSection(raw: string | undefined): string[] {
  if (!raw) return [];
  const commands: string[] = [];

  for (const match of raw.matchAll(/`([^`]+)`/g)) {
    const candidate = match[1].trim();
    if (!candidate) continue;
    if (/\{[^}]*\}/.test(candidate)) continue;
    if (!/\b(pnpm|npm|yarn|bun|vitest|jest|tsx?|node)\b/.test(candidate))
      continue;
    commands.push(candidate);
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim().replace(/^-+\s*/, '');
    if (!trimmed) continue;
    if (!/\b(pnpm|npm|yarn|bun|vitest|jest|tsx?|node)\b/.test(trimmed))
      continue;
    if (/\{[^}]*\}/.test(trimmed)) continue;
    commands.push(trimmed);
  }

  return uniqItems(commands);
}

export function extractRecordedTestLines(
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
      if (
        !cmd ||
        /^명령어$/i.test(cmd) ||
        /^command$/i.test(cmd) ||
        /^-+$/.test(cmd)
      )
        continue;
      if (/\{[^}]*\}/.test(cmd) || /\{[^}]*\}/.test(result || '')) continue;
      const renderedResult =
        result || (lang === 'ko' ? '미기록' : 'not recorded');
      const renderedTime = time && time !== '-' ? ` (${time})` : '';
      records.push(`\`${cmd}\` — ${renderedResult}${renderedTime}`);
    }

    const lines = section.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const commandMatch = lines[i].match(
        /^\s*-\s*(?:명령어|Command)\s*:\s*`?([^`]+?)`?\s*$/i
      );
      if (!commandMatch) continue;
      const command = commandMatch[1].trim();
      if (!command || /\{[^}]*\}/.test(command)) continue;
      let result = '';
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const resultMatch = lines[j].match(
          /^\s*-\s*(?:결과|Result)\s*:\s*(.+?)\s*$/i
        );
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

export function getPrChangesAndTests(
  specContent: string,
  planContent: string,
  tasksContent: string,
  overview: string,
  lang: Lang
): { changes: string[]; tests: string[] } {
  const requirementHeadings = extractSectionHeadings(
    extractMarkdownSection(specContent, [
      '기능 요구사항',
      'Functional Requirements',
    ])
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

export function resolveOverviewFromSpec(
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

export function normalizeIssueTitleSummaryLine(raw: string): string {
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

export function isOverviewMetadataLine(line: string, lang: Lang): boolean {
  const cleaned = line
    .replace(/^[-*+]\s*/, '')
    .trim()
    .toLowerCase();
  const keys =
    lang === 'ko'
      ? ['기능 id', '기능명', '대상 레포', '이슈 번호', '작성일', '상태']
      : [
          'feature id',
          'feature name',
          'target repo',
          'issue number',
          'created',
          'status',
        ];
  return keys.some((key) => cleaned.startsWith(`${key}:`));
}

export function truncateIssueTitleSummary(
  input: string,
  maxLength = 72
): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 3).trimEnd()}...`;
}

export function resolveIssueTitleSummary(
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

export function getPrScreenshotsHeading(lang: Lang): string {
  return (
    getGithubDraftArtifactHeading('pr', 'screenshots', lang) ||
    (lang === 'ko' ? '스크린샷' : 'Screenshots')
  );
}

export function getPrMermaidHeading(lang: Lang): string {
  return (
    getGithubDraftArtifactHeading('pr', 'mermaid', lang) ||
    (lang === 'ko' ? '아키텍처 다이어그램' : 'Architecture Diagram')
  );
}

export function buildPrScreenshotsSection(lang: Lang): string {
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

export function buildPrMermaidSection(lang: Lang): string {
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

export function ensurePrArtifacts(
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

export function buildIssueBody(
  specContent: string,
  planContent: string,
  tasksContent: string,
  overview: string,
  labels: string[],
  paths: ReturnType<typeof getFeatureDocPaths>,
  lang: Lang
): string {
  const bodyPaths = toBodyDocPaths(paths);
  const draft = getIssueGoalsAndCriteria(
    specContent,
    planContent,
    tasksContent,
    overview,
    lang
  );
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

export function buildPrBody(
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
  const closes = feature.issueNumber
    ? `\nCloses #${feature.issueNumber}\n`
    : '\n';
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

export function stripMarkdownCodeContexts(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;

  for (const line of lines) {
    const fenceStartMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceStartMatch) {
      const marker = fenceStartMatch[1];
      const markerChar = marker[0];
      const markerLength = marker.length;
      if (!inFence) {
        inFence = true;
        fenceChar = markerChar;
        fenceLength = markerLength;
        continue;
      }
      if (markerChar === fenceChar && markerLength >= fenceLength) {
        inFence = false;
        fenceChar = '';
        fenceLength = 0;
      }
      continue;
    }
    if (inFence) continue;
    out.push(line.replace(/`[^`\n]*`/g, ''));
  }

  return out.join('\n');
}

export function hasIssueClosingKeyword(
  body: string,
  issueNumber: string | undefined
): boolean {
  if (!issueNumber) return false;
  const cleaned = stripMarkdownCodeContexts(body);
  const issue = escapeRegExp(issueNumber);
  const closeKeywordRegex = new RegExp(
    `\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\b\\s*(?:[a-zA-Z0-9_.-]+\\/)?#\\s*${issue}\\b`,
    'i'
  );
  return closeKeywordRegex.test(cleaned);
}

export function ensureIssueClosingLine(
  body: string,
  issueNumber: string | undefined
): string {
  if (!issueNumber) return body;
  if (hasIssueClosingKeyword(body, issueNumber)) return body;
  const trimmed = body.trimEnd();
  const separator = trimmed.length > 0 ? '\n\n' : '';
  return `${trimmed}${separator}Closes #${issueNumber}\n`;
}

export function getRequiredIssueSections(lang: Lang): string[] {
  return getGithubDraftRequiredSections('issue', lang);
}

export function getRequiredPrSections(lang: Lang): string[] {
  return getGithubDraftRequiredSections('pr', lang);
}

export function replaceListField(
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

export function insertFieldInGithubIssueSection(
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

export function insertFieldInMetadataSection(
  content: string,
  key: string,
  value: string
): { content: string; changed: boolean } {
  const lines = content.split('\n');
  const headingIndex = lines.findIndex((line) =>
    /^\s*##\s+(?:Metadata|메타데이터)\s*$/.test(line)
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

export function extractIssueNumberFromUrl(
  issueUrl: string | undefined
): string | undefined {
  const value = (issueUrl || '').trim();
  if (!value) return undefined;
  const match = value.match(/\/issues\/(\d+)(?:[/?#]|$)/);
  return match?.[1];
}

export function syncTasksIssueMetadata(
  tasksPath: string,
  issueNumber: string,
  lang: Lang
): { changed: boolean; path: string } {
  if (!fs.existsSync(tasksPath)) {
    throw createCliError(
      'DOCS_NOT_FOUND',
      tg(lang, 'tasksNotFound', { path: tasksPath })
    );
  }

  const original = fs.readFileSync(tasksPath, 'utf-8');
  let next = original;
  let changed = false;
  const issueValue = `#${issueNumber}`;

  const issueReplaced = replaceListField(
    next,
    ['Issue', 'Issue Number', '이슈', '이슈 번호'],
    issueValue
  );
  next = issueReplaced.content;
  changed = changed || issueReplaced.changed;
  if (!issueReplaced.found) {
    const inserted = insertFieldInGithubIssueSection(next, 'Issue', issueValue);
    next = inserted.content;
    changed = changed || inserted.changed;
  }

  if (changed) {
    fs.writeFileSync(tasksPath, next, 'utf-8');
  }

  return { changed, path: tasksPath };
}

export function syncIssueDraftMetadata(
  issueDocPath: string,
  issueNumber: string
): { changed: boolean; path: string } {
  if (!fs.existsSync(issueDocPath)) {
    return { changed: false, path: issueDocPath };
  }

  const original = fs.readFileSync(issueDocPath, 'utf-8');
  let next = original;
  let changed = false;
  const issueValue = `#${issueNumber}`;

  const issueReplaced = replaceListField(
    next,
    ['Issue', 'Issue Number', '이슈', '이슈 번호'],
    issueValue
  );
  next = issueReplaced.content;
  changed = changed || issueReplaced.changed;
  if (!issueReplaced.found) {
    const inserted = insertFieldInMetadataSection(next, 'Issue', issueValue);
    next = inserted.content;
    changed = changed || inserted.changed;
  }

  if (changed) {
    fs.writeFileSync(issueDocPath, next, 'utf-8');
  }

  return { changed, path: issueDocPath };
}

export function syncTasksPrMetadata(
  tasksPath: string,
  prUrl: string,
  nextStatus: 'Review' | 'Approved',
  lang: Lang
): { changed: boolean; path: string } {
  if (!fs.existsSync(tasksPath)) {
    throw createCliError(
      'DOCS_NOT_FOUND',
      tg(lang, 'tasksNotFound', { path: tasksPath })
    );
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
    const inserted = insertFieldInGithubIssueSection(
      next,
      'PR Status',
      nextStatus
    );
    next = inserted.content;
    changed = changed || inserted.changed;
  }

  if (changed) {
    fs.writeFileSync(tasksPath, next, 'utf-8');
  }
  return { changed, path: tasksPath };
}

export function syncPrDraftMetadata(
  prDocPath: string,
  prUrl: string,
  nextStatus: 'Review' | 'Approved'
): { changed: boolean; path: string } {
  if (!fs.existsSync(prDocPath)) {
    return { changed: false, path: prDocPath };
  }

  const original = fs.readFileSync(prDocPath, 'utf-8');
  let next = original;
  let changed = false;

  const prReplaced = replaceListField(next, ['PR', 'Pull Request'], prUrl);
  next = prReplaced.content;
  changed = changed || prReplaced.changed;
  if (!prReplaced.found) {
    const inserted = insertFieldInMetadataSection(next, 'PR', prUrl);
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
    const inserted = insertFieldInMetadataSection(next, 'PR Status', nextStatus);
    next = inserted.content;
    changed = changed || inserted.changed;
  }

  if (changed) {
    fs.writeFileSync(prDocPath, next, 'utf-8');
  }

  return { changed, path: prDocPath };
}

export function gitCurrentBranch(cwd: string, lang: Lang): string {
  const result = runProcessOrThrow(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    cwd,
    tg(lang, 'detectBranchFailed')
  );
  return result.stdout.trim();
}

export function ensureCleanWorktree(cwd: string, lang: Lang): void {
  const result = runProcessOrThrow(
    'git',
    ['status', '--porcelain=v1'],
    cwd,
    tg(lang, 'inspectWorktreeFailed')
  );
  if (result.stdout.trim().length > 0) {
    throw createCliError('PRECONDITION_FAILED', tg(lang, 'worktreeNotClean'));
  }
}

export function commitAndPushPath(
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

  runProcessOrThrow(
    'git',
    ['add', '--', relativePath],
    cwd,
    tg(lang, 'stageFileFailed')
  );
  runProcessOrThrow(
    'git',
    ['commit', '-m', message],
    cwd,
    tg(lang, 'commitSyncFailed')
  );

  if (options?.pushToOrigin === false) return;

  const branch = gitCurrentBranch(cwd, lang);
  runProcessOrThrow(
    'git',
    ['push', '-u', 'origin', branch],
    cwd,
    tg(lang, 'pushSyncFailed')
  );
}

export function commitAndPushPaths(
  cwd: string,
  absPaths: string[],
  message: string,
  lang: Lang,
  options?: { pushToOrigin?: boolean }
): void {
  const uniqueRelativePaths = [
    ...new Set(
      absPaths
        .filter((absPath) => !!absPath && fs.existsSync(absPath))
        .map((absPath) => path.relative(cwd, absPath) || absPath)
    ),
  ];
  if (uniqueRelativePaths.length === 0) return;

  const status = runProcessOrThrow(
    'git',
    ['status', '--porcelain=v1', '--', ...uniqueRelativePaths],
    cwd,
    tg(lang, 'inspectFileStatusFailed')
  );
  if (status.stdout.trim().length === 0) return;

  runProcessOrThrow(
    'git',
    ['add', '--', ...uniqueRelativePaths],
    cwd,
    tg(lang, 'stageFileFailed')
  );
  runProcessOrThrow(
    'git',
    ['commit', '-m', message],
    cwd,
    tg(lang, 'commitSyncFailed')
  );

  if (options?.pushToOrigin === false) return;

  const branch = gitCurrentBranch(cwd, lang);
  runProcessOrThrow(
    'git',
    ['push', '-u', 'origin', branch],
    cwd,
    tg(lang, 'pushSyncFailed')
  );
}

export function shouldRefreshHeadBranch(
  stderr: string,
  stdout: string
): boolean {
  const text = `${stderr}\n${stdout}`;
  return /out of date|not possible to fast-forward|must be up to date|not up to date/i.test(
    text
  );
}

export function refreshPrHeadBranch(
  prRef: string,
  cwd: string,
  lang: Lang
): void {
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

  const hasLocalHead =
    runProcess(
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

export function mergePrWithRetry(
  prRef: string,
  cwd: string,
  retryCount: number,
  lang: Lang
): {
  merged: true;
  attempts: number;
  alreadyMerged: boolean;
  baseRefName?: string;
} {
  const tryReadPrMergeState = (): PrMergeStateMeta | null => {
    const viewed = runProcess(
      'gh',
      ['pr', 'view', prRef, '--json', 'state,mergedAt,baseRefName'],
      cwd
    );
    if (viewed.code !== 0) return null;
    const text = viewed.stdout.trim();
    if (!text) return null;
    try {
      return JSON.parse(text) as PrMergeStateMeta;
    } catch {
      return null;
    }
  };

  const isMergedState = (meta: PrMergeStateMeta | null): boolean => {
    if (!meta) return false;
    if (meta.state?.toUpperCase() === 'MERGED') return true;
    return !!meta.mergedAt;
  };

  const attempts = Number.isFinite(retryCount) ? Math.max(1, retryCount) : 3;
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const merged = runProcess(
      'gh',
      ['pr', 'merge', prRef, '--squash', '--delete-branch'],
      cwd
    );
    if (merged.code === 0) {
      const meta = tryReadPrMergeState();
      return {
        merged: true,
        attempts: attempt,
        alreadyMerged: false,
        baseRefName: meta?.baseRefName,
      };
    }

    lastError = (merged.stderr || merged.stdout || '').trim();
    const mergeState = tryReadPrMergeState();
    if (isMergedState(mergeState)) {
      return {
        merged: true,
        attempts: attempt,
        alreadyMerged: true,
        baseRefName: mergeState?.baseRefName,
      };
    }
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

export function toRetryCount(raw: string | undefined, lang: Lang): number {
  if (!raw) return 3;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createCliError('INVALID_ARGUMENT', tg(lang, 'retryInvalid'));
  }
  return parsed;
}

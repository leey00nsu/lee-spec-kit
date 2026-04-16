import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'node:path';
import { getConfig } from '../utils/config.js';
import { runGitCapture } from '../utils/git-run.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import {
  type ResolvedFeature,
  resolveFeatureSelection,
} from '../utils/feature-resolver.js';
import {
  resolveConfiguredStandaloneWorkspaceRoot,
  resolveGitTopLevelOrNull,
  resolveStandaloneProjectRoots,
} from '../utils/standalone-workspace.js';
import { getTemplatesDir } from '../utils/paths.js';
import { applyLocalWorkflowTemplateToContent } from '../utils/local-workflow-template.js';
import { applyReplacements } from '../utils/template.js';
import type { ProjectConfig } from '../config/types.js';

interface WorkflowAuditOptions {
  json?: boolean;
}

interface ChangedPathRecord {
  repoRoot: string;
  absolutePath: string;
  relativeToRepo: string;
  relativeToDocs: string | null;
}

interface CodeRootResolution {
  codeRoots: string[];
  errorReasonCode?:
    | 'STANDALONE_WORKSPACE_ROOT_REQUIRED'
    | 'STANDALONE_PROJECT_ROOT_UNRESOLVED';
}

interface WorkflowAuditPayload {
  status: 'ok' | 'needs_sync' | 'skipped' | 'error';
  reasonCode:
    | 'WORKFLOW_IN_SYNC'
    | 'CODE_WITHOUT_DOCS_SYNC'
    | 'ACTIVE_FEATURE_SCOPE_UNCLEAR'
    | 'STANDALONE_WORKSPACE_ROOT_REQUIRED'
    | 'STANDALONE_PROJECT_ROOT_UNRESOLVED'
    | 'NO_GIT_REPOSITORY'
    | 'CONFIG_NOT_FOUND'
    | 'UNEXPECTED_ERROR';
  docsDir: string | null;
  activeFeatureRef: string | null;
  changedCodePaths: string[];
  changedFeatureDocPaths: string[];
  latestCodeChangeAt: string | null;
  latestFeatureDocSyncAt: string | null;
}

const FEATURE_DOC_FILE_PATTERN =
  /^features\/(?:[^/]+\/)?F\d{3,}[^/]*\/(spec|plan|tasks|decisions|issue|pr)\.md$/i;
const CODE_FILE_PATTERN =
  /(^|\/)(Dockerfile|Makefile)$|\.(c|cc|cjs|cpp|cs|css|cts|go|h|hpp|html|java|js|json|jsx|kt|mjs|mts|php|py|rb|rs|scss|sh|sql|swift|ts|tsx|vue|yaml|yml|zsh)$/i;
const WORKFLOW_SYNC_MARKER_PATTERN =
  /<!--\s*lee-spec-kit:workflow-sync\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[^ ]+?)\s*-->/gi;

export function workflowAuditCommand(program: Command): void {
  program
    .command('workflow-audit')
    .description('Validate whether code changes have been synchronized back into feature docs')
    .option('--json', 'Output JSON for hooks and agents')
    .action(async (options: WorkflowAuditOptions) => {
      try {
        const payload = await collectWorkflowAudit(process.cwd());
        if (options.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        console.log(`${payload.status}: ${payload.reasonCode}`);
      } catch (error) {
        const cliError = toCliError(error);
        const payload: WorkflowAuditPayload = {
          status: 'error',
          reasonCode: 'UNEXPECTED_ERROR',
          docsDir: null,
          activeFeatureRef: null,
          changedCodePaths: [],
          changedFeatureDocPaths: [],
          latestCodeChangeAt: null,
          latestFeatureDocSyncAt: null,
        };
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                ...payload,
                error: cliError.message,
              },
              null,
              2
            )
          );
          return;
        }
        process.stderr.write(`[${cliError.code}] ${cliError.message}\n`);
        process.exitCode = 1;
      }
    });
}

async function collectWorkflowAudit(cwd: string): Promise<WorkflowAuditPayload> {
  const config = await getConfig(cwd);
  if (!config) {
    throw createCliError('CONFIG_NOT_FOUND', 'Config file not found. Run `init` first.');
  }

  const activeFeature = await resolveActiveFeature(cwd);
  const activeFeatureRef = activeFeature?.folderName ?? null;
  const codeRootResolution = resolveCodeRepoRoots(cwd, config, activeFeature);
  const codeRoots = codeRootResolution.codeRoots;

  if (codeRootResolution.errorReasonCode) {
    return {
      status: 'error',
      reasonCode: codeRootResolution.errorReasonCode,
      docsDir: config.docsDir,
      activeFeatureRef,
      changedCodePaths: [],
      changedFeatureDocPaths: [],
      latestCodeChangeAt: null,
      latestFeatureDocSyncAt: null,
    };
  }

  if (codeRoots.length === 0) {
    return {
      status: 'skipped',
      reasonCode: 'NO_GIT_REPOSITORY',
      docsDir: config.docsDir,
      activeFeatureRef,
      changedCodePaths: [],
      changedFeatureDocPaths: [],
      latestCodeChangeAt: null,
      latestFeatureDocSyncAt: null,
    };
  }

  const changedCodePaths = collectChangedRecords(codeRoots, config.docsDir).filter(
    isCodeChange
  );
  const outOfScopeStandaloneCodePaths = collectOutOfScopeStandaloneCodeChanges(
    config,
    activeFeature,
    codeRoots
  );
  const combinedChangedCodePaths = [
    ...changedCodePaths,
    ...outOfScopeStandaloneCodePaths,
  ];
  const docsRepoRoot = resolveDocsRepoRoot(config.docsDir);
  const changedFeatureDocPaths = docsRepoRoot
    ? collectChangedRecords([docsRepoRoot], config.docsDir).filter(isFeatureDocChange)
    : [];
  const meaningfulChangedFeatureDocPaths = await filterMeaningfulFeatureDocRecords(
    config,
    activeFeature,
    changedFeatureDocPaths
  );
  const scopedFeatureDocPaths = activeFeatureRef
    ? meaningfulChangedFeatureDocPaths.filter(
        (record) => featureRefFromDocPath(record.relativeToDocs) === activeFeatureRef
      )
    : [];
  const allMeaningfulFeatureDocPaths = meaningfulChangedFeatureDocPaths;

  const latestCodeChangeAt = await getLatestMtimeIso(combinedChangedCodePaths);
  const latestFeatureDocSyncAt = await getLatestWorkflowSyncMarkerAt(activeFeature);

  if (combinedChangedCodePaths.length === 0) {
    return {
      status: 'ok',
      reasonCode: 'WORKFLOW_IN_SYNC',
      docsDir: config.docsDir,
      activeFeatureRef,
      changedCodePaths: [],
      changedFeatureDocPaths: allMeaningfulFeatureDocPaths.map((item) => item.relativeToRepo),
      latestCodeChangeAt: null,
      latestFeatureDocSyncAt,
    };
  }

  if (!activeFeatureRef) {
    return {
      status: 'needs_sync',
      reasonCode: 'ACTIVE_FEATURE_SCOPE_UNCLEAR',
      docsDir: config.docsDir,
      activeFeatureRef: null,
      changedCodePaths: combinedChangedCodePaths.map((item) => item.relativeToRepo),
      changedFeatureDocPaths: allMeaningfulFeatureDocPaths.map((item) => item.relativeToRepo),
      latestCodeChangeAt,
      latestFeatureDocSyncAt,
    };
  }

  if (outOfScopeStandaloneCodePaths.length > 0) {
    return {
      status: 'needs_sync',
      reasonCode: 'ACTIVE_FEATURE_SCOPE_UNCLEAR',
      docsDir: config.docsDir,
      activeFeatureRef,
      changedCodePaths: combinedChangedCodePaths.map((item) => item.relativeToRepo),
      changedFeatureDocPaths: allMeaningfulFeatureDocPaths.map((item) => item.relativeToRepo),
      latestCodeChangeAt,
      latestFeatureDocSyncAt,
    };
  }

  const needsSync =
    scopedFeatureDocPaths.length === 0 ||
    !latestFeatureDocSyncAt ||
    !latestCodeChangeAt ||
    latestCodeChangeAt > latestFeatureDocSyncAt;

  return {
    status: needsSync ? 'needs_sync' : 'ok',
    reasonCode: needsSync ? 'CODE_WITHOUT_DOCS_SYNC' : 'WORKFLOW_IN_SYNC',
    docsDir: config.docsDir,
    activeFeatureRef,
    changedCodePaths: combinedChangedCodePaths.map((item) => item.relativeToRepo),
    changedFeatureDocPaths: scopedFeatureDocPaths.map((item) => item.relativeToRepo),
    latestCodeChangeAt,
    latestFeatureDocSyncAt,
  };
}

function parsePorcelainPaths(porcelain: string): string[] {
  if (!porcelain.trim()) return [];
  const deduped = new Set<string>();

  for (const rawLine of porcelain.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const payload = line.length > 3 ? line.slice(3) : '';
    if (!payload) continue;

    if (payload.includes(' -> ')) {
      const [fromPath, toPath] = payload.split(' -> ');
      if (fromPath) deduped.add(fromPath.trim());
      if (toPath) deduped.add(toPath.trim());
      continue;
    }

    deduped.add(payload.trim());
  }

  return [...deduped];
}

function toChangedPathRecord(
  repoRoot: string,
  docsDir: string,
  relativeToRepo: string
): ChangedPathRecord {
  const absolutePath = path.resolve(repoRoot, relativeToRepo);
  const relativeToDocsCandidate = normalizeSlashes(
    path.relative(docsDir, absolutePath)
  );
  const relativeToDocs =
    relativeToDocsCandidate === '' ||
    relativeToDocsCandidate.startsWith('..')
      ? null
      : relativeToDocsCandidate;

  return {
    repoRoot,
    absolutePath,
    relativeToRepo: normalizeSlashes(relativeToRepo),
    relativeToDocs,
  };
}

function collectChangedRecords(
  repoRoots: string[],
  docsDir: string
): ChangedPathRecord[] {
  const records: ChangedPathRecord[] = [];
  for (const repoRoot of repoRoots) {
    const porcelain =
      runGitCapture(['status', '--porcelain=v1', '--untracked-files=all'], repoRoot) || '';
    const changedRelativePaths = parsePorcelainPaths(porcelain);
    for (const relativeToRepo of changedRelativePaths) {
      records.push(toChangedPathRecord(repoRoot, docsDir, relativeToRepo));
    }
  }
  return records;
}

function isFeatureDocChange(record: ChangedPathRecord): boolean {
  return !!record.relativeToDocs && FEATURE_DOC_FILE_PATTERN.test(record.relativeToDocs);
}

function featureRefFromDocPath(relativeToDocs: string | null): string | null {
  if (!relativeToDocs) return null;
  const match = relativeToDocs.match(/^features\/(?:[^/]+\/)?(F\d{3,}[^/]+)\//i);
  return match?.[1] ?? null;
}

function isCodeChange(record: ChangedPathRecord): boolean {
  if (record.relativeToDocs) return false;
  const normalized = record.relativeToRepo;
  if (
    normalized.startsWith('.git/') ||
    normalized.startsWith('.codex/') ||
    normalized === 'AGENTS.md'
  ) {
    return false;
  }
  return CODE_FILE_PATTERN.test(path.basename(normalized)) || CODE_FILE_PATTERN.test(normalized);
}

async function getLatestMtimeIso(
  records: ChangedPathRecord[]
): Promise<string | null> {
  let latest = 0;

  for (const record of records) {
    if (!(await fs.pathExists(record.absolutePath))) continue;
    const stat = await fs.stat(record.absolutePath);
    const value = stat.mtimeMs;
    if (value > latest) latest = value;
  }

  return latest > 0 ? new Date(latest).toISOString() : null;
}

async function getLatestWorkflowSyncMarkerAt(
  activeFeature: ResolvedFeature | null
): Promise<string | null> {
  if (!activeFeature) return null;
  const canonicalFiles = ['spec.md', 'plan.md', 'tasks.md', 'decisions.md', 'issue.md', 'pr.md'];
  let latest = 0;
  const nowMs = Date.now();

  for (const fileName of canonicalFiles) {
    const absolutePath = path.join(activeFeature.path, fileName);
    if (!(await fs.pathExists(absolutePath))) continue;
    const stat = await fs.stat(absolutePath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    const matchedTimes = extractWorkflowSyncMarkerTimes(
      content,
      nowMs,
      stat.mtimeMs
    );
    for (const value of matchedTimes) {
      if (value > latest) latest = value;
    }
  }

  return latest > 0 ? new Date(latest).toISOString() : null;
}

function extractWorkflowSyncMarkerTimes(
  content: string,
  nowMs: number,
  fileMtimeMs: number
): number[] {
  const values: number[] = [];
  for (const match of content.matchAll(WORKFLOW_SYNC_MARKER_PATTERN)) {
    const rawTimestamp = String(match[1] || '').trim();
    if (!rawTimestamp) continue;
    const parsed = Date.parse(rawTimestamp);
    if (
      Number.isFinite(parsed) &&
      parsed <= nowMs &&
      parsed <= fileMtimeMs
    ) {
      values.push(parsed);
    }
  }
  return values;
}

async function filterMeaningfulFeatureDocRecords(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  activeFeature: ResolvedFeature | null,
  records: ChangedPathRecord[]
): Promise<ChangedPathRecord[]> {
  const filtered: ChangedPathRecord[] = [];
  for (const record of records) {
    if (await isMeaningfulFeatureDocRecord(config, activeFeature, record)) {
      filtered.push(record);
    }
  }
  return filtered;
}

async function isMeaningfulFeatureDocRecord(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  activeFeature: ResolvedFeature | null,
  record: ChangedPathRecord
): Promise<boolean> {
  if (!activeFeature) return true;
  if (isTrackedGitPath(record)) return true;

  const fileName = path.basename(record.absolutePath);
  const expectedContent = await renderExpectedInitialFeatureDocContent(
    config,
    activeFeature,
    fileName
  );
  if (expectedContent === null) {
    return true;
  }

  if (!(await fs.pathExists(record.absolutePath))) {
    return true;
  }
  const actualContent = await fs.readFile(record.absolutePath, 'utf-8');
  return normalizeFeatureDocContent(actualContent) !== normalizeFeatureDocContent(expectedContent);
}

function isTrackedGitPath(record: ChangedPathRecord): boolean {
  return !!runGitCapture(
    ['ls-files', '--error-unmatch', '--', record.relativeToRepo],
    record.repoRoot
  );
}

async function renderExpectedInitialFeatureDocContent(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  activeFeature: ResolvedFeature,
  fileName: string
): Promise<string | null> {
  const templatePath = path.join(
    getTemplatesDir(),
    config.lang,
    'common',
    'features',
    'feature-base',
    fileName
  );
  if (!(await fs.pathExists(templatePath))) {
    return null;
  }

  const rawTemplate = await fs.readFile(templatePath, 'utf-8');
  const rendered = renderFeatureDocTemplate(config, activeFeature, rawTemplate);
  if (config.workflow?.mode === 'local') {
    return applyLocalWorkflowTemplateToContent(fileName, rendered, config.lang);
  }
  return rendered;
}

function renderFeatureDocTemplate(
  config: Pick<ProjectConfig, 'projectName' | 'projectType' | 'lang'>,
  activeFeature: ResolvedFeature,
  template: string
): string {
  const featureName = activeFeature.slug;
  const featureId = activeFeature.id || activeFeature.folderName.split('-')[0] || '';
  const idNumber = featureId.replace(/^F/i, '');
  const component = config.projectType === 'multi' ? activeFeature.type : '';
  const repoName =
    config.projectType === 'multi'
      ? `${config.projectName || '{{projectName}}'}-${component}`
      : (config.projectName || '{{projectName}}');

  const replacements: Record<string, string> = {
    '{{projectName}}': config.projectName || '{{projectName}}',
    '{기능명}': featureName,
    '{번호}': idNumber,
    '{결정 제목}': `${featureName} 결정`,
    '{YYYY-MM-DD}': '__DATE__',
    '{component}': component || '',
    '{{projectName}}-{component}': repoName,
    '{be|fe}': component || '',
    '{이슈번호}': '',
    '{{description}}': '',
    '{feature-name}': featureName,
    '{number}': idNumber,
    '{Decision Title}': `${featureName} design decision`,
    '{issue-number}': '',
    '{{projectName}}-{be|fe}': repoName,
  };

  let rendered = applyReplacements(template, replacements);

  if (config.lang === 'en') {
    rendered = applyReplacements(rendered, {
      '기능 ID': 'Feature ID',
      '기능명': 'Feature Name',
      '대상 레포': 'Target Repo',
      '이슈 번호': 'Issue Number',
      '작성일': 'Created',
      '상태': 'Status',
    });
  }

  return rendered;
}

function normalizeFeatureDocContent(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\b\d{4}-\d{2}-\d{2}\b/g, '__DATE__');
}

function resolveDocsRepoRoot(docsDir: string): string | null {
  return runGitCapture(['rev-parse', '--show-toplevel'], docsDir) || null;
}

function resolveCodeRepoRoots(
  cwd: string,
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  activeFeature: ResolvedFeature | null
): CodeRootResolution {
  if (config.docsRepo !== 'standalone') {
    const repoRoot = runGitCapture(['rev-parse', '--show-toplevel'], cwd) || null;
    return { codeRoots: repoRoot ? [repoRoot] : [] };
  }

  if (!resolveConfiguredStandaloneWorkspaceRoot(config)) {
    return {
      codeRoots: [],
      errorReasonCode: 'STANDALONE_WORKSPACE_ROOT_REQUIRED',
    };
  }

  const featureGitCwd = activeFeature?.git.projectGitCwd;
  if (featureGitCwd) {
    const repoRoot = resolveGitTopLevelOrNull(featureGitCwd);
    return repoRoot
      ? { codeRoots: [repoRoot] }
      : {
          codeRoots: [],
          errorReasonCode: 'STANDALONE_PROJECT_ROOT_UNRESOLVED',
        };
  }

  const component =
    activeFeature?.type && activeFeature.type !== 'single'
      ? activeFeature.type
      : undefined;
  const resolvedRoots = resolveStandaloneProjectRoots(config, component);
  if (resolvedRoots.length === 0) {
    return {
      codeRoots: [],
      errorReasonCode: 'STANDALONE_PROJECT_ROOT_UNRESOLVED',
    };
  }

  const gitRoots = resolvedRoots
    .map((root) => resolveGitTopLevelOrNull(root))
  if (gitRoots.some((root) => !root)) {
    return {
      codeRoots: [],
      errorReasonCode: 'STANDALONE_PROJECT_ROOT_UNRESOLVED',
    };
  }

  return { codeRoots: [...new Set(gitRoots)] as string[] };
}

function collectOutOfScopeStandaloneCodeChanges(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  activeFeature: ResolvedFeature | null,
  scopedCodeRoots: string[]
): ChangedPathRecord[] {
  if (config.docsRepo !== 'standalone' || !activeFeature) {
    return [];
  }

  const normalizedScopedRoots = new Set(scopedCodeRoots.map((root) => path.resolve(root)));
  const extraRoots = resolveStandaloneProjectRoots(config)
    .map((root) => resolveGitTopLevelOrNull(root))
    .filter((root): root is string => !!root)
    .map((root) => path.resolve(root))
    .filter((root) => !normalizedScopedRoots.has(root));

  if (extraRoots.length === 0) {
    return [];
  }

  return collectChangedRecords([...new Set(extraRoots)], config.docsDir).filter(
    isCodeChange
  );
}

async function resolveActiveFeature(cwd: string): Promise<ResolvedFeature | null> {
  const selection = await resolveFeatureSelection(cwd);
  return selection.matchedFeature;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

import path from 'path';
import { CliContext } from '../cli-context.js';
import { resolveProjectComponents } from '../components.js';
import { listSubdirectories } from '../fs-walk.js';
import {
  getCurrentBranch,
  getGitStatusPorcelain,
  getIgnoredGitPaths,
  getTrackedGitPaths,
  resetContextGitCaches,
  resolveProjectGitCwd,
} from './git.js';
import { parseFeature, resetContextParseCaches } from './parse.js';
import { getStepDefinitions } from './steps.js';
import { FeatureContext } from './types.js';

interface DocsFeatureGitMeta {
  docsPathIgnored?: boolean;
  docsHasUncommittedChanges: boolean;
  docsEverCommitted: boolean;
  docsGitUnavailable: boolean;
}

async function listFeatureDirs(
  ctx: CliContext,
  rootDir: string
): Promise<string[]> {
  const dirs = await listSubdirectories(ctx.fs, rootDir);
  return dirs.filter(
    (value) => path.basename(value).trim().toLowerCase() !== 'feature-base'
  );
}

function normalizeRelPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

function parsePorcelainChangedPaths(porcelain: string): string[] {
  const changed: string[] = [];
  for (const rawLine of porcelain.split('\n')) {
    if (!rawLine.trim()) continue;
    const payload = rawLine.slice(3).trim();
    if (!payload) continue;
    const pathCandidate = payload.includes(' -> ')
      ? payload.split(' -> ').at(-1) || ''
      : payload;
    const normalized = normalizeRelPath(pathCandidate.replace(/^"+|"+$/g, ''));
    if (!normalized) continue;
    changed.push(normalized);
  }
  return changed;
}

function findFeaturePathPrefix(
  normalizedPath: string,
  relativeFeaturePaths: string[]
): string | undefined {
  for (const featurePath of relativeFeaturePaths) {
    if (normalizedPath === featurePath) return featurePath;
    if (normalizedPath.startsWith(`${featurePath}/`)) return featurePath;
    const nestedPrefix = `/${featurePath}`;
    if (normalizedPath.endsWith(nestedPrefix)) return featurePath;
    if (normalizedPath.includes(`${nestedPrefix}/`)) return featurePath;
  }
  return undefined;
}

function buildDefaultDocsFeatureGitMeta(
  relativeFeaturePaths: string[]
): Map<string, DocsFeatureGitMeta> {
  const map = new Map<string, DocsFeatureGitMeta>();
  for (const featurePath of relativeFeaturePaths) {
    map.set(featurePath, {
      docsPathIgnored: false,
      docsHasUncommittedChanges: false,
      docsEverCommitted: false,
      docsGitUnavailable: false,
    });
  }
  return map;
}

function buildDocsFeatureGitMeta(
  ctx: CliContext,
  docsGitCwd: string,
  relativeFeaturePaths: string[]
): Map<string, DocsFeatureGitMeta> {
  const normalizedFeaturePaths = relativeFeaturePaths.map((value) =>
    normalizeRelPath(value)
  );
  const map = buildDefaultDocsFeatureGitMeta(normalizedFeaturePaths);

  if (normalizedFeaturePaths.length === 0) return map;

  const docsStatus = getGitStatusPorcelain(
    ctx,
    docsGitCwd,
    normalizedFeaturePaths
  );
  if (docsStatus === undefined) {
    for (const featurePath of normalizedFeaturePaths) {
      const current = map.get(featurePath);
      if (!current) continue;
      current.docsGitUnavailable = true;
      current.docsHasUncommittedChanges = true;
    }
  } else {
    const changedPaths = parsePorcelainChangedPaths(docsStatus);
    for (const changedPath of changedPaths) {
      const featurePath = findFeaturePathPrefix(
        changedPath,
        normalizedFeaturePaths
      );
      if (!featurePath) continue;
      const current = map.get(featurePath);
      if (!current) continue;
      current.docsHasUncommittedChanges = true;
    }
  }

  const trackedPaths = getTrackedGitPaths(
    ctx,
    docsGitCwd,
    normalizedFeaturePaths
  );
  if (trackedPaths) {
    for (const trackedPath of trackedPaths) {
      const featurePath = findFeaturePathPrefix(
        normalizeRelPath(trackedPath),
        normalizedFeaturePaths
      );
      if (!featurePath) continue;
      const current = map.get(featurePath);
      if (!current) continue;
      current.docsEverCommitted = true;
    }
  }

  const ignoredPaths = getIgnoredGitPaths(
    ctx,
    docsGitCwd,
    normalizedFeaturePaths
  );
  if (ignoredPaths) {
    for (const ignoredPath of ignoredPaths) {
      const featurePath = findFeaturePathPrefix(
        normalizeRelPath(ignoredPath),
        normalizedFeaturePaths
      );
      if (!featurePath) continue;
      const current = map.get(featurePath);
      if (!current) continue;
      current.docsPathIgnored = true;
    }
  }

  return map;
}

export async function scanFeatures(ctx: CliContext): Promise<{
  features: FeatureContext[];
  branches: {
    docs: string;
    project: Record<string, string>;
  };
  warnings: string[];
}> {
  const config = ctx.config;

  // Keep cache lifetime within one scan pass so flow before/after re-evaluation
  // always reflects freshly created branches/worktrees.
  resetContextGitCaches();
  resetContextParseCaches();

  const features: FeatureContext[] = [];
  const warnings: string[] = [];
  const stepDefinitions = getStepDefinitions(ctx);

  const docsBranch = getCurrentBranch(ctx, config.docsDir);

  const projectBranches: Record<string, string> = {};
  const projectGitCwds: Record<string, string | undefined> = {};
  let singleProject: { cwd: string | null; warning?: string } | undefined;

  if (config.projectType === 'single') {
    singleProject = resolveProjectGitCwd(ctx, 'single', config.lang);
    if (singleProject.warning) warnings.push(singleProject.warning);
    projectBranches.single = singleProject.cwd
      ? getCurrentBranch(ctx, singleProject.cwd)
      : '';
    projectGitCwds.single = singleProject.cwd ?? undefined;
  } else {
    const components = resolveProjectComponents(
      config.projectType,
      config.components
    );
    for (const component of components) {
      const project = resolveProjectGitCwd(ctx, component, config.lang);
      if (project.warning) warnings.push(project.warning);
      projectBranches[component] = project.cwd
        ? getCurrentBranch(ctx, project.cwd)
        : '';
      projectGitCwds[component] = project.cwd ?? undefined;
    }
  }

  const allFeatureDirs: string[] = [];
  const componentFeatureDirs = new Map<string, string[]>();

  if (config.projectType === 'single') {
    const featureDirs = await listFeatureDirs(
      ctx,
      path.join(config.docsDir, 'features')
    );
    componentFeatureDirs.set('single', featureDirs);
    allFeatureDirs.push(...featureDirs);
  } else {
    const components = resolveProjectComponents(
      config.projectType,
      config.components
    );
    for (const component of components) {
      const componentDirs = await listFeatureDirs(
        ctx,
        path.join(config.docsDir, 'features', component)
      );
      componentFeatureDirs.set(component, componentDirs);
      allFeatureDirs.push(...componentDirs);
    }
  }

  const relativeFeaturePaths = allFeatureDirs.map((dir) =>
    normalizeRelPath(path.relative(config.docsDir, dir))
  );
  const docsGitMeta = buildDocsFeatureGitMeta(
    ctx,
    config.docsDir,
    relativeFeaturePaths
  );

  const parseTargets =
    config.projectType === 'single'
      ? [{ type: 'single', dirs: componentFeatureDirs.get('single') || [] }]
      : resolveProjectComponents(config.projectType, config.components).map(
          (component) => ({
            type: component,
            dirs: componentFeatureDirs.get(component) || [],
          })
        );

  for (const target of parseTargets) {
    const parsed = await Promise.all(
      target.dirs.map(async (dir) => {
        const relativeFeaturePathFromDocs = normalizeRelPath(
          path.relative(config.docsDir, dir)
        );
        const docsMeta = docsGitMeta.get(relativeFeaturePathFromDocs);
        return parseFeature(
          ctx,
          dir,
          target.type,
          {
            projectBranch: projectBranches[target.type] || '',
            docsBranch,
            docsGitCwd: config.docsDir,
            projectGitCwd: projectGitCwds[target.type],
            docsDir: config.docsDir,
            projectBranchAvailable: Boolean(projectGitCwds[target.type]),
            docsPathIgnored: docsMeta?.docsPathIgnored,
            docsHasUncommittedChanges: docsMeta?.docsHasUncommittedChanges,
            docsEverCommitted: docsMeta?.docsEverCommitted,
            docsGitUnavailable: docsMeta?.docsGitUnavailable,
          },
          {
            lang: config.lang,
            stepDefinitions,
            approval: config.approval,
            workflow: config.workflow,
            projectType: config.projectType,
          }
        );
      })
    );
    features.push(...parsed);
  }

  return {
    features,
    branches: {
      docs: docsBranch,
      project: projectBranches,
    },
    warnings,
  };
}

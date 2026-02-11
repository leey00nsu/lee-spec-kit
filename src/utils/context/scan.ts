import path from 'path';
import { glob } from 'glob';
import { ProjectConfig } from '../config.js';
import { resolveProjectComponents } from '../components.js';
import {
  getCurrentBranch,
  getGitStatusPorcelain,
  getIgnoredGitPaths,
  getTrackedGitPaths,
  resolveProjectGitCwd,
} from './git.js';
import { parseFeature } from './parse.js';
import { getStepDefinitions } from './steps.js';
import { FeatureContext } from './types.js';

interface DocsFeatureGitMeta {
  docsPathIgnored?: boolean;
  docsHasUncommittedChanges: boolean;
  docsEverCommitted: boolean;
  docsGitUnavailable: boolean;
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
  docsGitCwd: string,
  relativeFeaturePaths: string[]
): Map<string, DocsFeatureGitMeta> {
  const normalizedFeaturePaths = relativeFeaturePaths.map((value) =>
    normalizeRelPath(value)
  );
  const map = buildDefaultDocsFeatureGitMeta(normalizedFeaturePaths);

  if (normalizedFeaturePaths.length === 0) return map;

  const docsStatus = getGitStatusPorcelain(docsGitCwd, normalizedFeaturePaths);
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
      const featurePath = findFeaturePathPrefix(changedPath, normalizedFeaturePaths);
      if (!featurePath) continue;
      const current = map.get(featurePath);
      if (!current) continue;
      current.docsHasUncommittedChanges = true;
    }
  }

  const trackedPaths = getTrackedGitPaths(docsGitCwd, normalizedFeaturePaths);
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

  const ignoredPaths = getIgnoredGitPaths(docsGitCwd, normalizedFeaturePaths);
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

export async function scanFeatures(config: ProjectConfig): Promise<{
  features: FeatureContext[];
  branches: {
    docs: string;
    project: Record<string, string>;
  };
  warnings: string[];
}> {
  const features: FeatureContext[] = [];
  const warnings: string[] = [];
  const stepDefinitions = getStepDefinitions(config.lang, config.workflow);

  const docsBranch = getCurrentBranch(config.docsDir);

  const projectBranches: Record<string, string> = {};
  const projectGitCwds: Record<string, string | undefined> = {};
  let singleProject: { cwd: string | null; warning?: string } | undefined;

  if (config.projectType === 'single') {
    singleProject = resolveProjectGitCwd(config, 'single', config.lang);
    if (singleProject.warning) warnings.push(singleProject.warning);
    projectBranches.single = singleProject.cwd ? getCurrentBranch(singleProject.cwd) : '';
    projectGitCwds.single = singleProject.cwd ?? undefined;
  } else {
    const components = resolveProjectComponents(config.projectType, config.components);
    for (const component of components) {
      const project = resolveProjectGitCwd(config, component, config.lang);
      if (project.warning) warnings.push(project.warning);
      projectBranches[component] = project.cwd ? getCurrentBranch(project.cwd) : '';
      projectGitCwds[component] = project.cwd ?? undefined;
    }
  }

  const allFeatureDirs: string[] = [];
  const componentFeatureDirs = new Map<string, string[]>();

  if (config.projectType === 'single') {
    const featureDirs = await glob('features/*/', {
      cwd: config.docsDir,
      absolute: true,
      ignore: ['**/feature-base/**'],
    });
    componentFeatureDirs.set('single', featureDirs);
    allFeatureDirs.push(...featureDirs);
  } else {
    const components = resolveProjectComponents(config.projectType, config.components);
    for (const component of components) {
      const componentDirs = await glob(`features/${component}/*/`, {
        cwd: config.docsDir,
        absolute: true,
      });
      componentFeatureDirs.set(component, componentDirs);
      allFeatureDirs.push(...componentDirs);
    }
  }

  const relativeFeaturePaths = allFeatureDirs.map((dir) =>
    normalizeRelPath(path.relative(config.docsDir, dir))
  );
  const docsGitMeta = buildDocsFeatureGitMeta(config.docsDir, relativeFeaturePaths);

  const parseTargets =
    config.projectType === 'single'
      ? [{ type: 'single', dirs: componentFeatureDirs.get('single') || [] }]
      : resolveProjectComponents(config.projectType, config.components).map((component) => ({
          type: component,
          dirs: componentFeatureDirs.get(component) || [],
        }));

  for (const target of parseTargets) {
    const parsed = await Promise.all(
      target.dirs.map(async (dir) => {
        const relativeFeaturePathFromDocs = normalizeRelPath(
          path.relative(config.docsDir, dir)
        );
        const docsMeta = docsGitMeta.get(relativeFeaturePathFromDocs);
        return parseFeature(
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

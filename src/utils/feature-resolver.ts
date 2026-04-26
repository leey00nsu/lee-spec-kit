import path from 'node:path';
import fs from 'fs-extra';
import { listLeeSpecFeatures } from '../adapters/schema/lee-spec-kit/feature.js';
import type { ProjectConfig } from '../config/types.js';
import { getConfig } from './config.js';
import { createCliError } from './cli-error.js';
import { runGitCapture } from './git-run.js';
import {
  resolveManagedWorktreePath,
  resolveConfiguredStandaloneWorkspaceRoot,
  resolveGitTopLevelOrNull,
  resolveStandaloneProjectRoots,
} from './standalone-workspace.js';

export interface ResolvedFeature {
  id: string;
  slug: string;
  folderName: string;
  type: string;
  path: string;
  docs: {
    featurePathFromDocs: string;
  };
  git: {
    docsGitCwd: string;
    projectGitCwd: string;
  };
  issueNumber?: number;
}

export type FeatureSelectionStatus =
  | 'selected'
  | 'no_features'
  | 'no_match'
  | 'multiple_matches';

export interface FeatureSelectionState {
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>;
  features: ResolvedFeature[];
  matchedFeature: ResolvedFeature | null;
  status: FeatureSelectionStatus;
}

const BRANCH_LABELS = ['Branch', '브랜치'];

function normalizeComponent(value: string | undefined): string | undefined {
  const component = (value || '').trim().toLowerCase();
  return component || undefined;
}

function matchesFeatureSelector(
  feature: ResolvedFeature,
  selector: string
): boolean {
  const normalized = selector.trim().toLowerCase();
  if (!normalized) return false;
  return (
    feature.folderName.toLowerCase() === normalized ||
    feature.slug.toLowerCase() === normalized ||
    feature.id.toLowerCase() === normalized
  );
}

function parseFeatureBranchTarget(branchName: string): string | null {
  const trimmed = branchName.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^feat\/(?:\d+-)?(.+)$/i);
  return match?.[1]?.trim().toLowerCase() || null;
}

function resolveProjectGitCwd(
  cwd: string,
  config: Pick<ProjectConfig, 'docsRepo' | 'docsDir' | 'projectRoot' | 'workspaceRoot'>,
  component: string
): string {
  if (config.docsRepo === 'standalone') {
    const projectRoots = resolveStandaloneProjectRoots(
      config as ProjectConfig,
      component === 'single' ? undefined : component
    );
    const projectRoot = projectRoots[0];
    if (!projectRoot) {
      throw createCliError(
        'PRECONDITION_FAILED',
        'Standalone project root could not be resolved for the selected feature.'
      );
    }
    return projectRoot;
  }

  return resolveGitTopLevelOrNull(cwd) || resolveGitTopLevelOrNull(config.docsDir) || cwd;
}

function resolveProjectRootFromGitCwd(projectGitCwd: string): string {
  return resolveGitTopLevelOrNull(projectGitCwd) || path.resolve(projectGitCwd);
}

async function resolveExistingManagedWorktreePath(
  config: ProjectConfig,
  projectGitCwd: string,
  slug: string,
  folderName: string,
  issueNumber?: number,
  branchName?: string | null
): Promise<string | null> {
  const projectRoot = resolveProjectRootFromGitCwd(projectGitCwd);
  const branchCandidates = [
    branchName,
    issueNumber ? `feat/${issueNumber}-${slug}` : null,
    issueNumber ? `feat/${issueNumber}-${folderName}` : null,
  ].filter((candidate): candidate is string => !!candidate);
  const candidates = [...new Set(branchCandidates)].map((candidate) =>
    resolveManagedWorktreePath(config, projectRoot, candidate)
  );

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractFieldValue(content: string, labels: string | string[]): string | null {
  for (const label of Array.isArray(labels) ? labels : [labels]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(
      new RegExp(`^\\s*-\\s*\\*\\*${escaped}\\*\\*:\\s*(.*?)\\s*$`, 'mi')
    );
    if (!match) continue;
    const value = match[1].trim();
    if (value) return value;
  }
  return null;
}

function sanitizeMetadataValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^`(.+)`$/, '$1');
  if (!trimmed || trimmed === '-') return null;
  return trimmed;
}

function toFeaturePathFromDocs(
  projectType: 'single' | 'multi',
  component: string,
  folderName: string
): string {
  return projectType === 'multi' && component !== 'single'
    ? path.join('features', component, folderName)
    : path.join('features', folderName);
}

async function extractIssueNumber(featureDir: string): Promise<number | undefined> {
  const tasksPath = path.join(featureDir, 'tasks.md');
  if (!(await fs.pathExists(tasksPath))) return undefined;
  const content = await fs.readFile(tasksPath, 'utf-8');
  const match = content.match(/^\s*-\s+\*\*Issue\*\*:\s*#(\d+)\s*$/mi);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function extractBranchName(featureDir: string): Promise<string | null> {
  const tasksPath = path.join(featureDir, 'tasks.md');
  if (!(await fs.pathExists(tasksPath))) return null;
  const content = await fs.readFile(tasksPath, 'utf-8');
  return sanitizeMetadataValue(extractFieldValue(content, BRANCH_LABELS));
}

async function listResolvedFeatures(
  cwd: string,
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  component?: string
): Promise<ResolvedFeature[]> {
  const refs = await listLeeSpecFeatures(cwd);
  const normalizedComponent = normalizeComponent(component);
  const filteredRefs = normalizedComponent
    ? refs.filter((ref) => (ref.component || 'single') === normalizedComponent)
    : refs;

  const features = await Promise.all(
    filteredRefs.map(async (ref) => {
      const type = ref.component || 'single';
      const featurePathFromDocs = toFeaturePathFromDocs(
        config.projectType,
        type,
        ref.folderName
      );
      const featureDir = path.join(config.docsDir, featurePathFromDocs);
      const issueNumber = await extractIssueNumber(featureDir);
      const branchName = await extractBranchName(featureDir);
      const projectGitCwdBase = resolveProjectGitCwd(cwd, config, type);
      const worktreeProjectGitCwd =
        config.docsRepo === 'standalone' && (issueNumber || branchName)
          ? await resolveExistingManagedWorktreePath(
              config,
              projectGitCwdBase,
              ref.slug,
              ref.folderName,
              issueNumber,
              branchName
            )
          : null;
      return {
        id: ref.id || ref.folderName.split('-')[0] || '',
        slug: ref.slug,
        folderName: ref.folderName,
        type,
        path: featureDir,
        docs: {
          featurePathFromDocs: featurePathFromDocs.replace(/\\/g, '/'),
        },
        git: {
          docsGitCwd: config.docsDir,
          projectGitCwd: worktreeProjectGitCwd || projectGitCwdBase,
        },
        issueNumber,
      } satisfies ResolvedFeature;
    })
  );

  return features.sort((left, right) =>
    `${left.id}:${left.type}:${left.folderName}`.localeCompare(
      `${right.id}:${right.type}:${right.folderName}`
    )
  );
}

function getBranchMatchRoots(
  cwd: string,
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  component?: string
): string[] {
  if (config.docsRepo === 'standalone') {
    if (!resolveConfiguredStandaloneWorkspaceRoot(config)) return [];
    return resolveStandaloneProjectRoots(config, component);
  }

  return [
    resolveGitTopLevelOrNull(cwd),
    resolveGitTopLevelOrNull(config.docsDir),
  ].filter((value): value is string => !!value);
}

function matchFeaturesFromBranches(
  cwd: string,
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  features: ResolvedFeature[],
  component?: string
): ResolvedFeature[] {
  const matched = new Map<string, ResolvedFeature>();
  const roots = getBranchMatchRoots(cwd, config, component);

  for (const root of roots) {
    const branchName =
      runGitCapture(['branch', '--show-current'], root) ||
      runGitCapture(['rev-parse', '--abbrev-ref', 'HEAD'], root) ||
      '';
    const target = parseFeatureBranchTarget(branchName);
    if (!target) continue;

    for (const feature of features) {
      if (
        feature.slug.toLowerCase() === target ||
        feature.folderName.toLowerCase() === target
      ) {
        matched.set(feature.folderName, feature);
      }
    }
  }

  return [...matched.values()];
}

export async function resolveFeatureSelection(
  cwd: string,
  selector?: string,
  component?: string
): Promise<FeatureSelectionState> {
  const config = await getConfig(cwd);
  if (!config) {
    throw createCliError('CONFIG_NOT_FOUND', 'Config file not found. Run `init` first.');
  }

  const normalizedComponent = normalizeComponent(component);
  const features = await listResolvedFeatures(cwd, config, normalizedComponent);
  if (features.length === 0) {
    return {
      config,
      features,
      matchedFeature: null,
      status: 'no_features',
    };
  }

  let matches: ResolvedFeature[] = [];
  if ((selector || '').trim()) {
    matches = features.filter((feature) =>
      matchesFeatureSelector(feature, selector as string)
    );
  } else {
    matches = matchFeaturesFromBranches(cwd, config, features, normalizedComponent);
    if (matches.length === 0 && features.length === 1) {
      matches = features;
    }
  }

  if (matches.length === 1) {
    return {
      config,
      features,
      matchedFeature: matches[0],
      status: 'selected',
    };
  }

  return {
    config,
    features,
    matchedFeature: null,
    status: matches.length > 1 ? 'multiple_matches' : 'no_match',
  };
}

export function getFeatureDocPaths(feature: ResolvedFeature): {
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

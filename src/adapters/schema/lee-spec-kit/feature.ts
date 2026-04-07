import path from 'path';
import fs from 'fs-extra';
import type { ProjectType } from '../../../utils/project-type.js';
import type { SchemaFeatureRef } from '../contracts.js';
import { detectLeeSpecProject } from './project.js';

export interface ResolveLeeSpecFeaturePathsInput {
  docsDir: string;
  projectType: ProjectType;
  featureId: string;
  featureName: string;
  component?: string;
}

export interface LeeSpecFeaturePaths {
  featureFolderName: string;
  featuresDir: string;
  featureDir: string;
  featurePathFromDocs: string;
}

export function resolveLeeSpecFeaturePaths(
  input: ResolveLeeSpecFeaturePathsInput
): LeeSpecFeaturePaths {
  const featureFolderName = `${input.featureId}-${input.featureName}`;
  const featuresDir =
    input.projectType === 'multi'
      ? path.join(input.docsDir, 'features', input.component || '')
      : path.join(input.docsDir, 'features');
  const featureDir = path.join(featuresDir, featureFolderName);
  return {
    featureFolderName,
    featuresDir,
    featureDir,
    featurePathFromDocs: path.relative(input.docsDir, featureDir),
  };
}

export async function getNextLeeSpecFeatureId(
  docsDir: string,
  projectType: ProjectType,
  components: string[]
): Promise<string> {
  const featuresDir = path.join(docsDir, 'features');
  let max = 0;
  const scanDirs: string[] = [];

  if (projectType === 'multi') {
    scanDirs.push(
      ...components.map((component) => path.join(featuresDir, component))
    );
  } else {
    scanDirs.push(featuresDir);
  }

  for (const dir of scanDirs) {
    if (!(await fs.pathExists(dir))) continue;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^F(\d+)-/);
      if (!match) continue;
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }

  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `F${String(next).padStart(width, '0')}`;
}

function parseFeatureFolderName(
  folderName: string,
  component?: string
): SchemaFeatureRef | null {
  const match = folderName.match(/^(F\d+)-(.+)$/);
  if (!match) return null;
  const featureRef: SchemaFeatureRef = {
    id: match[1],
    slug: match[2],
    folderName,
  };
  if (component) {
    featureRef.component = component;
  }
  return featureRef;
}

export async function listLeeSpecFeatures(
  cwd: string
): Promise<SchemaFeatureRef[]> {
  const detected = await detectLeeSpecProject(cwd);
  const docsDir = detected.docsDir;
  if (!docsDir) return [];

  const featuresRoot = path.join(docsDir, 'features');
  if (!(await fs.pathExists(featuresRoot))) return [];

  const refs: SchemaFeatureRef[] = [];
  const topLevelEntries = await fs.readdir(featuresRoot, { withFileTypes: true });

  for (const entry of topLevelEntries) {
    if (!entry.isDirectory()) continue;

    const singleProjectFeature = parseFeatureFolderName(entry.name);
    if (singleProjectFeature) {
      refs.push(singleProjectFeature);
      continue;
    }

    const component = entry.name.trim().toLowerCase();
    if (!component) continue;
    const componentDir = path.join(featuresRoot, entry.name);
    const componentEntries = await fs.readdir(componentDir, { withFileTypes: true });
    for (const child of componentEntries) {
      if (!child.isDirectory()) continue;
      const featureRef = parseFeatureFolderName(child.name, component);
      if (featureRef) refs.push(featureRef);
    }
  }

  refs.sort((left, right) => {
    const leftKey = `${left.id || ''}:${left.component || ''}:${left.folderName}`;
    const rightKey = `${right.id || ''}:${right.component || ''}:${right.folderName}`;
    return leftKey.localeCompare(rightKey);
  });

  return refs;
}

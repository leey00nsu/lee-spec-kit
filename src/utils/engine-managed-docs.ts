import path from 'path';
import fs from 'fs-extra';

export const ENGINE_MANAGED_AGENT_FILES = [
  'agents.md',
  'git-workflow.md',
  'issue-template.md',
  'pr-template.md',
] as const;

export const ENGINE_MANAGED_AGENT_DIRS = ['skills'] as const;

export const ENGINE_MANAGED_FEATURE_PATH = path.join(
  'features',
  'feature-base'
);

export async function pruneEngineManagedDocs(
  docsDir: string
): Promise<string[]> {
  const removed: string[] = [];

  for (const file of ENGINE_MANAGED_AGENT_FILES) {
    const target = path.join(docsDir, 'agents', file);
    if (await fs.pathExists(target)) {
      await fs.remove(target);
      removed.push(path.relative(docsDir, target));
    }
  }

  for (const dir of ENGINE_MANAGED_AGENT_DIRS) {
    const target = path.join(docsDir, 'agents', dir);
    if (await fs.pathExists(target)) {
      await fs.remove(target);
      removed.push(path.relative(docsDir, target));
    }
  }

  const featureBasePath = path.join(docsDir, ENGINE_MANAGED_FEATURE_PATH);
  if (await fs.pathExists(featureBasePath)) {
    await fs.remove(featureBasePath);
    removed.push(path.relative(docsDir, featureBasePath));
  }

  return removed;
}

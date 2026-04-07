import type { ProjectConfig } from './types.js';
import { detectSchemaProject } from '../adapters/schema/index.js';

export async function getConfig(cwd: string): Promise<ProjectConfig | null> {
  const detected = await detectSchemaProject(cwd);
  return detected.config;
}

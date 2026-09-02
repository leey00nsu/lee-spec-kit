import type { ProjectConfig } from './types.js';
import { detectSchemaProject } from '../adapters/schema/index.js';
import { createCliError } from '../utils/cli-error.js';

export function assertValidExperimentalConfig(config: ProjectConfig): void {
  const experimental = config.experimental as unknown;
  if (
    experimental !== undefined &&
    (!experimental ||
      typeof experimental !== 'object' ||
      Array.isArray(experimental) ||
      ((experimental as { openwiki?: unknown }).openwiki !== undefined &&
        typeof (experimental as { openwiki?: unknown }).openwiki !== 'boolean'))
  ) {
    throw createCliError(
      'INVALID_CONFIG',
      '`experimental.openwiki` must be a boolean when `experimental` is present.'
    );
  }
}

export async function getConfig(cwd: string): Promise<ProjectConfig | null> {
  const detected = await detectSchemaProject(cwd);
  const config = detected.config;
  if (!config) return null;

  assertValidExperimentalConfig(config);

  return config;
}

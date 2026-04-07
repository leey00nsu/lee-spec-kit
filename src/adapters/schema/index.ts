import type { ProjectConfig } from '../../config/types.js';
import type { SchemaAdapter, SchemaProjectDetection } from './contracts.js';
import { leeSpecSchemaAdapter } from './lee-spec-kit/index.js';

const SCHEMA_ADAPTERS: SchemaAdapter[] = [leeSpecSchemaAdapter];

function createEmptyDetection(): SchemaProjectDetection & { adapter: SchemaAdapter | null } {
  return {
    detected: false,
    docsDir: null,
    schemaId: null,
    detectionSource: null,
    config: null,
    configPath: null,
    configFilePresent: false,
    adapter: null,
  };
}

export function listSchemaAdapters(): SchemaAdapter[] {
  return [...SCHEMA_ADAPTERS];
}

export function getSchemaAdapterById(schemaId: string | null | undefined): SchemaAdapter | null {
  if (!schemaId) return null;
  return SCHEMA_ADAPTERS.find((adapter) => adapter.schemaId === schemaId) ?? null;
}

export function getSchemaAdapterForConfig(
  config: Pick<ProjectConfig, 'schemaId'> | null | undefined
): SchemaAdapter | null {
  return getSchemaAdapterById(config?.schemaId ?? null);
}

export async function detectSchemaProject(
  cwd: string
): Promise<SchemaProjectDetection & { adapter: SchemaAdapter | null }> {
  for (const adapter of SCHEMA_ADAPTERS) {
    const detection = await adapter.detect(cwd);
    if (detection.detected) {
      return {
        ...detection,
        adapter,
      };
    }
  }

  return createEmptyDetection();
}

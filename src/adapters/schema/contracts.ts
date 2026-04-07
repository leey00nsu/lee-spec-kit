import type { ProjectConfig } from '../../config/types.js';
import type { ProjectType } from '../../utils/project-type.js';

export interface SchemaProjectDetection {
  detected: boolean;
  docsDir: string | null;
  schemaId: string | null;
  detectionSource: 'config' | 'heuristic' | 'adapter' | null;
  config: ProjectConfig | null;
  configPath?: string | null;
  configFilePresent?: boolean;
}

export interface SchemaFeatureRef {
  id?: string;
  slug: string;
  folderName: string;
  component?: string;
}

export interface SchemaFeaturePaths {
  featureFolderName: string;
  featuresDir: string;
  featureDir: string;
  featurePathFromDocs: string;
}

export interface ResolveSchemaFeaturePathsInput {
  docsDir: string;
  projectType: ProjectType;
  featureId: string;
  featureName: string;
  component?: string;
}

export interface SchemaAdapter {
  schemaId: string;
  detect(cwd: string): Promise<SchemaProjectDetection>;
  listFeatures(cwd: string): Promise<SchemaFeatureRef[]>;
  getNextFeatureId?(input: {
    docsDir: string;
    projectType: ProjectType;
    components: string[];
  }): Promise<string>;
  resolveFeaturePaths?(input: ResolveSchemaFeaturePathsInput): SchemaFeaturePaths;
  createFeature?(
    cwd: string,
    input: { name: string; component?: string; id?: string; idea?: string }
  ): Promise<SchemaFeatureRef>;
}

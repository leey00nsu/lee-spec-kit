import type { SchemaAdapter } from '../contracts.js';
export {
  detectLeeSpecProject,
  type LeeSpecDetectionSource,
  type LeeSpecProjectDetectionResult,
} from './project.js';
export {
  getNextLeeSpecFeatureId,
  listLeeSpecFeatures,
  resolveLeeSpecFeaturePaths,
} from './feature.js';
import { detectLeeSpecProject } from './project.js';
import {
  getNextLeeSpecFeatureId,
  listLeeSpecFeatures,
  resolveLeeSpecFeaturePaths,
} from './feature.js';

export const leeSpecSchemaAdapter: SchemaAdapter = {
  schemaId: 'lee-spec',
  async detect(cwd) {
    const detection = await detectLeeSpecProject(cwd);
    return {
      detected: detection.detected,
      docsDir: detection.docsDir,
      schemaId: detection.schemaId,
      detectionSource: detection.detectionSource,
      config: detection.config,
      configPath: detection.configPath,
      configFilePresent: detection.configFilePresent,
    };
  },
  async listFeatures(cwd) {
    return listLeeSpecFeatures(cwd);
  },
  async getNextFeatureId(input) {
    return getNextLeeSpecFeatureId(
      input.docsDir,
      input.projectType,
      input.components
    );
  },
  resolveFeaturePaths(input) {
    return resolveLeeSpecFeaturePaths(input);
  },
};

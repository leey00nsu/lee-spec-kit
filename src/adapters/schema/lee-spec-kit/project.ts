import fs from 'fs-extra';
import path from 'path';
import { resolveProjectComponents } from '../../../utils/components.js';
import {
  normalizeProjectType,
  type ProjectType,
  type RawProjectType,
} from '../../../utils/project-type.js';
import type { ProjectConfig } from '../../../config/types.js';

interface ConfigFile {
  projectName: string;
  projectType: RawProjectType;
  components?: string[];
  lang: 'ko' | 'en';
  createdAt: string;
  docsRepo?: 'embedded' | 'standalone';
  workspaceRoot?: string;
  pushDocs?: boolean;
  docsRemote?: string;
  projectRoot?: string | Record<string, string>;
  allowedDocsEntries?: ProjectConfig['allowedDocsEntries'];
  pr?: ProjectConfig['pr'];
  workflow?: ProjectConfig['workflow'];
  approval?: ProjectConfig['approval'];
}

export type LeeSpecDetectionSource = 'config' | 'heuristic';

export interface LeeSpecProjectDetectionResult {
  detected: boolean;
  schemaId: 'lee-spec';
  detectionSource: LeeSpecDetectionSource | null;
  docsDir: string | null;
  configPath: string | null;
  configFilePresent: boolean;
  config: ProjectConfig | null;
}

function getAncestorDirs(startDir: string): string[] {
  const dirs: string[] = [];
  let current = path.resolve(startDir);

  while (true) {
    dirs.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return dirs;
}

function hasWorkspaceBoundary(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'package.json')) ||
    fs.existsSync(path.join(dir, '.git'))
  );
}

function getSearchBaseDirs(cwd: string): string[] {
  const ancestors = getAncestorDirs(cwd);
  const boundaryIndex = ancestors.findIndex(hasWorkspaceBoundary);
  if (boundaryIndex === -1) return [ancestors[0]];
  return ancestors.slice(0, boundaryIndex + 1);
}

const FEATURE_FOLDER_PATTERN = /^F\d{3,}-/i;

function normalizeComponentKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value)
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean);
}

async function inferComponentsFromFeaturesDir(docsDir: string): Promise<string[]> {
  const featuresPath = path.join(docsDir, 'features');
  if (!(await fs.pathExists(featuresPath))) return [];

  const entries = await fs.readdir(featuresPath, { withFileTypes: true });
  const inferred = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name.trim().toLowerCase())
    .filter(
      (name) =>
        !!name &&
        name !== 'feature-base' &&
        !FEATURE_FOLDER_PATTERN.test(name)
    );

  return [...new Set(inferred)];
}

function toProjectConfig(
  docsDir: string,
  configFile: ConfigFile,
  projectType: ProjectType,
  components: string[]
): ProjectConfig {
  return {
    schemaId: 'lee-spec',
    docsDir,
    createdAt: configFile.createdAt,
    projectName: configFile.projectName,
    projectType,
    components: projectType === 'multi' ? components : undefined,
    lang: configFile.lang,
    docsRepo: configFile.docsRepo,
    workspaceRoot: configFile.workspaceRoot,
    pushDocs: configFile.pushDocs,
    docsRemote: configFile.docsRemote,
    projectRoot: configFile.projectRoot,
    allowedDocsEntries: configFile.allowedDocsEntries,
    pr: configFile.pr,
    workflow: configFile.workflow,
    approval: configFile.approval,
  };
}

export async function detectLeeSpecProject(
  cwd: string
): Promise<LeeSpecProjectDetectionResult> {
  const explicitDocsDir = (process.env.LEE_SPEC_KIT_DOCS_DIR || '').trim();
  const baseDirs = [
    ...(explicitDocsDir ? [path.resolve(explicitDocsDir)] : []),
    ...getSearchBaseDirs(cwd),
  ];
  const visitedBaseDirs = new Set<string>();
  const visitedDocsDirs = new Set<string>();

  for (const baseDir of baseDirs) {
    const resolvedBaseDir = path.resolve(baseDir);
    if (visitedBaseDirs.has(resolvedBaseDir)) continue;
    visitedBaseDirs.add(resolvedBaseDir);

    const possibleDocsDirs = [path.join(resolvedBaseDir, 'docs'), resolvedBaseDir];
    for (const docsDir of possibleDocsDirs) {
      const resolvedDocsDir = path.resolve(docsDir);
      if (visitedDocsDirs.has(resolvedDocsDir)) continue;
      visitedDocsDirs.add(resolvedDocsDir);

      const configPath = path.join(resolvedDocsDir, '.lee-spec-kit.json');
      if (await fs.pathExists(configPath)) {
        try {
          const configFile: ConfigFile = await fs.readJson(configPath);
          const projectType = normalizeProjectType(configFile.projectType);
          const inferredComponents = [
            ...normalizeComponentKeys(configFile.projectRoot),
            ...(await inferComponentsFromFeaturesDir(resolvedDocsDir)),
          ];
          const components = resolveProjectComponents(
            projectType,
            Array.isArray(configFile.components) && configFile.components.length > 0
              ? configFile.components
              : inferredComponents
          );
          return {
            detected: true,
            schemaId: 'lee-spec',
            detectionSource: 'config',
            docsDir: resolvedDocsDir,
            configPath,
            configFilePresent: true,
            config: toProjectConfig(
              resolvedDocsDir,
              configFile,
              projectType,
              components
            ),
          };
        } catch {
          // fall through to heuristic detection
        }
      }

      const agentsPath = path.join(resolvedDocsDir, 'agents');
      const featuresPath = path.join(resolvedDocsDir, 'features');

      if (
        (await fs.pathExists(agentsPath)) &&
        (await fs.pathExists(featuresPath))
      ) {
        const inferredComponents = await inferComponentsFromFeaturesDir(resolvedDocsDir);
        const projectType = inferredComponents.length > 0 ? 'multi' : 'single';
        const components =
          projectType === 'multi'
            ? resolveProjectComponents('multi', inferredComponents)
            : undefined;

        const langProbeCandidates = [
          path.join(agentsPath, 'custom.md'),
          path.join(agentsPath, 'constitution.md'),
          path.join(agentsPath, 'agents.md'),
        ];
        let lang: 'ko' | 'en' = 'en';
        for (const candidate of langProbeCandidates) {
          if (!(await fs.pathExists(candidate))) continue;
          const content = await fs.readFile(candidate, 'utf-8');
          if (/[가-힣]/.test(content)) {
            lang = 'ko';
            break;
          }
        }

        return {
          detected: true,
          schemaId: 'lee-spec',
          detectionSource: 'heuristic',
          docsDir: resolvedDocsDir,
          configPath: null,
          configFilePresent: false,
          config: {
            schemaId: 'lee-spec',
            docsDir: resolvedDocsDir,
            projectType,
            components,
            lang,
          },
        };
      }
    }
  }

  return {
    detected: false,
    schemaId: 'lee-spec',
    detectionSource: null,
    docsDir: null,
    configPath: null,
    configFilePresent: false,
    config: null,
  };
}

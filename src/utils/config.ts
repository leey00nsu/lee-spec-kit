import path from 'path';
import fs from 'fs-extra';
import { resolveProjectComponents } from './components.js';
import { normalizeProjectType, ProjectType, RawProjectType } from './project-type.js';

export interface ProjectConfig {
  docsDir: string;
  projectName?: string;
  projectType: ProjectType;
  components?: string[];
  lang: 'ko' | 'en';
  docsRepo?: 'embedded' | 'standalone';
  pushDocs?: boolean;
  docsRemote?: string;
  projectRoot?: string | Record<string, string>;
  pr?: {
    screenshots?: {
      /**
       * When true, agents may upload screenshots (e.g. to GitHub Release assets)
       * and include the URL in PR body.
       * When false (default), screenshot upload is disabled and the PR body should omit screenshot sections.
       */
      upload?: boolean;
    };
  };
  workflow?: {
    /**
     * github: issue/branch/pr/review workflow required (default)
     * local: local-only workflow (issue/branch/pr/review not required)
     */
    mode?: 'github' | 'local';
    /**
     * Optional per-requirement overrides.
     */
    requireIssue?: boolean;
    requireBranch?: boolean;
    requirePr?: boolean;
    requireReview?: boolean;
  };
  approval?: {
    /**
     * builtin: Use `requiresUserCheck` embedded in steps/actions (default).
     * steps: Determine check requirement only by step number list.
     * category: Determine check requirement by action category.
     */
    mode?: 'builtin' | 'steps' | 'category';
    /**
     * Only used when mode === "steps".
     * Steps that require explicit user check. (e.g. [3, 5, 12])
     */
    requireCheckSteps?: number[];
    /**
     * @deprecated Use requireCheckSteps instead.
     */
    requireOkSteps?: number[];
    /**
     * Only used when mode === "category".
     * - keep (default): keep action's builtin requiresUserCheck unless overridden
     * - require: require check unless overridden
     * - skip: skip check unless overridden
     */
    default?: 'keep' | 'require' | 'skip';
    /**
     * Only used when mode === "category".
     * Categories that always require check.
     */
    requireCheckCategories?: string[];
    /**
     * @deprecated Use requireCheckCategories instead.
     */
    requireOkCategories?: string[];
    /**
     * Only used when mode === "category".
     * Categories that never require check.
     */
    skipCheckCategories?: string[];
    /**
     * @deprecated Use skipCheckCategories instead.
     */
    skipOkCategories?: string[];
  };
}

interface ConfigFile {
  projectName: string;
  projectType: RawProjectType;
  components?: string[];
  lang: 'ko' | 'en';
  createdAt: string;
  docsRepo?: 'embedded' | 'standalone';
  pushDocs?: boolean;
  docsRemote?: string;
  projectRoot?: string | Record<string, string>;
  pr?: ProjectConfig['pr'];
  workflow?: ProjectConfig['workflow'];
  approval?: ProjectConfig['approval'];
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
  if (boundaryIndex === -1) {
    // Without a clear workspace boundary, keep lookup local to cwd to avoid
    // accidentally binding to unrelated ancestor docs directories.
    return [ancestors[0]];
  }
  return ancestors.slice(0, boundaryIndex + 1);
}

export async function getConfig(cwd: string): Promise<ProjectConfig | null> {
  const explicitDocsDir = (
    process.env.LEE_SPEC_KIT_DOCS_DIR ||
    ''
  ).trim();
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

      // 1. Config 파일 우선 확인
      const configPath = path.join(resolvedDocsDir, '.lee-spec-kit.json');
      if (await fs.pathExists(configPath)) {
        try {
          const configFile: ConfigFile = await fs.readJson(configPath);
          const projectType = normalizeProjectType(configFile.projectType);
          const components = resolveProjectComponents(
            projectType,
            configFile.components
          );
          return {
            docsDir: resolvedDocsDir,
            projectName: configFile.projectName,
            projectType,
            components:
              projectType === 'multi' ? components : undefined,
            lang: configFile.lang,
            docsRepo: configFile.docsRepo,
            pushDocs: configFile.pushDocs,
            docsRemote: configFile.docsRemote,
            projectRoot: configFile.projectRoot,
            pr: configFile.pr,
            workflow: configFile.workflow,
            approval: configFile.approval,
          };
        } catch {
          // JSON 파싱 실패 시 폴백
        }
      }

      // 2. 폴백: 기존 방식 (폴더 구조 기반 감지)
      const agentsPath = path.join(resolvedDocsDir, 'agents');
      const featuresPath = path.join(resolvedDocsDir, 'features');

      if (
        (await fs.pathExists(agentsPath)) &&
        (await fs.pathExists(featuresPath))
      ) {
        // 프로젝트 타입 감지
        const bePath = path.join(featuresPath, 'be');
        const fePath = path.join(featuresPath, 'fe');
        const projectType =
          (await fs.pathExists(bePath)) || (await fs.pathExists(fePath))
            ? 'multi'
            : 'single';
        const components =
          projectType === 'multi'
            ? resolveProjectComponents('multi', ['fe', 'be'])
            : undefined;

        // 언어 감지 (agents.md 내용 기반)
        const agentsMdPath = path.join(agentsPath, 'agents.md');
        let lang: 'ko' | 'en' = 'en';
        if (await fs.pathExists(agentsMdPath)) {
          const content = await fs.readFile(agentsMdPath, 'utf-8');
          // 한국어가 포함되어 있는지 확인 (기본값은 en)
          if (/[가-힣]/.test(content)) lang = 'ko';
        }

        return { docsDir: resolvedDocsDir, projectType, components, lang };
      }
    }
  }

  return null;
}

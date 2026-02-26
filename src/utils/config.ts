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
    /**
     * When true, execute implementation tasks only from managed
     * `.worktrees/*` directories.
     */
    requireWorktree?: boolean;
    requirePr?: boolean;
    requireReview?: boolean;
    /**
     * Whether PR merge is required before marking workflow done.
     * Defaults to true in github mode and false in local mode.
     */
    requireMerge?: boolean;
    /**
     * Scope for "project code dirty" detection used by context/status/workflow completion.
     * - repo: entire project repo worktree
     * - component: only paths mapped to the current feature component
     * - auto: single=>repo, multi=>component
     *
     * Backward compatibility: when omitted, runtime defaults to "repo".
     */
    codeDirtyScope?: 'repo' | 'component' | 'auto';
    /**
     * Optional component path mapping (relative to project git root) used when
     * codeDirtyScope resolves to "component".
     */
    componentPaths?: Record<string, string[]>;
    /**
     * Gate policy for moving from one task to the next.
     * - off: disable the gate
     * - warn: show warning but allow next task
     * - strict: block only when the latest tasks.md commit adds more than one DONE transition
     *
     * Backward compatibility: when omitted, runtime defaults to "warn".
     */
    taskCommitGate?: 'off' | 'warn' | 'strict';
    /**
     * Pre-PR self review stage configuration.
     * Enabled by default when PR is required.
     */
    prePrReview?: {
      /**
       * Whether to enforce a pre-PR review stage before PR creation.
       */
      enabled?: boolean;
      /**
       * Preferred skill names in priority order.
       * If omitted, the runtime default list is used.
       */
      skills?: string[];
      /**
       * Baseline checklist policy for pre-PR review.
       * - builtin-checklist: pre-PR baseline checklist in create-pr doc
       */
      fallback?: 'builtin-checklist';
      /**
       * Evidence validation policy.
       * - any: any non-placeholder value
       * - path_required: require a local file path that exists
       */
      evidenceMode?: 'any' | 'path_required';
      /**
       * Allowed decision outcomes recorded in `Pre-PR Decision`.
       */
      decisionEnum?: Array<'approve' | 'changes_requested' | 'blocked'>;
      /**
       * When true, enforce that review execution evidence exists and is
       * traceable via `commandsExecuted`.
       */
      enforceExecutionEvidence?: boolean;
      /**
       * Optional command prefixes. When configured, at least one
       * `commandsExecuted` entry must start with one of these prefixes.
       */
      executionCommandPrefixes?: string[];
    };
    /**
     * Auto-run policy used by `flow` helper shortcuts.
     */
    auto?: {
      /**
       * Default preset name used when `flow --request` is provided without
       * explicit auto category/preset flags.
       */
      defaultPreset?: string;
      /**
       * Optional explicit default categories used before `defaultPreset`.
       */
      defaultUntilCategories?: string[];
      /**
       * Optional custom preset map. Key is preset name, value is category list.
       */
      presets?: Record<string, string[]>;
    };
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
    /**
     * task_execute approval phase policy.
     * - both (default): require checks for both TODO->DOING and DOING->DONE phases.
     * - start_only: require checks only for TODO->DOING phase.
     */
    taskExecuteCheck?: 'both' | 'start_only';
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
        const inferredComponents = await inferComponentsFromFeaturesDir(resolvedDocsDir);
        const projectType = inferredComponents.length > 0 ? 'multi' : 'single';
        const components =
          projectType === 'multi'
            ? resolveProjectComponents('multi', inferredComponents)
            : undefined;

        // 언어 감지 (project-managed agents docs 기반)
        const langProbeCandidates = [
          path.join(agentsPath, 'custom.md'),
          path.join(agentsPath, 'constitution.md'),
          path.join(agentsPath, 'agents.md'),
        ];
        let lang: 'ko' | 'en' = 'en';
        for (const candidate of langProbeCandidates) {
          if (!(await fs.pathExists(candidate))) continue;
          const content = await fs.readFile(candidate, 'utf-8');
          // 한국어가 포함되어 있는지 확인 (기본값은 en)
          if (/[가-힣]/.test(content)) {
            lang = 'ko';
            break;
          }
        }

        return { docsDir: resolvedDocsDir, projectType, components, lang };
      }
    }
  }

  return null;
}

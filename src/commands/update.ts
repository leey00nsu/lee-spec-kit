import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { execFileSync } from 'child_process';
import {
  AGENT_REVIEW_REASONING_EFFORTS,
  createDefaultAgentExecutionTaskConfig,
  createDefaultAgentReviewerConfig,
  createDefaultApprovalConfig,
  getConfig,
} from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { getTemplatesDir } from '../utils/paths.js';
import { applyReplacements } from '../utils/template.js';
import { getDocsLockPath, withFileLock } from '../utils/lock.js';
import {
  ENGINE_MANAGED_AGENT_DIRS,
  ENGINE_MANAGED_AGENT_FILES,
  pruneEngineManagedDocs,
} from '../utils/engine-managed-docs.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { upsertLeeSpecKitAgentsMd } from '../utils/agents-md.js';
import {
  canBackfillStandaloneWorkspaceRoot,
  resolveConfiguredStandaloneWorkspaceRoot,
  resolveStandaloneWorkspaceRoot,
  serializeStandaloneWorkspaceRoot,
} from '../utils/standalone-workspace.js';
import {
  migrateLegacyApprovalSettings,
  migrateLegacyWorkflowSettings,
} from '../config/migrate.js';
import { resolveLegacyBackfilledAgentAutomation } from '../config/agent-automation.js';

interface UpdateOptions {
  agents?: boolean;
  agentsMd?: boolean;
  force?: boolean;
}

interface ConfigBackfillResult {
  changed: boolean;
  changedPaths: string[];
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isLegacyGeneratedApprovalConfig(
  approval: Record<string, unknown>
): boolean {
  const mode = typeof approval.mode === 'string' ? approval.mode : '';
  if (mode && mode !== 'category' && mode !== 'steps' && mode !== 'builtin') {
    return false;
  }

  const overrideKeys = [
    'default',
    'requireCheckSteps',
    'requireCheckCategories',
    'skipCheckCategories',
  ];
  return !overrideKeys.some((key) => hasOwnKey(approval, key));
}

function isPreviousDefaultApprovalConfig(
  approval: Record<string, unknown>
): boolean {
  const keys = Object.keys(approval).sort();
  const categories = Array.isArray(approval.requireCheckCategories)
    ? approval.requireCheckCategories
    : [];
  return (
    JSON.stringify(keys) ===
      JSON.stringify(['default', 'mode', 'requireCheckCategories']) &&
    approval.mode === 'category' &&
    approval.default === 'skip' &&
    categories.length === 2 &&
    categories[0] === 'spec_approve' &&
    categories[1] === 'implementation_approve'
  );
}

export function updateCommand(program: Command): void {
  program
    .command('update')
    .description('Update docs templates to the latest version')
    .option('--agents', 'Update agents/ folder only')
    .option('--agents-md', 'Sync project-scoped AGENTS.md entrypoint')
    .option(
      '-f, --force',
      'Force overwrite even if docs has uncommitted changes'
    )
    .action(async (options: UpdateOptions) => {
      try {
        await runUpdate(options);
      } catch (error) {
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
        if (error instanceof Error && error.message === 'canceled') {
          console.log(chalk.yellow(`\n${tr(lang, 'cli', 'common.canceled')}`));
          return;
        }
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        console.error(
          chalk.red(tr(lang, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        printCliErrorSuggestions(suggestions, lang);
        process.exitCode = 1;
        return;
      }
    });
}

async function runUpdate(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    throw createCliError(
      'DOCS_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.docsNotFound')
    );
  }

  let currentConfig: Awaited<ReturnType<typeof getConfig>> = config;
  const { docsDir } = currentConfig;
  await withFileLock(
    getDocsLockPath(docsDir),
    async () => {
      if (!currentConfig) {
        throw createCliError(
          'DOCS_NOT_FOUND',
          tr(DEFAULT_LANG, 'cli', 'common.docsNotFound')
        );
      }
      const { projectType, lang } = currentConfig;
      const templatesDir = getTemplatesDir();
      const docsLockPath = getDocsLockPath(docsDir);

      // Default behavior: only allow update when docs working tree is clean.
      // Then apply updates like --force. This keeps update predictable and simple.
      const forceOverwrite =
        !!options.force ||
        (await isDocsWorktreeCleanOrThrow(docsDir, lang, [docsLockPath]));

      // Backfill missing config defaults so older projects get current policy keys.
      const configBackfill = await backfillMissingConfigDefaults(cwd, docsDir);
      if (configBackfill.changed) {
        currentConfig = await getConfig(cwd);
      }
      if (!currentConfig) {
        throw createCliError(
          'DOCS_NOT_FOUND',
          tr(DEFAULT_LANG, 'cli', 'common.docsNotFound')
        );
      }

      // 업데이트 대상 결정
      const hasExplicitSelection = !!(options.agents || options.agentsMd);
      const updateAgents = options.agents || !hasExplicitSelection;
      const updateAgentsMd = options.agentsMd || !hasExplicitSelection;

      console.log(chalk.blue(tr(lang, 'cli', 'update.start')));
      console.log(
        chalk.gray(`  - ${tr(lang, 'cli', 'update.langLabel')}: ${lang}`)
      );
      console.log(
        chalk.gray(`  - ${tr(lang, 'cli', 'update.typeLabel')}: ${projectType}`)
      );
      console.log();

      let updatedCount = 0;

      // Update project-scoped agent docs while keeping CLI-managed runtime copies out of docs.
      if (updateAgents) {
        console.log(chalk.blue(tr(lang, 'cli', 'update.updatingAgents')));

        const commonAgentsBase = path.join(
          templatesDir,
          lang,
          'common',
          'agents'
        );
        const targetAgentsBase = path.join(docsDir, 'agents');

        const commonAgents = commonAgentsBase;
        const targetAgents = targetAgentsBase;

        // featurePath 치환
        const featurePath =
          projectType === 'multi'
            ? 'docs/features/{component}'
            : 'docs/features';
        const projectName = currentConfig.projectName ?? '{{projectName}}';
        const commonReplacements: Record<string, string> = {
          '{{projectName}}': projectName,
          '{{featurePath}}': featurePath,
        };

        if (await fs.pathExists(commonAgents)) {
          const count = await updateFolder(
            commonAgents,
            targetAgents,
            forceOverwrite,
            commonReplacements,
            lang,
            {
              protectedFiles: new Set([
                'custom.md',
                'constitution.md',
                ...ENGINE_MANAGED_AGENT_FILES,
              ]),
              skipDirectories: new Set(ENGINE_MANAGED_AGENT_DIRS),
            }
          );
          updatedCount += count;
        }
        console.log(
          chalk.green(`  ✅ ${tr(lang, 'cli', 'update.agentsUpdated')}`)
        );
      }

      if (updateAgentsMd) {
        const agentsMdTargets = await collectAgentsMdTargets(
          cwd,
          currentConfig
        );
        for (const target of agentsMdTargets) {
          const result = await upsertLeeSpecKitAgentsMd(target, {
            lang,
            docsRepo: currentConfig.docsRepo ?? 'embedded',
          });
          if (result.changed) {
            updatedCount += 1;
          }
        }
      }

      const pruned = await pruneEngineManagedDocs(docsDir);
      if (pruned.length > 0) {
        console.log(
          chalk.gray(
            `  - ${tr(lang, 'cli', 'update.engineManagedPruned', {
              count: pruned.length,
            })}`
          )
        );
      }

      console.log();
      if (configBackfill.changed) {
        console.log(
          chalk.gray(
            `  - ${tr(lang, 'cli', 'update.fileUpdated', { file: '.lee-spec-kit.json' })}`
          )
        );
        console.log(
          chalk.gray(`    (${configBackfill.changedPaths.join(', ')})`)
        );
        if (
          configBackfill.changedPaths.includes(
            'workflow.agentExecution.task.enabled'
          ) ||
          configBackfill.changedPaths.includes(
            'workflow.agentReview.plan.enabled'
          )
        ) {
          console.log(
            chalk.yellow(
              `  - ${tr(lang, 'cli', 'update.legacyAutomationSafe')}`
            )
          );
        }
      }
      console.log(
        chalk.green(
          `✅ ${tr(lang, 'cli', 'update.updatedTotal', { count: updatedCount })}`
        )
      );
    },
    { owner: 'update' }
  );
}

function getGitTopLevelOrNull(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const value = String(out || '').trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

async function collectAgentsMdTargets(
  cwd: string,
  config: Awaited<ReturnType<typeof getConfig>>
): Promise<string[]> {
  if (!config) return [];

  const targets = new Set<string>();
  const docsRepo = config.docsRepo ?? 'embedded';

  if (docsRepo === 'embedded') {
    const repoRoot =
      getGitTopLevelOrNull(cwd) ||
      getGitTopLevelOrNull(config.docsDir) ||
      path.resolve(config.docsDir, '..');
    targets.add(path.join(repoRoot, 'AGENTS.md'));
    return [...targets];
  }

  const workspaceRoot = resolveConfiguredStandaloneWorkspaceRoot(config);
  if (!workspaceRoot) {
    throw createCliError(
      'PRECONDITION_FAILED',
      'Standalone workspaceRoot is missing or invalid. Run `npx lee-spec-kit update --agents-md` from the shared workspace root to migrate this project.'
    );
  }
  targets.add(path.join(workspaceRoot, 'AGENTS.md'));

  return [...targets];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function backfillMissingConfigDefaults(
  cwd: string,
  docsDir: string
): Promise<ConfigBackfillResult> {
  const configPath = path.join(docsDir, '.lee-spec-kit.json');
  if (!(await fs.pathExists(configPath))) {
    return { changed: false, changedPaths: [] };
  }

  const raw = await fs.readJson(configPath);
  if (!isPlainObject(raw)) {
    return { changed: false, changedPaths: [] };
  }

  const changedPaths: string[] = [];

  if (
    raw.docsRepo === 'standalone' &&
    typeof raw.workspaceRoot !== 'string' &&
    canBackfillStandaloneWorkspaceRoot(cwd, docsDir)
  ) {
    raw.workspaceRoot = serializeStandaloneWorkspaceRoot(
      docsDir,
      resolveStandaloneWorkspaceRoot(cwd, docsDir)
    );
    changedPaths.push('workspaceRoot');
  }

  const setIfMissing = <T>(
    parent: Record<string, unknown>,
    key: string,
    nextValue: T,
    pathLabel: string
  ): void => {
    if (parent[key] !== undefined) return;
    parent[key] = nextValue;
    changedPaths.push(pathLabel);
  };

  if (!isPlainObject(raw.experimental)) {
    raw.experimental = { openwiki: false };
    changedPaths.push('experimental');
  } else {
    const experimental = raw.experimental as Record<string, unknown>;
    setIfMissing(experimental, 'openwiki', false, 'experimental.openwiki');
    if (typeof experimental.openwiki !== 'boolean') {
      experimental.openwiki = false;
      changedPaths.push('experimental.openwiki');
    }
  }

  if (!isPlainObject(raw.workflow)) {
    raw.workflow = {};
    changedPaths.push('workflow');
  }
  const workflow = raw.workflow as Record<string, unknown>;
  changedPaths.push(...migrateLegacyWorkflowSettings(workflow));
  const restoreLegacyAgentAutomationDefaults =
    resolveLegacyBackfilledAgentAutomation(raw);
  setIfMissing(
    workflow,
    'requireWorktree',
    raw.docsRepo === 'standalone',
    'workflow.requireWorktree'
  );
  if (raw.docsRepo === 'standalone' && workflow.requireWorktree !== true) {
    workflow.requireWorktree = true;
    changedPaths.push('workflow.requireWorktree');
  }
  setIfMissing(workflow, 'codeDirtyScope', 'auto', 'workflow.codeDirtyScope');
  setIfMissing(workflow, 'taskCommitGate', 'warn', 'workflow.taskCommitGate');

  if (workflow.mode === 'local') {
    setIfMissing(workflow, 'baseBranch', 'main', 'workflow.baseBranch');
    if (
      typeof workflow.baseBranch !== 'string' ||
      !workflow.baseBranch.trim()
    ) {
      workflow.baseBranch = 'main';
      changedPaths.push('workflow.baseBranch');
    } else if (workflow.baseBranch !== workflow.baseBranch.trim()) {
      workflow.baseBranch = workflow.baseBranch.trim();
      changedPaths.push('workflow.baseBranch');
    }
    setIfMissing(
      workflow,
      'completionStrategy',
      'none',
      'workflow.completionStrategy'
    );
    if (
      workflow.completionStrategy !== 'local-ff' &&
      workflow.completionStrategy !== 'local-squash' &&
      workflow.completionStrategy !== 'none'
    ) {
      workflow.completionStrategy = 'none';
      changedPaths.push('workflow.completionStrategy');
    }
    setIfMissing(
      workflow,
      'deleteFeatureBranchAfterMerge',
      true,
      'workflow.deleteFeatureBranchAfterMerge'
    );
    if (typeof workflow.deleteFeatureBranchAfterMerge !== 'boolean') {
      workflow.deleteFeatureBranchAfterMerge = true;
      changedPaths.push('workflow.deleteFeatureBranchAfterMerge');
    }
    // 0.9.1 ran postMergeChecks only after moving the base branch. Migrate
    // those checks to Feature verification so failed checks remain repairable.
    if (!Object.prototype.hasOwnProperty.call(workflow, 'featureChecks')) {
      workflow.featureChecks = Array.isArray(workflow.postMergeChecks)
        ? workflow.postMergeChecks
        : [];
      workflow.postMergeChecks = [];
      changedPaths.push('workflow.featureChecks');
      changedPaths.push('workflow.postMergeChecks');
    }
    setIfMissing(workflow, 'featureChecks', [], 'workflow.featureChecks');
    if (!Array.isArray(workflow.featureChecks)) {
      workflow.featureChecks = [];
      changedPaths.push('workflow.featureChecks');
    } else {
      const normalizedFeatureChecks = workflow.featureChecks.flatMap(
        (value) => {
          if (!isPlainObject(value) || typeof value.command !== 'string') {
            return [];
          }
          const command = value.command.trim();
          if (!command) return [];
          const args = Array.isArray(value.args)
            ? value.args.filter((arg): arg is string => typeof arg === 'string')
            : [];
          return [{ command, ...(args.length > 0 ? { args } : {}) }];
        }
      );
      if (
        JSON.stringify(normalizedFeatureChecks) !==
        JSON.stringify(workflow.featureChecks)
      ) {
        workflow.featureChecks = normalizedFeatureChecks;
        changedPaths.push('workflow.featureChecks');
      }
    }
    setIfMissing(workflow, 'postMergeChecks', [], 'workflow.postMergeChecks');
    if (!Array.isArray(workflow.postMergeChecks)) {
      workflow.postMergeChecks = [];
      changedPaths.push('workflow.postMergeChecks');
    } else {
      const normalizedPostMergeChecks = workflow.postMergeChecks.flatMap(
        (value) => {
          if (!isPlainObject(value) || typeof value.command !== 'string') {
            return [];
          }
          const command = value.command.trim();
          if (!command) return [];
          const args = Array.isArray(value.args)
            ? value.args.filter((arg): arg is string => typeof arg === 'string')
            : [];
          return [{ command, ...(args.length > 0 ? { args } : {}) }];
        }
      );
      if (
        JSON.stringify(normalizedPostMergeChecks) !==
        JSON.stringify(workflow.postMergeChecks)
      ) {
        workflow.postMergeChecks = normalizedPostMergeChecks;
        changedPaths.push('workflow.postMergeChecks');
      }
    }
  }

  if (!isPlainObject(workflow.agentExecution)) {
    workflow.agentExecution = {};
    changedPaths.push('workflow.agentExecution');
  }
  const agentExecution = workflow.agentExecution as Record<string, unknown>;
  if (!isPlainObject(agentExecution.task)) {
    agentExecution.task = {};
    changedPaths.push('workflow.agentExecution.task');
  }
  const taskExecution = agentExecution.task as Record<string, unknown>;
  const defaultTaskExecution = createDefaultAgentExecutionTaskConfig();
  setIfMissing(
    taskExecution,
    'enabled',
    false,
    'workflow.agentExecution.task.enabled'
  );
  if (typeof taskExecution.enabled !== 'boolean') {
    taskExecution.enabled = false;
    changedPaths.push('workflow.agentExecution.task.enabled');
  }
  if (
    restoreLegacyAgentAutomationDefaults.taskExecution &&
    taskExecution.enabled !== false
  ) {
    taskExecution.enabled = false;
    changedPaths.push('workflow.agentExecution.task.enabled');
  }
  if (taskExecution.type !== 'subagent') {
    taskExecution.type = defaultTaskExecution.type;
    changedPaths.push('workflow.agentExecution.task.type');
  }
  if (typeof taskExecution.model !== 'string' || !taskExecution.model.trim()) {
    taskExecution.model = defaultTaskExecution.model;
    changedPaths.push('workflow.agentExecution.task.model');
  } else if (taskExecution.model !== taskExecution.model.trim()) {
    taskExecution.model = taskExecution.model.trim();
    changedPaths.push('workflow.agentExecution.task.model');
  }
  if (
    typeof taskExecution.reasoningEffort !== 'string' ||
    !AGENT_REVIEW_REASONING_EFFORTS.includes(
      taskExecution.reasoningEffort as (typeof AGENT_REVIEW_REASONING_EFFORTS)[number]
    )
  ) {
    taskExecution.reasoningEffort = defaultTaskExecution.reasoningEffort;
    changedPaths.push('workflow.agentExecution.task.reasoningEffort');
  }
  if (
    taskExecution.onUnavailable !== 'inherit' &&
    taskExecution.onUnavailable !== 'error'
  ) {
    taskExecution.onUnavailable = defaultTaskExecution.onUnavailable;
    changedPaths.push('workflow.agentExecution.task.onUnavailable');
  }

  const legacyPrePrReview = isPlainObject(workflow.prePrReview)
    ? { ...workflow.prePrReview }
    : null;
  if (!isPlainObject(workflow.agentReview)) {
    workflow.agentReview = {};
    changedPaths.push('workflow.agentReview');
  }
  const agentReview = workflow.agentReview as Record<string, unknown>;
  setIfMissing(agentReview, 'maxRounds', 1, 'workflow.agentReview.maxRounds');
  if (
    typeof agentReview.maxRounds !== 'number' ||
    !Number.isInteger(agentReview.maxRounds) ||
    agentReview.maxRounds < 1
  ) {
    agentReview.maxRounds = 1;
    changedPaths.push('workflow.agentReview.maxRounds');
  }
  const normalizeAgentReviewPhase = (
    key: 'plan' | 'task' | 'feature',
    enabledDefault: boolean,
    legacySeed: Record<string, unknown> | null = null
  ): void => {
    const phasePath = `workflow.agentReview.${key}`;
    if (!isPlainObject(agentReview[key])) {
      agentReview[key] = legacySeed ? { ...legacySeed } : {};
      changedPaths.push(phasePath);
    }
    const phase = agentReview[key] as Record<string, unknown>;
    setIfMissing(phase, 'enabled', enabledDefault, `${phasePath}.enabled`);
    if (typeof phase.enabled !== 'boolean') {
      phase.enabled = enabledDefault;
      changedPaths.push(`${phasePath}.enabled`);
    }
    setIfMissing(
      phase,
      'evidenceMode',
      'path_required',
      `${phasePath}.evidenceMode`
    );
    if (
      phase.evidenceMode !== 'path_required' &&
      phase.evidenceMode !== 'any'
    ) {
      phase.evidenceMode = 'path_required';
      changedPaths.push(`${phasePath}.evidenceMode`);
    }
    if ('findings' in phase) {
      delete phase.findings;
      changedPaths.push(`${phasePath}.findings`);
    }

    const defaultReviewer = createDefaultAgentReviewerConfig();
    if (!isPlainObject(phase.reviewer)) {
      phase.reviewer = defaultReviewer;
      changedPaths.push(`${phasePath}.reviewer`);
      return;
    }

    const reviewer = phase.reviewer as Record<string, unknown>;
    if (reviewer.type !== 'subagent') {
      reviewer.type = defaultReviewer.type;
      changedPaths.push(`${phasePath}.reviewer.type`);
    }
    if (typeof reviewer.model !== 'string' || !reviewer.model.trim()) {
      reviewer.model = defaultReviewer.model;
      changedPaths.push(`${phasePath}.reviewer.model`);
    } else if (reviewer.model !== reviewer.model.trim()) {
      reviewer.model = reviewer.model.trim();
      changedPaths.push(`${phasePath}.reviewer.model`);
    }
    if (
      typeof reviewer.reasoningEffort !== 'string' ||
      !AGENT_REVIEW_REASONING_EFFORTS.includes(
        reviewer.reasoningEffort as (typeof AGENT_REVIEW_REASONING_EFFORTS)[number]
      )
    ) {
      reviewer.reasoningEffort = defaultReviewer.reasoningEffort;
      changedPaths.push(`${phasePath}.reviewer.reasoningEffort`);
    }
    if (
      reviewer.onUnavailable !== 'inherit' &&
      reviewer.onUnavailable !== 'error'
    ) {
      reviewer.onUnavailable = defaultReviewer.onUnavailable;
      changedPaths.push(`${phasePath}.reviewer.onUnavailable`);
    }
  };

  normalizeAgentReviewPhase('plan', false);
  if (restoreLegacyAgentAutomationDefaults.planReview) {
    const planReview = agentReview.plan as Record<string, unknown>;
    if (planReview.enabled !== false) {
      planReview.enabled = false;
      changedPaths.push('workflow.agentReview.plan.enabled');
    }
  }
  normalizeAgentReviewPhase('task', false);
  const legacyFeatureEnabled =
    typeof legacyPrePrReview?.enabled === 'boolean'
      ? legacyPrePrReview.enabled
      : workflow.mode !== 'local';
  normalizeAgentReviewPhase('feature', legacyFeatureEnabled, legacyPrePrReview);
  if (hasOwnKey(workflow, 'prePrReview')) {
    delete workflow.prePrReview;
    changedPaths.push('workflow.prePrReview');
  }
  if (!isPlainObject(raw.pr)) {
    raw.pr = {};
    changedPaths.push('pr');
  }
  const pr = raw.pr as Record<string, unknown>;
  if (!isPlainObject(pr.screenshots)) {
    pr.screenshots = {};
    changedPaths.push('pr.screenshots');
  }
  const screenshots = pr.screenshots as Record<string, unknown>;
  setIfMissing(screenshots, 'upload', false, 'pr.screenshots.upload');

  if (!isPlainObject(raw.approval)) {
    raw.approval = createDefaultApprovalConfig();
    changedPaths.push('approval');
  } else {
    const approval = raw.approval as Record<string, unknown>;
    const migration = migrateLegacyApprovalSettings(approval);
    raw.approval = migration.approval;
    changedPaths.push(...migration.changedPaths);
    if (
      isPlainObject(raw.approval) &&
      (isLegacyGeneratedApprovalConfig(raw.approval) ||
        isPreviousDefaultApprovalConfig(raw.approval))
    ) {
      raw.approval = createDefaultApprovalConfig();
      changedPaths.push('approval');
    }
  }

  if (changedPaths.length === 0) {
    return { changed: false, changedPaths: [] };
  }

  await fs.writeJson(configPath, raw, { spaces: 2 });
  return { changed: true, changedPaths };
}

async function updateFolder(
  sourceDir: string,
  targetDir: string,
  force?: boolean,
  replacements?: Record<string, string>,
  lang: 'ko' | 'en' = DEFAULT_LANG,
  options: {
    protectedFiles?: Set<string>;
    skipDirectories?: Set<string>;
  } = {}
): Promise<number> {
  const protectedFiles =
    options.protectedFiles ?? new Set(['custom.md', 'constitution.md']);
  const skipDirectories = options.skipDirectories ?? new Set<string>();

  // 대상 폴더가 없으면 생성
  await fs.ensureDir(targetDir);

  const files = await fs.readdir(sourceDir);
  let updatedCount = 0;

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    const stat = await fs.stat(sourcePath);

    if (stat.isFile()) {
      // 사용자 정의/정책 파일은 업데이트에서 제외
      if (protectedFiles.has(file)) {
        continue;
      }

      let sourceContent = await fs.readFile(sourcePath, 'utf-8');

      // 플레이스홀더 치환
      if (replacements) {
        sourceContent = applyReplacements(sourceContent, replacements);
      }

      let shouldUpdate = true;

      // 대상 파일이 존재하는 경우
      if (await fs.pathExists(targetPath)) {
        const targetContent = await fs.readFile(targetPath, 'utf-8');

        // 내용이 같으면 스킵
        if (sourceContent === targetContent) {
          continue;
        }

        // force가 아니면 경고 표시 (CI/파이프 환경에서는 stdout 오염/대화 불가)
        if (!force) {
          console.log(
            chalk.yellow(
              `  ⚠️ ${file} - ${tr(lang, 'cli', 'update.changeDetected')}`
            )
          );
          shouldUpdate = false;
        }
      }

      if (shouldUpdate) {
        await fs.writeFile(targetPath, sourceContent);
        console.log(
          chalk.gray(`  📄 ${tr(lang, 'cli', 'update.fileUpdated', { file })}`)
        );
        updatedCount++;
      }
    } else if (stat.isDirectory()) {
      if (skipDirectories.has(file)) {
        continue;
      }
      // 하위 디렉토리 재귀 처리
      const subCount = await updateFolder(
        sourcePath,
        targetPath,
        force,
        replacements,
        lang,
        options
      );
      updatedCount += subCount;
    }
  }

  return updatedCount;
}

function getGitTopLevel(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function normalizeGitPath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function stripOuterQuotes(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

function extractPorcelainPaths(line: string): string[] {
  if (line.length < 4) return [];
  const body = line.slice(3).trim();
  if (!body) return [];
  if (body.includes(' -> ')) {
    return body
      .split(' -> ')
      .map((part) => normalizeGitPath(stripOuterQuotes(part)));
  }
  return [normalizeGitPath(stripOuterQuotes(body))];
}

function getDocsPorcelainStatus(
  docsDir: string,
  ignoredAbsPaths: string[] = []
): string | null {
  const top = getGitTopLevel(docsDir);
  if (!top) return null;
  const rel = path.relative(top, docsDir) || '.';
  try {
    const output = execFileSync(
      'git',
      ['status', '--porcelain=v1', '--', rel],
      {
        cwd: top,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    if (ignoredAbsPaths.length === 0) {
      return output;
    }

    const ignoredRelPaths = new Set(
      ignoredAbsPaths.map((absPath) =>
        normalizeGitPath(path.relative(top, absPath) || '.')
      )
    );
    const filtered = output
      .split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        const touchedPaths = extractPorcelainPaths(line);
        if (touchedPaths.length === 0) return true;
        return touchedPaths.some((p) => !ignoredRelPaths.has(p));
      })
      .join('\n');
    return filtered;
  } catch {
    return null;
  }
}

async function isDocsWorktreeCleanOrThrow(
  docsDir: string,
  lang: 'ko' | 'en',
  ignoredAbsPaths: string[] = []
): Promise<boolean> {
  const status = getDocsPorcelainStatus(docsDir, ignoredAbsPaths);
  if (status === null) {
    throw createCliError(
      'PRECONDITION_FAILED',
      tr(lang, 'cli', 'update.gitStatusUnavailable')
    );
  }
  if (status.trim().length > 0) {
    throw createCliError(
      'PRECONDITION_FAILED',
      tr(lang, 'cli', 'update.docsWorktreeDirty')
    );
  }
  return true;
}

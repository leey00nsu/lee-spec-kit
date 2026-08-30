import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import prompts from 'prompts';
import {
  createDefaultAgentExecutionTaskConfig,
  createDefaultAgentReviewerConfig,
  getConfig,
} from '../utils/config.js';
import {
  assertAllowedComponent,
  resolveProjectComponents,
} from '../utils/components.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { normalizeProjectType } from '../utils/project-type.js';
import { getDocsLockPath, withFileLock } from '../utils/lock.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { resolveLegacyBackfilledAgentAutomation } from '../config/agent-automation.js';

interface ConfigOptions {
  dir?: string;
  projectRoot?: string;
  component?: string;
  taskAgent?: 'on' | 'off';
  reviews?: string;
  maxReviewRounds?: string;
  completionStrategy?: 'local-ff' | 'local-squash' | 'none';
  interactive?: boolean;
  nonInteractive?: boolean;
}

const CONFIG_REVIEW_PHASES = ['plan', 'task', 'feature'] as const;
type ConfigReviewPhase = (typeof CONFIG_REVIEW_PHASES)[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseReviews(
  value: string | undefined
): ConfigReviewPhase[] | undefined {
  if (typeof value === 'undefined') return undefined;
  const normalized = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (normalized.length === 1 && normalized[0] === 'none') return [];
  if (
    normalized.length === 0 ||
    normalized.includes('none') ||
    normalized.some(
      (entry) => !CONFIG_REVIEW_PHASES.includes(entry as ConfigReviewPhase)
    )
  ) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--reviews` must be a comma-separated subset of `plan,task,feature`, or `none`.'
    );
  }
  return CONFIG_REVIEW_PHASES.filter((phase) => normalized.includes(phase));
}

function parseMaxReviewRounds(value: string | undefined): number | undefined {
  if (typeof value === 'undefined') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--max-review-rounds` must be a positive integer.'
    );
  }
  return parsed;
}

function validateWorkflowOptions(options: ConfigOptions): void {
  if (options.taskAgent && !['on', 'off'].includes(options.taskAgent)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--task-agent` must be `on` or `off`.'
    );
  }
  if (
    options.completionStrategy &&
    !['local-ff', 'local-squash', 'none'].includes(options.completionStrategy)
  ) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--completion-strategy` must be `local-ff`, `local-squash`, or `none`.'
    );
  }
  parseReviews(options.reviews);
  parseMaxReviewRounds(options.maxReviewRounds);
}

export function configCommand(program: Command): void {
  program
    .command('config')
    .description('View or modify project configuration')
    .option('--dir <dir>', 'Docs directory or project path to target')
    .option('--project-root <path>', 'Set project root path')
    .option('--component <component>', 'Component name for multi projects')
    .option('--task-agent <mode>', 'Task implementation agent: on | off')
    .option(
      '--reviews <list>',
      'Review gates: comma-separated plan,task,feature | none'
    )
    .option(
      '--max-review-rounds <count>',
      'Maximum fresh review rounds before continuing with residual risks'
    )
    .option(
      '--completion-strategy <strategy>',
      'Local completion: local-ff | local-squash | none'
    )
    .option('--interactive', 'Configure workflow options interactively')
    .option('--non-interactive', 'Fail instead of prompting for input')
    .action(async (options: ConfigOptions) => {
      try {
        await runConfig(options);
      } catch (error) {
        if (error instanceof Error && error.message === 'canceled') {
          const config = await getConfig(process.cwd());
          const lang = config?.lang ?? DEFAULT_LANG;
          console.log(chalk.yellow(`\n${tr(lang, 'cli', 'common.canceled')}`));
          return;
        }
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
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

async function runConfig(options: ConfigOptions): Promise<void> {
  validateWorkflowOptions(options);
  const cwd = process.cwd();
  const targetCwd = options.dir ? path.resolve(cwd, options.dir) : cwd;
  const config = await getConfig(targetCwd);

  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  const configPath = path.join(config.docsDir, '.lee-spec-kit.json');
  const hasWorkflowOptions =
    typeof options.taskAgent !== 'undefined' ||
    typeof options.reviews !== 'undefined' ||
    typeof options.maxReviewRounds !== 'undefined' ||
    typeof options.completionStrategy !== 'undefined' ||
    !!options.interactive;

  // 옵션 없이 실행: 현재 설정 출력
  if (!options.projectRoot && !hasWorkflowOptions) {
    console.log();
    console.log(chalk.blue(tr(config.lang, 'cli', 'config.currentTitle')));
    console.log();
    console.log(
      chalk.gray(
        `  ${tr(config.lang, 'cli', 'config.pathLabel')}: ${configPath}`
      )
    );
    console.log();

    const configFile = await fs.readJson(configPath);
    console.log(JSON.stringify(configFile, null, 2));
    console.log();
    return;
  }
  await withFileLock(
    getDocsLockPath(config.docsDir),
    async () => {
      // projectRoot 수정
      const configFile = await fs.readJson(configPath);
      if (!isPlainObject(configFile)) {
        throw createCliError(
          'PRECONDITION_FAILED',
          'Invalid project configuration.'
        );
      }

      if (options.projectRoot) {
        await updateProjectRoot(configFile, options, config.lang);
      }
      if (hasWorkflowOptions) {
        await updateWorkflowConfig(configFile, options, config.lang);
      }

      await fs.writeJson(configPath, configFile, { spaces: 2 });
      console.log();
    },
    { owner: 'config' }
  );
}

async function updateProjectRoot(
  configFile: Record<string, unknown>,
  options: ConfigOptions,
  lang: 'ko' | 'en'
): Promise<void> {
  if (configFile.docsRepo !== 'standalone') {
    console.log(
      chalk.yellow(tr(lang, 'cli', 'config.projectRootStandaloneOnly'))
    );
    return;
  }
  const projectRoot = options.projectRoot;
  if (!projectRoot) return;
  const projectType = normalizeProjectType(
    String(configFile.projectType || 'single')
  );
  const targetFromOptions = options.component?.trim().toLowerCase();

  if (projectType === 'multi') {
    const components = resolveProjectComponents(
      projectType,
      configFile.components
    );
    let targetComponent = targetFromOptions;

    if (!targetComponent) {
          if (components.length === 1) {
            targetComponent = components[0];
          } else if (options.nonInteractive) {
            throw createCliError(
              'PROMPT_BLOCKED',
          '`--component` is required for multi projectRoot update when using `--non-interactive`.'
        );
      } else {
        const response = await prompts(
          [
            {
              type: 'select',
              name: 'component',
              message: tr(lang, 'cli', 'config.selectRepoToUpdate'),
              choices: components.map((value) => ({
                title: value.toUpperCase(),
                value,
                  })),
                },
              ],
              {
                onCancel: () => {
                  throw new Error('canceled');
                },
              }
            );
            targetComponent = response.component;
          }
        }
        if (!targetComponent) {
          throw createCliError(
            'INVALID_ARGUMENT',
            'Component selection is required.'
          );
        }

    assertAllowedComponent(targetComponent, components);

    const currentRoot: Record<string, string> = isPlainObject(
      configFile.projectRoot
    )
      ? Object.fromEntries(
          Object.entries(configFile.projectRoot).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : {};
    currentRoot[targetComponent] = projectRoot;
    configFile.projectRoot = currentRoot;

    console.log(
      chalk.green(
        tr(lang, 'cli', 'config.projectRootSet', {
          repo: targetComponent.toUpperCase(),
          path: projectRoot,
        })
          )
        );
      } else {
        if (targetFromOptions) {
          throw createCliError(
            'INVALID_ARGUMENT',
        '`--component` is only valid for multi projectRoot updates.'
      );
    }
    configFile.projectRoot = projectRoot;
    console.log(
      chalk.green(
        tr(lang, 'cli', 'config.projectRootSetSingle', {
          path: projectRoot,
        })
      )
    );
  }
}

function ensureWorkflow(
  configFile: Record<string, unknown>
): Record<string, unknown> {
  if (!isPlainObject(configFile.workflow)) configFile.workflow = {};
  return configFile.workflow as Record<string, unknown>;
}

function ensureTaskExecution(
  workflow: Record<string, unknown>
): Record<string, unknown> {
  if (!isPlainObject(workflow.agentExecution)) workflow.agentExecution = {};
  const agentExecution = workflow.agentExecution as Record<string, unknown>;
  if (!isPlainObject(agentExecution.task)) {
    agentExecution.task = createDefaultAgentExecutionTaskConfig();
  }
  return agentExecution.task as Record<string, unknown>;
}

function ensureAgentReview(
  workflow: Record<string, unknown>
): Record<string, unknown> {
  if (!isPlainObject(workflow.agentReview)) workflow.agentReview = {};
  return workflow.agentReview as Record<string, unknown>;
}

function ensureReviewPhase(
  agentReview: Record<string, unknown>,
  phaseName: ConfigReviewPhase
): Record<string, unknown> {
  if (!isPlainObject(agentReview[phaseName])) {
    agentReview[phaseName] = {
      enabled: false,
      evidenceMode: 'path_required',
      reviewer: createDefaultAgentReviewerConfig(),
    };
  }
  const phase = agentReview[phaseName] as Record<string, unknown>;
  if (!isPlainObject(phase.reviewer)) {
    phase.reviewer = createDefaultAgentReviewerConfig();
  }
  if (phase.evidenceMode !== 'any' && phase.evidenceMode !== 'path_required') {
    phase.evidenceMode = 'path_required';
  }
  return phase;
}

function currentReviewSelection(
  workflow: Record<string, unknown>
): ConfigReviewPhase[] {
  const agentReview = isPlainObject(workflow.agentReview)
    ? workflow.agentReview
    : {};
  const legacyFeature = isPlainObject(workflow.prePrReview)
    ? workflow.prePrReview.enabled
    : undefined;
  const isLocal = workflow.mode === 'local' || workflow.preset === 'local';
  return CONFIG_REVIEW_PHASES.filter((phase) => {
    const phaseConfig = isPlainObject(agentReview[phase])
      ? agentReview[phase]
      : {};
    if (typeof phaseConfig.enabled === 'boolean') return phaseConfig.enabled;
    if (phase === 'feature') {
      return typeof legacyFeature === 'boolean' ? legacyFeature : !isLocal;
    }
    return false;
  });
}

async function updateWorkflowConfig(
  configFile: Record<string, unknown>,
  options: ConfigOptions,
  lang: 'ko' | 'en'
): Promise<void> {
  const workflow = ensureWorkflow(configFile);
  const legacyBackfilledAgentAutomation =
    resolveLegacyBackfilledAgentAutomation(configFile);
  if (legacyBackfilledAgentAutomation.taskExecution) {
    ensureTaskExecution(workflow).enabled = false;
  }
  if (legacyBackfilledAgentAutomation.planReview) {
    ensureReviewPhase(ensureAgentReview(workflow), 'plan').enabled = false;
  }
  const isLocal = workflow.mode === 'local' || workflow.preset === 'local';
  if (options.interactive && options.nonInteractive) {
    throw createCliError(
      'PROMPT_BLOCKED',
      '`--interactive` cannot be used with `--non-interactive`.'
    );
  }

  let taskAgentEnabled =
    options.taskAgent === 'on'
      ? true
      : options.taskAgent === 'off'
        ? false
        : undefined;
  let reviews = parseReviews(options.reviews);
  let maxReviewRounds = parseMaxReviewRounds(options.maxReviewRounds);
  let completionStrategy = options.completionStrategy;

  if (options.interactive) {
    const selectedReviews = currentReviewSelection(workflow);
    const currentTaskExecution =
      isPlainObject(workflow.agentExecution) &&
      isPlainObject(workflow.agentExecution.task)
        ? workflow.agentExecution.task.enabled === true
        : false;
    const currentAgentReview = isPlainObject(workflow.agentReview)
      ? workflow.agentReview
      : {};
    const currentMaxRounds =
      typeof currentAgentReview.maxRounds === 'number' &&
      Number.isInteger(currentAgentReview.maxRounds) &&
      currentAgentReview.maxRounds > 0
        ? currentAgentReview.maxRounds
        : 1;
    const response = await prompts(
      [
        {
          type: typeof options.taskAgent === 'undefined' ? 'select' : null,
          name: 'taskAgent',
          message: tr(lang, 'cli', 'init.prompt.taskAgent'),
          choices: [
            { title: tr(lang, 'cli', 'init.choice.taskAgent.on'), value: true },
            {
              title: tr(lang, 'cli', 'init.choice.taskAgent.off'),
              value: false,
            },
          ],
          initial: currentTaskExecution ? 0 : 1,
        },
        {
          type: typeof options.reviews === 'undefined' ? 'multiselect' : null,
          name: 'reviews',
          message: tr(lang, 'cli', 'init.prompt.reviews'),
          choices: CONFIG_REVIEW_PHASES.map((phase) => ({
            title: tr(lang, 'cli', `init.choice.review.${phase}`),
            value: phase,
            selected: selectedReviews.includes(phase),
          })),
        },
        {
          type:
            typeof options.maxReviewRounds === 'undefined' ? 'number' : null,
          name: 'maxReviewRounds',
          message: tr(lang, 'cli', 'init.prompt.maxReviewRounds'),
          initial: currentMaxRounds,
          min: 1,
        },
        {
          type:
            isLocal && typeof options.completionStrategy === 'undefined'
              ? 'select'
              : null,
          name: 'completionStrategy',
          message: tr(lang, 'cli', 'init.prompt.completionStrategy'),
          choices: [
            { title: 'local-ff', value: 'local-ff' },
            { title: 'local-squash', value: 'local-squash' },
            { title: 'none', value: 'none' },
          ],
          initial: ['local-ff', 'local-squash', 'none'].indexOf(
            String(workflow.completionStrategy || 'none')
          ),
        },
      ],
      {
        onCancel: () => {
          throw new Error('canceled');
        },
      }
    );
    if (typeof response.taskAgent === 'boolean')
      taskAgentEnabled = response.taskAgent;
    if (Array.isArray(response.reviews)) {
      reviews = CONFIG_REVIEW_PHASES.filter((phase) =>
        response.reviews.includes(phase)
      );
    }
    if (
      Number.isInteger(response.maxReviewRounds) &&
      response.maxReviewRounds > 0
    ) {
      maxReviewRounds = response.maxReviewRounds;
    }
    completionStrategy = response.completionStrategy || completionStrategy;
  }

  if (completionStrategy && !isLocal) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--completion-strategy` can only be used with a local workflow.'
    );
  }
  if (typeof taskAgentEnabled === 'boolean') {
    ensureTaskExecution(workflow).enabled = taskAgentEnabled;
  }
  if (reviews) {
    const agentReview = ensureAgentReview(workflow);
    for (const phase of CONFIG_REVIEW_PHASES) {
      ensureReviewPhase(agentReview, phase).enabled = reviews.includes(phase);
    }
  }
  if (typeof maxReviewRounds === 'number') {
    ensureAgentReview(workflow).maxRounds = maxReviewRounds;
  }
  if (completionStrategy) workflow.completionStrategy = completionStrategy;
  if (typeof taskAgentEnabled === 'boolean' || reviews) {
    workflow.agentAutomationConfigured = true;
  }

  console.log(chalk.green(tr(lang, 'cli', 'config.workflowUpdated')));
}

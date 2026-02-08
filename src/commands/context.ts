import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { resolveWorkflowPolicy } from '../utils/workflow.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import {
  scanFeatures,
  FeatureContext,
  getStepDefinitions,
  getStepsMap,
  StepDefinition,
} from '../utils/context.js';

interface ContextOptions {
  json?: boolean;
  repo?: 'fe' | 'be';
  all?: boolean;
  done?: boolean;
  approve?: string;
  execute?: boolean;
}

type ContextSelectionOptions = Pick<ContextOptions, 'repo' | 'all' | 'done'>;

type ContextStatus =
  | 'no_features'
  | 'no_open'
  | 'single_matched'
  | 'multiple_active'
  | 'no_match';

type ContextSelectionMode = 'explicit' | 'branch' | 'open' | 'done' | 'all';

type ActionOption = ReturnType<typeof toActionOptions>[number];

interface ResolvedContextState {
  features: FeatureContext[];
  branches: {
    docs: string;
    project: { single?: string; fe?: string; be?: string };
  };
  warnings: string[];
  doneFeatures: FeatureContext[];
  openFeatures: FeatureContext[];
  inProgressFeatures: FeatureContext[];
  readyToCloseFeatures: FeatureContext[];
  selectionMode: ContextSelectionMode;
  targetFeatures: FeatureContext[];
  status: ContextStatus;
  matchedFeature: FeatureContext | null;
  actions: FeatureContext['actions'];
  actionOptions: ActionOption[];
  contextVersion: string | null;
}

function getActionLabel(index: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function toActionOptions(actions: FeatureContext['actions']) {
  return actions.map((action, index) => ({
    label: getActionLabel(index),
    action,
  }));
}

function buildActionSnapshot(
  actionOptions: ReturnType<typeof toActionOptions>
): Array<Record<string, string | boolean | undefined>> {
  return actionOptions.map(({ label, action }) => {
    if (action.type === 'command') {
      return {
        label,
        type: action.type,
        scope: action.scope,
        cwd: action.cwd,
        cmd: action.cmd,
        category: action.category,
        requiresUserCheck: !!action.requiresUserCheck,
      };
    }
    return {
      label,
      type: action.type,
      message: action.message,
      category: action.category,
      requiresUserCheck: !!action.requiresUserCheck,
    };
  });
}

function getContextVersion(
  feature: FeatureContext | null,
  actionOptions: ReturnType<typeof toActionOptions>
): string | null {
  if (!feature) return null;
  const payload = JSON.stringify({
    id: feature.id || '',
    folderName: feature.folderName,
    currentStep: feature.currentStep,
    actionSnapshot: buildActionSnapshot(actionOptions),
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

function parseApprovalLabel(input: string): string | null {
  const match = input.trim().match(/^([A-Z]{1,2})(?:\s+OK)?$/i);
  if (!match) return null;
  return match[1].toUpperCase();
}

function listLabels(actionOptions: ActionOption[]): string {
  if (actionOptions.length === 0) return '-';
  return actionOptions.map((o) => o.label).join(', ');
}

function formatActionSummary(action: FeatureContext['actions'][number]): string {
  if (action.type === 'command') {
    return `(${action.scope}) ${action.cmd}`;
  }
  return action.message;
}

function toSelectionStatus(
  features: FeatureContext[],
  selectionMode: ContextSelectionMode,
  openFeatures: FeatureContext[],
  targetFeatures: FeatureContext[]
): ContextStatus {
  const isNoOpen =
    selectionMode === 'open' && features.length > 0 && openFeatures.length === 0;
  if (features.length === 0) return 'no_features';
  if (isNoOpen) return 'no_open';
  if (targetFeatures.length === 1) return 'single_matched';
  if (targetFeatures.length > 1) return 'multiple_active';
  return 'no_match';
}

function toReasonCode(status: ContextStatus): string {
  if (status === 'no_features') return 'NO_FEATURES';
  if (status === 'no_open') return 'NO_OPEN_FEATURES';
  if (status === 'single_matched') return 'SINGLE_MATCHED';
  if (status === 'multiple_active') return 'MULTIPLE_ACTIVE_FEATURES';
  return 'NO_MATCHED_FEATURES';
}

async function resolveContextState(
  config: Awaited<ReturnType<typeof getConfig>>,
  featureName: string | undefined,
  options: ContextSelectionOptions
): Promise<ResolvedContextState> {
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  const { features, branches, warnings } = await scanFeatures(config);
  const doneFeatures = features.filter((f) => f.completion.workflowDone);
  const openFeatures = features.filter((f) => !f.completion.workflowDone);
  const inProgressFeatures = openFeatures.filter(
    (f) => !f.completion.implementationDone
  );
  const readyToCloseFeatures = openFeatures.filter(
    (f) => f.completion.implementationDone
  );

  let targetFeatures: FeatureContext[] = [];
  let selectionMode: ContextSelectionMode = 'explicit';

  if (featureName) {
    targetFeatures = features.filter((f) => matchesFeatureSelector(f, featureName));
    if (options.repo) {
      targetFeatures = targetFeatures.filter((f) => f.type === options.repo);
    }
    selectionMode = 'explicit';
  } else {
    if (config.projectType === 'single') {
      const branchName = branches.project.single || '';
      targetFeatures = detectFromBranch(branchName, features);
    } else if (options.repo) {
      const branchName = branches.project[options.repo] || '';
      targetFeatures = detectFromBranch(
        branchName,
        features.filter((f) => f.type === options.repo)
      );
    } else {
      const feMatches = branches.project.fe
        ? detectFromBranch(
            branches.project.fe,
            features.filter((f) => f.type === 'fe')
          )
        : [];
      const beMatches = branches.project.be
        ? detectFromBranch(
            branches.project.be,
            features.filter((f) => f.type === 'be')
          )
        : [];
      targetFeatures = [...feMatches, ...beMatches];
    }

    if (targetFeatures.length > 0) {
      selectionMode = 'branch';
    } else if (options.all) {
      targetFeatures = features;
      selectionMode = 'all';
    } else if (options.done) {
      targetFeatures = doneFeatures;
      selectionMode = 'done';
    } else {
      targetFeatures = openFeatures;
      selectionMode = 'open';
    }
  }

  const status = toSelectionStatus(
    features,
    selectionMode,
    openFeatures,
    targetFeatures
  );
  const matchedFeature = targetFeatures.length === 1 ? targetFeatures[0] : null;
  const actions = matchedFeature?.actions ?? [];
  const actionOptions = toActionOptions(actions);
  const contextVersion = getContextVersion(matchedFeature, actionOptions);

  return {
    features,
    branches,
    warnings,
    doneFeatures,
    openFeatures,
    inProgressFeatures,
    readyToCloseFeatures,
    selectionMode,
    targetFeatures,
    status,
    matchedFeature,
    actions,
    actionOptions,
    contextVersion,
  };
}

function executeCommandAction(
  cmd: string,
  jsonMode: boolean
): { stdout?: string; stderr?: string } {
  const shellPath =
    process.env.SHELL ||
    (process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh');

  if (jsonMode) {
    const stdout = execSync(cmd, {
      shell: shellPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout };
  }

  execSync(cmd, {
    shell: shellPath,
    stdio: 'inherit',
  });
  return {};
}

export function contextCommand(program: Command): void {
  program
    .command('context [feature-name]')
    .description('Show current feature context and next actions')
    .option('--json', 'Output in JSON format for agents')
    .option('--repo <repo>', 'Repository type for fullstack: fe | be')
    .option('--all', 'Include completed features when auto-detecting')
    .option('--done', 'Show completed (workflow-done) features only')
    .option('--approve <reply>', 'Approve one labeled option: A or A OK')
    .option('--execute', 'Execute approved option when it is a command')
    .action(
      async (featureName: string | undefined, options: ContextOptions) => {
        try {
          await runContext(featureName, options);
        } catch (error) {
          const config = await getConfig(process.cwd());
          const lang = config?.lang ?? DEFAULT_LANG;
          const cliError = toCliError(error);
          const suggestions = getCliErrorSuggestions(cliError.code, lang);
          if (options.json) {
            console.log(
              JSON.stringify({
                status: 'error',
                reasonCode: cliError.code,
                error: cliError.message,
                suggestions,
              })
            );
          } else {
            console.error(
              chalk.red(tr(lang, 'cli', 'common.errorLabel')),
              chalk.red(`[${cliError.code}] ${cliError.message}`)
            );
            printCliErrorSuggestions(suggestions, lang);
          }
          process.exit(1);
        }
      }
    );
}

function matchesFeatureSelector(f: FeatureContext, selector: string): boolean {
  const s = selector.trim();
  if (!s) return false;
  if (f.folderName.toLowerCase() === s.toLowerCase()) return true;
  if (f.slug.toLowerCase() === s.toLowerCase()) return true;
  if (f.id && f.id.toLowerCase() === s.toLowerCase()) return true;
  return false;
}

function detectFromBranch(
  branchName: string,
  features: FeatureContext[]
): FeatureContext[] {
  // feat/123-user-auth  또는 feat/123-F001-user-auth
  const match = branchName.match(/^feat\/\d+-(.+)$/);
  if (!match) return [];
  const detected = match[1];
  return features.filter(
    (f) =>
      f.slug.toLowerCase() === detected.toLowerCase() ||
      f.folderName.toLowerCase() === detected.toLowerCase()
  );
}

function getListLabel(
  f: FeatureContext,
  stepsMap: Record<number, string>,
  lang: 'ko' | 'en',
  workflowPolicy: ReturnType<typeof resolveWorkflowPolicy>
): string {
  // For "ready to close" features, show the closest missing workflow requirement
  // instead of generic step names like "tasks.md 작성".
  if (f.completion.implementationDone && !f.completion.workflowDone) {
    if (f.git.docsHasUncommittedChanges) {
      return tr(lang, 'cli', 'context.list.docsCommitNeeded');
    }
    if (workflowPolicy.requireIssue && !f.issueNumber) {
      return tr(lang, 'cli', 'context.list.issueNumberNeeded');
    }
    if (workflowPolicy.requirePr && (!f.docs.prFieldExists || !f.docs.prStatusFieldExists)) {
      return tr(lang, 'cli', 'context.list.addPrMetadata');
    }
    if (workflowPolicy.requirePr && !f.pr.link) {
      return tr(lang, 'cli', 'context.list.recordPrLink');
    }
    if (workflowPolicy.requireReview && !f.pr.status) {
      return tr(lang, 'cli', 'context.list.setPrStatus');
    }
    if (workflowPolicy.requireReview && f.pr.status !== 'Approved') {
      return tr(lang, 'cli', 'context.list.prStatusToApproved', {
        status: f.pr.status,
      });
    }
    if (f.specStatus !== 'Approved') {
      return tr(lang, 'cli', 'context.list.approveSpec');
    }
    if (f.planStatus !== 'Approved') {
      return tr(lang, 'cli', 'context.list.approvePlan');
    }
  }

  return stepsMap[f.currentStep] || 'Unknown';
}

async function runContext(
  featureName: string | undefined,
  options: ContextOptions
): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);
  const lang = config?.lang ?? 'en';
  const workflowPolicy = resolveWorkflowPolicy(config?.workflow);

  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  if (options.execute && !options.approve) {
    throw createCliError(
      'APPROVAL_REQUIRED',
      '`--execute` requires `--approve <label>`.'
    );
  }

  const stepDefinitions = getStepDefinitions(lang, config.workflow);
  const stepsMap = getStepsMap(lang, config.workflow);
  const selectionOptions: ContextSelectionOptions = {
    repo: options.repo,
    all: options.all,
    done: options.done,
  };
  const state = await resolveContextState(config, featureName, selectionOptions);

  if (options.approve) {
    await runApprovedOption(
      state,
      config,
      lang,
      featureName,
      selectionOptions,
      options
    );
    return;
  }

  // 2. 결과 출력 (JSON)
  if (options.json) {
    const result = {
      status: state.status,
      reasonCode: toReasonCode(state.status),
      selectionMode: state.selectionMode,
      branches: state.branches,
      warnings: state.warnings,
      matchedFeature: state.matchedFeature,
      candidates: state.targetFeatures.length > 1 ? state.targetFeatures : [],
      // "Completed" now means workflow-done.
      completedCandidates: state.selectionMode === 'open' ? state.doneFeatures : [],
      openCandidates: state.selectionMode === 'open' ? state.openFeatures : [],
      inProgressCandidates:
        state.selectionMode === 'open' ? state.inProgressFeatures : [],
      readyToCloseCandidates:
        state.selectionMode === 'open' ? state.readyToCloseFeatures : [],
      actions: state.actions,
      actionOptions: state.actionOptions,
      workflowPolicy,
      checkPolicy: {
        docPath: '/docs/agents/agents.md',
        hint: tr(lang, 'cli', 'context.checkPolicyHint'),
        token: 'A',
        acceptedTokens: ['A', 'A OK'],
        tokenPattern: '^([A-Z]{1,2})(?:\\s+OK)?$',
        validLabels: state.actionOptions.map((o) => o.label),
        oneApprovalPerAction: true,
        requireFreshContext: true,
        contextVersion: state.contextVersion,
        config: config.approval ?? { mode: 'builtin' },
      },
      prPolicy: {
        screenshots: {
          upload: config.pr?.screenshots?.upload ?? false,
        },
      },
      recommendation: '',
    };

    if (result.status === 'multiple_active') {
      result.recommendation =
        'Multiple features detected. Please specify feature name (slug | F001 | F001-slug) or use --repo.';
    } else if (result.status === 'no_features') {
      result.recommendation = 'No features found. Create a feature first.';
    } else if (result.status === 'no_match') {
      result.recommendation = 'No features found.';
    } else {
      result.recommendation = state.targetFeatures[0].nextAction;
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 3. 결과 출력 (Text)
  console.log();
  console.log(chalk.bold(tr(lang, 'cli', 'context.header')));
  if (config.projectType === 'single') {
    if (state.branches.project.single) {
      console.log(
        chalk.gray(
          `   (Detected from Project Branch: ${state.branches.project.single})`
        )
      );
    }
  } else if (options.repo) {
    const branchName = state.branches.project[options.repo] || '';
    if (branchName) {
      console.log(
        chalk.gray(
          `   (Detected from Project Branch: ${options.repo.toUpperCase()} ${branchName})`
        )
      );
    }
  } else if (state.branches.project.fe || state.branches.project.be) {
    const parts = [
      state.branches.project.fe ? `FE ${state.branches.project.fe}` : null,
      state.branches.project.be ? `BE ${state.branches.project.be}` : null,
    ].filter(Boolean);
    console.log(chalk.gray(`   (Detected from Project Branch: ${parts.join(' / ')})`));
  }
  if (config.docsRepo === 'standalone' && state.branches.docs) {
    console.log(chalk.gray(`   (Docs Branch: ${state.branches.docs})`));
  }
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log();

  if (state.features.length === 0) {
    console.log(
      chalk.yellow(
        tr(lang, 'cli', 'context.noActiveFeatures')
      )
    );
    console.log();
    return;
  }

  if (state.warnings.length > 0) {
    console.log(chalk.yellow(tr(lang, 'cli', 'context.envWarnings')));
    state.warnings.forEach((w) => console.log(chalk.yellow(`   - ${w}`)));
    console.log();
  }

  if (state.targetFeatures.length > 1) {
    if (state.selectionMode === 'open') {
      console.log(
        chalk.gray(
          `   ${tr(lang, 'cli', 'context.openFallbackSummary', {
            inProgress: state.inProgressFeatures.length,
            readyToClose: state.readyToCloseFeatures.length,
            done: state.doneFeatures.length,
          })}`
        )
      );
      console.log();
    }
    if (state.selectionMode === 'open') {
      console.log(
        chalk.blue(
          `🔹 ${tr(lang, 'cli', 'context.sectionInProgress')} (${state.inProgressFeatures.length})`
        )
      );
      state.inProgressFeatures.forEach((f) => {
        const stepName = getListLabel(f, stepsMap, lang, workflowPolicy);
        const typeStr =
          config.projectType === 'fullstack' ? chalk.cyan(`(${f.type})`) : '';
        console.log(
          `   • ${chalk.bold(f.folderName)} ${typeStr} - ${chalk.yellow(stepName)}`
        );
      });

      console.log();
      console.log(
        chalk.blue(
          `🔸 ${tr(lang, 'cli', 'context.sectionReadyToClose')} (${state.readyToCloseFeatures.length})`
        )
      );
      state.readyToCloseFeatures.forEach((f) => {
        const stepName = getListLabel(f, stepsMap, lang, workflowPolicy);
        const typeStr =
          config.projectType === 'fullstack' ? chalk.cyan(`(${f.type})`) : '';
        console.log(
          `   • ${chalk.bold(f.folderName)} ${typeStr} - ${chalk.yellow(stepName)}`
        );
      });
    } else {
      const title =
        state.selectionMode === 'all'
          ? `🔹 ${state.targetFeatures.length} Features:`
          : state.selectionMode === 'done'
            ? `🔹 ${state.targetFeatures.length} Done Features:`
            : `🔹 ${state.targetFeatures.length} Features Detected:`;
      console.log(chalk.blue(title));
      console.log();
      state.targetFeatures.forEach((f) => {
        const stepName = getListLabel(f, stepsMap, lang, workflowPolicy);
        const typeStr =
          config.projectType === 'fullstack' ? chalk.cyan(`(${f.type})`) : '';
        console.log(
          `   • ${chalk.bold(f.folderName)} ${typeStr} - ${chalk.yellow(stepName)}`
        );
      });
    }

    console.log();
    console.log(chalk.gray(tr(lang, 'cli', 'context.tipDetails')));
    console.log(
      chalk.gray('   $ npx lee-spec-kit context <slug|F001|F001-slug> [--repo fe|be]')
    );
    if (state.selectionMode === 'open') {
      console.log(
        chalk.gray(
          `   $ npx lee-spec-kit context --all   # ${tr(lang, 'cli', 'context.tipShowAll')}`
        )
      );
      console.log(
        chalk.gray(
          `   $ npx lee-spec-kit context --done  # ${tr(lang, 'cli', 'context.tipShowDone')}`
        )
      );
    }
    console.log();
    return;
  }

  // Single Matched Feature
  const f = state.targetFeatures[0];
  const stepName = stepsMap[f.currentStep] || 'Unknown';

  const checkTag = (requiresUserCheck?: boolean): string =>
    requiresUserCheck
      ? chalk.yellow(tr(lang, 'cli', 'context.checkRequired'))
      : '';
  const hasCheckAction = (f.actions || []).some((a) => !!a.requiresUserCheck);

  console.log(
    `🔹 Feature: ${chalk.bold(f.folderName)} ${config.projectType === 'fullstack' ? chalk.cyan(`(${f.type})`) : ''}`
  );
  console.log(
    `   • Completion: ${f.completion.implementationDone ? chalk.green('Implementation ✅') : chalk.gray('Implementation ◯')} / ${f.completion.workflowDone ? chalk.green('Workflow ✅') : chalk.yellow('Workflow ◯')}`
  );
  if (f.issueNumber) {
    console.log(`   • Issue: #${f.issueNumber}`);
  }
  console.log(`   • Path: ${path.relative(cwd, f.path)}`);
  if (f.git.projectBranch) {
    console.log(`   • Project Branch: ${f.git.projectBranch}`);
  }

  console.log();
  console.log(
    `🔹 Progress: ${chalk.yellow(`Step ${f.currentStep}. ${stepName}`)}`
  );

  if (f.activeTask) {
    console.log(
      `   • Active Task: ${chalk.yellow(`[${f.activeTask.status}]`)} ${f.activeTask.title}`
    );
  } else if (f.nextTodoTask && f.currentStep === 10) {
    console.log(
      `   • Next TODO: ${chalk.gray(`[${f.nextTodoTask.status}]`)} ${f.nextTodoTask.title}`
    );
  }

  // 체크리스트 표시
  printChecklist(f, stepDefinitions);

  if (f.warnings.length > 0) {
    console.log();
    console.log(chalk.yellow('⚠️  Feature Warnings:'));
    f.warnings.forEach((w) => console.log(chalk.yellow(`   - ${w}`)));
  }

  console.log();
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  if (hasCheckAction) {
    console.log(chalk.gray(tr(lang, 'cli', 'context.checkPolicyHint')));
  }
  if (!f.actions || f.actions.length === 0) {
    console.log(`👉 Next Action: ${chalk.green(chalk.bold(f.nextAction))}`);
    console.log();
    return;
  }

  const actionOptions = toActionOptions(f.actions);
  console.log(chalk.green(chalk.bold('👉 Next Options (Atomic):')));
  let hasDocsCommand = false;
  actionOptions.forEach(({ label, action }) => {
    if (action.type === 'command') {
      console.log(
        `   ${label}. (${action.scope}) ${checkTag(action.requiresUserCheck)}${action.cmd}`
      );
      if (action.scope === 'docs') hasDocsCommand = true;
    } else {
      console.log(`   ${label}. ${checkTag(action.requiresUserCheck)}${action.message}`);
    }
  });
  if (hasDocsCommand) {
    console.log(chalk.gray(`   ↳ ${tr(lang, 'cli', 'context.tipDocsCommitRules')}`));
  }
  if (hasCheckAction) {
    console.log(chalk.gray(`   ↳ ${tr(lang, 'cli', 'context.actionOptionHint')}`));
  }
  console.log();
}

async function runApprovedOption(
  state: ResolvedContextState,
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  lang: 'ko' | 'en',
  featureName: string | undefined,
  selectionOptions: ContextSelectionOptions,
  options: ContextOptions
): Promise<void> {
  const approval = options.approve || '';
  const parsedLabel = parseApprovalLabel(approval);
  if (!parsedLabel) {
    throw createCliError(
      'INVALID_APPROVAL',
      'Invalid approval reply. Use `<label>` or `<label> OK` (e.g. `A`, `A OK`).'
    );
  }

  if (state.status !== 'single_matched' || !state.matchedFeature) {
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'Approval execution requires a single matched feature. Specify feature selector first.'
    );
  }

  if (state.actionOptions.length === 0) {
    throw createCliError('NO_ACTION_OPTIONS', 'No action options to approve.');
  }

  const selected = state.actionOptions.find((o) => o.label === parsedLabel);
  if (!selected) {
    throw createCliError(
      'INVALID_APPROVAL',
      `Unknown label "${parsedLabel}". Valid labels: ${listLabels(state.actionOptions)}`
    );
  }

  // Re-check right before execution/selection to avoid stale context approvals.
  const freshState = await resolveContextState(config, featureName, selectionOptions);
  if (freshState.contextVersion !== state.contextVersion) {
    throw createCliError(
      'CONTEXT_STALE',
      'Context changed since approval was requested. Run `context` again and re-approve.'
    );
  }

  const freshSelected = freshState.actionOptions.find(
    (o) => o.label === parsedLabel
  );
  if (!freshSelected) {
    throw createCliError(
      'ACTION_NOT_AVAILABLE',
      `Approved label "${parsedLabel}" is no longer available. Run \`context\` again.`
    );
  }

  const selectedAction = freshSelected.action;
  if (!options.execute) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            status: 'approved_selected',
            reasonCode: 'APPROVED_SELECTED',
            feature: freshState.matchedFeature?.folderName ?? null,
            label: parsedLabel,
            action: selectedAction,
            contextVersion: freshState.contextVersion,
            executable: selectedAction.type === 'command',
            oneApprovalPerAction: true,
          },
          null,
          2
        )
      );
      return;
    }

    console.log();
    console.log(chalk.green(`✅ Approved option: ${parsedLabel}`));
    console.log(chalk.gray(`   - Action: ${formatActionSummary(selectedAction)}`));
    if (selectedAction.type === 'command') {
      console.log(chalk.gray('   - Run with: --execute'));
    } else {
      console.log(chalk.gray('   - Instruction-only action (no command execution).'));
    }
    console.log();
    return;
  }

  if (selectedAction.type !== 'command') {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            status: 'approved_instruction',
            reasonCode: 'INSTRUCTION_ONLY',
            feature: freshState.matchedFeature?.folderName ?? null,
            label: parsedLabel,
            action: selectedAction,
            contextVersion: freshState.contextVersion,
            executed: false,
            reason: 'instruction_only',
          },
          null,
          2
        )
      );
      return;
    }

    console.log();
    console.log(chalk.yellow(`⚠️  Approved label ${parsedLabel} is instruction-only.`));
    console.log(chalk.gray(`   ${selectedAction.message}`));
    console.log();
    return;
  }

  if (!options.json) {
    console.log();
    console.log(chalk.blue(`▶ Executing option ${parsedLabel}...`));
    console.log(chalk.gray(`   ${selectedAction.cmd}`));
    console.log();
  }

  try {
    const execResult = executeCommandAction(selectedAction.cmd, !!options.json);
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            status: 'approved_executed',
            reasonCode: 'APPROVED_EXECUTED',
            feature: freshState.matchedFeature?.folderName ?? null,
            label: parsedLabel,
            action: selectedAction,
            contextVersion: freshState.contextVersion,
            executed: true,
            stdout: execResult.stdout?.trim() || undefined,
            stderr: execResult.stderr?.trim() || undefined,
          },
          null,
          2
        )
      );
      return;
    }
    console.log(chalk.green(`✅ Executed option ${parsedLabel}.`));
    console.log();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createCliError(
      'EXECUTION_FAILED',
      `Failed to execute option ${parsedLabel}: ${message}`
    );
  }
}

function printChecklist(f: FeatureContext, stepDefinitions: StepDefinition[]): void {
  const checklistSteps = [...stepDefinitions].sort((a, b) => a.step - b.step);

  checklistSteps.forEach((definition) => {
    const done = definition.checklist.done(f);
    const detail = definition.checklist.detail?.(f) ?? '';
    const mark = done ? chalk.green('✅') : chalk.gray('◯');
    const label =
      definition.step === f.currentStep
        ? chalk.bold(definition.name)
        : definition.name;
    console.log(`   ${mark} ${definition.step}. ${label} ${detail}`);
  });
}

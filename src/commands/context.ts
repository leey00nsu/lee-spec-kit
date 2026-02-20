import * as presenter from '../services/ContextPresenter.js';
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { execSync } from 'child_process';
import { getConfig } from '../utils/config.js';
import { createCliContext } from '../utils/cli-context.js';
import { parseApprovalReply } from '../utils/context/approval-reply.js';
import {
  consumeApprovalTicket,
  issueApprovalTicket,
  toApprovalActionHash,
} from '../utils/context/approval-ticket.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  resolvePrePrReviewPolicy,
  resolveTaskCommitGatePolicy,
  resolveWorkflowPolicy,
} from '../utils/workflow.js';
import {
  getDocsLockPath,
  getProjectExecutionLockPath,
  withFileLock,
} from '../utils/lock.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import {
  ACTION_CATEGORIES,
  FeatureContext,
  getStepDefinitions,
  getStepsMap,
  StepDefinition,
} from '../utils/context.js';
import {
  ActionOption,
  ContextSelectionOptions,
  ContextSelectionState,
  toReasonCode,
} from '../utils/context-selection.js';

interface ContextOptions {
  json?: boolean;
  jsonCompact?: boolean;
  component?: string;
  all?: boolean;
  done?: boolean;
  approve?: string;
  ticket?: string;
  execute?: boolean;
  executeStrict?: boolean;
}

type CommandAction = Extract<ActionOption['action'], { type: 'command' }>;
type ResolvedContextState = ContextSelectionState;

function executeCommandAction(
  cmd: string,
  jsonMode: boolean,
  cwd?: string
): { stdout?: string; stderr?: string } {
  const shellPath =
    process.env.SHELL ||
    (process.platform === 'win32'
      ? process.env.ComSpec || 'cmd.exe'
      : '/bin/sh');

  if (jsonMode) {
    const stdout = execSync(cmd, {
      shell: shellPath,
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout };
  }

  execSync(cmd, {
    shell: shellPath,
    cwd,
    stdio: 'inherit',
  });
  return {};
}

function getCommandExecutionLockPath(
  action: CommandAction,
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>
): string {
  if (action.scope === 'docs') {
    return getDocsLockPath(config.docsDir);
  }
  return getProjectExecutionLockPath(action.cwd);
}

export function contextCommand(program: Command): void {
  program
    .command('context [feature-name]')
    .description('Show current feature context and next actions')
    .option('--json', 'Output in JSON format for agents')
    .option(
      '--json-compact',
      'Output compact JSON for agents (implies --json, reduced duplication)'
    )
    .option('--component <component>', 'Component name for multi projects')
    .option('--all', 'Include completed features when auto-detecting')
    .option('--done', 'Show completed (workflow-done) features only')
    .option(
      '--approve <reply>',
      'Approve one labeled option (examples: A, A OK, A proceed, A 진행해)'
    )
    .option(
      '--ticket <token>',
      'Approval ticket issued by `--approve` (required only when selected option requires user check)'
    )
    .option(
      '--execute',
      'Execute approved option when it is a command (ticket required only for check-required options)'
    )
    .option(
      '--execute-strict',
      'Fail when approved option is instruction-only (use with --execute)'
    )
    .action(
      async (featureName: string | undefined, options: ContextOptions) => {
        try {
          await runContext(featureName, options);
        } catch (error) {
          const config = await getConfig(process.cwd());
          const lang = config?.lang ?? DEFAULT_LANG;
          const cliError = toCliError(error);
          const suggestions = getCliErrorSuggestions(cliError.code, lang);
          if (options.json || options.jsonCompact) {
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
          process.exitCode = 1;
          return;
        }
      }
    );
}

async function runContext(
  featureName: string | undefined,
  options: ContextOptions
): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);
  const lang = config?.lang ?? 'en';
  const workflowPolicy = resolveWorkflowPolicy(config?.workflow);
  const prePrReviewPolicy = resolvePrePrReviewPolicy(config?.workflow);
  const taskCommitGatePolicy = resolveTaskCommitGatePolicy(config?.workflow);

  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  if (options.execute && !options.approve) {
    throw createCliError(
      'APPROVAL_REQUIRED',
      '`--execute` requires `--approve <reply>`.'
    );
  }

  if (!options.execute && options.ticket) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--ticket` is only valid with `--execute`.'
    );
  }

  if (options.executeStrict && !options.execute) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--execute-strict` requires `--execute`.'
    );
  }

  const selectedComponent = (options.component || '').trim().toLowerCase();

  const ctx = (await createCliContext({ cwd }))!;

  const stepDefinitions = getStepDefinitions(ctx);
  const stepsMap = getStepsMap(ctx);
  const selectionOptions: ContextSelectionOptions = {
    component: selectedComponent || undefined,
    all: options.all,
    done: options.done,
  };
  const state = await presenter.resolveContextState(
    ctx,
    featureName,
    selectionOptions
  );
  const requiredDocs = presenter.buildRequiredDocHints(state.actionOptions);
  const suggestionOptions = presenter.buildSuggestionOptions(
    lang,
    state,
    config.projectType,
    selectedComponent
  );
  const suggestionFinalPrompt = presenter.buildSuggestionFinalPrompt(
    lang,
    suggestionOptions
  );
  const checkRequiredLabels = state.actionOptions
    .filter((option) => !!option.action.requiresUserCheck)
    .map((option) => option.label);
  const checkRequiredCategories = [
    ...new Set(
      state.actionOptions
        .filter((option) => !!option.action.requiresUserCheck)
        .map((option) => option.action.category || 'uncategorized')
    ),
  ];
  const approvalRequired = checkRequiredLabels.length > 0;
  const finalApprovalPrompt = approvalRequired
    ? presenter.buildFinalApprovalPrompt(lang, state.actionOptions)
    : '';
  const approvalUserFacingLines = approvalRequired
    ? [
        ...state.actionOptions.map((o) => o.approvalPrompt),
        finalApprovalPrompt,
      ].filter((line) => line.length > 0)
    : [];
  const autoRunPlan = presenter.resolveAutoRunPlan(
    lang,
    state,
    featureName,
    selectedComponent,
    config.approval,
    approvalRequired
  );
  const agentOrchestration = presenter.buildAgentOrchestrationPolicy(
    state.actionOptions,
    autoRunPlan.available,
    autoRunPlan.command,
    state.matchedFeature?.folderName || null
  );

  if (options.approve || options.execute) {
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

  const jsonMode = !!options.json || !!options.jsonCompact;

  // 2. 결과 출력 (JSON)
  if (jsonMode) {
    const primaryAction = state.actionOptions[0] ?? null;
    const approveCommand = presenter.buildApprovalCommand(
      state,
      featureName,
      selectedComponent,
      false
    );
    const executeCommand = presenter.buildApprovalCommand(
      state,
      featureName,
      selectedComponent,
      true
    );
    const recommendation = presenter.resolveContextRecommendation(
      state,
      config.projectType,
      selectedComponent
    );
    const activeCategories = presenter.listActiveCategories(
      state.actionOptions
    );
    const uncategorizedLabels = presenter.listUncategorizedLabels(
      state.actionOptions
    );

    if (options.jsonCompact) {
      const compactResult = {
        schema: 'context.v2.compact',
        status: state.status,
        reasonCode: toReasonCode(state.status),
        selectionMode: state.selectionMode,
        selectionFallback: state.selectionFallback,
        branches: state.branches,
        warnings: state.warnings,
        contextVersion: state.contextVersion,
        matchedFeature: presenter.toCompactFeature(state.matchedFeature),
        candidateRefs:
          state.targetFeatures.length > 1
            ? state.targetFeatures.map((feature) =>
                presenter.getFeatureRef(feature)
              )
            : [],
        completedCandidateRefs:
          state.selectionMode === 'open'
            ? state.doneFeatures.map((feature) =>
                presenter.getFeatureRef(feature)
              )
            : [],
        openCandidateRefs:
          state.selectionMode === 'open'
            ? state.openFeatures.map((feature) =>
                presenter.getFeatureRef(feature)
              )
            : [],
        inProgressCandidateRefs:
          state.selectionMode === 'open'
            ? state.inProgressFeatures.map((feature) =>
                presenter.getFeatureRef(feature)
              )
            : [],
        readyToCloseCandidateRefs:
          state.selectionMode === 'open'
            ? state.readyToCloseFeatures.map((feature) =>
                presenter.getFeatureRef(feature)
              )
            : [],
        actionOptions: state.actionOptions.map((option) =>
          presenter.toCompactActionOption(option)
        ),
        suggestionOptions: suggestionOptions.map((option) =>
          presenter.toCompactSuggestionOption(option)
        ),
        primaryActionLabel: primaryAction?.label ?? null,
        workflowPolicy,
        taskCommitGatePolicy,
        prePrReviewPolicy,
        checkPolicy: {
          docPath: 'builtin://agents/policy',
          token: '<LABEL>',
          acceptedTokens: [
            '<LABEL>',
            '<LABEL> OK',
            '<LABEL> ...',
            '... <LABEL> ...',
          ],
          tokenPattern: '^.*\\b([A-Z]+)\\b.*$',
          validLabels: state.actionOptions.map((o) => o.label),
          activeCategories,
          knownCategories: ACTION_CATEGORIES,
          uncategorizedLabels,
          checkRequiredLabels,
          checkRequiredCategories,
          approvalRequired,
          categoryPolicyGuidance:
            'For approval.mode="category", match against `actionOptions[].category`.',
          oneApprovalPerAction: approvalRequired,
          requireFreshContext: true,
          contextVersion: state.contextVersion,
          config: config.approval ?? { mode: 'builtin' },
        },
        agentOrchestration,
        autoRun: {
          available: autoRunPlan.available,
          reasonCode: autoRunPlan.reasonCode,
          summary: autoRunPlan.summary,
          command: autoRunPlan.command,
          untilCategories: autoRunPlan.untilCategories,
          unknownCategories: autoRunPlan.unknownCategories,
        },
        approvalRequest: {
          required: approvalRequired,
          finalPrompt: finalApprovalPrompt,
          userFacingLines: approvalUserFacingLines,
          labels: approvalRequired
            ? state.actionOptions.map((o) => o.label)
            : [],
          approveCommand,
          executeCommand,
          executeRequiresTicket:
            !!state.actionOptions[0]?.action?.requiresUserCheck,
        },
        suggestionRequest: {
          finalPrompt: suggestionFinalPrompt,
          userFacingLines: [
            ...suggestionOptions.map((o) => `${o.label}: ${o.summary}`),
            suggestionFinalPrompt,
          ].filter((line) => line.length > 0),
          labels: suggestionOptions.map((o) => o.label),
        },
        prPolicy: {
          screenshots: {
            upload: config.pr?.screenshots?.upload ?? false,
          },
        },
        requiredDocs,
        recommendation,
      };
      console.log(JSON.stringify(compactResult, null, 2));
      return;
    }

    const result = {
      status: state.status,
      reasonCode: toReasonCode(state.status),
      selectionMode: state.selectionMode,
      selectionFallback: state.selectionFallback,
      branches: state.branches,
      warnings: state.warnings,
      matchedFeature: state.matchedFeature,
      candidates: state.targetFeatures.length > 1 ? state.targetFeatures : [],
      // "Completed" now means workflow-done.
      completedCandidates:
        state.selectionMode === 'open' ? state.doneFeatures : [],
      openCandidates: state.selectionMode === 'open' ? state.openFeatures : [],
      inProgressCandidates:
        state.selectionMode === 'open' ? state.inProgressFeatures : [],
      readyToCloseCandidates:
        state.selectionMode === 'open' ? state.readyToCloseFeatures : [],
      actions: state.actions,
      actionOptions: state.actionOptions,
      suggestionOptions,
      primaryActionLabel: primaryAction?.label ?? null,
      primaryActionType: primaryAction?.action.type ?? null,
      primaryActionCategory: primaryAction?.action.category ?? null,
      primaryActionOperationType: primaryAction?.action.operationType ?? null,
      workflowPolicy,
      taskCommitGatePolicy,
      prePrReviewPolicy,
      checkPolicy: {
        docPath: 'builtin://agents/policy',
        hint: tr(lang, 'cli', 'context.checkPolicyHint'),
        policyOnly: true,
        token: '<LABEL>',
        acceptedTokens: [
          '<LABEL>',
          '<LABEL> OK',
          '<LABEL> ...',
          '... <LABEL> ...',
        ],
        tokenPattern: '^.*\\b([A-Z]+)\\b.*$',
        validLabels: state.actionOptions.map((o) => o.label),
        activeCategories,
        knownCategories: ACTION_CATEGORIES,
        uncategorizedLabels,
        checkRequiredLabels,
        checkRequiredCategories,
        approvalRequired,
        categoryPolicyGuidance:
          'For approval.mode="category", match against `actionOptions[].category`.',
        requireExplanationBeforeApproval: approvalRequired,
        requiredExplanationFields: approvalRequired
          ? [
              'actionOptions[].label',
              'actionOptions[].detail',
              'actionOptions[].approvalPrompt',
            ]
          : [],
        recommendation:
          'Before asking for approval, show only `actionOptions[].approvalPrompt` lines and `approvalRequest.finalPrompt` to the user. Keep `requiredDocs`, `checkPolicy`, and raw execution commands as internal guidance. For commit actions, include scope (`docs`/`project`) and commit message in the visible prompt. User replies should include the label token (e.g. `A`, `A OK`, `A proceed`, `A 진행해`). For command execution, prefer one-shot `npx lee-spec-kit flow <featureRef> --approve <LABEL> --execute` to avoid session mismatch after context compression/reset. Use ticket-based `context --execute --ticket` only when explicitly needed. Use main-agent orchestration: keep short steps in main agent. Delegate command runs only when `agentOrchestration.currentActionShouldDelegate=true`, and delegate auto-run only when `agentOrchestration.subAgentHandoff.required=true` with `mode="auto_run"`.',
        oneApprovalPerAction: approvalRequired,
        requireFreshContext: true,
        contextVersion: state.contextVersion,
        config: config.approval ?? { mode: 'builtin' },
      },
      agentOrchestration,
      autoRun: {
        available: autoRunPlan.available,
        reasonCode: autoRunPlan.reasonCode,
        summary: autoRunPlan.summary,
        command: autoRunPlan.command,
        untilCategories: autoRunPlan.untilCategories,
        unknownCategories: autoRunPlan.unknownCategories,
        guidance:
          'Use auto-run only when `autoRun.available=true`. Do not treat `autoRun.available` alone as a delegation trigger; use `agentOrchestration.subAgentHandoff.required` + `mode="auto_run"` for actual delegation. Stop and request approval when `approvalRequest.required=true` or when auto mode reaches configured gate categories.',
      },
      approvalRequest: {
        guidance:
          'User-facing output must include only approval prompts (`A: ...`) and `finalPrompt`. Do not expose `requiredDocs`, `checkPolicy`, or raw `cmd` unless explicitly requested. For approved command actions, prefer one-shot `flow --approve <LABEL> --execute`. Keep short steps in main agent. Delegate command runs only when `agentOrchestration.currentActionShouldDelegate=true`, and delegate auto-run only when `agentOrchestration.subAgentHandoff.required=true` with `mode="auto_run"`.',
        required: approvalRequired,
        finalPrompt: finalApprovalPrompt,
        userFacingLines: approvalUserFacingLines,
        labels: approvalRequired ? state.actionOptions.map((o) => o.label) : [],
        approveCommand,
        executeCommand,
        executeRequiresTicket:
          !!state.actionOptions[0]?.action?.requiresUserCheck,
        options: state.actionOptions.map((o) => ({
          label: o.label,
          summary: o.summary,
          detail: o.detail,
          approvalPrompt: o.approvalPrompt,
          requiresRequestText: o.requiresRequestText,
          replyExample: o.replyExample,
          actionType: o.action.type,
          category: o.action.category,
          scope: o.action.type === 'command' ? o.action.scope : undefined,
          cwd: o.action.type === 'command' ? o.action.cwd : undefined,
          cmd: o.action.type === 'command' ? o.action.cmd : undefined,
          message:
            o.action.type === 'instruction' ? o.action.message : undefined,
          requiresUserCheck: !!o.action.requiresUserCheck,
          executeRequiresTicket: !!o.action.requiresUserCheck,
          operationType: o.action.operationType,
        })),
      },
      suggestionRequest: {
        guidance:
          'When `actionOptions` is empty, present `suggestionOptions` as user-facing next choices. Keep command strings internal unless the user asks for executable commands.',
        finalPrompt: suggestionFinalPrompt,
        userFacingLines: [
          ...suggestionOptions.map((o) => `${o.label}: ${o.summary}`),
          suggestionFinalPrompt,
        ].filter((line) => line.length > 0),
        labels: suggestionOptions.map((o) => o.label),
        options: suggestionOptions.map((o) => ({
          label: o.label,
          summary: o.summary,
          detail: o.detail,
          command: o.command,
        })),
      },
      prPolicy: {
        screenshots: {
          upload: config.pr?.screenshots?.upload ?? false,
        },
      },
      requiredDocs,
      recommendation,
    };

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
  } else if (selectedComponent) {
    const branchName = state.branches.project[selectedComponent] || '';
    if (branchName) {
      console.log(
        chalk.gray(
          `   (Detected from Project Branch: ${selectedComponent.toUpperCase()} ${branchName})`
        )
      );
    }
  } else {
    const parts = Object.entries(state.branches.project)
      .filter(([key, value]) => key !== 'single' && !!value)
      .map(([key, value]) => `${key.toUpperCase()} ${value}`);
    if (parts.length > 0) {
      console.log(
        chalk.gray(`   (Detected from Project Branch: ${parts.join(' / ')})`)
      );
    }
  }
  if (config.docsRepo === 'standalone' && state.branches.docs) {
    console.log(chalk.gray(`   (Docs Branch: ${state.branches.docs})`));
  }
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log();

  if (state.features.length === 0) {
    console.log(chalk.yellow(tr(lang, 'cli', 'context.noActiveFeatures')));
    console.log();
    presenter.printSuggestionOptions(lang, suggestionOptions);
    console.log();
    return;
  }

  if (state.warnings.length > 0) {
    console.log(chalk.yellow(tr(lang, 'cli', 'context.envWarnings')));
    state.warnings.forEach((w) => console.log(chalk.yellow(`   - ${w}`)));
    console.log();
  }

  if (state.targetFeatures.length === 0) {
    console.log(chalk.yellow(tr(lang, 'cli', 'context.noActiveFeatures')));
    if (state.status === 'no_open') {
      console.log(
        chalk.gray(
          `   $ npx lee-spec-kit context --done  # ${tr(lang, 'cli', 'context.tipShowDone')}`
        )
      );
      console.log(
        chalk.gray(
          `   $ npx lee-spec-kit context --all   # ${tr(lang, 'cli', 'context.tipShowAll')}`
        )
      );
    }
    console.log();
    presenter.printSuggestionOptions(lang, suggestionOptions);
    console.log();
    return;
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
        const stepName = presenter.getListLabel(
          f,
          stepsMap,
          lang,
          workflowPolicy,
          prePrReviewPolicy
        );
        const typeStr =
          config.projectType === 'multi' ? chalk.cyan(`(${f.type})`) : '';
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
        const stepName = presenter.getListLabel(
          f,
          stepsMap,
          lang,
          workflowPolicy,
          prePrReviewPolicy
        );
        const typeStr =
          config.projectType === 'multi' ? chalk.cyan(`(${f.type})`) : '';
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
        const stepName = presenter.getListLabel(
          f,
          stepsMap,
          lang,
          workflowPolicy,
          prePrReviewPolicy
        );
        const typeStr =
          config.projectType === 'multi' ? chalk.cyan(`(${f.type})`) : '';
        console.log(
          `   • ${chalk.bold(f.folderName)} ${typeStr} - ${chalk.yellow(stepName)}`
        );
      });
    }

    console.log();
    console.log(chalk.gray(tr(lang, 'cli', 'context.tipDetails')));
    const selectorTip =
      config.projectType === 'multi'
        ? selectedComponent
          ? `   $ npx lee-spec-kit context <slug|F001|F001-slug> --component ${selectedComponent}`
          : '   $ npx lee-spec-kit context <slug|F001|F001-slug> [--component <component>]'
        : '   $ npx lee-spec-kit context <slug|F001|F001-slug>';
    console.log(chalk.gray(selectorTip));
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
    presenter.printSuggestionOptions(lang, suggestionOptions);
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
  const hasCheckAction = approvalRequired;

  console.log(
    `🔹 Feature: ${chalk.bold(f.folderName)} ${config.projectType === 'multi' ? chalk.cyan(`(${f.type})`) : ''}`
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

  const actionOptions = state.actionOptions;
  const hasCommandOption = actionOptions.some(
    (option) => option.action.type === 'command'
  );
  const longRunningDelegation =
    presenter.shouldDelegateCurrentAction(actionOptions);
  const showOptionLabels = hasCheckAction;
  console.log(chalk.green(chalk.bold('👉 Next Options (Atomic):')));
  let hasDocsCommand = false;
  actionOptions.forEach((option) => {
    const requiresCheck = option.action.requiresUserCheck;
    const detail = option.detail;
    const prefix = showOptionLabels ? `${option.label}. ` : '- ';
    console.log(`   ${prefix}${checkTag(requiresCheck)}${detail}`);
    if (option.action.type === 'command' && option.action.scope === 'docs') {
      hasDocsCommand = true;
    }
  });
  if (hasDocsCommand) {
    console.log(
      chalk.gray(`   ↳ ${tr(lang, 'cli', 'context.tipDocsCommitRules')}`)
    );
  }
  if (hasCommandOption && longRunningDelegation.shouldDelegate) {
    console.log(
      chalk.gray(`   ↳ ${tr(lang, 'cli', 'context.subAgentOrchestrationHint')}`)
    );
  }
  if (hasCheckAction) {
    console.log(
      chalk.gray(`   ↳ ${tr(lang, 'cli', 'context.actionOptionHint')}`)
    );
    console.log(
      chalk.gray(`   ↳ ${tr(lang, 'cli', 'context.actionExplainHint')}`)
    );
  }
  if (requiredDocs.length > 0) {
    for (const requiredDoc of requiredDocs) {
      console.log(
        chalk.gray(
          `   ↳ ${tr(lang, 'cli', 'context.readBuiltinDocFirst', {
            command: requiredDoc.command,
          })}`
        )
      );
    }
  }
  if (autoRunPlan.available) {
    console.log(chalk.gray(`   ↳ ${autoRunPlan.summary}`));
    console.log(
      chalk.gray(
        `   ↳ ${tr(lang, 'cli', 'context.autoRunCommandHint', {
          command: autoRunPlan.command,
        })}`
      )
    );
  }
  if (actionOptions.length > 0 && hasCheckAction) {
    const approveCommand = presenter.buildApprovalCommand(
      state,
      featureName,
      selectedComponent,
      false
    );
    const executeCommand = presenter.buildApprovalCommand(
      state,
      featureName,
      selectedComponent,
      true
    );
    console.log(chalk.cyan(`   ↳ ${finalApprovalPrompt}`));
    console.log(
      chalk.gray(
        `   ↳ ${tr(lang, 'cli', 'context.finalLabelCommandHint', {
          command: approveCommand,
        })}`
      )
    );
    console.log(
      chalk.gray(
        `   ↳ ${tr(lang, 'cli', 'context.finalTicketCommandHint', {
          command: executeCommand,
        })}`
      )
    );
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
  const ticketToken = (options.ticket || '').trim();
  const jsonMode = !!options.json || !!options.jsonCompact;
  let parsedLabel: string | null = null;
  let userRequest: string | undefined;

  if (state.status !== 'single_matched' || !state.matchedFeature) {
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'Approval execution requires a single matched feature. Specify feature selector first.'
    );
  }

  if (state.actionOptions.length === 0) {
    throw createCliError('NO_ACTION_OPTIONS', 'No action options to approve.');
  }

  const parsedApproval = parseApprovalReply(
    approval,
    state.actionOptions.map((o) => o.label)
  );
  parsedLabel = parsedApproval?.label ?? null;
  if (!parsedLabel) {
    throw createCliError(
      'INVALID_APPROVAL',
      tr(lang, 'cli', 'cliError.invalidApproval.replyWithValidLabel')
    );
  }

  const selected = state.actionOptions.find((o) => o.label === parsedLabel);
  if (!selected) {
    throw createCliError(
      'INVALID_APPROVAL',
      `Unknown label "${parsedLabel}". Valid labels: ${presenter.listLabels(state.actionOptions)}`
    );
  }

  // Re-check right before execution/selection to avoid stale context approvals.
  const cwd = process.cwd();
  const ctx = (await createCliContext({ cwd }))!;
  const freshState = await presenter.resolveContextState(
    ctx,
    featureName,
    selectionOptions
  );
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

  if (!freshState.matchedFeature || !freshState.contextVersion) {
    throw createCliError(
      'CONTEXT_STALE',
      'Context changed since approval was requested. Run `context` again and re-approve.'
    );
  }

  const selectedAction = freshSelected.action;
  if (selectedAction.category === 'user_request_replan') {
    const requestText = parsedApproval?.requestText?.trim();
    if (!requestText) {
      throw createCliError(
        'INVALID_APPROVAL',
        tr(lang, 'cli', 'cliError.invalidApproval.userRequestRequired', {
          label: parsedLabel,
          example: `${parsedLabel}, <your request>`,
        })
      );
    }
    userRequest = requestText;
  }
  const executeRequiresTicket = !!selectedAction.requiresUserCheck;
  const actionHash = toApprovalActionHash({
    label: freshSelected.label,
    action: freshSelected.action,
  });
  const featureRef = freshState.matchedFeature.folderName;

  if (!options.execute) {
    const ticket = executeRequiresTicket
      ? await issueApprovalTicket(config, {
          contextVersion: freshState.contextVersion,
          actionHash,
          label: parsedLabel,
          featureRef,
        })
      : null;
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            status: 'approved_selected',
            reasonCode: 'APPROVED_SELECTED',
            feature: freshState.matchedFeature?.folderName ?? null,
            label: parsedLabel,
            action: selectedAction,
            userRequest,
            contextVersion: freshState.contextVersion,
            executable: selectedAction.type === 'command',
            executeRequiresTicket,
            oneApprovalPerAction: executeRequiresTicket,
            approvalTicket: ticket
              ? {
                  token: ticket.token,
                  sessionId: ticket.sessionId,
                  label: ticket.label,
                  contextVersion: ticket.contextVersion,
                  actionHash: ticket.actionHash,
                  expiresAt: ticket.expiresAt,
                  oneTime: true,
                }
              : undefined,
          },
          null,
          2
        )
      );
      return;
    }

    console.log();
    console.log(chalk.green(`✅ Approved option: ${parsedLabel}`));
    console.log(chalk.gray(`   - Action: ${freshSelected.detail}`));
    if (userRequest) {
      console.log(chalk.gray(`   - User request: ${userRequest}`));
    }
    if (selectedAction.type === 'command') {
      const selectedComponent = selectionOptions.component || '';
      let executeCommand = presenter
        .buildApprovalCommand(freshState, featureName, selectedComponent, true)
        .replace('<LABEL>', parsedLabel);
      if (ticket) {
        executeCommand = executeCommand.replace(
          '[--ticket <TICKET>]',
          `--ticket ${ticket.token}`
        );
        console.log(
          chalk.gray(
            `   - Ticket: ${ticket.token} (expires: ${ticket.expiresAt})`
          )
        );
      } else {
        executeCommand = executeCommand.replace(' [--ticket <TICKET>]', '');
      }
      console.log(chalk.gray(`   - Run with: ${executeCommand}`));
    } else {
      console.log(
        chalk.gray('   - Instruction-only action (no command execution).')
      );
    }
    console.log();
    return;
  }

  if (!ticketToken) {
    if (executeRequiresTicket) {
      throw createCliError(
        'APPROVAL_REQUIRED',
        '`--execute` requires `--ticket <token>` for check-required options. Run `context --approve <reply>` first.'
      );
    }
  }

  if (executeRequiresTicket) {
    await consumeApprovalTicket(config, ticketToken, {
      contextVersion: freshState.contextVersion,
      actionHash,
      label: parsedLabel,
      featureRef,
    });
  }

  if (selectedAction.type !== 'command') {
    if (options.executeStrict) {
      throw createCliError(
        'EXECUTION_NOT_COMMAND',
        `Approved label "${parsedLabel}" is instruction-only. Re-run without \`--execute\` or pick a command option.`
      );
    }
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            status: 'approved_instruction',
            reasonCode: 'INSTRUCTION_ONLY',
            feature: freshState.matchedFeature?.folderName ?? null,
            label: parsedLabel,
            action: selectedAction,
            userRequest,
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
    console.log(
      chalk.yellow(`⚠️  Approved label ${parsedLabel} is instruction-only.`)
    );
    if (userRequest) {
      console.log(chalk.gray(`   User request: ${userRequest}`));
    }
    console.log(chalk.gray(`   ${selectedAction.message}`));
    console.log();
    return;
  }

  if (!jsonMode) {
    console.log();
    console.log(chalk.blue(`▶ Executing option ${parsedLabel}...`));
    console.log(chalk.gray(`   ${selectedAction.cmd}`));
    console.log();
  }

  try {
    const lockPath = getCommandExecutionLockPath(selectedAction, config);
    const execResult = await withFileLock(
      lockPath,
      async () =>
        executeCommandAction(selectedAction.cmd, jsonMode, selectedAction.cwd),
      { owner: `context-execute:${selectedAction.scope}` }
    );
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            status: 'approved_executed',
            reasonCode: 'APPROVED_EXECUTED',
            feature: freshState.matchedFeature?.folderName ?? null,
            label: parsedLabel,
            action: selectedAction,
            userRequest,
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

function printChecklist(
  f: FeatureContext,
  stepDefinitions: StepDefinition[]
): void {
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

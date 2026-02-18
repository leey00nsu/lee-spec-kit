import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { execSync } from 'child_process';
import { getConfig } from '../utils/config.js';
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
  resolveContextSelection,
  toReasonCode,
} from '../utils/context-selection.js';
import { parseApprovalReply } from '../utils/context/approval-reply.js';
import {
  consumeApprovalTicket,
  issueApprovalTicket,
  toApprovalActionHash,
} from '../utils/context/approval-ticket.js';
import {
  BuiltinDocId,
  getRecommendedDocIdsForCategories,
  toBuiltinDocCommand,
} from '../utils/builtin-docs.js';

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
interface RequiredDocHint {
  id: BuiltinDocId;
  command: string;
}

interface SuggestionOption {
  label: string;
  summary: string;
  detail: string;
  command: string;
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
  return resolveContextSelection(config, featureName, options);
}

function listLabels(actionOptions: ActionOption[]): string {
  if (actionOptions.length === 0) return '-';
  return actionOptions.map((o) => o.label).join(', ');
}

function listSuggestionLabels(suggestionOptions: SuggestionOption[]): string {
  if (suggestionOptions.length === 0) return '-';
  return suggestionOptions.map((o) => o.label).join(', ');
}

function listActiveCategories(actionOptions: ActionOption[]): string[] {
  const unique = new Set<string>();
  for (const option of actionOptions) {
    if (option.action.category) unique.add(option.action.category);
  }
  return Array.from(unique);
}

function listUncategorizedLabels(actionOptions: ActionOption[]): string[] {
  return actionOptions
    .filter((option) => !option.action.category)
    .map((option) => option.label);
}

function resolveFeatureRefForApproval(
  state: ResolvedContextState,
  featureName: string | undefined
): string {
  const raw =
    featureName?.trim() ||
    state.matchedFeature?.folderName ||
    '<slug|F001|F001-slug>';
  return raw;
}

function buildApprovalCommand(
  state: ResolvedContextState,
  featureName: string | undefined,
  selectedComponent: string,
  execute: boolean
): string {
  const featureRef = resolveFeatureRefForApproval(state, featureName);
  const componentArg = selectedComponent ? ` --component ${selectedComponent}` : '';
  if (execute) {
    return `npx lee-spec-kit context ${featureRef}${componentArg} --approve <LABEL> --execute [--ticket <TICKET>]`;
  }
  return `npx lee-spec-kit context ${featureRef}${componentArg} --approve <LABEL>`;
}

function buildFinalApprovalPrompt(
  lang: 'ko' | 'en',
  actionOptions: ActionOption[]
): string {
  if (actionOptions.length === 0) return '';
  const labels = listLabels(actionOptions);
  const example = actionOptions[0]?.replyExample || `${actionOptions[0]?.label || 'A'} OK`;
  const requestExamples = actionOptions
    .filter((option) => option.requiresRequestText)
    .map((option) => `\`${option.replyExample}\``);
  if (requestExamples.length === 0) {
    return tr(lang, 'cli', 'context.finalLabelPrompt', {
      labels,
      example,
    });
  }
  return tr(lang, 'cli', 'context.finalLabelPromptWithRequest', {
    labels,
    example,
    requestExamples: requestExamples.join(', '),
  });
}

function buildSuggestionFinalPrompt(
  lang: 'ko' | 'en',
  suggestionOptions: SuggestionOption[]
): string {
  if (suggestionOptions.length === 0) return '';
  const labels = listSuggestionLabels(suggestionOptions);
  const example = suggestionOptions[0]?.label || 'A';
  return tr(lang, 'cli', 'context.suggestionFinalPrompt', {
    labels,
    example,
  });
}

function toSuggestionLabel(index: number): string {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function buildSuggestionOptions(
  lang: 'ko' | 'en',
  state: ResolvedContextState,
  projectType: 'single' | 'multi',
  selectedComponent: string
): SuggestionOption[] {
  const componentArg = selectedComponent ? ` --component ${selectedComponent}` : '';
  const createFeatureCommand =
    projectType === 'multi'
      ? selectedComponent
        ? `npx lee-spec-kit feature <name> --component ${selectedComponent}`
        : 'npx lee-spec-kit feature <name> --component <component>'
      : 'npx lee-spec-kit feature <name>';
  const selectFeatureCommand =
    projectType === 'multi'
      ? selectedComponent
        ? `npx lee-spec-kit context <slug|F001|F001-slug> --component ${selectedComponent}`
        : 'npx lee-spec-kit context <slug|F001|F001-slug> --component <component>'
      : 'npx lee-spec-kit context <slug|F001|F001-slug>';
  const showDoneCommand = `npx lee-spec-kit context --done${componentArg}`;
  const showAllCommand = `npx lee-spec-kit context --all${componentArg}`;
  const showOpenCommand = `npx lee-spec-kit context${componentArg}`;
  const runOnboardCommand = 'npx lee-spec-kit onboard --strict';

  const rawSuggestions: Array<{ summary: string; command: string }> = [];
  switch (state.status) {
    case 'no_features':
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.runOnboard'),
        command: runOnboardCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.createFeature'),
        command: createFeatureCommand,
      });
      break;
    case 'no_open':
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showDone'),
        command: showDoneCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.createFeature'),
        command: createFeatureCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showAll'),
        command: showAllCommand,
      });
      break;
    case 'multiple_active':
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.selectFeature'),
        command: selectFeatureCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showAll'),
        command: showAllCommand,
      });
      break;
    case 'no_match':
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showOpen'),
        command: showOpenCommand,
      });
      rawSuggestions.push({
        summary: tr(lang, 'cli', 'context.suggestion.showAll'),
        command: showAllCommand,
      });
      break;
    case 'single_matched':
    default:
      break;
  }

  return rawSuggestions.map((item, index) => {
    const label = toSuggestionLabel(index);
    return {
      label,
      summary: item.summary,
      detail: `${item.summary}: ${item.command}`,
      command: item.command,
    };
  });
}

function printSuggestionOptions(
  lang: 'ko' | 'en',
  suggestionOptions: SuggestionOption[]
): void {
  if (suggestionOptions.length === 0) return;
  const finalPrompt = buildSuggestionFinalPrompt(lang, suggestionOptions);
  console.log(chalk.green(chalk.bold(`👉 ${tr(lang, 'cli', 'context.suggestionHeader')}`)));
  suggestionOptions.forEach((option) => {
    console.log(`   ${option.label}: ${option.summary}`);
    console.log(
      chalk.gray(
        `   ↳ ${tr(lang, 'cli', 'context.suggestionCommandHint', {
          command: option.command,
        })}`
      )
    );
  });
  if (finalPrompt) {
    console.log(chalk.cyan(`   ↳ ${finalPrompt}`));
  }
}

function buildRequiredDocHints(actionOptions: ActionOption[]): RequiredDocHint[] {
  const ids = getRecommendedDocIdsForCategories(
    actionOptions.map((option) => option.action.category)
  );
  return ids.map((id) => ({
    id,
    command: toBuiltinDocCommand(id),
  }));
}

function executeCommandAction(
  cmd: string,
  jsonMode: boolean,
  cwd?: string
): { stdout?: string; stderr?: string } {
  const shellPath =
    process.env.SHELL ||
    (process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh');

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

function getListLabel(
  f: FeatureContext,
  stepsMap: Record<number, string>,
  lang: 'ko' | 'en',
  workflowPolicy: ReturnType<typeof resolveWorkflowPolicy>,
  prePrReviewPolicy: ReturnType<typeof resolvePrePrReviewPolicy>
): string {
  // For "ready to close" features, show the closest missing workflow requirement
  // instead of generic step names like "tasks.md 작성".
  if (f.completion.implementationDone && !f.completion.workflowDone) {
    if (f.git.docsHasUncommittedChanges) {
      return tr(lang, 'cli', 'context.list.docsCommitNeeded');
    }
    if (f.git.projectHasUncommittedChanges) {
      return tr(lang, 'cli', 'context.list.projectCommitNeeded');
    }
    if (workflowPolicy.requireIssue && !f.issueNumber) {
      return tr(lang, 'cli', 'context.list.issueNumberNeeded');
    }
    if (workflowPolicy.requirePr && (!f.docs.prFieldExists || !f.docs.prStatusFieldExists)) {
      return tr(lang, 'cli', 'context.list.addPrMetadata');
    }
    if (prePrReviewPolicy.enabled && !f.docs.prePrReviewFieldExists) {
      return tr(lang, 'cli', 'context.list.addPrePrReviewField');
    }
    if (prePrReviewPolicy.enabled && f.prePrReview.status !== 'Done') {
      return tr(lang, 'cli', 'context.list.completePrePrReview');
    }
    if (
      prePrReviewPolicy.enabled &&
      prePrReviewPolicy.findings === 'required' &&
      (!f.docs.prePrFindingsFieldExists || !f.prePrReview.findingsProvided)
    ) {
      return tr(lang, 'cli', 'context.list.addPrePrFindings');
    }
    if (
      prePrReviewPolicy.enabled &&
      (!f.docs.prePrEvidenceFieldExists || !f.prePrReview.evidenceProvided)
    ) {
      return tr(lang, 'cli', 'context.list.addPrePrEvidence');
    }
    if (
      prePrReviewPolicy.enabled &&
      (!f.docs.prePrDecisionFieldExists || !f.prePrReview.decisionProvided)
    ) {
      return tr(lang, 'cli', 'context.list.addPrePrDecision');
    }
    if (prePrReviewPolicy.enabled && f.prePrReview.decisionOutcome !== 'approve') {
      return tr(lang, 'cli', 'context.list.resolvePrePrDecision');
    }
    if (workflowPolicy.requirePr && !f.pr.link) {
      return tr(lang, 'cli', 'context.list.recordPrLink');
    }
    if (workflowPolicy.requireReview && !f.pr.status) {
      return tr(lang, 'cli', 'context.list.setPrStatus');
    }
    if (
      workflowPolicy.requireReview &&
      f.pr.status === 'Review' &&
      (!f.docs.prReviewEvidenceFieldExists || !f.prReview.evidenceProvided)
    ) {
      return tr(lang, 'cli', 'context.list.addPrReviewEvidence');
    }
    if (
      workflowPolicy.requireReview &&
      f.pr.status === 'Review' &&
      (!f.docs.prReviewDecisionFieldExists || !f.prReview.decisionProvided)
    ) {
      return tr(lang, 'cli', 'context.list.addPrReviewDecision');
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

function getMultipleFeaturesRecommendation(
  projectType: 'single' | 'multi',
  selectedComponent: string
): string {
  if (projectType === 'single') {
    return 'Multiple features detected. Please specify feature name (slug | F001 | F001-slug).';
  }
  if (selectedComponent) {
    return `Multiple features detected in component "${selectedComponent}". Please specify feature name (slug | F001 | F001-slug).`;
  }
  return 'Multiple features detected across components. Please specify feature name (slug | F001 | F001-slug) or use --component.';
}

function getFeatureRef(feature: FeatureContext): string {
  return feature.folderName || `${feature.type}:${feature.slug}`;
}

function toCompactFeature(
  feature: FeatureContext | null | undefined
): Record<string, unknown> | null {
  if (!feature) return null;

  return {
    ref: getFeatureRef(feature),
    id: feature.id ?? null,
    slug: feature.slug,
    folderName: feature.folderName,
    type: feature.type,
    path: feature.path,
    currentStep: feature.currentStep,
    nextAction: feature.nextAction,
    completion: feature.completion,
    specStatus: feature.specStatus,
    planStatus: feature.planStatus,
    tasks: feature.tasks,
    prePrReview: {
      status: feature.prePrReview.status,
      findings: feature.prePrReview.findings,
      findingsProvided: feature.prePrReview.findingsProvided,
      evidenceProvided: feature.prePrReview.evidenceProvided,
      decisionOutcome: feature.prePrReview.decisionOutcome,
      decisionProvided: feature.prePrReview.decisionProvided,
    },
    prReview: {
      findings: feature.prReview.findings,
      evidenceProvided: feature.prReview.evidenceProvided,
      decisionProvided: feature.prReview.decisionProvided,
    },
    pr: {
      link: feature.pr.link,
      status: feature.pr.status,
      remote: feature.pr.remote,
    },
    git: {
      docsBranch: feature.git.docsBranch,
      projectBranch: feature.git.projectBranch,
      projectBranchAvailable: feature.git.projectBranchAvailable,
      onExpectedBranch: feature.git.onExpectedBranch,
      docsEverCommitted: feature.git.docsEverCommitted,
      docsHasUncommittedChanges: feature.git.docsHasUncommittedChanges,
      projectHasUncommittedChanges: feature.git.projectHasUncommittedChanges,
      docsPathIgnored: feature.git.docsPathIgnored,
      projectHasUpstream: feature.git.projectHasUpstream,
      projectBranchAhead: feature.git.projectBranchAhead,
      projectBranchBehind: feature.git.projectBranchBehind,
    },
    docs: {
      specExists: feature.docs.specExists,
      planExists: feature.docs.planExists,
      tasksExists: feature.docs.tasksExists,
      issueDocIssueFieldExists: feature.docs.issueDocIssueFieldExists,
      prDocPrFieldExists: feature.docs.prDocPrFieldExists,
      prDocReviewStatusFieldExists: feature.docs.prDocReviewStatusFieldExists,
      prFieldExists: feature.docs.prFieldExists,
      prStatusFieldExists: feature.docs.prStatusFieldExists,
      prePrReviewFieldExists: feature.docs.prePrReviewFieldExists,
      prePrFindingsFieldExists: feature.docs.prePrFindingsFieldExists,
      prePrEvidenceFieldExists: feature.docs.prePrEvidenceFieldExists,
      prePrDecisionFieldExists: feature.docs.prePrDecisionFieldExists,
      prReviewFindingsFieldExists: feature.docs.prReviewFindingsFieldExists,
      prReviewEvidenceFieldExists: feature.docs.prReviewEvidenceFieldExists,
      prReviewDecisionFieldExists: feature.docs.prReviewDecisionFieldExists,
    },
    warnings: feature.warnings,
  };
}

function toCompactActionOption(option: ActionOption): Record<string, unknown> {
  const base: Record<string, unknown> = {
    label: option.label,
    summary: option.summary,
    detail: option.detail,
    approvalPrompt: option.approvalPrompt,
    requiresRequestText: option.requiresRequestText,
    replyExample: option.replyExample,
    actionType: option.action.type,
    category: option.action.category,
    operationType: option.action.operationType,
    requiresUserCheck: !!option.action.requiresUserCheck,
  };

  if (option.action.type === 'command') {
    base.scope = option.action.scope;
    base.cwd = option.action.cwd;
    base.cmd = option.action.cmd;
    return base;
  }

  base.message = option.action.message;
  return base;
}

function toCompactSuggestionOption(
  option: SuggestionOption
): Record<string, string> {
  return {
    label: option.label,
    summary: option.summary,
    command: option.command,
  };
}

function resolveContextRecommendation(
  state: ResolvedContextState,
  projectType: 'single' | 'multi',
  selectedComponent: string
): string {
  if (state.status === 'multiple_active') {
    return getMultipleFeaturesRecommendation(projectType, selectedComponent);
  }
  if (state.status === 'no_features') {
    return 'No features found. Run onboarding checks first, then create a feature.';
  }
  if (state.status === 'no_open') {
    return 'No open features found. Use `context --done` to inspect completed features.';
  }
  if (state.status === 'no_match') {
    return 'No features found.';
  }
  if (state.targetFeatures.length === 1) {
    return state.targetFeatures[0].nextAction;
  }
  return 'No matched feature.';
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

  const stepDefinitions = getStepDefinitions(lang, config.workflow);
  const stepsMap = getStepsMap(lang, config.workflow);
  const selectionOptions: ContextSelectionOptions = {
    component: selectedComponent || undefined,
    all: options.all,
    done: options.done,
  };
  const state = await resolveContextState(config, featureName, selectionOptions);
  const requiredDocs = buildRequiredDocHints(state.actionOptions);
  const suggestionOptions = buildSuggestionOptions(
    lang,
    state,
    config.projectType,
    selectedComponent
  );
  const suggestionFinalPrompt = buildSuggestionFinalPrompt(lang, suggestionOptions);

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
      ? buildFinalApprovalPrompt(lang, state.actionOptions)
      : '';
    const approvalUserFacingLines = approvalRequired
      ? [
          ...state.actionOptions.map((o) => o.approvalPrompt),
          finalApprovalPrompt,
        ].filter((line) => line.length > 0)
      : [];
    const approveCommand = buildApprovalCommand(
      state,
      featureName,
      selectedComponent,
      false
    );
    const executeCommand = buildApprovalCommand(
      state,
      featureName,
      selectedComponent,
      true
    );
    const recommendation = resolveContextRecommendation(
      state,
      config.projectType,
      selectedComponent
    );
    const activeCategories = listActiveCategories(state.actionOptions);
    const uncategorizedLabels = listUncategorizedLabels(state.actionOptions);

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
        matchedFeature: toCompactFeature(state.matchedFeature),
        candidateRefs:
          state.targetFeatures.length > 1
            ? state.targetFeatures.map((feature) => getFeatureRef(feature))
            : [],
        completedCandidateRefs:
          state.selectionMode === 'open'
            ? state.doneFeatures.map((feature) => getFeatureRef(feature))
            : [],
        openCandidateRefs:
          state.selectionMode === 'open'
            ? state.openFeatures.map((feature) => getFeatureRef(feature))
            : [],
        inProgressCandidateRefs:
          state.selectionMode === 'open'
            ? state.inProgressFeatures.map((feature) => getFeatureRef(feature))
            : [],
        readyToCloseCandidateRefs:
          state.selectionMode === 'open'
            ? state.readyToCloseFeatures.map((feature) => getFeatureRef(feature))
            : [],
        actionOptions: state.actionOptions.map((option) => toCompactActionOption(option)),
        suggestionOptions: suggestionOptions.map((option) =>
          toCompactSuggestionOption(option)
        ),
        primaryActionLabel: primaryAction?.label ?? null,
        workflowPolicy,
        taskCommitGatePolicy,
        prePrReviewPolicy,
        checkPolicy: {
          docPath: 'builtin://agents/policy',
          token: '<LABEL>',
          acceptedTokens: ['<LABEL>', '<LABEL> OK', '<LABEL> ...', '... <LABEL> ...'],
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
        approvalRequest: {
          required: approvalRequired,
          finalPrompt: finalApprovalPrompt,
          userFacingLines: approvalUserFacingLines,
          labels: approvalRequired ? state.actionOptions.map((o) => o.label) : [],
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
      completedCandidates: state.selectionMode === 'open' ? state.doneFeatures : [],
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
        acceptedTokens: ['<LABEL>', '<LABEL> OK', '<LABEL> ...', '... <LABEL> ...'],
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
          'Before asking for approval, show only `actionOptions[].approvalPrompt` lines and `approvalRequest.finalPrompt` to the user. Keep `requiredDocs`, `checkPolicy`, and raw execution commands as internal guidance. For commit actions, include scope (`docs`/`project`) and commit message in the visible prompt. User replies should include the label token (e.g. `A`, `A OK`, `A proceed`, `A 진행해`). For command execution, prefer one-shot `npx lee-spec-kit flow <featureRef> --approve <LABEL> --execute` to avoid session mismatch after context compression/reset. Use ticket-based `context --execute --ticket` only when explicitly needed.',
        oneApprovalPerAction: approvalRequired,
        requireFreshContext: true,
        contextVersion: state.contextVersion,
        config: config.approval ?? { mode: 'builtin' },
      },
      approvalRequest: {
        guidance:
          'User-facing output must include only approval prompts (`A: ...`) and `finalPrompt`. Do not expose `requiredDocs`, `checkPolicy`, or raw `cmd` unless explicitly requested. For approved command actions, prefer one-shot `flow --approve <LABEL> --execute`.',
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
          message: o.action.type === 'instruction' ? o.action.message : undefined,
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
      console.log(chalk.gray(`   (Detected from Project Branch: ${parts.join(' / ')})`));
    }
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
    printSuggestionOptions(lang, suggestionOptions);
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
    printSuggestionOptions(lang, suggestionOptions);
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
        const stepName = getListLabel(
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
        const stepName = getListLabel(
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
        const stepName = getListLabel(
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
    console.log(
      chalk.gray(selectorTip)
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
    printSuggestionOptions(lang, suggestionOptions);
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
  console.log(chalk.green(chalk.bold('👉 Next Options (Atomic):')));
  let hasDocsCommand = false;
  actionOptions.forEach((option) => {
    const requiresCheck = option.action.requiresUserCheck;
    const detail = option.detail;
    console.log(`   ${option.label}. ${checkTag(requiresCheck)}${detail}`);
    if (option.action.type === 'command' && option.action.scope === 'docs') {
      hasDocsCommand = true;
    }
  });
  if (hasDocsCommand) {
    console.log(chalk.gray(`   ↳ ${tr(lang, 'cli', 'context.tipDocsCommitRules')}`));
  }
  if (hasCheckAction) {
    console.log(chalk.gray(`   ↳ ${tr(lang, 'cli', 'context.actionOptionHint')}`));
    console.log(chalk.gray(`   ↳ ${tr(lang, 'cli', 'context.actionExplainHint')}`));
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
  if (actionOptions.length > 0 && hasCheckAction) {
    const finalApprovalPrompt = buildFinalApprovalPrompt(lang, actionOptions);
    const approveCommand = buildApprovalCommand(
      state,
      featureName,
      selectedComponent,
      false
    );
    const executeCommand = buildApprovalCommand(
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
      let executeCommand = buildApprovalCommand(
        freshState,
        featureName,
        selectedComponent,
        true
      ).replace('<LABEL>', parsedLabel);
      if (ticket) {
        executeCommand = executeCommand.replace(
          '[--ticket <TICKET>]',
          `--ticket ${ticket.token}`
        );
        console.log(chalk.gray(`   - Ticket: ${ticket.token} (expires: ${ticket.expiresAt})`));
      } else {
        executeCommand = executeCommand.replace(' [--ticket <TICKET>]', '');
      }
      console.log(chalk.gray(`   - Run with: ${executeCommand}`));
    } else {
      console.log(chalk.gray('   - Instruction-only action (no command execution).'));
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
    console.log(chalk.yellow(`⚠️  Approved label ${parsedLabel} is instruction-only.`));
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
        executeCommandAction(
          selectedAction.cmd,
          jsonMode,
          selectedAction.cwd
        ),
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

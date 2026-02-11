import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { createHash, randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { resolvePrePrReviewPolicy, resolveWorkflowPolicy } from '../utils/workflow.js';
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
import {
  BuiltinDocId,
  getRecommendedDocIdsForCategories,
  toBuiltinDocCommand,
} from '../utils/builtin-docs.js';

interface ContextOptions {
  json?: boolean;
  repo?: string;
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

interface ApprovalTicketRecord {
  token: string;
  sessionId: string;
  contextVersion: string;
  actionHash: string;
  label: string;
  featureRef: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

interface ApprovalTicketStore {
  tickets: ApprovalTicketRecord[];
}

const APPROVAL_TICKET_FILENAME = '.lee-spec-kit.approval-tickets.json';
const APPROVAL_TICKET_TTL_MS = 5 * 60 * 1000;

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

function parseApprovalLabel(input: string, validLabels: string[]): string | null {
  const normalized = input.trim().toUpperCase();
  if (!normalized) return null;

  const validSet = new Set(
    validLabels.map((label) => label.trim().toUpperCase()).filter(Boolean)
  );
  if (validSet.size === 0) return null;

  // Prefer label-first replies: "A", "A OK", "A proceed", "A 진행해"
  const leading = normalized.match(/^[`"'([{<\s]*([A-Z]+)\b/);
  if (leading && validSet.has(leading[1])) return leading[1];

  // Fallback: allow natural sentences that include a valid label token.
  const tokens = normalized.match(/[A-Z]+/g) || [];
  for (const token of tokens) {
    if (validSet.has(token)) return token;
  }
  return null;
}

function getApprovalTicketPath(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>
): string {
  return path.join(config.docsDir, APPROVAL_TICKET_FILENAME);
}

function getApprovalSessionId(): string {
  const explicit = (process.env.LEE_SPEC_KIT_SESSION_ID || '').trim();
  if (explicit) return explicit;
  const terminalSession = (
    process.env.TERM_SESSION_ID ||
    process.env.WT_SESSION ||
    process.env.TMUX_PANE ||
    ''
  ).trim();
  if (terminalSession) return terminalSession;
  return `ppid:${process.ppid}`;
}

function toActionHash(option: ActionOption): string {
  const payload = JSON.stringify({
    label: option.label,
    action: option.action,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

async function loadApprovalTicketStore(storePath: string): Promise<ApprovalTicketStore> {
  if (!(await fs.pathExists(storePath))) return { tickets: [] };
  try {
    const parsed = await fs.readJson(storePath);
    if (!parsed || !Array.isArray(parsed.tickets)) return { tickets: [] };
    return { tickets: parsed.tickets as ApprovalTicketRecord[] };
  } catch {
    return { tickets: [] };
  }
}

function pruneApprovalTickets(
  tickets: ApprovalTicketRecord[],
  nowMs: number
): ApprovalTicketRecord[] {
  return tickets.filter((ticket) => {
    if (ticket.usedAt) return false;
    const expiresAtMs = Date.parse(ticket.expiresAt || '');
    if (!Number.isFinite(expiresAtMs)) return false;
    return expiresAtMs > nowMs;
  });
}

async function issueApprovalTicket(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  payload: Pick<ApprovalTicketRecord, 'contextVersion' | 'actionHash' | 'label' | 'featureRef'>
): Promise<ApprovalTicketRecord> {
  const sessionId = getApprovalSessionId();
  const nowMs = Date.now();
  const record: ApprovalTicketRecord = {
    token: randomUUID().replace(/-/g, ''),
    sessionId,
    contextVersion: payload.contextVersion,
    actionHash: payload.actionHash,
    label: payload.label,
    featureRef: payload.featureRef,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + APPROVAL_TICKET_TTL_MS).toISOString(),
  };
  const storePath = getApprovalTicketPath(config);
  const lockPath = getDocsLockPath(config.docsDir);
  return withFileLock(
    lockPath,
    async () => {
      const store = await loadApprovalTicketStore(storePath);
      const nextTickets = pruneApprovalTickets(store.tickets, nowMs);
      nextTickets.push(record);
      await fs.writeJson(
        storePath,
        {
          tickets: nextTickets,
          updatedAt: new Date(nowMs).toISOString(),
        },
        { spaces: 2 }
      );
      return record;
    },
    { owner: 'context-approval-ticket:issue' }
  );
}

async function consumeApprovalTicket(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
  token: string,
  expected: Pick<
    ApprovalTicketRecord,
    'contextVersion' | 'actionHash' | 'label' | 'featureRef'
  >
): Promise<ApprovalTicketRecord> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw createCliError(
      'APPROVAL_REQUIRED',
      'Execution requires an approval ticket. Run `context --approve <reply> --json` first and pass `--ticket <token>`.'
    );
  }
  const storePath = getApprovalTicketPath(config);
  const lockPath = getDocsLockPath(config.docsDir);
  const sessionId = getApprovalSessionId();
  const nowMs = Date.now();

  return withFileLock(
    lockPath,
    async () => {
      const store = await loadApprovalTicketStore(storePath);
      const cleaned = pruneApprovalTickets(store.tickets, nowMs);
      const index = cleaned.findIndex((entry) => entry.token === normalizedToken);
      if (index < 0) {
        await fs.writeJson(
          storePath,
          { tickets: cleaned, updatedAt: new Date(nowMs).toISOString() },
          { spaces: 2 }
        );
        throw createCliError(
          'INVALID_APPROVAL',
          'Unknown or expired approval ticket. Re-run `context` and approve again.'
        );
      }

      const record = cleaned[index];
      const expiresAtMs = Date.parse(record.expiresAt || '');
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
        cleaned.splice(index, 1);
        await fs.writeJson(
          storePath,
          { tickets: cleaned, updatedAt: new Date(nowMs).toISOString() },
          { spaces: 2 }
        );
        throw createCliError(
          'CONTEXT_STALE',
          'Approval ticket expired. Run `context` again and re-approve.'
        );
      }

      if (record.sessionId !== sessionId) {
        throw createCliError(
          'INVALID_APPROVAL',
          'Approval ticket session mismatch. Re-run `context` in the current session and approve again.'
        );
      }
      if (record.label !== expected.label) {
        throw createCliError(
          'INVALID_APPROVAL',
          `Approval ticket label mismatch. Ticket=${record.label}, expected=${expected.label}.`
        );
      }
      if (record.contextVersion !== expected.contextVersion) {
        throw createCliError(
          'CONTEXT_STALE',
          'Context changed after approval. Run `context` again and re-approve.'
        );
      }
      if (record.actionHash !== expected.actionHash) {
        throw createCliError(
          'CONTEXT_STALE',
          'Selected action changed after approval. Run `context` again and re-approve.'
        );
      }
      if (record.featureRef !== expected.featureRef) {
        throw createCliError(
          'INVALID_APPROVAL',
          'Approval ticket feature mismatch. Re-run `context` for this feature and approve again.'
        );
      }

      cleaned.splice(index, 1);
      await fs.writeJson(
        storePath,
        {
          tickets: cleaned,
          updatedAt: new Date(nowMs).toISOString(),
        },
        { spaces: 2 }
      );
      return record;
    },
    { owner: 'context-approval-ticket:consume' }
  );
}

function listLabels(actionOptions: ActionOption[]): string {
  if (actionOptions.length === 0) return '-';
  return actionOptions.map((o) => o.label).join(', ');
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
    return `npx lee-spec-kit context ${featureRef}${componentArg} --approve <LABEL> --execute --ticket <TICKET>`;
  }
  return `npx lee-spec-kit context ${featureRef}${componentArg} --approve <LABEL>`;
}

function buildFinalApprovalPrompt(
  lang: 'ko' | 'en',
  actionOptions: ActionOption[]
): string {
  if (actionOptions.length === 0) return '';
  const labels = listLabels(actionOptions);
  const example = actionOptions[0]?.label || 'A';
  return tr(lang, 'cli', 'context.finalLabelPrompt', {
    labels,
    example,
  });
}

function formatActionSummary(action: ActionOption['action']): string {
  if (action.type === 'command') {
    return `(${action.scope}) ${action.cmd}`;
  }
  return action.message;
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
    .option('--repo <repo>', 'Component name for multi projects')
    .option('--component <component>', 'Component name for multi projects')
    .option('--all', 'Include completed features when auto-detecting')
    .option('--done', 'Show completed (workflow-done) features only')
    .option(
      '--approve <reply>',
      'Approve one labeled option (examples: A, A OK, A proceed, A 진행해)'
    )
    .option('--ticket <token>', 'Approval ticket issued by `--approve`')
    .option(
      '--execute',
      'Execute approved option when it is a command (requires --ticket)'
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

async function runContext(
  featureName: string | undefined,
  options: ContextOptions
): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);
  const lang = config?.lang ?? 'en';
  const workflowPolicy = resolveWorkflowPolicy(config?.workflow);
  const prePrReviewPolicy = resolvePrePrReviewPolicy(config?.workflow);

  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  if (options.execute && (!options.ticket || !options.approve)) {
    throw createCliError(
      'APPROVAL_REQUIRED',
      '`--execute` requires both `--approve <reply>` and `--ticket <token>`. Run `context --approve <reply>` first.'
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

  if (
    options.repo &&
    options.component &&
    options.repo.trim().toLowerCase() !== options.component.trim().toLowerCase()
  ) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--repo` and `--component` must reference the same value when both are provided.'
    );
  }

  const selectedComponent = (options.component || options.repo || '')
    .trim()
    .toLowerCase();

  const stepDefinitions = getStepDefinitions(lang, config.workflow);
  const stepsMap = getStepsMap(lang, config.workflow);
  const selectionOptions: ContextSelectionOptions = {
    component: selectedComponent || undefined,
    all: options.all,
    done: options.done,
  };
  const state = await resolveContextState(config, featureName, selectionOptions);
  const requiredDocs = buildRequiredDocHints(state.actionOptions);

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

  // 2. 결과 출력 (JSON)
  if (options.json) {
    const primaryAction = state.actionOptions[0] ?? null;
    const finalApprovalPrompt = buildFinalApprovalPrompt(lang, state.actionOptions);
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
      primaryActionLabel: primaryAction?.label ?? null,
      primaryActionType: primaryAction?.action.type ?? null,
      primaryActionCategory: primaryAction?.action.category ?? null,
      primaryActionOperationType: primaryAction?.action.operationType ?? null,
      workflowPolicy,
      prePrReviewPolicy,
      checkPolicy: {
        docPath: 'builtin://agents/policy',
        hint: tr(lang, 'cli', 'context.checkPolicyHint'),
        policyOnly: true,
        token: '<LABEL>',
        acceptedTokens: ['<LABEL>', '<LABEL> OK', '<LABEL> ...', '... <LABEL> ...'],
        tokenPattern: '^.*\\b([A-Z]+)\\b.*$',
        validLabels: state.actionOptions.map((o) => o.label),
        requireExplanationBeforeApproval: true,
        requiredExplanationFields: [
          'actionOptions[].label',
          'actionOptions[].detail',
          'actionOptions[].approvalPrompt',
        ],
        recommendation:
          'Before asking for approval, present each label with exact CLI detail first (`A: <detail>`). Do not paraphrase command options. User replies should include the label token (e.g. `A`, `A OK`, `A proceed`, `A 진행해`). For command execution, require one-time `approvalTicket` from the approval result.',
        oneApprovalPerAction: true,
        requireFreshContext: true,
        contextVersion: state.contextVersion,
        config: config.approval ?? { mode: 'builtin' },
      },
      approvalRequest: {
        guidance:
          'Present each label with exact CLI detail (e.g. `A: <detail>`). For command options, include the raw `cmd` unchanged, then ask for `<LABEL>` or `<LABEL> OK`.',
        finalPrompt: finalApprovalPrompt,
        labels: state.actionOptions.map((o) => o.label),
        approveCommand,
        executeCommand,
        executeRequiresTicket: true,
        options: state.actionOptions.map((o) => ({
          label: o.label,
          summary: o.summary,
          detail: o.detail,
          approvalPrompt: o.approvalPrompt,
          actionType: o.action.type,
          scope: o.action.type === 'command' ? o.action.scope : undefined,
          cwd: o.action.type === 'command' ? o.action.cwd : undefined,
          cmd: o.action.type === 'command' ? o.action.cmd : undefined,
          message: o.action.type === 'instruction' ? o.action.message : undefined,
          requiresUserCheck: !!o.action.requiresUserCheck,
          operationType: o.action.operationType,
        })),
      },
      prPolicy: {
        screenshots: {
          upload: config.pr?.screenshots?.upload ?? false,
        },
      },
      requiredDocs,
      recommendation: '',
    };

    if (result.status === 'multiple_active') {
      result.recommendation = getMultipleFeaturesRecommendation(
        config.projectType,
        selectedComponent
      );
    } else if (result.status === 'no_features') {
      result.recommendation = 'No features found. Create a feature first.';
    } else if (result.status === 'no_open') {
      result.recommendation =
        'No open features found. Use `context --done` to inspect completed features.';
    } else if (result.status === 'no_match') {
      result.recommendation = 'No features found.';
    } else if (state.targetFeatures.length === 1) {
      result.recommendation = state.targetFeatures[0].nextAction;
    } else {
      result.recommendation = 'No matched feature.';
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
  if (actionOptions.length > 0) {
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
  let parsedLabel: string | null = null;

  if (state.status !== 'single_matched' || !state.matchedFeature) {
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'Approval execution requires a single matched feature. Specify feature selector first.'
    );
  }

  if (state.actionOptions.length === 0) {
    throw createCliError('NO_ACTION_OPTIONS', 'No action options to approve.');
  }

  parsedLabel = parseApprovalLabel(
    approval,
    state.actionOptions.map((o) => o.label)
  );
  if (!parsedLabel) {
    throw createCliError(
      'INVALID_APPROVAL',
      'Invalid approval reply. Include a valid label token (e.g. `A`, `A OK`, `A proceed`, `A 진행해`).'
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
  const actionHash = toActionHash(freshSelected);
  const featureRef = freshState.matchedFeature.folderName;

  if (!options.execute) {
    const ticket = await issueApprovalTicket(config, {
      contextVersion: freshState.contextVersion,
      actionHash,
      label: parsedLabel,
      featureRef,
    });
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
            approvalTicket: {
              token: ticket.token,
              sessionId: ticket.sessionId,
              label: ticket.label,
              contextVersion: ticket.contextVersion,
              actionHash: ticket.actionHash,
              expiresAt: ticket.expiresAt,
              oneTime: true,
            },
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
      const selectedComponent = selectionOptions.component || '';
      const executeCommand = buildApprovalCommand(
        freshState,
        featureName,
        selectedComponent,
        true
      )
        .replace('<LABEL>', parsedLabel)
        .replace('<TICKET>', ticket.token);
      console.log(chalk.gray(`   - Ticket: ${ticket.token} (expires: ${ticket.expiresAt})`));
      console.log(chalk.gray(`   - Run with: ${executeCommand}`));
    } else {
      console.log(chalk.gray('   - Instruction-only action (no command execution).'));
    }
    console.log();
    return;
  }

  if (!ticketToken) {
    throw createCliError(
      'APPROVAL_REQUIRED',
      '`--execute` requires `--ticket <token>`. Run `context --approve <reply>` first.'
    );
  }

  await consumeApprovalTicket(config, ticketToken, {
    contextVersion: freshState.contextVersion,
    actionHash,
    label: parsedLabel,
    featureRef,
  });

  if (selectedAction.type !== 'command') {
    if (options.executeStrict) {
      throw createCliError(
        'EXECUTION_NOT_COMMAND',
        `Approved label "${parsedLabel}" is instruction-only. Re-run without \`--execute\` or pick a command option.`
      );
    }
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
    const lockPath = getCommandExecutionLockPath(selectedAction, config);
    const execResult = await withFileLock(
      lockPath,
      async () =>
        executeCommandAction(
          selectedAction.cmd,
          !!options.json,
          selectedAction.cwd
        ),
      { owner: `context-execute:${selectedAction.scope}` }
    );
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

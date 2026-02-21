import chalk from 'chalk';
import { execSync } from 'child_process';
import { getConfig } from '../utils/config.js';
import { createCliContext } from '../utils/cli-context.js';
import { parseApprovalReply } from '../utils/context/approval-reply.js';
import {
  consumeApprovalTicket,
  issueApprovalTicket,
  toApprovalActionHash,
} from '../utils/context/approval-ticket.js';
import { tr } from '../utils/i18n.js';
import {
  getDocsLockPath,
  getProjectExecutionLockPath,
  withFileLock,
} from '../utils/lock.js';
import { createCliError } from '../utils/cli-error.js';
import {
  ActionOption,
  ContextSelectionOptions,
  ContextSelectionState,
} from '../utils/context-selection.js';
import * as presenter from './ContextPresenter.js';

export type CommandAction = Extract<
  ActionOption['action'],
  { type: 'command' }
>;
export type ResolvedContextState = ContextSelectionState;

export interface ContextOptions {
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

export async function runApprovedOption(
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

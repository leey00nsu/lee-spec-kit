import { DEFAULT_LANG, normalizeLang, tr, type Lang } from './i18n.js';

export type CliReasonCode =
  | 'PROMPT_BLOCKED'
  | 'CONFIG_NOT_FOUND'
  | 'DOCS_NOT_FOUND'
  | 'LOCK_WAIT_TIMEOUT'
  | 'LOCK_ACQUIRE_TIMEOUT'
  | 'PRECONDITION_FAILED'
  | 'INVALID_ARGUMENT'
  | 'DUPLICATE_FEATURE_ID'
  | 'MISSING_FEATURE_ID'
  | 'INVALID_APPROVAL'
  | 'APPROVAL_REQUIRED'
  | 'CONTEXT_SELECTION_REQUIRED'
  | 'NO_ACTION_OPTIONS'
  | 'CONTEXT_STALE'
  | 'ACTION_NOT_AVAILABLE'
  | 'EXECUTION_NOT_COMMAND'
  | 'EXECUTION_FAILED'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN_ERROR';

export interface CliSuggestion {
  label: string;
  title: string;
  command?: string;
}

export class CliError extends Error {
  readonly code: CliReasonCode;

  constructor(
    code: CliReasonCode,
    message: string,
    options?: { cause?: unknown; stack?: string }
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause }
    );
    this.name = 'CliError';
    this.code = code;
    if (options?.stack) this.stack = options.stack;
  }
}

export function createCliError(code: CliReasonCode, message: string): CliError {
  return new CliError(code, message);
}

export function toCliError(
  error: unknown,
  fallbackCode: CliReasonCode = 'UNKNOWN_ERROR'
): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof Error) {
    return new CliError(fallbackCode, error.message, {
      cause: error,
      stack: error.stack,
    });
  }
  return new CliError(fallbackCode, String(error), { cause: error });
}

type SuggestionSeed = {
  titleKey: string;
  command?: string;
};

function withLabels(seeds: SuggestionSeed[], lang: Lang): CliSuggestion[] {
  return seeds.map((seed, index) => ({
    label: String.fromCharCode(65 + index),
    title: tr(lang, 'cli', `cliError.${seed.titleKey}`),
    command: seed.command,
  }));
}

const SUGGESTION_MAP: Partial<Record<CliReasonCode, SuggestionSeed[]>> = {
  PROMPT_BLOCKED: [
    { titleKey: 'promptBlocked.retryWithoutNonInteractive' },
    { titleKey: 'promptBlocked.passRequiredFlags' },
    {
      titleKey: 'promptBlocked.checkRequiredOptions',
      command: 'npx lee-spec-kit <command> --help',
    },
  ],
  CONFIG_NOT_FOUND: [
    {
      titleKey: 'configOrDocs.initializeDocs',
      command: 'npx lee-spec-kit init',
    },
    {
      titleKey: 'configOrDocs.verifyDocsLocation',
      command: 'npx lee-spec-kit doctor --json',
    },
    { titleKey: 'configOrDocs.runFromDocsDir' },
  ],
  DOCS_NOT_FOUND: [
    {
      titleKey: 'configOrDocs.initializeDocs',
      command: 'npx lee-spec-kit init',
    },
    {
      titleKey: 'configOrDocs.verifyDocsLocation',
      command: 'npx lee-spec-kit doctor --json',
    },
    { titleKey: 'configOrDocs.runFromDocsDir' },
  ],
  LOCK_WAIT_TIMEOUT: [
    { titleKey: 'lock.retryLater' },
    { titleKey: 'lock.checkOtherProcess' },
    { titleKey: 'lock.inspectLockFiles' },
  ],
  LOCK_ACQUIRE_TIMEOUT: [
    { titleKey: 'lock.retryLater' },
    { titleKey: 'lock.checkOtherProcess' },
    { titleKey: 'lock.inspectLockFiles' },
  ],
  INVALID_ARGUMENT: [
    {
      titleKey: 'invalidArg.reviewUsage',
      command: 'npx lee-spec-kit <command> --help',
    },
    { titleKey: 'invalidArg.fixValues' },
    { titleKey: 'invalidArg.validateBeforeAutomation' },
  ],
  PRECONDITION_FAILED: [
    { titleKey: 'precondition.satisfyPreconditions' },
    {
      titleKey: 'precondition.runDoctor',
      command: 'npx lee-spec-kit doctor --json',
    },
    { titleKey: 'precondition.considerForce' },
  ],
  DUPLICATE_FEATURE_ID: [
    { titleKey: 'duplicateId.resolveDuplicates' },
    { titleKey: 'duplicateId.ensureUniqueFormat' },
    {
      titleKey: 'duplicateId.inspectJson',
      command: 'npx lee-spec-kit doctor --json',
    },
  ],
  MISSING_FEATURE_ID: [
    { titleKey: 'missingId.renameFolders' },
    { titleKey: 'missingId.alignDocs' },
    {
      titleKey: 'missingId.inspectJson',
      command: 'npx lee-spec-kit doctor --json',
    },
  ],
  INVALID_APPROVAL: [
    {
      titleKey: 'invalidApproval.fetchLatestOptions',
      command: 'npx lee-spec-kit context',
    },
    { titleKey: 'invalidApproval.replyWithValidLabel' },
    { titleKey: 'invalidApproval.oneLabelOnly' },
  ],
  APPROVAL_REQUIRED: [
    {
      titleKey: 'approvalRequired.reRunWithApprove',
      command: 'npx lee-spec-kit context --approve A',
    },
    {
      titleKey: 'approvalRequired.githubConfirmOk',
      command: 'npx lee-spec-kit github pr F001 --create --confirm OK',
    },
    { titleKey: 'approvalRequired.shareAndGetApproval' },
  ],
  CONTEXT_SELECTION_REQUIRED: [
    {
      titleKey: 'contextSelection.specifySelector',
      command: 'npx lee-spec-kit context <slug|F001|F001-slug>',
    },
    {
      titleKey: 'contextSelection.narrowByComponent',
      command: 'npx lee-spec-kit context --component <component>',
    },
    {
      titleKey: 'contextSelection.inspectAllCandidates',
      command: 'npx lee-spec-kit context --all',
    },
  ],
  NO_ACTION_OPTIONS: [
    {
      titleKey: 'noActionOptions.refreshContext',
      command: 'npx lee-spec-kit context',
    },
    { titleKey: 'noActionOptions.completeChecklist' },
    {
      titleKey: 'noActionOptions.listAllFeatures',
      command: 'npx lee-spec-kit context --all',
    },
  ],
  CONTEXT_STALE: [
    {
      titleKey: 'contextStale.refreshBeforeApprove',
      command: 'npx lee-spec-kit context',
    },
    {
      titleKey: 'contextStale.reapproveWithFreshLabel',
      command: 'npx lee-spec-kit context --approve A',
    },
    {
      titleKey: 'contextStale.executeAfterFreshApproval',
      command: 'npx lee-spec-kit context --approve A --execute',
    },
  ],
  ACTION_NOT_AVAILABLE: [
    {
      titleKey: 'contextStale.refreshBeforeApprove',
      command: 'npx lee-spec-kit context',
    },
    {
      titleKey: 'contextStale.reapproveWithFreshLabel',
      command: 'npx lee-spec-kit context --approve A',
    },
    {
      titleKey: 'contextStale.executeAfterFreshApproval',
      command: 'npx lee-spec-kit context --approve A --execute',
    },
  ],
  VALIDATION_FAILED: [
    {
      titleKey: 'invalidArg.reviewUsage',
      command: 'npx lee-spec-kit <command> --help',
    },
    { titleKey: 'invalidArg.fixValues' },
  ],
  UNKNOWN_ERROR: [
    { titleKey: 'unknown.rerunAndCaptureLogs' },
    {
      titleKey: 'unknown.runDoctor',
      command: 'npx lee-spec-kit doctor --json',
    },
    { titleKey: 'unknown.reportReasonCode' },
  ],
};

export function getCliErrorSuggestions(
  code: CliReasonCode,
  lang: Lang = DEFAULT_LANG
): CliSuggestion[] {
  const resolvedLang = normalizeLang(lang);
  if (code === 'EXECUTION_FAILED' || code === 'EXECUTION_NOT_COMMAND') {
    return withLabels(
      [
        {
          titleKey:
            code === 'EXECUTION_NOT_COMMAND'
              ? 'execution.notCommand'
              : 'execution.failed',
        },
        {
          titleKey: 'execution.rerunContextAndExecute',
          command: 'npx lee-spec-kit context --approve A --execute',
        },
        { titleKey: 'execution.runManually' },
      ],
      resolvedLang
    );
  }

  const seeds = SUGGESTION_MAP[code] ?? SUGGESTION_MAP.UNKNOWN_ERROR ?? [];
  return withLabels(seeds, resolvedLang);
}

export function printCliErrorSuggestions(
  suggestions: CliSuggestion[],
  lang: Lang = DEFAULT_LANG
): void {
  if (suggestions.length === 0) return;
  console.error(
    tr(normalizeLang(lang), 'cli', 'cliError.headerNextOptionsError')
  );
  for (const suggestion of suggestions) {
    if (suggestion.command) {
      console.error(
        `   ${suggestion.label}. ${suggestion.title} (${suggestion.command})`
      );
      continue;
    }
    console.error(`   ${suggestion.label}. ${suggestion.title}`);
  }
}

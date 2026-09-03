import { DEFAULT_LANG, normalizeLang, tr, type Lang } from './i18n.js';

export type CliReasonCode =
  | 'PROMPT_BLOCKED'
  | 'CONFIG_NOT_FOUND'
  | 'DOCS_NOT_FOUND'
  | 'LOCK_WAIT_TIMEOUT'
  | 'LOCK_ACQUIRE_TIMEOUT'
  | 'PRECONDITION_FAILED'
  | 'INVALID_ARGUMENT'
  | 'APPROVAL_REQUIRED'
  | 'CONTEXT_SELECTION_REQUIRED'
  | 'EXECUTION_FAILED'
  | 'VALIDATION_FAILED'
  | 'INVALID_CONFIG'
  | 'FEATURE_SELECTION_REQUIRED'
  | 'OPENWIKI_DISABLED'
  | 'OPENWIKI_NODE_22_REQUIRED'
  | 'OPENWIKI_CLI_NOT_FOUND'
  | 'OPENWIKI_VERSION_PROBE_FAILED'
  | 'OPENWIKI_VERSION_UNSUPPORTED'
  | 'OPENWIKI_RUNTIME_NOT_READY'
  | 'OPENWIKI_PROJECT_NOT_CLEAN'
  | 'OPENWIKI_GIT_STATE_UNAVAILABLE'
  | 'OPENWIKI_BASE_STALE'
  | 'OPENWIKI_SOURCE_STALE'
  | 'OPENWIKI_SYNC_FAILED'
  | 'OPENWIKI_IDLE_TIMEOUT'
  | 'OPENWIKI_ABSOLUTE_TIMEOUT'
  | 'OPENWIKI_SYNC_INTERRUPTED'
  | 'OPENWIKI_OUTPUT_SCOPE_VIOLATION'
  | 'OPENWIKI_OUTPUT_INVALID'
  | 'OPENWIKI_RUN_INCOMPLETE'
  | 'OPENWIKI_RUN_OWNER_MISMATCH'
  | 'OPENWIKI_PROTECTED_CONTENT_CHANGED'
  | 'OPENWIKI_SECRET_DETECTED'
  | 'UNKNOWN_ERROR';

export interface CliSuggestion {
  label: string;
  title: string;
  command?: string;
}

export class CliError extends Error {
  readonly code: CliReasonCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: CliReasonCode,
    message: string,
    options?: {
      cause?: unknown;
      stack?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause }
    );
    this.name = 'CliError';
    this.code = code;
    this.details = options?.details;
    if (options?.stack) this.stack = options.stack;
  }
}

export function createCliError(
  code: CliReasonCode,
  message: string,
  details?: Record<string, unknown>
): CliError {
  return new CliError(code, message, { details });
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
      command: 'npx lee-spec-kit detect --json',
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
      command: 'npx lee-spec-kit detect --json',
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
      titleKey: 'precondition.inspectDocsAndConfig',
      command: 'npx lee-spec-kit docs get agents --json',
    },
    { titleKey: 'precondition.considerForce' },
  ],
  APPROVAL_REQUIRED: [
    {
      titleKey: 'approvalRequired.githubConfirmOk',
      command: 'npx lee-spec-kit github pr F001 --create --confirm OK',
    },
    { titleKey: 'approvalRequired.shareAndGetApproval' },
  ],
  CONTEXT_SELECTION_REQUIRED: [
    {
      titleKey: 'contextSelection.specifySelector',
      command: 'npx lee-spec-kit github issue <slug|F001|F001-slug> --json',
    },
    {
      titleKey: 'contextSelection.narrowByComponent',
      command:
        'npx lee-spec-kit github issue <slug|F001|F001-slug> --component <component> --json',
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
      titleKey: 'unknown.inspectWorkspaceState',
      command: 'npx lee-spec-kit detect --json',
    },
    { titleKey: 'unknown.reportReasonCode' },
  ],
};

export function getCliErrorSuggestions(
  code: CliReasonCode,
  lang: Lang = DEFAULT_LANG
): CliSuggestion[] {
  const resolvedLang = normalizeLang(lang);
  if (code === 'EXECUTION_FAILED') {
    return withLabels(
      [
        {
          titleKey: 'execution.failed',
        },
        { titleKey: 'execution.retryAfterFixingInputs' },
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

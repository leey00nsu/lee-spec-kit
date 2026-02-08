export type CliReasonCode =
  | 'PROMPT_BLOCKED'
  | 'CONFIG_NOT_FOUND'
  | 'DOCS_NOT_FOUND'
  | 'LOCK_WAIT_TIMEOUT'
  | 'LOCK_ACQUIRE_TIMEOUT'
  | 'INVALID_ARGUMENT'
  | 'INVALID_APPROVAL'
  | 'APPROVAL_REQUIRED'
  | 'CONTEXT_SELECTION_REQUIRED'
  | 'NO_ACTION_OPTIONS'
  | 'CONTEXT_STALE'
  | 'ACTION_NOT_AVAILABLE'
  | 'EXECUTION_FAILED'
  | 'UNKNOWN_ERROR';

export interface CliSuggestion {
  label: string;
  title: string;
  command?: string;
}

export class CliError extends Error {
  readonly code: CliReasonCode;

  constructor(code: CliReasonCode, message: string) {
    super(message);
    this.name = 'CliError';
    this.code = code;
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
  if (error instanceof Error) return new CliError(fallbackCode, error.message);
  return new CliError(fallbackCode, String(error));
}

type SuggestionSeed = Omit<CliSuggestion, 'label'>;

function withLabels(seeds: SuggestionSeed[]): CliSuggestion[] {
  return seeds.map((seed, index) => ({
    label: String.fromCharCode(65 + index),
    ...seed,
  }));
}

export function getCliErrorSuggestions(code: CliReasonCode): CliSuggestion[] {
  switch (code) {
    case 'PROMPT_BLOCKED':
      return withLabels([
        {
          title: 'Run the same command without --non-interactive.',
        },
        {
          title: 'Pass all required flags explicitly, then run again.',
        },
        {
          title: 'Check required options first.',
          command: 'npx lee-spec-kit <command> --help',
        },
      ]);
    case 'CONFIG_NOT_FOUND':
    case 'DOCS_NOT_FOUND':
      return withLabels([
        {
          title: 'Initialize docs in the current workspace.',
          command: 'npx lee-spec-kit init',
        },
        {
          title: 'Verify docs location and configuration.',
          command: 'npx lee-spec-kit doctor --json',
        },
        {
          title: 'Run command from the directory that contains docs/.',
        },
      ]);
    case 'LOCK_WAIT_TIMEOUT':
    case 'LOCK_ACQUIRE_TIMEOUT':
      return withLabels([
        {
          title: 'Wait briefly, then retry the same command.',
        },
        {
          title: 'Check whether another lee-spec-kit process is still running.',
        },
        {
          title: 'Inspect lock files under docs/.lee-spec-kit-locks.',
        },
      ]);
    case 'INVALID_ARGUMENT':
      return withLabels([
        {
          title: 'Review command usage and valid flags.',
          command: 'npx lee-spec-kit <command> --help',
        },
        {
          title: 'Fix invalid value(s) and retry.',
        },
        {
          title: 'If using automation, validate arguments before invoking CLI.',
        },
      ]);
    case 'INVALID_APPROVAL':
      return withLabels([
        {
          title: 'Fetch latest options first.',
          command: 'npx lee-spec-kit context',
        },
        {
          title: 'Reply with a valid label only (or "<label> OK"), e.g. A.',
        },
        {
          title: 'Use one label at a time.',
        },
      ]);
    case 'APPROVAL_REQUIRED':
      return withLabels([
        {
          title: 'Re-run with --approve <label>.',
          command: 'npx lee-spec-kit context --approve A',
        },
        {
          title: 'Add --execute only when the approved option is a command.',
        },
        {
          title: 'List options first, then choose one label.',
          command: 'npx lee-spec-kit context',
        },
      ]);
    case 'CONTEXT_SELECTION_REQUIRED':
      return withLabels([
        {
          title: 'Specify one feature selector explicitly.',
          command: 'npx lee-spec-kit context <slug|F001|F001-slug>',
        },
        {
          title: 'Narrow by repository in fullstack mode.',
          command: 'npx lee-spec-kit context --repo fe',
        },
        {
          title: 'Inspect all candidates first.',
          command: 'npx lee-spec-kit context --all',
        },
      ]);
    case 'NO_ACTION_OPTIONS':
      return withLabels([
        {
          title: 'Refresh context to see current state.',
          command: 'npx lee-spec-kit context',
        },
        {
          title: 'Open feature docs and complete the missing checklist item.',
        },
        {
          title: 'List all features to find one with actionable options.',
          command: 'npx lee-spec-kit context --all',
        },
      ]);
    case 'CONTEXT_STALE':
    case 'ACTION_NOT_AVAILABLE':
      return withLabels([
        {
          title: 'Get fresh context before approving.',
          command: 'npx lee-spec-kit context',
        },
        {
          title: 'Approve again using a label from the latest output.',
          command: 'npx lee-spec-kit context --approve A',
        },
        {
          title: 'Execute only after re-approval of the fresh label.',
          command: 'npx lee-spec-kit context --approve A --execute',
        },
      ]);
    case 'EXECUTION_FAILED':
      return withLabels([
        {
          title: 'Review the failed command output and fix prerequisites.',
        },
        {
          title: 'Re-run context and execute one fresh label.',
          command: 'npx lee-spec-kit context --approve A --execute',
        },
        {
          title: 'Run the command manually to isolate environment issues.',
        },
      ]);
    case 'UNKNOWN_ERROR':
    default:
      return withLabels([
        {
          title: 'Re-run with the same input and capture full error logs.',
        },
        {
          title: 'Run diagnostics for workspace state.',
          command: 'npx lee-spec-kit doctor --json',
        },
        {
          title: 'Report the reasonCode and logs to maintainers.',
        },
      ]);
  }
}

export function printCliErrorSuggestions(suggestions: CliSuggestion[]): void {
  if (suggestions.length === 0) return;
  console.error('👉 Next Options (Error):');
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

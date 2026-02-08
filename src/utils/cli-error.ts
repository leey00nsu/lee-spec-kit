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

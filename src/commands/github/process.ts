import { spawnSync } from 'child_process';
import { createCliError } from '../../utils/cli-error.js';

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runProcess(
  bin: string,
  args: string[],
  cwd: string
): ProcessResult {
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      LEE_SPEC_KIT_NO_UPDATE_CHECK: '1',
      LEE_SPEC_KIT_NO_BANNER: '1',
    },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export function runProcessOrThrow(
  bin: string,
  args: string[],
  cwd: string,
  failureMessage: string
): ProcessResult {
  const result = runProcess(bin, args, cwd);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw createCliError(
      'EXECUTION_FAILED',
      `${failureMessage}${detail ? `: ${detail}` : ''}`
    );
  }
  return result;
}

export function runGhJson<T>(
  args: string[],
  cwd: string,
  messages: {
    commandFailed: string;
    emptyJson: string;
    invalidJson: (snippet: string) => string;
  }
): T {
  const result = runProcessOrThrow('gh', args, cwd, messages.commandFailed);
  const text = result.stdout.trim();
  if (!text) {
    throw createCliError('EXECUTION_FAILED', messages.emptyJson);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw createCliError(
      'EXECUTION_FAILED',
      messages.invalidJson(text.slice(0, 160))
    );
  }
}

/* eslint-disable no-undef */
import {
  execSync,
  ExecSyncOptions,
  execFileSync,
  spawnSync,
  SpawnSyncOptions,
  SpawnSyncReturns,
  spawn,
  SpawnOptions,
} from 'child_process';
import { ICommandAdapter, CommandRunResult } from '../ports/CommandAdapter.js';

export class DefaultCommandAdapter implements ICommandAdapter {
  execSync(command: string, options?: ExecSyncOptions): Buffer | string {
    return execSync(command, options);
  }

  execFileSync(
    file: string,
    args?: ReadonlyArray<string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: any
  ): Buffer | string {
    return execFileSync(file, args, options);
  }

  spawnSync(
    command: string,
    args?: ReadonlyArray<string>,
    options?: SpawnSyncOptions
  ): SpawnSyncReturns<Buffer | string> {
    return spawnSync(command, args, options);
  }

  runAsync(
    command: string,
    args: string[] = [],
    options: SpawnOptions = {}
  ): Promise<CommandRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { ...options, stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          code,
        });
      });
    });
  }

  runSync(
    command: string,
    args: string[] = [],
    cwd?: string
  ): CommandRunResult {
    try {
      const result = spawnSync(command, args, {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return {
        stdout: result.stdout ? String(result.stdout) : '',
        stderr: result.stderr ? String(result.stderr) : '',
        code: result.status,
      };
    } catch (error: unknown) {
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        code: 1,
      };
    }
  }
}

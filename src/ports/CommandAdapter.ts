import {
  SpawnOptions,
  SpawnSyncOptions,
  SpawnSyncReturns,
  ExecSyncOptions,
} from 'child_process';

export interface CommandRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface ICommandAdapter {
  execSync(command: string, options?: ExecSyncOptions): Buffer | string;
  execFileSync(
    file: string,
    args?: ReadonlyArray<string>,
    options?: any
  ): Buffer | string;
  spawnSync(
    command: string,
    args?: ReadonlyArray<string>,
    options?: SpawnSyncOptions
  ): SpawnSyncReturns<Buffer | string>;

  /**
   * Promise wrapper around child_process commands for easier async async usage
   */
  runAsync(
    command: string,
    args?: string[],
    options?: SpawnOptions
  ): Promise<CommandRunResult>;

  /**
   * Sync wrapper around child_process commands for easier sync usage
   */
  runSync(command: string, args?: string[], cwd?: string): CommandRunResult;
}

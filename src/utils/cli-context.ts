import { getConfig, ProjectConfig } from './config.js';
import { IFileSystemAdapter } from '../ports/FileSystemAdapter.js';
import { DefaultFileSystemAdapter } from '../adapters/DefaultFileSystemAdapter.js';
import { ICommandAdapter } from '../ports/CommandAdapter.js';
import { DefaultCommandAdapter } from '../adapters/DefaultCommandAdapter.js';

export interface CliContext {
  /**
   * The project configuration resolved from .lee-spec-kit.json or features folder
   */
  config: ProjectConfig;

  /**
   * Working directory at the time the command was invoked
   */
  cwd: string;

  /**
   * File system adapter to use instead of node's 'fs-extra'
   */
  fs: IFileSystemAdapter;

  /**
   * Command execution adapter to use instead of node's 'child_process'
   */
  cmd: ICommandAdapter;
}

export interface CliContextOptions {
  cwd?: string;
  fsAdapter?: IFileSystemAdapter;
  cmdAdapter?: ICommandAdapter;
}

/**
 * Bootstraps the application context containing adapters and parsed configuration.
 * Returns null if the configuration cannot be resolved for the given directory.
 */
export async function createCliContext(
  options: CliContextOptions = {}
): Promise<CliContext | null> {
  const cwd = options.cwd ?? process.cwd();

  const fsAdapter = options.fsAdapter ?? new DefaultFileSystemAdapter();
  const cmdAdapter = options.cmdAdapter ?? new DefaultCommandAdapter();

  // We still use current implementation of getConfig which relies on global fs-extra inside it,
  // but eventually config.ts itself could be refactored to take IFileSystemAdapter if needed.
  // For now, getConfig returns the config object.
  const config = await getConfig(cwd);

  if (!config) {
    return null; // Equivalent to throwing or letting command handle no-config state
  }

  return {
    config,
    cwd,
    fs: fsAdapter,
    cmd: cmdAdapter,
  };
}

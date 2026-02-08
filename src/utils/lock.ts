import path from 'path';
import fs from 'fs-extra';
import { createCliError } from './cli-error.js';

interface FileLockOptions {
  timeoutMs?: number;
  pollMs?: number;
  staleMs?: number;
  owner?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_MS = 150;
const DEFAULT_STALE_MS = 2 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export function getDocsLockPath(docsDir: string): string {
  return path.join(docsDir, '.lee-spec-kit.lock');
}

export function getInitLockPath(targetDir: string): string {
  return path.join(
    path.dirname(targetDir),
    `.lee-spec-kit.${path.basename(targetDir)}.lock`
  );
}

async function isStaleLock(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

async function tryAcquire(
  lockPath: string,
  owner: string | undefined
): Promise<boolean> {
  await fs.ensureDir(path.dirname(lockPath));
  try {
    const fd = await fs.open(lockPath, 'wx');
    const payload = JSON.stringify(
      { pid: process.pid, owner: owner ?? 'unknown', createdAt: new Date().toISOString() },
      null,
      2
    );
    await fs.writeFile(fd, `${payload}\n`, { encoding: 'utf8' });
    await fs.close(fd);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

export async function waitForLockRelease(
  lockPath: string,
  options: Pick<FileLockOptions, 'timeoutMs' | 'pollMs' | 'staleMs'> = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const startedAt = Date.now();

  while (await fs.pathExists(lockPath)) {
    if (await isStaleLock(lockPath, staleMs)) {
      await fs.remove(lockPath);
      break;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw createCliError('LOCK_WAIT_TIMEOUT', `Timed out waiting for lock: ${lockPath}`);
    }
    await sleep(pollMs);
  }
}

export async function withFileLock<T>(
  lockPath: string,
  task: () => Promise<T>,
  options: FileLockOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const startedAt = Date.now();

  while (true) {
    const acquired = await tryAcquire(lockPath, options.owner);
    if (acquired) break;

    if (await isStaleLock(lockPath, staleMs)) {
      await fs.remove(lockPath);
      continue;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw createCliError(
        'LOCK_ACQUIRE_TIMEOUT',
        `Timed out acquiring lock: ${lockPath}`
      );
    }
    await sleep(pollMs);
  }

  try {
    return await task();
  } finally {
    await fs.remove(lockPath).catch(() => {
      // Ignore cleanup errors; stale lock detection will recover.
    });
  }
}

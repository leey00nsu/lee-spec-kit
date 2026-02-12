import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { createCliError } from './cli-error.js';

interface FileLockOptions {
  timeoutMs?: number;
  pollMs?: number;
  staleMs?: number;
  owner?: string;
}

interface LockPayload {
  pid?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_MS = 150;
const DEFAULT_STALE_MS = 2 * 60_000;
const RUNTIME_GIT_DIRNAME = 'lee-spec-kit.runtime';
const RUNTIME_TEMP_DIRNAME = 'lee-spec-kit-runtime';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function toScopeKey(value: string): string {
  return createHash('sha1').update(path.resolve(value)).digest('hex').slice(0, 16);
}

function getTempRuntimeDir(scopePath: string): string {
  return path.join(os.tmpdir(), RUNTIME_TEMP_DIRNAME, toScopeKey(scopePath));
}

function resolveGitRuntimeDir(cwd: string): string | null {
  try {
    const out = execFileSync(
      'git',
      ['rev-parse', '--git-path', RUNTIME_GIT_DIRNAME],
      {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    ).trim();
    if (!out) return null;
    return path.isAbsolute(out) ? out : path.resolve(cwd, out);
  } catch {
    return null;
  }
}

export function getRuntimeStateDir(cwd: string): string {
  const resolved = path.resolve(cwd);
  return resolveGitRuntimeDir(resolved) ?? getTempRuntimeDir(resolved);
}

export function getDocsLockPath(docsDir: string): string {
  return path.join(
    getRuntimeStateDir(docsDir),
    'locks',
    `docs-${toScopeKey(docsDir)}.lock`
  );
}

export function getInitLockPath(targetDir: string): string {
  return path.join(
    getRuntimeStateDir(path.dirname(path.resolve(targetDir))),
    'locks',
    `init-${toScopeKey(targetDir)}.lock`
  );
}

export function getApprovalTicketStorePath(docsDir: string): string {
  return path.join(
    getRuntimeStateDir(docsDir),
    'tickets',
    `approval-${toScopeKey(docsDir)}.json`
  );
}

export function getProjectExecutionLockPath(cwd: string): string {
  return path.join(getRuntimeStateDir(cwd), 'locks', 'project.lock');
}

async function isStaleLock(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    if (Date.now() - stat.mtimeMs <= staleMs) {
      return false;
    }

    const payload = await readLockPayload(lockPath);
    if (
      typeof payload?.pid === 'number' &&
      Number.isFinite(payload.pid) &&
      isProcessAlive(payload.pid)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function readLockPayload(lockPath: string): Promise<LockPayload | null> {
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as LockPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'EPERM') {
      // Alive but not permitted to signal.
      return true;
    }
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

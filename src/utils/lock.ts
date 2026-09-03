import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { createHash, randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { createCliError } from './cli-error.js';
import { sleep } from './async.js';

interface FileLockOptions {
  timeoutMs?: number;
  pollMs?: number;
  staleMs?: number;
  owner?: string;
}

interface LockPayload {
  pid?: number;
  nonce?: string;
}

interface LockSnapshot {
  raw: string;
  payload: LockPayload | null;
  mtimeMs: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_MS = 150;
const DEFAULT_STALE_MS = 2 * 60_000;
const RUNTIME_GIT_DIRNAME = 'lee-spec-kit.runtime';
const RUNTIME_TEMP_DIRNAME = 'lee-spec-kit-runtime';

function toScopeKey(value: string): string {
  return createHash('sha1')
    .update(path.resolve(value))
    .digest('hex')
    .slice(0, 16);
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

async function readLockSnapshot(
  lockPath: string
): Promise<LockSnapshot | null> {
  try {
    const stat = await fs.stat(lockPath);
    const raw = await fs.readFile(lockPath, 'utf8');
    let payload: LockPayload | null = null;
    try {
      const parsed = JSON.parse(raw) as LockPayload;
      if (parsed && typeof parsed === 'object') payload = parsed;
    } catch {
      // A malformed lock can only be reclaimed after its stale timeout.
    }
    return { raw, payload, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

function isStaleSnapshot(snapshot: LockSnapshot, staleMs: number): boolean {
  if (Date.now() - snapshot.mtimeMs <= staleMs) return false;
  const pid = snapshot.payload?.pid;
  return !(
    typeof pid === 'number' &&
    Number.isFinite(pid) &&
    isProcessAlive(pid)
  );
}

async function removeLockIfUnchanged(
  lockPath: string,
  snapshot: LockSnapshot
): Promise<boolean> {
  const current = await readLockSnapshot(lockPath);
  if (!current || current.raw !== snapshot.raw) return false;
  await fs.remove(lockPath);
  return true;
}

async function removeOwnedLock(lockPath: string, nonce: string): Promise<void> {
  const current = await readLockSnapshot(lockPath);
  if (!current || current.payload?.nonce !== nonce) return;
  await removeLockIfUnchanged(lockPath, current);
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
): Promise<string | null> {
  await fs.ensureDir(path.dirname(lockPath));
  const nonce = randomUUID();
  try {
    const fd = await fs.open(lockPath, 'wx');
    const payload = JSON.stringify(
      {
        pid: process.pid,
        nonce,
        owner: owner ?? 'unknown',
        createdAt: new Date().toISOString(),
      },
      null,
      2
    );
    await fs.writeFile(fd, `${payload}\n`, { encoding: 'utf8' });
    await fs.close(fd);
    return nonce;
  } catch (error) {
    if ((error as { code?: string }).code === 'EEXIST') {
      return null;
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
    const snapshot = await readLockSnapshot(lockPath);
    if (snapshot && isStaleSnapshot(snapshot, staleMs)) {
      if (await removeLockIfUnchanged(lockPath, snapshot)) break;
      continue;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw createCliError(
        'LOCK_WAIT_TIMEOUT',
        `Timed out waiting for lock: ${lockPath}`
      );
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
  let nonce = '';

  while (true) {
    const acquiredNonce = await tryAcquire(lockPath, options.owner);
    if (acquiredNonce) {
      nonce = acquiredNonce;
      break;
    }

    const snapshot = await readLockSnapshot(lockPath);
    if (snapshot && isStaleSnapshot(snapshot, staleMs)) {
      await removeLockIfUnchanged(lockPath, snapshot);
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
    await removeOwnedLock(lockPath, nonce).catch(() => {
      // Ignore cleanup errors; stale lock detection will recover.
    });
  }
}

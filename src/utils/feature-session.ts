import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { createCliError } from './cli-error.js';
import {
  getRepositoryLockPath,
  getRuntimeStateDir,
  withFileLock,
} from './lock.js';
import { runGitCapture } from './git-run.js';

export interface FeatureSessionBinding {
  version: 1;
  featureId: string;
  featureRef: string;
  component: string;
  docsDirectory: string;
  projectDirectory: string;
}

export function getFeatureSessionId(): string | null {
  const value = (
    process.env.LEE_SPEC_KIT_SESSION_ID?.trim() ||
    process.env.CODEX_THREAD_ID ||
    ''
  ).trim();
  return value || null;
}

function getSessionPath(docsDir: string): string | null {
  const sessionId = getFeatureSessionId();
  if (!sessionId) return null;
  let runtimeDir: string;
  try {
    runtimeDir = path.dirname(path.dirname(getRepositoryLockPath(docsDir)));
  } catch {
    runtimeDir = getRuntimeStateDir(docsDir);
  }
  const gitRoot = runGitCapture(['rev-parse', '--show-toplevel'], docsDir);
  const canonicalDocsDir = fs.realpathSync(docsDir);
  const docsScope = gitRoot
    ? path.relative(fs.realpathSync(gitRoot), canonicalDocsDir)
    : canonicalDocsDir;
  const key = createHash('sha256')
    .update(`${docsScope}\0${sessionId}`)
    .digest('hex');
  return path.join(runtimeDir, 'feature-sessions', `${key}.json`);
}

export async function readFeatureSession(
  docsDir: string
): Promise<FeatureSessionBinding | null> {
  const sessionPath = getSessionPath(docsDir);
  if (!sessionPath) return null;
  try {
    const binding = await fs.readJson(sessionPath);
    if (
      binding?.version === 1 &&
      [
        'featureId',
        'featureRef',
        'component',
        'docsDirectory',
        'projectDirectory',
      ].every(
        (key) => typeof binding[key] === 'string' && binding[key].trim()
      ) &&
      path.isAbsolute(binding.docsDirectory) &&
      path.isAbsolute(binding.projectDirectory)
    ) {
      return binding as FeatureSessionBinding;
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return null;
  }
  throw createCliError(
    'FEATURE_SELECTION_REQUIRED',
    'The session Feature binding is unreadable. Select the existing Feature explicitly with workflow-stage <feature-ref> --json to repair it.'
  );
}

export async function writeFeatureSession(
  docsDir: string,
  binding: Omit<FeatureSessionBinding, 'version'>
): Promise<void> {
  const sessionPath = getSessionPath(docsDir);
  if (!sessionPath) return;
  await withFileLock(
    `${sessionPath}.lock`,
    async () => {
      const temporaryPath = `${sessionPath}.${randomUUID()}.tmp`;
      try {
        await fs.outputJson(
          temporaryPath,
          { version: 1, ...binding },
          { spaces: 2 }
        );
        await fs.rename(temporaryPath, sessionPath);
      } finally {
        await fs.remove(temporaryPath);
      }
    },
    { owner: 'Feature session binding' }
  );
}

export async function withFeatureSessionCreationLock<T>(
  docsDir: string,
  action: () => Promise<T>
): Promise<T> {
  const sessionPath = getSessionPath(docsDir);
  return sessionPath
    ? withFileLock(`${sessionPath}.creation.lock`, action, {
        owner: 'Feature session creation',
      })
    : action();
}

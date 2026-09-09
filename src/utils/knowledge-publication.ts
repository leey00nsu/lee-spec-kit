import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import type { ProjectConfig } from '../config/types.js';
import { createCliError, toCliError } from './cli-error.js';
import { runGitCapture } from './git-run.js';
import { withFileLock } from './lock.js';
import {
  runOpenWikiSync,
  isOpenWikiEnabled,
  OPENWIKI_RECEIPT_PATH,
  type OpenWikiSyncOptions,
} from './openwiki-knowledge.js';
import { resolveOpenWikiWritingPolicy } from './openwiki-writing.js';

const PUBLICATION_REF = 'refs/lee-spec-kit/knowledge/publication';

export function readLatestKnowledgePublication(
  projectRoot: string
): { id: string; sourceHead: string } | null {
  try {
    const raw = runGitCapture(
      ['cat-file', 'blob', PUBLICATION_REF],
      projectRoot
    );
    if (!raw) return null;
    const value = JSON.parse(raw);
    return typeof value.id === 'string' &&
      /^[a-f0-9-]+$/u.test(value.id) &&
      typeof value.sourceHead === 'string' &&
      /^[a-f0-9]{40,64}$/u.test(value.sourceHead)
      ? { id: value.id, sourceHead: value.sourceHead }
      : null;
  } catch {
    return null;
  }
}

function publishAtCurrentBase(
  projectRoot: string,
  baseRef: string,
  sourceHead: string,
  id: string
): void {
  const object = execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: projectRoot,
    input: JSON.stringify({ id, sourceHead }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  try {
    // Git locks both refs through prepare/commit. Unlike a filesystem pointer,
    // this cannot publish successfully if another Git writer moved the base.
    execFileSync('git', ['update-ref', '--stdin'], {
      cwd: projectRoot,
      input: `start\nverify ${baseRef} ${sourceHead}\nupdate ${PUBLICATION_REF} ${object}\nprepare\ncommit\n`,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    throw createCliError(
      'OPENWIKI_PUBLICATION_SUPERSEDED',
      'The base changed or its Git ref lock could not be acquired at publication. Retry for the current integration tip.'
    );
  }
}

export function knowledgePublicationRoot(projectRoot: string): string {
  const common = runGitCapture(['rev-parse', '--git-common-dir'], projectRoot);
  if (!common)
    throw createCliError(
      'OPENWIKI_GIT_STATE_UNAVAILABLE',
      'A Git repository is required.'
    );
  return path.join(
    path.resolve(projectRoot, common),
    'lee-spec-kit.runtime',
    'knowledge'
  );
}

async function artifactHash(directory: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(relative: string): Promise<void> {
    const entries = (await fs.readdir(path.join(directory, relative))).sort();
    for (const name of entries) {
      const file = path.join(relative, name);
      if (file === 'publication.json') continue;
      const stat = await fs.lstat(path.join(directory, file));
      if (stat.isSymbolicLink())
        throw new Error('Publication artifacts must not contain symlinks.');
      if (stat.isDirectory()) await visit(file);
      else if (stat.isFile()) {
        const content = await fs.readFile(path.join(directory, file));
        hash.update(
          JSON.stringify([file.replace(/\\/gu, '/'), content.length])
        );
        hash.update(content);
      } else throw new Error('Unsupported publication entry.');
    }
  }
  await visit('');
  return hash.digest('hex');
}

export async function readKnowledgePublication(
  projectRoot: string,
  sourceHead: string,
  config?: ProjectConfig
) {
  const root = knowledgePublicationRoot(projectRoot);
  try {
    const latest = readLatestKnowledgePublication(projectRoot);
    if (!latest || latest.sourceHead !== sourceHead) return null;
    const artifactPath = path.join(root, 'artifacts', latest.id);
    const manifest = await fs.readJson(
      path.join(artifactPath, 'publication.json')
    );
    if (
      manifest.id !== latest.id ||
      manifest.sourceHead !== sourceHead ||
      manifest.artifactHash !== (await artifactHash(artifactPath))
    )
      return null;
    if (config) {
      const policy = await resolveOpenWikiWritingPolicy(config.lang);
      if (
        manifest.receipt?.language !== config.lang ||
        JSON.stringify(manifest.receipt?.writingPolicy) !==
          JSON.stringify(policy.receipt)
      )
        return null;
    }
    return { ...manifest, artifactPath };
  } catch {
    return null;
  }
}

async function writeAtomic(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.outputJson(temporary, value, { spaces: 2 });
  await fs.rename(temporary, file);
}

/** Generate from an immutable integrated commit. Never write into a developer checkout. */
export async function publishKnowledge(
  input: {
    config: ProjectConfig;
    projectRoot: string;
    featureRef?: string;
    component?: string;
    ci?: boolean;
    expectedSourceHead?: string;
  } & OpenWikiSyncOptions
) {
  const { projectRoot, config } = input;
  if (!isOpenWikiEnabled(config))
    throw createCliError(
      'OPENWIKI_DISABLED',
      'Enable experimental.openwiki before publishing.'
    );
  const branch = config.workflow?.baseBranch?.trim() || 'main';
  const baseRef = input.ci
    ? `refs/remotes/origin/${branch}`
    : `refs/heads/${branch}`;
  const root = knowledgePublicationRoot(projectRoot);
  return withFileLock(
    path.join(root, 'publish.lock'),
    async () => {
      const sourceHead = runGitCapture(
        ['rev-parse', '--verify', baseRef],
        projectRoot
      );
      if (!sourceHead)
        throw createCliError(
          'OPENWIKI_BASE_UNAVAILABLE',
          `Fetch or create ${baseRef} before publishing.`
        );
      if (input.expectedSourceHead && sourceHead !== input.expectedSourceHead) {
        throw createCliError(
          'OPENWIKI_BASE_STALE',
          'The verified integration tip changed before publication acquired its lock.'
        );
      }
      if (
        input.ci &&
        runGitCapture(['rev-parse', 'HEAD'], projectRoot) !== sourceHead
      ) {
        throw createCliError(
          'OPENWIKI_CI_TARGET_STALE',
          'The CI checkout must match the fetched integration branch tip.'
        );
      }
      const existing = await readKnowledgePublication(
        projectRoot,
        sourceHead,
        config
      );
      if (existing) {
        // Hash validation can take time; bind cache hits to the current base too.
        publishAtCurrentBase(projectRoot, baseRef, sourceHead, existing.id);
        return { status: 'ok', reasonCode: 'OPENWIKI_PUBLISHED', ...existing };
      }
      const id = `${sourceHead}-${randomUUID()}`;
      const worktree = path.join(root, 'runs', id);
      const artifactPath = path.join(root, 'artifacts', id);
      await fs.ensureDir(path.dirname(worktree));
      await writeAtomic(path.join(root, 'status.json'), {
        status: 'running',
        sourceHead,
        worktree,
      });
      try {
        execFileSync(
          'git',
          ['worktree', 'add', '--detach', worktree, sourceHead],
          { cwd: projectRoot, stdio: 'pipe' }
        );
        const result = await runOpenWikiSync({
          ...input,
          featureRef: input.featureRef || 'integrated',
          component: input.component || config.projectType,
          projectCwd: worktree,
          // Bind generation to the selected integration ref, including local mode
          // where origin/main may lag or lead the verified local main.
          baseTarget: { ref: baseRef, head: sourceHead },
        });
        if (runGitCapture(['rev-parse', baseRef], projectRoot) !== sourceHead) {
          throw createCliError(
            'OPENWIKI_PUBLICATION_SUPERSEDED',
            'The integration branch advanced during generation. Retry for its new tip.'
          );
        }
        await fs.ensureDir(artifactPath);
        await fs.copy(
          path.join(worktree, 'openwiki'),
          path.join(artifactPath, 'openwiki'),
          { dereference: false }
        );
        await fs.copy(
          path.join(worktree, OPENWIKI_RECEIPT_PATH),
          path.join(artifactPath, OPENWIKI_RECEIPT_PATH)
        );
        const manifest = {
          schemaVersion: 1,
          id,
          sourceHead,
          baseRef,
          publishedAt: new Date().toISOString(),
          artifactHash: await artifactHash(artifactPath),
          receipt: result.receipt,
        };
        await fs.writeJson(
          path.join(artifactPath, 'publication.json'),
          manifest,
          { spaces: 2 }
        );
        if (runGitCapture(['rev-parse', baseRef], projectRoot) !== sourceHead) {
          throw createCliError(
            'OPENWIKI_PUBLICATION_SUPERSEDED',
            'The integration branch advanced while preparing the artifact. Retry publication.'
          );
        }
        execFileSync('git', ['worktree', 'remove', '--force', worktree], {
          cwd: projectRoot,
          stdio: 'pipe',
        });
        // The publication ref is authoritative; status.json is diagnostic only.
        publishAtCurrentBase(projectRoot, baseRef, sourceHead, id);
        await writeAtomic(path.join(root, 'status.json'), {
          status: 'published',
          sourceHead,
          artifactPath,
        });
        return {
          status: 'ok',
          reasonCode: 'OPENWIKI_PUBLISHED',
          ...manifest,
          artifactPath,
        };
      } catch (error) {
        await writeAtomic(path.join(root, 'status.json'), {
          status: 'failed',
          sourceHead,
          worktree,
          // Provider diagnostics may contain secrets; persist only the toolkit code.
          reasonCode:
            (error as { code?: string }).code || 'OPENWIKI_PUBLICATION_FAILED',
        });
        // Keep the private failed run for diagnosis. A retry uses a fresh snapshot.
        const failure = toCliError(error);
        throw createCliError(failure.code, failure.message, {
          ...failure.details,
          worktree,
          resumable: false,
          resumeCommand: [
            'npx',
            'lee-spec-kit',
            'knowledge',
            'publish',
            ...(input.ci
              ? ['--ci', '--base-branch', branch, '--lang', config.lang]
              : [input.featureRef || '']),
            ...(input.component ? ['--component', input.component] : []),
            ...(
              ['lockTimeoutMs', 'idleTimeoutMs', 'absoluteTimeoutMs'] as const
            ).flatMap((key) =>
              input[key] === undefined
                ? []
                : [
                    key === 'lockTimeoutMs'
                      ? '--lock-timeout-ms'
                      : key === 'idleTimeoutMs'
                        ? '--idle-timeout-ms'
                        : '--absolute-timeout-ms',
                    String(input[key]),
                  ]
            ),
            '--json',
          ]
            .filter(Boolean)
            .map(shellArgument)
            .join(' '),
          retryMode: 'fresh-integrated-snapshot',
        });
      }
    },
    { owner: 'openwiki:publish', timeoutMs: input.lockTimeoutMs ?? 30_000 }
  );
}

function shellArgument(value: string): string {
  return /^[a-zA-Z0-9_./:-]+$/u.test(value)
    ? value
    : "'" + value.replace(/'/gu, "'\"'\"'") + "'";
}

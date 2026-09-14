import { setInterval, clearInterval } from 'node:timers';
import { isToolingOnlyRevisionChange } from './knowledge-scope.js';
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
  inspectOpenWikiResume,
  computeSourceFingerprintAtRef,
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
  config?: ProjectConfig,
  options: { allowPolicyMigration?: boolean } = {}
) {
  const root = knowledgePublicationRoot(projectRoot);
  try {
    const latest = readLatestKnowledgePublication(projectRoot);
    if (!latest) return null;
    const artifactPath = path.join(root, 'artifacts', latest.id);
    const manifest = await fs.readJson(
      path.join(artifactPath, 'publication.json')
    );
    if (
      manifest.id !== latest.id ||
      typeof manifest.sourceHead !== 'string' ||
      !latest.id.startsWith(`${manifest.sourceHead}-`) ||
      manifest.artifactHash !== (await artifactHash(artifactPath))
    )
      return null;
    if (manifest.sourceHead !== sourceHead) {
      if (
        !config ||
        manifest.sourceScopeVersion !== 2 ||
        !isToolingOnlyRevisionChange(
          projectRoot,
          manifest.sourceHead,
          sourceHead
        )
      )
        return null;
      const previous = computeSourceFingerprintAtRef(
        projectRoot,
        config.docsDir,
        manifest.sourceHead
      );
      const current = computeSourceFingerprintAtRef(
        projectRoot,
        config.docsDir,
        sourceHead
      );
      if (
        !previous ||
        previous !== current ||
        previous !== manifest.receipt?.sourceFingerprint
      )
        return null;
    }
    if (config && !options.allowPolicyMigration) {
      const policy = await resolveOpenWikiWritingPolicy(config.lang);
      if (
        manifest.receipt?.language !== config.lang ||
        JSON.stringify(manifest.receipt?.writingPolicy) !==
          JSON.stringify(policy.receipt)
      )
        return null;
    }
    return { ...manifest, artifactPath, appliedSourceHead: sourceHead };
  } catch {
    return null;
  }
}

/** Resolve stale status without mutating a concurrent publisher's state. */
export async function readKnowledgePublicationStatus(projectRoot: string) {
  const root = knowledgePublicationRoot(projectRoot);
  const attempt = await fs
    .readJson(path.join(root, 'status.json'))
    .catch(() => null);
  if (attempt?.status !== 'running') return attempt;
  const lock = await fs
    .readJson(path.join(root, 'publish.lock'))
    .catch(() => null);
  const pid = attempt.pid ?? lock?.pid;
  let alive = false;
  if (Number.isSafeInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      alive = true;
    } catch (error) {
      alive = (error as { code?: string }).code === 'EPERM';
    }
  }
  if (
    !alive ||
    !lock ||
    (attempt.lockNonce && attempt.lockNonce !== lock.nonce) ||
    (attempt.pid && attempt.pid !== lock.pid)
  ) {
    return {
      ...attempt,
      status: 'interrupted',
      reasonCode: 'OPENWIKI_SYNC_INTERRUPTED',
      statusDerived: true,
      message:
        'The publication owner is no longer active. The saved run and last published artifact are preserved.',
    };
  }
  // Old records have no ownership nonce: liveness alone cannot prove their owner.
  if (!attempt.lockNonce)
    return {
      ...attempt,
      status: 'unknown',
      statusDerived: true,
      message:
        'Legacy status has no process identity. Inspect the saved worktree and active processes before retrying.',
    };
  const heartbeatAt = Date.parse(attempt.updatedAt);
  if (!Number.isFinite(heartbeatAt) || Date.now() - heartbeatAt > 30_000) {
    return {
      ...attempt,
      status: 'unknown',
      statusDerived: true,
      message:
        'The saved PID is live but its publication heartbeat is stale. PID reuse or a blocked publisher cannot be distinguished; inspect the owner before retrying.',
    };
  }
  return attempt;
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
  const startedAt = Date.now();
  const budgetMs = input.absoluteTimeoutMs;
  const cancellation = new globalThis.AbortController();
  const checkExecution = () => {
    if (cancellation.signal.aborted || input.signal?.aborted)
      throw createCliError(
        'OPENWIKI_SYNC_INTERRUPTED',
        'Knowledge publication was interrupted. The integrated commit and last publication are preserved.'
      );
    if (budgetMs !== undefined && Date.now() - startedAt >= budgetMs)
      throw createCliError(
        'OPENWIKI_ABSOLUTE_TIMEOUT',
        'The total publication budget, including retries and verification, was exhausted.'
      );
  };
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
      checkExecution();
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
        checkExecution();
        publishAtCurrentBase(projectRoot, baseRef, sourceHead, existing.id);
        const file = path.join(root, 'status.json');
        const temporary = `${file}.${randomUUID()}.tmp`;
        await fs.outputJson(
          temporary,
          {
            status: 'published',
            sourceHead,
            artifactPath: existing.artifactPath,
            id: existing.id,
            cacheHit: true,
            updatedAt: new Date().toISOString(),
          },
          { spaces: 2, mode: 0o600 }
        );
        await fs.rename(temporary, file);
        return { status: 'ok', reasonCode: 'OPENWIKI_PUBLISHED', ...existing };
      }
      const previous = await fs
        .readJson(path.join(root, 'status.json'))
        .catch(() => null);
      let resumed: { runId: string; completedPages: number } | null = null;
      let id = `${sourceHead}-${randomUUID()}`;
      if (
        previous &&
        ['failed', 'interrupted', 'running'].includes(previous.status) &&
        previous.sourceHead === sourceHead &&
        typeof previous.id === 'string' &&
        /^[a-f0-9-]+$/u.test(previous.id) &&
        previous.id.startsWith(sourceHead + '-')
      ) {
        const candidate = path.join(root, 'runs', previous.id);
        if (
          previous.worktree === candidate &&
          (await fs.pathExists(candidate))
        ) {
          // Only an actual managed worktree belonging to this Git common dir can resume.
          const stat = await fs.lstat(candidate);
          const common = runGitCapture(
            ['rev-parse', '--git-common-dir'],
            candidate
          );
          const expectedCommon = runGitCapture(
            ['rev-parse', '--git-common-dir'],
            projectRoot
          );
          if (
            stat.isSymbolicLink() ||
            !stat.isDirectory() ||
            !common ||
            !expectedCommon ||
            (await fs.realpath(path.resolve(candidate, common))) !==
              (await fs.realpath(path.resolve(projectRoot, expectedCommon)))
          ) {
            throw createCliError(
              'OPENWIKI_RUN_OWNER_MISMATCH',
              'Saved publication is not a managed worktree of this repository.'
            );
          }
          resumed = await inspectOpenWikiResume({
            projectRoot: candidate,
            sourceHead,
            config,
            featureRef: input.featureRef || 'integrated',
            component: input.component || config.projectType,
          });
          if (resumed) id = previous.id;
        }
      }
      const worktree = path.join(root, 'runs', id);
      const artifactPath = path.join(root, 'artifacts', id);
      const previousDiagnosticsPaths: string[] = resumed
        ? [
            ...new Set<string>(
              [
                ...(previous.previousDiagnosticsPaths || []),
                previous.diagnosticsPath,
              ].filter((value) => typeof value === 'string')
            ),
          ]
        : [];
      const priorElapsedMs = resumed
        ? Number(previous.totalElapsedMs ?? previous.elapsedMs) || 0
        : 0;
      const launch = resumed ? (Number(previous.launch) || 1) + 1 : 1;
      if (previous) {
        // Preserve the previous status before a new launch updates the shared pointer.
        await fs.outputJson(
          path.join(root, 'history', `${randomUUID()}.json`),
          previous,
          { spaces: 2, mode: 0o600 }
        );
      }
      await fs.ensureDir(path.dirname(worktree));
      const lock = await fs.readJson(path.join(root, 'publish.lock'));
      let observation: Record<string, unknown> = {};
      const persistStatus = (
        status: string,
        extra: Record<string, unknown> = {}
      ) => {
        const file = path.join(root, 'status.json');
        const temporary = `${file}.${id}.tmp`;
        fs.outputJsonSync(
          temporary,
          {
            status,
            id,
            pid: process.pid,
            lockNonce: lock.nonce,
            sourceHead,
            worktree,
            startedAt: new Date(startedAt).toISOString(),
            ...observation,
            updatedAt: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
            budgetMs: budgetMs ?? null,
            launch,
            resumed: !!resumed,
            previousDiagnosticsPaths,
            totalElapsedMs: priorElapsedMs + Date.now() - startedAt,
            ...extra,
          },
          { spaces: 2, mode: 0o600 }
        );
        fs.renameSync(temporary, file);
      };
      const onInterrupt = () => {
        cancellation.abort();
      };
      process.on('SIGINT', onInterrupt);
      process.on('SIGTERM', onInterrupt);
      input.signal?.addEventListener('abort', onInterrupt, { once: true });
      persistStatus('running', { stage: 'preparing' });
      const heartbeat = setInterval(() => {
        try {
          persistStatus('running');
        } catch {
          /* Final write still reports failures. */
        }
      }, 1000);
      heartbeat.unref();
      try {
        checkExecution();
        if (!resumed) {
          execFileSync(
            'git',
            ['worktree', 'add', '--detach', worktree, sourceHead],
            { cwd: projectRoot, stdio: 'pipe' }
          );
          const latest = readLatestKnowledgePublication(projectRoot);
          if (latest) {
            const baseline = await readKnowledgePublication(
              projectRoot,
              latest.sourceHead,
              config,
              { allowPolicyMigration: true }
            );
            if (!baseline)
              throw createCliError(
                'OPENWIKI_OUTPUT_INVALID',
                'The last published artifact failed its integrity check. It was preserved; inspect it before generating.'
              );
            try {
              execFileSync(
                'git',
                ['merge-base', '--is-ancestor', latest.sourceHead, sourceHead],
                { cwd: projectRoot, stdio: 'pipe' }
              );
            } catch {
              throw createCliError(
                'OPENWIKI_BASE_STALE',
                'The last publication is not an ancestor of this integration. Both snapshots were preserved.'
              );
            }
            await inspectOpenWikiResume({
              projectRoot: worktree,
              sourceHead,
              config,
              featureRef: input.featureRef || 'integrated',
              component: input.component || config.projectType,
            });
            const instructionsPath = path.join(
              worktree,
              'openwiki',
              'INSTRUCTIONS.md'
            );
            const instructions = await fs
              .readFile(instructionsPath)
              .catch(() => null);
            await fs.remove(path.join(worktree, 'openwiki'));
            await fs.copy(
              path.join(baseline.artifactPath, 'openwiki'),
              path.join(worktree, 'openwiki'),
              { dereference: false }
            );
            if (instructions)
              await fs.writeFile(instructionsPath, instructions);
            await fs.copy(
              path.join(baseline.artifactPath, OPENWIKI_RECEIPT_PATH),
              path.join(worktree, OPENWIKI_RECEIPT_PATH)
            );
            observation = {
              baselineSourceHead: baseline.sourceHead,
              baselineArtifactId: latest.id,
            };
          }
        } else {
          observation = {
            runId: resumed.runId,
            completedPages: resumed.completedPages,
          };
        }
        persistStatus('running', { stage: resumed ? 'resuming' : 'preparing' });
        const result = await runOpenWikiSync({
          ...input,
          absoluteTimeoutMs: budgetMs,
          executionStartedAt: startedAt,
          initialAttempt: resumed ? Number(previous.attempt) || 0 : 0,
          signal: cancellation.signal,
          onEvent: (event) => {
            observation = {
              ...observation,
              ...event,
              retryReason: event.retryReason ?? observation.retryReason,
              snapshotPath: event.snapshotPath ?? observation.snapshotPath,
            };
            persistStatus('running');
            input.onEvent?.(event);
          },
          featureRef: input.featureRef || 'integrated',
          component: input.component || config.projectType,
          projectCwd: worktree,
          // Bind generation to the selected integration ref, including local mode
          // where origin/main may lag or lead the verified local main.
          baseTarget: { ref: baseRef, head: sourceHead },
        });
        checkExecution();
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
          sourceScopeVersion: 2,
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
        checkExecution();
        if (runGitCapture(['rev-parse', baseRef], projectRoot) !== sourceHead) {
          throw createCliError(
            'OPENWIKI_PUBLICATION_SUPERSEDED',
            'The integration branch advanced while preparing the artifact. Retry publication.'
          );
        }
        // The publication ref is authoritative; status.json is diagnostic only.
        checkExecution();
        publishAtCurrentBase(projectRoot, baseRef, sourceHead, id);
        persistStatus('published', { stage: 'published', artifactPath });
        // Only remove generation evidence after publication committed. Cleanup
        // failure must not turn a successfully published artifact into a failure.
        try {
          execFileSync('git', ['worktree', 'remove', '--force', worktree], {
            cwd: projectRoot,
            stdio: 'pipe',
          });
        } catch {
          persistStatus('published', {
            stage: 'published',
            artifactPath,
            cleanupPending: true,
          });
        }
        return {
          status: 'ok',
          reasonCode: 'OPENWIKI_PUBLISHED',
          ...manifest,
          artifactPath,
        };
      } catch (error) {
        const interruptedFailure =
          cancellation.signal.aborted ||
          (error as { code?: string }).code === 'OPENWIKI_SYNC_INTERRUPTED';
        persistStatus(interruptedFailure ? 'interrupted' : 'failed', {
          stage: interruptedFailure ? 'interrupted' : 'failed',
          reasonCode:
            (error as { code?: string }).code || 'OPENWIKI_PUBLICATION_FAILED',
          diagnosticsPath:
            (error as { details?: { diagnosticsPath?: string } }).details
              ?.diagnosticsPath || observation.diagnosticsPath,
        });
        // Durable queues can resume only after the same read-only admission checks.
        const failure = toCliError(error);
        const canResume = await inspectOpenWikiResume({
          projectRoot: worktree,
          sourceHead,
          config,
          featureRef: input.featureRef || 'integrated',
          component: input.component || config.projectType,
        })
          .then(Boolean)
          .catch(() => false);
        const failureMessage = `${failure.message} ${
          canResume
            ? 'Retry knowledge publish to resume the preserved page queue after checking its source and policy.'
            : 'The saved output requires inspection before reuse; diagnostics were preserved.'
        }`;
        throw createCliError(failure.code, failureMessage, {
          ...failure.details,
          worktree,
          resumable: canResume,
          previousDiagnosticsPaths,
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
          retryMode: canResume
            ? 'resume-preserved-run'
            : 'inspect-preserved-run',
        });
      } finally {
        clearInterval(heartbeat);
        process.off('SIGINT', onInterrupt);
        process.off('SIGTERM', onInterrupt);
        input.signal?.removeEventListener('abort', onInterrupt);
      }
    },
    {
      owner: 'openwiki:publish',
      timeoutMs: Math.min(input.lockTimeoutMs ?? 30_000, budgetMs ?? Infinity),
    }
  );
}

function shellArgument(value: string): string {
  return /^[a-zA-Z0-9_./:-]+$/u.test(value)
    ? value
    : "'" + value.replace(/'/gu, "'\"'\"'") + "'";
}

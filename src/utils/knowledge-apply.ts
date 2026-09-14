import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import fs from 'fs-extra';
import type { ProjectConfig } from '../config/types.js';
import { createCliError } from './cli-error.js';
import { withFileLock } from './lock.js';
import {
  knowledgePublicationRoot,
  readKnowledgePublication,
} from './knowledge-publication.js';
import {
  verifyPublishedKnowledgeOutput,
  OPENWIKI_RECEIPT_PATH,
} from './openwiki-knowledge.js';

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim();
}

// Hash the entire reader tree, including hidden provenance files and removals.
async function viewHash(root: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(relative: string): Promise<void> {
    const file = path.join(root, relative);
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink())
      throw new Error('Knowledge paths must not be symlinks.');
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort())
        await visit(path.join(relative, name));
    } else if (stat.isFile()) {
      hash.update(JSON.stringify([relative, stat.size]));
      hash.update(await fs.readFile(file));
    } else throw new Error('Unsupported Knowledge file.');
  }
  // Check the parent as well, so a receipt cannot be read through a symlink.
  if ((await fs.lstat(path.join(root, '.lee-spec-kit'))).isSymbolicLink())
    throw new Error('Unsafe receipt directory.');
  await visit('openwiki');
  await visit(OPENWIKI_RECEIPT_PATH);
  return hash.digest('hex');
}

export async function readKnowledgeView(
  projectRoot: string,
  config: ProjectConfig
) {
  const head = git(projectRoot, ['rev-parse', 'HEAD']);
  const publication = await readKnowledgePublication(projectRoot, head, config);
  const current =
    !!publication &&
    (await Promise.all([
      viewHash(projectRoot),
      viewHash(publication.artifactPath),
    ])
      .then(([actual, expected]) => actual === expected)
      .catch(() => false));
  return {
    current,
    path: path.join(projectRoot, 'openwiki'),
    artifactPath: publication?.artifactPath ?? null,
    applyCommand: 'npx lee-spec-kit knowledge apply --json',
  };
}

/** Apply only a verified artifact, using a prepared docs commit and Git's safe FF checkout. */
export async function applyKnowledge(
  projectRoot: string,
  config: ProjectConfig
) {
  const runtime = knowledgePublicationRoot(projectRoot);
  return withFileLock(
    path.join(runtime, 'publish.lock'),
    async () => {
      const branch = config.workflow?.baseBranch || 'main';
      if (git(projectRoot, ['branch', '--show-current']) !== branch)
        throw createCliError(
          'OPENWIKI_APPLY_BASE_REQUIRED',
          'Apply Knowledge from the integration branch checkout.'
        );
      if (git(projectRoot, ['status', '--porcelain', '--untracked-files=all']))
        throw createCliError(
          'OPENWIKI_APPLY_DIRTY_WORKTREE',
          'Commit or preserve working changes before applying Knowledge; no files were overwritten.'
        );
      if (
        git(projectRoot, [
          'ls-files',
          '--others',
          '--ignored',
          '--exclude-standard',
          '--',
          'openwiki',
          OPENWIKI_RECEIPT_PATH,
        ])
      )
        throw createCliError(
          'OPENWIKI_APPLY_DIRTY_WORKTREE',
          'Ignored local Knowledge files would be overwritten; preserve them before applying.'
        );
      const head = git(projectRoot, ['rev-parse', 'HEAD']);
      const publication = await readKnowledgePublication(
        projectRoot,
        head,
        config
      );
      if (!publication)
        throw createCliError(
          'OPENWIKI_PUBLICATION_REQUIRED',
          'No intact, current-policy publication matches this source revision. Publish or inspect the saved artifact first.'
        );
      const current = await readKnowledgeView(projectRoot, config);
      if (current.current)
        return {
          status: 'ok',
          reasonCode: 'OPENWIKI_APPLIED',
          ...current,
          commit: head,
          unchanged: true,
        };
      const worktree = path.join(runtime, 'applications', randomUUID());
      git(projectRoot, ['worktree', 'add', '--detach', worktree, head]);
      try {
        const metadata = await fs
          .lstat(path.join(worktree, '.lee-spec-kit'))
          .catch(() => null);
        if (metadata && (!metadata.isDirectory() || metadata.isSymbolicLink()))
          throw new Error('Unsafe Knowledge receipt directory.');
        await fs.remove(path.join(worktree, 'openwiki'));
        await fs.copy(
          path.join(publication.artifactPath, 'openwiki'),
          path.join(worktree, 'openwiki'),
          { dereference: false }
        );
        await fs.copy(
          path.join(publication.artifactPath, OPENWIKI_RECEIPT_PATH),
          path.join(worktree, OPENWIKI_RECEIPT_PATH)
        );
        if (
          (await viewHash(worktree)) !==
          (await viewHash(publication.artifactPath))
        )
          throw new Error('Prepared Knowledge differs from the publication.');
        await verifyPublishedKnowledgeOutput(
          worktree,
          config,
          publication.receipt
        );
        git(worktree, ['add', '-A', '--', 'openwiki', OPENWIKI_RECEIPT_PATH]);
        const changed = git(worktree, [
          'diff',
          '--cached',
          '--name-only',
          '--no-renames',
        ])
          .split('\n')
          .filter(Boolean);
        if (
          !changed.length ||
          changed.some(
            (file) =>
              !file.startsWith('openwiki/') && file !== OPENWIKI_RECEIPT_PATH
          )
        )
          throw new Error(
            'Prepared commit is not confined to Knowledge output.'
          );
        const scope = String(
          publication.receipt.triggerFeatureRef || 'knowledge'
        ).split('-')[0];
        // Relative hook paths must resolve in the real checkout, where tools such
        // as Husky install their untracked launchers. An isolated worktree must not
        // silently omit those hooks just because its dependencies are not installed.
        let hooks: string | undefined;
        try {
          hooks = git(projectRoot, [
            'config',
            '--path',
            '--get',
            'core.hooksPath',
          ]);
        } catch {
          /* Default Git hooks are shared by worktrees. */
        }
        execFileSync(
          'git',
          [
            ...(hooks
              ? ['-c', `core.hooksPath=${path.resolve(projectRoot, hooks)}`]
              : []),
            'commit',
            '-m',
            `docs(${scope}): apply verified Knowledge publication`,
          ],
          {
            cwd: worktree,
            stdio: 'pipe',
            env: {
              ...process.env,
              PATH: `${path.join(projectRoot, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH || ''}`,
            },
          }
        );
        const commit = git(worktree, ['rev-parse', 'HEAD']);
        const committed = git(worktree, [
          'diff',
          '--name-only',
          '--no-renames',
          head,
          commit,
        ])
          .split('\n')
          .filter(Boolean);
        if (
          committed.some(
            (file) =>
              !file.startsWith('openwiki/') && file !== OPENWIKI_RECEIPT_PATH
          ) ||
          git(worktree, ['status', '--porcelain', '--untracked-files=all']) ||
          (await viewHash(worktree)) !==
            (await viewHash(publication.artifactPath))
        )
          throw new Error(
            'The prepared Knowledge commit changed during commit hooks; main was preserved.'
          );
        if (
          git(projectRoot, ['rev-parse', 'HEAD']) !== head ||
          git(projectRoot, ['status', '--porcelain', '--untracked-files=all'])
        )
          throw createCliError(
            'OPENWIKI_APPLY_SUPERSEDED',
            'The checkout changed while preparing Knowledge. The prepared commit and existing files are preserved.'
          );
        // No reset or force checkout: Git protects concurrent edits and untracked files.
        git(projectRoot, [
          'merge',
          '--ff-only',
          '--no-overwrite-ignore',
          commit,
        ]);
        if (!(await readKnowledgeView(projectRoot, config)).current)
          throw new Error(
            'Applied Knowledge does not match the verified publication.'
          );
        const record = {
          status: 'ok',
          reasonCode: 'OPENWIKI_APPLIED',
          current: true,
          path: path.join(projectRoot, 'openwiki'),
          artifactPath: publication.artifactPath,
          sourceHead: publication.sourceHead,
          previousHead: head,
          commit,
        };
        await fs.outputJson(path.join(runtime, 'applied.json'), record, {
          spaces: 2,
        });
        try {
          git(projectRoot, ['worktree', 'remove', worktree]);
        } catch {
          /* Published docs remain applied; retained preparation is harmless. */
        }
        return record;
      } catch (error) {
        throw createCliError(
          'OPENWIKI_APPLY_FAILED',
          error instanceof Error
            ? error.message
            : 'Knowledge application failed.',
          { worktree, sourceHead: head, preserved: true }
        );
      }
    },
    { owner: 'openwiki:apply', timeoutMs: 30_000 }
  );
}

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import {
  artifactHash,
  readKnowledgePublication,
  readLatestKnowledgePublication,
} from '../src/utils/knowledge-publication.js';
import { computeSourceFingerprintAtRef } from '../src/utils/openwiki-knowledge.js';

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' });
}

/**
 * A verified publication is applied as a Knowledge-only commit, which advances the
 * publication ref past the artifact's own sourceHead. The baseline is then read with
 * a docs directory that may live in a linked Feature worktree while the repository
 * root is the primary checkout. The receipt fingerprint must not depend on that cwd.
 */
test('verifies an applied Knowledge baseline from a linked feature worktree', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsk-baseline-'));
  const worktree = path.join(
    path.dirname(root),
    `${path.basename(root)}-feature`
  );
  try {
    git(root, ['init', '-q']);
    git(root, ['config', 'user.name', 'Test']);
    git(root, ['config', 'user.email', 'test@example.com']);
    fs.mkdirSync(path.join(root, 'docs', 'features', 'F001-demo'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, 'docs', '.lee-spec-kit.json'),
      JSON.stringify({ projectName: 'demo', lang: 'ko' })
    );
    fs.writeFileSync(
      path.join(root, 'docs', 'features', 'F001-demo', 'spec.md'),
      '# spec\n'
    );
    fs.writeFileSync(path.join(root, 'src.ts'), 'export const value = 1;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'feat: integrated revision']);
    const integration = git(root, ['rev-parse', 'HEAD']).trim();

    // Knowledge-only revision, as applying a verified publication commits it.
    fs.mkdirSync(path.join(root, 'openwiki'), { recursive: true });
    fs.writeFileSync(path.join(root, 'openwiki', 'index.md'), '# index\n');
    fs.mkdirSync(path.join(root, '.lee-spec-kit'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.lee-spec-kit', 'openwiki-sync.json'),
      '{}\n'
    );
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'docs: apply verified knowledge']);
    const applied = git(root, ['rev-parse', 'HEAD']).trim();

    const docsDir = path.join(root, 'docs');
    const worktreeDocsDir = path.join(worktree, 'docs');
    const receiptFingerprint = computeSourceFingerprintAtRef(
      root,
      docsDir,
      integration
    );
    expect(receiptFingerprint).toBeTruthy();

    const id = `${integration}-12345678-1234-1234-1234-123456789abc`;
    const artifactPath = path.join(
      root,
      '.git',
      'lee-spec-kit.runtime',
      'knowledge',
      'artifacts',
      id
    );
    fs.mkdirSync(path.join(artifactPath, 'openwiki'), { recursive: true });
    fs.writeFileSync(
      path.join(artifactPath, 'openwiki', 'index.md'),
      '# index\n'
    );
    fs.writeFileSync(
      path.join(artifactPath, 'publication.json'),
      JSON.stringify({
        schemaVersion: 1,
        sourceScopeVersion: 2,
        id,
        sourceHead: integration,
        baseRef: 'refs/heads/main',
        artifactHash: await artifactHash(artifactPath),
        receipt: {
          schemaVersion: 3,
          sourceHead: integration,
          sourceFingerprint: receiptFingerprint,
          language: 'ko',
        },
      })
    );
    const object = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: root,
      input: JSON.stringify({ id, sourceHead: applied }),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    git(root, ['update-ref', 'refs/lee-spec-kit/knowledge/publication', object]);
    execFileSync('git', ['worktree', 'add', '--detach', worktree, applied], {
      cwd: root,
      stdio: 'pipe',
    });

    const config = {
      docsDir: worktreeDocsDir,
      lang: 'ko',
      projectType: 'single',
    } as never;
    expect(readLatestKnowledgePublication(root)).toEqual({
      id,
      sourceHead: applied,
    });
    expect(
      computeSourceFingerprintAtRef(root, worktreeDocsDir, integration)
    ).toBe(receiptFingerprint);
    const baseline = await readKnowledgePublication(root, applied, config, {
      allowPolicyMigration: true,
    });
    expect(baseline?.id).toBe(id);
    expect(baseline?.sourceHead).toBe(integration);
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktree], {
        cwd: root,
        stdio: 'pipe',
      });
    } catch {
      /* Fixture cleanup is best effort. */
    }
    fs.rmSync(worktree, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});


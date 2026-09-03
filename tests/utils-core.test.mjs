import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fs, path, withTempDir } from './helpers/cli-contract-helpers.mjs';
import {
  validatePathWithLang,
  validateSafeNameWithLang,
} from '../src/utils/validation.ts';
import { withFileLock } from '../src/utils/lock.ts';
import { sleep } from '../src/utils/async.ts';
import { getConfig } from '../src/utils/config.ts';
import { isPrePrEvidenceSatisfied } from '../src/utils/pre-pr-evidence.ts';

test('validateSafeNameWithLang blocks traversal patterns', () => {
  const result = validateSafeNameWithLang('../escape', 'en');
  assert.equal(result.valid, false);
  assert.match(result.error || '', /traversal|Traversal|경로|path/i);
});

test('validatePathWithLang rejects null-byte input', () => {
  const result = validatePathWithLang(`docs\0/feature`, 'en');
  assert.equal(result.valid, false);
  assert.match(result.error || '', /null/i);
});

test('withFileLock enforces mutual exclusion', async () => {
  await withTempDir('lsk-unit-lock-', async (dir) => {
    const lockPath = path.join(dir, '.runtime.lock');
    let active = 0;
    let maxActive = 0;

    const job = async () =>
      withFileLock(lockPath, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleep(120);
        active -= 1;
      });

    await Promise.all([job(), job(), job()]);
    assert.equal(maxActive, 1);
  });
});

test('withFileLock never removes a replacement lock owned by another process', async () => {
  await withTempDir('lsk-unit-lock-owner-', async (dir) => {
    const lockPath = path.join(dir, '.runtime.lock');
    await withFileLock(
      lockPath,
      async () => {
        const acquired = JSON.parse(await fs.readFile(lockPath, 'utf-8'));
        assert.equal(typeof acquired.nonce, 'string');
        await fs.rm(lockPath);
        await fs.writeFile(
          lockPath,
          JSON.stringify({
            pid: process.pid,
            nonce: 'replacement-owner',
            owner: 'other',
          }),
          'utf-8'
        );
      },
      { owner: 'original' }
    );
    const replacement = JSON.parse(await fs.readFile(lockPath, 'utf-8'));
    assert.equal(replacement.nonce, 'replacement-owner');
  });
});

test('getConfig resolves docs config via explicit docs env path', async () => {
  await withTempDir('lsk-unit-config-', async (dir) => {
    const docsDir = path.join(dir, 'nested', 'docs');
    await fs.mkdir(path.join(docsDir, 'features'), { recursive: true });
    await fs.mkdir(path.join(docsDir, 'agents'), { recursive: true });
    await fs.writeFile(
      path.join(docsDir, '.lee-spec-kit.json'),
      JSON.stringify(
        {
          projectName: 'unit',
          projectType: 'single',
          lang: 'en',
          createdAt: '2026-02-17',
        },
        null,
        2
      ),
      'utf-8'
    );

    const prev = process.env.LEE_SPEC_KIT_DOCS_DIR;
    process.env.LEE_SPEC_KIT_DOCS_DIR = docsDir;
    try {
      const config = await getConfig(path.join(dir, 'somewhere', 'else'));
      assert.ok(config);
      assert.equal(config?.docsDir, docsDir);
      assert.equal(config?.projectType, 'single');
      assert.equal(config?.lang, 'en');
    } finally {
      if (prev === undefined) {
        delete process.env.LEE_SPEC_KIT_DOCS_DIR;
      } else {
        process.env.LEE_SPEC_KIT_DOCS_DIR = prev;
      }
    }
  });
});

test('pre-pr path evidence accepts portable docs and feature-relative paths', async () => {
  await withTempDir('lsk-unit-pre-pr-paths-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    const featureDir = path.join(docsDir, 'features', 'F001-alpha');
    const decisionsPath = path.join(featureDir, 'decisions.md');
    await fs.mkdir(featureDir, { recursive: true });
    await fs.writeFile(decisionsPath, '# Decisions\n', 'utf-8');

    for (const evidence of [
      'docs\\features\\F001-alpha\\decisions.md',
      'Docs/features/F001-alpha/decisions.md',
      'decisions.md',
      decisionsPath,
    ]) {
      assert.equal(
        isPrePrEvidenceSatisfied({
          docsDir,
          featureDir,
          evidence,
          evidenceMode: undefined,
        }),
        true,
        evidence
      );
    }
  });
});

test('pre-pr path evidence fails closed for missing paths and symlink escapes', async () => {
  await withTempDir('lsk-unit-pre-pr-containment-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    const featureDir = path.join(docsDir, 'features', 'F001-alpha');
    const outsidePath = path.join(dir, 'outside.md');
    const symlinkPath = path.join(featureDir, 'outside-link.md');
    await fs.mkdir(featureDir, { recursive: true });
    await fs.writeFile(outsidePath, '# Outside\n', 'utf-8');
    await fs.symlink(outsidePath, symlinkPath);

    assert.equal(
      isPrePrEvidenceSatisfied({
        docsDir,
        featureDir,
        evidence: symlinkPath,
        evidenceMode: 'path_required',
      }),
      false
    );
    assert.equal(
      isPrePrEvidenceSatisfied({
        docsDir: path.join(dir, 'missing-docs'),
        featureDir,
        evidence: 'decisions.md',
        evidenceMode: 'path_required',
      }),
      false
    );
  });
});

test('pre-pr path evidence supports standalone docs directories', async () => {
  await withTempDir('lsk-unit-pre-pr-standalone-', async (dir) => {
    const docsDir = path.join(dir, 'spec-repository');
    const featureDir = path.join(docsDir, 'features', 'F001-alpha');
    await fs.mkdir(featureDir, { recursive: true });
    await fs.writeFile(
      path.join(featureDir, 'decisions.md'),
      '# Decisions\n',
      'utf-8'
    );

    assert.equal(
      isPrePrEvidenceSatisfied({
        docsDir,
        featureDir,
        evidence: 'decisions.md',
        evidenceMode: 'path_required',
      }),
      true
    );
  });
});

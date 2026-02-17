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

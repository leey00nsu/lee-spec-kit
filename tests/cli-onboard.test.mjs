import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runCli, withTempDir } from './helpers/cli-contract-helpers.mjs';

test('onboard --json returns CONFIG_NOT_FOUND when docs are missing', async () => {
  await withTempDir('lsk-onboard-missing-config-', async (dir) => {
    const result = await runCli(dir, ['onboard', '--json']);
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'CONFIG_NOT_FOUND');
    assert.equal(Array.isArray(payload.suggestions), true);
  });
});

test('onboard --json returns structured onboarding checks after init', async () => {
  await withTempDir('lsk-onboard-json-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--yes',
      '--name',
      'OnboardJson',
      '--type',
      'single',
      '--lang',
      'en',
      '--workflow',
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const result = await runCli(dir, ['onboard', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(typeof payload.reasonCode, 'string');
    assert.equal(typeof payload.docsDir, 'string');
    assert.equal(typeof payload.summary?.ok, 'number');
    assert.equal(typeof payload.summary?.warn, 'number');
    assert.equal(typeof payload.summary?.block, 'number');
    assert.equal(Array.isArray(payload.checks), true);
    assert.equal(payload.checks.length > 0, true);
    assert.equal(
      payload.checks.some((check) => check.id === 'docs_git_repo'),
      true
    );
  });
});

test('onboard --strict exits non-zero when warnings or blocks exist', async () => {
  await withTempDir('lsk-onboard-strict-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--yes',
      '--name',
      'OnboardStrict',
      '--type',
      'single',
      '--lang',
      'en',
      '--workflow',
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const result = await runCli(dir, ['onboard', '--strict', '--json']);
    assert.equal(result.code, 1, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.summary.warn + payload.summary.block > 0, true);
  });
});

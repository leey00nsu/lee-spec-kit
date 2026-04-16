import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runCli, withTempDir } from './helpers/cli-contract-helpers.mjs';

async function initRepo(dir) {
  const initResult = await runCli(dir, [
    'init',
    '--non-interactive',
    '--name',
    'demo',
    '--type',
    'single',
    '--lang',
    'en',
    '--workflow',
    'local',
    '--dir',
    './docs',
  ]);
  assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);
}

test('detect --json reports a lee-spec-kit project from the workspace root', async () => {
  await withTempDir('lsk-detect-contract-detected-', async (dir) => {
    await initRepo(dir);

    const result = await runCli(dir, ['detect', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PROJECT_DETECTED');
    assert.equal(payload.isLeeSpecKitProject, true);
    assert.equal(payload.projectType, 'single');
    assert.equal(payload.lang, 'en');
    assert.match(String(payload.docsDir || ''), /\/docs$/);
  });
});

test('detect --json reports non-project directories without failing', async () => {
  await withTempDir('lsk-detect-contract-miss-', async (dir) => {
    const result = await runCli(dir, ['detect', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PROJECT_NOT_DETECTED');
    assert.equal(payload.isLeeSpecKitProject, false);
    assert.equal(payload.docsDir, null);
  });
});

test('docs list --json exposes builtin policy docs with machine commands', async () => {
  await withTempDir('lsk-docs-list-contract-', async (dir) => {
    await initRepo(dir);

    const result = await runCli(dir, ['docs', 'list', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'DOCS_LISTED');
    assert.equal(payload.projectType, 'single');
    assert.equal(payload.lang, 'en');
    assert.equal(Array.isArray(payload.docs), true);
    assert.equal(
      payload.docs.some(
        (entry) =>
          entry.id === 'agents' &&
          entry.command === 'npx lee-spec-kit docs get agents --json'
      ),
      true
    );
  });
});

test('docs get agents --json returns the builtin agent contract and followups', async () => {
  await withTempDir('lsk-docs-get-contract-', async (dir) => {
    await initRepo(dir);

    const result = await runCli(dir, ['docs', 'get', 'agents', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'DOC_FETCHED');
    assert.equal(payload.doc.id, 'agents');
    assert.match(String(payload.doc.source || ''), /^builtin:\/\//);
    assert.equal(typeof payload.doc.hash, 'string');
    assert.equal(typeof payload.doc.content, 'string');
    assert.equal(Array.isArray(payload.requiredDocs), true);
    assert.equal(
      payload.requiredDocs.every(
        (entry) => typeof entry.id === 'string' && typeof entry.command === 'string'
      ),
      true
    );
  });
});

test('docs get --json reports invalid doc ids through the machine-readable error contract', async () => {
  await withTempDir('lsk-docs-get-invalid-contract-', async (dir) => {
    await initRepo(dir);

    const result = await runCli(dir, ['docs', 'get', 'not-a-doc', '--json']);
    assert.equal(result.code, 1);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'INVALID_ARGUMENT');
    assert.equal(typeof payload.error, 'string');
    assert.equal(Array.isArray(payload.suggestions), true);
  });
});

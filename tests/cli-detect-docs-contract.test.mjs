import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

async function initRepo(dir, lang = 'en') {
  const initResult = await runCli(dir, [
    'init',
    '--non-interactive',
    '--name',
    'demo',
    '--type',
    'single',
    '--lang',
    lang,
    '--workflow',
    'local',
    '--dir',
    './docs',
  ]);
  assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);
}

for (const lang of ['en', 'ko']) {
  test(`performance-evidence exposes only the localized ADR guidance on demand (${lang})`, async () => {
    await withTempDir('lsk-performance-evidence-', async (dir) => {
      await initRepo(dir, lang);
      const list = await runCli(dir, ['docs', 'list', '--json']);
      assert.equal(list.code, 0, list.stderr || list.stdout);
      assert.ok(JSON.parse(list.stdout).docs.some((entry) => entry.id === 'performance-evidence'));

      const result = await runCli(dir, ['docs', 'get', 'performance-evidence', '--json']);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.doc.id, 'performance-evidence');
      assert.deepEqual(payload.requiredDocs, []);
      assert.match(payload.doc.content, lang === 'ko' ? /^## 성능 개선 근거 기록/ : /^## Performance improvement evidence/);
      assert.match(payload.doc.content, /### Performance Evidence/);
      assert.match(payload.doc.content, /artifacts\/performance\//);
      assert.doesNotMatch(payload.doc.content, /^## (?:D001:|Spec Clarification|Spec 결정 확인)/m);

      const startup = await runCli(dir, ['docs', 'get', 'agents', '--json']);
      assert.equal(startup.code, 0, startup.stderr || startup.stdout);
      assert.ok(!JSON.parse(startup.stdout).requiredDocs.some((entry) => entry.id === 'performance-evidence'));

      const created = await runCli(dir, ['feature', 'measurement-example', '--id', 'F001']);
      assert.equal(created.code, 0, created.stderr || created.stdout);
      const decisionsPath = path.join(dir, 'docs', 'features', 'F001-measurement-example', 'decisions.md');
      const before = await fs.readFile(decisionsPath, 'utf8');
      // Existing Features consume current built-in guidance without a document rewrite.
      const fetchedAgain = await runCli(dir, ['docs', 'get', 'performance-evidence', '--json']);
      assert.equal(fetchedAgain.code, 0, fetchedAgain.stderr || fetchedAgain.stdout);
      assert.equal(JSON.parse(fetchedAgain.stdout).doc.hash, payload.doc.hash);
      assert.equal(await fs.readFile(decisionsPath, 'utf8'), before);
    });
  });
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
    assert.match(payload.doc.content, /repeated bounded waits/i);
    assert.match(
      payload.doc.content,
      /lack of status messages, or a lack of file changes.*none is evidence of failure or stalled work/i
    );
    assert.equal(Array.isArray(payload.requiredDocs), true);
    assert.equal(
      payload.requiredDocs.every(
        (entry) =>
          typeof entry.id === 'string' && typeof entry.command === 'string'
      ),
      true
    );

    const workspaceAgents = await fs.readFile(
      path.join(dir, 'AGENTS.md'),
      'utf-8'
    );
    assert.match(workspaceAgents, /repeated bounded waits/i);
    assert.match(
      workspaceAgents,
      /Do not interrupt, replace, or abandon a running subagent solely because it has been quiet or has not changed files/i
    );

    const executeTaskResult = await runCli(dir, [
      'docs',
      'get',
      'execute-task',
      '--json',
    ]);
    assert.equal(
      executeTaskResult.code,
      0,
      executeTaskResult.stderr || executeTaskResult.stdout
    );
    const executeTaskPayload = JSON.parse(executeTaskResult.stdout.trim());
    assert.match(executeTaskPayload.doc.content, /repeated bounded waits/i);
    assert.match(
      executeTaskPayload.doc.content,
      /no update, no status message, or no file change is not evidence of failure or stalled work/i
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

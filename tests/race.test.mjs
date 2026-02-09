import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntrypoint = path.join(rootDir, 'dist', 'index.js');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCli(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliEntrypoint, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function withTempDir(prefix, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function withTempRoot(prefix, run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('feature started before init still succeeds via lock/wait', async () => {
  await withTempDir('lsk-race-init-feature-', async (dir) => {
    const featurePromise = runCli(dir, ['feature', 'race-feature', '--desc', 'race']);
    await sleep(30);
    const initPromise = runCli(dir, [
      'init',
      '-t',
      'single',
      '-l',
      'ko',
      '--workflow',
      'local',
      '-y',
    ]);

    const [featureResult, initResult] = await Promise.all([
      featurePromise,
      initPromise,
    ]);

    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const featureDir = path.join(dir, 'docs', 'features', 'F001-race-feature');
    await fs.access(featureDir);
  });
});

test('two concurrent feature commands allocate unique sequential IDs', async () => {
  await withTempDir('lsk-race-feature-feature-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '-t',
      'single',
      '-l',
      'ko',
      '--workflow',
      'local',
      '-y',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const [alphaResult, betaResult] = await Promise.all([
      runCli(dir, ['feature', 'alpha', '--desc', 'a']),
      runCli(dir, ['feature', 'beta', '--desc', 'b']),
    ]);

    assert.equal(alphaResult.code, 0, alphaResult.stderr || alphaResult.stdout);
    assert.equal(betaResult.code, 0, betaResult.stderr || betaResult.stdout);

    const featuresRoot = path.join(dir, 'docs', 'features');
    const entries = await fs.readdir(featuresRoot, { withFileTypes: true });
    const featureFolders = entries
      .filter((entry) => entry.isDirectory() && /^F\d+-/.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    assert.equal(featureFolders.length, 2);

    const ids = featureFolders.map((name) => name.match(/^F\d+/)?.[0]).sort();
    assert.deepEqual(ids, ['F001', 'F002']);

    const names = new Set(featureFolders.map((name) => name.replace(/^F\d+-/, '')));
    assert.deepEqual(names, new Set(['alpha', 'beta']));
  });
});

test('feature started before init ignores unrelated ancestor docs fallback', async () => {
  await withTempRoot('lsk-race-ancestor-docs-', async (root) => {
    const ancestor = path.join(root, 'workspace');
    const projectDir = path.join(ancestor, 'project');
    const unrelatedDocs = path.join(ancestor, 'docs');
    await fs.mkdir(projectDir, { recursive: true });

    // Simulate legacy docs-like structure without .lee-spec-kit.json at ancestor level.
    await fs.mkdir(path.join(unrelatedDocs, 'agents'), { recursive: true });
    await fs.mkdir(path.join(unrelatedDocs, 'features', 'feature-base'), {
      recursive: true,
    });

    const featurePromise = runCli(projectDir, ['feature', 'scoped-feature']);
    await sleep(30);
    const initPromise = runCli(projectDir, [
      'init',
      '-t',
      'single',
      '-l',
      'en',
      '--workflow',
      'local',
      '-y',
    ]);

    const [featureResult, initResult] = await Promise.all([
      featurePromise,
      initPromise,
    ]);

    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const expectedFeatureDir = path.join(
      projectDir,
      'docs',
      'features',
      'F001-scoped-feature'
    );
    await fs.access(expectedFeatureDir);

    const wrongFeatureDir = path.join(
      unrelatedDocs,
      'features',
      'F001-scoped-feature'
    );
    await assert.rejects(() => fs.access(wrongFeatureDir));
  });
});

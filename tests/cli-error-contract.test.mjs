import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntrypoint = path.join(rootDir, 'dist', 'index.js');

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

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
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

test('init --non-interactive works with explicit flags without --yes', async () => {
  await withTempDir('lsk-init-noninteractive-', async (dir) => {
    const result = await runCli(dir, [
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

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const configRaw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configRaw);

    assert.equal(config.projectName, 'demo');
    assert.equal(config.projectType, 'single');
    assert.equal(config.lang, 'en');
    assert.equal(config.workflow?.mode, 'local');
  });
});

test('doctor --json error includes reasonCode and labeled suggestions', async () => {
  await withTempDir('lsk-doctor-error-json-', async (dir) => {
    const result = await runCli(dir, ['doctor', '--json']);
    assert.equal(result.code, 1);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'CONFIG_NOT_FOUND');
    assert.ok(Array.isArray(payload.suggestions));
    assert.equal(payload.suggestions.length > 0, true);
    assert.equal(payload.suggestions[0].label, 'A');
  });
});

test('status text-mode errors include reason code and labeled next options', async () => {
  await withTempDir('lsk-status-error-text-', async (dir) => {
    const result = await runCli(dir, ['status']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[CONFIG_NOT_FOUND\]/);
    assert.match(result.stderr, /Next Options \(Error\)/);
    assert.match(result.stderr, /\n\s*A\. /);
  });
});

test('Korean localized suggestions are shown for PROMPT_BLOCKED', async () => {
  await withTempDir('lsk-prompts-ko-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, 'keep.txt'), 'x\n', 'utf-8');

    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--lang',
      'ko',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[PROMPT_BLOCKED\]/);
    assert.match(result.stderr, /다음 옵션 \(오류\)/);
    assert.match(result.stderr, /--non-interactive 없이 같은 명령을 다시 실행하세요/);
  });
});

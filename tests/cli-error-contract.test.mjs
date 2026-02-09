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

async function setFeatureAsDone(dir, featureFolderName) {
  const match = featureFolderName.match(/^F\d+-(.+)$/);
  const featureName = match?.[1] || featureFolderName;
  const featureDir = path.join(dir, 'docs', 'features', featureFolderName);

  const spec = `# Feature Spec: ${featureName}

## Overview

- **Feature ID**: ${featureFolderName.slice(0, 4)}
- **Feature Name**: ${featureName}
- **Target Repo**: demo
- **Issue Number**: #
- **Created**: 2026-02-08
- **Status**: Approved
`;

  const plan = `# Implementation Plan: ${featureName}

## Overview

- **Feature ID**: ${featureFolderName.slice(0, 4)}
- **Target Repo**: demo
- **Created**: 2026-02-08
- **Status**: Approved
`;

  const tasks = `# Tasks: ${featureName}

## GitHub Issue

- **Doc Status**: Approved
- **Repo**: demo
- **Issue**: #
- **Branch**: feat/-${featureName}
- **PR**: -
- **PR Status**: -

## Task List

- [DONE] T-${featureFolderName}-01 ${featureName}

## Completion Criteria

- [x] done
`;

  await fs.writeFile(path.join(featureDir, 'spec.md'), spec, 'utf-8');
  await fs.writeFile(path.join(featureDir, 'plan.md'), plan, 'utf-8');
  await fs.writeFile(path.join(featureDir, 'tasks.md'), tasks, 'utf-8');
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

test('init standalone non-interactive supports explicit standalone options', async () => {
  await withTempDir('lsk-init-standalone-', async (dir) => {
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
      '--docs-repo',
      'standalone',
      '--project-root',
      '/tmp/project-root',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.docsRepo, 'standalone');
    assert.equal(config.projectRoot, '/tmp/project-root');
    assert.equal(config.pushDocs, false);
  });
});

test('init non-interactive can overwrite non-empty directory with --force', async () => {
  await withTempDir('lsk-init-force-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, 'keep.txt'), 'x\n', 'utf-8');

    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--force',
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

test('status --json returns NO_FEATURES on initialized empty docs', async () => {
  await withTempDir('lsk-status-json-', async (dir) => {
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

    const result = await runCli(dir, ['status', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'NO_FEATURES');
  });
});

test('local workflow templates reduce issue/pr focused fields', async () => {
  await withTempDir('lsk-local-template-', async (dir) => {
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

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const baseSpec = await fs.readFile(
      path.join(dir, 'docs', 'features', 'feature-base', 'spec.md'),
      'utf-8'
    );
    const baseTasks = await fs.readFile(
      path.join(dir, 'docs', 'features', 'feature-base', 'tasks.md'),
      'utf-8'
    );
    const featureSpec = await fs.readFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'spec.md'),
      'utf-8'
    );
    const featureTasks = await fs.readFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      'utf-8'
    );

    assert.doesNotMatch(baseSpec, /\*\*Issue Number\*\*:/);
    assert.doesNotMatch(featureSpec, /\*\*Issue Number\*\*:/);
    assert.doesNotMatch(baseTasks, /## GitHub Issue/);
    assert.doesNotMatch(featureTasks, /## GitHub Issue/);
    assert.match(baseTasks, /## Local Tracking/);
    assert.match(featureTasks, /## Local Tracking/);
    assert.doesNotMatch(featureTasks, /\*\*PR\*\*:/);
    assert.doesNotMatch(featureTasks, /\*\*PR Status\*\*:/);
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

test('context --json exposes generic label token policy', async () => {
  await withTempDir('lsk-context-token-policy-', async (dir) => {
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

    const result = await runCli(dir, ['context', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.checkPolicy.token, '<LABEL>');
    assert.deepEqual(payload.checkPolicy.acceptedTokens, [
      '<LABEL>',
      '<LABEL> OK',
    ]);
    assert.equal(payload.checkPolicy.tokenPattern, '^([A-Z]+)(?:\\s+OK)?$');
  });
});

test('status --json marks workflow completion as WORKFLOW_DONE', async () => {
  await withTempDir('lsk-status-workflow-done-', async (dir) => {
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

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const result = await runCli(dir, ['status', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.counts.workflowDone, 1);
    assert.equal(payload.counts.implementationDone, 1);
    assert.equal(payload.features[0].status, 'WORKFLOW_DONE');
  });
});

test('context warns when feature docs path is ignored by git', async () => {
  await withTempDir('lsk-context-ignore-warning-', async (dir) => {
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

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    await fs.writeFile(
      path.join(dir, 'docs', '.gitignore'),
      'features/F001-alpha/\n',
      'utf-8'
    );

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    const warnings = payload?.matchedFeature?.warnings || [];
    assert.equal(
      warnings.some((warning) => /ignored by git/i.test(String(warning))),
      true
    );
  });
});

test('status --strict returns DUPLICATE_FEATURE_ID when duplicate IDs exist', async () => {
  await withTempDir('lsk-status-duplicate-id-', async (dir) => {
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

    const f1 = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    const f2 = await runCli(dir, ['feature', 'beta', '--id', 'F001']);
    assert.equal(f1.code, 0, f1.stderr || f1.stdout);
    assert.equal(f2.code, 0, f2.stderr || f2.stdout);

    const strict = await runCli(dir, ['status', '--strict']);
    assert.equal(strict.code, 1);
    assert.match(strict.stderr, /\[DUPLICATE_FEATURE_ID\]/);
  });
});

test('status --strict returns MISSING_FEATURE_ID when feature folder ID is missing', async () => {
  await withTempDir('lsk-status-missing-id-', async (dir) => {
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

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    await fs.rename(
      path.join(dir, 'docs', 'features', 'F001-alpha'),
      path.join(dir, 'docs', 'features', 'alpha')
    );

    const strict = await runCli(dir, ['status', '--strict']);
    assert.equal(strict.code, 1);
    assert.match(strict.stderr, /\[MISSING_FEATURE_ID\]/);
  });
});

test('status --strict prioritizes missing IDs over duplicate UNKNOWN buckets', async () => {
  await withTempDir('lsk-status-missing-priority-', async (dir) => {
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

    const f1 = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    const f2 = await runCli(dir, ['feature', 'beta', '--id', 'F002']);
    assert.equal(f1.code, 0, f1.stderr || f1.stdout);
    assert.equal(f2.code, 0, f2.stderr || f2.stdout);

    await fs.rename(
      path.join(dir, 'docs', 'features', 'F001-alpha'),
      path.join(dir, 'docs', 'features', 'alpha')
    );
    await fs.rename(
      path.join(dir, 'docs', 'features', 'F002-beta'),
      path.join(dir, 'docs', 'features', 'beta')
    );

    const strict = await runCli(dir, ['status', '--strict']);
    assert.equal(strict.code, 1);
    assert.match(strict.stderr, /\[MISSING_FEATURE_ID\]/);
    assert.doesNotMatch(strict.stderr, /\[DUPLICATE_FEATURE_ID\]/);
  });
});

test('status --strict catches missing IDs even when spec/tasks are absent', async () => {
  await withTempDir('lsk-status-missing-no-docs-', async (dir) => {
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

    await fs.mkdir(path.join(dir, 'docs', 'features', 'alpha'), {
      recursive: true,
    });

    const strict = await runCli(dir, ['status', '--strict']);
    assert.equal(strict.code, 1);
    assert.match(strict.stderr, /\[MISSING_FEATURE_ID\]/);
  });
});

test('init invalid project type returns INVALID_ARGUMENT', async () => {
  await withTempDir('lsk-init-invalid-type-', async (dir) => {
    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'wrong',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[INVALID_ARGUMENT\]/);
  });
});

test('feature --repo in single project returns INVALID_ARGUMENT', async () => {
  await withTempDir('lsk-feature-single-repo-', async (dir) => {
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

    const result = await runCli(dir, ['feature', 'alpha', '--repo', 'fe']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[INVALID_ARGUMENT\]/);
  });
});

test('update reports PRECONDITION_FAILED when git status is unavailable', async () => {
  await withTempDir('lsk-update-precondition-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(path.join(docsDir, 'agents'), { recursive: true });
    await fs.mkdir(path.join(docsDir, 'features'), { recursive: true });
    await fs.mkdir(path.join(docsDir, 'prd'), { recursive: true });
    await fs.mkdir(path.join(docsDir, 'designs'), { recursive: true });
    await fs.mkdir(path.join(docsDir, 'ideas'), { recursive: true });

    await fs.writeFile(
      path.join(docsDir, '.lee-spec-kit.json'),
      JSON.stringify(
        {
          projectName: 'demo',
          projectType: 'single',
          lang: 'en',
          createdAt: '2026-02-08',
        },
        null,
        2
      ),
      'utf-8'
    );

    const result = await runCli(dir, ['update']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[PRECONDITION_FAILED\]/);
  });
});

test('context handles no-open state without crashing', async () => {
  await withTempDir('lsk-context-no-open-', async (dir) => {
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

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    await setFeatureAsDone(dir, 'F001-alpha');

    const jsonResult = await runCli(dir, ['context', '--json']);
    assert.equal(jsonResult.code, 0, jsonResult.stderr || jsonResult.stdout);
    const payload = JSON.parse(jsonResult.stdout.trim());
    assert.equal(payload.status, 'no_open');
    assert.equal(payload.reasonCode, 'NO_OPEN_FEATURES');

    const textResult = await runCli(dir, ['context']);
    assert.equal(textResult.code, 0, textResult.stderr || textResult.stdout);
  });
});

test('step7 uses docs update commit message when implementation is already done', async () => {
  await withTempDir('lsk-context-step7-message-', async (dir) => {
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

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    await setFeatureAsDone(dir, 'F001-alpha');

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 7);
    const cmd = payload.actions?.[0]?.cmd || '';
    assert.match(cmd, /git commit -m "docs: F001-alpha docs update"/);
    assert.doesNotMatch(cmd, /docs\(planning\):/);
  });
});

test('parallel context execution is serialized and both commands succeed', async () => {
  await withTempDir('lsk-context-parallel-exec-', async (dir) => {
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

    const f1 = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    const f2 = await runCli(dir, ['feature', 'beta', '--id', 'F002']);
    assert.equal(f1.code, 0, f1.stderr || f1.stdout);
    assert.equal(f2.code, 0, f2.stderr || f2.stdout);

    await setFeatureAsDone(dir, 'F001-alpha');
    await setFeatureAsDone(dir, 'F002-beta');

    const [r1, r2] = await Promise.all([
      runCli(dir, [
        'context',
        'F001-alpha',
        '--approve',
        'A',
        '--execute',
        '--json',
      ]),
      runCli(dir, [
        'context',
        'F002-beta',
        '--approve',
        'A',
        '--execute',
        '--json',
      ]),
    ]);

    assert.equal(r1.code, 0, r1.stderr || r1.stdout);
    assert.equal(r2.code, 0, r2.stderr || r2.stdout);

    const p1 = JSON.parse(r1.stdout.trim());
    const p2 = JSON.parse(r2.stdout.trim());
    assert.equal(p1.status, 'approved_executed');
    assert.equal(p2.status, 'approved_executed');
  });
});

test('context --execute-strict fails for instruction-only approved option', async () => {
  await withTempDir('lsk-context-execute-strict-', async (dir) => {
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

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const result = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--execute-strict',
      '--json',
    ]);
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'EXECUTION_NOT_COMMAND');
  });
});

test('--no-banner hides ASCII banner in help output', async () => {
  await withTempDir('lsk-no-banner-help-', async (dir) => {
    const result = await runCli(dir, ['--no-banner', '--help']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, /░██/);
    assert.match(result.stdout, /Usage: lee-spec-kit/);
  });
});

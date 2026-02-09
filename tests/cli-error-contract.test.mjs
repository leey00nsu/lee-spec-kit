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

function runCommand(cwd, command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
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

async function setMultiFeatureAsDone(dir, component, featureFolderName) {
  const match = featureFolderName.match(/^F\d+-(.+)$/);
  const featureName = match?.[1] || featureFolderName;
  const featureDir = path.join(dir, 'docs', 'features', component, featureFolderName);

  const spec = `# Feature Spec: ${featureName}

## Overview

- **Feature ID**: ${featureFolderName.slice(0, 4)}
- **Feature Name**: ${featureName}
- **Target Repo**: ${component}
- **Issue Number**: #
- **Created**: 2026-02-08
- **Status**: Approved
`;

  const plan = `# Implementation Plan: ${featureName}

## Overview

- **Feature ID**: ${featureFolderName.slice(0, 4)}
- **Target Repo**: ${component}
- **Created**: 2026-02-08
- **Status**: Approved
`;

  const tasks = `# Tasks: ${featureName}

## GitHub Issue

- **Doc Status**: Approved
- **Repo**: ${component}
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

test('fullstack init supports custom components and feature --component', async () => {
  await withTempDir('lsk-components-custom-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'fullstack',
      '--components',
      'fe,be,worker',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.projectType, 'multi');
    assert.deepEqual(config.components, ['fe', 'be', 'worker']);

    const featureResult = await runCli(dir, [
      'feature',
      'queue-jobs',
      '--component',
      'worker',
      '--id',
      'F001',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const featureDir = path.join(dir, 'docs', 'features', 'worker', 'F001-queue-jobs');
    const exists = await fs.stat(featureDir);
    assert.equal(exists.isDirectory(), true);

    const status = await runCli(dir, ['status', '--json']);
    assert.equal(status.code, 0, status.stderr || status.stdout);
    const payload = JSON.parse(status.stdout.trim());
    assert.equal(payload.features[0].repo, 'demo-worker');
  });
});

test('feature --component rejects unknown component in fullstack project', async () => {
  await withTempDir('lsk-components-invalid-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'fullstack',
      '--components',
      'fe,be,worker',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const featureResult = await runCli(dir, [
      'feature',
      'queue-jobs',
      '--component',
      'mobile',
    ]);
    assert.equal(featureResult.code, 1);
    assert.match(featureResult.stderr, /\[INVALID_ARGUMENT\]/);
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

test('doctor --dry-run without --fix returns INVALID_ARGUMENT', async () => {
  await withTempDir('lsk-doctor-dryrun-invalid-', async (dir) => {
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

    const result = await runCli(dir, ['doctor', '--dry-run']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[INVALID_ARGUMENT\]/);
  });
});

test('doctor --fix --dry-run reports fixes without modifying files', async () => {
  await withTempDir('lsk-doctor-fix-dryrun-', async (dir) => {
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

    const specPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'spec.md');
    await fs.writeFile(
      specPath,
      `# Feature Spec: alpha

## Overview

- **Feature ID**: F001
- **Feature Name**: alpha
- **Created**: 2026-02-08
- **Status**: Review
- Placeholder: {Story Title}
`,
      'utf-8'
    );
    const before = await fs.readFile(specPath, 'utf-8');

    const result = await runCli(dir, ['doctor', '--fix', '--dry-run', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.fixes.enabled, true);
    assert.equal(payload.fixes.dryRun, true);
    assert.equal(payload.fixes.changedFiles > 0, true);

    const after = await fs.readFile(specPath, 'utf-8');
    assert.equal(after, before);
  });
});

test('doctor --fix applies safe fixes to tasks doc status', async () => {
  await withTempDir('lsk-doctor-fix-apply-', async (dir) => {
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

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    await fs.writeFile(
      tasksPath,
      `# Tasks: alpha

## Local Tracking

- **Repo**: demo
- **Branch**: feat/1-alpha

## Task List

- [TODO] T-F001-alpha-01 example
`,
      'utf-8'
    );

    const result = await runCli(dir, ['doctor', '--fix', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.fixes.enabled, true);
    assert.equal(payload.fixes.dryRun, false);
    assert.equal(payload.fixes.changedFiles > 0, true);

    const tasksAfter = await fs.readFile(tasksPath, 'utf-8');
    assert.match(tasksAfter, /\*\*Doc Status\*\*:\s*Review/);
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
    assert.equal(payload.checkPolicy.requireExplanationBeforeApproval, true);
    assert.deepEqual(payload.checkPolicy.requiredExplanationFields, [
      'actionOptions[].summary',
      'actionOptions[].approvalPrompt',
    ]);
  });
});

test('context --json actionOptions include summary and approvalPrompt', async () => {
  await withTempDir('lsk-context-action-summary-', async (dir) => {
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

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'single_matched');
    assert.equal(Array.isArray(payload.actionOptions), true);
    assert.equal(payload.actionOptions.length > 0, true);
    assert.equal(typeof payload.actionOptions[0].summary, 'string');
    assert.equal(payload.actionOptions[0].summary.length > 0, true);
    assert.equal(typeof payload.actionOptions[0].approvalPrompt, 'string');
    assert.match(payload.actionOptions[0].approvalPrompt, /^[A-Z]+:\s+/);
    assert.equal(Array.isArray(payload.approvalRequest?.options), true);
    assert.equal(payload.approvalRequest.options.length, payload.actionOptions.length);
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
    const docsGitRoot = path.join(dir, 'docs');
    const docsEmail = await runCommand(docsGitRoot, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(docsEmail.code, 0, docsEmail.stderr || docsEmail.stdout);
    const docsName = await runCommand(docsGitRoot, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(docsName.code, 0, docsName.stderr || docsName.stdout);
    const docsAdd = await runCommand(docsGitRoot, 'git', [
      'add',
      'features/F001-alpha',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: F001-alpha done',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

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

test('update succeeds on clean docs worktree (internal lock ignored)', async () => {
  await withTempDir('lsk-update-clean-lock-', async (dir) => {
    const gitInit = await runCommand(dir, 'git', ['init']);
    assert.equal(gitInit.code, 0, gitInit.stderr || gitInit.stdout);
    const gitEmail = await runCommand(dir, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(gitEmail.code, 0, gitEmail.stderr || gitEmail.stdout);
    const gitName = await runCommand(dir, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

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

    const updateResult = await runCli(dir, ['update']);
    assert.equal(updateResult.code, 0, updateResult.stderr || updateResult.stdout);
    assert.doesNotMatch(updateResult.stderr, /\[PRECONDITION_FAILED\]/);
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
    const docsGitRoot = path.join(dir, 'docs');
    const docsEmail = await runCommand(docsGitRoot, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(docsEmail.code, 0, docsEmail.stderr || docsEmail.stdout);
    const docsName = await runCommand(docsGitRoot, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(docsName.code, 0, docsName.stderr || docsName.stdout);
    const docsAdd = await runCommand(docsGitRoot, 'git', [
      'add',
      'features/F001-alpha',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: F001-alpha done',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

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

test('context treats docs-only changes as docs dirty (not project dirty) in embedded mode', async () => {
  await withTempDir('lsk-context-embedded-docs-only-dirty-', async (dir) => {
    const gitInit = await runCommand(dir, 'git', ['init']);
    assert.equal(gitInit.code, 0, gitInit.stderr || gitInit.stdout);
    const gitEmail = await runCommand(dir, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(gitEmail.code, 0, gitEmail.stderr || gitEmail.stdout);
    const gitName = await runCommand(dir, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

    await fs.writeFile(path.join(dir, 'app.js'), "console.log('app');\n", 'utf-8');
    const baseCommit = await runCommand(dir, 'git', ['add', 'app.js']);
    assert.equal(baseCommit.code, 0, baseCommit.stderr || baseCommit.stdout);
    const initCommit = await runCommand(dir, 'git', ['commit', '-m', 'init']);
    assert.equal(initCommit.code, 0, initCommit.stderr || initCommit.stdout);

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

    const docsCommitAdd = await runCommand(dir, 'git', [
      'add',
      'docs/features/F001-alpha',
    ]);
    assert.equal(docsCommitAdd.code, 0, docsCommitAdd.stderr || docsCommitAdd.stdout);
    const docsCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: F001-alpha done',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    await fs.appendFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      '\n<!-- docs tweak -->\n',
      'utf-8'
    );

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.matchedFeature.git.docsHasUncommittedChanges, true);
    assert.equal(payload.matchedFeature.git.projectHasUncommittedChanges, false);
    assert.equal(payload.matchedFeature.completion.workflowDone, false);
    const warnings = payload.matchedFeature.warnings || [];
    assert.equal(
      warnings.some((warning) => /Docs changes are not committed/i.test(String(warning))),
      true
    );
    assert.equal(
      warnings.some((warning) => /Project code changes are not committed/i.test(String(warning))),
      false
    );
  });
});

test('standalone docs dirty marks workflow as not done', async () => {
  await withTempDir('lsk-context-standalone-docs-dirty-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    const docsRoot = path.join(dir, 'docs-repo');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(docsRoot, { recursive: true });

    const gitInitProject = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(gitInitProject.code, 0, gitInitProject.stderr || gitInitProject.stdout);
    const projectEmail = await runCommand(projectRoot, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(projectEmail.code, 0, projectEmail.stderr || projectEmail.stdout);
    const projectName = await runCommand(projectRoot, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(projectName.code, 0, projectName.stderr || projectName.stdout);
    await fs.writeFile(path.join(projectRoot, 'app.js'), "console.log('app');\n", 'utf-8');
    const projectAdd = await runCommand(projectRoot, 'git', ['add', 'app.js']);
    assert.equal(projectAdd.code, 0, projectAdd.stderr || projectAdd.stdout);
    const projectCommit = await runCommand(projectRoot, 'git', ['commit', '-m', 'init']);
    assert.equal(projectCommit.code, 0, projectCommit.stderr || projectCommit.stdout);

    const initResult = await runCli(docsRoot, [
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
      projectRoot,
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const feature = await runCli(docsRoot, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(docsRoot, 'F001-alpha');

    const docsGitRoot = path.join(docsRoot, 'docs');
    const docsEmail = await runCommand(docsGitRoot, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(docsEmail.code, 0, docsEmail.stderr || docsEmail.stdout);
    const docsName = await runCommand(docsGitRoot, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(docsName.code, 0, docsName.stderr || docsName.stdout);
    const docsAdd = await runCommand(docsGitRoot, 'git', [
      'add',
      'features/F001-alpha',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: F001-alpha done',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    await fs.appendFile(
      path.join(docsGitRoot, 'features', 'F001-alpha', 'tasks.md'),
      '\n<!-- docs tweak -->\n',
      'utf-8'
    );

    const context = await runCli(docsRoot, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const contextPayload = JSON.parse(context.stdout.trim());
    assert.equal(contextPayload.matchedFeature.currentStep, 11);
    assert.equal(contextPayload.matchedFeature.git.docsHasUncommittedChanges, true);
    assert.equal(contextPayload.matchedFeature.git.projectHasUncommittedChanges, false);
    assert.equal(contextPayload.matchedFeature.completion.workflowDone, false);

    const status = await runCli(docsRoot, ['status', '--json']);
    assert.equal(status.code, 0, status.stderr || status.stdout);
    const statusPayload = JSON.parse(status.stdout.trim());
    assert.equal(statusPayload.counts.workflowDone, 0);
    assert.equal(statusPayload.features[0].status, 'DONE');
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

test('view --json returns NO_FEATURES on initialized empty docs', async () => {
  await withTempDir('lsk-view-json-', async (dir) => {
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

    const result = await runCli(dir, ['view', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'NO_FEATURES');
    assert.equal(payload.counts.features, 0);
  });
});

test('flow --json aggregates context/status/doctor', async () => {
  await withTempDir('lsk-flow-json-', async (dir) => {
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

    const result = await runCli(dir, ['flow', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.context.before.reasonCode, 'NO_FEATURES');
    assert.equal(payload.statusReport.reasonCode, 'NO_FEATURES');
    assert.equal(payload.doctorReport.status, 'warn');
  });
});

test('flow --json includes approval result when approve is provided', async () => {
  await withTempDir('lsk-flow-approve-', async (dir) => {
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

    const result = await runCli(dir, ['flow', 'F001', '--approve', 'A', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.approval.status, 'approved_selected');
    assert.equal(payload.approval.reasonCode, 'APPROVED_SELECTED');
  });
});

test('context --component scopes fallback selection in multi project', async () => {
  await withTempDir('lsk-context-component-scope-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'web,api',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const webFeature = await runCli(dir, [
      'feature',
      'chat-ui',
      '--component',
      'web',
      '--id',
      'F001',
    ]);
    const apiFeature = await runCli(dir, [
      'feature',
      'chat-api',
      '--component',
      'api',
      '--id',
      'F002',
    ]);
    assert.equal(webFeature.code, 0, webFeature.stderr || webFeature.stdout);
    assert.equal(apiFeature.code, 0, apiFeature.stderr || apiFeature.stdout);

    const webContext = await runCli(dir, ['context', '--component', 'web', '--json']);
    assert.equal(webContext.code, 0, webContext.stderr || webContext.stdout);
    const webPayload = JSON.parse(webContext.stdout.trim());
    assert.equal(webPayload.status, 'single_matched');
    assert.equal(webPayload.matchedFeature.type, 'web');
    assert.equal(
      (webPayload.openCandidates || []).every((feature) => feature.type === 'web'),
      true
    );

    const apiContext = await runCli(dir, ['context', '--repo', 'api', '--json']);
    assert.equal(apiContext.code, 0, apiContext.stderr || apiContext.stdout);
    const apiPayload = JSON.parse(apiContext.stdout.trim());
    assert.equal(apiPayload.status, 'single_matched');
    assert.equal(apiPayload.matchedFeature.type, 'api');
  });
});

test('init writes workflow.codeDirtyScope=auto for new projects', async () => {
  await withTempDir('lsk-init-dirty-scope-auto-', async (dir) => {
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
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.workflow?.codeDirtyScope, 'auto');
  });
});

test('multi auto dirty scope ignores unrelated component changes, missing key defaults to repo', async () => {
  await withTempDir('lsk-context-dirty-scope-multi-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'web,api',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const webFeature = await runCli(dir, [
      'feature',
      'chat-ui',
      '--component',
      'web',
      '--id',
      'F001',
    ]);
    assert.equal(webFeature.code, 0, webFeature.stderr || webFeature.stdout);
    await setMultiFeatureAsDone(dir, 'web', 'F001-chat-ui');

    await fs.mkdir(path.join(dir, 'apps', 'web'), { recursive: true });
    await fs.mkdir(path.join(dir, 'apps', 'api'), { recursive: true });
    await fs.writeFile(path.join(dir, 'apps', 'web', 'index.js'), "console.log('web');\n", 'utf-8');
    await fs.writeFile(path.join(dir, 'apps', 'api', 'index.js'), "console.log('api');\n", 'utf-8');

    const gitInit = await runCommand(dir, 'git', ['init']);
    assert.equal(gitInit.code, 0, gitInit.stderr || gitInit.stdout);
    const gitEmail = await runCommand(dir, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(gitEmail.code, 0, gitEmail.stderr || gitEmail.stdout);
    const gitName = await runCommand(dir, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

    const addAll = await runCommand(dir, 'git', ['add', '-A']);
    assert.equal(addAll.code, 0, addAll.stderr || addAll.stdout);
    const firstCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'baseline',
    ]);
    assert.equal(firstCommit.code, 0, firstCommit.stderr || firstCommit.stdout);

    await fs.appendFile(
      path.join(dir, 'apps', 'api', 'index.js'),
      "console.log('api tweak');\n",
      'utf-8'
    );

    const autoResult = await runCli(dir, [
      'context',
      'F001-chat-ui',
      '--component',
      'web',
      '--json',
    ]);
    assert.equal(autoResult.code, 0, autoResult.stderr || autoResult.stdout);
    const autoPayload = JSON.parse(autoResult.stdout.trim());
    assert.equal(autoPayload.matchedFeature.git.projectHasUncommittedChanges, false);
    assert.equal(autoPayload.matchedFeature.completion.workflowDone, true);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    if (config.workflow) {
      delete config.workflow.codeDirtyScope;
    }
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const legacyResult = await runCli(dir, [
      'context',
      'F001-chat-ui',
      '--component',
      'web',
      '--json',
    ]);
    assert.equal(legacyResult.code, 0, legacyResult.stderr || legacyResult.stdout);
    const legacyPayload = JSON.parse(legacyResult.stdout.trim());
    assert.equal(legacyPayload.matchedFeature.git.projectHasUncommittedChanges, true);
    assert.equal(legacyPayload.matchedFeature.completion.workflowDone, false);
  });
});

test('context recommendation in single project does not mention --component', async () => {
  await withTempDir('lsk-context-single-recommendation-', async (dir) => {
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

    const result = await runCli(dir, ['context', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'multiple_active');
    assert.doesNotMatch(payload.recommendation, /--component/);
  });
});

test('context recommendation with selected component does not re-suggest --component', async () => {
  await withTempDir('lsk-context-multi-recommendation-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'web,api',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const f1 = await runCli(dir, ['feature', 'chat-ui', '--component', 'web', '--id', 'F001']);
    const f2 = await runCli(dir, ['feature', 'chat-theme', '--component', 'web', '--id', 'F002']);
    assert.equal(f1.code, 0, f1.stderr || f1.stdout);
    assert.equal(f2.code, 0, f2.stderr || f2.stdout);

    const result = await runCli(dir, ['context', '--component', 'web', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'multiple_active');
    assert.match(payload.recommendation, /component "web"/);
    assert.doesNotMatch(payload.recommendation, /use --component/i);
  });
});

test('view and flow accept --component and stay scoped', async () => {
  await withTempDir('lsk-view-flow-component-scope-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'web,api',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const webFeature = await runCli(dir, [
      'feature',
      'chat-ui',
      '--component',
      'web',
      '--id',
      'F001',
    ]);
    const apiFeature = await runCli(dir, [
      'feature',
      'chat-api',
      '--component',
      'api',
      '--id',
      'F002',
    ]);
    assert.equal(webFeature.code, 0, webFeature.stderr || webFeature.stdout);
    assert.equal(apiFeature.code, 0, apiFeature.stderr || apiFeature.stdout);

    const viewResult = await runCli(dir, ['view', '--component', 'web', '--json']);
    assert.equal(viewResult.code, 0, viewResult.stderr || viewResult.stdout);
    const viewPayload = JSON.parse(viewResult.stdout.trim());
    assert.equal(viewPayload.counts.features, 1);
    assert.equal(viewPayload.matchedFeature.type, 'web');

    const flowResult = await runCli(dir, ['flow', '--component', 'web', '--json']);
    assert.equal(flowResult.code, 0, flowResult.stderr || flowResult.stdout);
    const flowPayload = JSON.parse(flowResult.stdout.trim());
    assert.equal(flowPayload.context.before.matchedFeature.type, 'web');
    assert.match(flowPayload.suggestion, /--component web/);
  });
});

test('init ignore warning shows repo-relative path and actionable hint', async () => {
  await withTempDir('lsk-init-ignore-warning-', async (dir) => {
    const repoRoot = path.join(dir, 'repo');
    const appDir = path.join(repoRoot, 'workspace', 'app');
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(path.join(repoRoot, '.gitignore'), 'workspace/\n', 'utf-8');

    const child = spawn('git', ['init'], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    const gitCode = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(gitCode, 0);

    const result = await runCli(appDir, [
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
    assert.match(result.stdout, /workspace\/app\/docs/);
    assert.match(result.stdout, /git add -f workspace\/app\/docs/);
  });
});

test('context rejects mismatched --repo and --component values', async () => {
  await withTempDir('lsk-context-mismatch-component-', async (dir) => {
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

    const result = await runCli(dir, [
      'context',
      '--repo',
      'web',
      '--component',
      'api',
      '--json',
    ]);
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'INVALID_ARGUMENT');
  });
});

test('doctor ignores initial template-only warnings for fresh features', async () => {
  await withTempDir('lsk-doctor-initial-template-', async (dir) => {
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

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.counts.issues, 0);

    const dryFix = await runCli(dir, ['doctor', '--fix', '--dry-run', '--json']);
    assert.equal(dryFix.code, 0, dryFix.stderr || dryFix.stdout);
    const dryPayload = JSON.parse(dryFix.stdout.trim());
    assert.equal(dryPayload.fixes.enabled, true);
    assert.equal(dryPayload.fixes.changedFiles, 0);
  });
});

test('config --dir targets the selected docs directory when multiple docs exist', async () => {
  await withTempDir('lsk-config-dir-target-', async (dir) => {
    const embedded = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo-embedded',
      '--type',
      'single',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(embedded.code, 0, embedded.stderr || embedded.stdout);

    const standalone = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo-standalone',
      '--type',
      'single',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs2',
      '--docs-repo',
      'standalone',
      '--project-root',
      '/tmp/project-a',
    ]);
    assert.equal(standalone.code, 0, standalone.stderr || standalone.stdout);

    const configSet = await runCli(dir, [
      'config',
      '--dir',
      './docs2',
      '--project-root',
      '/tmp/project-b',
    ]);
    assert.equal(configSet.code, 0, configSet.stderr || configSet.stdout);

    const docs2Config = JSON.parse(
      await fs.readFile(path.join(dir, 'docs2', '.lee-spec-kit.json'), 'utf-8')
    );
    assert.equal(docs2Config.docsRepo, 'standalone');
    assert.equal(docs2Config.projectRoot, '/tmp/project-b');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntrypoint = path.join(rootDir, 'dist', 'index.js');

function runCli(cwd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliEntrypoint, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...env,
      },
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

async function issueApprovalTicket(cwd, featureRef, reply = 'A', env = {}) {
  const approve = await runCli(
    cwd,
    ['context', featureRef, '--approve', reply, '--json'],
    env
  );
  assert.equal(approve.code, 0, approve.stderr || approve.stdout);
  const payload = JSON.parse(approve.stdout.trim());
  assert.equal(payload.status, 'approved_selected');
  assert.equal(typeof payload?.approvalTicket?.token, 'string');
  assert.equal(payload.approvalTicket.token.length > 0, true);
  return payload.approvalTicket.token;
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function normalizePathForCompare(filePath) {
  try {
    return await fs.realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

async function setupFakeGhCli(dir) {
  const binDir = path.join(dir, 'fake-bin');
  const logPath = path.join(dir, 'gh-invocations.log');
  const cwdLogPath = path.join(dir, 'gh-cwd.log');
  const scriptPath = path.join(binDir, 'gh');
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env bash
echo "$PWD" >> "${cwdLogPath}"
echo "$@" >> "${logPath}"
if [ "$1" = "issue" ] && [ "$2" = "create" ]; then
  echo "https://github.com/acme/repo/issues/123"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  echo "https://github.com/acme/repo/pull/77"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then
  echo "merged"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  echo '{"url":"https://github.com/acme/repo/pull/77","headRefName":"feature-branch","baseRefName":"main"}'
  exit 0
fi
exit 0
`,
    'utf-8'
  );
  await fs.chmod(scriptPath, 0o755);
  return {
    logPath,
    cwdLogPath,
    env: {
      PATH: `${binDir}:${process.env.PATH || ''}`,
    },
  };
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

async function writeIssueBodyWithoutTodo(bodyFile) {
  const body = `## Overview

Implemented issue body for remote creation.

## Goals

- [ ] Define explicit user impact.
- [ ] Define in-scope/out-of-scope.

## Completion Criteria

- [ ] Criteria are testable.
- [ ] Verification steps are documented.

## Related Documents

- **Spec**: \`docs/features/F001-alpha/spec.md\`
- **Plan**: \`docs/features/F001-alpha/plan.md\`
- **Tasks**: \`docs/features/F001-alpha/tasks.md\`

## Labels

- \`enhancement\`
`;
  await fs.writeFile(bodyFile, body, 'utf-8');
}

async function writePrBodyWithoutTodo(bodyFile) {
  const body = `## Overview

Implemented PR body for remote creation.

## Changes

- [ ] Summarize main implementation changes.
- [ ] Summarize migration/impact.

## Tests

### Tests Run

- [ ] \`pnpm test\` — PASS
- [ ] Manual verification completed.

## Related Documents

- **Spec**: \`docs/features/F001-alpha/spec.md\`
- **Tasks**: \`docs/features/F001-alpha/tasks.md\`
`;
  await fs.writeFile(bodyFile, body, 'utf-8');
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

test('init --non-interactive defaults to multi with app component', async () => {
  await withTempDir('lsk-init-default-multi-', async (dir) => {
    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
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
    assert.equal(config.projectType, 'multi');
    assert.deepEqual(config.components, ['app']);
  });
});

test('feature auto-selects the only component in multi mode', async () => {
  await withTempDir('lsk-feature-auto-component-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
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
      'alpha',
      '--id',
      'F001',
      '--non-interactive',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const featureDir = path.join(dir, 'docs', 'features', 'app', 'F001-alpha');
    const exists = await fs.stat(featureDir);
    assert.equal(exists.isDirectory(), true);
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

test('init standalone multi supports custom components with component project roots', async () => {
  await withTempDir('lsk-init-standalone-multi-custom-', async (dir) => {
    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'fe,be,worker',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--docs-repo',
      'standalone',
      '--component-project-roots',
      'fe=/tmp/fe,be=/tmp/be,worker=/tmp/worker',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.docsRepo, 'standalone');
    assert.equal(config.projectType, 'multi');
    assert.deepEqual(config.components, ['fe', 'be', 'worker']);
    assert.deepEqual(config.projectRoot, {
      fe: '/tmp/fe',
      be: '/tmp/be',
      worker: '/tmp/worker',
    });
  });
});

test('init standalone multi requires project roots for every component', async () => {
  await withTempDir('lsk-init-standalone-multi-roots-required-', async (dir) => {
    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'fe,be,worker',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--docs-repo',
      'standalone',
      '--component-project-roots',
      'fe=/tmp/fe,be=/tmp/be',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /\[PROMPT_BLOCKED\]/);
    assert.match(result.stderr, /worker/);
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

test('github issue --create requires --confirm OK', async () => {
  await withTempDir('lsk-github-issue-confirm-required-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-issue-body.md');
    await writeIssueBodyWithoutTodo(bodyFile);

    const result = await runCli(dir, [
      'github',
      'issue',
      'F001-alpha',
      '--create',
      '--body-file',
      bodyFile,
      '--json',
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'APPROVAL_REQUIRED');
  });
});

test('github issue --create succeeds with --confirm OK', async () => {
  await withTempDir('lsk-github-issue-confirm-ok-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-issue-body.md');
    await writeIssueBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'issue',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'ISSUE_CREATED');
    assert.match(String(payload.issueUrl || ''), /\/issues\/123$/);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(log, /^issue create /m);
  });
});

test('github issue default title uses overview summary instead of docs-update suffix', async () => {
  await withTempDir('lsk-github-issue-default-title-summary-', async (dir) => {
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

    const featureResult = await runCli(dir, [
      'feature',
      'daily-theme-hall-of-fame',
      '--id',
      'F013',
      '--desc',
      'Reflect daily winners in hall of fame',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-issue-body.md');
    await writeIssueBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'issue',
        'F013-daily-theme-hall-of-fame',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(
      log,
      /--title daily-theme-hall-of-fame \(Reflect daily winners in hall of fame\)/
    );
    assert.doesNotMatch(log, /documentation update/);
  });
});

test('github issue --create runs gh from standalone project root', async () => {
  await withTempDir('lsk-github-issue-standalone-cwd-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    const docsRoot = path.join(dir, 'docs-repo');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(docsRoot, { recursive: true });

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

    const featureResult = await runCli(docsRoot, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(docsRoot, 'tmp-issue-body.md');
    await writeIssueBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      docsRoot,
      [
        'github',
        'issue',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'ISSUE_CREATED');

    const cwdLog = await fs.readFile(fakeGh.cwdLogPath, 'utf-8');
    const invocations = cwdLog
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const normalizedInvocations = await Promise.all(
      invocations.map((invocation) => normalizePathForCompare(invocation))
    );
    const expectedCwd = await normalizePathForCompare(projectRoot);
    assert.deepEqual([...new Set(normalizedInvocations)], [expectedCwd]);
  });
});

test('github issue --create blocks TODO placeholders even with approval', async () => {
  await withTempDir('lsk-github-issue-todo-block-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-issue-body-todo.md');
    await writeIssueBodyWithoutTodo(bodyFile);
    const bodyWithTodo = (await fs.readFile(bodyFile, 'utf-8')).replace(
      '- [ ] Define explicit user impact.',
      '- [ ] TODO: Define explicit user impact.'
    );
    await fs.writeFile(bodyFile, bodyWithTodo, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'issue',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(payload.error, /TODO placeholders/i);

    const logExists = await pathExists(fakeGh.logPath);
    assert.equal(logExists, false);
  });
});

test('github help is localized based on docs language (ko)', async () => {
  await withTempDir('lsk-github-help-lang-ko-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'single',
      '--lang',
      'ko',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const help = await runCli(dir, ['--no-banner', 'github', 'issue', '--help']);
    assert.equal(help.code, 0, help.stderr || help.stdout);
    assert.match(help.stdout, /feature 문서 기반 GitHub issue 본문 생성\/생성/);
    assert.match(help.stdout, /에이전트용 JSON 형식으로 출력/);
    assert.doesNotMatch(help.stdout, /Output in JSON format for agents/);
  });
});

test('github issue body template uses Korean template when config lang is ko', async () => {
  await withTempDir('lsk-github-issue-ko-template-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'single',
      '--lang',
      'ko',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const result = await runCli(dir, ['github', 'issue', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'ISSUE_TEMPLATE_GENERATED');
    assert.equal(typeof payload.body, 'string');

    const body = await fs.readFile(payload.bodyFile, 'utf-8');
    assert.equal(payload.body, body);
    assert.match(body, /^## 개요$/m);
    assert.match(body, /^## 목표$/m);
    assert.match(body, /^## 완료 기준$/m);
    assert.match(body, /^## 관련 문서$/m);
    assert.match(body, /^## 라벨$/m);
    assert.doesNotMatch(body, /^## Overview$/m);
  });
});

test('github pr body template uses Korean template when config lang is ko', async () => {
  await withTempDir('lsk-github-pr-ko-template-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'single',
      '--lang',
      'ko',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const result = await runCli(dir, ['github', 'pr', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PR_TEMPLATE_GENERATED');
    assert.equal(typeof payload.body, 'string');

    const body = await fs.readFile(payload.bodyFile, 'utf-8');
    assert.equal(payload.body, body);
    assert.match(body, /^## 개요$/m);
    assert.match(body, /^## 변경 사항$/m);
    assert.match(body, /^## 테스트$/m);
    assert.match(body, /^### 실행한 테스트$/m);
    assert.match(body, /^## 관련 문서$/m);
    assert.doesNotMatch(body, /^## Overview$/m);
  });
});

test('github pr body template includes artifact sections when modes are on', async () => {
  await withTempDir('lsk-github-pr-artifact-modes-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const result = await runCli(dir, [
      'github',
      'pr',
      'F001-alpha',
      '--json',
      '--screenshots',
      'on',
      '--mermaid',
      'on',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PR_TEMPLATE_GENERATED');
    assert.equal(payload.artifactPolicy?.screenshots, true);
    assert.equal(payload.artifactPolicy?.mermaid, true);
    assert.match(payload.body, /^## Screenshots$/m);
    assert.match(payload.body, /^## Architecture Diagram$/m);
    assert.match(payload.body, /```mermaid/);
  });
});

test('github issue/pr body templates derive overview from spec with docs-root paths', async () => {
  await withTempDir('lsk-github-overview-from-spec-', async (dir) => {
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

    const featureResult = await runCli(dir, [
      'feature',
      'alpha',
      '--id',
      'F001',
      '--desc',
      'Allow users to sign in with email and password.',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const issueResult = await runCli(dir, ['github', 'issue', 'F001-alpha', '--json']);
    assert.equal(issueResult.code, 0, issueResult.stderr || issueResult.stdout);
    const issuePayload = JSON.parse(issueResult.stdout.trim());
    assert.equal(issuePayload.status, 'ok');
    assert.equal(issuePayload.reasonCode, 'ISSUE_TEMPLATE_GENERATED');
    assert.match(issuePayload.body, /Allow users to sign in with email and password\./);
    assert.doesNotMatch(issuePayload.body, /TODO:/);
    assert.match(issuePayload.body, /^## Goals$/m);
    assert.match(issuePayload.body, /^## Completion Criteria$/m);
    const goalsSection = issuePayload.body.match(
      /^## Goals\s*\n\n([\s\S]*?)\n\n## Completion Criteria$/m
    );
    assert.ok(goalsSection);
    const goalCount = (goalsSection[1].match(/^- \[ \] /gm) || []).length;
    assert.ok(goalCount >= 3);

    const criteriaSection = issuePayload.body.match(
      /^## Completion Criteria\s*\n\n([\s\S]*?)\n\n## Related Documents$/m
    );
    assert.ok(criteriaSection);
    const criteriaCount = (criteriaSection[1].match(/^- \[ \] /gm) || []).length;
    assert.ok(criteriaCount >= 4);
    assert.match(issuePayload.body, /`docs\/features\/F001-alpha\/spec\.md`/);
    assert.match(issuePayload.body, /`docs\/features\/F001-alpha\/plan\.md`/);
    assert.match(issuePayload.body, /`docs\/features\/F001-alpha\/tasks\.md`/);
    assert.doesNotMatch(issuePayload.body, /Finalize feature scope and implementation outcome/);

    const prResult = await runCli(dir, ['github', 'pr', 'F001-alpha', '--json']);
    assert.equal(prResult.code, 0, prResult.stderr || prResult.stdout);
    const prPayload = JSON.parse(prResult.stdout.trim());
    assert.equal(prPayload.status, 'ok');
    assert.equal(prPayload.reasonCode, 'PR_TEMPLATE_GENERATED');
    assert.match(prPayload.body, /Allow users to sign in with email and password\./);
    assert.doesNotMatch(prPayload.body, /TODO:/);
    assert.match(prPayload.body, /^## Changes$/m);
    assert.match(prPayload.body, /^## Tests$/m);
    const changesSection = prPayload.body.match(
      /^## Changes\s*\n\n([\s\S]*?)\n\n## Tests$/m
    );
    assert.ok(changesSection);
    const changesCount = (changesSection[1].match(/^- \[ \] /gm) || []).length;
    assert.ok(changesCount >= 3);

    const testsSection = prPayload.body.match(
      /^### Tests Run\s*\n\n([\s\S]*?)\n\n## Related Documents$/m
    );
    assert.ok(testsSection);
    const testsCount = (testsSection[1].match(/^- \[ \] /gm) || []).length;
    assert.ok(testsCount >= 2);
    assert.match(prPayload.body, /`docs\/features\/F001-alpha\/spec\.md`/);
    assert.match(prPayload.body, /`docs\/features\/F001-alpha\/tasks\.md`/);
    assert.doesNotMatch(prPayload.body, /Deliver implementation for the feature scope/);
  });
});

test('github body template files are project-scoped and overwritten by default', async () => {
  await withTempDir('lsk-github-body-file-default-', async (dir) => {
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

    const featureA = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureA.code, 0, featureA.stderr || featureA.stdout);

    const featureB = await runCli(dir, ['feature', 'beta', '--id', 'F002']);
    assert.equal(featureB.code, 0, featureB.stderr || featureB.stdout);

    const issueAResult = await runCli(dir, ['github', 'issue', 'F001-alpha', '--json']);
    assert.equal(issueAResult.code, 0, issueAResult.stderr || issueAResult.stdout);
    const issueA = JSON.parse(issueAResult.stdout.trim());

    const issueBResult = await runCli(dir, ['github', 'issue', 'F002-beta', '--json']);
    assert.equal(issueBResult.code, 0, issueBResult.stderr || issueBResult.stdout);
    const issueB = JSON.parse(issueBResult.stdout.trim());

    assert.equal(issueA.bodyFile, issueB.bodyFile);
    assert.match(path.basename(issueA.bodyFile), /^lee-spec-kit\.[0-9a-f]{12}\.issue\.md$/);

    const issueBody = await fs.readFile(issueB.bodyFile, 'utf-8');
    assert.match(issueBody, /F002-beta/);
    assert.doesNotMatch(issueBody, /F001-alpha/);

    const prAResult = await runCli(dir, ['github', 'pr', 'F001-alpha', '--json']);
    assert.equal(prAResult.code, 0, prAResult.stderr || prAResult.stdout);
    const prA = JSON.parse(prAResult.stdout.trim());

    const prBResult = await runCli(dir, ['github', 'pr', 'F002-beta', '--json']);
    assert.equal(prBResult.code, 0, prBResult.stderr || prBResult.stdout);
    const prB = JSON.parse(prBResult.stdout.trim());

    assert.equal(prA.bodyFile, prB.bodyFile);
    assert.match(path.basename(prA.bodyFile), /^lee-spec-kit\.[0-9a-f]{12}\.pr\.md$/);

    const prBody = await fs.readFile(prB.bodyFile, 'utf-8');
    assert.match(prBody, /F002-beta/);
    assert.doesNotMatch(prBody, /F001-alpha/);
  });
});

test('github pr --create requires --confirm OK', async () => {
  await withTempDir('lsk-github-pr-confirm-required-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-pr-body.md');
    await writePrBodyWithoutTodo(bodyFile);

    const result = await runCli(dir, [
      'github',
      'pr',
      'F001-alpha',
      '--create',
      '--body-file',
      bodyFile,
      '--json',
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'APPROVAL_REQUIRED');
  });
});

test('github pr --create runs gh from standalone project root', async () => {
  await withTempDir('lsk-github-pr-standalone-cwd-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    const docsRoot = path.join(dir, 'docs-repo');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(docsRoot, { recursive: true });

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

    const featureResult = await runCli(docsRoot, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(docsRoot, 'tmp-pr-body.md');
    await writePrBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      docsRoot,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PR_CREATED_SYNCED');

    const cwdLog = await fs.readFile(fakeGh.cwdLogPath, 'utf-8');
    const invocations = cwdLog
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const normalizedInvocations = await Promise.all(
      invocations.map((invocation) => normalizePathForCompare(invocation))
    );
    const expectedCwd = await normalizePathForCompare(projectRoot);
    assert.deepEqual([...new Set(normalizedInvocations)], [expectedCwd]);
  });
});

test('github pr --create blocks TODO placeholders even with approval', async () => {
  await withTempDir('lsk-github-pr-todo-block-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-pr-body-todo.md');
    await writePrBodyWithoutTodo(bodyFile);
    const bodyWithTodo = (await fs.readFile(bodyFile, 'utf-8')).replace(
      '- [ ] Summarize main implementation changes.',
      '- [ ] TODO: Summarize main implementation changes.'
    );
    await fs.writeFile(bodyFile, bodyWithTodo, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(payload.error, /TODO placeholders/i);

    const logExists = await pathExists(fakeGh.logPath);
    assert.equal(logExists, false);
  });
});

test('github pr --create enforces screenshot/mermaid sections when mode is on', async () => {
  await withTempDir('lsk-github-pr-artifacts-enforced-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-pr-body-missing-artifacts.md');
    await writePrBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const screenshotMissing = await runCli(
      dir,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--screenshots',
        'on',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(
      screenshotMissing.code,
      1,
      screenshotMissing.stderr || screenshotMissing.stdout
    );
    const screenshotPayload = JSON.parse(screenshotMissing.stdout.trim());
    assert.equal(screenshotPayload.status, 'error');
    assert.equal(screenshotPayload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(screenshotPayload.error, /Screenshots/i);

    const mermaidMissing = await runCli(
      dir,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--mermaid',
        'on',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(
      mermaidMissing.code,
      1,
      mermaidMissing.stderr || mermaidMissing.stdout
    );
    const mermaidPayload = JSON.parse(mermaidMissing.stdout.trim());
    assert.equal(mermaidPayload.status, 'error');
    assert.equal(mermaidPayload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(mermaidPayload.error, /Architecture Diagram/i);

    const logExists = await pathExists(fakeGh.logPath);
    assert.equal(logExists, false);
  });
});

test('github pr --merge requires --confirm OK and does not mutate tasks.md', async () => {
  await withTempDir('lsk-github-pr-merge-confirm-required-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const before = await fs.readFile(tasksPath, 'utf-8');

    const result = await runCli(dir, [
      'github',
      'pr',
      'F001-alpha',
      '--pr',
      'https://github.com/acme/repo/pull/77',
      '--merge',
      '--json',
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'APPROVAL_REQUIRED');

    const after = await fs.readFile(tasksPath, 'utf-8');
    assert.equal(after, before);
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

test('detect --json reports PROJECT_NOT_DETECTED on empty workspace', async () => {
  await withTempDir('lsk-detect-empty-', async (dir) => {
    const result = await runCli(dir, ['detect', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PROJECT_NOT_DETECTED');
    assert.equal(payload.isLeeSpecKitProject, false);
    assert.equal(payload.docsDir, null);
    assert.equal(payload.configPath, null);
    assert.equal(payload.configFilePresent, false);
    assert.equal(payload.detectionSource, null);
    assert.equal(payload.projectType, null);
    assert.equal(payload.lang, null);
  });
});

test('detect --json reports PROJECT_DETECTED via config file', async () => {
  await withTempDir('lsk-detect-config-', async (dir) => {
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

    const result = await runCli(dir, ['detect', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    const detectedDocsDir = await normalizePathForCompare(payload.docsDir);
    const expectedDocsDir = await normalizePathForCompare(path.join(dir, 'docs'));
    const detectedConfigPath = await normalizePathForCompare(payload.configPath);
    const expectedConfigPath = await normalizePathForCompare(
      path.join(dir, 'docs', '.lee-spec-kit.json')
    );
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PROJECT_DETECTED');
    assert.equal(payload.isLeeSpecKitProject, true);
    assert.equal(detectedDocsDir, expectedDocsDir);
    assert.equal(detectedConfigPath, expectedConfigPath);
    assert.equal(payload.configFilePresent, true);
    assert.equal(payload.detectionSource, 'config');
    assert.equal(payload.projectType, 'single');
    assert.equal(payload.lang, 'en');
    assert.equal(payload.projectName, 'demo');
  });
});

test('detect --json reports PROJECT_DETECTED via folder heuristics', async () => {
  await withTempDir('lsk-detect-heuristic-', async (dir) => {
    await fs.mkdir(path.join(dir, 'docs', 'agents'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'features'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'agents', 'custom.md'),
      '한국어 힌트 문서\n',
      'utf-8'
    );

    const result = await runCli(dir, ['detect', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    const detectedDocsDir = await normalizePathForCompare(payload.docsDir);
    const expectedDocsDir = await normalizePathForCompare(path.join(dir, 'docs'));
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PROJECT_DETECTED');
    assert.equal(payload.isLeeSpecKitProject, true);
    assert.equal(detectedDocsDir, expectedDocsDir);
    assert.equal(payload.configPath, null);
    assert.equal(payload.configFilePresent, false);
    assert.equal(payload.detectionSource, 'heuristic');
    assert.equal(payload.projectType, 'single');
    assert.equal(payload.lang, 'ko');
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

    const featureSpec = await fs.readFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'spec.md'),
      'utf-8'
    );
    const featureTasks = await fs.readFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      'utf-8'
    );

    assert.doesNotMatch(featureSpec, /\*\*Issue Number\*\*:/);
    assert.doesNotMatch(featureTasks, /## GitHub Issue/);
    assert.match(featureTasks, /## Local Tracking/);
    assert.doesNotMatch(featureTasks, /\*\*PR\*\*:/);
    assert.doesNotMatch(featureTasks, /\*\*PR Status\*\*:/);
    assert.doesNotMatch(featureTasks, /\*\*Pre-PR Review\*\*:/);
  });
});

test('feature keeps YYYY-MM-DD placeholder in test log format text', async () => {
  await withTempDir('lsk-feature-testlog-date-format-', async (dir) => {
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

    const featureTasks = await fs.readFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      'utf-8'
    );
    assert.match(featureTasks, /YYYY-MM-DD/);
    assert.doesNotMatch(featureTasks, /YYYY-MM-DD HH-MM/);
  });
});

test('docs list/get expose CLI-managed built-in docs without restoring agents.md', async () => {
  await withTempDir('lsk-docs-command-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'single',
      '--lang',
      'ko',
      '--workflow',
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const listed = await runCli(dir, ['docs', 'list', '--json']);
    assert.equal(listed.code, 0, listed.stderr || listed.stdout);
    const listPayload = JSON.parse(listed.stdout.trim());
    assert.equal(listPayload.status, 'ok');
    assert.equal(listPayload.reasonCode, 'DOCS_LISTED');
    assert.equal(Array.isArray(listPayload.docs), true);
    assert.equal(listPayload.docs.some((doc) => doc.id === 'agents'), true);
    assert.equal(listPayload.docs.some((doc) => doc.id === 'create-issue'), true);

    const loaded = await runCli(dir, ['docs', 'get', 'agents', '--json']);
    assert.equal(loaded.code, 0, loaded.stderr || loaded.stdout);
    const getPayload = JSON.parse(loaded.stdout.trim());
    assert.equal(getPayload.status, 'ok');
    assert.equal(getPayload.reasonCode, 'DOC_FETCHED');
    assert.equal(getPayload.doc.id, 'agents');
    assert.equal(typeof getPayload.doc.hash, 'string');
    assert.equal(getPayload.doc.hash.length, 12);
    assert.match(getPayload.doc.content, /사용자 확인 필수 규칙/);
    assert.equal(Array.isArray(getPayload.requiredDocs), true);
    assert.equal(
      getPayload.requiredDocs.some((doc) => doc.id === 'create-issue'),
      true
    );

    const createPrLoaded = await runCli(dir, ['docs', 'get', 'create-pr', '--json']);
    assert.equal(
      createPrLoaded.code,
      0,
      createPrLoaded.stderr || createPrLoaded.stdout
    );
    const createPrPayload = JSON.parse(createPrLoaded.stdout.trim());
    assert.equal(createPrPayload.status, 'ok');
    assert.equal(createPrPayload.doc.id, 'create-pr');
    assert.equal(createPrPayload.contract?.kind, 'pr');
    assert.equal(Array.isArray(createPrPayload.contract?.requiredSections), true);
    assert.equal(
      createPrPayload.contract.requiredSections.includes('개요'),
      true
    );
    assert.equal(Array.isArray(createPrPayload.contract?.artifacts), true);
    assert.equal(
      createPrPayload.contract.artifacts.some((artifact) => artifact.id === 'screenshots'),
      true
    );
  });
});

test('init keeps only project-scoped policy docs in docs tree', async () => {
  await withTempDir('lsk-init-project-scoped-agents-', async (dir) => {
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
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const docsRoot = path.join(dir, 'docs');
    const docsGitignorePath = path.join(docsRoot, '.gitignore');
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'custom.md')),
      true
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'constitution.md')),
      true
    );

    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'agents.md')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'git-workflow.md')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'issue-template.md')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'pr-template.md')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'skills')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'features', 'feature-base')),
      false
    );

    assert.equal(await pathExists(docsGitignorePath), true);
    const docsGitignore = await fs.readFile(docsGitignorePath, 'utf-8');
    assert.match(docsGitignore, /^\.lee-spec-kit\.lock$/m);
    assert.match(docsGitignore, /^\.lee-spec-kit\.\*\.lock$/m);
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
    assert.equal(payload.selectionFallback, 'open_features');
    assert.equal(payload.checkPolicy.token, '<LABEL>');
    assert.deepEqual(payload.checkPolicy.acceptedTokens, [
      '<LABEL>',
      '<LABEL> OK',
      '<LABEL> ...',
      '... <LABEL> ...',
    ]);
    assert.equal(payload.checkPolicy.tokenPattern, '^.*\\b([A-Z]+)\\b.*$');
    assert.equal(payload.checkPolicy.requireExplanationBeforeApproval, true);
    assert.deepEqual(payload.checkPolicy.requiredExplanationFields, [
      'actionOptions[].label',
      'actionOptions[].detail',
      'actionOptions[].approvalPrompt',
    ]);
  });
});

test('context --json actionOptions and approvalRequest expose raw detail fields', async () => {
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
    assert.equal(payload.selectionFallback, 'none');
    assert.equal(payload.checkPolicy.policyOnly, true);
    assert.equal(typeof payload.actionOptions[0].summary, 'string');
    assert.equal(payload.actionOptions[0].summary.length > 0, true);
    assert.equal(typeof payload.actionOptions[0].detail, 'string');
    assert.equal(payload.actionOptions[0].detail.length > 0, true);
    assert.equal(typeof payload.actionOptions[0].approvalPrompt, 'string');
    assert.match(payload.actionOptions[0].approvalPrompt, /^[A-Z]+:\s+/);
    assert.equal(
      payload.actionOptions[0].approvalPrompt,
      `${payload.actionOptions[0].label}: ${payload.actionOptions[0].detail}`
    );
    assert.equal(typeof payload.primaryActionLabel, 'string');
    assert.equal(payload.primaryActionType, payload.actionOptions[0].action.type);
    assert.equal(payload.primaryActionCategory, payload.actionOptions[0].action.category);
    assert.equal(
      payload.primaryActionOperationType,
      payload.actionOptions[0].action.operationType
    );
    assert.equal(payload.actionOptions[0].action.operationType, 'manual');
    assert.equal(Array.isArray(payload.approvalRequest?.options), true);
    assert.equal(payload.approvalRequest.options.length, payload.actionOptions.length);
    assert.equal(Array.isArray(payload.approvalRequest?.labels), true);
    assert.equal(payload.approvalRequest.labels.length, payload.actionOptions.length);
    assert.equal(Array.isArray(payload.approvalRequest?.userFacingLines), true);
    assert.equal(
      payload.approvalRequest.userFacingLines.length,
      payload.actionOptions.length + 1
    );
    assert.equal(
      payload.approvalRequest.userFacingLines[0],
      payload.actionOptions[0].approvalPrompt
    );
    assert.equal(
      payload.approvalRequest.userFacingLines[payload.approvalRequest.userFacingLines.length - 1],
      payload.approvalRequest.finalPrompt
    );
    assert.equal(typeof payload.approvalRequest?.finalPrompt, 'string');
    assert.match(payload.approvalRequest.finalPrompt, /Available labels now:/);
    assert.equal(typeof payload.approvalRequest?.approveCommand, 'string');
    assert.match(payload.approvalRequest.approveCommand, /--approve <LABEL>$/);
    assert.equal(typeof payload.approvalRequest?.executeCommand, 'string');
    assert.match(
      payload.approvalRequest.executeCommand,
      /--approve <LABEL> --execute \[--ticket <TICKET>\]$/
    );
    assert.equal(payload.approvalRequest.options[0].detail, payload.actionOptions[0].detail);
    assert.equal(
      payload.approvalRequest.options[0].actionType,
      payload.actionOptions[0].action.type
    );
    assert.equal(
      payload.approvalRequest.options[0].operationType,
      payload.actionOptions[0].action.operationType
    );
    if (payload.actionOptions[0].action.type === 'command') {
      assert.equal(
        payload.approvalRequest.options[0].cmd,
        payload.actionOptions[0].action.cmd
      );
      assert.equal(
        payload.approvalRequest.options[0].cwd,
        payload.actionOptions[0].action.cwd
      );
      assert.equal(
        payload.approvalRequest.options[0].scope,
        payload.actionOptions[0].action.scope
      );
    }
  });
});

test('context spec_write approval prompt hides internal docs-get commands', async () => {
  await withTempDir('lsk-context-spec-write-user-prompt-', async (dir) => {
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

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 2);
    assert.equal(payload.actionOptions[0].action.category, 'spec_write');
    assert.doesNotMatch(payload.actionOptions[0].detail, /docs get/i);
    assert.doesNotMatch(payload.actionOptions[0].approvalPrompt, /docs get/i);
  });
});

test('context --approve accepts natural language replies that include a label token', async () => {
  await withTempDir('lsk-context-approve-natural-language-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = { mode: 'category', default: 'require' };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const result = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A 진행해',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'approved_selected');
    assert.equal(payload.label, 'A');
    assert.equal(typeof payload?.approvalTicket?.token, 'string');
    assert.equal(payload.approvalTicket.token.length > 0, true);
  });
});

test('context text output ends with current label reminder and execution hint', async () => {
  await withTempDir('lsk-context-final-label-reminder-', async (dir) => {
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

    const result = await runCli(dir, ['context', 'F001-alpha']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Available labels now: A\./);
    assert.match(
      result.stdout,
      /When a label is provided, run approval selection: npx lee-spec-kit context F001-alpha --approve <LABEL>/
    );
  });
});

test('context pre-PR review step is enforced before PR creation and exposes policy', async () => {
  await withTempDir('lsk-context-pre-pr-review-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasksBefore = await fs.readFile(tasksPath, 'utf-8');
    const tasksAfter = tasksBefore.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Pending'
    );
    await fs.writeFile(tasksPath, tasksAfter, 'utf-8');

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
      'docs: prepare pre-pr review step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.status, 'single_matched');
    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(payload.matchedFeature.docs.prePrReviewFieldExists, true);
    assert.equal(payload.matchedFeature.prePrReview.status, 'Pending');
    assert.equal(payload.actionOptions[0].action.category, 'pre_pr_review');
    assert.equal(payload.prePrReviewPolicy.enabled, true);
    assert.deepEqual(payload.prePrReviewPolicy.skills, ['code-review-excellence']);
    assert.equal(payload.prePrReviewPolicy.fallback, 'builtin-checklist');
    assert.equal(payload.prePrReviewPolicy.blockOnFindings, true);
    assert.equal(payload.prePrReviewPolicy.minorPolicy, 'warn');
  });
});

test('context pre-PR review requires evidence before PR step when review is marked Done', async () => {
  await withTempDir('lsk-context-pre-pr-evidence-required-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
        blockOnFindings: true,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Findings**: major=0, minor=1\n- **Pre-PR Evidence**: -'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: require pre-pr evidence before pr step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(payload.actionOptions[0].action.category, 'pre_pr_review');
    assert.match(payload.actionOptions[0].detail, /Pre-PR Evidence/i);
  });
});

test('context pre-PR review blocks PR step when major findings remain', async () => {
  await withTempDir('lsk-context-pre-pr-major-findings-block-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
        blockOnFindings: true,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Findings**: major=2, minor=1\n- **Pre-PR Evidence**: docs/features/F001-alpha/pre-pr-review.md'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: block pre-pr step on major findings',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(payload.actionOptions[0].action.category, 'pre_pr_review');
    assert.match(payload.actionOptions[0].detail, /major findings/i);
    assert.match(payload.actionOptions[0].detail, /2/);
  });
});

test('context pre-PR review allows PR step on minor-only findings when minorPolicy=warn', async () => {
  await withTempDir('lsk-context-pre-pr-minor-warn-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
        blockOnFindings: true,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Findings**: major=0, minor=2\n- **Pre-PR Evidence**: docs/features/F001-alpha/pre-pr-review.md'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: allow pre-pr step with minor findings in warn mode',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 13);
    assert.equal(payload.actionOptions[0].action.category, 'pr_create');
  });
});

test('context pre-PR review blocks PR step on minor findings when minorPolicy=block', async () => {
  await withTempDir('lsk-context-pre-pr-minor-block-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
        blockOnFindings: true,
        minorPolicy: 'block',
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Findings**: major=0, minor=2\n- **Pre-PR Evidence**: docs/features/F001-alpha/pre-pr-review.md'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: block pre-pr step on minor findings',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(payload.actionOptions[0].action.category, 'pre_pr_review');
    assert.match(payload.actionOptions[0].detail, /minor findings/i);
    assert.match(payload.actionOptions[0].detail, /2/);
  });
});

test('context issue_create action requires explicit user check and is instruction-only', async () => {
  await withTempDir('lsk-context-issue-create-check-', async (dir) => {
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
      'github',
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
      'docs: prepare issue-create step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 8);
    assert.equal(payload.actionOptions[0].action.category, 'issue_create');
    assert.equal(payload.actionOptions[0].action.type, 'instruction');
    assert.equal(payload.actionOptions[0].action.requiresUserCheck, true);
    assert.equal(payload.actionOptions[0].action.operationType, 'remote');
    assert.doesNotMatch(payload.actionOptions[0].detail, /docs get/i);
    assert.doesNotMatch(payload.actionOptions[0].approvalPrompt, /docs get/i);
    assert.equal(Array.isArray(payload.requiredDocs), true);
    assert.equal(payload.requiredDocs.some((doc) => doc.id === 'create-issue'), true);

    const ticket = await issueApprovalTicket(dir, 'F001-alpha', 'A');
    const executeAttempt = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--ticket',
      ticket,
      '--execute-strict',
      '--json',
    ]);
    assert.equal(executeAttempt.code, 1);
    const executePayload = JSON.parse(executeAttempt.stdout.trim());
    assert.equal(executePayload.reasonCode, 'EXECUTION_NOT_COMMAND');
  });
});

test('context pr_create action still requires explicit user check', async () => {
  await withTempDir('lsk-context-pr-create-check-', async (dir) => {
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
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: false,
      prePrReview: {
        enabled: false,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

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
      'docs: prepare pr-create step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 13);
    assert.equal(payload.actionOptions[0].action.category, 'pr_create');
    assert.equal(payload.actionOptions[0].action.type, 'instruction');
    assert.equal(payload.actionOptions[0].action.requiresUserCheck, true);
    assert.equal(payload.actionOptions[0].action.operationType, 'remote');
    assert.doesNotMatch(payload.actionOptions[0].detail, /docs get/i);
    assert.doesNotMatch(payload.actionOptions[0].approvalPrompt, /docs get/i);
    assert.equal(Array.isArray(payload.requiredDocs), true);
    assert.equal(payload.requiredDocs.some((doc) => doc.id === 'create-pr'), true);
  });
});

test('context code_review step keeps Review status and guides merge command', async () => {
  await withTempDir('lsk-context-code-review-merge-guidance-', async (dir) => {
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
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        enabled: false,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **PR**: -', '- **PR**: https://github.com/acme/repo/pull/77');
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare code-review step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 14);
    assert.equal(payload.actionOptions[0].action.category, 'code_review');
    assert.equal(payload.actionOptions[0].action.type, 'instruction');
    assert.equal(payload.actionOptions[0].action.requiresUserCheck, true);
    assert.equal(payload.actionOptions[0].action.operationType, 'remote');
    assert.match(payload.actionOptions[0].action.message, /--merge --confirm OK/);
    assert.doesNotMatch(payload.actionOptions[0].action.message, /Review → Approved/);
  });
});

test('context uses review-fix commit guidance when project is dirty during PR review', async () => {
  await withTempDir('lsk-context-code-review-dirty-commit-guidance-', async (dir) => {
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
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        enabled: false,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **PR**: -', '- **PR**: https://github.com/acme/repo/pull/77');
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare review step with dirty project',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    await fs.writeFile(path.join(dir, 'app.js'), "console.log('review fix');\n", 'utf-8');

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 11);
    assert.equal(payload.actionOptions[0].action.type, 'instruction');
    assert.equal(payload.actionOptions[0].action.category, 'review_fix_commit');
    assert.match(payload.actionOptions[0].action.message, /review fixes/i);
    assert.match(payload.actionOptions[0].action.message, /fix\(review\): <review-fix-summary>/i);
    assert.doesNotMatch(payload.actionOptions[0].action.message, /feat\(/i);
    assert.equal(payload.requiredDocs.some((doc) => doc.id === 'create-pr'), true);
    assert.equal(payload.requiredDocs.some((doc) => doc.id === 'git-workflow'), true);
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

test('feature rejects removed --repo option', async () => {
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
    assert.match(result.stderr, /unknown option '--repo'/i);
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.workflow?.taskCommitGate, 'strict');
    assert.equal(config.workflow?.codeDirtyScope, 'auto');
    assert.equal(config.workflow?.prePrReview?.fallback, 'builtin-checklist');
    assert.equal(config.workflow?.prePrReview?.blockOnFindings, true);
    assert.equal(config.workflow?.prePrReview?.minorPolicy, 'warn');
    assert.equal(config.approval?.mode, 'builtin');
    assert.equal(config.pr?.screenshots?.upload, false);
  });
});

test('update backfills missing config defaults including strict taskCommitGate', async () => {
  await withTempDir('lsk-update-config-backfill-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    delete config.workflow?.taskCommitGate;
    delete config.workflow?.codeDirtyScope;
    delete config.workflow?.prePrReview;
    delete config.pr;
    delete config.approval;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const prepAdd = await runCommand(dir, 'git', ['add', 'docs/.lee-spec-kit.json']);
    assert.equal(prepAdd.code, 0, prepAdd.stderr || prepAdd.stdout);
    const prepCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'chore: drop config defaults',
    ]);
    assert.equal(prepCommit.code, 0, prepCommit.stderr || prepCommit.stdout);

    const updateResult = await runCli(dir, ['update']);
    assert.equal(updateResult.code, 0, updateResult.stderr || updateResult.stdout);

    const nextConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(nextConfig.workflow?.taskCommitGate, 'strict');
    assert.equal(nextConfig.workflow?.codeDirtyScope, 'auto');
    assert.deepEqual(nextConfig.workflow?.prePrReview?.skills, [
      'code-review-excellence',
    ]);
    assert.equal(nextConfig.workflow?.prePrReview?.minorPolicy, 'warn');
    assert.equal(nextConfig.pr?.screenshots?.upload, false);
    assert.equal(nextConfig.approval?.mode, 'builtin');
  });
});

test('update keeps explicit config values and only fills missing keys', async () => {
  await withTempDir('lsk-update-config-preserve-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = config.workflow || {};
    config.workflow.mode = 'local';
    config.workflow.codeDirtyScope = 'repo';
    config.workflow.taskCommitGate = 'warn';
    config.workflow.prePrReview = { skills: ['custom-skill'] };
    config.pr = { screenshots: { upload: true } };
    config.approval = { mode: 'steps', requireCheckSteps: [10] };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const prepAdd = await runCommand(dir, 'git', ['add', 'docs/.lee-spec-kit.json']);
    assert.equal(prepAdd.code, 0, prepAdd.stderr || prepAdd.stdout);
    const prepCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'chore: set explicit config values',
    ]);
    assert.equal(prepCommit.code, 0, prepCommit.stderr || prepCommit.stdout);

    const updateResult = await runCli(dir, ['update']);
    assert.equal(updateResult.code, 0, updateResult.stderr || updateResult.stdout);

    const nextConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(nextConfig.workflow?.mode, 'local');
    assert.equal(nextConfig.workflow?.codeDirtyScope, 'repo');
    assert.equal(nextConfig.workflow?.taskCommitGate, 'warn');
    assert.deepEqual(nextConfig.workflow?.prePrReview?.skills, ['custom-skill']);
    assert.equal(nextConfig.workflow?.prePrReview?.minorPolicy, 'warn');
    assert.equal(nextConfig.pr?.screenshots?.upload, true);
    assert.equal(nextConfig.approval?.mode, 'steps');
    assert.deepEqual(nextConfig.approval?.requireCheckSteps, [10]);
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
    assert.match(
      payload.actionOptions?.[0]?.detail || '',
      /^\(docs\) commit: docs: F001-alpha docs update$/
    );
    assert.equal(payload.actions?.[0]?.operationType, 'local');
    assert.equal(payload.primaryActionOperationType, 'local');
  });
});

test('context requires project commit before starting next TODO task', async () => {
  await withTempDir('lsk-context-project-dirty-gate-', async (dir) => {
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

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasks = await fs.readFile(tasksPath, 'utf-8');
    const updatedTasks = tasks.replace(
      '- [DONE] T-F001-alpha-01 alpha',
      '- [DONE] T-F001-alpha-01 alpha\n- [TODO] T-F001-alpha-02 alpha follow-up'
    );
    await fs.writeFile(tasksPath, updatedTasks, 'utf-8');

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
      'docs: add second todo task',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    await fs.writeFile(path.join(dir, 'app.js'), "console.log('dirty');\n", 'utf-8');

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.status, 'single_matched');
    assert.equal(typeof payload.matchedFeature.currentStep, 'number');
    assert.equal(payload.matchedFeature.git.docsHasUncommittedChanges, false);
    assert.equal(payload.matchedFeature.git.projectHasUncommittedChanges, true);
    assert.equal(payload.actionOptions[0].action.type, 'command');
    assert.equal(payload.actionOptions[0].action.scope, 'project');
    assert.equal(payload.actionOptions[0].action.category, 'task_execute');
    assert.doesNotMatch(payload.actionOptions[0].action.cmd, /git add -A/);
    assert.match(payload.actionOptions[0].action.cmd, /git diff --cached --quiet/);
    assert.match(payload.actionOptions[0].action.cmd, /git commit -m "feat\([^"]+\): /);
    assert.match(payload.actionOptions[0].action.cmd, /feat\(F001-alpha\): alpha/);
    assert.doesNotMatch(payload.actionOptions[0].action.cmd, /T-F001-alpha-01/);
    assert.match(
      payload.actionOptions[0].detail,
      /^\(project\) commit: feat\(F001-alpha\): alpha$/
    );
    assert.equal(
      payload.actionOptions[0].approvalPrompt,
      `${payload.actionOptions[0].label}: ${payload.actionOptions[0].detail}`
    );
  });
});

test('context checklist-pending action uses actionable user-facing wording', async () => {
  await withTempDir('lsk-context-checklist-pending-wording-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'single',
      '--lang',
      'ko',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const gitEmail = await runCommand(dir, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(gitEmail.code, 0, gitEmail.stderr || gitEmail.stdout);
    const gitName = await runCommand(dir, 'git', ['config', 'user.name', 'Tester']);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasks = await fs.readFile(tasksPath, 'utf-8');
    const checklistPending = tasks.replace('- [x] done', '- [ ] done');
    await fs.writeFile(tasksPath, checklistPending, 'utf-8');

    const docsAdd = await runCommand(dir, 'git', ['add', 'docs/features/F001-alpha']);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: finalize checklist state',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(typeof payload.matchedFeature.currentStep, 'number');
    assert.equal(payload.actionOptions[0].action.type, 'instruction');
    assert.match(
      payload.actionOptions[0].action.message,
      /완료 조건 체크리스트의 남은 항목을 진행하세요/
    );
  });
});

test('context prioritizes docs commit over checklist guidance when checklist is pending and docs are dirty', async () => {
  await withTempDir('lsk-context-checklist-pending-docs-dirty-priority-', async (dir) => {
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

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasks = await fs.readFile(tasksPath, 'utf-8');
    const checklistPending = tasks.replace('- [x] done', '- [ ] done');
    await fs.writeFile(tasksPath, checklistPending, 'utf-8');

    await fs.writeFile(path.join(dir, 'app.js'), "console.log('dirty');\n", 'utf-8');

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.status, 'single_matched');
    assert.equal(payload.matchedFeature.git.docsHasUncommittedChanges, true);
    assert.equal(payload.matchedFeature.git.projectHasUncommittedChanges, true);
    assert.equal(payload.actionOptions[0].action.type, 'command');
    assert.equal(payload.actionOptions[0].action.scope, 'docs');
    assert.equal(payload.actionOptions[0].action.category, 'docs_commit');
    assert.match(payload.actionOptions[0].action.cmd, /git commit -m "docs/);
  });
});

test('context parses task IDs and blocks next TODO when strict task commit gate fails', async () => {
  await withTempDir('lsk-context-task-commit-gate-strict-', async (dir) => {
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

    const gitEmail = await runCommand(dir, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(gitEmail.code, 0, gitEmail.stderr || gitEmail.stdout);
    const gitName = await runCommand(dir, 'git', ['config', 'user.name', 'Tester']);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    await fs.writeFile(
      tasksPath,
      `# Tasks: alpha

## Local Tracking

- **Doc Status**: Approved

## Task List

- [DONE] T-F001-alpha-01 alpha baseline
- [DONE] T-F001-alpha-02 alpha follow-up
- [TODO] T-F001-alpha-03 alpha polish

## Completion Criteria

- [ ] done
`,
      'utf-8'
    );

    const docsAdd = await runCommand(dir, 'git', ['add', 'docs/features/F001-alpha']);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: update tasks with multiple done transitions',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.lastDoneTask.id, 'T-F001-alpha-02');
    assert.equal(payload.matchedFeature.nextTodoTask.id, 'T-F001-alpha-03');
    assert.equal(payload.actionOptions[0].action.type, 'instruction');
    assert.match(payload.actionOptions[0].action.message, /1 task = 1 commit/);
    assert.match(payload.actionOptions[0].action.message, /DONE transitions.*2/);
  });
});

test('context strict task commit gate ignores latest commit when DONE transitions are zero', async () => {
  await withTempDir('lsk-context-task-commit-gate-strict-zero-done-', async (dir) => {
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

    const gitEmail = await runCommand(dir, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(gitEmail.code, 0, gitEmail.stderr || gitEmail.stdout);
    const gitName = await runCommand(dir, 'git', ['config', 'user.name', 'Tester']);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    await fs.writeFile(
      tasksPath,
      `# Tasks: alpha

## Local Tracking

- **Doc Status**: Approved

## Task List

- [DONE] T-F001-alpha-01 alpha baseline
- [TODO] T-F001-alpha-02 alpha follow-up

## Completion Criteria

- [ ] done
`,
      'utf-8'
    );

    const firstAdd = await runCommand(dir, 'git', ['add', 'docs/features/F001-alpha']);
    assert.equal(firstAdd.code, 0, firstAdd.stderr || firstAdd.stdout);
    const firstCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: set baseline task statuses',
    ]);
    assert.equal(firstCommit.code, 0, firstCommit.stderr || firstCommit.stdout);

    await fs.writeFile(
      tasksPath,
      `# Tasks: alpha

## Local Tracking

- **Doc Status**: Approved

## Task List

- [DONE] T-F001-alpha-01 alpha baseline
- [TODO] T-F001-alpha-02 alpha follow-up edited

## Completion Criteria

- [ ] done
`,
      'utf-8'
    );

    const secondAdd = await runCommand(dir, 'git', ['add', 'docs/features/F001-alpha']);
    assert.equal(secondAdd.code, 0, secondAdd.stderr || secondAdd.stdout);
    const secondCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: update todo text without done transition',
    ]);
    assert.equal(secondCommit.code, 0, secondCommit.stderr || secondCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.taskCommitGatePolicy, 'strict');
    assert.equal(payload.actionOptions[0].action.type, 'instruction');
    assert.match(payload.actionOptions[0].action.message, /Start the next TODO task/);
    assert.doesNotMatch(payload.actionOptions[0].action.message, /Task commit boundary warning/);
    assert.doesNotMatch(payload.actionOptions[0].action.message, /DONE transitions.*0/);
    assert.doesNotMatch(
      payload.actionOptions[0].action.message,
      /Before moving to the next TODO task, you must satisfy/
    );
  });
});

test('context warn task commit gate allows next TODO with warning', async () => {
  await withTempDir('lsk-context-task-commit-gate-warn-', async (dir) => {
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

    const gitEmail = await runCommand(dir, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(gitEmail.code, 0, gitEmail.stderr || gitEmail.stdout);
    const gitName = await runCommand(dir, 'git', ['config', 'user.name', 'Tester']);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = config.workflow || {};
    config.workflow.taskCommitGate = 'warn';
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    await fs.writeFile(
      tasksPath,
      `# Tasks: alpha

## Local Tracking

- **Doc Status**: Approved

## Task List

- [DONE] T-F001-alpha-01 alpha baseline
- [DONE] T-F001-alpha-02 alpha follow-up
- [TODO] T-F001-alpha-03 alpha polish

## Completion Criteria

- [ ] done
`,
      'utf-8'
    );

    const docsAdd = await runCommand(dir, 'git', ['add', 'docs/features/F001-alpha', 'docs/.lee-spec-kit.json']);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: set task commit gate warn and update tasks',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.taskCommitGatePolicy, 'warn');
    assert.equal(payload.actionOptions[0].action.type, 'instruction');
    assert.match(payload.actionOptions[0].action.message, /Start the next TODO task/);
    assert.match(payload.actionOptions[0].action.message, /Task commit boundary warning/);
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

    const [ticket1, ticket2] = await Promise.all([
      issueApprovalTicket(dir, 'F001-alpha', 'A'),
      issueApprovalTicket(dir, 'F002-beta', 'A'),
    ]);

    const [r1, r2] = await Promise.all([
      runCli(dir, [
        'context',
        'F001-alpha',
        '--approve',
        'A',
        '--execute',
        '--ticket',
        ticket1,
        '--json',
      ]),
      runCli(dir, [
        'context',
        'F002-beta',
        '--approve',
        'A',
        '--execute',
        '--ticket',
        ticket2,
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

test('context --execute uses staged-only project commit and never stages internal lock', async () => {
  await withTempDir('lsk-context-project-lock-not-staged-', async (dir) => {
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

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const docsAdd = await runCommand(dir, 'git', ['add', 'docs/features/F001-alpha']);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(dir, 'git', ['commit', '-m', 'docs: setup F001']);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    await fs.writeFile(path.join(dir, 'app.txt'), 'dirty project change\n', 'utf-8');

    const contextResult = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(contextResult.code, 0, contextResult.stderr || contextResult.stdout);
    const contextPayload = JSON.parse(contextResult.stdout.trim());
    assert.equal(
      contextPayload.actionOptions.some(
        (option) =>
          option?.action?.type === 'command' &&
          /git diff --cached --quiet/.test(String(option?.action?.cmd || ''))
      ),
      true
    );
    assert.equal(
      contextPayload.actionOptions.some((option) =>
        /git add -A/.test(String(option?.action?.cmd || ''))
      ),
      false
    );

    const stageProjectFile = await runCommand(dir, 'git', ['add', 'app.txt']);
    assert.equal(
      stageProjectFile.code,
      0,
      stageProjectFile.stderr || stageProjectFile.stdout
    );

    const ticket = await issueApprovalTicket(dir, 'F001-alpha', 'A');
    const docsTicketPath = path.join(
      dir,
      'docs',
      '.lee-spec-kit.approval-tickets.json'
    );
    assert.equal(await pathExists(docsTicketPath), false);
    const execute = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--ticket',
      ticket,
      '--json',
    ]);
    assert.equal(execute.code, 0, execute.stderr || execute.stdout);
    const execPayload = JSON.parse(execute.stdout.trim());
    assert.equal(execPayload.status, 'approved_executed');

    const status = await runCommand(dir, 'git', ['status', '--porcelain']);
    assert.equal(status.code, 0, status.stderr || status.stdout);
    assert.doesNotMatch(status.stdout, /\.lee-spec-kit\.project\.lock/);
    assert.doesNotMatch(status.stdout, /\.lee-spec-kit\.approval-tickets\.json/);

    const headFiles = await runCommand(dir, 'git', [
      'show',
      '--name-only',
      '--pretty=format:',
      'HEAD',
    ]);
    assert.equal(headFiles.code, 0, headFiles.stderr || headFiles.stdout);
    assert.doesNotMatch(headFiles.stdout, /\.lee-spec-kit\.project\.lock/);
    assert.doesNotMatch(headFiles.stdout, /\.lee-spec-kit\.approval-tickets\.json/);
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = { mode: 'category', default: 'skip' };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

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

test('context --execute requires a ticket from prior approval', async () => {
  await withTempDir('lsk-context-execute-ticket-required-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = { mode: 'category', default: 'require' };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const contextPayload = JSON.parse(context.stdout.trim());
    assert.equal(contextPayload.actionOptions[0].action.requiresUserCheck, true);

    const result = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--json',
    ]);
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'APPROVAL_REQUIRED');
  });
});

test('context --execute can run without ticket when approval policy skips check', async () => {
  await withTempDir('lsk-context-execute-no-ticket-when-skip-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = { mode: 'category', default: 'skip' };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const approveOnly = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--json',
    ]);
    assert.equal(approveOnly.code, 0, approveOnly.stderr || approveOnly.stdout);
    const approvePayload = JSON.parse(approveOnly.stdout.trim());
    assert.equal(approvePayload.executeRequiresTicket, false);
    assert.equal(approvePayload.approvalTicket, undefined);

    const result = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.notEqual(payload.status, 'error');
    assert.equal(
      payload.status === 'approved_instruction' || payload.status === 'approved_executed',
      true
    );
  });
});

test('context tickets are one-time use for execute', async () => {
  await withTempDir('lsk-context-ticket-one-time-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = { mode: 'category', default: 'require' };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const ticket = await issueApprovalTicket(dir, 'F001-alpha', 'A');
    const first = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--ticket',
      ticket,
      '--json',
    ]);
    assert.equal(first.code, 0, first.stderr || first.stdout);
    const firstPayload = JSON.parse(first.stdout.trim());
    assert.equal(firstPayload.status, 'approved_instruction');
    assert.equal(firstPayload.reasonCode, 'INSTRUCTION_ONLY');

    const second = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--ticket',
      ticket,
      '--json',
    ]);
    assert.equal(second.code, 1);
    const secondPayload = JSON.parse(second.stdout.trim());
    assert.equal(secondPayload.status, 'error');
    assert.equal(secondPayload.reasonCode, 'INVALID_APPROVAL');
  });
});

test('context non-json output works for single matched feature', async () => {
  await withTempDir('lsk-context-nonjson-single-', async (dir) => {
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

    const result = await runCli(dir, ['context', 'F001-alpha']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Feature:\s+F001-alpha/);
    assert.match(result.stdout, /Path:\s+/);
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

test('flow --json accepts natural language approval replies with label token', async () => {
  await withTempDir('lsk-flow-approve-natural-language-', async (dir) => {
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
      'flow',
      'F001',
      '--approve',
      'A 진행해',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.approval.status, 'approved_selected');
    assert.equal(payload.approval.label, 'A');
  });
});

test('flow --json uses internal ticket handshake for --execute', async () => {
  await withTempDir('lsk-flow-approve-execute-ticket-', async (dir) => {
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
      'flow',
      'F001',
      '--approve',
      'A proceed',
      '--execute',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.approval.status, 'approved_instruction');
    assert.equal(payload.approval.reasonCode, 'INSTRUCTION_ONLY');
    assert.equal(payload.approval.label, 'A');
  });
});

test('flow --json executes without ticket when selected option does not require check', async () => {
  await withTempDir('lsk-flow-approve-execute-no-ticket-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = { mode: 'category', default: 'skip' };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const result = await runCli(dir, [
      'flow',
      'F001',
      '--approve',
      'A proceed',
      '--execute',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.notEqual(payload.approval?.status, 'error');
    assert.equal(
      payload.approval?.status === 'approved_instruction' ||
        payload.approval?.status === 'approved_executed',
      true
    );
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

    const apiContext = await runCli(dir, ['context', '--component', 'api', '--json']);
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
    assert.equal(config.workflow?.taskCommitGate, 'strict');
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

test('context rejects removed --repo option', async () => {
  await withTempDir('lsk-context-removed-repo-option-', async (dir) => {
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

    const result = await runCli(dir, ['context', '--repo', 'web', '--json']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /unknown option '--repo'/i);
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

test('config fallback detects Korean lang from agents/custom.md', async () => {
  await withTempDir('lsk-config-lang-fallback-ko-', async (dir) => {
    await fs.mkdir(path.join(dir, 'docs', 'agents'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'features'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'prd'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'designs'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'ideas'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'agents', 'custom.md'),
      '# 커스텀 규칙\n\n한국어 규칙\n',
      'utf-8'
    );

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.meta.lang, 'ko');
    assert.match(String(payload.issues?.[0]?.message || ''), /설정 파일/);
  });
});

test('config fallback detects English lang from agents/custom.md', async () => {
  await withTempDir('lsk-config-lang-fallback-en-', async (dir) => {
    await fs.mkdir(path.join(dir, 'docs', 'agents'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'features'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'prd'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'designs'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'ideas'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'agents', 'custom.md'),
      '# Custom Rules\n\nEnglish rules only.\n',
      'utf-8'
    );

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.meta.lang, 'en');
    assert.match(String(payload.issues?.[0]?.message || ''), /Missing \.lee-spec-kit\.json/);
  });
});

test('config file lang is respected (ko)', async () => {
  await withTempDir('lsk-config-lang-configfile-ko-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'single',
      '--lang',
      'ko',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.meta.lang, 'ko');
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

test('help output omits ASCII banner in non-TTY mode by default', async () => {
  await withTempDir('lsk-help-non-tty-no-banner-', async (dir) => {
    const result = await runCli(dir, ['--help']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, /░██/);
    assert.match(result.stdout, /Usage: lee-spec-kit/);
  });
});

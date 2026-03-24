import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliEntrypoint = path.join(rootDir, 'dist', 'index.js');
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

function runWithTimeout(command, commandArgs, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, options.spawnOptions ?? {});

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGKILL');
      const commandText = [command, ...commandArgs].join(' ');
      resolve({
        code: 124,
        stdout,
        stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms: ${commandText}`.trim(),
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function runCli(cwd, args, env = {}, options = {}) {
  return runWithTimeout(process.execPath, [cliEntrypoint, ...args], {
    timeoutMs: options.timeoutMs,
    spawnOptions: {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...env,
      },
    },
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

function runCommand(cwd, command, args, options = {}) {
  return runWithTimeout(command, args, {
    timeoutMs: options.timeoutMs,
    spawnOptions: {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(options.env || {}),
      },
    },
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
  const cmdScriptPath = path.join(binDir, 'gh.cmd');
  await fs.mkdir(binDir, { recursive: true });
  const logPathLiteral = JSON.stringify(logPath);
  const cwdLogPathLiteral = JSON.stringify(cwdLogPath);
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env node
const fs = require('node:fs');

const cwd = process.cwd();
const args = process.argv.slice(2);
fs.appendFileSync(${cwdLogPathLiteral}, \`\${cwd}\\n\`);
fs.appendFileSync(${logPathLiteral}, \`\${args.join(' ')}\\n\`);

if (args[0] === 'issue' && args[1] === 'create') {
  console.log('https://github.com/acme/repo/issues/123');
  process.exit(0);
}
if (args[0] === 'issue' && args[1] === 'view') {
  const issueRef = args[2];
  if (issueRef === '123') {
    console.log('{"number":123,"state":"OPEN"}');
    process.exit(0);
  }
  console.error('issue not found: ' + issueRef);
  process.exit(1);
}
if (args[0] === 'pr' && args[1] === 'create') {
  console.log('https://github.com/acme/repo/pull/77');
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'merge') {
  console.log('merged');
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'view') {
  console.log('{"url":"https://github.com/acme/repo/pull/77","headRefName":"feature-branch","baseRefName":"main"}');
  process.exit(0);
}
process.exit(0);
`,
    'utf-8'
  );
  await fs.chmod(scriptPath, 0o755);
  await fs.writeFile(
    cmdScriptPath,
    `@echo off\r\n"${process.execPath}" "%~dp0\\gh" %*\r\n`,
    'utf-8'
  );
  return {
    logPath,
    cwdLogPath,
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    },
  };
}

function actionOptionByLabel(payload, label) {
  return (payload?.actionOptions || []).find((option) => option.label === label);
}

function primaryActionOption(payload) {
  const primaryLabel = payload?.primaryActionLabel;
  if (typeof primaryLabel === 'string' && primaryLabel.length > 0) {
    const byPrimaryLabel = actionOptionByLabel(payload, primaryLabel);
    if (byPrimaryLabel) {
      return byPrimaryLabel;
    }
  }
  return payload?.actionOptions?.[0];
}

function suggestionOptionByLabel(payload, label = 'A') {
  return (payload?.suggestionOptions || []).find((option) => option.label === label);
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

## Architecture Diagram

\`\`\`mermaid
flowchart TD
  A[Client] --> B[Server]
\`\`\`

## Related Documents

- **Spec**: \`docs/features/F001-alpha/spec.md\`
- **Tasks**: \`docs/features/F001-alpha/tasks.md\`
`;
  await fs.writeFile(bodyFile, body, 'utf-8');
}


export {
  fs,
  path,
  os,
  runCli,
  runCommand,
  withTempDir,
  pathExists,
  normalizePathForCompare,
  setupFakeGhCli,
  setFeatureAsDone,
  setMultiFeatureAsDone,
  writeIssueBodyWithoutTodo,
  writePrBodyWithoutTodo,
  issueApprovalTicket,
  primaryActionOption,
  actionOptionByLabel,
  suggestionOptionByLabel,
};

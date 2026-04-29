import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

async function setupFeature(dir) {
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

  return path.join(dir, 'docs', 'features', 'F001-alpha');
}

test('task add appends a complete task block to tasks.md', async () => {
  await withTempDir('lsk-task-add-', async (dir) => {
    const featureDir = await setupFeature(dir);

    const result = await runCli(dir, [
      'task',
      'add',
      'F001-alpha',
      '--title',
      'implement alpha shell',
      '--ref',
      'NON-PRD',
      '--acceptance',
      'alpha command renders expected output',
      '--check',
      'add command handler',
      '--check',
      'cover CLI output',
      '--json',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'TASK_ADDED');
    assert.equal(payload.feature, 'F001-alpha');
    assert.equal(payload.taskId, 'T-F001-alpha-01');
    assert.equal(payload.tasksUpdated, true);

    const tasks = await fs.readFile(path.join(featureDir, 'tasks.md'), 'utf-8');
    assert.match(
      tasks,
      /- \[TODO\]\[NON-PRD\] T-F001-alpha-01 implement alpha shell\n {2}- Date: \d{4}-\d{2}-\d{2}\n {2}- Acceptance:\n {4}- alpha command renders expected output\n {2}- Checklist:\n {4}- \[ \] add command handler\n {4}- \[ \] cover CLI output/
    );
    assert.ok(
      tasks.indexOf('T-F001-alpha-01 implement alpha shell') <
        tasks.indexOf('## Completion Criteria')
    );
  });
});

test('decision add appends the next ADR block to decisions.md', async () => {
  await withTempDir('lsk-decision-add-', async (dir) => {
    const featureDir = await setupFeature(dir);

    const result = await runCli(dir, [
      'decision',
      'add',
      'F001-alpha',
      '--title',
      'Use docs-only mutation commands',
      '--context',
      'Agents need stable helpers for canonical feature docs.',
      '--decision',
      'Add command helpers that only patch markdown docs.',
      '--rationale',
      'The helper keeps formatting consistent without reviving runtime orchestration.',
      '--evidence',
      'Test: pnpm vitest run tests/cli-doc-mutations.test.mjs',
      '--json',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'DECISION_ADDED');
    assert.equal(payload.feature, 'F001-alpha');
    assert.equal(payload.decisionId, 'D001');
    assert.equal(payload.decisionsUpdated, true);

    const decisions = await fs.readFile(path.join(featureDir, 'decisions.md'), 'utf-8');
    assert.match(decisions, /## D001: Use docs-only mutation commands \(\d{4}-\d{2}-\d{2}\)/);
    assert.doesNotMatch(decisions, /\{Decision Title\}/);
    assert.match(decisions, /- \*\*Context\*\*: Agents need stable helpers for canonical feature docs\./);
    assert.match(decisions, /- \*\*Decision\*\*: Add command helpers that only patch markdown docs\./);
    assert.match(decisions, /- \*\*Rationale\*\*: The helper keeps formatting consistent without reviving runtime orchestration\./);
    assert.match(decisions, / {2}- \*\*Test\/Log\*\*: Test: pnpm vitest run tests\/cli-doc-mutations\.test\.mjs/);
  });
});

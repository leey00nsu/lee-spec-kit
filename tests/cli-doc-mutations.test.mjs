import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

async function setupFeature(dir, { featureId = 'F001', lang = 'en' } = {}) {
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

  const feature = await runCli(dir, ['feature', 'alpha', '--id', featureId]);
  assert.equal(feature.code, 0, feature.stderr || feature.stdout);

  return path.join(dir, 'docs', 'features', `${featureId}-alpha`);
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

test('task add serializes concurrent appends with unique task ids', async () => {
  await withTempDir('lsk-task-add-concurrent-', async (dir) => {
    const featureDir = await setupFeature(dir);

    const results = await Promise.all(
      ['alpha shell', 'beta shell', 'gamma shell'].map((title) =>
        runCli(dir, [
          'task',
          'add',
          'F001-alpha',
          '--title',
          title,
          '--ref',
          'NON-PRD',
          '--acceptance',
          `${title} acceptance`,
          '--check',
          `${title} check`,
          '--json',
        ])
      )
    );

    for (const result of results) {
      assert.equal(result.code, 0, result.stderr || result.stdout);
    }

    const tasks = await fs.readFile(path.join(featureDir, 'tasks.md'), 'utf-8');
    const taskIds = [...tasks.matchAll(/\bT-F001-alpha-(\d{2})\b/g)].map(
      (match) => match[0]
    );
    assert.deepEqual(taskIds.sort(), [
      'T-F001-alpha-01',
      'T-F001-alpha-02',
      'T-F001-alpha-03',
    ]);
    assert.match(tasks, /alpha shell/);
    assert.match(tasks, /beta shell/);
    assert.match(tasks, /gamma shell/);
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

test('decision numbering stays Feature-local for non-F001 Features in both languages', async () => {
  for (const lang of ['en', 'ko']) {
    await withTempDir(`lsk-decision-number-${lang}-`, async (dir) => {
      const featureDir = await setupFeature(dir, { featureId: 'F042', lang });
      const decisions = await fs.readFile(path.join(featureDir, 'decisions.md'), 'utf-8');

      assert.match(decisions, /> (?:Format|형식): `DNNN:/);
      assert.match(decisions, /^## D001:/m);
      assert.doesNotMatch(decisions, /^## D042:/m);
    });
  }
});

test('decision add repairs a legacy Feature-numbered initial placeholder to D001', async () => {
  await withTempDir('lsk-decision-placeholder-repair-', async (dir) => {
    const featureDir = await setupFeature(dir, { featureId: 'F042' });
    const decisionsPath = path.join(featureDir, 'decisions.md');
    const decisions = await fs.readFile(decisionsPath, 'utf-8');
    await fs.writeFile(decisionsPath, decisions.replace('## D001:', '## D042:'), 'utf-8');

    const result = await runCli(dir, [
      'decision',
      'add',
      'F042-alpha',
      '--title',
      'Use Feature-local decision numbering',
      '--context',
      'A legacy placeholder inherited the Feature number.',
      '--decision',
      'Start the decision log at D001.',
      '--rationale',
      'Decision numbering is independent for every Feature.',
      '--evidence',
      'Regression: non-F001 Feature placeholder repair',
      '--json',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.decisionId, 'D001');

    const updated = await fs.readFile(decisionsPath, 'utf-8');
    assert.match(updated, /^## D001: Use Feature-local decision numbering/m);
    assert.doesNotMatch(updated, /^## D042:/m);
  });
});

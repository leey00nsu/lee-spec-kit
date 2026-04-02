import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

test('feature template uses a flat task list without phase headings or priority tags', async () => {
  await withTempDir('lsk-task-template-flat-', async (dir) => {
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
    const tasks = await fs.readFile(tasksPath, 'utf-8');
    assert.doesNotMatch(tasks, /^### Phase /m);
    assert.doesNotMatch(tasks, /\[TODO\]\[P1\]/);
    assert.match(tasks, /- \[TODO\]\[PRD-FR-001\] T-\{feature-ref\}-01 \{Task Title\}/);
  });
});

test('task add appends the first task block and generates the next task id', async () => {
  await withTempDir('lsk-task-add-first-', async (dir) => {
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

    const addTask = await runCli(dir, [
      'task',
      'add',
      'F001-alpha',
      '--title',
      'implement alpha shell',
      '--ref',
      'NON-PRD',
      '--json',
    ]);
    assert.equal(addTask.code, 0, addTask.stderr || addTask.stdout);
    const payload = JSON.parse(addTask.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'TASK_ADDED');
    assert.equal(payload.feature, 'F001-alpha');
    assert.equal(payload.taskId, 'T-F001-alpha-01');
    assert.equal(payload.title, 'implement alpha shell');
    assert.equal(payload.ref, 'NON-PRD');
    assert.equal(payload.tasksUpdated, true);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasks = await fs.readFile(tasksPath, 'utf-8');
    assert.match(
      tasks,
      /- \[TODO\]\[NON-PRD\] T-F001-alpha-01 implement alpha shell\n  - Date: \d{4}-\d{2}-\d{2}\n  - Acceptance:\n    - -\n  - Checklist:\n    - \[ \] -/
    );
    assert.ok(
      tasks.indexOf('T-F001-alpha-01 implement alpha shell') <
        tasks.indexOf('## Completion Criteria')
    );
  });
});

test('task add appends after the last task block and task-run/task-complete work without priority tags', async () => {
  await withTempDir('lsk-task-add-next-', async (dir) => {
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
    const prdPath = path.join(dir, 'docs', 'prd', 'alpha.md');
    await fs.mkdir(path.dirname(prdPath), { recursive: true });
    await fs.writeFile(
      prdPath,
      '# Alpha PRD\n\n- PRD-FR-001: Alpha docs remain wired\n',
      'utf-8'
    );
    const seeded = `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Review

## Task Entry Format

\`\`\`markdown
- [TODO][PRD-FR-001] T-F{number}-01 {Task Title}
\`\`\`

## Task List

- [TODO][PRD-FR-001] T-F001-alpha-01 implement alpha shell
  - Date: 2026-04-02
  - Acceptance:
    - shell works
  - Checklist:
    - [ ] add command

## Completion Criteria
`;
    await fs.writeFile(tasksPath, seeded, 'utf-8');

    const addTask = await runCli(dir, [
      'task',
      'add',
      'F001-alpha',
      '--title',
      'wire alpha docs',
      '--ref',
      'PRD-FR-001',
      '--json',
    ]);
    assert.equal(addTask.code, 0, addTask.stderr || addTask.stdout);
    const addPayload = JSON.parse(addTask.stdout.trim());
    assert.equal(addPayload.taskId, 'T-F001-alpha-02');

    let tasks = await fs.readFile(tasksPath, 'utf-8');
    assert.ok(
      tasks.indexOf('T-F001-alpha-01 implement alpha shell') <
        tasks.indexOf('T-F001-alpha-02 wire alpha docs')
    );

    const runTask = await runCli(dir, [
      'task-run',
      'F001-alpha',
      '--task',
      'T-F001-alpha-02',
      '--json',
    ]);
    assert.equal(runTask.code, 0, runTask.stderr || runTask.stdout);
    const runPayload = JSON.parse(runTask.stdout.trim());
    assert.equal(runPayload.reasonCode, 'TASK_RUN_READY');
    assert.equal(runPayload.taskId, 'T-F001-alpha-02');

    tasks = await fs.readFile(tasksPath, 'utf-8');
    assert.match(tasks, /\[DOING\]\[PRD-FR-001\] T-F001-alpha-02 wire alpha docs/);

    const completeTask = await runCli(dir, [
      'task-complete',
      'F001-alpha',
      '--task',
      'T-F001-alpha-02',
      '--json',
    ]);
    assert.equal(
      completeTask.code,
      0,
      completeTask.stderr || completeTask.stdout
    );
    const completePayload = JSON.parse(completeTask.stdout.trim());
    assert.equal(completePayload.reasonCode, 'TASK_COMPLETED');
    assert.equal(completePayload.taskId, 'T-F001-alpha-02');

    tasks = await fs.readFile(tasksPath, 'utf-8');
    assert.match(tasks, /\[DONE\]\[PRD-FR-001\] T-F001-alpha-02 wire alpha docs/);
  });
});

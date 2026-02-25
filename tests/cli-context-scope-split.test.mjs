import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  fs,
  path,
  runCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

function buildTasksDoc(taskCount) {
  const tasks = Array.from({ length: taskCount }, (_, index) => {
    const num = String(index + 1).padStart(3, '0');
    return `- [TODO] T-F001-alpha-${num} alpha task ${num}`;
  }).join('\n');

  return `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Draft
- **Issue**: -
- **PR**: -
- **PR Status**: -

## Task List

${tasks}

## Completion Criteria

- [ ] pending
`;
}

test('context surfaces split options when feature scope is oversized', async () => {
  await withTempDir('lsk-context-scope-split-', async (dir) => {
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

    const featureDir = path.join(dir, 'docs', 'features', 'F001-alpha');
    await fs.writeFile(path.join(featureDir, 'tasks.md'), buildTasksDoc(41), 'utf-8');
    const longDecisions = Array.from(
      { length: 1205 },
      (_, index) => `decision line ${index + 1}`
    ).join('\n');
    await fs.writeFile(path.join(featureDir, 'decisions.md'), longDecisions, 'utf-8');

    const contextResult = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(
      contextResult.code,
      0,
      contextResult.stderr || contextResult.stdout
    );
    const payload = JSON.parse(contextResult.stdout.trim());

    assert.equal(payload.matchedFeature.scopeSplit.suggested, true);
    assert.equal(
      payload.matchedFeature.scopeSplit.reasons.includes('task_count'),
      true
    );
    assert.equal(
      payload.matchedFeature.scopeSplit.reasons.includes('decisions_lines'),
      true
    );
    assert.equal(payload.matchedFeature.scopeSplit.taskCount, 41);
    assert.equal(payload.matchedFeature.scopeSplit.decisionsLineCount, 1205);
    assert.equal(payload.matchedFeature.scopeSplit.recommendation, 'split_2');

    const splitOptions = (payload.actionOptions || []).filter(
      (option) => option?.action?.category === 'feature_scope_split'
    );
    assert.equal(splitOptions.length, 3);
    assert.equal(
      splitOptions.some((option) => /split into 4 linked issues/i.test(option.detail)),
      true
    );
    assert.equal(
      (payload.matchedFeature.warnings || []).some((warning) =>
        /too large for one issue/i.test(String(warning))
      ),
      true
    );
    assert.equal(
      (payload.requiredDocs || []).some((doc) => doc?.id === 'split-feature'),
      true
    );
  });
});

test('context does not add split options under scale threshold', async () => {
  await withTempDir('lsk-context-scope-split-small-', async (dir) => {
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

    const contextResult = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(
      contextResult.code,
      0,
      contextResult.stderr || contextResult.stdout
    );
    const payload = JSON.parse(contextResult.stdout.trim());

    assert.equal(payload.matchedFeature.scopeSplit.suggested, false);
    assert.equal(
      (payload.actionOptions || []).some(
        (option) => option?.action?.category === 'feature_scope_split'
      ),
      false
    );
  });
});

test('context recommends 4-way split for very large scope', async () => {
  await withTempDir('lsk-context-scope-split-large-', async (dir) => {
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

    const featureDir = path.join(dir, 'docs', 'features', 'F001-alpha');
    await fs.writeFile(path.join(featureDir, 'tasks.md'), buildTasksDoc(85), 'utf-8');

    const contextResult = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(
      contextResult.code,
      0,
      contextResult.stderr || contextResult.stdout
    );
    const payload = JSON.parse(contextResult.stdout.trim());

    assert.equal(payload.matchedFeature.scopeSplit.suggested, true);
    assert.equal(payload.matchedFeature.scopeSplit.recommendation, 'split_4');
    assert.equal(
      (payload.actionOptions || []).some(
        (option) =>
          option?.action?.category === 'feature_scope_split' &&
          /4 linked issues/i.test(String(option.detail))
      ),
      true
    );
  });
});

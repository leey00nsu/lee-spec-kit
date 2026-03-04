import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fs, path, runCli, withTempDir } from './helpers/cli-contract-helpers.mjs';

test('requirements --json reports PRD requirement coverage from tasks tags', async () => {
  await withTempDir('lsk-requirements-json-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--yes',
      '--name',
      'ReqJson',
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

    // PRD definitions (SSOT)
    const prdPath = path.join(dir, 'docs', 'prd', 'req-prd.md');
    await fs.writeFile(
      prdPath,
      `# Demo PRD\n\n## Requirements\n\n- PRD-FR-001: Login rate limit\n- PRD-US-002: Admin can view metrics\n`,
      'utf-8'
    );

    // Feature + tasks referencing PRD IDs via bracket tags
    const featureResult = await runCli(dir, [
      'feature',
      'alpha',
      '--id',
      'F001',
      '--non-interactive',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    await fs.writeFile(
      tasksPath,
      `# Tasks: alpha\n\n## Task List\n\n- [TODO][P1][PRD-FR-001] T-F001-01 implement rate limit\n- [DONE][P1][PRD-US-002] T-F001-02 implement metrics dashboard\n- [TODO][P2] T-F001-03 missing mapping tag\n- [DONE][P3][PRD-FR-999] T-F001-04 unknown requirement ref\n- [DONE][NON-PRD] T-F001-05 refactor\n`,
      'utf-8'
    );

    const result = await runCli(dir, ['requirements', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'REQUIREMENTS_ISSUES_FOUND');
    assert.equal(typeof payload.counts?.defined, 'number');
    assert.equal(typeof payload.counts?.referenced, 'number');
    assert.equal(typeof payload.counts?.unknownReferences, 'number');
    assert.equal(typeof payload.counts?.unmappedTasks, 'number');
    assert.equal(Array.isArray(payload.requirements), true);

    const byId = new Map(payload.requirements.map((r) => [r.id, r]));
    assert.equal(byId.get('PRD-FR-001')?.tasks?.todo, 1);
    assert.equal(byId.get('PRD-US-002')?.tasks?.done, 1);

    // Unknown ref should be surfaced
    assert.equal(byId.get('PRD-FR-999')?.defined, false);
    assert.equal(payload.counts.unknownReferences > 0, true);

    // Unmapped task should be surfaced
    assert.equal(payload.counts.unmappedTasks > 0, true);
    assert.equal(Array.isArray(payload.unmappedTasks), true);
  });
});

test('requirements --strict exits non-zero when unknown refs or unmapped tasks exist', async () => {
  await withTempDir('lsk-requirements-strict-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--yes',
      '--name',
      'ReqStrict',
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

    await fs.writeFile(
      path.join(dir, 'docs', 'prd', 'req-prd.md'),
      `# Demo PRD\n\n- PRD-FR-001: Login\n`,
      'utf-8'
    );

    const featureResult = await runCli(dir, [
      'feature',
      'alpha',
      '--id',
      'F001',
      '--non-interactive',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    await fs.writeFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      `# Tasks: alpha\n\n- [TODO][P1] T-F001-01 missing mapping\n`,
      'utf-8'
    );

    const result = await runCli(dir, ['requirements', '--strict', '--json']);
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'REQUIREMENTS_ISSUES_FOUND');
  });
});

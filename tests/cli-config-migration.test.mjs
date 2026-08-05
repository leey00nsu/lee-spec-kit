import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  fs,
  path,
  runCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

async function writeProjectConfig(dir, overrides) {
  const docsDir = path.join(dir, 'docs');
  await fs.mkdir(path.join(docsDir, 'features'), { recursive: true });
  await fs.writeFile(
    path.join(docsDir, '.lee-spec-kit.json'),
    `${JSON.stringify(
      {
        projectName: 'demo',
        projectType: 'single',
        lang: 'en',
        docsRepo: 'embedded',
        ...overrides,
      },
      null,
      2
    )}\n`,
    'utf-8'
  );
  return docsDir;
}

async function runConfigUpdate(dir) {
  const result = await runCli(dir, ['update', '--agents-md', '--force']);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  return JSON.parse(
    await fs.readFile(
      path.join(dir, 'docs', '.lee-spec-kit.json'),
      'utf-8'
    )
  );
}

const workflowMigrationCases = [
  {
    name: 'preset-only local remains local',
    workflow: { preset: 'local' },
    expected: { mode: 'local', requireWorktree: false },
  },
  {
    name: 'preset-only github remains github',
    workflow: { preset: 'github' },
    expected: { mode: 'github', requireWorktree: false },
  },
  {
    name: 'strict preserves its historical worktree requirement',
    workflow: { preset: 'strict' },
    expected: { mode: 'github', requireWorktree: true },
  },
  {
    name: 'strict does not override an explicit worktree setting',
    workflow: { preset: 'strict', requireWorktree: false },
    expected: { mode: 'github', requireWorktree: false },
  },
  {
    name: 'canonical mode wins over a conflicting preset',
    workflow: { preset: 'local', mode: 'github' },
    expected: { mode: 'github', requireWorktree: false },
  },
  {
    name: 'mode-only local remains local',
    workflow: { mode: 'local' },
    expected: { mode: 'local', requireWorktree: false },
  },
];

for (const migrationCase of workflowMigrationCases) {
  test(`update ${migrationCase.name}`, async () => {
    await withTempDir('lsk-config-mode-migration-', async (dir) => {
      await writeProjectConfig(dir, { workflow: migrationCase.workflow });

      const updated = await runConfigUpdate(dir);

      assert.equal(updated.workflow.mode, migrationCase.expected.mode);
      assert.equal(
        updated.workflow.requireWorktree,
        migrationCase.expected.requireWorktree
      );
      assert.equal('preset' in updated.workflow, false);
    });
  });
}

test('update migrates legacy step approval policy to categories', async () => {
  await withTempDir('lsk-config-approval-migration-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: { mode: 'github' },
      approval: {
        mode: 'steps',
        requireCheckSteps: [3, 10],
        taskExecuteCheck: 'start_only',
        owner: 'platform',
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.deepEqual(updated.approval, {
      mode: 'category',
      default: 'keep',
      requireCheckCategories: [
        'spec_approve',
        'task_execute',
        'implementation_approve',
      ],
      skipCheckCategories: [
        'spec_write',
        'plan_write',
        'plan_approve',
        'tasks_write',
        'tasks_approve',
        'issue_prepare',
        'issue_create',
        'branch_create',
        'pre_pr_review',
        'pr_prepare',
        'pr_create',
        'code_review',
        'pr_merge',
      ],
      owner: 'platform',
    });

    const updatedAgain = await runConfigUpdate(dir);
    assert.deepEqual(updatedAgain, updated);
  });
});

test('update removes runtime settings that no current command consumes', async () => {
  await withTempDir('lsk-config-dead-settings-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: {
        mode: 'github',
        auto: {
          defaultPreset: 'pr-handoff',
          defaultUntilCategories: ['pr_create'],
        },
        prePrReview: {
          enabled: true,
          skills: ['code-review-excellence'],
          fallback: 'builtin-checklist',
          evidenceMode: 'any',
          decisionEnum: ['approve', 'blocked'],
          enforceExecutionEvidence: true,
          executionCommandPrefixes: ['pnpm test'],
        },
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.deepEqual(updated.workflow.prePrReview, {
      enabled: true,
      evidenceMode: 'any',
      reviewer: {
        type: 'subagent',
        model: 'inherit',
        reasoningEffort: 'high',
        onUnavailable: 'inherit',
      },
    });
    assert.equal('auto' in updated.workflow, false);
  });
});

test('init writes only canonical workflow runtime settings', async () => {
  await withTempDir('lsk-config-canonical-init-', async (dir) => {
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

    const config = JSON.parse(
      await fs.readFile(
        path.join(dir, 'docs', '.lee-spec-kit.json'),
        'utf-8'
      )
    );

    assert.deepEqual(config.workflow, {
      mode: 'local',
      requireWorktree: false,
      codeDirtyScope: 'auto',
      taskCommitGate: 'warn',
      prePrReview: {
        evidenceMode: 'path_required',
        reviewer: {
          type: 'subagent',
          model: 'inherit',
          reasoningEffort: 'high',
          onUnavailable: 'inherit',
        },
      },
    });
  });
});

test('update preserves valid Pre-PR subagent overrides and normalizes invalid values', async () => {
  await withTempDir('lsk-config-pre-pr-reviewer-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: {
        mode: 'github',
        prePrReview: {
          reviewer: {
            type: 'main',
            model: '  gpt-reviewer  ',
            reasoningEffort: 'extreme',
            onUnavailable: 'skip',
          },
        },
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.deepEqual(updated.workflow.prePrReview.reviewer, {
      type: 'subagent',
      model: 'gpt-reviewer',
      reasoningEffort: 'high',
      onUnavailable: 'inherit',
    });
  });
});

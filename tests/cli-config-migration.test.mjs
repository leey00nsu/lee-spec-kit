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
    await fs.readFile(path.join(dir, 'docs', '.lee-spec-kit.json'), 'utf-8')
  );
}

test('update backfills the OpenWiki experiment to false without enabling behavior', async () => {
  await withTempDir('lsk-config-openwiki-backfill-', async (dir) => {
    await writeProjectConfig(dir, { workflow: { mode: 'local' } });

    const updated = await runConfigUpdate(dir);

    assert.deepEqual(updated.experimental, { openwiki: false });
  });
});

test('config controls OpenWiki with one strict boolean flag', async () => {
  await withTempDir('lsk-config-openwiki-toggle-', async (dir) => {
    await writeProjectConfig(dir, {
      experimental: {},
      workflow: { mode: 'local' },
    });

    let result = await runCli(dir, ['config', '--openwiki', 'true']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    let config = JSON.parse(
      await fs.readFile(path.join(dir, 'docs', '.lee-spec-kit.json'), 'utf-8')
    );
    assert.deepEqual(config.experimental, { openwiki: true });

    result = await runCli(dir, ['config', '--openwiki', 'warn']);
    assert.notEqual(result.code, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /true.*false/u);

    result = await runCli(dir, ['config', '--openwiki', 'false']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    config = JSON.parse(
      await fs.readFile(path.join(dir, 'docs', '.lee-spec-kit.json'), 'utf-8')
    );
    assert.deepEqual(config.experimental, { openwiki: false });
  });
});

test('detect rejects a malformed OpenWiki experiment instead of treating it as false', async () => {
  await withTempDir('lsk-config-openwiki-invalid-detect-', async (dir) => {
    await writeProjectConfig(dir, {
      experimental: { openwiki: 'true' },
      workflow: { mode: 'local' },
    });

    const result = await runCli(dir, ['detect', '--json']);
    assert.notEqual(result.code, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'INVALID_CONFIG');
  });
});

const workflowMigrationCases = [
  {
    name: 'preset-only local remains local',
    workflow: { preset: 'local' },
    expected: {
      mode: 'local',
      requireWorktree: false,
      completionStrategy: 'none',
    },
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
    expected: {
      mode: 'local',
      requireWorktree: false,
      completionStrategy: 'none',
    },
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
      if (migrationCase.expected.completionStrategy) {
        assert.equal(
          updated.workflow.completionStrategy,
          migrationCase.expected.completionStrategy
        );
      }
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

    assert.equal('prePrReview' in updated.workflow, false);
    assert.deepEqual(updated.workflow.agentExecution.task, {
      enabled: false,
      type: 'subagent',
      model: 'inherit',
      reasoningEffort: 'high',
      onUnavailable: 'inherit',
    });
    assert.deepEqual(updated.workflow.agentReview.plan, {
      enabled: false,
      evidenceMode: 'path_required',
      reviewer: {
        type: 'subagent',
        model: 'inherit',
        reasoningEffort: 'high',
        onUnavailable: 'inherit',
      },
    });
    assert.equal(updated.workflow.agentReview.maxRounds, 1);
    assert.deepEqual(updated.workflow.agentReview.task, {
      enabled: false,
      evidenceMode: 'path_required',
      reviewer: {
        type: 'subagent',
        model: 'inherit',
        reasoningEffort: 'high',
        onUnavailable: 'inherit',
      },
    });
    assert.deepEqual(updated.workflow.agentReview.feature, {
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
      await fs.readFile(path.join(dir, 'docs', '.lee-spec-kit.json'), 'utf-8')
    );

    assert.deepEqual(config.workflow, {
      mode: 'local',
      requireWorktree: false,
      codeDirtyScope: 'auto',
      taskCommitGate: 'warn',
      baseBranch: 'main',
      completionStrategy: 'local-ff',
      deleteFeatureBranchAfterMerge: true,
      featureChecks: [],
      postMergeChecks: [],
      agentAutomationConfigured: true,
      agentExecution: {
        task: {
          enabled: true,
          type: 'subagent',
          model: 'inherit',
          reasoningEffort: 'high',
          onUnavailable: 'inherit',
        },
      },
      agentReview: {
        maxRounds: 1,
        plan: {
          enabled: true,
          evidenceMode: 'path_required',
          reviewer: {
            type: 'subagent',
            model: 'inherit',
            reasoningEffort: 'high',
            onUnavailable: 'inherit',
          },
        },
        task: {
          enabled: false,
          evidenceMode: 'path_required',
          reviewer: {
            type: 'subagent',
            model: 'inherit',
            reasoningEffort: 'high',
            onUnavailable: 'inherit',
          },
        },
        feature: {
          enabled: true,
          evidenceMode: 'path_required',
          reviewer: {
            type: 'subagent',
            model: 'inherit',
            reasoningEffort: 'high',
            onUnavailable: 'inherit',
          },
        },
      },
    });
    assert.deepEqual(config.approval, {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: [
        'spec_approve',
        'implementation_approve',
        'local_merge',
      ],
    });
  });
});

test('update adds local merge to the previous generated default approval policy', async () => {
  await withTempDir('lsk-config-local-merge-default-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: { mode: 'local' },
      approval: {
        mode: 'category',
        default: 'skip',
        requireCheckCategories: ['spec_approve', 'implementation_approve'],
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.deepEqual(updated.approval, {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: [
        'spec_approve',
        'implementation_approve',
        'local_merge',
      ],
    });
  });
});

test('update migrates valid Pre-PR subagent overrides and normalizes invalid values', async () => {
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

    assert.equal('prePrReview' in updated.workflow, false);
    assert.deepEqual(updated.workflow.agentReview.feature.reviewer, {
      type: 'subagent',
      model: 'gpt-reviewer',
      reasoningEffort: 'high',
      onUnavailable: 'inherit',
    });
  });
});

test('update preserves configurable Plan review subagent settings', async () => {
  await withTempDir('lsk-config-plan-reviewer-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: {
        mode: 'github',
        agentReview: {
          plan: {
            enabled: false,
            evidenceMode: 'any',
            reviewer: {
              type: 'subagent',
              model: '  gpt-plan-reviewer  ',
              reasoningEffort: 'xhigh',
              onUnavailable: 'error',
            },
          },
        },
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.deepEqual(updated.workflow.agentReview.plan, {
      enabled: false,
      evidenceMode: 'any',
      reviewer: {
        type: 'subagent',
        model: 'gpt-plan-reviewer',
        reasoningEffort: 'xhigh',
        onUnavailable: 'error',
      },
    });
  });
});

test('update preserves a valid maximum review round count', async () => {
  await withTempDir('lsk-config-review-rounds-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: {
        mode: 'github',
        agentReview: {
          maxRounds: 3,
        },
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.equal(updated.workflow.agentReview.maxRounds, 3);
  });
});

for (const invalidMaxRounds of [0, -1, 1.5, '3']) {
  test(`update normalizes invalid maximum review rounds ${JSON.stringify(invalidMaxRounds)}`, async () => {
    await withTempDir('lsk-config-invalid-review-rounds-', async (dir) => {
      await writeProjectConfig(dir, {
        workflow: {
          mode: 'github',
          agentReview: {
            maxRounds: invalidMaxRounds,
          },
        },
      });

      const updated = await runConfigUpdate(dir);

      assert.equal(updated.workflow.agentReview.maxRounds, 1);
    });
  });
}

test('update normalizes task implementation subagent settings and preserves opt-out', async () => {
  await withTempDir('lsk-config-task-executor-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: {
        mode: 'local',
        agentExecution: {
          task: {
            enabled: false,
            type: 'main',
            model: '  gpt-task-worker  ',
            reasoningEffort: 'extreme',
            onUnavailable: 'skip',
          },
        },
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.deepEqual(updated.workflow.agentExecution.task, {
      enabled: false,
      type: 'subagent',
      model: 'gpt-task-worker',
      reasoningEffort: 'high',
      onUnavailable: 'inherit',
    });
  });
});

test('update keeps newly introduced automation disabled for legacy local projects', async () => {
  await withTempDir('lsk-config-local-agent-review-default-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: {
        mode: 'local',
        prePrReview: {
          evidenceMode: 'path_required',
        },
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.equal(updated.workflow.agentExecution.task.enabled, false);
    assert.equal(updated.workflow.agentReview.plan.enabled, false);
    assert.equal(updated.workflow.agentReview.task.enabled, false);
    assert.equal(updated.workflow.agentReview.feature.enabled, false);
    assert.equal('prePrReview' in updated.workflow, false);
  });
});

test('update preserves explicitly enabled agent automation', async () => {
  await withTempDir('lsk-config-agent-explicit-opt-in-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: {
        mode: 'local',
        agentExecution: { task: { enabled: true } },
        agentReview: {
          plan: { enabled: true },
          task: { enabled: true },
          feature: { enabled: true },
        },
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.equal(updated.workflow.agentExecution.task.enabled, true);
    assert.equal(updated.workflow.agentReview.plan.enabled, true);
    assert.equal(updated.workflow.agentReview.task.enabled, true);
    assert.equal(updated.workflow.agentReview.feature.enabled, true);
  });
});

test('update repairs agent automation defaults previously backfilled into an older project', async () => {
  await withTempDir('lsk-config-agent-backfill-repair-', async (dir) => {
    await writeProjectConfig(dir, {
      createdAt: '2026-08-25',
      workflow: {
        mode: 'local',
        agentExecution: {
          task: {
            enabled: true,
            type: 'subagent',
            model: 'inherit',
            reasoningEffort: 'high',
            onUnavailable: 'inherit',
          },
        },
        agentReview: {
          maxRounds: 1,
          plan: {
            enabled: true,
            evidenceMode: 'path_required',
            reviewer: {
              type: 'subagent',
              model: 'inherit',
              reasoningEffort: 'high',
              onUnavailable: 'inherit',
            },
          },
        },
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.equal(updated.workflow.agentExecution.task.enabled, false);
    assert.equal(updated.workflow.agentReview.plan.enabled, false);
  });
});

test('update preserves generated agent defaults for projects created after opt-in init existed', async () => {
  await withTempDir('lsk-config-agent-new-project-', async (dir) => {
    await writeProjectConfig(dir, {
      createdAt: '2026-08-27',
      workflow: {
        mode: 'local',
        agentExecution: {
          task: {
            enabled: true,
            type: 'subagent',
            model: 'inherit',
            reasoningEffort: 'high',
            onUnavailable: 'inherit',
          },
        },
        agentReview: {
          plan: {
            enabled: true,
            evidenceMode: 'path_required',
            reviewer: {
              type: 'subagent',
              model: 'inherit',
              reasoningEffort: 'high',
              onUnavailable: 'inherit',
            },
          },
        },
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.equal(updated.workflow.agentExecution.task.enabled, true);
    assert.equal(updated.workflow.agentReview.plan.enabled, true);
  });
});

test('config normalizes legacy backfilled defaults before applying a partial opt-in', async () => {
  await withTempDir('lsk-config-agent-partial-opt-in-', async (dir) => {
    await writeProjectConfig(dir, {
      createdAt: '2026-08-25',
      workflow: {
        mode: 'local',
        agentExecution: {
          task: {
            enabled: true,
            type: 'subagent',
            model: 'inherit',
            reasoningEffort: 'high',
            onUnavailable: 'inherit',
          },
        },
        agentReview: {
          plan: {
            enabled: true,
            evidenceMode: 'path_required',
            reviewer: {
              type: 'subagent',
              model: 'inherit',
              reasoningEffort: 'high',
              onUnavailable: 'inherit',
            },
          },
        },
      },
    });

    const result = await runCli(dir, [
      'config',
      '--task-agent',
      'on',
      '--non-interactive',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const config = JSON.parse(
      await fs.readFile(path.join(dir, 'docs', '.lee-spec-kit.json'), 'utf-8')
    );
    assert.equal(config.workflow.agentExecution.task.enabled, true);
    assert.equal(config.workflow.agentReview.plan.enabled, false);
    assert.equal(config.workflow.agentAutomationConfigured, true);
  });
});

test('config changes agent automation and local completion settings', async () => {
  await withTempDir('lsk-config-workflow-options-', async (dir) => {
    await writeProjectConfig(dir, { workflow: { mode: 'local' } });

    const enable = await runCli(dir, [
      'config',
      '--task-agent',
      'on',
      '--reviews',
      'plan,feature',
      '--max-review-rounds',
      '2',
      '--completion-strategy',
      'local-squash',
      '--non-interactive',
    ]);
    assert.equal(enable.code, 0, enable.stderr || enable.stdout);

    let config = JSON.parse(
      await fs.readFile(path.join(dir, 'docs', '.lee-spec-kit.json'), 'utf-8')
    );
    assert.equal(config.workflow.agentExecution.task.enabled, true);
    assert.equal(config.workflow.agentReview.plan.enabled, true);
    assert.equal(config.workflow.agentReview.task.enabled, false);
    assert.equal(config.workflow.agentReview.feature.enabled, true);
    assert.equal(config.workflow.agentReview.maxRounds, 2);
    assert.equal(config.workflow.completionStrategy, 'local-squash');
    assert.equal(config.workflow.agentAutomationConfigured, true);

    const disable = await runCli(dir, [
      'config',
      '--task-agent',
      'off',
      '--reviews',
      'none',
      '--non-interactive',
    ]);
    assert.equal(disable.code, 0, disable.stderr || disable.stdout);

    config = JSON.parse(
      await fs.readFile(path.join(dir, 'docs', '.lee-spec-kit.json'), 'utf-8')
    );
    assert.equal(config.workflow.agentExecution.task.enabled, false);
    assert.equal(config.workflow.agentReview.plan.enabled, false);
    assert.equal(config.workflow.agentReview.task.enabled, false);
    assert.equal(config.workflow.agentReview.feature.enabled, false);
  });
});

test('config rejects invalid workflow customization values', async () => {
  await withTempDir('lsk-config-workflow-invalid-', async (dir) => {
    await writeProjectConfig(dir, { workflow: { mode: 'github' } });

    for (const args of [
      ['--task-agent', 'sometimes'],
      ['--reviews', 'plan,unknown'],
      ['--max-review-rounds', '0'],
      ['--completion-strategy', 'local-ff'],
      ['--interactive', '--non-interactive'],
    ]) {
      const result = await runCli(dir, ['config', ...args]);
      assert.notEqual(
        result.code,
        0,
        `${args.join(' ')} unexpectedly succeeded`
      );
    }
  });
});

test('update migrates legacy post-merge checks to Feature checks', async () => {
  await withTempDir('lsk-config-local-completion-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: {
        mode: 'local',
        postMergeChecks: [
          { command: '  pnpm  ', args: ['test', 42] },
          { command: '   ' },
          'pnpm lint',
        ],
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.equal(updated.workflow.completionStrategy, 'none');
    assert.deepEqual(updated.workflow.featureChecks, [
      { command: 'pnpm', args: ['test'] },
    ]);
    assert.deepEqual(updated.workflow.postMergeChecks, []);
  });
});

test('update preserves the local squash completion strategy', async () => {
  await withTempDir('lsk-config-local-squash-', async (dir) => {
    await writeProjectConfig(dir, {
      workflow: {
        mode: 'local',
        completionStrategy: 'local-squash',
      },
    });

    const updated = await runConfigUpdate(dir);

    assert.equal(updated.workflow.completionStrategy, 'local-squash');
  });
});

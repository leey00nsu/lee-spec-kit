import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  runCommand,
  setupFakeGhCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

const sessionA = { LEE_SPEC_KIT_SESSION_ID: 'feature-session-a' };
const sessionB = { LEE_SPEC_KIT_SESSION_ID: 'feature-session-b' };
const json = (result) => JSON.parse(result.stdout);
function succeeded(result) {
  assert.equal(result.code, 0, result.stderr || result.stdout);
  return result;
}
async function featureFolders(docsDirectory) {
  return (
    await fs.readdir(path.join(docsDirectory, 'features'), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function setup(dir) {
  succeeded(await runCommand(dir, 'git', ['init', '-b', 'main']));
  succeeded(
    await runCommand(dir, 'git', ['config', 'user.email', 'owner@example.com'])
  );
  succeeded(await runCommand(dir, 'git', ['config', 'user.name', 'Owner']));
  succeeded(
    await runCli(dir, [
      'init',
      '--name',
      'session-routing',
      '--type',
      'single',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--task-agent',
      'off',
      '--reviews',
      'none',
      '--non-interactive',
    ])
  );
  const active = json(
    succeeded(await runCli(dir, ['feature', 'alpha', '--json']))
  );
  succeeded(await runCli(dir, ['feature', 'old', '--id', 'F001', '--json']));
  succeeded(await runCli(dir, ['integrations', 'codex-hooks']));
  succeeded(await runCommand(dir, 'git', ['add', '.']));
  succeeded(
    await runCommand(dir, 'git', ['commit', '-m', 'session routing fixture'])
  );
  const workspace = json(
    succeeded(
      await runCli(dir, ['workspace', 'prepare', active.featureId, '--json'])
    )
  );
  const task = json(
    succeeded(
      await runCli(workspace.projectDirectory, [
        'task',
        'add',
        active.featureId,
        '--title',
        'ongoing work',
        '--ref',
        'NON-PRD',
        '--acceptance',
        'ongoing result is observable',
        '--check',
        'implement ongoing result',
        '--json',
      ])
    )
  );
  await fs.writeFile(
    task.tasksPath,
    (await fs.readFile(task.tasksPath, 'utf8')).replace(
      '[TODO][NON-PRD]',
      '[DOING][NON-PRD]'
    )
  );
  return { active, workspace, task };
}

async function approveFeatureDocs(tasksPath) {
  for (const fileName of ['spec.md', 'plan.md']) {
    const file = path.join(path.dirname(tasksPath), fileName);
    let content = (await fs.readFile(file, 'utf8')).replace(
      /- \*\*Status\*\*: .*/,
      '- **Status**: Approved'
    );
    if (fileName === 'plan.md') {
      content = content.replaceAll(
        '- **Assessment**: Pending',
        '- **Assessment**: Complete'
      );
      for (const field of [
        'Product requirements',
        'System architecture',
        'Onboarding entrypoint',
        'Operational/runtime contract',
        'Decision',
      ]) {
        content = content.replace(`- **${field}**: -`, `- **${field}**: NONE`);
      }
      content = content.replace(
        '- **Reason**: -',
        '- **Reason**: No curated documentation impact in this fixture.'
      );
    }
    await fs.writeFile(file, content);
  }
  await fs.writeFile(
    tasksPath,
    (await fs.readFile(tasksPath, 'utf8')).replace(
      '- **Doc Status**: -',
      '- **Doc Status**: Approved'
    )
  );
}

async function setupStandalone(dir) {
  const project = path.join(dir, 'project');
  await fs.mkdir(project);
  succeeded(await runCommand(project, 'git', ['init', '-b', 'main']));
  succeeded(
    await runCommand(project, 'git', [
      'config',
      'user.email',
      'owner@example.com',
    ])
  );
  succeeded(await runCommand(project, 'git', ['config', 'user.name', 'Owner']));
  await fs.writeFile(path.join(project, 'baseline.txt'), 'baseline\n');
  succeeded(await runCommand(project, 'git', ['add', '.']));
  succeeded(await runCommand(project, 'git', ['commit', '-m', 'baseline']));
  succeeded(
    await runCli(dir, [
      'init',
      '--name',
      'standalone-session',
      '--type',
      'single',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--docs-repo',
      'standalone',
      '--project-root',
      './project',
      '--dir',
      './docs',
      '--non-interactive',
    ])
  );
  const active = json(
    succeeded(await runCli(dir, ['feature', 'alpha', '--json']))
  );
  succeeded(await runCli(dir, ['feature', 'old', '--id', 'F001', '--json']));
  succeeded(await runCli(dir, ['integrations', 'codex-hooks']));
  const workspace = json(
    succeeded(
      await runCli(dir, ['workspace', 'prepare', active.featureId, '--json'])
    )
  );
  return { active, workspace };
}

test('session selection survives main checkout and routes follow-up tasks to the managed docs', async () => {
  await withTempDir('lsk-session-followup-', async (dir) => {
    const { active, workspace, task } = await setup(dir);
    const seedTasks = path.join(active.featurePath, 'tasks.md');
    const seedBefore = await fs.readFile(seedTasks, 'utf8');
    const selected = json(
      succeeded(
        await runCli(
          dir,
          ['workflow-stage', active.featureId, '--json'],
          sessionA
        )
      )
    );
    assert.equal(selected.nextAction.category, 'workspace_enter');
    const restored = json(
      succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA))
    );
    assert.equal(restored.featureId, active.featureId);
    assert.equal(restored.selectionSource, 'session');
    const followup = json(
      succeeded(
        await runCli(
          dir,
          [
            'task',
            'add',
            '--title',
            'user correction',
            '--ref',
            'NON-PRD',
            '--acceptance',
            'corrected result is observable',
            '--check',
            'apply requested correction',
            '--json',
          ],
          sessionA
        )
      )
    );
    assert.equal(followup.tasksPath, task.tasksPath);
    assert.equal(followup.feature, `${active.featureId}-alpha`);
    assert.match(await fs.readFile(task.tasksPath, 'utf8'), /user correction/);
    assert.equal(await fs.readFile(seedTasks, 'utf8'), seedBefore);
    assert.equal((await featureFolders(workspace.docsDirectory)).length, 2);
  });
});

test('accidental Feature creation is blocked even when the active task is DONE', async () => {
  await withTempDir('lsk-session-create-block-', async (dir) => {
    const { active, workspace, task } = await setup(dir);
    succeeded(
      await runCli(
        dir,
        ['workflow-stage', active.featureId, '--json'],
        sessionA
      )
    );
    const tasks = await fs.readFile(task.tasksPath, 'utf8');
    await fs.writeFile(
      task.tasksPath,
      tasks
        .replace('[DOING][NON-PRD]', '[DONE][NON-PRD]')
        .replace(
          '    - [ ] implement ongoing result',
          '    - [x] implement ongoing result'
        )
    );
    for (const cwd of [dir, workspace.projectDirectory]) {
      const result = await runCli(
        cwd,
        ['feature', 'unexpected-followup', '--json'],
        sessionA
      );
      assert.equal(result.code, 1);
      assert.equal(json(result).reasonCode, 'ACTIVE_FEATURE_EXISTS');
      assert.equal(
        json(result).details.featureRef,
        `${active.featureId}-alpha`
      );
    }
    assert.equal((await featureFolders(path.join(dir, 'docs'))).length, 2);
    assert.equal((await featureFolders(workspace.docsDirectory)).length, 2);
  });
});

test('separate sessions retain different Features and explicit separation seeds the primary checkout', async () => {
  await withTempDir('lsk-session-parallel-', async (dir) => {
    const { active, workspace } = await setup(dir);
    succeeded(
      await runCli(
        dir,
        ['workflow-stage', active.featureId, '--json'],
        sessionA
      )
    );
    succeeded(
      await runCli(dir, ['workflow-stage', 'F001', '--json'], sessionB)
    );
    assert.equal(
      json(succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA)))
        .featureId,
      active.featureId
    );
    assert.equal(
      json(succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionB)))
        .featureId,
      'F001'
    );
    const separate = json(
      succeeded(
        await runCli(
          workspace.projectDirectory,
          ['feature', 'beta', '--separate', '--json'],
          sessionB
        )
      )
    );
    assert.equal(
      await fs.realpath(path.dirname(separate.featurePath)),
      await fs.realpath(path.join(dir, 'docs', 'features'))
    );
    assert.equal(
      json(succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionB)))
        .featureId,
      separate.featureId
    );
    assert.equal(
      json(succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA)))
        .featureId,
      active.featureId
    );
    await assert.rejects(
      fs.access(
        path.join(workspace.docsDirectory, separate.featurePathFromDocs)
      )
    );
  });
});

test('unresolved selection lists existing Features and does not authorize creation', async () => {
  await withTempDir('lsk-session-unresolved-', async (dir) => {
    await setup(dir);
    const unresolved = json(
      succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA))
    );
    assert.equal(unresolved.reasonCode, 'FEATURE_SELECTION_REQUIRED');
    assert.equal(unresolved.featureCandidates.length, 2);
    const created = await runCli(
      dir,
      ['feature', 'replacement', '--json'],
      sessionA
    );
    assert.equal(created.code, 1);
    assert.equal(json(created).reasonCode, 'FEATURE_SELECTION_REQUIRED');
    const hook = json(
      succeeded(
        await runCommand(
          dir,
          process.execPath,
          [path.join(dir, '.codex', 'hooks', 'session_start_lee_spec_kit.mjs')],
          {
            input: JSON.stringify({
              cwd: dir,
              session_id: 'feature-session-a',
            }),
          }
        )
      )
    );
    assert.match(
      hook.hookSpecificOutput.additionalContext,
      /Selection failure never authorizes creating a new Feature/
    );
    assert.doesNotMatch(
      hook.hookSpecificOutput.additionalContext,
      /create\/select/
    );
  });
});

test('hooks recover the Feature through worktree cwd and retain it after resume/compaction on main', async () => {
  await withTempDir('lsk-session-hook-resume-', async (dir) => {
    const { active, workspace } = await setup(dir);
    for (const [hookName, cwd, source] of [
      ['session_start_lee_spec_kit.mjs', workspace.projectDirectory, 'startup'],
      ['session_start_lee_spec_kit.mjs', dir, 'resume'],
      ['session_start_lee_spec_kit.mjs', dir, 'compact'],
      ['user_prompt_submit_lee_spec_kit.mjs', dir, undefined],
    ]) {
      const hook = json(
        succeeded(
          await runCommand(
            dir,
            process.execPath,
            [path.join(dir, '.codex', 'hooks', hookName)],
            {
              input: JSON.stringify({
                cwd,
                source,
                session_id: 'feature-session-a',
                prompt: 'also correct this behavior',
              }),
            }
          )
        )
      );
      const context = hook.hookSpecificOutput.additionalContext;
      assert.match(
        context,
        new RegExp(`Selected Feature: ${active.featureId}-alpha`)
      );
      assert.ok(context.includes(workspace.docsDirectory), context);
      assert.match(context, /Current workflow stage: spec/);
      assert.match(context, /new tasks/);
      if (cwd === dir)
        assert.match(context, /Feature selection source: session/);
      assert.doesNotMatch(context, /Workflow stage is unresolved/);
    }
  });
});

test('hook cwd cannot switch to a different docs scope in the same Git repository', async () => {
  await withTempDir('lsk-session-docs-scope-', async (dir) => {
    const { active } = await setup(dir);
    succeeded(
      await runCli(
        dir,
        ['workflow-stage', active.featureId, '--json'],
        sessionA
      )
    );
    const other = path.join(dir, 'other');
    await fs.mkdir(other);
    succeeded(
      await runCli(other, [
        'init',
        '--name',
        'other-project',
        '--type',
        'single',
        '--lang',
        'en',
        '--workflow',
        'local',
        '--non-interactive',
      ])
    );
    const unrelated = json(
      succeeded(await runCli(other, ['feature', 'unrelated', '--json']))
    );
    assert.equal(
      (await runCommand(other, 'git', ['rev-parse', '--show-toplevel'])).stdout,
      (await runCommand(dir, 'git', ['rev-parse', '--show-toplevel'])).stdout
    );
    const hook = json(
      succeeded(
        await runCommand(
          dir,
          process.execPath,
          [path.join(dir, '.codex', 'hooks', 'session_start_lee_spec_kit.mjs')],
          {
            input: JSON.stringify({
              cwd: other,
              session_id: 'feature-session-a',
            }),
          }
        )
      )
    );
    const context = hook.hookSpecificOutput.additionalContext;
    assert.ok(
      context.includes(`Selected Feature: ${active.featureId}-alpha`),
      context
    );
    assert.ok(
      !context.includes(`Selected Feature: ${unrelated.featureId}-unrelated`),
      context
    );
  });
});

test('creation guard runs before remote Issue creation', async () => {
  await withTempDir('lsk-session-issue-guard-', async (dir) => {
    const { active } = await setup(dir);
    succeeded(
      await runCli(
        dir,
        ['workflow-stage', active.featureId, '--json'],
        sessionA
      )
    );
    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    config.workflow.mode = 'github';
    await fs.writeFile(configPath, JSON.stringify(config));
    const gh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'feature',
        'unexpected-issue',
        '--create-issue',
        '--desc',
        'unexpected followup',
        '--confirm',
        'OK',
        '--json',
      ],
      { ...gh.env, ...sessionA }
    );
    assert.equal(result.code, 1);
    assert.equal(json(result).reasonCode, 'ACTIVE_FEATURE_EXISTS');
    await assert.rejects(fs.access(gh.logPath));
  });
});

test('root-installed commit hooks inspect the current task in the session worktree', async () => {
  await withTempDir('lsk-session-commit-workspace-', async (dir) => {
    const { active, workspace, task } = await setup(dir);
    await approveFeatureDocs(task.tasksPath);
    const selected = json(
      succeeded(
        await runCli(
          workspace.projectDirectory,
          ['workflow-stage', active.featureId, '--json'],
          sessionA
        )
      )
    );
    assert.equal(selected.nextAction.category, 'task_execute');
    const hook = json(
      succeeded(
        await runCommand(
          dir,
          process.execPath,
          [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
          {
            input: JSON.stringify({
              cwd: dir,
              session_id: 'feature-session-a',
              tool_input: {
                command: `git -C "${workspace.projectDirectory}" commit -m "feat(${active.featureId}): premature commit"`,
              },
            }),
          }
        )
      )
    );
    assert.equal(hook.decision, 'block');
    assert.match(hook.reason, /task_execute is active/);
  });
});

test('root-installed audits use synced session worktree docs instead of the seed copy', async () => {
  await withTempDir('lsk-session-audit-workspace-', async (dir) => {
    const { active, workspace, task } = await setup(dir);
    succeeded(
      await runCli(
        workspace.projectDirectory,
        ['workflow-stage', active.featureId, '--json'],
        sessionA
      )
    );
    await fs.writeFile(
      path.join(workspace.projectDirectory, 'followup.js'),
      'export const followup = true;\n'
    );
    const audit = json(
      succeeded(
        await runCli(
          workspace.projectDirectory,
          ['workflow-audit', '--json'],
          sessionA
        )
      )
    );
    assert.equal(audit.status, 'needs_sync');
    await fs.appendFile(
      path.join(path.dirname(task.tasksPath), 'spec.md'),
      '\nFollow-up scope: expose the requested followup export.\n'
    );
    await fs.appendFile(
      task.tasksPath,
      `\n${audit.expectedWorkflowSyncMarker}\n`
    );
    const synced = json(
      succeeded(
        await runCli(
          workspace.projectDirectory,
          ['workflow-audit', '--json'],
          sessionA
        )
      )
    );
    assert.equal(synced.status, 'ok', JSON.stringify(synced));
    const stopped = json(
      succeeded(
        await runCommand(
          dir,
          process.execPath,
          [path.join(dir, '.codex', 'hooks', 'stop_workflow_audit.mjs')],
          {
            input: JSON.stringify({
              cwd: dir,
              session_id: 'feature-session-a',
            }),
          }
        )
      )
    );
    assert.equal(stopped.continue, true, JSON.stringify(stopped));
    const commit = succeeded(
      await runCommand(
        dir,
        process.execPath,
        [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
        {
          input: JSON.stringify({
            cwd: dir,
            session_id: 'feature-session-a',
            tool_input: {
              command: `git -C "${workspace.projectDirectory}" commit -m "feat(${active.featureId}): followup"`,
            },
          }),
        }
      )
    );
    assert.equal(commit.stdout.trim(), '');
  });
});

test('native thread IDs bind newly created Features without hooks', async () => {
  await withTempDir('lsk-session-native-thread-', async (dir) => {
    succeeded(
      await runCli(dir, [
        'init',
        '--name',
        'native-thread',
        '--type',
        'single',
        '--lang',
        'en',
        '--workflow',
        'local',
        '--non-interactive',
      ])
    );
    const env = { CODEX_THREAD_ID: 'native-codex-thread' };
    const active = json(
      succeeded(await runCli(dir, ['feature', 'first', '--json'], env))
    );
    const second = await runCli(dir, ['feature', 'second', '--json'], env);
    assert.equal(second.code, 1);
    assert.equal(json(second).reasonCode, 'ACTIVE_FEATURE_EXISTS');
    assert.equal(
      json(succeeded(await runCli(dir, ['workflow-stage', '--json'], env)))
        .featureId,
      active.featureId
    );
  });
});

test('a missing session target requires selection instead of selecting the remaining Feature', async () => {
  await withTempDir('lsk-session-missing-target-', async (dir) => {
    const { active } = await setup(dir);
    succeeded(
      await runCli(
        dir,
        ['workflow-stage', active.featureId, '--json'],
        sessionA
      )
    );
    await fs.rm(active.featurePath, { recursive: true });
    const result = json(
      succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA))
    );
    assert.equal(result.reasonCode, 'FEATURE_SELECTION_REQUIRED');
    const blocked = await runCli(
      dir,
      ['feature', 'replacement', '--json'],
      sessionA
    );
    assert.equal(blocked.code, 1);
    assert.equal(json(blocked).reasonCode, 'FEATURE_SELECTION_REQUIRED');
    succeeded(
      await runCli(dir, ['workflow-stage', 'F001', '--json'], sessionA)
    );
    assert.equal(
      json(succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA)))
        .featureId,
      'F001'
    );
  });
});

test('concurrent creation within one session creates only one Feature', async () => {
  await withTempDir('lsk-session-create-race-', async (dir) => {
    succeeded(
      await runCli(dir, [
        'init',
        '--name',
        'session-race',
        '--type',
        'single',
        '--lang',
        'en',
        '--workflow',
        'local',
        '--non-interactive',
      ])
    );
    const results = await Promise.all(
      ['alpha', 'beta'].map((name) =>
        runCli(dir, ['feature', name, '--json'], sessionA)
      )
    );
    assert.equal(results.filter((result) => result.code === 0).length, 1);
    assert.equal(
      json(results.find((result) => result.code === 1)).reasonCode,
      'ACTIVE_FEATURE_EXISTS'
    );
    assert.equal((await featureFolders(path.join(dir, 'docs'))).length, 1);
  });
});

test('standalone planning worktrees restore the session Feature from the shared workspace', async () => {
  await withTempDir('lsk-session-standalone-', async (dir) => {
    const { active, workspace } = await setupStandalone(dir);
    const first = json(
      succeeded(
        await runCommand(
          dir,
          process.execPath,
          [path.join(dir, '.codex', 'hooks', 'session_start_lee_spec_kit.mjs')],
          {
            input: JSON.stringify({
              cwd: workspace.docsDirectory,
              session_id: 'standalone-session',
            }),
          }
        )
      )
    );
    assert.match(
      first.hookSpecificOutput.additionalContext,
      new RegExp(`Selected Feature: ${active.featureId}-alpha`)
    );
    const restored = json(
      succeeded(
        await runCommand(
          dir,
          process.execPath,
          [
            path.join(
              dir,
              '.codex',
              'hooks',
              'user_prompt_submit_lee_spec_kit.mjs'
            ),
          ],
          {
            input: JSON.stringify({
              cwd: dir,
              session_id: 'standalone-session',
            }),
          }
        )
      )
    );
    assert.ok(
      restored.hookSpecificOutput.additionalContext.includes(
        workspace.docsDirectory
      )
    );
    const followup = json(
      succeeded(
        await runCli(
          dir,
          [
            'task',
            'add',
            '--title',
            'standalone followup',
            '--ref',
            'NON-PRD',
            '--acceptance',
            'followup is recorded in current docs',
            '--check',
            'record followup',
            '--json',
          ],
          { LEE_SPEC_KIT_SESSION_ID: 'standalone-session' }
        )
      )
    );
    assert.ok(followup.tasksPath.startsWith(workspace.docsDirectory));
    assert.doesNotMatch(
      await fs.readFile(path.join(active.featurePath, 'tasks.md'), 'utf8'),
      /standalone followup/
    );
  });
});

test('completed managed Features seed subsequent work in the primary docs scope', async () => {
  await withTempDir('lsk-session-completed-workspace-', async (dir) => {
    const { active, workspace, task } = await setup(dir);
    for (const docsDir of [path.join(dir, 'docs'), workspace.docsDirectory]) {
      const configPath = path.join(docsDir, '.lee-spec-kit.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      config.workflow.completionStrategy = 'none';
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
    await approveFeatureDocs(task.tasksPath);
    let tasks = await fs.readFile(task.tasksPath, 'utf8');
    tasks = tasks
      .replace('[DOING][NON-PRD]', '[DONE][NON-PRD]')
      .replace(
        '    - [ ] implement ongoing result',
        '    - [x] implement ongoing result'
      )
      .replace(/^- \[ \](.*<!-- lee-spec-kit:completion:.*)$/gm, '- [x]$1');
    await fs.writeFile(task.tasksPath, tasks);
    const audit = json(
      succeeded(
        await runCli(workspace.projectDirectory, ['workflow-audit', '--json'])
      )
    );
    await fs.appendFile(
      task.tasksPath,
      `\n${audit.expectedWorkflowSyncMarker}\n`
    );
    succeeded(
      await runCommand(workspace.projectDirectory, 'git', ['add', '.'])
    );
    succeeded(
      await runCommand(workspace.projectDirectory, 'git', [
        'commit',
        '-m',
        `docs(${active.featureId}): complete task`,
      ])
    );
    const completed = json(
      succeeded(
        await runCli(
          workspace.projectDirectory,
          ['workflow-stage', active.featureId, '--json'],
          sessionA
        )
      )
    );
    assert.equal(completed.stage, 'done', JSON.stringify(completed));

    const created = json(
      succeeded(
        await runCli(
          workspace.projectDirectory,
          ['feature', 'followup', '--json'],
          sessionA
        )
      )
    );
    assert.equal(
      await fs.realpath(path.dirname(created.featurePath)),
      await fs.realpath(path.join(dir, 'docs', 'features'))
    );
    const prepared = json(
      succeeded(
        await runCli(
          dir,
          ['workspace', 'prepare', created.featureId, '--json'],
          sessionA
        )
      )
    );
    await fs.access(
      path.join(prepared.docsDirectory, created.featurePathFromDocs, 'spec.md')
    );
    assert.equal(
      json(succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA)))
        .featureId,
      created.featureId
    );
  });
});

test('separate creation preserves a nested docs project on primary and managed checkouts', async () => {
  await withTempDir('lsk-session-nested-creation-', async (dir) => {
    const { active } = await setup(dir);
    const other = path.join(dir, 'other');
    await fs.mkdir(other);
    succeeded(
      await runCli(other, [
        'init',
        '--name',
        'nested-project',
        '--type',
        'single',
        '--lang',
        'en',
        '--workflow',
        'local',
        '--non-interactive',
      ])
    );
    const nested = json(
      succeeded(await runCli(other, ['feature', 'nested', '--json'], sessionB))
    );
    const prepared = json(
      succeeded(
        await runCli(
          other,
          ['workspace', 'prepare', nested.featureId, '--json'],
          sessionB
        )
      )
    );
    const topBefore = await featureFolders(path.join(dir, 'docs'));
    for (const [cwd, name] of [
      [other, 'from-primary'],
      [prepared.docsDirectory, 'from-worktree'],
    ]) {
      const created = json(
        succeeded(
          await runCli(cwd, ['feature', name, '--separate', '--json'], sessionB)
        )
      );
      assert.equal(
        await fs.realpath(path.dirname(created.featurePath)),
        await fs.realpath(path.join(other, 'docs', 'features'))
      );
      assert.equal(
        json(
          succeeded(await runCli(other, ['workflow-stage', '--json'], sessionB))
        ).featureId,
        created.featureId
      );
      const nextWorkspace = json(
        succeeded(
          await runCli(
            other,
            ['workspace', 'prepare', created.featureId, '--json'],
            sessionB
          )
        )
      );
      await fs.access(
        path.join(
          nextWorkspace.docsDirectory,
          created.featurePathFromDocs,
          'spec.md'
        )
      );
    }
    assert.deepEqual(await featureFolders(path.join(dir, 'docs')), topBefore);
    assert.equal(
      json(
        succeeded(
          await runCli(dir, ['workflow-stage', active.featureId, '--json'])
        )
      ).featureId,
      active.featureId
    );
  });
});

test('standalone task mutations reject an incorrect docs branch and missing registration', async () => {
  await withTempDir('lsk-session-docs-branch-', async (dir) => {
    const { active, workspace } = await setupStandalone(dir);
    const docsWorktree = workspace.docsDirectory;
    const liveFeature = path.join(docsWorktree, active.featurePathFromDocs);
    const expectedBranch = (
      await runCommand(docsWorktree, 'git', ['branch', '--show-current'])
    ).stdout.trim();
    succeeded(
      await runCli(
        dir,
        ['workflow-stage', active.featureId, '--json'],
        sessionA
      )
    );
    const seedBefore = await fs.readFile(
      path.join(active.featurePath, 'tasks.md'),
      'utf8'
    );
    const liveBefore = await fs.readFile(
      path.join(liveFeature, 'tasks.md'),
      'utf8'
    );
    const add = [
      'task',
      'add',
      '--title',
      'invalid-workspace followup',
      '--ref',
      'NON-PRD',
      '--acceptance',
      'followup belongs to its Feature',
      '--check',
      'record followup',
      '--json',
    ];
    succeeded(
      await runCommand(docsWorktree, 'git', [
        'checkout',
        '-b',
        'wrong-docs-branch',
      ])
    );
    assert.equal(
      json(succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA)))
        .nextAction.category,
      'workspace_prepare'
    );
    for (const cwd of [dir, docsWorktree]) {
      const rejected = await runCli(cwd, add, sessionA);
      assert.equal(rejected.code, 1, rejected.stdout);
      assert.equal(json(rejected).reasonCode, 'PRECONDITION_FAILED');
      assert.match(json(rejected).error, /branch mismatch/i);
    }
    assert.equal(
      await fs.readFile(path.join(active.featurePath, 'tasks.md'), 'utf8'),
      seedBefore
    );
    assert.equal(
      await fs.readFile(path.join(liveFeature, 'tasks.md'), 'utf8'),
      liveBefore
    );
    succeeded(
      await runCommand(docsWorktree, 'git', ['checkout', expectedBranch])
    );
    const metadataPath = path.join(liveFeature, '.feature.json');
    const metadata = await fs.readFile(metadataPath, 'utf8');
    await fs.rm(metadataPath);
    for (const cwd of [dir, docsWorktree]) {
      const rejected = await runCli(cwd, add, sessionA);
      assert.equal(rejected.code, 1, rejected.stdout);
      assert.equal(json(rejected).reasonCode, 'PRECONDITION_FAILED');
    }
    await fs.writeFile(metadataPath, metadata);
    const accepted = json(succeeded(await runCli(dir, add, sessionA)));
    assert.equal(accepted.tasksPath, path.join(liveFeature, 'tasks.md'));
  });
});

test('legacy identity reuse across components cannot bypass the session creation guard', async () => {
  await withTempDir('lsk-session-legacy-component-', async (dir) => {
    succeeded(await runCommand(dir, 'git', ['init', '-b', 'main']));
    succeeded(
      await runCli(dir, [
        'init',
        '--name',
        'legacy-components',
        '--type',
        'multi',
        '--components',
        'be,fe',
        '--lang',
        'en',
        '--workflow',
        'local',
        '--non-interactive',
      ])
    );
    succeeded(
      await runCli(
        dir,
        ['feature', 'alpha', '--id', 'F001', '--component', 'be', '--json'],
        sessionA
      )
    );
    const rejected = await runCli(
      dir,
      ['feature', 'beta', '--id', 'F001', '--component', 'fe', '--json'],
      sessionA
    );
    assert.equal(rejected.code, 1, rejected.stdout);
    assert.equal(json(rejected).reasonCode, 'ACTIVE_FEATURE_EXISTS');
    await assert.rejects(
      fs.access(path.join(dir, 'docs', 'features', 'fe', 'F001-beta'))
    );
    const retry = await runCli(
      dir,
      ['feature', 'renamed', '--id', 'F001', '--component', 'be', '--json'],
      sessionA
    );
    assert.equal(retry.code, 1);
    assert.equal(json(retry).reasonCode, 'FEATURE_ID_EXISTS');
    const selected = json(
      succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA))
    );
    assert.equal(selected.featureRef, 'F001-alpha');
    assert.equal(selected.component, 'be');
    succeeded(
      await runCli(
        dir,
        [
          'feature',
          'beta',
          '--id',
          'F001',
          '--component',
          'fe',
          '--separate',
          '--json',
        ],
        sessionA
      )
    );
    assert.equal(
      json(succeeded(await runCli(dir, ['workflow-stage', '--json'], sessionA)))
        .component,
      'fe'
    );
  });
});

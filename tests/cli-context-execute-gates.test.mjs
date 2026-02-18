import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
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
  suggestionOptionByLabel,
} from './helpers/cli-contract-helpers.mjs';

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
    assert.equal(config.workflow?.taskCommitGate, 'warn');
    assert.equal(config.workflow?.codeDirtyScope, 'auto');
    assert.equal(config.workflow?.auto?.defaultPreset, 'pr-handoff');
    assert.equal(config.workflow?.prePrReview?.fallback, 'builtin-checklist');
    assert.equal(config.workflow?.prePrReview?.blockOnFindings, true);
    assert.equal(config.workflow?.prePrReview?.minorPolicy, 'warn');
    assert.equal(config.approval?.mode, 'builtin');
    assert.equal(config.pr?.screenshots?.upload, false);
  });
});

test('update backfills missing config defaults including warn taskCommitGate', async () => {
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
    delete config.workflow?.auto;
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
    assert.equal(nextConfig.workflow?.taskCommitGate, 'warn');
    assert.equal(nextConfig.workflow?.codeDirtyScope, 'auto');
    assert.equal(nextConfig.workflow?.auto?.defaultPreset, 'pr-handoff');
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
    config.workflow.auto = { defaultPreset: 'custom-handoff' };
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
    assert.equal(nextConfig.workflow?.auto?.defaultPreset, 'custom-handoff');
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
    assert.equal(Array.isArray(payload.actionOptions), true);
    assert.equal(payload.actionOptions.length, 0);
    assert.equal(Array.isArray(payload.suggestionOptions), true);
    assert.equal(payload.suggestionOptions.length >= 2, true);
    assert.equal(suggestionOptionByLabel(payload).label, 'A');
    assert.match(suggestionOptionByLabel(payload).command, /context --done/);
    assert.equal(Array.isArray(payload.suggestionRequest?.labels), true);
    assert.equal(payload.suggestionRequest.labels.includes('A'), true);
    assert.equal(typeof payload.suggestionRequest?.finalPrompt, 'string');
    assert.match(payload.suggestionRequest.finalPrompt, /Recommended labels now:/);

    const textResult = await runCli(dir, ['context']);
    assert.equal(textResult.code, 0, textResult.stderr || textResult.stdout);
  });
});

test('context --json returns suggestion labels when no features exist', async () => {
  await withTempDir('lsk-context-no-features-suggestions-', async (dir) => {
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
    assert.equal(payload.status, 'no_features');
    assert.equal(payload.reasonCode, 'NO_FEATURES');
    assert.equal(Array.isArray(payload.actionOptions), true);
    assert.equal(payload.actionOptions.length, 0);
    assert.equal(Array.isArray(payload.suggestionOptions), true);
    assert.equal(payload.suggestionOptions.length >= 1, true);
    assert.equal(suggestionOptionByLabel(payload).label, 'A');
    assert.match(
      suggestionOptionByLabel(payload).summary,
      /Create a new feature|Run onboarding checks/i
    );
    assert.match(suggestionOptionByLabel(payload).command, /lee-spec-kit (feature|onboard)/);
    assert.equal(Array.isArray(payload.suggestionRequest?.userFacingLines), true);
    assert.equal(payload.suggestionRequest.userFacingLines.length >= 2, true);
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
    assert.equal(primaryActionOption(payload).action.type, 'command');
    assert.equal(primaryActionOption(payload).action.scope, 'project');
    assert.equal(primaryActionOption(payload).action.category, 'task_execute');
    assert.doesNotMatch(primaryActionOption(payload).action.cmd, /git add -A/);
    assert.match(primaryActionOption(payload).action.cmd, /git diff --cached --quiet/);
    assert.match(primaryActionOption(payload).action.cmd, /git commit -m "feat\([^"]+\): /);
    assert.match(primaryActionOption(payload).action.cmd, /feat\(F001-alpha\): alpha/);
    assert.doesNotMatch(primaryActionOption(payload).action.cmd, /T-F001-alpha-01/);
    assert.match(
      primaryActionOption(payload).detail,
      /^\(project\) commit: feat\(F001-alpha\): alpha$/
    );
    assert.equal(
      primaryActionOption(payload).approvalPrompt,
      `${primaryActionOption(payload).label}: ${primaryActionOption(payload).detail}`
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
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.match(
      primaryActionOption(payload).action.message,
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
    assert.equal(primaryActionOption(payload).action.type, 'command');
    assert.equal(primaryActionOption(payload).action.scope, 'docs');
    assert.equal(primaryActionOption(payload).action.category, 'docs_commit');
    assert.match(primaryActionOption(payload).action.cmd, /git commit -m "docs/);
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = config.workflow || {};
    config.workflow.taskCommitGate = 'strict';
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    await fs.writeFile(
      tasksPath,
      `# Tasks: alpha

## Local Tracking

- **Doc Status**: Approved

## Task List

- [TODO] T-F001-alpha-01 alpha baseline
- [TODO] T-F001-alpha-02 alpha follow-up
- [TODO] T-F001-alpha-03 alpha polish

## Completion Criteria

- [ ] done
`,
      'utf-8'
    );

    const baselineAdd = await runCommand(dir, 'git', [
      'add',
      'docs/features/F001-alpha',
      'docs/.lee-spec-kit.json',
    ]);
    assert.equal(baselineAdd.code, 0, baselineAdd.stderr || baselineAdd.stdout);
    const baselineCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: baseline todos before done transitions',
    ]);
    assert.equal(
      baselineCommit.code,
      0,
      baselineCommit.stderr || baselineCommit.stdout
    );

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

    const docsAdd = await runCommand(dir, 'git', [
      'add',
      'docs/features/F001-alpha',
      'docs/.lee-spec-kit.json',
    ]);
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
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.match(primaryActionOption(payload).action.message, /1 task = 1 commit/);
    assert.match(primaryActionOption(payload).action.message, /DONE transitions.*2/);
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = config.workflow || {};
    config.workflow.taskCommitGate = 'strict';
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

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

    const firstAdd = await runCommand(dir, 'git', [
      'add',
      'docs/features/F001-alpha',
      'docs/.lee-spec-kit.json',
    ]);
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
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.match(primaryActionOption(payload).action.message, /Start the next TODO task/);
    assert.doesNotMatch(primaryActionOption(payload).action.message, /Task commit boundary warning/);
    assert.doesNotMatch(primaryActionOption(payload).action.message, /DONE transitions.*0/);
    assert.doesNotMatch(
      primaryActionOption(payload).action.message,
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

- [TODO] T-F001-alpha-01 alpha baseline
- [TODO] T-F001-alpha-02 alpha follow-up
- [TODO] T-F001-alpha-03 alpha polish

## Completion Criteria

- [ ] done
`,
      'utf-8'
    );

    const baselineAdd = await runCommand(dir, 'git', [
      'add',
      'docs/features/F001-alpha',
      'docs/.lee-spec-kit.json',
    ]);
    assert.equal(baselineAdd.code, 0, baselineAdd.stderr || baselineAdd.stdout);
    const baselineCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: baseline todos for warn gate',
    ]);
    assert.equal(
      baselineCommit.code,
      0,
      baselineCommit.stderr || baselineCommit.stdout
    );

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
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.match(primaryActionOption(payload).action.message, /Start the next TODO task/);
    assert.match(primaryActionOption(payload).action.message, /Task commit boundary warning/);
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

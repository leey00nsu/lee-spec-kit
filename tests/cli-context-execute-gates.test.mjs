import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  runCommand,
  withTempDir,
  pathExists,
  setFeatureAsDone,
  issueApprovalTicket,
  primaryActionOption,
  suggestionOptionByLabel,
} from './helpers/cli-contract-helpers.mjs';

function buildStructuredPrePrEvidence(
  changedFiles,
  overrides = {}
) {
  const reviewedFiles = overrides.reviewedFiles || changedFiles;
  const files =
    overrides.files ||
    changedFiles.map((entryPath) => ({
      path: entryPath,
      review: {
        risk: 'low',
        security: 'none',
        perf: 'n/a',
        maintainability: 'clear',
        fileLine: '1-40',
      },
    }));

  return {
    summary:
      'validated the implementation against the approved feature goal and checked quality risks',
    featureIntentSummary:
      'the feature should complete the documented scope without introducing unrelated behavior',
    implementationFit:
      'the current implementation follows the expected docs and module boundaries',
    missingCases: 'no significant missing cases identified',
    specAlignmentChecked: true,
    findingCount: 0,
    blockingFindings: 0,
    baseSha: 'base123',
    headSha: 'head456',
    changedFiles,
    reviewedFiles,
    riskSummaries: {
      blocking: 'none',
      important: 'none',
      minor: 'minor readability and maintenance checks completed',
    },
    approvalRationale:
      'Reviewed the full changed scope, found no blocking issues, and documented residual risk explicitly.',
    files,
    residualRisks: ['none'],
    commandsExecuted: [],
    ...overrides,
  };
}

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
    assert.equal(
      updateResult.code,
      0,
      updateResult.stderr || updateResult.stdout
    );
    assert.doesNotMatch(updateResult.stderr, /\[PRECONDITION_FAILED\]/);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.workflow?.taskCommitGate, 'warn');
    assert.equal(config.workflow?.codeDirtyScope, 'auto');
    assert.equal(config.workflow?.auto?.defaultPreset, 'pr-handoff');
    assert.equal(config.workflow?.prePrReview?.fallback, 'builtin-checklist');
    assert.equal(config.workflow?.prePrReview?.evidenceMode, 'path_required');
    assert.deepEqual(config.workflow?.prePrReview?.decisionEnum, [
      'approve',
      'changes_requested',
      'blocked',
    ]);
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
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const prepAdd = await runCommand(dir, 'git', [
      'add',
      'docs/.lee-spec-kit.json',
    ]);
    assert.equal(prepAdd.code, 0, prepAdd.stderr || prepAdd.stdout);
    const prepCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'chore: drop config defaults',
    ]);
    assert.equal(prepCommit.code, 0, prepCommit.stderr || prepCommit.stdout);

    const updateResult = await runCli(dir, ['update']);
    assert.equal(
      updateResult.code,
      0,
      updateResult.stderr || updateResult.stdout
    );

    const nextConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(nextConfig.workflow?.taskCommitGate, 'warn');
    assert.equal(nextConfig.workflow?.codeDirtyScope, 'auto');
    assert.equal(nextConfig.workflow?.auto?.defaultPreset, 'pr-handoff');
    assert.deepEqual(nextConfig.workflow?.prePrReview?.skills, [
      'code-review-excellence',
    ]);
    assert.equal(
      nextConfig.workflow?.prePrReview?.evidenceMode,
      'path_required'
    );
    assert.deepEqual(nextConfig.workflow?.prePrReview?.decisionEnum, [
      'approve',
      'changes_requested',
      'blocked',
    ]);
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
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const prepAdd = await runCommand(dir, 'git', [
      'add',
      'docs/.lee-spec-kit.json',
    ]);
    assert.equal(prepAdd.code, 0, prepAdd.stderr || prepAdd.stdout);
    const prepCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'chore: set explicit config values',
    ]);
    assert.equal(prepCommit.code, 0, prepCommit.stderr || prepCommit.stdout);

    const updateResult = await runCli(dir, ['update']);
    assert.equal(
      updateResult.code,
      0,
      updateResult.stderr || updateResult.stdout
    );

    const nextConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(nextConfig.workflow?.mode, 'local');
    assert.equal(nextConfig.workflow?.codeDirtyScope, 'repo');
    assert.equal(nextConfig.workflow?.taskCommitGate, 'warn');
    assert.equal(nextConfig.workflow?.auto?.defaultPreset, 'custom-handoff');
    assert.deepEqual(nextConfig.workflow?.prePrReview?.skills, [
      'custom-skill',
    ]);
    assert.equal(
      nextConfig.workflow?.prePrReview?.fallback,
      'builtin-checklist'
    );
    assert.equal(
      nextConfig.workflow?.prePrReview?.evidenceMode,
      'path_required'
    );
    assert.deepEqual(nextConfig.workflow?.prePrReview?.decisionEnum, [
      'approve',
      'changes_requested',
      'blocked',
    ]);
    assert.equal(nextConfig.pr?.screenshots?.upload, true);
    assert.equal(nextConfig.approval?.mode, 'steps');
    assert.deepEqual(nextConfig.approval?.requireCheckSteps, [10]);
  });
});

test('update recreates root AGENTS.md for existing embedded projects', async () => {
  await withTempDir('lsk-update-agents-root-create-', async (dir) => {
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

    const agentsMdPath = path.join(dir, 'AGENTS.md');
    await fs.rm(agentsMdPath, { force: true });

    const addDeletion = await runCommand(dir, 'git', ['add', '-A']);
    assert.equal(addDeletion.code, 0, addDeletion.stderr || addDeletion.stdout);
    const commitDeletion = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'chore: remove root agents',
    ]);
    assert.equal(
      commitDeletion.code,
      0,
      commitDeletion.stderr || commitDeletion.stdout
    );

    const updateResult = await runCli(dir, ['update']);
    assert.equal(
      updateResult.code,
      0,
      updateResult.stderr || updateResult.stdout
    );

    const agentsMd = await fs.readFile(agentsMdPath, 'utf-8');
    assert.match(agentsMd, /<!-- lee-spec-kit:begin -->/);
    assert.match(
      agentsMd,
      /Use lee-spec-kit workflow only when explicitly detected\./
    );
  });
});

test('update refreshes existing root AGENTS.md managed block without touching custom content', async () => {
  await withTempDir('lsk-update-agents-root-refresh-', async (dir) => {
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

    const agentsMdPath = path.join(dir, 'AGENTS.md');
    await fs.writeFile(
      agentsMdPath,
      [
        '# Existing Instructions',
        '',
        'Keep this.',
        '',
        '<!-- lee-spec-kit:begin -->',
        'OLD CONTENT',
        '<!-- lee-spec-kit:end -->',
        '',
      ].join('\n'),
      'utf-8'
    );

    const addLegacy = await runCommand(dir, 'git', ['add', 'AGENTS.md']);
    assert.equal(addLegacy.code, 0, addLegacy.stderr || addLegacy.stdout);
    const commitLegacy = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'chore: downgrade root agents block',
    ]);
    assert.equal(commitLegacy.code, 0, commitLegacy.stderr || commitLegacy.stdout);

    const updateResult = await runCli(dir, ['update']);
    assert.equal(
      updateResult.code,
      0,
      updateResult.stderr || updateResult.stdout
    );

    const agentsMd = await fs.readFile(agentsMdPath, 'utf-8');
    assert.match(agentsMd, /# Existing Instructions/);
    assert.match(agentsMd, /Keep this\./);
    assert.doesNotMatch(agentsMd, /OLD CONTENT/);
    assert.match(
      agentsMd,
      /Use lee-spec-kit workflow only when explicitly detected\./
    );
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
    assert.match(
      payload.suggestionRequest.finalPrompt,
      /Recommended labels now:/
    );

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
    assert.match(
      suggestionOptionByLabel(payload).command,
      /lee-spec-kit (feature|onboard)/
    );
    assert.equal(
      Array.isArray(payload.suggestionRequest?.userFacingLines),
      true
    );
    assert.equal(payload.suggestionRequest.userFacingLines.length >= 2, true);
  });
});

test('context --json-compact keeps suggestion labels for non-hot-path states', async () => {
  await withTempDir('lsk-context-no-features-compact-suggestions-', async (dir) => {
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

    const result = await runCli(dir, ['context', '--json-compact']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.schema, 'context.v3.compact');
    assert.equal(payload.status, 'no_features');
    assert.equal(typeof payload.selectionMode, 'string');
    assert.equal(typeof payload.selectionFallback, 'string');
    assert.equal(Array.isArray(payload.actionOptions), true);
    assert.equal(payload.actionOptions.length, 0);
    assert.equal(Array.isArray(payload.suggestionOptions), true);
    assert.equal(payload.suggestionOptions.length >= 1, true);
    assert.equal(suggestionOptionByLabel(payload).label, 'A');
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

    await fs.writeFile(
      path.join(dir, 'app.js'),
      "console.log('dirty');\n",
      'utf-8'
    );

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentSubstateId, 'task_commit_pending');
    assert.equal(payload.matchedFeature.currentSubstateOwner, 'main');
    assert.equal(
      payload.matchedFeature.currentSubstatePhase,
      'commit_pending'
    );
    assert.equal(payload.status, 'single_matched');
    assert.equal(typeof payload.matchedFeature.currentStep, 'number');
    assert.equal(payload.matchedFeature.git.docsHasUncommittedChanges, false);
    assert.equal(payload.matchedFeature.git.projectHasUncommittedChanges, true);
    assert.equal(primaryActionOption(payload).action.type, 'command');
    assert.equal(primaryActionOption(payload).action.scope, 'project');
    assert.equal(primaryActionOption(payload).action.category, 'task_execute');
    assert.doesNotMatch(primaryActionOption(payload).action.cmd, /git add -A/);
    assert.match(
      primaryActionOption(payload).action.cmd,
      /git diff --cached --quiet/
    );
    assert.match(
      primaryActionOption(payload).action.cmd,
      /git commit -m "feat\([^"]+\): /
    );
    assert.match(
      primaryActionOption(payload).action.cmd,
      /feat\(F001-alpha\): alpha/
    );
    assert.doesNotMatch(
      primaryActionOption(payload).action.cmd,
      /T-F001-alpha-01/
    );
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
    const gitName = await runCommand(dir, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasks = await fs.readFile(tasksPath, 'utf-8');
    const checklistPending = tasks.replace('- [x] done', '- [ ] done');
    await fs.writeFile(tasksPath, checklistPending, 'utf-8');

    const docsAdd = await runCommand(dir, 'git', [
      'add',
      'docs/features/F001-alpha',
    ]);
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
    assert.equal(payload.matchedFeature.currentSubstateId, 'task_finalize');
    assert.equal(payload.matchedFeature.currentSubstateOwner, 'main');
    assert.equal(payload.matchedFeature.currentSubstatePhase, 'finalize');
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.match(
      primaryActionOption(payload).action.message,
      /완료 조건 체크리스트의 남은 항목을 진행하세요/
    );
  });
});

test('context prioritizes docs commit over checklist guidance when checklist is pending and docs are dirty', async () => {
  await withTempDir(
    'lsk-context-checklist-pending-docs-dirty-priority-',
    async (dir) => {
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

      const tasksPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'tasks.md'
      );
      const tasks = await fs.readFile(tasksPath, 'utf-8');
      const checklistPending = tasks.replace('- [x] done', '- [ ] done');
      await fs.writeFile(tasksPath, checklistPending, 'utf-8');

      await fs.writeFile(
        path.join(dir, 'app.js'),
        "console.log('dirty');\n",
        'utf-8'
      );

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());

      assert.equal(payload.status, 'single_matched');
      assert.equal(payload.matchedFeature.git.docsHasUncommittedChanges, true);
      assert.equal(
        payload.matchedFeature.git.projectHasUncommittedChanges,
        true
      );
      assert.equal(primaryActionOption(payload).action.type, 'command');
      assert.equal(primaryActionOption(payload).action.scope, 'docs');
      assert.equal(primaryActionOption(payload).action.category, 'docs_commit');
      assert.match(
        primaryActionOption(payload).action.cmd,
        /git commit -m "docs/
      );
    }
  );
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
    const gitName = await runCommand(dir, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = config.workflow || {};
    config.workflow.taskCommitGate = 'strict';
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
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
    assert.match(
      primaryActionOption(payload).action.message,
      /1 task = 1 commit/
    );
    assert.match(
      primaryActionOption(payload).action.message,
      /DONE transitions.*2/
    );
  });
});

test('context strict task commit gate ignores latest commit when DONE transitions are zero', async () => {
  await withTempDir(
    'lsk-context-task-commit-gate-strict-zero-done-',
    async (dir) => {
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

      const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      config.workflow = config.workflow || {};
      config.workflow.taskCommitGate = 'strict';
      await fs.writeFile(
        configPath,
        JSON.stringify(config, null, 2) + '\n',
        'utf-8'
      );

      const tasksPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'tasks.md'
      );
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
      assert.equal(
        firstCommit.code,
        0,
        firstCommit.stderr || firstCommit.stdout
      );

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

      const secondAdd = await runCommand(dir, 'git', [
        'add',
        'docs/features/F001-alpha',
      ]);
      assert.equal(secondAdd.code, 0, secondAdd.stderr || secondAdd.stdout);
      const secondCommit = await runCommand(dir, 'git', [
        'commit',
        '-m',
        'docs: update todo text without done transition',
      ]);
      assert.equal(
        secondCommit.code,
        0,
        secondCommit.stderr || secondCommit.stdout
      );

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());

      assert.equal(payload.taskCommitGatePolicy, 'strict');
      assert.equal(primaryActionOption(payload).action.type, 'command');
      assert.equal(primaryActionOption(payload).action.category, 'task_execute');
      assert.match(
        primaryActionOption(payload).action.cmd || '',
        /"task-run"\s+"F001-alpha"\s+"--task"\s+"T-F001-alpha-02"/
      );
      assert.equal(
        payload.agentOrchestration?.currentActionShouldDelegate,
        true
      );
    }
  );
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
    const gitName = await runCommand(dir, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(gitName.code, 0, gitName.stderr || gitName.stdout);

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = config.workflow || {};
    config.workflow.taskCommitGate = 'warn';
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
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

    const docsAdd = await runCommand(dir, 'git', [
      'add',
      'docs/features/F001-alpha',
      'docs/.lee-spec-kit.json',
    ]);
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
    assert.match(
      primaryActionOption(payload).action.message,
      /Start the next TODO task/
    );
    assert.match(
      primaryActionOption(payload).action.message,
      /Task commit boundary warning/
    );
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

    await fs.writeFile(
      path.join(dir, 'app.js'),
      "console.log('app');\n",
      'utf-8'
    );
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
    assert.equal(
      docsCommitAdd.code,
      0,
      docsCommitAdd.stderr || docsCommitAdd.stdout
    );
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
    assert.equal(
      payload.matchedFeature.git.projectHasUncommittedChanges,
      false
    );
    assert.equal(payload.matchedFeature.completion.workflowDone, false);
    const warnings = payload.matchedFeature.warnings || [];
    assert.equal(
      warnings.some((warning) =>
        /Docs changes are not committed/i.test(String(warning))
      ),
      true
    );
    assert.equal(
      warnings.some((warning) =>
        /Project code changes are not committed/i.test(String(warning))
      ),
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
    assert.equal(
      gitInitProject.code,
      0,
      gitInitProject.stderr || gitInitProject.stdout
    );
    const projectEmail = await runCommand(projectRoot, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    assert.equal(
      projectEmail.code,
      0,
      projectEmail.stderr || projectEmail.stdout
    );
    const projectName = await runCommand(projectRoot, 'git', [
      'config',
      'user.name',
      'Tester',
    ]);
    assert.equal(projectName.code, 0, projectName.stderr || projectName.stdout);
    await fs.writeFile(
      path.join(projectRoot, 'app.js'),
      "console.log('app');\n",
      'utf-8'
    );
    const projectAdd = await runCommand(projectRoot, 'git', ['add', 'app.js']);
    assert.equal(projectAdd.code, 0, projectAdd.stderr || projectAdd.stdout);
    const projectCommit = await runCommand(projectRoot, 'git', [
      'commit',
      '-m',
      'init',
    ]);
    assert.equal(
      projectCommit.code,
      0,
      projectCommit.stderr || projectCommit.stdout
    );

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

    const feature = await runCli(docsRoot, [
      'feature',
      'alpha',
      '--id',
      'F001',
    ]);
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
    assert.equal(
      contextPayload.matchedFeature.git.docsHasUncommittedChanges,
      true
    );
    assert.equal(
      contextPayload.matchedFeature.git.projectHasUncommittedChanges,
      false
    );
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

    const docsAdd = await runCommand(dir, 'git', [
      'add',
      'docs/features/F001-alpha',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: setup F001',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    await fs.writeFile(
      path.join(dir, 'app.txt'),
      'dirty project change\n',
      'utf-8'
    );

    const contextResult = await runCli(dir, [
      'context',
      'F001-alpha',
      '--json',
    ]);
    assert.equal(
      contextResult.code,
      0,
      contextResult.stderr || contextResult.stdout
    );
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
    assert.doesNotMatch(
      status.stdout,
      /\.lee-spec-kit\.approval-tickets\.json/
    );

    const headFiles = await runCommand(dir, 'git', [
      'show',
      '--name-only',
      '--pretty=format:',
      'HEAD',
    ]);
    assert.equal(headFiles.code, 0, headFiles.stderr || headFiles.stdout);
    assert.doesNotMatch(headFiles.stdout, /\.lee-spec-kit\.project\.lock/);
    assert.doesNotMatch(
      headFiles.stdout,
      /\.lee-spec-kit\.approval-tickets\.json/
    );
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
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: [
        'spec_approve',
        'plan_approve',
        'tasks_approve',
        'pr_create',
        'code_review',
        'pr_status_update',
      ],
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

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

test('context executes pre_pr_review command and records review evidence', async () => {
  await withTempDir('lsk-context-execute-pre-pr-review-', async (dir) => {
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
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
      },
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Pending'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');
    await fs.writeFile(
      path.join(dir, 'docs', 'review-trace.json'),
      JSON.stringify(
        buildStructuredPrePrEvidence([
          'docs/.lee-spec-kit.json',
          'docs/features/F001-alpha/decisions.md',
          'docs/features/F001-alpha/issue.md',
          'docs/features/F001-alpha/plan.md',
          'docs/features/F001-alpha/pr.md',
          'docs/features/F001-alpha/spec.md',
          'docs/features/F001-alpha/tasks.md',
          'docs/review-trace.json',
        ], {
          files: [
            'docs/.lee-spec-kit.json',
            'docs/features/F001-alpha/decisions.md',
            'docs/features/F001-alpha/issue.md',
            'docs/features/F001-alpha/plan.md',
            'docs/features/F001-alpha/pr.md',
            'docs/features/F001-alpha/spec.md',
            'docs/features/F001-alpha/tasks.md',
            'docs/review-trace.json',
          ].map((entryPath) => ({
            path: entryPath,
            risk: 'low',
            security: 'none',
            performance: 'n/a',
            maintainability: 'clear',
            fileLine: '1-40',
          })),
        }),
        null,
        2
      ) + '\n',
      'utf-8'
    );

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
      '.lee-spec-kit.json',
      'review-trace.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare pre-pr review command execution',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const contextPayload = JSON.parse(context.stdout.trim());
    assert.equal(contextPayload.matchedFeature.currentStep, 12);
    assert.equal(
      contextPayload.matchedFeature.currentSubstateId,
      'pre_pr_review_record_pending'
    );
    assert.equal(contextPayload.matchedFeature.currentSubstateOwner, 'main');
    assert.equal(contextPayload.matchedFeature.currentSubstatePhase, 'record');
    assert.equal(
      primaryActionOption(contextPayload).action.category,
      'pre_pr_review_record'
    );
    assert.equal(primaryActionOption(contextPayload).action.type, 'command');
    assert.equal(
      contextPayload.agentOrchestration?.currentActionShouldDelegate,
      false
    );
    assert.equal(
      contextPayload.agentOrchestration?.subAgentHandoff?.required,
      false
    );

    const ticket = await issueApprovalTicket(dir, 'F001-alpha', 'A');
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
    if (execute.code !== 0)
      throw new Error(
        'EXECUTE FAILED. STDERR: ' +
          execute.stderr +
          '\nSTDOUT: ' +
          execute.stdout
      );
    const executePayload = JSON.parse(execute.stdout.trim());
    assert.equal(executePayload.status, 'approved_executed');

    const tasksAfter = await fs.readFile(tasksPath, 'utf-8');
    assert.match(tasksAfter, /\*\*Pre-PR Review\*\*:\s*Done/);
    assert.match(
      tasksAfter,
      /\*\*Pre-PR Evidence\*\*:\s*docs\/features\/F001-alpha\/decisions\.md/
    );
    assert.match(
      tasksAfter,
      /\*\*Pre-PR Decision\*\*:\s*decision:\s*approve\b/
    );

    const reportPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'decisions.md'
    );
    assert.equal(await pathExists(reportPath), true);
    const decisions = await fs.readFile(reportPath, 'utf-8');
    assert.match(decisions, /Pre-PR Review Log/i);
    assert.match(decisions, /\*\*Review Scope\*\*/i);
    assert.match(decisions, /\*\*Main Range\*\*:/i);
    assert.match(decisions, /\*\*Worktree Changed Files\*\*:/i);
    assert.match(decisions, /\*\*Residual Risks\*\*:\n {2}- none/i);
    assert.match(decisions, /\*\*Findings\*\*:\n {2}- 0 findings/i);

    const contextAfterExecute = await runCli(dir, [
      'context',
      'F001-alpha',
      '--json',
    ]);
    assert.equal(
      contextAfterExecute.code,
      0,
      contextAfterExecute.stderr || contextAfterExecute.stdout
    );
    const contextAfterExecutePayload = JSON.parse(
      contextAfterExecute.stdout.trim()
    );
    assert.equal(contextAfterExecutePayload.matchedFeature.currentStep, 11);
    assert.equal(
      contextAfterExecutePayload.matchedFeature.prePrReview.evidenceProvided,
      true
    );
    assert.equal(
      primaryActionOption(contextAfterExecutePayload).action.category,
      'docs_commit'
    );

    const docsSyncTicket = await issueApprovalTicket(dir, 'F001-alpha', 'A');
    const docsSyncExecute = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--ticket',
      docsSyncTicket,
      '--json',
    ]);
    assert.equal(
      docsSyncExecute.code,
      0,
      docsSyncExecute.stderr || docsSyncExecute.stdout
    );

    const contextAfterDocsSync = await runCli(dir, [
      'context',
      'F001-alpha',
      '--json',
    ]);
    assert.equal(
      contextAfterDocsSync.code,
      0,
      contextAfterDocsSync.stderr || contextAfterDocsSync.stdout
    );
    const contextAfterDocsSyncPayload = JSON.parse(
      contextAfterDocsSync.stdout.trim()
    );
    assert.equal(contextAfterDocsSyncPayload.matchedFeature.currentStep, 13);
    assert.equal(
      contextAfterDocsSyncPayload.matchedFeature.currentSubstateId,
      'pr_create_prepare'
    );
    assert.equal(
      contextAfterDocsSyncPayload.matchedFeature.currentSubstateOwner,
      'main'
    );
    assert.equal(
      contextAfterDocsSyncPayload.matchedFeature.currentSubstatePhase,
      'ready'
    );
    assert.equal(
      primaryActionOption(contextAfterDocsSyncPayload).action.category,
      'pr_create'
    );
});
}, 20_000);

test('pre-pr-review-run returns agent handoff prompt and record commands', async () => {
  await withTempDir('lsk-pre-pr-review-run-', async (dir) => {
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
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
      },
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    if (!tasks.includes('Pre-PR Review')) {
      tasks = tasks.replace(
        '- **PR Status**: -',
        '- **PR Status**: -\n- **Pre-PR Review**: Pending\n- **Pre-PR Evidence**: -\n- **Pre-PR Decision**: -'
      );
      await fs.writeFile(tasksPath, tasks, 'utf-8');
    }

    const docsGitRoot = path.join(dir, 'docs');
    await runCommand(docsGitRoot, 'git', ['config', 'user.email', 'tester@example.com']);
    await runCommand(docsGitRoot, 'git', ['config', 'user.name', 'Tester']);
    await runCommand(docsGitRoot, 'git', [
      'add',
      'features/F001-alpha',
      '.lee-spec-kit.json',
    ]);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare pre-pr review run state case',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const runReview = await runCli(dir, [
      'pre-pr-review-run',
      'F001-alpha',
      '--json',
    ]);
    assert.equal(runReview.code, 0, runReview.stderr || runReview.stdout);
    const payload = JSON.parse(runReview.stdout.trim());
    assert.equal(payload.status, 'ready');
    assert.equal(payload.reasonCode, 'PRE_PR_REVIEW_RUN_READY');
    assert.equal(payload.feature, 'F001-alpha');
    assert.equal(payload.evidenceFile, 'review-trace.json');
    assert.equal(payload.handoffOnly, true);
    assert.equal(payload.advancesWorkflow, false);
    assert.equal(payload.reuseKey, 'pre-pr:F001-alpha');
    assert.equal('suggestedParallelism' in payload, false);
    assert.equal('fallbackToMainAgentWhenQuotaExceeded' in payload, false);
    assert.equal(payload.nextStepRequirement, 'generate_review_trace_then_record');
    assert.equal(payload.tasksUpdated, true);
    assert.equal(payload.nextMainState, 'pre_pr_review_in_progress');
    const updatedTasks = await fs.readFile(tasksPath, 'utf-8');
    assert.match(updatedTasks, /- \*\*Pre-PR Review\*\*: Running/);
    assert.match(payload.prompt || '', /review-trace\.json/i);
    assert.match(payload.prompt || '', /Default to a single helper agent/i);
    assert.match(
      payload.recordCommands?.changesRequested || '',
      /\bpre-pr-review F001-alpha --evidence review-trace\.json --decision changes_requested\b/
    );
    assert.match(
      payload.recordCommands?.approve || '',
      /\bpre-pr-review F001-alpha --evidence review-trace\.json --decision approve\b/
    );

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const contextPayload = JSON.parse(context.stdout.trim());
    assert.equal(contextPayload.matchedFeature.currentSubstateId, 'pre_pr_review_in_progress');
    assert.equal(
      primaryActionOption(contextPayload).action.category,
      'pre_pr_review_run'
    );
    assert.equal(primaryActionOption(contextPayload).action.type, 'instruction');
    assert.equal(
      primaryActionOption(contextPayload).action.requiresUserCheck,
      false
    );
    assert.deepEqual(contextPayload.delegatedAction, {
      required: true,
      mode: 'command',
      category: 'pre_pr_review_run',
      currentSubstateId: 'pre_pr_review_in_progress',
      delegatedWorkRequired: true,
      handoffOnly: true,
      advancesWorkflow: false,
      doNotReapproveSameLabel: true,
      nextMainState: 'pre_pr_review_in_progress',
      reuseKey: 'pre-pr:F001-alpha',
      evidenceFile: 'review-trace.json',
      nextStepRequirement: 'generate_review_trace_then_record',
      recordCommands: {
        changesRequested:
          'npx lee-spec-kit pre-pr-review F001-alpha --evidence review-trace.json --decision changes_requested',
        approve:
          'npx lee-spec-kit pre-pr-review F001-alpha --evidence review-trace.json --decision approve',
      },
      guidance:
        'A pre-PR review is already in progress. Reuse or resume the delegated review, generate structured review evidence, then record the result with pre-pr-review. Do not re-approve the same label.',
    });

    const compactContext = await runCli(dir, [
      'context',
      'F001-alpha',
      '--json-compact',
    ]);
    assert.equal(
      compactContext.code,
      0,
      compactContext.stderr || compactContext.stdout
    );
    const compactPayload = JSON.parse(compactContext.stdout.trim());
    assert.deepEqual(compactPayload.delegatedAction, contextPayload.delegatedAction);
  });
});

test('context execute reports handoff-prepared for code_review_run without claiming workflow progress', async () => {
  await withTempDir('lsk-context-code-review-run-execute-handoff-', async (dir) => {
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
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        enabled: false,
      },
    };
    await fs.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR**: -',
      '- **PR**: https://github.com/acme/repo/pull/77'
    );
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
    if (!tasks.includes('PR Review Evidence')) {
      tasks = tasks.replace(
        '- **PR Status**: Review',
        '- **PR Status**: Review\n- **PR Review Evidence**: -\n- **PR Review Decision**: -'
      );
    }
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const docsGitRoot = path.join(dir, 'docs');
    await runCommand(docsGitRoot, 'git', ['config', 'user.email', 'tester@example.com']);
    await runCommand(docsGitRoot, 'git', ['config', 'user.name', 'Tester']);
    await runCommand(docsGitRoot, 'git', [
      'add',
      'features/F001-alpha',
      '.lee-spec-kit.json',
    ]);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare code-review execute handoff case',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const approve = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--json',
    ]);
    assert.equal(approve.code, 0, approve.stderr || approve.stdout);
    const approvePayload = JSON.parse(approve.stdout.trim());
    assert.equal(approvePayload.status, 'approved_selected');
    assert.equal(typeof approvePayload.approvalTicket?.token, 'string');

    const execute = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--ticket',
      approvePayload.approvalTicket.token,
      '--json',
    ]);
    assert.equal(execute.code, 0, execute.stderr || execute.stdout);
    const executePayload = JSON.parse(execute.stdout.trim());
    assert.equal(executePayload.status, 'approved_handoff_prepared');
    assert.equal(executePayload.reasonCode, 'HANDOFF_PREPARED');
    assert.equal(executePayload.handoffOnly, true);
    assert.equal(executePayload.advancesWorkflow, false);
    assert.equal(executePayload.nextMainState, 'code_review_running');
    assert.equal(executePayload.delegatedWorkRequired, true);
    assert.equal(executePayload.doNotReapproveSameLabel, true);
  });
}, 20_000);

test('context ignores stale parent review-trace json from another feature', async () => {
  await withTempDir('lsk-context-ignore-stale-parent-pre-pr-evidence-', async (dir) => {
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
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
      },
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Pending'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    await fs.writeFile(
      path.join(dir, 'review-trace.json'),
      JSON.stringify(
        {
          feature: 'F999-unrelated-feature',
          decision: 'approve',
          files: [],
        },
        null,
        2
      ) + '\n',
      'utf-8'
    );

    const repoGitRoot = dir;
    await runCommand(repoGitRoot, 'git', [
      'config',
      'user.email',
      'tester@example.com',
    ]);
    await runCommand(repoGitRoot, 'git', ['config', 'user.name', 'Tester']);
    await runCommand(repoGitRoot, 'git', [
      'add',
      'docs/features/F001-alpha',
      'docs/.lee-spec-kit.json',
      'review-trace.json',
    ]);
    const repoCommit = await runCommand(repoGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare stale parent pre-pr evidence case',
    ]);
    assert.equal(repoCommit.code, 0, repoCommit.stderr || repoCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(payload.matchedFeature.currentSubstateId, 'pre_pr_review_run');
    assert.equal(payload.matchedFeature.currentSubstateOwner, 'subagent');
    assert.equal(payload.matchedFeature.currentSubstatePhase, 'run');
    assert.equal(primaryActionOption(payload).action.category, 'pre_pr_review_run');
    assert.equal(primaryActionOption(payload).action.type, 'command');
  });
});

test('pre-pr-review-run record commands include --component in multi projects', async () => {
  await withTempDir('lsk-pre-pr-review-run-multi-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'app,api',
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
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
      },
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const feature = await runCli(dir, [
      'feature',
      '--component',
      'app',
      'alpha',
      '--id',
      'F001',
    ]);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const runReview = await runCli(dir, [
      'pre-pr-review-run',
      'F001-alpha',
      '--component',
      'app',
      '--json',
    ]);
    assert.equal(runReview.code, 0, runReview.stderr || runReview.stdout);
    const payload = JSON.parse(runReview.stdout.trim());
    assert.match(
      payload.recordCommands?.changesRequested || '',
      /\bpre-pr-review F001-alpha --component app --evidence review-trace\.json --decision changes_requested\b/
    );
    assert.match(
      payload.recordCommands?.approve || '',
      /\bpre-pr-review F001-alpha --component app --evidence review-trace\.json --decision approve\b/
    );
  });
});

test('code-review-run returns sub-agent handoff prompt', async () => {
  await withTempDir('lsk-code-review-run-', async (dir) => {
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
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        enabled: false,
      },
    };
    await fs.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR**: -',
      '- **PR**: https://github.com/acme/repo/pull/77'
    );
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
    if (!tasks.includes('PR Review Evidence')) {
      tasks = tasks.replace(
        '- **PR Status**: Review',
        '- **PR Status**: Review\n- **PR Review Evidence**: -\n- **PR Review Decision**: -'
      );
    } else {
      tasks = tasks.replace(
        /- \*\*PR Review Evidence\*\*: .+/,
        '- **PR Review Evidence**: -'
      );
      tasks = tasks.replace(
        /- \*\*PR Review Decision\*\*: .+/,
        '- **PR Review Decision**: -'
      );
    }
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const docsGitRoot = path.join(dir, 'docs');
    await runCommand(docsGitRoot, 'git', ['config', 'user.email', 'tester@example.com']);
    await runCommand(docsGitRoot, 'git', ['config', 'user.name', 'Tester']);
    await runCommand(docsGitRoot, 'git', [
      'add',
      'features/F001-alpha',
      '.lee-spec-kit.json',
    ]);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare code review run state case',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const runReview = await runCli(dir, [
      'code-review-run',
      'F001-alpha',
      '--json',
    ]);
    assert.equal(runReview.code, 0, runReview.stderr || runReview.stdout);
    const payload = JSON.parse(runReview.stdout.trim());
    assert.equal(payload.reasonCode, 'CODE_REVIEW_RUN_READY');
    assert.equal(payload.feature, 'F001-alpha');
    assert.equal(payload.substateId, 'code_review_run');
    assert.equal(payload.owner, 'subagent');
    assert.equal(payload.nextMainState, 'code_review_running');
    assert.equal(payload.handoffOnly, true);
    assert.equal(payload.advancesWorkflow, false);
    assert.equal(payload.reuseKey, 'code-review:F001-alpha');
    assert.equal('suggestedParallelism' in payload, false);
    assert.equal('fallbackToMainAgentWhenQuotaExceeded' in payload, false);
    assert.equal(payload.tasksUpdated, true);
    assert.match(payload.prompt || '', /PR Review Evidence/i);
    assert.match(payload.prompt || '', /PR Review Decision/i);
    assert.match(payload.prompt || '', /default to a single helper agent/i);

    const updatedTasks = await fs.readFile(tasksPath, 'utf-8');
    assert.match(updatedTasks, /- \*\*PR Review\*\*: Running/);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const contextPayload = JSON.parse(context.stdout.trim());
    assert.equal(contextPayload.matchedFeature.currentSubstateId, 'code_review_running');
    assert.equal(
      primaryActionOption(contextPayload).action.category,
      'code_review_run'
    );
    assert.equal(primaryActionOption(contextPayload).action.type, 'instruction');
    assert.equal(
      primaryActionOption(contextPayload).action.requiresUserCheck,
      false
    );
  });
});

test('task-run marks TODO task as DOING and returns sub-agent handoff prompt', async () => {
  await withTempDir('lsk-task-run-', async (dir) => {
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

    const specPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'spec.md'
    );
    const planPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'plan.md'
    );
    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );

    const spec = (await fs.readFile(specPath, 'utf-8')).replace(
      '- **Status**: -',
      '- **Status**: Approved'
    );
    await fs.writeFile(specPath, spec, 'utf-8');

    const plan = (await fs.readFile(planPath, 'utf-8')).replace(
      '- **Status**: -',
      '- **Status**: Approved'
    );
    await fs.writeFile(planPath, plan, 'utf-8');

    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **Doc Status**: -',
      '- **Doc Status**: Approved'
    );
    tasks = tasks.replace(
      '## Task List',
      '## Task List\n\n- [TODO][P1] T-F001-alpha-01 implement alpha shell'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

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
      'docs: prepare task-run handoff',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const runTask = await runCli(dir, [
      'task-run',
      'F001-alpha',
      '--task',
      'T-F001-alpha-01',
      '--json',
    ]);
    assert.equal(runTask.code, 0, runTask.stderr || runTask.stdout);
    const payload = JSON.parse(runTask.stdout.trim());
    assert.equal(payload.status, 'ready');
    assert.equal(payload.reasonCode, 'TASK_RUN_READY');
    assert.equal(payload.taskId, 'T-F001-alpha-01');
    assert.equal(payload.mode, 'start');
    assert.equal(payload.substateId, 'task_run');
    assert.equal(payload.owner, 'subagent');
    assert.equal(payload.handoffOnly, true);
    assert.equal(payload.reuseKey, 'task:F001-alpha:T-F001-alpha-01');
    assert.equal('suggestedParallelism' in payload, false);
    assert.equal('fallbackToMainAgentWhenQuotaExceeded' in payload, false);
    assert.equal(payload.nextMainState, 'task_complete');
    assert.equal(payload.tasksUpdated, true);
    assert.match(payload.prompt || '', /Default to a single helper agent/i);

    const tasksAfter = await fs.readFile(tasksPath, 'utf-8');
    assert.match(tasksAfter, /\[DOING\]\[P1\] T-F001-alpha-01 implement alpha shell/);
  });
});

test('task-complete marks active DOING task as DONE', async () => {
  await withTempDir('lsk-task-complete-', async (dir) => {
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

    const specPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'spec.md');
    const planPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'plan.md');
    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');

    const spec = (await fs.readFile(specPath, 'utf-8')).replace(
      '- **Status**: -',
      '- **Status**: Approved'
    );
    await fs.writeFile(specPath, spec, 'utf-8');

    const plan = (await fs.readFile(planPath, 'utf-8')).replace(
      '- **Status**: -',
      '- **Status**: Approved'
    );
    await fs.writeFile(planPath, plan, 'utf-8');

    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **Doc Status**: -',
      '- **Doc Status**: Approved'
    );
    tasks = tasks.replace(
      '## Task List',
      '## Task List\n\n- [DOING][P1] T-F001-alpha-01 implement alpha shell'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const docsGitRoot = path.join(dir, 'docs');
    await runCommand(docsGitRoot, 'git', ['config', 'user.email', 'tester@example.com']);
    await runCommand(docsGitRoot, 'git', ['config', 'user.name', 'Tester']);
    await runCommand(docsGitRoot, 'git', ['add', 'features/F001-alpha']);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare task-complete handoff',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const completeTask = await runCli(dir, [
      'task-complete',
      'F001-alpha',
      '--task',
      'T-F001-alpha-01',
      '--json',
    ]);
    assert.equal(
      completeTask.code,
      0,
      completeTask.stderr || completeTask.stdout
    );
    const payload = JSON.parse(completeTask.stdout.trim());
    assert.equal(payload.reasonCode, 'TASK_COMPLETED');
    assert.equal(payload.taskId, 'T-F001-alpha-01');
    assert.equal(payload.previousStatus, 'DOING');
    assert.equal(payload.nextStatus, 'DONE');
    assert.equal(payload.substateId, 'task_complete');
    assert.equal(payload.owner, 'main');
    assert.equal(payload.nextMainState, 'task_finalize');
    assert.equal(payload.tasksUpdated, true);

    const tasksAfter = await fs.readFile(tasksPath, 'utf-8');
    assert.match(tasksAfter, /\[DONE\]\[P1\] T-F001-alpha-01 implement alpha shell/);
  });
});

test('task-run accepts template-style extra bracket tags before task id', async () => {
  await withTempDir('lsk-task-run-extra-tags-', async (dir) => {
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
    await fs.writeFile(
      tasksPath,
      `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Review

## Task List

- [TODO][P1][PRD-FR-001][CHANGE] T-F001-alpha-01 implement alpha shell
`,
      'utf-8'
    );

    const runTask = await runCli(dir, [
      'task-run',
      'F001-alpha',
      '--task',
      'T-F001-alpha-01',
      '--json',
    ]);
    assert.equal(runTask.code, 0, runTask.stderr || runTask.stdout);
    const payload = JSON.parse(runTask.stdout.trim());
    assert.equal(payload.reasonCode, 'TASK_RUN_READY');
    assert.equal(payload.taskId, 'T-F001-alpha-01');
    assert.equal(payload.tasksUpdated, true);

    const tasksAfter = await fs.readFile(tasksPath, 'utf-8');
    assert.match(
      tasksAfter,
      /\[DOING\]\[P1\]\[PRD-FR-001\]\[CHANGE\] T-F001-alpha-01 implement alpha shell/
    );
  });
});

test('pre-pr-review requires structured --evidence for approve even when evidenceMode is any', async () => {
  await withTempDir('lsk-pre-pr-review-approve-needs-evidence-', async (dir) => {
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
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        evidenceMode: 'any',
        enforceExecutionEvidence: false,
      },
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Pending'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const runReview = await runCli(dir, [
      'pre-pr-review',
      'F001-alpha',
      '--json',
    ]);
    assert.equal(runReview.code, 1, runReview.stderr || runReview.stdout);
    const reviewPayload = JSON.parse(runReview.stdout.trim());
    assert.equal(reviewPayload.status, 'error');
    assert.equal(reviewPayload.reasonCode, 'INVALID_ARGUMENT');
    assert.match(reviewPayload.error, /--evidence <path>.*required.*approve/i);
  });
});

test('pre-pr-review requires --evidence when execution evidence enforcement is enabled', async () => {
  await withTempDir('lsk-pre-pr-review-require-evidence-', async (dir) => {
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
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        evidenceMode: 'any',
        enforceExecutionEvidence: true,
      },
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Pending'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const runReview = await runCli(dir, [
      'pre-pr-review',
      'F001-alpha',
      '--json',
    ]);
    assert.equal(runReview.code, 1, runReview.stderr || runReview.stdout);
    const payload = JSON.parse(runReview.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'INVALID_ARGUMENT');
    assert.match(payload.error, /enforceExecutionEvidence=true/);
  });
});

test('pre-pr-review requires explicit --decision when previous decision is non-approve', async () => {
  await withTempDir('lsk-pre-pr-review-explicit-decision-required-', async (dir) => {
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
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        evidenceMode: 'any',
        enforceExecutionEvidence: false,
      },
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Evidence**: -\n- **Pre-PR Decision**: decision: changes_requested - follow-up changes required'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const runReview = await runCli(dir, [
      'pre-pr-review',
      'F001-alpha',
      '--json',
    ]);
    assert.equal(runReview.code, 1, runReview.stderr || runReview.stdout);
    const payload = JSON.parse(runReview.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'INVALID_ARGUMENT');
    assert.match(payload.error, /Existing Pre-PR decision is "changes_requested"/);
    assert.match(payload.error, /explicit --decision/);
  });
});

test('pre-pr-review rejects approve when blocking findings remain in evidence', async () => {
  await withTempDir('lsk-pre-pr-review-blocking-findings-', async (dir) => {
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
    config.workflow = {
      mode: 'github',
      requireIssue: false,
      requireBranch: false,
      requirePr: true,
      requireReview: true,
      prePrReview: {
        skills: ['code-review-excellence'],
      },
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Pending'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    await fs.writeFile(
      path.join(dir, 'docs', 'review-trace.json'),
      JSON.stringify(
        buildStructuredPrePrEvidence([
          'docs/.lee-spec-kit.json',
          'docs/features/F001-alpha/decisions.md',
          'docs/features/F001-alpha/issue.md',
          'docs/features/F001-alpha/plan.md',
          'docs/features/F001-alpha/pr.md',
          'docs/features/F001-alpha/spec.md',
          'docs/features/F001-alpha/tasks.md',
          'docs/review-trace.json',
        ], {
          summary: 'review completed with a blocking architecture issue',
          featureIntentSummary:
            'the feature should preserve the documented workflow boundaries',
          implementationFit:
            'the main implementation is close, but one blocking gap remains',
          missingCases: 'session recovery path still misses the documented constraint',
          findingCount: 1,
          blockingFindings: 1,
          riskSummaries: {
            blocking: 'workflow boundary mismatch remains unresolved',
            important: 'session recovery path needs follow-up validation',
            minor: 'minor cleanup remains after the blocking fix',
          },
          approvalRationale:
            'Not approvable because one blocking architecture issue remains in the reviewed scope.',
          files: [
            'docs/.lee-spec-kit.json',
            'docs/features/F001-alpha/decisions.md',
            'docs/features/F001-alpha/issue.md',
            'docs/features/F001-alpha/plan.md',
            'docs/features/F001-alpha/pr.md',
            'docs/features/F001-alpha/spec.md',
            'docs/features/F001-alpha/tasks.md',
            'docs/review-trace.json',
          ].map((entryPath) => ({
            path: entryPath,
            review: {
              risk: entryPath.endsWith('tasks.md') ? 'high' : 'low',
              security: 'none',
              perf: 'n/a',
              maintainability:
                entryPath.endsWith('tasks.md')
                  ? 'follow-up needed'
                  : 'clear',
              fileLine: '1-40',
            },
          })),
          residualRisks: 'blocking architecture issue remains unresolved',
        }),
        null,
        2
      ) + '\n',
      'utf-8'
    );

    const runReview = await runCli(dir, [
      'pre-pr-review',
      'F001-alpha',
      '--evidence',
      'docs/review-trace.json',
      '--decision',
      'approve',
      '--json',
    ]);
    assert.equal(runReview.code, 1);
    const payload = JSON.parse(runReview.stdout.trim());
    assert.equal(payload.reasonCode, 'VALIDATION_FAILED');
    assert.match(payload.error, /blockingFindings/i);
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
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const contextPayload = JSON.parse(context.stdout.trim());
    assert.equal(
      contextPayload.actionOptions[0].action.requiresUserCheck,
      true
    );

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
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: [
        'spec_approve',
        'plan_approve',
        'tasks_approve',
        'pr_create',
        'code_review',
        'pr_status_update',
      ],
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const contextPayload = JSON.parse(context.stdout.trim());
    assert.equal(contextPayload.approvalRequest?.required, false);
    assert.deepEqual(contextPayload.approvalRequest?.labels, []);
    assert.equal(contextPayload.approvalRequest?.finalPrompt, '');
    assert.deepEqual(contextPayload.approvalRequest?.userFacingLines, []);
    assert.equal(contextPayload.checkPolicy?.approvalRequired, false);
    assert.deepEqual(contextPayload.checkPolicy?.checkRequiredLabels, []);
    assert.equal(contextPayload.autoRun?.available, false);
    assert.equal(contextPayload.autoRun?.policyEligible, true);
    assert.equal(contextPayload.autoRun?.executableNow, false);
    assert.equal(contextPayload.autoRun?.reasonCode, 'MANUAL_BOUNDARY');
    assert.deepEqual(contextPayload.autoRun?.untilCategories, [
      'spec_approve',
      'plan_approve',
      'tasks_approve',
      'pr_create',
      'code_review',
      'pr_status_update',
    ]);
    assert.deepEqual(contextPayload.autoRun?.manualBoundary, {
      label: 'A',
      category: 'spec_write',
      detail: 'Write or refine spec.md and set status',
    });
    assert.match(
      contextPayload.autoRun?.command || '',
      /flow F001-alpha --auto-until-category spec_approve,plan_approve,tasks_approve,pr_create,code_review,pr_status_update/
    );

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
      payload.status === 'approved_instruction' ||
        payload.status === 'approved_executed',
      true
    );
  });
});

test('context surfaces unknown auto-run categories and manual boundary details', async () => {
  await withTempDir('lsk-context-auto-run-unknown-category-', async (dir) => {
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
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: [
        'spec_approve',
        'plan_approve',
        'tasks_approve',
        'pre_pr_review',
        'pr_create',
      ],
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.autoRun?.available, false);
    assert.equal(payload.autoRun?.policyEligible, true);
    assert.equal(payload.autoRun?.executableNow, false);
    assert.equal(payload.autoRun?.reasonCode, 'MANUAL_BOUNDARY');
    assert.deepEqual(payload.autoRun?.unknownCategories, ['pre_pr_review']);
    assert.deepEqual(payload.autoRun?.manualBoundary, {
      label: 'A',
      category: 'spec_write',
      detail: 'Write or refine spec.md and set status',
    });
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
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

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

test('context tickets enforce explicit session binding when provided', async () => {
  await withTempDir('lsk-context-ticket-explicit-session-', async (dir) => {
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
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const ticket = await issueApprovalTicket(dir, 'F001-alpha', 'A', {
      LEE_SPEC_KIT_SESSION_ID: 'session-A',
    });
    const execute = await runCli(
      dir,
      [
        'context',
        'F001-alpha',
        '--approve',
        'A',
        '--execute',
        '--ticket',
        ticket,
        '--json',
      ],
      { LEE_SPEC_KIT_SESSION_ID: 'session-B' }
    );
    assert.equal(execute.code, 1);
    const payload = JSON.parse(execute.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'INVALID_APPROVAL');
  });
});

test('context tickets without stable session binding can execute after approval', async () => {
  await withTempDir('lsk-context-ticket-no-stable-session-', async (dir) => {
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
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const noStableSessionEnv = {
      LEE_SPEC_KIT_SESSION_ID: '',
      TERM_SESSION_ID: '',
      WT_SESSION: '',
      TMUX_PANE: '',
    };
    const ticket = await issueApprovalTicket(
      dir,
      'F001-alpha',
      'A',
      noStableSessionEnv
    );
    const execute = await runCli(
      dir,
      [
        'context',
        'F001-alpha',
        '--approve',
        'A',
        '--execute',
        '--ticket',
        ticket,
        '--json',
      ],
      { LEE_SPEC_KIT_SESSION_ID: 'session-different' }
    );
    assert.equal(execute.code, 0, execute.stderr || execute.stdout);
    const payload = JSON.parse(execute.stdout.trim());
    assert.equal(payload.status, 'approved_instruction');
    assert.equal(payload.reasonCode, 'INSTRUCTION_ONLY');
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

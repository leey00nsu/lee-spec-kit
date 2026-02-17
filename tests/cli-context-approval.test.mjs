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

test('context --json exposes generic label token policy', async () => {
  await withTempDir('lsk-context-token-policy-', async (dir) => {
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
    assert.equal(payload.selectionFallback, 'open_features');
    assert.equal(payload.checkPolicy.token, '<LABEL>');
    assert.deepEqual(payload.checkPolicy.acceptedTokens, [
      '<LABEL>',
      '<LABEL> OK',
      '<LABEL> ...',
      '... <LABEL> ...',
    ]);
    assert.equal(payload.checkPolicy.tokenPattern, '^.*\\b([A-Z]+)\\b.*$');
    assert.equal(payload.checkPolicy.requireExplanationBeforeApproval, true);
    assert.deepEqual(payload.checkPolicy.requiredExplanationFields, [
      'actionOptions[].label',
      'actionOptions[].detail',
      'actionOptions[].approvalPrompt',
    ]);
  });
});

test('context --json actionOptions and approvalRequest expose raw detail fields', async () => {
  await withTempDir('lsk-context-action-summary-', async (dir) => {
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

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'single_matched');
    assert.equal(Array.isArray(payload.actionOptions), true);
    assert.equal(payload.actionOptions.length > 0, true);
    assert.equal(payload.selectionFallback, 'none');
    assert.equal(payload.checkPolicy.policyOnly, true);
    assert.equal(typeof primaryActionOption(payload).summary, 'string');
    assert.equal(primaryActionOption(payload).summary.length > 0, true);
    assert.equal(typeof primaryActionOption(payload).detail, 'string');
    assert.equal(primaryActionOption(payload).detail.length > 0, true);
    assert.equal(typeof primaryActionOption(payload).approvalPrompt, 'string');
    assert.match(primaryActionOption(payload).approvalPrompt, /^[A-Z]+:\s+/);
    assert.equal(
      primaryActionOption(payload).approvalPrompt,
      `${primaryActionOption(payload).label}: ${primaryActionOption(payload).detail}`
    );
    assert.equal(typeof payload.primaryActionLabel, 'string');
    assert.equal(payload.primaryActionType, primaryActionOption(payload).action.type);
    assert.equal(payload.primaryActionCategory, primaryActionOption(payload).action.category);
    assert.equal(
      payload.primaryActionOperationType,
      primaryActionOption(payload).action.operationType
    );
    assert.equal(primaryActionOption(payload).action.operationType, 'manual');
    assert.equal(Array.isArray(payload.approvalRequest?.options), true);
    assert.equal(payload.approvalRequest.options.length, payload.actionOptions.length);
    assert.equal(Array.isArray(payload.approvalRequest?.labels), true);
    assert.equal(payload.approvalRequest.labels.length, payload.actionOptions.length);
    assert.equal(Array.isArray(payload.approvalRequest?.userFacingLines), true);
    assert.equal(
      payload.approvalRequest.userFacingLines.length,
      payload.actionOptions.length + 1
    );
    assert.equal(
      payload.approvalRequest.userFacingLines[0],
      primaryActionOption(payload).approvalPrompt
    );
    assert.equal(
      payload.approvalRequest.userFacingLines[payload.approvalRequest.userFacingLines.length - 1],
      payload.approvalRequest.finalPrompt
    );
    assert.equal(typeof payload.approvalRequest?.finalPrompt, 'string');
    assert.match(payload.approvalRequest.finalPrompt, /Available labels now:/);
    assert.equal(typeof payload.approvalRequest?.approveCommand, 'string');
    assert.match(payload.approvalRequest.approveCommand, /--approve <LABEL>$/);
    assert.equal(typeof payload.approvalRequest?.executeCommand, 'string');
    assert.match(
      payload.approvalRequest.executeCommand,
      /--approve <LABEL> --execute \[--ticket <TICKET>\]$/
    );
    assert.equal(payload.approvalRequest.options[0].detail, primaryActionOption(payload).detail);
    assert.equal(
      payload.approvalRequest.options[0].actionType,
      primaryActionOption(payload).action.type
    );
    assert.equal(
      payload.approvalRequest.options[0].operationType,
      primaryActionOption(payload).action.operationType
    );
    if (primaryActionOption(payload).action.type === 'command') {
      assert.equal(
        payload.approvalRequest.options[0].cmd,
        primaryActionOption(payload).action.cmd
      );
      assert.equal(
        payload.approvalRequest.options[0].cwd,
        primaryActionOption(payload).action.cwd
      );
      assert.equal(
        payload.approvalRequest.options[0].scope,
        primaryActionOption(payload).action.scope
      );
    }
  });
});

test('context spec_write approval prompt hides internal docs-get commands', async () => {
  await withTempDir('lsk-context-spec-write-user-prompt-', async (dir) => {
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

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 2);
    assert.equal(primaryActionOption(payload).action.category, 'spec_write');
    assert.doesNotMatch(primaryActionOption(payload).detail, /docs get/i);
    assert.doesNotMatch(primaryActionOption(payload).approvalPrompt, /docs get/i);
  });
});

test('context --approve accepts natural language replies that include a label token', async () => {
  await withTempDir('lsk-context-approve-natural-language-', async (dir) => {
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

    const result = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A 진행해',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'approved_selected');
    assert.equal(payload.label, 'A');
    assert.equal(typeof payload?.approvalTicket?.token, 'string');
    assert.equal(payload.approvalTicket.token.length > 0, true);
  });
});

test('context text output ends with current label reminder and execution hint', async () => {
  await withTempDir('lsk-context-final-label-reminder-', async (dir) => {
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
    assert.match(result.stdout, /Available labels now: A(, B)?\./);
    assert.match(
      result.stdout,
      /When a label is provided, run approval selection: npx lee-spec-kit context F001-alpha --approve <LABEL>/
    );
  });
});

test('context pre-PR review step is enforced before PR creation and exposes policy', async () => {
  await withTempDir('lsk-context-pre-pr-review-', async (dir) => {
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
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasksBefore = await fs.readFile(tasksPath, 'utf-8');
    const tasksAfter = tasksBefore.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Pending'
    );
    await fs.writeFile(tasksPath, tasksAfter, 'utf-8');

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
      'docs: prepare pre-pr review step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.status, 'single_matched');
    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(payload.matchedFeature.docs.prePrReviewFieldExists, true);
    assert.equal(payload.matchedFeature.prePrReview.status, 'Pending');
    assert.equal(primaryActionOption(payload).action.category, 'pre_pr_review');
    assert.equal(payload.prePrReviewPolicy.enabled, true);
    assert.deepEqual(payload.prePrReviewPolicy.skills, ['code-review-excellence']);
    assert.equal(payload.prePrReviewPolicy.fallback, 'builtin-checklist');
    assert.equal(payload.prePrReviewPolicy.blockOnFindings, true);
    assert.equal(payload.prePrReviewPolicy.minorPolicy, 'warn');
  });
});

test('context pre-PR review requires evidence before PR step when review is marked Done', async () => {
  await withTempDir('lsk-context-pre-pr-evidence-required-', async (dir) => {
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
        blockOnFindings: true,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Findings**: major=0, minor=1\n- **Pre-PR Evidence**: -'
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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: require pre-pr evidence before pr step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(primaryActionOption(payload).action.category, 'pre_pr_review');
    assert.match(primaryActionOption(payload).detail, /Pre-PR Evidence/i);
  });
});

test('context pre-PR review blocks PR step when major findings remain', async () => {
  await withTempDir('lsk-context-pre-pr-major-findings-block-', async (dir) => {
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
        blockOnFindings: true,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Findings**: major=2, minor=1\n- **Pre-PR Evidence**: docs/features/F001-alpha/pre-pr-review.md'
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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: block pre-pr step on major findings',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(primaryActionOption(payload).action.category, 'pre_pr_review');
    assert.match(primaryActionOption(payload).detail, /major findings/i);
    assert.match(primaryActionOption(payload).detail, /2/);
  });
});

test('context pre-PR review allows PR step on minor-only findings when minorPolicy=warn', async () => {
  await withTempDir('lsk-context-pre-pr-minor-warn-', async (dir) => {
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
        blockOnFindings: true,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Findings**: major=0, minor=2\n- **Pre-PR Evidence**: docs/features/F001-alpha/pre-pr-review.md'
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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: allow pre-pr step with minor findings in warn mode',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 13);
    assert.equal(primaryActionOption(payload).action.category, 'pr_create');
    assert.equal(payload.actionOptions.length >= 2, true);
    assert.equal(
      payload.actionOptions.some(
        (option) => option.action.category === 'user_request_replan'
      ),
      true
    );
  });
});

test('context pre-PR review blocks PR step on minor findings when minorPolicy=block', async () => {
  await withTempDir('lsk-context-pre-pr-minor-block-', async (dir) => {
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
        blockOnFindings: true,
        minorPolicy: 'block',
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Findings**: major=0, minor=2\n- **Pre-PR Evidence**: docs/features/F001-alpha/pre-pr-review.md'
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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: block pre-pr step on minor findings',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(primaryActionOption(payload).action.category, 'pre_pr_review');
    assert.match(primaryActionOption(payload).detail, /minor findings/i);
    assert.match(primaryActionOption(payload).detail, /2/);
  });
});

test('context issue_create action requires explicit user check and is instruction-only', async () => {
  await withTempDir('lsk-context-issue-create-check-', async (dir) => {
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
      'docs: prepare issue-create step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 8);
    assert.equal(primaryActionOption(payload).action.category, 'issue_create');
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.equal(primaryActionOption(payload).action.requiresUserCheck, true);
    assert.equal(primaryActionOption(payload).action.operationType, 'remote');
    assert.doesNotMatch(primaryActionOption(payload).detail, /docs get/i);
    assert.doesNotMatch(primaryActionOption(payload).approvalPrompt, /docs get/i);
    assert.equal(Array.isArray(payload.requiredDocs), true);
    assert.equal(payload.requiredDocs.some((doc) => doc.id === 'create-issue'), true);

    const ticket = await issueApprovalTicket(dir, 'F001-alpha', 'A');
    const executeAttempt = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--ticket',
      ticket,
      '--execute-strict',
      '--json',
    ]);
    assert.equal(executeAttempt.code, 1);
    const executePayload = JSON.parse(executeAttempt.stdout.trim());
    assert.equal(executePayload.reasonCode, 'EXECUTION_NOT_COMMAND');
  });
});

test('context pr_create action still requires explicit user check', async () => {
  await withTempDir('lsk-context-pr-create-check-', async (dir) => {
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
      requireReview: false,
      prePrReview: {
        enabled: false,
      },
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

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
      'docs: prepare pr-create step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 13);
    assert.equal(primaryActionOption(payload).action.category, 'pr_create');
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.equal(primaryActionOption(payload).action.requiresUserCheck, true);
    assert.equal(primaryActionOption(payload).action.operationType, 'remote');
    assert.equal(payload.actionOptions.length >= 2, true);
    assert.equal(
      payload.actionOptions.some(
        (option) => option.action.category === 'user_request_replan'
      ),
      true
    );
    assert.match(primaryActionOption(payload).action.message, /pr\.md|PR 초안|PR title\/body\/labels/i);
    assert.match(primaryActionOption(payload).action.message, /Ready/);
    assert.doesNotMatch(primaryActionOption(payload).detail, /docs get/i);
    assert.doesNotMatch(primaryActionOption(payload).approvalPrompt, /docs get/i);
    assert.equal(Array.isArray(payload.requiredDocs), true);
    assert.equal(payload.requiredDocs.some((doc) => doc.id === 'create-pr'), true);
  });
});

test('context code_review step keeps Review status and guides merge command', async () => {
  await withTempDir('lsk-context-code-review-merge-guidance-', async (dir) => {
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
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **PR**: -', '- **PR**: https://github.com/acme/repo/pull/77');
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
    tasks = tasks.replace(
      '- **PR Status**: Review',
      '- **PR Status**: Review\n- **PR Review Findings**: major=0, minor=0\n- **PR Review Evidence**: -'
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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare code-review step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 14);
    assert.equal(primaryActionOption(payload).action.category, 'code_review');
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.equal(primaryActionOption(payload).action.requiresUserCheck, true);
    assert.equal(primaryActionOption(payload).action.operationType, 'remote');
    assert.equal(payload.actionOptions.length >= 2, true);
    assert.equal(
      payload.actionOptions.some(
        (option) => option.action.category === 'user_request_replan'
      ),
      true
    );
    const mergeOption = payload.actionOptions.find(
      (option) =>
        option.action.type === 'command' &&
        option.action.category === 'code_review' &&
        /github pr F001 --merge --confirm OK/.test(option.action.cmd || '')
    );
    assert.equal(Boolean(mergeOption), true);
    assert.equal(mergeOption.action.scope, 'docs');
    assert.match(primaryActionOption(payload).action.message, /addressing comments|리뷰 코멘트/);
    assert.doesNotMatch(primaryActionOption(payload).action.message, /Review → Approved/);
  });
});

test('context uses review-fix commit guidance when project is dirty during PR review', async () => {
  await withTempDir('lsk-context-code-review-dirty-commit-guidance-', async (dir) => {
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
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **PR**: -', '- **PR**: https://github.com/acme/repo/pull/77');
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
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
      '.lee-spec-kit.json',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare review step with dirty project',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    await fs.writeFile(path.join(dir, 'app.js'), "console.log('review fix');\n", 'utf-8');

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 11);
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.equal(primaryActionOption(payload).action.category, 'review_fix_commit');
    assert.match(primaryActionOption(payload).action.message, /review fixes/i);
    assert.match(primaryActionOption(payload).action.message, /fix\(review\): <review-fix-summary>/i);
    assert.doesNotMatch(primaryActionOption(payload).action.message, /feat\(/i);
    assert.equal(payload.requiredDocs.some((doc) => doc.id === 'create-pr'), true);
    assert.equal(payload.requiredDocs.some((doc) => doc.id === 'git-workflow'), true);
  });
});

test('status --json marks workflow completion as WORKFLOW_DONE', async () => {
  await withTempDir('lsk-status-workflow-done-', async (dir) => {
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

    const result = await runCli(dir, ['status', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.counts.workflowDone, 1);
    assert.equal(payload.counts.implementationDone, 1);
    assert.equal(payload.features[0].status, 'WORKFLOW_DONE');
  });
});

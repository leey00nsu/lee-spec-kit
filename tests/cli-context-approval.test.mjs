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
  setFeatureAsDone,
  issueApprovalTicket,
  primaryActionOption,
} from './helpers/cli-contract-helpers.mjs';

function buildStructuredPrePrEvidence(options = {}) {
  const {
    summary = 'validated the implementation against the feature goal and reviewed code quality risks',
    featureIntentSummary = 'the feature is intended to persist the approved user flow without expanding scope',
    implementationFit = 'the implementation fits the feature intent and reuses the expected module boundaries',
    missingCases = ['no significant missing cases identified'],
    decision = 'approve',
    findings = [
      'src/app/store.ts:88 | severity: medium | fix: required | note: guard stale snapshot write',
    ],
    residualRisks = ['no residual risks found in reviewed scope'],
    commandsExecuted = [],
  } = options;
  const missingCasesLines = missingCases.map((item) => `  - ${item}`).join('\n');
  const findingsLines = findings.map((item) => `  - ${item}`).join('\n');
  const residualRiskLines = residualRisks
    .map((item) => `  - ${item}`)
    .join('\n');
  const commandsExecutedBlock =
    commandsExecuted.length > 0
      ? `- **Commands Executed**:\n${commandsExecuted
          .map((item) => `  - ${item}`)
          .join('\n')}\n`
      : '';
  return `## Pre-PR Review Log (2026-02-19)

- **Feature**: F001-alpha
- **Baseline**: builtin-checklist
- **Skills**: code-review-excellence
- **Decision**: ${decision}
- **Summary**: ${summary}
- **Feature Intent Summary**: ${featureIntentSummary}
- **Implementation Fit**: ${implementationFit}
- **Missing Cases**:
${missingCasesLines}
${commandsExecutedBlock}
- **Findings**:
${findingsLines}
- **Residual Risks**:
${residualRiskLines}
- **Trace**: manual review completed
`;
}

function buildPrReviewLog(options = {}) {
  const {
    decision = 'decision: reflected review feedback and synced docs',
    summary = 'summary: validated resolved comments and regression checks',
  } = options;
  return `## PR Review Log (2026-02-19)

- **Summary**: ${summary}
- **Decision**: ${decision}
- **Trace**: reviewed latest PR feedback
`;
}

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
    assert.deepEqual(payload.checkPolicy.activeCategories, []);
    assert.equal(Array.isArray(payload.checkPolicy.knownCategories), true);
    assert.equal(payload.checkPolicy.knownCategories.length > 0, true);
    assert.deepEqual(payload.checkPolicy.uncategorizedLabels, []);
    assert.match(
      payload.checkPolicy.categoryPolicyGuidance,
      /approval\.mode="category"/
    );
    assert.equal(payload.checkPolicy.approvalRequired, false);
    assert.deepEqual(payload.checkPolicy.checkRequiredLabels, []);
    assert.deepEqual(payload.checkPolicy.checkRequiredCategories, []);
    assert.equal(payload.checkPolicy.requireExplanationBeforeApproval, false);
    assert.deepEqual(payload.checkPolicy.requiredExplanationFields, []);
    assert.equal(
      payload.agentOrchestration?.mode,
      'main_orchestrates_subagent_execution'
    );
    assert.equal(
      payload.agentOrchestration?.delegationPolicy,
      'prefer_main_delegate_long_running_fallback_main'
    );
    assert.equal(
      Array.isArray(payload.agentOrchestration?.pauseAndReportWhen),
      true
    );
    assert.equal(
      payload.agentOrchestration?.pauseAndReportWhen?.includes(
        'approvalRequest.required=true'
      ),
      true
    );
    assert.equal(
      Array.isArray(payload.agentOrchestration?.resumePriority),
      true
    );
    assert.equal(
      payload.agentOrchestration?.resumePriority?.includes(
        'context --json-compact'
      ),
      true
    );
    assert.equal(typeof payload.agentOrchestration?.subAgentHandoff, 'object');
    assert.equal(payload.agentOrchestration?.subAgentHandoff?.required, false);
    assert.equal(payload.agentOrchestration?.subAgentHandoff?.mode, null);
    assert.equal(payload.agentOrchestration?.subAgentHandoff?.verify, null);
    assert.equal(payload.autoRun?.available, false);
    assert.equal(payload.autoRun?.reasonCode, 'NOT_SINGLE_MATCHED');
  });
});

test('context auto-detect prefers single expected feature worktree before open-feature fallback', async () => {
  await withTempDir('lsk-context-worktree-single-match-', async (dir) => {
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

    const featureAlpha = await runCli(dir, [
      'feature',
      'alpha',
      '--id',
      'F001',
    ]);
    assert.equal(
      featureAlpha.code,
      0,
      featureAlpha.stderr || featureAlpha.stdout
    );
    const featureBeta = await runCli(dir, ['feature', 'beta', '--id', 'F002']);
    assert.equal(featureBeta.code, 0, featureBeta.stderr || featureBeta.stdout);

    const alphaTasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    const betaTasksPath = path.join(
      dir,
      'docs',
      'features',
      'F002-beta',
      'tasks.md'
    );
    const alphaTasks = (await fs.readFile(alphaTasksPath, 'utf-8')).replace(
      /(- \*\*Repo\*\*: .*\n)/,
      '$1- **Issue**: #11\n'
    );
    const betaTasks = (await fs.readFile(betaTasksPath, 'utf-8')).replace(
      /(- \*\*Repo\*\*: .*\n)/,
      '$1- **Issue**: #22\n'
    );
    await fs.writeFile(alphaTasksPath, alphaTasks, 'utf-8');
    await fs.writeFile(betaTasksPath, betaTasks, 'utf-8');

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
    const gitAdd = await runCommand(dir, 'git', [
      'add',
      'docs/features/F001-alpha',
      'docs/features/F002-beta',
    ]);
    assert.equal(gitAdd.code, 0, gitAdd.stderr || gitAdd.stdout);
    const gitCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: prepare worktree-based feature selection test',
    ]);
    assert.equal(gitCommit.code, 0, gitCommit.stderr || gitCommit.stdout);

    const before = await runCli(dir, ['context', '--json']);
    assert.equal(before.code, 0, before.stderr || before.stdout);
    const beforePayload = JSON.parse(before.stdout.trim());
    assert.equal(beforePayload.status, 'multiple_active');
    assert.equal(beforePayload.selectionMode, 'open');
    assert.equal(beforePayload.selectionFallback, 'open_features');

    const createWorktree = await runCommand(dir, 'git', [
      'worktree',
      'add',
      '-b',
      'feat/11-alpha',
      '.worktrees/feat-11-alpha',
    ]);
    assert.equal(
      createWorktree.code,
      0,
      createWorktree.stderr || createWorktree.stdout
    );

    const after = await runCli(dir, ['context', '--json']);
    assert.equal(after.code, 0, after.stderr || after.stdout);
    const afterPayload = JSON.parse(after.stdout.trim());
    assert.equal(afterPayload.status, 'single_matched');
    assert.equal(afterPayload.selectionMode, 'branch');
    assert.equal(afterPayload.selectionFallback, 'none');
    assert.equal(afterPayload.matchedFeature?.id, 'F001');
  });
}, 20_000);

test('context gates task execution on main workspace when workflow.requireWorktree=true', async () => {
  await withTempDir('lsk-context-require-worktree-gate-', async (dir) => {
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
      ...(config.workflow || {}),
      requireWorktree: true,
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const featureAlpha = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(
      featureAlpha.code,
      0,
      featureAlpha.stderr || featureAlpha.stdout
    );

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

    const tasks = `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Approved
- **Repo**: demo
- **Issue**: #11
- **Branch**: feat/11-alpha
- **PR**: -
- **PR Status**: -
- **Pre-PR Review**: Pending
- **Pre-PR Evidence**: -
- **Pre-PR Decision**: -
- **PR Review Evidence**: -
- **PR Review Decision**: -

## Task List

- [TODO][P1] T-F001-alpha-01 implement alpha shell

## Completion Criteria

- [ ] done
`;
    await fs.writeFile(tasksPath, tasks, 'utf-8');

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

    const gitAdd = await runCommand(dir, 'git', [
      'add',
      'docs/.lee-spec-kit.json',
      'docs/features/F001-alpha',
    ]);
    assert.equal(gitAdd.code, 0, gitAdd.stderr || gitAdd.stdout);
    const gitCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'docs: prepare requireWorktree gate scenario',
    ]);
    assert.equal(gitCommit.code, 0, gitCommit.stderr || gitCommit.stdout);
    const checkoutFeatureBranch = await runCommand(dir, 'git', [
      'checkout',
      '-b',
      'feat/11-alpha',
    ]);
    assert.equal(
      checkoutFeatureBranch.code,
      0,
      checkoutFeatureBranch.stderr || checkoutFeatureBranch.stdout
    );

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 10);
    assert.equal(payload.matchedFeature.currentSubstateId, 'task_blocked');
    assert.equal(payload.matchedFeature.currentSubstateOwner, 'main');
    assert.equal(payload.matchedFeature.currentSubstatePhase, 'blocked');

    const branchCreateOption = payload.actionOptions.find(
      (option) => option.action.category === 'branch_create'
    );
    assert.equal(!!branchCreateOption, true);
    assert.equal(primaryActionOption(payload).action.category, 'branch_create');
    assert.match(branchCreateOption.action.message, /requireWorktree|worktree/);
  });
});

test('context --json does not force command delegation for branch_create when auto-run is available', async () => {
  await withTempDir(
    'lsk-context-branch-create-delegation-signal-',
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
        requireCheckCategories: ['tasks_approve', 'pr_create'],
      };
      await fs.writeFile(
        configPath,
        JSON.stringify(config, null, 2) + '\n',
        'utf-8'
      );

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
      tasks = tasks.replace(/- \*\*Issue\*\*:[^\n]*/u, '- **Issue**: #3');
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
        'docs: prepare branch-create delegation signal test',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout.trim());

      assert.equal(payload.status, 'single_matched');
      assert.equal(payload.autoRun?.available, true);
      assert.equal(
        payload.agentOrchestration?.subAgentHandoff?.required,
        false
      );
      assert.equal(payload.agentOrchestration?.subAgentHandoff?.mode, null);
      assert.equal(payload.agentOrchestration?.subAgentHandoff?.cmd, null);
      assert.equal(payload.agentOrchestration?.subAgentHandoff?.verify, null);
    }
  );
});

test('context --json keeps task_execute project commit command in main agent', async () => {
  await withTempDir(
    'lsk-context-task-exec-project-commit-main-',
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

      const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      config.approval = {
        mode: 'category',
        default: 'skip',
        requireCheckCategories: ['spec_write', 'user_request_replan'],
      };
      await fs.writeFile(
        configPath,
        JSON.stringify(config, null, 2) + '\n',
        'utf-8'
      );

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
        'docs: prepare task_execute project commit delegation test',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      await fs.writeFile(
        path.join(dir, 'probe-task-execute.txt'),
        'probe\n',
        'utf-8'
      );

      const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout.trim());

      assert.equal(payload.status, 'single_matched');
      assert.equal(
        primaryActionOption(payload).action?.category,
        'task_execute'
      );
      assert.equal(primaryActionOption(payload).action?.type, 'command');
      assert.equal(primaryActionOption(payload).action?.scope, 'project');
      assert.match(
        primaryActionOption(payload).action?.cmd || '',
        /\bgit\s+commit\b/i
      );
      assert.equal(
        payload.agentOrchestration?.subAgentHandoff?.required,
        false
      );
      assert.equal(payload.agentOrchestration?.subAgentHandoff?.mode, null);
    }
  );
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = {
      mode: 'category',
      default: 'require',
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

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
    assert.equal(
      typeof primaryActionOption(payload).requiresRequestText,
      'boolean'
    );
    assert.equal(typeof primaryActionOption(payload).replyExample, 'string');
    assert.equal(
      primaryActionOption(payload).replyExample,
      primaryActionOption(payload).label
    );
    assert.match(primaryActionOption(payload).approvalPrompt, /^[A-Z]+:\s+/);
    assert.equal(
      primaryActionOption(payload).approvalPrompt,
      `${primaryActionOption(payload).label}: ${primaryActionOption(payload).detail}`
    );
    assert.equal(typeof payload.primaryActionLabel, 'string');
    assert.equal(
      payload.primaryActionType,
      primaryActionOption(payload).action.type
    );
    assert.equal(
      payload.primaryActionCategory,
      primaryActionOption(payload).action.category
    );
    assert.equal(
      payload.checkPolicy.activeCategories.includes(
        payload.primaryActionCategory
      ),
      true
    );
    assert.equal(
      payload.primaryActionOperationType,
      primaryActionOption(payload).action.operationType
    );
    assert.equal(primaryActionOption(payload).action.operationType, 'manual');
    assert.equal(Array.isArray(payload.approvalRequest?.options), true);
    assert.equal(
      payload.approvalRequest.options.length,
      payload.actionOptions.length
    );
    assert.equal(Array.isArray(payload.approvalRequest?.labels), true);
    assert.equal(
      payload.approvalRequest.labels.length,
      payload.actionOptions.length
    );
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
      payload.approvalRequest.userFacingLines[
        payload.approvalRequest.userFacingLines.length - 1
      ],
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
    assert.equal(
      payload.approvalRequest.options[0].detail,
      primaryActionOption(payload).detail
    );
    assert.equal(
      payload.approvalRequest.options[0].requiresRequestText,
      primaryActionOption(payload).requiresRequestText
    );
    assert.equal(
      payload.approvalRequest.options[0].replyExample,
      primaryActionOption(payload).replyExample
    );
    assert.equal(
      payload.approvalRequest.options[0].actionType,
      primaryActionOption(payload).action.type
    );
    assert.equal(
      payload.approvalRequest.options[0].category,
      primaryActionOption(payload).action.category
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

test('context summaries are localized in ko mode (no English fallback summaries)', async () => {
  await withTempDir('lsk-context-summary-localized-ko-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['spec_write', 'user_request_replan'],
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    const replan = payload.actionOptions.find(
      (option) => option.action.category === 'user_request_replan'
    );
    assert.equal(typeof replan?.summary, 'string');
    assert.match(replan.summary, /새 사용자 요구/);
    assert.doesNotMatch(replan.summary, /Handle a new user request first/);
  });
});

test('context --json-compact uses the context.v3 hot-path action option contract', async () => {
  await withTempDir('lsk-context-json-compact-reply-metadata-', async (dir) => {
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
      requireCheckCategories: ['spec_write', 'user_request_replan'],
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
      '--json-compact',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim().includes('\n'), false);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.schema, 'context.v3.compact');
    assert.equal(payload.selectionMode, undefined);
    assert.equal(payload.selectionFallback, undefined);
    assert.equal(payload.suggestionOptions, undefined);
    assert.equal(payload.suggestionRequest, undefined);
    assert.equal(payload.recommendation, undefined);
    assert.equal(payload.primaryActionLabel, undefined);
    assert.equal(payload.workflowPolicy, undefined);
    assert.equal(payload.taskCommitGatePolicy, undefined);
    assert.equal(payload.prePrReviewPolicy, undefined);
    assert.equal(typeof payload.matchedFeature.ref, 'string');
    assert.equal(payload.matchedFeature.path, undefined);
    assert.equal(payload.matchedFeature.git, undefined);
    assert.equal(payload.matchedFeature.docs, undefined);
    assert.equal(payload.matchedFeature.pr, undefined);
    assert.equal(payload.matchedFeature.prePrReview, undefined);
    assert.equal(payload.matchedFeature.prReview, undefined);
    assert.equal(Array.isArray(payload.actionOptions), true);
    assert.equal(payload.actionOptions.length > 0, true);
    for (const option of payload.actionOptions) {
      assert.equal(typeof option.label, 'string');
      assert.equal(typeof option.detail, 'string');
      assert.equal(typeof option.actionType, 'string');
      assert.equal(typeof option.category, 'string');
      assert.equal(typeof option.operationType, 'string');
      assert.equal(typeof option.requiresUserCheck, 'boolean');
      assert.equal(option.action, undefined);
      assert.equal(option.requiresRequestText, undefined);
      assert.equal(option.replyExample, undefined);
      assert.equal(option.summary, undefined);
      assert.equal(option.approvalPrompt, undefined);
      assert.equal(option.uiDetailParams, undefined);
      if (option.actionType === 'command') {
        assert.equal(typeof option.scope, 'string');
        assert.equal(typeof option.cwd, 'string');
        assert.equal(typeof option.cmd, 'string');
        assert.equal(option.message, undefined);
      } else {
        assert.equal(option.actionType, 'instruction');
        assert.equal(typeof option.message, 'string');
        assert.equal(option.scope, undefined);
        assert.equal(option.cwd, undefined);
        assert.equal(option.cmd, undefined);
      }
    }
    assert.equal(typeof payload.checkPolicy.token, 'string');
    assert.equal(Array.isArray(payload.checkPolicy.validLabels), true);
    assert.equal(Array.isArray(payload.checkPolicy.checkRequiredLabels), true);
    assert.equal(Array.isArray(payload.checkPolicy.checkRequiredCategories), true);
    assert.equal(typeof payload.checkPolicy.approvalRequired, 'boolean');
    assert.equal(typeof payload.checkPolicy.contextVersion, 'string');
    assert.equal(payload.checkPolicy.activeCategories, undefined);
    assert.equal(payload.checkPolicy.knownCategories, undefined);
    assert.equal(payload.checkPolicy.uncategorizedLabels, undefined);
    assert.equal(payload.checkPolicy.acceptedTokens, undefined);
    assert.equal(payload.checkPolicy.tokenPattern, undefined);
    assert.equal(payload.checkPolicy.requireExplanationBeforeApproval, undefined);
    assert.equal(payload.checkPolicy.requiredExplanationFields, undefined);
    assert.equal(typeof payload.approvalRequest?.required, 'boolean');
    assert.equal(typeof payload.approvalRequest?.finalPrompt, 'string');
    assert.equal(Array.isArray(payload.approvalRequest?.userFacingLines), true);
    assert.equal(payload.approvalRequest?.labels, undefined);
    assert.equal(payload.approvalRequest?.approveCommand, undefined);
    assert.equal(payload.approvalRequest?.executeCommand, undefined);
    assert.equal(payload.approvalRequest?.executeRequiresTicket, undefined);
    assert.equal(typeof payload.agentOrchestration?.subAgentHandoff, 'object');
    assert.equal(payload.agentOrchestration?.mode, undefined);
  });
});

test('context --json-compact preserves substate metadata for substate-backed steps', async () => {
  await withTempDir('lsk-context-json-compact-substate-', async (dir) => {
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
      requireCheckCategories: ['docs_commit'],
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

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

    const tasks = `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Approved
- **Repo**: demo
- **Issue**: #
- **Branch**: feat/-alpha
- **PR**: -
- **PR Status**: -

## Task List

- [TODO][P1] T-F001-alpha-01 implement alpha shell

## Completion Criteria

- [ ] done
`;
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const docsGitRoot = path.join(dir, 'docs');
    await runCommand(docsGitRoot, 'git', ['config', 'user.email', 'tester@example.com']);
    await runCommand(docsGitRoot, 'git', ['config', 'user.name', 'Tester']);
    await runCommand(docsGitRoot, 'git', ['add', 'features/F001-alpha']);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare compact context substate case',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, [
      'context',
      'F001-alpha',
      '--json-compact',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 10);
    assert.equal(payload.matchedFeature.currentSubstateId, 'task_run');
    assert.equal(payload.matchedFeature.currentSubstateOwner, 'subagent');
    assert.equal(payload.matchedFeature.currentSubstatePhase, 'run');
    assert.equal(typeof payload.agentOrchestration?.subAgentHandoff, 'object');
    assert.equal(payload.agentOrchestration?.subAgentHandoff?.required, true);
    assert.equal(payload.agentOrchestration?.subAgentHandoff?.mode, 'command');
    assert.match(
      payload.agentOrchestration?.subAgentHandoff?.cmd || '',
      /"task-run"\s+"F001-alpha"\s+"--task"\s+"T-F001-alpha-01"/
    );
    assert.equal(payload.actionOptions[0].taskExecutePhase, 'start');
  });
});

test('context --json-compact exposes manual-boundary auto-run metadata', async () => {
  await withTempDir('lsk-context-json-compact-auto-run-boundary-', async (dir) => {
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

    const result = await runCli(dir, [
      'context',
      'F001-alpha',
      '--json-compact',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.autoRun?.available, false);
    assert.equal(payload.autoRun?.policyEligible, true);
    assert.equal(payload.autoRun?.executableNow, false);
    assert.equal(payload.autoRun?.reasonCode, 'MANUAL_BOUNDARY');
    assert.deepEqual(payload.autoRun?.untilCategories, [
      'spec_approve',
      'plan_approve',
      'tasks_approve',
      'pr_create',
    ]);
    assert.deepEqual(payload.autoRun?.unknownCategories, ['pre_pr_review']);
    assert.deepEqual(payload.autoRun?.manualBoundary, {
      label: 'A',
      category: 'spec_write',
      detail: 'Write or refine spec.md and set status',
    });
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['spec_write', 'user_request_replan'],
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

    assert.equal(payload.matchedFeature.currentStep, 2);
    assert.equal(primaryActionOption(payload).action.category, 'spec_write');
    assert.doesNotMatch(primaryActionOption(payload).detail, /docs get/i);
    assert.doesNotMatch(
      primaryActionOption(payload).approvalPrompt,
      /docs get/i
    );
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

test('context --approve captures user request text for user_request_replan label', async () => {
  await withTempDir('lsk-context-approve-replan-request-', async (dir) => {
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
      requireCheckCategories: ['spec_write', 'user_request_replan'],
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
    const replanOption = contextPayload.actionOptions.find(
      (option) => option.action.category === 'user_request_replan'
    );
    assert.equal(Boolean(replanOption), true);
    assert.equal(replanOption.requiresRequestText, true);
    assert.equal(
      replanOption.replyExample,
      `${replanOption.label}, <your request>`
    );
    assert.match(
      contextPayload.approvalRequest.finalPrompt,
      new RegExp(`${replanOption.label}, <your request>`)
    );

    const requestText = 'API error response format should be unified';
    const approve = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      `${replanOption.label}, ${requestText}`,
      '--json',
    ]);
    assert.equal(approve.code, 0, approve.stderr || approve.stdout);
    const approvePayload = JSON.parse(approve.stdout.trim());
    assert.equal(approvePayload.status, 'approved_selected');
    assert.equal(approvePayload.label, replanOption.label);
    assert.equal(approvePayload.action.category, 'user_request_replan');
    assert.equal(approvePayload.userRequest, requestText);
  });
});

test('context --approve treats free-form reply as user_request_replan when that option exists', async () => {
  await withTempDir('lsk-context-approve-replan-implicit-request-', async (dir) => {
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
      requireCheckCategories: ['spec_write', 'user_request_replan'],
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
    const replanOption = contextPayload.actionOptions.find(
      (option) => option.action.category === 'user_request_replan'
    );
    assert.equal(Boolean(replanOption), true);

    const requestText = 'API error response format should be unified';
    const approve = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      requestText,
      '--json',
    ]);
    assert.equal(approve.code, 0, approve.stderr || approve.stdout);
    const approvePayload = JSON.parse(approve.stdout.trim());
    assert.equal(approvePayload.status, 'approved_selected');
    assert.equal(approvePayload.action.category, 'user_request_replan');
    assert.equal(approvePayload.userRequest, requestText);
  });
});

test('context --approve rejects user_request_replan label without request text', async () => {
  await withTempDir(
    'lsk-context-approve-replan-empty-request-',
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

      const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      config.approval = {
        mode: 'category',
        default: 'skip',
        requireCheckCategories: ['worktree_cleanup'],
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
      const replanOption = contextPayload.actionOptions.find(
        (option) => option.action.category === 'user_request_replan'
      );
      assert.equal(Boolean(replanOption), true);

      const approve = await runCli(dir, [
        'context',
        'F001-alpha',
        '--approve',
        replanOption.label,
        '--json',
      ]);
      assert.equal(approve.code, 1);
      const approvePayload = JSON.parse(approve.stdout.trim());
      assert.equal(approvePayload.reasonCode, 'INVALID_APPROVAL');
    }
  );
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['spec_write', 'user_request_replan'],
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

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

test('context text output hides action labels when approval is not required', async () => {
  await withTempDir(
    'lsk-context-text-no-labels-without-approval-',
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

      const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      config.approval = {
        mode: 'category',
        default: 'skip',
        requireCheckCategories: ['spec_approve'],
      };
      await fs.writeFile(
        configPath,
        JSON.stringify(config, null, 2) + '\n',
        'utf-8'
      );

      const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
      assert.equal(feature.code, 0, feature.stderr || feature.stdout);

      const result = await runCli(dir, ['context', 'F001-alpha']);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /👉 Next Options \(Atomic\):/);
      assert.match(result.stdout, /^\s*-\s+/m);
      assert.doesNotMatch(result.stdout, /^\s*[A-Z]\.\s+/m);
      assert.doesNotMatch(result.stdout, /Available labels now:/);
    }
  );
});

test('context text output summarizes docs commit action instead of raw shell command', async () => {
  await withTempDir('lsk-context-text-commit-summary-', async (dir) => {
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
      requireCheckCategories: ['docs_commit'],
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

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
    tasks = tasks.replace('- **Doc Status**: -', '- **Doc Status**: Approved');
    tasks = tasks.replace(
      '## Task List',
      '## Task List\n\n- [TODO][P1] T-F001-alpha-01 implement alpha shell'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const context = await runCli(dir, ['context', 'F001-alpha']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    assert.match(
      context.stdout,
      /A\.\s+\[CHECK required\]\s+\(docs\)\s+commit:/
    );
    assert.doesNotMatch(context.stdout, /git commit -m/);
  });
});

test('context active DOING task still exposes user_request_replan option', async () => {
  await withTempDir('lsk-context-active-doing-focus-', async (dir) => {
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

    const tasks = `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Approved
- **Repo**: demo
- **Issue**: #
- **Branch**: feat/-alpha
- **PR**: -
- **PR Status**: -

## Task List

- [DOING][P1] T-F001-alpha-01 implement alpha shell

## Completion Criteria

- [ ] done
`;
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 10);
    assert.equal(payload.actionOptions.length >= 2, true);
    assert.equal(primaryActionOption(payload).label, 'A');
    assert.equal(primaryActionOption(payload).action.category, 'task_execute');
    assert.equal(
      payload.actionOptions.some(
        (option) => option.action.category === 'user_request_replan'
      ),
      true
    );

    const approve = await runCli(dir, [
      'context',
      'F001-alpha',
      '--approve',
      'A 수행하세요',
      '--json',
    ]);
    assert.equal(approve.code, 0, approve.stderr || approve.stdout);
    const approvePayload = JSON.parse(approve.stdout.trim());
    assert.equal(approvePayload.status, 'approved_selected');
    assert.equal(approvePayload.label, 'A');
  });
});

test('default spec-first approval skips normal task execution but stops at implementation review', async () => {
  await withTempDir('lsk-context-spec-first-implementation-gate-', async (dir) => {
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

    const todoTasks = `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Approved
- **Repo**: demo
- **Issue**: #
- **Branch**: feat/-alpha
- **PR**: -
- **PR Status**: -

## Task List

- [TODO][P1] T-F001-alpha-01 implement alpha shell

## Completion Criteria

- [ ] All tasks are done
- [ ] Final user approval
`;
    await fs.writeFile(tasksPath, todoTasks, 'utf-8');

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
    const docsAddInitial = await runCommand(docsGitRoot, 'git', [
      'add',
      'features/F001-alpha',
    ]);
    assert.equal(
      docsAddInitial.code,
      0,
      docsAddInitial.stderr || docsAddInitial.stdout
    );
    const docsCommitInitial = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare F001-alpha for task execution',
    ]);
    assert.equal(
      docsCommitInitial.code,
      0,
      docsCommitInitial.stderr || docsCommitInitial.stdout
    );

    const taskRunContext = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(
      taskRunContext.code,
      0,
      taskRunContext.stderr || taskRunContext.stdout
    );
    const taskRunPayload = JSON.parse(taskRunContext.stdout.trim());
    assert.equal(taskRunPayload.matchedFeature.currentStep, 10);
    assert.equal(taskRunPayload.matchedFeature.currentSubstateId, 'task_run');
    assert.equal(primaryActionOption(taskRunPayload).action.category, 'task_execute');
    assert.equal(
      primaryActionOption(taskRunPayload).action.requiresUserCheck,
      false
    );
    assert.equal(taskRunPayload.approvalRequest.required, false);

    const finalizedTasks = `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Approved
- **Repo**: demo
- **Issue**: #
- **Branch**: feat/-alpha
- **PR**: -
- **PR Status**: -

## Task List

- [DONE][P1] T-F001-alpha-01 implement alpha shell

## Completion Criteria

- [ ] All tasks are done
- [ ] Final user approval
`;
    await fs.writeFile(tasksPath, finalizedTasks, 'utf-8');

    const docsAddFinal = await runCommand(docsGitRoot, 'git', [
      'add',
      'features/F001-alpha/tasks.md',
    ]);
    assert.equal(
      docsAddFinal.code,
      0,
      docsAddFinal.stderr || docsAddFinal.stdout
    );
    const docsCommitFinal = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: record completed implementation state',
    ]);
    assert.equal(
      docsCommitFinal.code,
      0,
      docsCommitFinal.stderr || docsCommitFinal.stdout
    );

    const finalizeContext = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(
      finalizeContext.code,
      0,
      finalizeContext.stderr || finalizeContext.stdout
    );
    const finalizePayload = JSON.parse(finalizeContext.stdout.trim());
    assert.equal(finalizePayload.matchedFeature.currentStep, 10);
    assert.equal(finalizePayload.matchedFeature.currentSubstateId, 'task_finalize');
    assert.equal(
      primaryActionOption(finalizePayload).action.category,
      'implementation_approve'
    );
    assert.equal(
      primaryActionOption(finalizePayload).action.requiresUserCheck,
      true
    );
    assert.equal(finalizePayload.approvalRequest.required, true);
    assert.deepEqual(finalizePayload.checkPolicy.checkRequiredCategories, [
      'implementation_approve',
    ]);
  });
});

test('approval.mode=steps still honors taskExecuteCheck=start_only for task completion', async () => {
  await withTempDir('lsk-steps-task-execute-start-only-', async (dir) => {
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
      mode: 'steps',
      requireCheckSteps: [10],
      taskExecuteCheck: 'start_only',
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

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
    const tasks = `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Approved
- **Repo**: demo
- **Issue**: #
- **Branch**: feat/-alpha
- **PR**: -
- **PR Status**: -

## Task List

- [TODO][P1] T-F001-alpha-01 implement alpha shell

## Completion Criteria

- [ ] done
`;
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const docsGitRoot = path.join(dir, 'docs');
    await runCommand(docsGitRoot, 'git', ['config', 'user.email', 'tester@example.com']);
    await runCommand(docsGitRoot, 'git', ['config', 'user.name', 'Tester']);
    await runCommand(docsGitRoot, 'git', ['add', 'features/F001-alpha', '.lee-spec-kit.json']);
    const initialCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare steps-mode task start-only approval test',
    ]);
    assert.equal(initialCommit.code, 0, initialCommit.stderr || initialCommit.stdout);

    const startContext = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(startContext.code, 0, startContext.stderr || startContext.stdout);
    const startPayload = JSON.parse(startContext.stdout.trim());
    assert.equal(primaryActionOption(startPayload).action.requiresUserCheck, true);
    assert.equal(startPayload.matchedFeature.currentSubstateId, 'task_run');

    const doingTasks = tasks.replace(
      '- [TODO][P1] T-F001-alpha-01 implement alpha shell',
      '- [DOING][P1] T-F001-alpha-01 implement alpha shell'
    );
    await fs.writeFile(tasksPath, doingTasks, 'utf-8');
    await runCommand(docsGitRoot, 'git', ['add', 'features/F001-alpha']);
    const doingCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: mark task as doing for steps-mode finish test',
    ]);
    assert.equal(doingCommit.code, 0, doingCommit.stderr || doingCommit.stdout);

    const finishContext = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(finishContext.code, 0, finishContext.stderr || finishContext.stdout);
    const finishPayload = JSON.parse(finishContext.stdout.trim());
    assert.equal(finishPayload.matchedFeature.currentSubstateId, 'task_complete');
    assert.equal(primaryActionOption(finishPayload).action.requiresUserCheck, false);
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
    assert.equal(payload.matchedFeature.currentSubstateId, 'pre_pr_review_run');
    assert.equal(payload.matchedFeature.currentSubstateOwner, 'subagent');
    assert.equal(payload.matchedFeature.currentSubstatePhase, 'run');
    assert.equal(payload.matchedFeature.docs.prePrReviewFieldExists, true);
    assert.equal(payload.matchedFeature.prePrReview.status, 'Pending');
    assert.equal(
      primaryActionOption(payload).action.category,
      'pre_pr_review_run'
    );
    assert.equal(primaryActionOption(payload).action.type, 'command');
    assert.match(
      primaryActionOption(payload).action.cmd || '',
      /\bpre-pr-review-run\b/
    );
    assert.match(
      primaryActionOption(payload).detail,
      /prepare .*pre-PR review handoff|보조 에이전트\(sub-agent\).*PR 전 리뷰 handoff/i
    );
    assert.equal(
      payload.agentOrchestration?.subAgentHandoff?.required,
      true
    );
    assert.equal(payload.agentOrchestration?.subAgentHandoff?.mode, 'command');
    assert.match(
      payload.agentOrchestration?.subAgentHandoff?.cmd || '',
      /\bpre-pr-review-run\b/
    );
    assert.equal(payload.prePrReviewPolicy.enabled, true);
    assert.deepEqual(payload.prePrReviewPolicy.skills, [
      'code-review-excellence',
    ]);
    assert.equal(payload.prePrReviewPolicy.fallback, 'builtin-checklist');
    assert.equal(payload.prePrReviewPolicy.evidenceMode, 'path_required');
    assert.deepEqual(payload.prePrReviewPolicy.decisionEnum, [
      'approve',
      'changes_requested',
      'blocked',
    ]);
    assert.match(
      payload.checkPolicy?.recommendation || '',
      /spawn_agent first.*do not execute the delegated command directly from the main agent/i
    );
    assert.match(
      payload.approvalRequest?.guidance || '',
      /spawn_agent first.*handoff-only.*do not re-approve the same label/i
    );
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
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Evidence**: -\n- **Pre-PR Decision**: -'
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
    assert.equal(payload.matchedFeature.currentSubstateId, 'pre_pr_review_run');
    assert.equal(payload.matchedFeature.currentSubstateOwner, 'subagent');
    assert.equal(payload.matchedFeature.currentSubstatePhase, 'run');
    assert.equal(
      primaryActionOption(payload).action.category,
      'pre_pr_review_run'
    );
    assert.equal(primaryActionOption(payload).action.type, 'command');
    assert.match(primaryActionOption(payload).action.cmd || '', /\bpre-pr-review-run\b/);
  });
});

test('context pre-PR review requires handoff before record when evidence is still missing', async () => {
  await withTempDir('lsk-context-pre-pr-direct-record-any-', async (dir) => {
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
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(feature.code, 0, feature.stderr || feature.stdout);
    await setFeatureAsDone(dir, 'F001-alpha');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Pending'
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const docsGitRoot = path.join(dir, 'docs');
    await runCommand(docsGitRoot, 'git', ['config', 'user.email', 'tester@example.com']);
    await runCommand(docsGitRoot, 'git', ['config', 'user.name', 'Tester']);
    await runCommand(docsGitRoot, 'git', ['add', 'features/F001-alpha', '.lee-spec-kit.json']);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare pre-pr any-mode direct record',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(payload.matchedFeature.currentSubstateId, 'pre_pr_review_run');
    assert.equal(payload.matchedFeature.currentSubstateOwner, 'subagent');
    assert.equal(payload.matchedFeature.currentSubstatePhase, 'run');
    assert.equal(primaryActionOption(payload).action.category, 'pre_pr_review_run');
    assert.equal(primaryActionOption(payload).action.type, 'command');
    assert.match(primaryActionOption(payload).action.cmd || '', /pre-pr-review-run/);
  });
});

test('context pre-PR review requires decision before PR step when review is marked Done', async () => {
  await withTempDir('lsk-context-pre-pr-decision-required-', async (dir) => {
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
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md\n- **Pre-PR Decision**: -'
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
      'docs: require pre-pr decision before pr step',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 12);
    assert.equal(
      primaryActionOption(payload).action.category,
      'pre_pr_review_run'
    );
    assert.equal(primaryActionOption(payload).action.type, 'command');
    assert.match(primaryActionOption(payload).action.cmd || '', /\bpre-pr-review-run\b/);
  });
});

test('context pre-PR review proceeds to PR step when evidence and decision are provided', async () => {
  await withTempDir('lsk-context-pre-pr-evidence-decision-ok-', async (dir) => {
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
    const reportPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'decisions.md'
    );
    await fs.writeFile(reportPath, buildStructuredPrePrEvidence(), 'utf-8');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md\n- **Pre-PR Decision**: decision: approve - baseline checklist completed'
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
      'docs: allow pre-pr step with evidence and decision',
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

test('context pre-PR review accepts docs-prefixed evidence path from docs cwd', async () => {
  await withTempDir('lsk-context-pre-pr-docs-cwd-evidence-path-', async (dir) => {
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
    const reportPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'decisions.md'
    );
    await fs.writeFile(reportPath, buildStructuredPrePrEvidence(), 'utf-8');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace(
      '- **PR Status**: -',
      '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md\n- **Pre-PR Decision**: decision: approve - baseline checklist completed'
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
      'docs: allow docs-prefixed pre-pr evidence path from docs cwd',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(docsGitRoot, ['context', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.matchedFeature.currentStep, 13);
    assert.equal(primaryActionOption(payload).action.category, 'pr_create');
  });
});

test('context pre-PR review requires structured evidence content before PR step', async () => {
  await withTempDir(
    'lsk-context-pre-pr-structured-evidence-required-',
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
      const reportPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'decisions.md'
      );
      await fs.writeFile(reportPath, '# pre-pr review\n', 'utf-8');
      let tasks = await fs.readFile(tasksPath, 'utf-8');
      tasks = tasks.replace(
        '- **PR Status**: -',
        '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md\n- **Pre-PR Decision**: decision: approve - baseline checklist completed'
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
        'docs: require structured pre-pr evidence',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout.trim());
      assert.equal(payload.matchedFeature.currentStep, 12);
      const action = primaryActionOption(payload).action;
      assert.equal(action.category, 'pre_pr_review_run');
      assert.equal(action.type, 'command');
      assert.match(action.cmd || '', /\bpre-pr-review-run\b/);
    }
  );
});

test('context pre-PR review ignores legacy findings config when decision is approve', async () => {
  await withTempDir(
    'lsk-context-pre-pr-legacy-findings-config-',
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
          findings: 'optional',
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
      const reportPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'decisions.md'
      );
      await fs.writeFile(reportPath, buildStructuredPrePrEvidence(), 'utf-8');
      let tasks = await fs.readFile(tasksPath, 'utf-8');
      tasks = tasks.replace(
        '- **PR Status**: -',
        '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md\n- **Pre-PR Decision**: decision: approve - baseline checklist completed'
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
        'docs: ignore legacy pre-pr findings config',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout.trim());
      assert.equal(payload.matchedFeature.currentStep, 13);
      assert.equal(primaryActionOption(payload).action.category, 'pr_create');
    }
  );
});

test('context pre-PR review blocks PR step when decision outcome is not approve', async () => {
  await withTempDir(
    'lsk-context-pre-pr-decision-not-approved-',
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
      const reportPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'decisions.md'
      );
      await fs.writeFile(
        reportPath,
        buildStructuredPrePrEvidence({
          decision: 'changes_requested',
          findings: [
            'src/app/store.ts:88 | severity: medium | fix: required | note: autosave race condition unresolved',
          ],
        }),
        'utf-8'
      );
      let tasks = await fs.readFile(tasksPath, 'utf-8');
      tasks = tasks.replace(
        '- **PR Status**: -',
        '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md\n- **Pre-PR Decision**: decision: changes_requested - follow-up changes required'
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
        'docs: keep pre-pr decision as changes_requested',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const result = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout.trim());
      assert.equal(payload.matchedFeature.currentStep, 12);
      const action = primaryActionOption(payload).action;
      assert.equal(
        action.category,
        'review_fix_commit'
      );
      assert.equal(action.type, 'instruction');
      assert.match(action.message || '', /Current `Pre-PR Decision` is/i);
      assert.match(action.message || '', /fix\(pre-pr\): <pre-pr-fix-summary>/i);
      assert.match(action.message || '', /--decision"\s+"approve/i);
    }
  );
});

test('context uses pre-PR fix commit guidance when project is dirty after changes_requested', async () => {
  await withTempDir(
    'lsk-context-pre-pr-fix-dirty-project-',
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
        '- **PR Status**: -',
        '- **PR Status**: -\n- **Pre-PR Review**: Done\n- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md\n- **Pre-PR Decision**: decision: changes_requested - follow-up changes required'
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
        'docs: set pre-pr decision to changes_requested',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      await fs.writeFile(
        path.join(dir, 'app.js'),
        "console.log('pre-pr review fix');\n",
        'utf-8'
      );

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());
      assert.equal(payload.matchedFeature.currentStep, 11);

      const action = primaryActionOption(payload).action;
      assert.equal(action.type, 'instruction');
      assert.equal(action.category, 'review_fix_commit');
      assert.match(action.message || '', /pre-PR review/i);
      assert.match(action.message || '', /fix\(pre-pr\): <pre-pr-fix-summary>/i);
      assert.doesNotMatch(action.message || '', /fix\(review\):/i);
    }
  );
});

test(
  'context issue_create action requires explicit user check and is instruction-only',
  { timeout: 15_000 },
  async () => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = {
      mode: 'category',
      default: 'require',
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

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
    assert.match(
      primaryActionOption(payload).action.uiDetailKey || '',
      /^context\.actionDetail\.issueCreate/
    );
    assert.notEqual(
      primaryActionOption(payload).detail,
      'Create the issue and sync issue fields in tasks.md'
    );
    assert.doesNotMatch(primaryActionOption(payload).detail, /docs get/i);
    assert.doesNotMatch(
      primaryActionOption(payload).approvalPrompt,
      /docs get/i
    );
    assert.equal(Array.isArray(payload.requiredDocs), true);
    assert.equal(
      payload.requiredDocs.some((doc) => doc.id === 'create-issue'),
      true
    );

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
  }
);

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
      requireMerge: false,
      prePrReview: {
        enabled: false,
      },
    };
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['pr_create'],
    };
    await fs.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      'utf-8'
    );

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
    assert.match(
      primaryActionOption(payload).action.uiDetailKey || '',
      /^context\.actionDetail\.prCreate/
    );
    assert.notEqual(
      primaryActionOption(payload).detail,
      'Create PR and sync PR fields in tasks.md'
    );
    assert.equal(payload.actionOptions.length >= 2, true);
    assert.equal(
      payload.actionOptions.some(
        (option) => option.action.category === 'user_request_replan'
      ),
      true
    );
    assert.match(
      primaryActionOption(payload).action.message,
      /pr\.md|PR 초안|PR title\/body\/labels/i
    );
    assert.match(primaryActionOption(payload).action.message, /Ready/);
    assert.doesNotMatch(primaryActionOption(payload).detail, /docs get/i);
    assert.doesNotMatch(
      primaryActionOption(payload).approvalPrompt,
      /docs get/i
    );
    assert.equal(Array.isArray(payload.requiredDocs), true);
    assert.equal(
      payload.requiredDocs.some((doc) => doc.id === 'create-pr'),
      true
    );
  });
});

test('context shows merge guidance when requireReview=false (requireMerge defaults to true)', async () => {
  await withTempDir(
    'lsk-context-merge-without-review-required-',
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
      config.approval = {
        mode: 'category',
        default: 'skip',
        requireCheckCategories: ['code_review'],
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
        'docs: prepare merge-without-review-required step',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const fakeBinDir = path.join(dir, 'docs', '.fake-bin');
      await fs.mkdir(fakeBinDir, { recursive: true });
      const fakeGhScriptPath = path.join(fakeBinDir, 'gh');
      await fs.writeFile(
        fakeGhScriptPath,
        `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'view') {
  console.log(JSON.stringify({
    state: 'OPEN',
    mergedAt: null,
    reviewDecision: '',
    mergeStateStatus: 'CLEAN',
    isDraft: false,
    statusCheckRollup: [],
  }));
  process.exit(0);
}
process.exit(0);
`,
        'utf-8'
      );
      await fs.chmod(fakeGhScriptPath, 0o755);

      const context = await runCli(dir, ['context', 'F001-alpha', '--json'], {
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
      });
      assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

      assert.equal(payload.matchedFeature.currentStep, 14);
      assert.equal(
        payload.matchedFeature.currentSubstateId,
        'code_review_finalize'
      );
      assert.equal(payload.matchedFeature.currentSubstateOwner, 'main');
      assert.equal(payload.matchedFeature.currentSubstatePhase, 'finalize');
      assert.equal(primaryActionOption(payload).action.category, 'code_review');
      assert.equal(primaryActionOption(payload).action.type, 'command');
      assert.equal(primaryActionOption(payload).action.requiresUserCheck, true);
      assert.equal(primaryActionOption(payload).action.operationType, 'remote');
      assert.equal(
        payload.agentOrchestration?.subAgentHandoff?.required,
        false
      );
      assert.equal(payload.agentOrchestration?.subAgentHandoff?.mode, null);
      assert.equal(payload.agentOrchestration?.subAgentHandoff?.cmd, null);
      assert.match(
        primaryActionOption(payload).action.cmd || '',
        /--merge --confirm OK/
      );
      assert.match(
        primaryActionOption(payload).detail,
        /\(docs\)\s+merge PR after explicit OK/i
      );

      const needsReviewEvidenceOption = payload.actionOptions.find(
        (option) =>
          option.action.type === 'instruction' &&
          option.action.uiDetailKey ===
            'context.actionDetail.codeReviewNeedEvidence'
      );
      assert.equal(Boolean(needsReviewEvidenceOption), false);
    }
  );
});

test('context code_review step delegates review run before evidence is recorded', async () => {
  await withTempDir('lsk-context-code-review-run-delegate-', async (dir) => {
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
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['code_review_run'],
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
      'docs: prepare code review run delegation case',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 14);
    assert.equal(payload.matchedFeature.currentSubstateId, 'code_review_run');
    assert.equal(payload.matchedFeature.currentSubstateOwner, 'subagent');
    assert.equal(payload.matchedFeature.currentSubstatePhase, 'run');
    assert.equal(primaryActionOption(payload).action.category, 'code_review_run');
    assert.equal(primaryActionOption(payload).action.type, 'command');
    assert.equal(primaryActionOption(payload).action.requiresUserCheck, true);
    assert.equal(primaryActionOption(payload).handoffOnly, true);
    assert.equal(primaryActionOption(payload).advancesWorkflow, false);
    assert.equal(
      primaryActionOption(payload).nextMainState,
      'code_review_running'
    );
    assert.equal(payload.agentOrchestration?.subAgentHandoff?.required, true);
    assert.equal(payload.agentOrchestration?.subAgentHandoff?.mode, 'command');
    assert.match(
      payload.agentOrchestration?.subAgentHandoff?.cmd || '',
      /"code-review-run"\s+"F001-alpha"/
    );
    assert.match(
      primaryActionOption(payload).action.cmd || '',
      /"code-review-run"\s+"F001-alpha"/
    );
    assert.match(
      primaryActionOption(payload).detail || '',
      /handoff only.*PR Review Evidence\/Decision|handoff만 준비.*PR Review Evidence\/Decision/i
    );

    const compact = await runCli(dir, [
      'context',
      'F001-alpha',
      '--json-compact',
    ]);
    assert.equal(compact.code, 0, compact.stderr || compact.stdout);
    const compactPayload = JSON.parse(compact.stdout.trim());
    assert.equal(compactPayload.actionOptions?.[0]?.category, 'code_review_run');
    assert.equal(compactPayload.actionOptions?.[0]?.handoffOnly, true);
    assert.equal(compactPayload.actionOptions?.[0]?.advancesWorkflow, false);
    assert.equal(
      compactPayload.actionOptions?.[0]?.nextMainState,
      'code_review_running'
    );
  });
});

test('status --json includes substate metadata for review-run workflow states', async () => {
  await withTempDir('lsk-status-substate-review-run-', async (dir) => {
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
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['code_review'],
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
      'docs: prepare status substate review run case',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['status', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.features[0].step, 14);
    assert.equal(payload.features[0].substate, 'code_review_run');
    assert.equal(payload.features[0].substateOwner, 'subagent');
    assert.equal(payload.features[0].substatePhase, 'run');
    assert.equal(typeof payload.features[0].nextAction, 'string');
  });
});

test('view shows substate details for review-run workflow states', async () => {
  await withTempDir('lsk-view-substate-review-run-', async (dir) => {
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
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['code_review'],
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
      'docs: prepare view substate review run case',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, ['view', 'F001-alpha']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /- Step: 14/);
    assert.match(result.stdout, /- Substate: code_review_run/);
    assert.match(result.stdout, /- Owner: subagent/);
    assert.match(result.stdout, /- Phase: run/);
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
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['code_review'],
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
    tasks = tasks.replace(
      '- **PR Status**: Review',
      '- **PR Status**: Review\n- **PR Review Evidence**: summary: reviewed latest comments and validated current state\n- **PR Review Decision**: decision: keep review status until merge gate passes'
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

    const fakeBinDir = path.join(dir, 'docs', '.fake-bin');
    await fs.mkdir(fakeBinDir, { recursive: true });
    const fakeGhScriptPath = path.join(fakeBinDir, 'gh');
    await fs.writeFile(
      fakeGhScriptPath,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'view') {
  console.log(JSON.stringify({
    state: 'OPEN',
    mergedAt: null,
    reviewDecision: '',
    mergeStateStatus: 'CLEAN',
    isDraft: false,
    statusCheckRollup: [],
  }));
  process.exit(0);
}
process.exit(0);
`,
      'utf-8'
    );
    await fs.chmod(fakeGhScriptPath, 0o755);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json'], {
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
    });
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 14);
    assert.equal(primaryActionOption(payload).action.category, 'code_review');
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.equal(primaryActionOption(payload).action.requiresUserCheck, true);
    assert.equal(primaryActionOption(payload).action.operationType, 'remote');
    assert.equal(
      primaryActionOption(payload).action.uiDetailKey,
      'context.actionDetail.codeReviewResolve'
    );
    assert.notEqual(
      primaryActionOption(payload).detail,
      'Address review feedback and update PR review fields'
    );
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
        /--merge --confirm OK/.test(option.action.cmd || '')
    );
    assert.equal(Boolean(mergeOption), true);
    assert.equal(mergeOption.action.scope, 'docs');
    assert.match(mergeOption.detail, /\(docs\)\s+merge PR after explicit OK/i);
    assert.doesNotMatch(mergeOption.detail, /--merge --confirm OK/);
    const pushOption = payload.actionOptions.find(
      (option) =>
        option.action.type === 'command' &&
        option.action.category === 'code_review' &&
        /\bgit\s+push\b/.test(option.action.cmd || '')
    );
    assert.equal(Boolean(pushOption), false);
    assert.match(
      primaryActionOption(payload).action.message,
      /Review and analyze comments|리뷰 코멘트/
    );
    assert.doesNotMatch(
      primaryActionOption(payload).action.message,
      /Review → Approved/
    );
  });
});

test('context code_review step shows push option only when local branch is ahead of upstream', async () => {
  await withTempDir(
    'lsk-context-code-review-push-only-when-ahead-',
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
      config.approval = {
        mode: 'category',
        default: 'require',
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
      tasks = tasks.replace(
        '- **PR Status**: Review',
        '- **PR Status**: Review\n- **PR Review Evidence**: summary: reviewed comments and synced expected behavior\n- **PR Review Decision**: decision: push review-fix commits before merge'
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
        'docs: prepare code-review ahead-of-upstream case',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const realGit = await runCommand(dir, 'which', ['git']);
      assert.equal(realGit.code, 0, realGit.stderr || realGit.stdout);
      const realGitPath = realGit.stdout.trim().split('\n').pop();
      assert.equal(Boolean(realGitPath), true);

      const fakeBinDir = path.join(dir, 'docs', '.fake-bin');
      await fs.mkdir(fakeBinDir, { recursive: true });
      const fakeGhScriptPath = path.join(fakeBinDir, 'gh');
      const fakeGitScriptPath = path.join(fakeBinDir, 'git');
      await fs.writeFile(
        fakeGhScriptPath,
        `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'view') {
  console.log(JSON.stringify({
    state: 'OPEN',
    mergedAt: null,
    reviewDecision: '',
    mergeStateStatus: 'CLEAN',
    isDraft: false,
    statusCheckRollup: [],
  }));
  process.exit(0);
}
process.exit(0);
`,
        'utf-8'
      );
      await fs.chmod(fakeGhScriptPath, 0o755);
      await fs.writeFile(
        fakeGitScriptPath,
        `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (
  args[0] === 'rev-list' &&
  args[1] === '--left-right' &&
  args[2] === '--count' &&
  args[3] === 'HEAD...@{upstream}'
) {
  process.stdout.write('1 0\\n');
  process.exit(0);
}

const realGit = process.env.REAL_GIT || 'git';
const result = spawnSync(realGit, args, { encoding: 'utf-8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
`,
        'utf-8'
      );
      await fs.chmod(fakeGitScriptPath, 0o755);

      const context = await runCli(dir, ['context', 'F001-alpha', '--json'], {
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
        REAL_GIT: realGitPath,
      });
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());

      const pushOption = payload.actionOptions.find(
        (option) =>
          option.action.type === 'command' &&
          option.action.category === 'code_review' &&
          /\bgit\s+push\b/.test(option.action.cmd || '')
      );
      assert.equal(Boolean(pushOption), true);
      assert.match(pushOption.detail, /\(project\)\s+push review-fix commits/i);
      assert.equal(payload.matchedFeature.git.projectBranchAhead > 0, true);
    }
  );
});

test('context code_review prefers evidence recording over rerun when local review-fix commits already exist', async () => {
  await withTempDir(
    'lsk-context-code-review-ahead-needs-evidence-',
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
      config.approval = {
        mode: 'category',
        default: 'skip',
        requireCheckCategories: ['pr_status_update'],
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
        'docs: prepare review-fix evidence follow-up case',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const realGit = await runCommand(dir, 'which', ['git']);
      assert.equal(realGit.code, 0, realGit.stderr || realGit.stdout);
      const realGitPath = realGit.stdout.trim().split('\n').pop();
      assert.equal(Boolean(realGitPath), true);

      const fakeBinDir = path.join(dir, 'docs', '.fake-bin');
      await fs.mkdir(fakeBinDir, { recursive: true });
      const fakeGhScriptPath = path.join(fakeBinDir, 'gh');
      const fakeGitScriptPath = path.join(fakeBinDir, 'git');
      await fs.writeFile(
        fakeGhScriptPath,
        `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'view') {
  console.log(JSON.stringify({
    state: 'OPEN',
    mergedAt: null,
    reviewDecision: '',
    mergeStateStatus: 'CLEAN',
    isDraft: false,
    statusCheckRollup: [],
  }));
  process.exit(0);
}
process.exit(0);
`,
        'utf-8'
      );
      await fs.chmod(fakeGhScriptPath, 0o755);
      await fs.writeFile(
        fakeGitScriptPath,
        `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (
  args[0] === 'rev-list' &&
  args[1] === '--left-right' &&
  args[2] === '--count' &&
  args[3] === 'HEAD...@{upstream}'
) {
  process.stdout.write('1 0\\n');
  process.exit(0);
}

const realGit = process.env.REAL_GIT || 'git';
const result = spawnSync(realGit, args, { encoding: 'utf-8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
`,
        'utf-8'
      );
      await fs.chmod(fakeGitScriptPath, 0o755);

      const context = await runCli(dir, ['context', 'F001-alpha', '--json'], {
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
        REAL_GIT: realGitPath,
      });
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());

      assert.equal(payload.matchedFeature.git.projectBranchAhead > 0, true);
      assert.notEqual(payload.matchedFeature.currentSubstateId, 'code_review_run');
      assert.equal(primaryActionOption(payload).action.category, 'code_review');
      assert.equal(
        primaryActionOption(payload).action.uiDetailKey,
        'context.actionDetail.codeReviewNeedEvidence'
      );
    }
  );
});

test('context code_review step requires summary format in PR Review Evidence', async () => {
  await withTempDir(
    'lsk-context-code-review-evidence-summary-required-',
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
      config.approval = {
        mode: 'category',
        default: 'skip',
        requireCheckCategories: ['pr_status_update'],
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
      tasks = tasks.replace(
        '- **PR Status**: Review',
        '- **PR Status**: Review\n- **PR Review Evidence**: fixed button spacing and contrast issues\n- **PR Review Decision**: decision: reflected all requested UI fixes'
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
        'docs: prepare code-review evidence summary required case',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());
      assert.equal(payload.matchedFeature.currentStep, 14);
      assert.equal(primaryActionOption(payload).action.category, 'code_review');
      assert.equal(
        primaryActionOption(payload).action.uiDetailKey,
        'context.actionDetail.codeReviewNeedEvidence'
      );
      assert.match(
        primaryActionOption(payload).action.message,
        /summary:\s*\.\.\.|요약:\s*\.\.\./i
      );
      const mergeOption = payload.actionOptions.find(
        (option) =>
          option.action.type === 'command' &&
          option.action.category === 'code_review' &&
          /--merge --confirm OK/.test(option.action.cmd || '')
      );
      assert.equal(Boolean(mergeOption), false);
    }
  );
});

test('context code_review rejects placeholder summary even when structured prefix is present', async () => {
  await withTempDir(
    'lsk-context-code-review-evidence-summary-placeholder-',
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
        requireCheckCategories: ['worktree_cleanup'],
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
        '- **PR**: -',
        '- **PR**: https://github.com/acme/repo/pull/77'
      );
      tasks = tasks.replace(
        '- **PR Status**: -',
        '- **PR Status**: Review\n- **PR Review Evidence**: summary: TBD\n- **PR Review Decision**: decision: reflected all requested UI fixes'
      );
      await fs.writeFile(tasksPath, tasks, 'utf-8');

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());
      assert.equal(payload.matchedFeature.prReview.evidenceProvided, false);
    }
  );
});

test('context code_review rejects placeholder decision even when structured prefix is present', async () => {
  await withTempDir(
    'lsk-context-code-review-decision-placeholder-',
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
        'github',
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
      let tasks = await fs.readFile(tasksPath, 'utf-8');
      tasks = tasks.replace(
        '- **PR**: -',
        '- **PR**: https://github.com/acme/repo/pull/77'
      );
      tasks = tasks.replace(
        '- **PR Status**: -',
        '- **PR Status**: Review\n- **PR Review Evidence**: summary: reviewed latest comments and validated current state\n- **PR Review Decision**: decision: TBD'
      );
      await fs.writeFile(tasksPath, tasks, 'utf-8');

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());
      assert.equal(payload.matchedFeature.prReview.decisionProvided, false);
    }
  );
});

test('context code_review evidence path must include PR Review Log section', async () => {
  await withTempDir(
    'lsk-context-code-review-evidence-path-log-required-',
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
      config.approval = {
        mode: 'category',
        default: 'skip',
        requireCheckCategories: ['pr_status_update'],
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
      const decisionsPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'decisions.md'
      );
      await fs.writeFile(
        decisionsPath,
        '## Decision Log (general)\n\n- **Summary**: task-level decision only\n- **Decision**: decision: pick simpler api shape\n',
        'utf-8'
      );
      let tasks = await fs.readFile(tasksPath, 'utf-8');
      tasks = tasks.replace(
        '- **PR**: -',
        '- **PR**: https://github.com/acme/repo/pull/77'
      );
      tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
      tasks = tasks.replace(
        '- **PR Status**: Review',
        '- **PR Status**: Review\n- **PR Review Evidence**: docs/features/F001-alpha/decisions.md\n- **PR Review Decision**: decision: reflected all requested UI fixes'
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
        'docs: require pr-review log section for evidence path',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());
      assert.equal(payload.matchedFeature.prReview.evidenceProvided, false);
      assert.equal(primaryActionOption(payload).action.category, 'code_review');
      assert.equal(
        primaryActionOption(payload).action.uiDetailKey,
        'context.actionDetail.codeReviewNeedEvidence'
      );
    }
  );
});

test('context code_review accepts PR Review Log evidence path in decisions.md', async () => {
  await withTempDir(
    'lsk-context-code-review-evidence-path-log-ok-',
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
      config.approval = {
        mode: 'category',
        default: 'require',
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
      const decisionsPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'decisions.md'
      );
      await fs.writeFile(decisionsPath, buildPrReviewLog(), 'utf-8');
      let tasks = await fs.readFile(tasksPath, 'utf-8');
      tasks = tasks.replace(
        '- **PR**: -',
        '- **PR**: https://github.com/acme/repo/pull/77'
      );
      tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
      tasks = tasks.replace(
        '- **PR Status**: Review',
        '- **PR Status**: Review\n- **PR Review Evidence**: docs/features/F001-alpha/decisions.md\n- **PR Review Decision**: decision: reflected all requested UI fixes'
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
        'docs: allow pr-review evidence path with pr review log',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());
      assert.equal(payload.matchedFeature.prReview.evidenceProvided, true);
      assert.notEqual(
        primaryActionOption(payload).action.uiDetailKey,
        'context.actionDetail.codeReviewNeedEvidence'
      );
    }
  );
});

test(
  'context code_review step asks PR status sync when remote PR is already merged',
  { timeout: 15_000 },
  async () => {
  await withTempDir(
    'lsk-context-code-review-merged-sync-status-',
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
      config.approval = {
        mode: 'category',
        default: 'require',
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
      tasks = tasks.replace(
        '- **PR Status**: Review',
        '- **PR Status**: Review\n- **PR Review Evidence**: summary: merged remotely\n- **PR Review Decision**: decision: sync local PR status to Approved'
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
        'docs: prepare merged-review sync case',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const fakeBinDir = path.join(dir, 'docs', '.fake-bin');
      await fs.mkdir(fakeBinDir, { recursive: true });
      const fakeGhScriptPath = path.join(fakeBinDir, 'gh');
      await fs.writeFile(
        fakeGhScriptPath,
        `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'view') {
  console.log(JSON.stringify({
    state: 'MERGED',
    mergedAt: '2026-02-17T00:40:35Z',
    reviewDecision: '',
    mergeStateStatus: 'UNKNOWN',
    isDraft: false,
    statusCheckRollup: [],
  }));
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'merge') {
  console.log('merged');
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'create') {
  console.log('https://github.com/acme/repo/pull/77');
  process.exit(0);
}
if (args[0] === 'issue' && args[1] === 'create') {
  console.log('https://github.com/acme/repo/issues/123');
  process.exit(0);
}
process.exit(0);
`,
        'utf-8'
      );
      await fs.chmod(fakeGhScriptPath, 0o755);

      const context = await runCli(dir, ['context', 'F001-alpha', '--json'], {
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
      });
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());

      assert.equal(payload.matchedFeature.currentStep, 14);
      assert.equal(
        primaryActionOption(payload).action.category,
        'pr_status_update'
      );
      assert.equal(primaryActionOption(payload).action.type, 'instruction');
      assert.equal(primaryActionOption(payload).action.requiresUserCheck, true);
      assert.equal(
        primaryActionOption(payload).action.uiDetailKey,
        'context.actionDetail.prStatusUpdateSyncApproved'
      );
      assert.notEqual(
        primaryActionOption(payload).detail,
        'Sync PR status in tasks.md with remote status'
      );
      assert.match(
        primaryActionOption(payload).action.message,
        /already merged/i
      );
      assert.equal(
        payload.actionOptions.some((option) =>
          /git push|--merge --confirm OK/.test(option?.action?.cmd || '')
        ),
        false
      );
    }
  );
  }
);

test(
  'context code_review step blocks merge guidance when remote PR is closed without merge',
  { timeout: 15_000 },
  async () => {
  await withTempDir('lsk-context-code-review-closed-pr-', async (dir) => {
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
    tasks = tasks.replace(
      '- **PR Status**: Review',
      '- **PR Status**: Review\n- **PR Review Evidence**: summary: remote PR is closed without merge\n- **PR Review Decision**: decision: reopen or recreate PR before merge'
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
      'docs: prepare closed-pr review case',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const fakeBinDir = path.join(dir, 'docs', '.fake-bin');
    await fs.mkdir(fakeBinDir, { recursive: true });
    const fakeGhScriptPath = path.join(fakeBinDir, 'gh');
    await fs.writeFile(
      fakeGhScriptPath,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'view') {
  console.log(JSON.stringify({
    state: 'CLOSED',
    mergedAt: null,
    reviewDecision: '',
    mergeStateStatus: 'UNKNOWN',
    isDraft: false,
    statusCheckRollup: [],
  }));
  process.exit(0);
}
process.exit(0);
`,
      'utf-8'
    );
    await fs.chmod(fakeGhScriptPath, 0o755);

    const context = await runCli(dir, ['context', 'F001-alpha', '--json'], {
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
    });
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const payload = JSON.parse(context.stdout.trim());

    assert.equal(payload.matchedFeature.currentStep, 14);
    assert.equal(primaryActionOption(payload).action.category, 'code_review');
    assert.equal(primaryActionOption(payload).action.type, 'instruction');
    assert.match(
      primaryActionOption(payload).action.message,
      /review\/analyze|review/i
    );
    const blocked = payload.actionOptions.find(
      (option) =>
        option.action.type === 'instruction' &&
        option.action.category === 'code_review' &&
        /closed without merge|닫혀 있습니다/i.test(option.action.message || '')
    );
    assert.equal(Boolean(blocked), true);
    assert.equal(
      payload.actionOptions.some((option) =>
        /--merge --confirm OK/.test(option?.action?.cmd || '')
      ),
      false
    );
  });
  }
);

test('context code_review step hides merge guidance when remote status is unavailable', async () => {
  await withTempDir(
    'lsk-context-code-review-remote-unavailable-',
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
      tasks = tasks.replace(
        '- **PR Status**: Review',
        '- **PR Status**: Review\n- **PR Review Evidence**: summary: remote state unavailable during check\n- **PR Review Decision**: decision: verify gh auth/network then re-check'
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
        'docs: prepare remote-unavailable review case',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const fakeBinDir = path.join(dir, 'docs', '.fake-bin');
      await fs.mkdir(fakeBinDir, { recursive: true });
      const fakeGhScriptPath = path.join(fakeBinDir, 'gh');
      await fs.writeFile(
        fakeGhScriptPath,
        `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'view') {
  process.exit(1);
}
process.exit(0);
`,
        'utf-8'
      );
      await fs.chmod(fakeGhScriptPath, 0o755);

      const context = await runCli(dir, ['context', 'F001-alpha', '--json'], {
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
      });
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());

      assert.equal(payload.matchedFeature.currentStep, 14);
      assert.equal(primaryActionOption(payload).action.category, 'code_review');
      assert.equal(primaryActionOption(payload).action.type, 'instruction');
      const blocked = payload.actionOptions.find(
        (option) =>
          option.action.type === 'instruction' &&
          option.action.category === 'code_review' &&
          /could not be verified|확인하지 못했습니다/i.test(
            option.action.message || ''
          )
      );
      assert.equal(Boolean(blocked), true);
      assert.equal(
        payload.actionOptions.some((option) =>
          /--merge --confirm OK/.test(option?.action?.cmd || '')
        ),
        false
      );
    }
  );
});

test('context uses review-fix commit guidance when project is dirty during PR review', async () => {
  await withTempDir(
    'lsk-context-code-review-dirty-commit-guidance-',
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

      await fs.writeFile(
        path.join(dir, 'app.js'),
        "console.log('review fix');\n",
        'utf-8'
      );

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());

      assert.equal(payload.matchedFeature.currentStep, 11);
      assert.equal(payload.matchedFeature.currentSubstateId, 'review_fix_loop');
      assert.equal(payload.matchedFeature.currentSubstateOwner, 'main');
      assert.equal(payload.matchedFeature.currentSubstatePhase, 'commit_pending');
      assert.equal(primaryActionOption(payload).action.type, 'instruction');
      assert.equal(
        primaryActionOption(payload).action.category,
        'review_fix_commit'
      );
      assert.match(
        primaryActionOption(payload).action.message,
        /review fixes/i
      );
      assert.match(
        primaryActionOption(payload).action.message,
        /fix\(review\): <review-fix-summary>/i
      );
      assert.doesNotMatch(
        primaryActionOption(payload).action.message,
        /feat\(/i
      );
      assert.equal(
        payload.requiredDocs.some((doc) => doc.id === 'create-pr'),
        true
      );
      assert.equal(
        payload.requiredDocs.some((doc) => doc.id === 'git-workflow'),
        true
      );
    }
  );
});

test(
  'context keeps cleanup as the primary action before declaring workflow done for managed worktrees',
  { timeout: 15_000 },
  async () => {
  await withTempDir(
    'lsk-context-feature-done-worktree-cleanup-',
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

      const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      config.approval = {
        mode: 'category',
        default: 'require',
      };
      await fs.writeFile(
        configPath,
        JSON.stringify(config, null, 2) + '\n',
        'utf-8'
      );

      const feature = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
      assert.equal(feature.code, 0, feature.stderr || feature.stdout);
      await setFeatureAsDone(dir, 'F001-alpha');

      const specPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'spec.md'
      );
      const tasksPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'tasks.md'
      );

      let spec = await fs.readFile(specPath, 'utf-8');
      spec = spec.replace('- **Issue Number**: #', '- **Issue Number**: 123');
      await fs.writeFile(specPath, spec, 'utf-8');

      let tasks = await fs.readFile(tasksPath, 'utf-8');
      tasks = tasks.replace('- **Issue**: #', '- **Issue**: 123');
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
        'docs: sync issue number for worktree cleanup test',
      ]);
      assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

      const worktreeRelativePath = path.join('.worktrees', 'feat-123-alpha');
      const worktreePath = path.join(dir, worktreeRelativePath);
      const addWorktree = await runCommand(dir, 'git', [
        'worktree',
        'add',
        '-b',
        'feat/123-alpha',
        worktreeRelativePath,
      ]);
      assert.equal(
        addWorktree.code,
        0,
        addWorktree.stderr || addWorktree.stdout
      );
      assert.equal(await pathExists(worktreePath), true);

      const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(context.code, 0, context.stderr || context.stdout);
      const payload = JSON.parse(context.stdout.trim());

      assert.equal(payload.matchedFeature.currentStep, 15);
      assert.equal(payload.matchedFeature.completion.workflowDone, false);
      assert.equal(payload.matchedFeature.completion.cleanupPending, true);
      assert.equal(
        primaryActionOption(payload).action.category,
        'worktree_cleanup'
      );
      const cleanupOption = payload.actionOptions.find(
        (option) => option.action.category === 'worktree_cleanup'
      );
      assert.equal(Boolean(cleanupOption), true);
      assert.equal(
        payload.actionOptions.some(
          (option) => option.action.category === 'feature_done'
        ),
        false
      );
      assert.equal(cleanupOption.action.type, 'command');
      assert.equal(cleanupOption.action.scope, 'project');
      assert.match(cleanupOption.detail, /worktree/i);
      assert.match(cleanupOption.action.cmd, /git worktree remove/);
      assert.match(cleanupOption.action.cmd, /git worktree remove --force/);
      assert.match(cleanupOption.action.cmd, /git worktree list --porcelain/);
      assert.match(cleanupOption.action.cmd, /rm -rf/);

      const expectedRoot = await normalizePathForCompare(dir);
      const actualRoot = await normalizePathForCompare(
        cleanupOption.action.cwd
      );
      assert.equal(actualRoot, expectedRoot);

      const approve = await runCli(dir, [
        'context',
        'F001-alpha',
        '--approve',
        cleanupOption.label,
        '--json',
      ]);
      assert.equal(approve.code, 0, approve.stderr || approve.stdout);
      const approvePayload = JSON.parse(approve.stdout.trim());
      assert.equal(approvePayload.action.category, 'worktree_cleanup');
      assert.equal(typeof approvePayload?.approvalTicket?.token, 'string');

      const execute = await runCli(dir, [
        'context',
        'F001-alpha',
        '--approve',
        cleanupOption.label,
        '--execute',
        '--ticket',
        approvePayload.approvalTicket.token,
        '--json',
      ]);
      assert.equal(execute.code, 0, execute.stderr || execute.stdout);
      assert.equal(await pathExists(worktreePath), false);

      const refreshed = await runCli(dir, ['context', 'F001-alpha', '--json']);
      assert.equal(refreshed.code, 0, refreshed.stderr || refreshed.stdout);
      const refreshedPayload = JSON.parse(refreshed.stdout.trim());
      assert.equal(refreshedPayload.matchedFeature.completion.workflowDone, true);
      assert.equal(refreshedPayload.matchedFeature.completion.cleanupPending, false);
      assert.equal(
        refreshedPayload.actionOptions.some(
          (option) => option.action.category === 'worktree_cleanup'
        ),
        false
      );
    }
  );
  }
);

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

test('status --json does not mark cleanup-pending managed worktrees as workflow done', async () => {
  await withTempDir('lsk-status-workflow-cleanup-pending-', async (dir) => {
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

    const specPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'spec.md'
    );
    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );

    let spec = await fs.readFile(specPath, 'utf-8');
    spec = spec.replace('- **Issue Number**: #', '- **Issue Number**: 123');
    await fs.writeFile(specPath, spec, 'utf-8');

    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: 123');
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
      'docs: F001-alpha done before cleanup',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const addWorktree = await runCommand(dir, 'git', [
      'worktree',
      'add',
      '-b',
      'feat/123-alpha',
      path.join('.worktrees', 'feat-123-alpha'),
    ]);
    assert.equal(
      addWorktree.code,
      0,
      addWorktree.stderr || addWorktree.stdout
    );

    const context = await runCli(dir, ['context', 'F001-alpha', '--json']);
    assert.equal(context.code, 0, context.stderr || context.stdout);
    const contextPayload = JSON.parse(context.stdout.trim());
    assert.equal(contextPayload.matchedFeature.completion.workflowDone, false);
    assert.equal(contextPayload.matchedFeature.completion.cleanupPending, true);

    const result = await runCli(dir, ['status', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.counts.workflowDone, 0);
    assert.equal(payload.counts.implementationDone, 1);
    assert.equal(payload.features[0].status, 'DONE');
  });
});

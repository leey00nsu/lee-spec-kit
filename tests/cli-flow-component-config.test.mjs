import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

test('view --json returns NO_FEATURES on initialized empty docs', async () => {
  await withTempDir('lsk-view-json-', async (dir) => {
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

    const result = await runCli(dir, ['view', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'NO_FEATURES');
    assert.equal(payload.counts.features, 0);
  });
});

test('flow --json aggregates context/status/doctor', async () => {
  await withTempDir('lsk-flow-json-', async (dir) => {
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

    const result = await runCli(dir, ['flow', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.context.before.reasonCode, 'NO_FEATURES');
    assert.equal(payload.statusReport.reasonCode, 'NO_FEATURES');
    assert.equal(payload.doctorReport.status, 'warn');
    assert.equal(
      payload.agentOrchestration?.mode,
      'main_orchestrates_subagent_execution'
    );
    assert.equal(
      payload.agentOrchestration?.delegationPolicy,
      'prefer_main_delegate_long_running_fallback_main'
    );
    assert.equal(
      payload.agentOrchestration?.delegateCommandExecution,
      'long_running_only'
    );
    assert.equal(payload.agentOrchestration?.delegateAutoRunExecution, true);
    assert.equal(
      payload.agentOrchestration?.fallbackToMainAgentWhenSubAgentUnavailable,
      true
    );
    assert.equal(
      Array.isArray(payload.agentOrchestration?.longRunningCategories),
      true
    );
    assert.equal(
      payload.agentOrchestration?.longRunningCategories?.includes('task_execute'),
      true
    );
    assert.equal(payload.agentOrchestration?.preferredResumeCommand, null);
  });
});

test('flow --json-compact returns reduced payload for agents', async () => {
  await withTempDir('lsk-flow-json-compact-', async (dir) => {
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

    const result = await runCli(dir, ['flow', 'F001-alpha', '--json-compact']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.schema, 'flow.v2.compact');
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.context?.before?.matchedFeature?.ref, 'F001-alpha');
    assert.equal(payload.context?.before?.matchedFeature?.path, undefined);
    assert.equal(payload.context?.before?.matchedFeature?.git, undefined);
    assert.equal(Array.isArray(payload.context?.before?.actionOptions), true);
    assert.equal(payload.context?.before?.actionOptions?.[0]?.action, undefined);
    assert.equal(typeof payload.statusReport?.status, 'string');
    assert.equal(typeof payload.doctorReport?.status, 'string');
  });
});

test('flow --json auto-until-category stops at gate and exposes approval lines', async () => {
  await withTempDir('lsk-flow-auto-until-gate-', async (dir) => {
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

    const result = await runCli(dir, [
      'flow',
      'F001-alpha',
      '--auto-until-category',
      'spec_write',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.autoRun?.enabled, true);
    assert.equal(payload.autoRun?.status, 'gate_reached');
    assert.equal(payload.autoRun?.reasonCode, 'AUTO_GATE_REACHED');
    assert.deepEqual(payload.autoRun?.untilCategories, ['spec_write']);
    assert.equal(payload.autoRun?.gate?.category, 'spec_write');
    assert.equal(Array.isArray(payload.autoRun?.gate?.userFacingLines), true);
    assert.equal(payload.autoRun?.gate?.userFacingLines?.length > 0, true);
    assert.match(payload.autoRun.gate.userFacingLines[0], /^[A-Z]+:\s+/);
    assert.equal(payload.autoRun?.executions?.length, 0);
    assert.equal(payload.autoRun?.resume?.requiresFreshContext, true);
    assert.equal(payload.autoRun?.resume?.requestPending, false);
    assert.match(
      payload.autoRun?.resume?.flowCommand || '',
      /npx lee-spec-kit flow F001-alpha --auto-until-category spec_write/
    );
    assert.match(
      payload.autoRun?.resume?.contextCommand || '',
      /npx lee-spec-kit context F001-alpha/
    );
    assert.equal(
      payload.agentOrchestration?.preferredResumeCommand,
      payload.autoRun?.resume?.flowCommand
    );
  });
});

test('flow --json auto-until-category applies --request via user_request_replan first', async () => {
  await withTempDir('lsk-flow-auto-until-request-', async (dir) => {
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

    const result = await runCli(dir, [
      'flow',
      'F001-alpha',
      '--request',
      'issue 004를 F004로 승격시켜서 진행해',
      '--auto-until-category',
      'spec_write',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.autoRun?.status, 'gate_reached');
    assert.equal(payload.autoRun?.executions?.length > 0, true);
    assert.equal(payload.autoRun.executions[0].kind, 'request');
    assert.equal(payload.autoRun.executions[0].category, 'user_request_replan');
    assert.equal(payload.autoRun.executions[0].approveStatus, 'approved_selected');
  });
});

test('flow --json --start-auto emits resumable run metadata', async () => {
  await withTempDir('lsk-flow-auto-start-run-', async (dir) => {
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

    const result = await runCli(dir, [
      'flow',
      'F001-alpha',
      '--auto-until-category',
      'spec_write',
      '--start-auto',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.autoRun?.run?.mode, 'started');
    assert.equal(payload.autoRun?.run?.status, 'paused');
    assert.equal(typeof payload.autoRun?.run?.runId, 'string');
    assert.equal((payload.autoRun?.run?.runId || '').length > 0, true);
    assert.match(
      payload.autoRun?.run?.resumeCommand || '',
      /npx lee-spec-kit flow --resume [A-Za-z0-9_-]+/
    );
  });
});

test('flow --resume <run-id> reuses stored auto checkpoint', async () => {
  await withTempDir('lsk-flow-auto-resume-run-', async (dir) => {
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

    const first = await runCli(dir, [
      'flow',
      'F001-alpha',
      '--auto-until-category',
      'spec_write',
      '--start-auto',
      '--json',
    ]);
    assert.equal(first.code, 0, first.stderr || first.stdout);
    const firstPayload = JSON.parse(first.stdout.trim());
    const runId = firstPayload.autoRun?.run?.runId || '';
    assert.equal(typeof runId, 'string');
    assert.equal(runId.length > 0, true);

    const resumed = await runCli(dir, [
      'flow',
      '--resume',
      runId,
      '--json',
    ]);
    assert.equal(resumed.code, 0, resumed.stderr || resumed.stdout);
    const resumedPayload = JSON.parse(resumed.stdout.trim());
    assert.equal(resumedPayload.autoRun?.run?.mode, 'resumed');
    assert.equal(resumedPayload.autoRun?.run?.runId, runId);
    assert.equal(resumedPayload.autoRun?.status, 'gate_reached');
    assert.deepEqual(resumedPayload.autoRun?.untilCategories, ['spec_write']);
  });
});

test('flow --json auto-preset pr-handoff resolves categories and enters auto mode', async () => {
  await withTempDir('lsk-flow-auto-preset-', async (dir) => {
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

    const result = await runCli(dir, [
      'flow',
      'F001-alpha',
      '--auto-preset',
      'pr-handoff',
      '--json',
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'AUTO_MANUAL_REQUIRED');
    assert.equal(payload.autoRun?.enabled, true);
    assert.equal(payload.autoRun?.status, 'manual_required');
    assert.equal(payload.autoRun?.preset, 'pr-handoff');
    assert.equal(payload.autoRun?.source, 'flag:--auto-preset');
    assert.deepEqual(payload.autoRun?.untilCategories, [
      'pr_create',
      'code_review',
      'pr_status_update',
    ]);
    assert.equal(payload.autoRun?.resume?.requiresFreshContext, true);
    assert.equal(payload.autoRun?.resume?.requestPending, false);
    assert.match(
      payload.autoRun?.resume?.flowCommand || '',
      /--auto-until-category '?pr_create,code_review,pr_status_update'?/
    );
  });
});

test('flow --json --request uses workflow.auto.defaultPreset when no auto flag is provided', async () => {
  await withTempDir('lsk-flow-auto-default-preset-', async (dir) => {
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

    const result = await runCli(dir, [
      'flow',
      'F001-alpha',
      '--request',
      'issue 004를 F004로 승격시켜서 진행해',
      '--json',
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'AUTO_MANUAL_REQUIRED');
    assert.equal(payload.autoRun?.status, 'manual_required');
    assert.equal(payload.autoRun?.enabled, true);
    assert.equal(payload.autoRun?.preset, 'pr-handoff');
    assert.equal(payload.autoRun?.source, 'config:workflow.auto.defaultPreset');
    assert.notEqual(payload.autoRun?.status, 'request_label_missing');
    assert.equal(payload.autoRun?.resume?.requestPending, false);
    assert.doesNotMatch(payload.autoRun?.resume?.flowCommand || '', /--request/);
  });
});

test('flow rejects unknown --auto-preset values', async () => {
  await withTempDir('lsk-flow-auto-preset-unknown-', async (dir) => {
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

    const result = await runCli(dir, [
      'flow',
      'F001-alpha',
      '--auto-preset',
      'unknown-preset',
      '--json',
    ]);
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'INVALID_ARGUMENT');
    assert.match(payload.error, /Unknown auto preset/i);
  });
});

test('flow --json includes approval result when approve is provided', async () => {
  await withTempDir('lsk-flow-approve-', async (dir) => {
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

    const result = await runCli(dir, ['flow', 'F001', '--approve', 'A', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.approval.status, 'approved_selected');
    assert.equal(payload.approval.reasonCode, 'APPROVED_SELECTED');
  });
});

test('flow --json accepts natural language approval replies with label token', async () => {
  await withTempDir('lsk-flow-approve-natural-language-', async (dir) => {
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

    const result = await runCli(dir, [
      'flow',
      'F001',
      '--approve',
      'A 진행해',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.approval.status, 'approved_selected');
    assert.equal(payload.approval.label, 'A');
  });
});

test('flow --json uses internal ticket handshake for --execute', async () => {
  await withTempDir('lsk-flow-approve-execute-ticket-', async (dir) => {
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

    const result = await runCli(dir, [
      'flow',
      'F001',
      '--approve',
      'A proceed',
      '--execute',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.approval.status, 'approved_instruction');
    assert.equal(payload.approval.reasonCode, 'INSTRUCTION_ONLY');
    assert.equal(payload.approval.label, 'A');
  });
});

test('flow --json executes without ticket when selected option does not require check', async () => {
  await withTempDir('lsk-flow-approve-execute-no-ticket-', async (dir) => {
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
      'flow',
      'F001',
      '--approve',
      'A proceed',
      '--execute',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.notEqual(payload.approval?.status, 'error');
    assert.equal(
      payload.approval?.status === 'approved_instruction' ||
        payload.approval?.status === 'approved_executed',
      true
    );
  });
});

test('flow --json refreshes branch context after branch_create execution', async () => {
  await withTempDir('lsk-flow-branch-create-refresh-', async (dir) => {
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
    tasks = tasks.replace('- **Doc Status**: -', '- **Doc Status**: Approved');
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
    const docsAdd = await runCommand(docsGitRoot, 'git', ['add', 'features/F001-alpha']);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(docsGitRoot, 'git', [
      'commit',
      '-m',
      'docs: prepare branch-create flow case',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    const result = await runCli(dir, [
      'flow',
      'F001-alpha',
      '--approve',
      'A',
      '--execute',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.reasonCode, 'FLOW_SUMMARY');
    assert.equal(payload.context.before.matchedFeature.currentStep, 9);
    assert.equal(payload.context.before.actionOptions?.[0]?.action?.category, 'branch_create');
    assert.equal(payload.context.before.actionOptions?.[0]?.action?.type, 'command');
    assert.match(payload.context.before.actionOptions?.[0]?.detail || '', /create or reuse worktree/i);
    assert.doesNotMatch(payload.context.before.actionOptions?.[0]?.detail || '', /git worktree add/i);
    assert.match(payload.context.before.actionOptions?.[0]?.action?.cmd || '', /git worktree add/);

    assert.equal(payload.approval?.status, 'approved_executed');
    assert.notEqual(payload.context.after.matchedFeature.currentStep, 9);
    assert.equal(
      (payload.context.after.actionOptions || []).some(
        (option) => option?.action?.category === 'branch_create'
      ),
      false
    );
  });
});

test(
  'context --component scopes fallback selection in multi project',
  { timeout: 15_000 },
  async () => {
  await withTempDir('lsk-context-component-scope-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'web,api',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const webFeature = await runCli(dir, [
      'feature',
      'chat-ui',
      '--component',
      'web',
      '--id',
      'F001',
    ]);
    const apiFeature = await runCli(dir, [
      'feature',
      'chat-api',
      '--component',
      'api',
      '--id',
      'F002',
    ]);
    assert.equal(webFeature.code, 0, webFeature.stderr || webFeature.stdout);
    assert.equal(apiFeature.code, 0, apiFeature.stderr || apiFeature.stdout);

    const webContext = await runCli(dir, ['context', '--component', 'web', '--json']);
    assert.equal(webContext.code, 0, webContext.stderr || webContext.stdout);
    const webPayload = JSON.parse(webContext.stdout.trim());
    assert.equal(webPayload.status, 'single_matched');
    assert.equal(webPayload.matchedFeature.type, 'web');
    assert.equal(
      (webPayload.openCandidates || []).every((feature) => feature.type === 'web'),
      true
    );

    const apiContext = await runCli(dir, ['context', '--component', 'api', '--json']);
    assert.equal(apiContext.code, 0, apiContext.stderr || apiContext.stdout);
    const apiPayload = JSON.parse(apiContext.stdout.trim());
    assert.equal(apiPayload.status, 'single_matched');
    assert.equal(apiPayload.matchedFeature.type, 'api');
  });
}
);

test('init writes workflow.codeDirtyScope=auto, warn taskCommitGate, and default auto preset', async () => {
  await withTempDir('lsk-init-dirty-scope-auto-', async (dir) => {
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

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.workflow?.codeDirtyScope, 'auto');
    assert.equal(config.workflow?.taskCommitGate, 'warn');
    assert.equal(config.workflow?.auto?.defaultPreset, 'pr-handoff');
    assert.equal(config.workflow?.prePrReview?.fallback, 'builtin-checklist');
    assert.equal(config.workflow?.prePrReview?.evidenceMode, 'path_required');
    assert.deepEqual(config.workflow?.prePrReview?.decisionEnum, [
      'approve',
      'changes_requested',
      'blocked',
    ]);
  });
});

test('multi auto dirty scope ignores unrelated component changes, missing key defaults to repo', async () => {
  await withTempDir('lsk-context-dirty-scope-multi-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'web,api',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const webFeature = await runCli(dir, [
      'feature',
      'chat-ui',
      '--component',
      'web',
      '--id',
      'F001',
    ]);
    assert.equal(webFeature.code, 0, webFeature.stderr || webFeature.stdout);
    await setMultiFeatureAsDone(dir, 'web', 'F001-chat-ui');

    await fs.mkdir(path.join(dir, 'apps', 'web'), { recursive: true });
    await fs.mkdir(path.join(dir, 'apps', 'api'), { recursive: true });
    await fs.writeFile(path.join(dir, 'apps', 'web', 'index.js'), "console.log('web');\n", 'utf-8');
    await fs.writeFile(path.join(dir, 'apps', 'api', 'index.js'), "console.log('api');\n", 'utf-8');

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

    const addAll = await runCommand(dir, 'git', ['add', '-A']);
    assert.equal(addAll.code, 0, addAll.stderr || addAll.stdout);
    const firstCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'baseline',
    ]);
    assert.equal(firstCommit.code, 0, firstCommit.stderr || firstCommit.stdout);

    await fs.appendFile(
      path.join(dir, 'apps', 'api', 'index.js'),
      "console.log('api tweak');\n",
      'utf-8'
    );

    const autoResult = await runCli(dir, [
      'context',
      'F001-chat-ui',
      '--component',
      'web',
      '--json',
    ]);
    assert.equal(autoResult.code, 0, autoResult.stderr || autoResult.stdout);
    const autoPayload = JSON.parse(autoResult.stdout.trim());
    assert.equal(autoPayload.matchedFeature.git.projectHasUncommittedChanges, false);
    assert.equal(autoPayload.matchedFeature.completion.workflowDone, true);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    if (config.workflow) {
      delete config.workflow.codeDirtyScope;
    }
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const legacyResult = await runCli(dir, [
      'context',
      'F001-chat-ui',
      '--component',
      'web',
      '--json',
    ]);
    assert.equal(legacyResult.code, 0, legacyResult.stderr || legacyResult.stdout);
    const legacyPayload = JSON.parse(legacyResult.stdout.trim());
    assert.equal(legacyPayload.matchedFeature.git.projectHasUncommittedChanges, true);
    assert.equal(legacyPayload.matchedFeature.completion.workflowDone, false);
  });
});

test('context recommendation in single project does not mention --component', async () => {
  await withTempDir('lsk-context-single-recommendation-', async (dir) => {
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

    const result = await runCli(dir, ['context', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'multiple_active');
    assert.doesNotMatch(payload.recommendation, /--component/);
    assert.equal(Array.isArray(payload.suggestionOptions), true);
    assert.equal(payload.suggestionOptions.length, 2);
    assert.equal(suggestionOptionByLabel(payload).label, 'A');
    assert.match(suggestionOptionByLabel(payload).command, /context <slug\|F001\|F001-slug>$/);
    assert.equal(Array.isArray(payload.suggestionRequest?.labels), true);
    assert.deepEqual(payload.suggestionRequest.labels, ['A', 'B']);
  });
});

test('context recommendation with selected component does not re-suggest --component', async () => {
  await withTempDir('lsk-context-multi-recommendation-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'web,api',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const f1 = await runCli(dir, ['feature', 'chat-ui', '--component', 'web', '--id', 'F001']);
    const f2 = await runCli(dir, ['feature', 'chat-theme', '--component', 'web', '--id', 'F002']);
    assert.equal(f1.code, 0, f1.stderr || f1.stdout);
    assert.equal(f2.code, 0, f2.stderr || f2.stdout);

    const result = await runCli(dir, ['context', '--component', 'web', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'multiple_active');
    assert.match(payload.recommendation, /component "web"/);
    assert.doesNotMatch(payload.recommendation, /use --component/i);
    assert.equal(Array.isArray(payload.suggestionOptions), true);
    assert.equal(payload.suggestionOptions.length, 2);
    assert.equal(suggestionOptionByLabel(payload).label, 'A');
    assert.match(
      suggestionOptionByLabel(payload).command,
      /context <slug\|F001\|F001-slug> --component web$/
    );
  });
});

test('view and flow accept --component and stay scoped', async () => {
  await withTempDir('lsk-view-flow-component-scope-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'web,api',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const webFeature = await runCli(dir, [
      'feature',
      'chat-ui',
      '--component',
      'web',
      '--id',
      'F001',
    ]);
    const apiFeature = await runCli(dir, [
      'feature',
      'chat-api',
      '--component',
      'api',
      '--id',
      'F002',
    ]);
    assert.equal(webFeature.code, 0, webFeature.stderr || webFeature.stdout);
    assert.equal(apiFeature.code, 0, apiFeature.stderr || apiFeature.stdout);

    const viewResult = await runCli(dir, ['view', '--component', 'web', '--json']);
    assert.equal(viewResult.code, 0, viewResult.stderr || viewResult.stdout);
    const viewPayload = JSON.parse(viewResult.stdout.trim());
    assert.equal(viewPayload.counts.features, 1);
    assert.equal(viewPayload.matchedFeature.type, 'web');

    const flowResult = await runCli(dir, ['flow', '--component', 'web', '--json']);
    assert.equal(flowResult.code, 0, flowResult.stderr || flowResult.stdout);
    const flowPayload = JSON.parse(flowResult.stdout.trim());
    assert.equal(flowPayload.context.before.matchedFeature.type, 'web');
    assert.match(flowPayload.suggestion, /--component web/);
  });
});

test('init ignore warning shows repo-relative path and actionable hint', async () => {
  await withTempDir('lsk-init-ignore-warning-', async (dir) => {
    const repoRoot = path.join(dir, 'repo');
    const appDir = path.join(repoRoot, 'workspace', 'app');
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(path.join(repoRoot, '.gitignore'), 'workspace/\n', 'utf-8');

    const child = spawn('git', ['init'], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    const gitCode = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(gitCode, 0);

    const result = await runCli(appDir, [
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
    assert.match(result.stdout, /workspace\/app\/docs/);
    assert.match(result.stdout, /git add -f workspace\/app\/docs/);
  });
});

test('context rejects removed --repo option', async () => {
  await withTempDir('lsk-context-removed-repo-option-', async (dir) => {
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

    const result = await runCli(dir, ['context', '--repo', 'web', '--json']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /unknown option '--repo'/i);
  });
});

test('doctor ignores initial template-only warnings for fresh features', async () => {
  await withTempDir('lsk-doctor-initial-template-', async (dir) => {
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

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.counts.issues, 0);

    const dryFix = await runCli(dir, ['doctor', '--fix', '--dry-run', '--json']);
    assert.equal(dryFix.code, 0, dryFix.stderr || dryFix.stdout);
    const dryPayload = JSON.parse(dryFix.stdout.trim());
    assert.equal(dryPayload.fixes.enabled, true);
    assert.equal(dryPayload.fixes.changedFiles, 0);
  });
});

test('config --dir targets the selected docs directory when multiple docs exist', async () => {
  await withTempDir('lsk-config-dir-target-', async (dir) => {
    const embedded = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo-embedded',
      '--type',
      'single',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(embedded.code, 0, embedded.stderr || embedded.stdout);

    const standalone = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo-standalone',
      '--type',
      'single',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs2',
      '--docs-repo',
      'standalone',
      '--project-root',
      '/tmp/project-a',
    ]);
    assert.equal(standalone.code, 0, standalone.stderr || standalone.stdout);

    const configSet = await runCli(dir, [
      'config',
      '--dir',
      './docs2',
      '--project-root',
      '/tmp/project-b',
    ]);
    assert.equal(configSet.code, 0, configSet.stderr || configSet.stdout);

    const docs2Config = JSON.parse(
      await fs.readFile(path.join(dir, 'docs2', '.lee-spec-kit.json'), 'utf-8')
    );
    assert.equal(docs2Config.docsRepo, 'standalone');
    assert.equal(docs2Config.projectRoot, '/tmp/project-b');
  });
});

test('config fallback detects Korean lang from agents/custom.md', async () => {
  await withTempDir('lsk-config-lang-fallback-ko-', async (dir) => {
    await fs.mkdir(path.join(dir, 'docs', 'agents'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'features'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'prd'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'designs'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'ideas'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'agents', 'custom.md'),
      '# 커스텀 규칙\n\n한국어 규칙\n',
      'utf-8'
    );

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.meta.lang, 'ko');
    assert.match(String(payload.issues?.[0]?.message || ''), /설정 파일/);
  });
});

test('config fallback detects English lang from agents/custom.md', async () => {
  await withTempDir('lsk-config-lang-fallback-en-', async (dir) => {
    await fs.mkdir(path.join(dir, 'docs', 'agents'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'features'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'prd'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'designs'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'ideas'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'agents', 'custom.md'),
      '# Custom Rules\n\nEnglish rules only.\n',
      'utf-8'
    );

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.meta.lang, 'en');
    assert.match(String(payload.issues?.[0]?.message || ''), /Missing \.lee-spec-kit\.json/);
  });
});

test('config file lang is respected (ko)', async () => {
  await withTempDir('lsk-config-lang-configfile-ko-', async (dir) => {
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

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.meta.lang, 'ko');
  });
});

test('--no-banner hides ASCII banner in help output', async () => {
  await withTempDir('lsk-no-banner-help-', async (dir) => {
    const result = await runCli(dir, ['--no-banner', '--help']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, /░██/);
    assert.match(result.stdout, /Usage: lee-spec-kit/);
  });
});

test('help output omits ASCII banner in non-TTY mode by default', async () => {
  await withTempDir('lsk-help-non-tty-no-banner-', async (dir) => {
    const result = await runCli(dir, ['--help']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, /░██/);
    assert.match(result.stdout, /Usage: lee-spec-kit/);
  });
});

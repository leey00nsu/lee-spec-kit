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

async function initRepo(dir, options = {}) {
  const { lang = 'en', workflow = 'github' } = options;
  const gitInit = await runCommand(dir, 'git', ['init']);
  assert.equal(gitInit.code, 0, gitInit.stderr || gitInit.stdout);
  const gitUserName = await runCommand(dir, 'git', ['config', 'user.name', 'Test User']);
  assert.equal(gitUserName.code, 0, gitUserName.stderr || gitUserName.stdout);
  const gitUserEmail = await runCommand(dir, 'git', ['config', 'user.email', 'test@example.com']);
  assert.equal(gitUserEmail.code, 0, gitUserEmail.stderr || gitUserEmail.stdout);

  const initResult = await runCli(dir, [
    'init',
    '--non-interactive',
    '--name',
    'demo',
    '--type',
    'single',
    '--lang',
    lang,
    '--workflow',
    workflow,
    '--dir',
    './docs',
  ]);
  assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

  const featureResult = await runCli(dir, [
    'feature',
    'alpha',
    '--id',
    'F001',
    '--non-interactive',
  ]);
  assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

  const commitAll = await runCommand(dir, 'git', ['add', '.']);
  assert.equal(commitAll.code, 0, commitAll.stderr || commitAll.stdout);
  const commitResult = await runCommand(dir, 'git', ['commit', '-m', 'baseline']);
  assert.equal(commitResult.code, 0, commitResult.stderr || commitResult.stdout);
}

function featureDir(dir) {
  return path.join(dir, 'docs', 'features', 'F001-alpha');
}

async function syncIssueDraftMarker(dir, issueNumber = 123) {
  const issueDocPath = path.join(featureDir(dir), 'issue.md');
  let issueDoc = await fs.readFile(issueDocPath, 'utf-8');
  issueDoc += `\n- **Issue**: #${issueNumber}\n`;
  await fs.writeFile(issueDocPath, issueDoc, 'utf-8');
}

async function insertEnglishTaskBlock(tasksPath, status = 'TODO') {
  let tasks = await fs.readFile(tasksPath, 'utf-8');
  tasks = tasks.replace(
    '## Completion Criteria',
    `- [${status}][NON-PRD] T-F001-alpha-01 implement alpha shell
  - Date: 2026-04-16
  - Acceptance:
    - alpha shell renders
  - Checklist:
    - [ ] add UI

## Completion Criteria`
  );
  await fs.writeFile(tasksPath, tasks, 'utf-8');
}

async function setStatus(filePath, label, value) {
  const current = await fs.readFile(filePath, 'utf-8');
  const next = current.replace(
    new RegExp(`- \\*\\*${label}\\*\\*: .*`, 'u'),
    `- **${label}**: ${value}`
  );
  await fs.writeFile(filePath, next, 'utf-8');
}

async function writePlanningReadyDocs(dir, { issueStatus = 'Draft' } = {}) {
  const base = featureDir(dir);
  await setStatus(path.join(base, 'spec.md'), 'Status', 'Approved');
  await setStatus(path.join(base, 'plan.md'), 'Status', 'Approved');
  await fs.writeFile(
    path.join(base, 'issue.md'),
    `# Issue Draft: alpha

- **Status**: ${issueStatus}
- **Title**: alpha
- **Labels**: enhancement

## Overview

Alpha issue draft.
`,
    'utf-8'
  );
  await fs.writeFile(
    path.join(base, 'pr.md'),
    `# PR Draft: alpha

- **Status**: Draft
- **Title**: alpha
- **Labels**: enhancement

## Summary

Alpha PR draft.
`,
    'utf-8'
  );

  const tasks = `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Approved
- **Repo**: demo
- **Issue**: #
- **Branch**: feat/-alpha
- **PR**: -
- **PR Status**: -
- **Pre-PR Review**: Pending
- **Pre-PR Evidence**: -
- **Pre-PR Decision**: -
- **PR Review Evidence**: -
- **PR Review Decision**: -

## Task List

- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell
  - Date: 2026-04-16
  - Acceptance:
    - alpha shell renders
  - Checklist:
    - [ ] add UI

## Completion Criteria

- [ ] All tasks are \`[DONE]\`, and each task's \`Acceptance\` is verified and \`Checklist\` is checked
- [ ] Tests executed and passing (record command/result below)
- [ ] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint

### Test Run Log (Latest by Command)

| Command | Last Run (Local, YYYY-MM-DD) | Result |
| --- | --- | --- |
| \`pnpm vitest\` | \`-\` | \`-\` |
`;
  await fs.writeFile(path.join(base, 'tasks.md'), tasks, 'utf-8');
}

async function readStage(dir, env = {}) {
  const result = await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'], env);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test('workflow-stage blocks implementation at the issue preparation stage after tasks are ready', async () => {
  await withTempDir('lsk-workflow-stage-issue-prepare-', async (dir) => {
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Draft' });

    const payload = await readStage(dir);
    assert.equal(payload.status, 'ok');
    assert.equal(payload.stage, 'issue');
    assert.equal(payload.nextAction.category, 'issue_prepare');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'ISSUE_NOT_CREATED');
  });
});

test('workflow-stage starts at spec_write when spec.md is still draft', async () => {
  await withTempDir('lsk-workflow-stage-spec-write-', async (dir) => {
    await initRepo(dir);
    const payload = await readStage(dir);
    assert.equal(payload.stage, 'spec');
    assert.equal(payload.nextAction.category, 'spec_write');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.blockedReasonCode, 'SPEC_NOT_APPROVED');
  });
});

test('workflow-stage moves to spec_approve when spec.md is in review', async () => {
  await withTempDir('lsk-workflow-stage-spec-approve-', async (dir) => {
    await initRepo(dir);
    await setStatus(path.join(featureDir(dir), 'spec.md'), 'Status', 'Review');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'spec');
    assert.equal(payload.nextAction.category, 'spec_approve');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.blockedReasonCode, 'SPEC_NOT_APPROVED');
  });
});

test('workflow-stage moves to plan_write after spec approval when plan.md is still draft', async () => {
  await withTempDir('lsk-workflow-stage-plan-write-', async (dir) => {
    await initRepo(dir);
    await setStatus(path.join(featureDir(dir), 'spec.md'), 'Status', 'Approved');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'plan');
    assert.equal(payload.nextAction.category, 'plan_write');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.blockedReasonCode, 'PLAN_NOT_APPROVED');
  });
});

test('workflow-stage moves to plan_approve when plan.md is in review', async () => {
  await withTempDir('lsk-workflow-stage-plan-approve-', async (dir) => {
    await initRepo(dir);
    await setStatus(path.join(featureDir(dir), 'spec.md'), 'Status', 'Approved');
    await setStatus(path.join(featureDir(dir), 'plan.md'), 'Status', 'Review');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'plan');
    assert.equal(payload.nextAction.category, 'plan_approve');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.blockedReasonCode, 'PLAN_NOT_APPROVED');
  });
});

test('workflow-stage stays at tasks_write until tasks.md is execution-ready', async () => {
  await withTempDir('lsk-workflow-stage-tasks-write-', async (dir) => {
    await initRepo(dir);
    await setStatus(path.join(featureDir(dir), 'spec.md'), 'Status', 'Approved');
    await setStatus(path.join(featureDir(dir), 'plan.md'), 'Status', 'Approved');

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    await insertEnglishTaskBlock(tasksPath, 'TODO');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'tasks');
    assert.equal(payload.nextAction.category, 'tasks_write');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.blockedReasonCode, 'TASKS_NOT_READY');
  });
});

test('workflow-stage moves to tasks_approve when tasks.md is in review', async () => {
  await withTempDir('lsk-workflow-stage-tasks-approve-', async (dir) => {
    await initRepo(dir);
    await setStatus(path.join(featureDir(dir), 'spec.md'), 'Status', 'Approved');
    await setStatus(path.join(featureDir(dir), 'plan.md'), 'Status', 'Approved');

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    await insertEnglishTaskBlock(tasksPath, 'TODO');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Doc Status**: -', '- **Doc Status**: Review');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'tasks');
    assert.equal(payload.nextAction.category, 'tasks_approve');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.blockedReasonCode, 'TASKS_NOT_READY');
  });
});

test('workflow-stage keeps implementation blocked until the issue is actually created', async () => {
  await withTempDir('lsk-workflow-stage-issue-create-', async (dir) => {
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'issue');
    assert.equal(payload.nextAction.category, 'issue_create');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'ISSUE_NOT_CREATED');
  });
});

test('workflow-stage allows implementation only after issue creation and expected branch checkout', async () => {
  await withTempDir('lsk-workflow-stage-implementation-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'implementation');
    assert.equal(payload.nextAction.category, 'task_execute');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, true);
    assert.equal(payload.blockedReasonCode, null);
  });
});

test('workflow-stage restores the GitHub branch gate before implementation', async () => {
  await withTempDir('lsk-workflow-stage-branch-gate-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'branch');
    assert.equal(payload.nextAction.category, 'branch_create');
    assert.equal(payload.nextAction.command, 'git checkout -b feat/123-alpha');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'BRANCH_NOT_READY');
  });
});

test('workflow-stage does not bypass the issue gate when tasks.md has an issue number but issue.md is not Ready', async () => {
  await withTempDir('lsk-workflow-stage-issue-stale-doc-', async (dir) => {
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Draft' });

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'issue');
    assert.equal(payload.nextAction.category, 'issue_prepare');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
  });
});

test('workflow-stage restores implementation approval after all tasks are done', async () => {
  await withTempDir('lsk-workflow-stage-implementation-approve-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    tasks = tasks.replace('- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell', '- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell');
    tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
    tasks = tasks.replace('| `pnpm vitest` | `-` | `-` |', '| `pnpm vitest` | `2026-04-16` | `PASS` |');
    tasks = tasks.replace('- [ ] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked', '- [x] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked');
    tasks = tasks.replace('- [ ] Tests executed and passing (record command/result below)', '- [x] Tests executed and passing (record command/result below)');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'implementation_approve');
    assert.equal(payload.nextAction.category, 'implementation_approve');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'IMPLEMENTATION_APPROVAL_REQUIRED');
  });
});

test('workflow-stage advances to PR creation only after pre-pr approval is recorded', async () => {
  await withTempDir('lsk-workflow-stage-pr-create-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const prPath = path.join(featureDir(dir), 'pr.md');
    await setStatus(prPath, 'Status', 'Ready');

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    tasks = tasks.replace('- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell', '- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell');
    tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
    tasks = tasks.replace('- **Pre-PR Review**: Pending', '- **Pre-PR Review**: Done');
    tasks = tasks.replace('- **Pre-PR Evidence**: -', '- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md');
    tasks = tasks.replace('- **Pre-PR Decision**: -', '- **Pre-PR Decision**: decision: approve - baseline checklist completed');
    tasks = tasks.replace('| `pnpm vitest` | `-` | `-` |', '| `pnpm vitest` | `2026-04-16` | `PASS` |');
    tasks = tasks.replace('- [ ] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked', '- [x] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked');
    tasks = tasks.replace('- [ ] Tests executed and passing (record command/result below)', '- [x] Tests executed and passing (record command/result below)');
    tasks = tasks.replace('- [ ] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint', '- [x] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'pr');
    assert.equal(payload.nextAction.category, 'pr_create');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'PR_NOT_CREATED');
  });
});

test('workflow-stage does not bypass the PR gate when tasks.md has a PR link but pr.md is not Ready', async () => {
  await withTempDir('lsk-workflow-stage-pr-stale-doc-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    tasks = tasks.replace('- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell', '- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell');
    tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
    tasks = tasks.replace('- **Pre-PR Review**: Pending', '- **Pre-PR Review**: Done');
    tasks = tasks.replace('- **Pre-PR Evidence**: -', '- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md');
    tasks = tasks.replace('- **Pre-PR Decision**: -', '- **Pre-PR Decision**: decision: approve - baseline checklist completed');
    tasks = tasks.replace('| `pnpm vitest` | `-` | `-` |', '| `pnpm vitest` | `2026-04-16` | `PASS` |');
    tasks = tasks.replace('- [ ] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked', '- [x] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked');
    tasks = tasks.replace('- [ ] Tests executed and passing (record command/result below)', '- [x] Tests executed and passing (record command/result below)');
    tasks = tasks.replace('- [ ] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint', '- [x] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint');
    tasks = tasks.replace('- **PR**: -', '- **PR**: https://github.com/acme/repo/pull/77');
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'pr');
    assert.equal(payload.nextAction.category, 'pr_prepare');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
  });
});

test('workflow-stage restores the pre-pr review gate before PR preparation', async () => {
  await withTempDir('lsk-workflow-stage-pre-pr-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });

    const prPath = path.join(featureDir(dir), 'pr.md');
    await setStatus(prPath, 'Status', 'Draft');

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    tasks = tasks.replace('- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell', '- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell');
    tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
    tasks = tasks.replace('| `pnpm vitest` | `-` | `-` |', '| `pnpm vitest` | `2026-04-16` | `PASS` |');
    tasks = tasks.replace('- [ ] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked', '- [x] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked');
    tasks = tasks.replace('- [ ] Tests executed and passing (record command/result below)', '- [x] Tests executed and passing (record command/result below)');
    tasks = tasks.replace('- [ ] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint', '- [x] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const issueDocPath = path.join(featureDir(dir), 'issue.md');
    let issueDoc = await fs.readFile(issueDocPath, 'utf-8');
    issueDoc += '\n- **Issue**: #123\n';
    await fs.writeFile(issueDocPath, issueDoc, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'pre_pr_review');
    assert.equal(payload.nextAction.category, 'pre_pr_review');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'PRE_PR_REVIEW_NOT_APPROVED');
  });
});

test('workflow-stage advances to code review after PR creation but before final review approval', async () => {
  await withTempDir('lsk-workflow-stage-code-review-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });

    const prPath = path.join(featureDir(dir), 'pr.md');
    await setStatus(prPath, 'Status', 'Ready');
    let prDoc = await fs.readFile(prPath, 'utf-8');
    prDoc += '\n- **PR**: https://github.com/acme/repo/pull/77\n- **PR Status**: Review\n';
    await fs.writeFile(prPath, prDoc, 'utf-8');

    const issueDocPath = path.join(featureDir(dir), 'issue.md');
    let issueDoc = await fs.readFile(issueDocPath, 'utf-8');
    issueDoc += '\n- **Issue**: #123\n';
    await fs.writeFile(issueDocPath, issueDoc, 'utf-8');

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    tasks = tasks.replace('- **PR**: -', '- **PR**: https://github.com/acme/repo/pull/77');
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
    tasks = tasks.replace('- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell', '- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell');
    tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
    tasks = tasks.replace('- **Pre-PR Review**: Pending', '- **Pre-PR Review**: Done');
    tasks = tasks.replace('- **Pre-PR Evidence**: -', '- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md');
    tasks = tasks.replace('- **Pre-PR Decision**: -', '- **Pre-PR Decision**: decision: approve - baseline checklist completed');
    tasks = tasks.replace('| `pnpm vitest` | `-` | `-` |', '| `pnpm vitest` | `2026-04-16` | `PASS` |');
    tasks = tasks.replace('- [ ] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked', '- [x] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked');
    tasks = tasks.replace('- [ ] Tests executed and passing (record command/result below)', '- [x] Tests executed and passing (record command/result below)');
    tasks = tasks.replace('- [ ] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint', '- [x] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.nextAction.category, 'code_review');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'PR_REVIEW_NOT_APPROVED');
  });
});

test('workflow-stage advances to merge only after PR review approval is recorded', async () => {
  await withTempDir('lsk-workflow-stage-merge-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });

    const prPath = path.join(featureDir(dir), 'pr.md');
    await setStatus(prPath, 'Status', 'Ready');
    let prDoc = await fs.readFile(prPath, 'utf-8');
    prDoc += '\n- **PR**: https://github.com/acme/repo/pull/77\n- **PR Status**: Approved\n';
    await fs.writeFile(prPath, prDoc, 'utf-8');

    const issueDocPath = path.join(featureDir(dir), 'issue.md');
    let issueDoc = await fs.readFile(issueDocPath, 'utf-8');
    issueDoc += '\n- **Issue**: #123\n';
    await fs.writeFile(issueDocPath, issueDoc, 'utf-8');

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    tasks = tasks.replace('- **PR**: -', '- **PR**: https://github.com/acme/repo/pull/77');
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Approved');
    tasks = tasks.replace('- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell', '- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell');
    tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
    tasks = tasks.replace('- **Pre-PR Review**: Pending', '- **Pre-PR Review**: Done');
    tasks = tasks.replace('- **Pre-PR Evidence**: -', '- **Pre-PR Evidence**: docs/features/F001-alpha/decisions.md');
    tasks = tasks.replace('- **Pre-PR Decision**: -', '- **Pre-PR Decision**: decision: approve - baseline checklist completed');
    tasks = tasks.replace('| `pnpm vitest` | `-` | `-` |', '| `pnpm vitest` | `2026-04-16` | `PASS` |');
    tasks = tasks.replace('- [ ] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked', '- [x] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked');
    tasks = tasks.replace('- [ ] Tests executed and passing (record command/result below)', '- [x] Tests executed and passing (record command/result below)');
    tasks = tasks.replace('- [ ] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint', '- [x] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'merge');
    assert.equal(payload.nextAction.category, 'pr_merge');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.implementationAllowed, false);
  });
});

test('workflow-stage skips GitHub gates for the local workflow', async () => {
  await withTempDir('lsk-workflow-stage-local-', async (dir) => {
    await initRepo(dir, { workflow: 'local' });

    const base = featureDir(dir);
    await setStatus(path.join(base, 'spec.md'), 'Status', 'Approved');
    await setStatus(path.join(base, 'plan.md'), 'Status', 'Approved');

    const tasksPath = path.join(base, 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Doc Status**: -', '- **Doc Status**: Approved');
    tasks = tasks.replace(
      '## Completion Criteria',
      `- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell
  - Date: 2026-04-16
  - Acceptance:
    - alpha shell renders
  - Checklist:
    - [ ] add UI

## Completion Criteria`
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const branchPayload = await readStage(dir);
    assert.equal(branchPayload.stage, 'branch');
    assert.equal(branchPayload.nextAction.category, 'branch_create');
    assert.equal(branchPayload.approvalRequired, false);
    assert.equal(branchPayload.nextAction.command, 'git checkout -b feat/alpha');
    const branchName =
      branchPayload.nextAction.command?.match(/^git checkout -b (.+)$/)?.[1] ||
      'feat/alpha';
    const checkout = await runCommand(dir, 'git', ['checkout', '-b', branchName]);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'implementation');
    assert.equal(payload.nextAction.category, 'task_execute');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, true);
  });
});

test('workflow-stage normalizes local branch commands for Korean workflows', async () => {
  await withTempDir('lsk-workflow-stage-local-ko-', async (dir) => {
    await initRepo(dir, { workflow: 'local', lang: 'ko' });

    const base = featureDir(dir);
    await setStatus(path.join(base, 'spec.md'), '상태', 'Approved');
    await setStatus(path.join(base, 'plan.md'), '상태', 'Approved');

    const tasksPath = path.join(base, 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **문서 상태**: -', '- **문서 상태**: Approved');
    tasks = tasks.replace(
      '## 완료 조건',
      `- [TODO][NON-PRD] T-F001-alpha-01 alpha shell 구현
  - Date: 2026-04-16
  - Acceptance:
    - alpha shell renders
  - Checklist:
    - [ ] add UI

## 완료 조건`
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'branch');
    assert.equal(payload.nextAction.category, 'branch_create');
    assert.equal(payload.nextAction.command, 'git checkout -b feat/alpha');
  });
});

test('workflow-stage reaches done when merge is not required and the feature is fully completed', async () => {
  await withTempDir('lsk-workflow-stage-done-', async (dir) => {
    await initRepo(dir, { workflow: 'local' });

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      ...(config.workflow || {}),
      requireBranch: false,
      requireMerge: false,
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const base = featureDir(dir);
    await setStatus(path.join(base, 'spec.md'), 'Status', 'Approved');
    await setStatus(path.join(base, 'plan.md'), 'Status', 'Approved');

    const tasksPath = path.join(base, 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Doc Status**: -', '- **Doc Status**: Approved');
    tasks = tasks.replace(
      '## Completion Criteria',
      `- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell
  - Date: 2026-04-16
  - Acceptance:
    - alpha shell renders
  - Checklist:
    - [x] add UI

## Completion Criteria`
    );
    tasks = tasks.replace('| `{test command you ran}` | `-` | `{PASS/FAIL summary}` |', '| `pnpm vitest` | `2026-04-16` | `PASS` |');
    tasks = tasks.replace('- [ ] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked', '- [x] All tasks are `[DONE]`, and each task\'s `Acceptance` is verified and `Checklist` is checked');
    tasks = tasks.replace('- [ ] Tests executed and passing (record command/result below)', '- [x] Tests executed and passing (record command/result below)');
    tasks = tasks.replace('- [ ] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint', '- [x] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'done');
    assert.equal(payload.nextAction, null);
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, null);
  });
});

test('workflow-stage parses Korean workflow docs and keeps the issue gate before implementation', async () => {
  await withTempDir('lsk-workflow-stage-ko-', async (dir) => {
    await initRepo(dir, { lang: 'ko', workflow: 'github' });

    const base = featureDir(dir);
    await setStatus(path.join(base, 'spec.md'), '상태', 'Approved');
    await setStatus(path.join(base, 'plan.md'), '상태', 'Approved');

    const tasksPath = path.join(base, 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **문서 상태**: -', '- **문서 상태**: Approved');
    tasks = tasks.replace(
      '## 완료 조건',
      `- [TODO][NON-PRD] T-F001-alpha-01 alpha shell 구현
  - Date: 2026-04-16
  - Acceptance:
    - alpha shell renders
  - Checklist:
    - [ ] add UI

## 완료 조건`
    );
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const issuePath = path.join(base, 'issue.md');
    await setStatus(issuePath, '상태', 'Draft');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'issue');
    assert.equal(payload.nextAction.category, 'issue_prepare');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
  });
});

test('workflow-stage reports NO_FEATURES when the project has no features yet', async () => {
  await withTempDir('lsk-workflow-stage-no-features-', async (dir) => {
    const gitInit = await runCommand(dir, 'git', ['init']);
    assert.equal(gitInit.code, 0, gitInit.stderr || gitInit.stdout);

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

    const result = await runCli(dir, ['workflow-stage', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'NO_FEATURES');
  });
});

test('workflow-stage reports FEATURE_SELECTION_REQUIRED when multiple features exist and no selector is provided', async () => {
  await withTempDir('lsk-workflow-stage-multiple-features-', async (dir) => {
    await initRepo(dir);

    const secondFeature = await runCli(dir, [
      'feature',
      'beta',
      '--id',
      'F002',
      '--non-interactive',
    ]);
    assert.equal(secondFeature.code, 0, secondFeature.stderr || secondFeature.stdout);

    const result = await runCli(dir, ['workflow-stage', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'FEATURE_SELECTION_REQUIRED');
  });
});

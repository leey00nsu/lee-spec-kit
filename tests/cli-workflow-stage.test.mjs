import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  normalizePathForCompare,
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
  const gitMain = await runCommand(dir, 'git', ['branch', '-M', 'main']);
  assert.equal(gitMain.code, 0, gitMain.stderr || gitMain.stdout);
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

async function initStandaloneRepo(dir, options = {}) {
  const { lang = 'en', workflow = 'github' } = options;
  const projectRoot = path.join(dir, 'project');
  await fs.mkdir(projectRoot, { recursive: true });

  const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
  assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);
  const projectMain = await runCommand(projectRoot, 'git', ['branch', '-M', 'main']);
  assert.equal(projectMain.code, 0, projectMain.stderr || projectMain.stdout);
  const gitUserName = await runCommand(projectRoot, 'git', ['config', 'user.name', 'Test User']);
  assert.equal(gitUserName.code, 0, gitUserName.stderr || gitUserName.stdout);
  const gitUserEmail = await runCommand(projectRoot, 'git', ['config', 'user.email', 'test@example.com']);
  assert.equal(gitUserEmail.code, 0, gitUserEmail.stderr || gitUserEmail.stdout);
  await fs.writeFile(path.join(projectRoot, 'README.md'), '# project\n', 'utf-8');
  const projectAdd = await runCommand(projectRoot, 'git', ['add', 'README.md']);
  assert.equal(projectAdd.code, 0, projectAdd.stderr || projectAdd.stdout);
  const projectCommit = await runCommand(projectRoot, 'git', ['commit', '-m', 'baseline']);
  assert.equal(projectCommit.code, 0, projectCommit.stderr || projectCommit.stdout);

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
    '--docs-repo',
    'standalone',
    '--project-root',
    './project',
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

  const commitDocs = await runCommand(path.join(dir, 'docs'), 'git', ['add', '.']);
  assert.equal(commitDocs.code, 0, commitDocs.stderr || commitDocs.stdout);
  const commitDocsResult = await runCommand(path.join(dir, 'docs'), 'git', ['commit', '-m', 'baseline']);
  assert.equal(commitDocsResult.code, 0, commitDocsResult.stderr || commitDocsResult.stdout);

  return { projectRoot };
}

async function setupLocalOriginRemote(repoDir) {
  const remotePath = path.join(repoDir, 'origin.git');
  const initBare = await runCommand(repoDir, 'git', ['init', '--bare', remotePath]);
  assert.equal(initBare.code, 0, initBare.stderr || initBare.stdout);
  const addRemote = await runCommand(repoDir, 'git', ['remote', 'add', 'origin', remotePath]);
  assert.equal(addRemote.code, 0, addRemote.stderr || addRemote.stdout);
  const pushMain = await runCommand(repoDir, 'git', ['push', '-u', 'origin', 'HEAD']);
  assert.equal(pushMain.code, 0, pushMain.stderr || pushMain.stdout);
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

async function setupFakeReviewGhCli(dir, prViewPayload = {}) {
  const binDir = path.join(dir, 'fake-review-bin');
  const scriptPath = path.join(binDir, 'gh');
  const cmdScriptPath = path.join(binDir, 'gh.cmd');
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const payload = ${JSON.stringify({
      url: 'https://github.com/acme/repo/pull/77',
      headRefName: 'feature-branch',
      baseRefName: 'main',
      state: 'OPEN',
      mergedAt: null,
      reviewDecision: '',
      mergeStateStatus: 'CLEAN',
      isDraft: false,
      statusCheckRollup: [],
      ...prViewPayload,
    })};

if (args[0] === 'pr' && args[1] === 'view') {
  console.log(JSON.stringify(payload));
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'graphql') {
  console.log(JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          headRefOid: payload.headRefOid || '',
          reviewThreads: payload.reviewThreads || { nodes: [] },
        },
      },
    },
  }));
  process.exit(0);
}
if (args[0] === 'issue' && args[1] === 'view') {
  console.log(JSON.stringify({ number: 123, state: 'OPEN' }));
  process.exit(0);
}
process.exit(0);
`,
    'utf-8'
  );
  await fs.chmod(scriptPath, 0o755);
  await fs.writeFile(
    cmdScriptPath,
    `@echo off\r\n"${process.execPath}" "%~dp0\\gh" %*\r\n`,
    'utf-8'
  );
  return {
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    },
  };
}

async function setupFailingPrViewGhCli(dir) {
  const binDir = path.join(dir, 'fake-review-fail-bin');
  const scriptPath = path.join(binDir, 'gh');
  const cmdScriptPath = path.join(binDir, 'gh.cmd');
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'view') {
  if (args.includes('url')) {
    console.log(JSON.stringify({ url: 'https://github.com/acme/repo/pull/77' }));
    process.exit(0);
  }
  process.stderr.write('remote unavailable\\n');
  process.exit(1);
}
if (args[0] === 'issue' && args[1] === 'view') {
  console.log(JSON.stringify({ number: 123, state: 'OPEN' }));
  process.exit(0);
}
process.exit(0);
`,
    'utf-8'
  );
  await fs.chmod(scriptPath, 0o755);
  await fs.writeFile(
    cmdScriptPath,
    `@echo off\r\n"${process.execPath}" "%~dp0\\gh" %*\r\n`,
    'utf-8'
  );
  return {
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    },
  };
}

async function commitFeatureDocs(
  dir,
  message = 'docs: F001-alpha progress',
  extraPaths = []
) {
  const add = await runCommand(dir, 'git', [
    'add',
    'docs/features/F001-alpha',
    ...extraPaths,
  ]);
  assert.equal(add.code, 0, add.stderr || add.stdout);
  const commit = await runCommand(dir, 'git', ['commit', '-m', message]);
  assert.equal(commit.code, 0, commit.stderr || commit.stdout);
}

async function commitTaskProject(
  dir,
  message = 'feat(#123): implement alpha shell',
  fileName = 'alpha.ts'
) {
  const srcDir = path.join(dir, 'src');
  await fs.mkdir(srcDir, { recursive: true });
  const filePath = path.join(srcDir, fileName);
  const stamp = `${Date.now()}`;
  await fs.writeFile(
    filePath,
    `export const ${fileName.replace(/\.ts$/, '').replace(/[^a-zA-Z0-9_]/g, '_')} = ${JSON.stringify(stamp)};\n`,
    'utf-8'
  );
  const add = await runCommand(dir, 'git', ['add', filePath]);
  assert.equal(add.code, 0, add.stderr || add.stdout);
  const commit = await runCommand(dir, 'git', ['commit', '-m', message]);
  assert.equal(commit.code, 0, commit.stderr || commit.stdout);
}

async function preparePrePrEvidenceCase(
  dir,
  {
    evidence,
    evidenceMode = undefined,
    outsideFile = false,
    reviewer = undefined,
  }
) {
  const fakeGh = await setupFakeGhCli(dir);
  await initRepo(dir);
  await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
  await syncIssueDraftMarker(dir, 123);
  await setStatus(path.join(featureDir(dir), 'pr.md'), 'Status', 'Ready');

  const extraCommitPaths = [];
  if (evidenceMode || reviewer) {
    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    if (evidenceMode) {
      config.workflow.prePrReview.evidenceMode = evidenceMode;
    }
    if (reviewer) {
      config.workflow.prePrReview.reviewer = reviewer;
    }
    await fs.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      'utf-8'
    );
    extraCommitPaths.push('docs/.lee-spec-kit.json');
  }
  if (outsideFile) {
    await fs.writeFile(path.join(dir, 'outside.md'), '# outside\n', 'utf-8');
    extraCommitPaths.push('outside.md');
  }

  const tasksPath = path.join(featureDir(dir), 'tasks.md');
  let tasks = await fs.readFile(tasksPath, 'utf-8');
  tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
  tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
  tasks = tasks.replace(
    '- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell',
    '- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell'
  );
  tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
  tasks = tasks.replace('- **Pre-PR Review**: Pending', '- **Pre-PR Review**: Done');
  tasks = tasks.replace(
    '- **Pre-PR Evidence**: -',
    `- **Pre-PR Evidence**: ${evidence}`
  );
  tasks = tasks.replace(
    '- **Pre-PR Decision**: -',
    '- **Pre-PR Decision**: decision: approve - baseline checklist completed'
  );
  tasks = tasks.replace(
    '| `pnpm vitest` | `-` | `-` |',
    '| `pnpm vitest` | `2026-04-16` | `PASS` |'
  );
  tasks = tasks.replace(
    "- [ ] All tasks are `[DONE]`, and each task's `Acceptance` is verified and `Checklist` is checked",
    "- [x] All tasks are `[DONE]`, and each task's `Acceptance` is verified and `Checklist` is checked"
  );
  tasks = tasks.replace(
    '- [ ] Tests executed and passing (record command/result below)',
    '- [x] Tests executed and passing (record command/result below)'
  );
  tasks = tasks.replace(
    '- [ ] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint',
    '- [x] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint'
  );
  await fs.writeFile(tasksPath, tasks, 'utf-8');

  const checkout = await runCommand(dir, 'git', [
    'checkout',
    '-b',
    'feat/123-alpha',
  ]);
  assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);
  await commitFeatureDocs(
    dir,
    'docs(#123): F001-alpha 문서 업데이트',
    extraCommitPaths
  );
  await commitTaskProject(dir);
  return fakeGh.env;
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
    assert.equal(payload.primaryActionLabel, 'A');
    assert.deepEqual(
      payload.actionOptions.map((option) => [option.label, option.reply]),
      [['A', 'A'], ['B', 'B']]
    );
    assert.match(payload.actionOptions[0].summary, /approve spec\.md/i);
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
    assert.equal(payload.approvalRequired, false);
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
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.blockedReasonCode, 'TASKS_NOT_READY');
  });
});

test('workflow-stage exposes local approval labels when tasks_approve is explicitly required', async () => {
  await withTempDir('lsk-workflow-stage-tasks-approve-labeled-', async (dir) => {
    await initRepo(dir);
    await setStatus(path.join(featureDir(dir), 'spec.md'), 'Status', 'Approved');
    await setStatus(path.join(featureDir(dir), 'plan.md'), 'Status', 'Approved');

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    await insertEnglishTaskBlock(tasksPath, 'TODO');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Doc Status**: -', '- **Doc Status**: Review');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['spec_approve', 'implementation_approve', 'tasks_approve'],
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'tasks');
    assert.equal(payload.nextAction.category, 'tasks_approve');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.primaryActionLabel, 'A');
    assert.deepEqual(
      payload.actionOptions.map((option) => [option.label, option.reply]),
      [['A', 'A'], ['B', 'B']]
    );
    assert.match(payload.actionOptions[0].summary, /approve tasks\.md/i);
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
    assert.equal(payload.primaryActionLabel, 'A');
    assert.deepEqual(
      payload.actionOptions.map((option) => [option.label, option.reply]),
      [['A', 'A OK'], ['B', 'B']]
    );
    assert.match(payload.actionOptions[0].command || '', /github issue .* --create --confirm OK/);
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

test('workflow-stage restores the task commit checkpoint before implementation approval', async () => {
  await withTempDir('lsk-workflow-stage-task-commit-dirty-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      ...(config.workflow || {}),
      taskCommitGate: 'strict',
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    tasks = tasks.replace('- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell', '- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell');
    tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'alpha.ts'), 'export const alpha = true;\n', 'utf-8');

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'task_commit');
    assert.equal(payload.nextAction.category, 'task_commit');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'TASK_COMMIT_REQUIRED');
    assert.match(payload.nextAction.summary, /Finish the task-level commit checkpoint/i);
    assert.match(payload.nextAction.summary, /docs\(#123\): F001-alpha/i);
    assert.match(payload.nextAction.summary, /feat\(#123\): implement alpha shell/i);
  });
});

test('workflow-stage blocks the next task when the latest task commit boundary is invalid in strict mode', async () => {
  await withTempDir('lsk-workflow-stage-task-commit-strict-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow = {
      ...(config.workflow || {}),
      taskCommitGate: 'strict',
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    tasks = tasks.replace(
      '- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell',
      `- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell
  - Date: 2026-04-16
  - Acceptance:
    - alpha shell renders
  - Checklist:
    - [x] add UI

- [TODO][NON-PRD] T-F001-alpha-02 implement beta shell
  - Date: 2026-04-16
  - Acceptance:
    - beta shell renders
  - Checklist:
    - [ ] add beta UI`
    );
    tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);

    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트', [
      'docs/.lee-spec-kit.json',
    ]);

    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'alpha.ts'), 'export const alpha = true;\n', 'utf-8');
    const addProject = await runCommand(dir, 'git', ['add', 'src/alpha.ts']);
    assert.equal(addProject.code, 0, addProject.stderr || addProject.stdout);
    const commitProject = await runCommand(dir, 'git', ['commit', '-m', 'feat(#123): unrelated topic']);
    assert.equal(commitProject.code, 0, commitProject.stderr || commitProject.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'task_commit');
    assert.equal(payload.nextAction.category, 'task_commit');
    assert.equal(payload.blockedReasonCode, 'TASK_COMMIT_REQUIRED');
    assert.match(payload.nextAction.summary, /latest project commit subject does not match the just-finished task/i);
  });
});

test('workflow-stage blocks multiple DONE transitions in one docs commit even in warn mode', async () => {
  await withTempDir('lsk-workflow-stage-task-commit-multi-done-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    tasks = tasks.replace(
      '- [TODO][NON-PRD] T-F001-alpha-01 implement alpha shell',
      `- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell
  - Date: 2026-04-16
  - Acceptance:
    - alpha shell renders
  - Checklist:
    - [x] add UI

- [DONE][NON-PRD] T-F001-alpha-02 implement beta shell
  - Date: 2026-04-16
  - Acceptance:
    - beta shell renders
  - Checklist:
    - [x] add beta UI

- [TODO][NON-PRD] T-F001-alpha-03 implement gamma shell
  - Date: 2026-04-16
  - Acceptance:
    - gamma shell renders
  - Checklist:
    - [ ] add gamma UI`
    );
    tasks = tasks.replace('- [ ] add UI', '- [x] add UI');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const checkout = await runCommand(dir, 'git', ['checkout', '-b', 'feat/123-alpha']);
    assert.equal(checkout.code, 0, checkout.stderr || checkout.stdout);
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir, 'feat(#123): implement beta shell', 'beta.ts');

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'task_commit');
    assert.equal(payload.nextAction.category, 'task_commit');
    assert.equal(payload.blockedReasonCode, 'TASK_COMMIT_REQUIRED');
    assert.match(payload.nextAction.summary, /latest tasks\.md commit includes 2 DONE transitions/i);
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

test('workflow-stage preserves the legacy strict preset worktree gate before config update', async () => {
  await withTempDir('lsk-workflow-stage-legacy-strict-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    delete config.workflow.mode;
    delete config.workflow.requireWorktree;
    config.workflow.preset = 'strict';
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'branch');
    assert.equal(payload.nextAction.category, 'branch_create');
    assert.match(payload.nextAction.command || '', /worktree add/);
  });
});

test('workflow-stage lets an explicit worktree setting override the legacy strict preset', async () => {
  await withTempDir('lsk-workflow-stage-legacy-strict-explicit-', async (dir) => {
    const fakeGh = await setupFakeGhCli(dir);
    await initRepo(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(featureDir(dir), 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    delete config.workflow.mode;
    config.workflow.preset = 'strict';
    config.workflow.requireWorktree = false;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'branch');
    assert.equal(payload.nextAction.category, 'branch_create');
    assert.equal(payload.nextAction.command, 'git checkout -b feat/123-alpha');
  });
});

test('workflow-stage uses managed worktree creation for standalone projects', async () => {
  await withTempDir('lsk-workflow-stage-standalone-worktree-', async (dir) => {
    const { projectRoot } = await initStandaloneRepo(dir);
    const fakeGh = await setupFakeGhCli(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const payload = await readStage(dir, fakeGh.env);
    const normalizedProjectRoot = await normalizePathForCompare(projectRoot);
    const normalizedWorkspaceRoot = await normalizePathForCompare(dir);
    assert.equal(payload.stage, 'branch');
    assert.equal(payload.nextAction.category, 'branch_create');
    assert.match(
      payload.nextAction.command || '',
      new RegExp(
        `git -C "${normalizedProjectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" worktree add "${path.join(normalizedWorkspaceRoot, '.worktrees', path.basename(normalizedProjectRoot)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      )
    );
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, false);
  });
});

test('workflow-stage copies project env files into a new managed worktree by default', async () => {
  await withTempDir('lsk-workflow-stage-standalone-worktree-env-', async (dir) => {
    const { projectRoot } = await initStandaloneRepo(dir);
    const fakeGh = await setupFakeGhCli(dir);
    await fs.writeFile(path.join(projectRoot, '.env'), 'DATABASE_URL=postgres://demo\n', 'utf-8');
    await fs.writeFile(path.join(projectRoot, '.env.local'), 'LOCAL_ONLY=1\n', 'utf-8');
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const payload = await readStage(dir, fakeGh.env);
    const normalizedProjectRoot = await normalizePathForCompare(projectRoot);
    const normalizedWorkspaceRoot = await normalizePathForCompare(dir);
    const expectedWorktreePath = path.join(
      normalizedWorkspaceRoot,
      '.worktrees',
      path.basename(normalizedProjectRoot),
      'feat-123-alpha'
    );
    assert.match(payload.nextAction.command || '', /cp -p "\$source_env" "\$target_env"/);
    assert.match(payload.nextAction.command || '', /"\$source_dir"\/\.env "\$source_dir"\/\.env\.\*/);
    assert.match(payload.nextAction.command || '', new RegExp(`"${expectedWorktreePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  });
});

test('workflow-stage removes stale managed worktree directories before adding the worktree', async () => {
  await withTempDir('lsk-workflow-stage-standalone-worktree-stale-', async (dir) => {
    const { projectRoot } = await initStandaloneRepo(dir);
    const fakeGh = await setupFakeGhCli(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const stalePath = path.join(dir, '.worktrees', path.basename(projectRoot), 'feat-123-alpha');
    await fs.mkdir(path.join(stalePath, '.next'), { recursive: true });

    const payload = await readStage(dir, fakeGh.env);
    const normalizedStalePath = await normalizePathForCompare(stalePath);
    assert.equal(payload.stage, 'branch');
    assert.equal(payload.nextAction.category, 'branch_create');
    assert.match(
      payload.nextAction.command || '',
      new RegExp(
        `rm -rf "${normalizedStalePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`
      )
    );
  });
});

test('workflow-stage uses the standalone managed worktree once it exists', async () => {
  await withTempDir('lsk-workflow-stage-standalone-worktree-active-', async (dir) => {
    const { projectRoot } = await initStandaloneRepo(dir);
    const fakeGh = await setupFakeGhCli(dir);
    await writePlanningReadyDocs(dir, { issueStatus: 'Ready' });
    await syncIssueDraftMarker(dir, 123);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    tasks = tasks.replace('- **Branch**: feat/-alpha', '- **Branch**: feat/123-alpha');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const worktreePath = path.join(dir, '.worktrees', path.basename(projectRoot), 'feat-123-alpha');
    const addResult = await runCommand(
      dir,
      'git',
      ['-C', projectRoot, 'worktree', 'add', '-b', 'feat/123-alpha', worktreePath],
      fakeGh.env
    );
    assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'implementation');
    assert.equal(payload.nextAction.category, 'task_execute');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, true);
    assert.equal(payload.blockedReasonCode, null);
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'implementation_approve');
    assert.equal(payload.nextAction.category, 'implementation_approve');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.primaryActionLabel, 'A');
    assert.deepEqual(
      payload.actionOptions.map((option) => [option.label, option.reply]),
      [['A', 'A'], ['B', 'B']]
    );
    assert.match(payload.actionOptions[0].summary, /approve the completed implementation/i);
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'pr');
    assert.equal(payload.nextAction.category, 'pr_create');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.primaryActionLabel, 'A');
    assert.deepEqual(
      payload.actionOptions.map((option) => [option.label, option.reply]),
      [['A', 'A OK'], ['B', 'B']]
    );
    assert.match(payload.actionOptions[0].command || '', /github pr .* --create --confirm OK/);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'PR_NOT_CREATED');
  });
});

test('workflow-stage Pre-PR evidence path_required rejects a missing file', async () => {
  await withTempDir('lsk-workflow-stage-pre-pr-missing-evidence-', async (dir) => {
    const env = await preparePrePrEvidenceCase(dir, {
      evidence: 'docs/features/F001-alpha/missing-review.md',
    });

    const payload = await readStage(dir, env);

    assert.equal(payload.stage, 'pre_pr_review');
    assert.equal(payload.blockedReasonCode, 'PRE_PR_REVIEW_NOT_APPROVED');
    assert.equal(payload.nextAction.executor, 'subagent');
    assert.equal(payload.nextAction.model, 'inherit');
    assert.equal(payload.nextAction.reasoningEffort, 'high');
    assert.equal(payload.nextAction.onUnavailable, 'inherit');
  });
});

test('workflow-stage exposes configured Pre-PR subagent model and reasoning effort', async () => {
  await withTempDir('lsk-workflow-stage-pre-pr-reviewer-', async (dir) => {
    const env = await preparePrePrEvidenceCase(dir, {
      evidence: 'docs/features/F001-alpha/missing-review.md',
      reviewer: {
        type: 'subagent',
        model: 'gpt-5.6-sol',
        reasoningEffort: 'xhigh',
        onUnavailable: 'error',
      },
    });

    const payload = await readStage(dir, env);

    assert.equal(payload.stage, 'pre_pr_review');
    assert.equal(payload.nextAction.executor, 'subagent');
    assert.equal(payload.nextAction.model, 'gpt-5.6-sol');
    assert.equal(payload.nextAction.reasoningEffort, 'xhigh');
    assert.equal(payload.nextAction.onUnavailable, 'error');
  });
});

test('workflow-stage Pre-PR evidence path_required accepts an existing docs file', async () => {
  await withTempDir('lsk-workflow-stage-pre-pr-existing-evidence-', async (dir) => {
    const env = await preparePrePrEvidenceCase(dir, {
      evidence: 'docs/features/F001-alpha/decisions.md',
    });

    const payload = await readStage(dir, env);

    assert.equal(payload.stage, 'pr');
    assert.equal(payload.nextAction.category, 'pr_create');
  });
});

test('workflow-stage Pre-PR evidence any accepts a non-path review note', async () => {
  await withTempDir('lsk-workflow-stage-pre-pr-any-evidence-', async (dir) => {
    const env = await preparePrePrEvidenceCase(dir, {
      evidence: 'review completed in this session',
      evidenceMode: 'any',
    });

    const payload = await readStage(dir, env);

    assert.equal(payload.stage, 'pr');
    assert.equal(payload.nextAction.category, 'pr_create');
  });
});

for (const outsideEvidence of ['../outside.md', 'ABSOLUTE_OUTSIDE_PATH']) {
  test(`workflow-stage Pre-PR evidence path_required rejects ${outsideEvidence}`, async () => {
    await withTempDir('lsk-workflow-stage-pre-pr-outside-evidence-', async (dir) => {
      const evidence =
        outsideEvidence === 'ABSOLUTE_OUTSIDE_PATH'
          ? path.join(dir, 'outside.md')
          : outsideEvidence;
      const env = await preparePrePrEvidenceCase(dir, {
        evidence,
        outsideFile: true,
      });

      const payload = await readStage(dir, env);

      assert.equal(payload.stage, 'pre_pr_review');
      assert.equal(payload.blockedReasonCode, 'PRE_PR_REVIEW_NOT_APPROVED');
    });
  });
}

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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

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
    const fakeGh = await setupFakeReviewGhCli(dir);
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.nextAction.category, 'code_review');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.blockedReasonCode, 'PR_REVIEW_NOT_APPROVED');
    assert.equal(payload.reviewState, 'waiting_review');
    assert.equal(payload.primaryActionLabel, 'A');
    assert.equal(payload.actionOptions.length, 2);
    assert.deepEqual(
      payload.actionOptions.map((option) => [option.label, option.reply]),
      [['A', 'A'], ['B', 'B']]
    );
    assert.match(payload.nextAction.summary, /review/i);
  });
});

test('workflow-stage allows automatic review-fix work when the remote PR has changes requested', async () => {
  await withTempDir('lsk-workflow-stage-code-review-changes-requested-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: 'CHANGES_REQUESTED',
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'changes_requested');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, true);
    assert.equal(payload.primaryActionLabel, undefined);
    assert.equal(payload.actionOptions, undefined);
    assert.match(payload.nextAction.summary, /requested review changes/i);
  });
});

test('workflow-stage distinguishes latest-head CodeRabbit rate limiting from generic waiting_review', async () => {
  await withTempDir('lsk-workflow-stage-code-review-rate-limited-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: '',
      headRefOid: 'fb7b80916cd91ba05b28db6a4240eb9adfc5fd93',
      latestReviews: [
        {
          author: { login: 'coderabbitai' },
          state: 'COMMENTED',
          submittedAt: '2026-04-17T09:11:15Z',
          body: 'older commented review',
        },
      ],
      comments: [
        {
          author: { login: 'coderabbitai' },
          createdAt: '2026-04-17T09:19:03Z',
          body: [
            '<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->',
            'Rate limit exceeded',
            'Reviewing files that changed between a150b25304fa9c50dc9f7a4e7da6c4576f844dfa and fb7b80916cd91ba05b28db6a4240eb9adfc5fd93.',
          ].join('\n'),
        },
      ],
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'review_rate_limited');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.primaryActionLabel, 'A');
    assert.match(payload.nextAction.summary, /rate limit/i);
    assert.match(payload.actionOptions[0].summary, /rate limit/i);
  });
});

test('workflow-stage distinguishes stale older CodeRabbit reviews from a fresh review on the latest commit', async () => {
  await withTempDir('lsk-workflow-stage-code-review-stale-latest-review-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: '',
      headRefOid: 'fb7b80916cd91ba05b28db6a4240eb9adfc5fd93',
      latestReviews: [
        {
          author: { login: 'coderabbitai' },
          state: 'COMMENTED',
          submittedAt: '2026-04-17T09:11:15Z',
          body: '**Actionable comments posted: 2**\n\nReviewing files that changed from the base of the PR and between afe75e8c42c030125b1d52199b079690d56b78f8 and a150b25304fa9c50dc9f7a4e7da6c4576f844dfa.',
        },
      ],
      comments: [],
      statusCheckRollup: [
        {
          __typename: 'StatusContext',
          context: 'CodeRabbit',
          state: 'SUCCESS',
        },
      ],
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'review_pending_latest_commit');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.primaryActionLabel, 'A');
    assert.match(payload.nextAction.summary, /latest PR commit/i);
    assert.match(payload.actionOptions[0].summary, /latest commit/i);
  });
});

test('workflow-stage exposes merge-handoff labels when the remote PR is approved but docs are not synced yet', async () => {
  await withTempDir('lsk-workflow-stage-code-review-approved-remote-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: 'APPROVED',
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'approved');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.primaryActionLabel, 'A');
    assert.match(payload.nextAction.summary, /approved PR review state/i);
    assert.deepEqual(
      payload.actionOptions.map((option) => [option.label, option.reply]),
      [['A', 'A'], ['B', 'B']]
    );
    assert.match(payload.actionOptions[0].summary, /continue to the merge gate/i);
  });
});

test('workflow-stage treats CodeRabbit actionable comments as changes requested even when its status check succeeds', async () => {
  await withTempDir('lsk-workflow-stage-code-review-coderabbit-success-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: '',
      latestReviews: [
        {
          author: { login: 'coderabbitai' },
          state: 'COMMENTED',
          body: '**Actionable comments posted: 2**\n\n_⚠️ Potential issue_ | _🔴 Critical_',
          submittedAt: '2026-04-26T09:36:56Z',
        },
      ],
      statusCheckRollup: [
        {
          __typename: 'StatusContext',
          context: 'CodeRabbit',
          state: 'SUCCESS',
        },
      ],
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'changes_requested');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, true);
    assert.equal(payload.primaryActionLabel, undefined);
    assert.equal(payload.actionOptions, undefined);
    assert.match(payload.nextAction.summary, /Address the requested review changes/i);
  });
});

test('workflow-stage treats resolved CodeRabbit actionable threads and successful check as approved', async () => {
  await withTempDir('lsk-workflow-stage-code-review-coderabbit-resolved-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: '',
      headRefOid: 'fb7b80916cd91ba05b28db6a4240eb9adfc5fd93',
      latestReviews: [
        {
          author: { login: 'coderabbitai' },
          state: 'COMMENTED',
          body: '**Actionable comments posted: 2**\n\nReviewing files that changed from the base of the PR and between afe75e8c42c030125b1d52199b079690d56b78f8 and a150b25304fa9c50dc9f7a4e7da6c4576f844dfa.',
          submittedAt: '2026-04-26T09:36:56Z',
        },
      ],
      reviewThreads: {
        nodes: [
          {
            isResolved: true,
            isOutdated: true,
            comments: {
              nodes: [
                {
                  author: { login: 'coderabbitai' },
                  body: '_⚠️ Potential issue_ | _🔴 Critical_\n\n✅ Addressed in commit ff5944d',
                },
              ],
            },
          },
          {
            isResolved: true,
            isOutdated: false,
            comments: {
              nodes: [
                {
                  author: { login: 'coderabbitai' },
                  body: '_⚠️ Potential issue_ | _🟠 Major_\n\n✅ Addressed in commit ff5944d',
                },
              ],
            },
          },
        ],
      },
      statusCheckRollup: [
        {
          __typename: 'StatusContext',
          context: 'CodeRabbit',
          state: 'SUCCESS',
        },
      ],
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'approved');
    assert.equal(payload.approvalRequired, true);
    assert.match(payload.nextAction.summary, /approved PR review state/i);
  });
});

test('workflow-stage treats CodeRabbit no-actionable issue comment and successful check as approved', async () => {
  await withTempDir('lsk-workflow-stage-code-review-coderabbit-no-actionable-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: '',
      latestReviews: [],
      comments: [
        {
          author: { login: 'coderabbitai' },
          body: 'No actionable comments were generated.',
          createdAt: '2026-04-26T09:36:56Z',
        },
      ],
      statusCheckRollup: [
        {
          __typename: 'StatusContext',
          context: 'CodeRabbit',
          state: 'SUCCESS',
        },
        {
          __typename: 'CheckRun',
          name: 'CodeRabbit files changed path filter',
          conclusion: 'WARNING',
        },
      ],
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'approved');
    assert.equal(payload.approvalRequired, true);
    assert.match(payload.nextAction.summary, /approved PR review state/i);
  });
});

test('workflow-stage does not skip to merge when stale docs say Approved but remote review requests changes', async () => {
  await withTempDir('lsk-workflow-stage-code-review-stale-approved-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: 'CHANGES_REQUESTED',
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'changes_requested');
    assert.equal(payload.nextAction.category, 'code_review');
    assert.equal(payload.approvalRequired, false);
    assert.equal(payload.implementationAllowed, true);
  });
});

test('workflow-stage keeps draft PRs in code_review even when docs say Approved', async () => {
  await withTempDir('lsk-workflow-stage-code-review-draft-pr-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: 'APPROVED',
      isDraft: true,
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'draft');
    assert.equal(payload.approvalRequired, true);
    assert.match(payload.nextAction.summary, /draft PR state/i);
  });
});

test('workflow-stage keeps already-merged remote PRs in code_review until docs are synced', async () => {
  await withTempDir('lsk-workflow-stage-code-review-merged-remote-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      state: 'MERGED',
      mergedAt: '2026-04-17T03:12:00Z',
      reviewDecision: 'APPROVED',
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'merged');
    assert.equal(payload.approvalRequired, true);
    assert.match(payload.nextAction.summary, /already-merged PR state/i);
    assert.match(
      payload.nextAction.command || '',
      /npx lee-spec-kit github pr F001-alpha --merge --confirm OK/
    );
    assert.equal(payload.actionOptions[0].category, 'review_sync_approved');
    assert.match(
      payload.actionOptions[0].command || '',
      /npx lee-spec-kit github pr F001-alpha --merge --confirm OK/
    );
  });
});

test('workflow-stage requires post-merge cleanup when the remote PR is already merged and docs are already synced', async () => {
  await withTempDir('lsk-workflow-stage-done-merged-remote-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      headRefName: 'feat/123-alpha',
      state: 'MERGED',
      mergedAt: '2026-04-17T03:12:00Z',
      reviewDecision: 'APPROVED',
    });
    await initRepo(dir);
    await setupLocalOriginRemote(dir);
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);
    const pushFeature = await runCommand(dir, 'git', ['push', '-u', 'origin', 'feat/123-alpha']);
    assert.equal(pushFeature.code, 0, pushFeature.stderr || pushFeature.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'cleanup');
    assert.equal(payload.reviewState, 'merged');
    assert.equal(payload.nextAction.category, 'merge_cleanup');
    assert.match(payload.nextAction.summary, /post-merge cleanup/i);
    assert.match(payload.nextAction.command, /branch -D "feat\/123-alpha"/);
    assert.match(payload.nextAction.command, /checkout "main"/);
    assert.match(payload.nextAction.command, /HUSKY=0 git -C ".+" push origin --delete "feat\/123-alpha"/);
    assert.equal(payload.approvalRequired, false);
  });
});

test('workflow-stage cleanup command force-removes managed worktrees only after meaningful file guard', async () => {
  await withTempDir('lsk-workflow-stage-cleanup-managed-worktree-safe-', async (dir) => {
    const { projectRoot } = await initStandaloneRepo(dir);
    const fakeGh = await setupFakeReviewGhCli(dir, {
      headRefName: 'feat/123-alpha',
      state: 'MERGED',
      mergedAt: '2026-04-17T03:12:00Z',
      reviewDecision: 'APPROVED',
    });
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

    const docsAdd = await runCommand(path.join(dir, 'docs'), 'git', [
      'add',
      'features/F001-alpha',
    ]);
    assert.equal(docsAdd.code, 0, docsAdd.stderr || docsAdd.stdout);
    const docsCommit = await runCommand(path.join(dir, 'docs'), 'git', [
      'commit',
      '-m',
      'docs(#123): F001-alpha 문서 업데이트',
    ]);
    assert.equal(docsCommit.code, 0, docsCommit.stderr || docsCommit.stdout);

    await fs.writeFile(path.join(projectRoot, '.gitignore'), '.next/\n', 'utf-8');
    const ignoreAdd = await runCommand(projectRoot, 'git', ['add', '.gitignore']);
    assert.equal(ignoreAdd.code, 0, ignoreAdd.stderr || ignoreAdd.stdout);
    const ignoreCommit = await runCommand(projectRoot, 'git', [
      'commit',
      '-m',
      'chore: ignore build artifacts',
    ]);
    assert.equal(ignoreCommit.code, 0, ignoreCommit.stderr || ignoreCommit.stdout);

    const worktreePath = path.join(dir, '.worktrees', path.basename(projectRoot), 'feat-123-alpha');
    const addResult = await runCommand(
      dir,
      'git',
      ['-C', projectRoot, 'worktree', 'add', '-b', 'feat/123-alpha', worktreePath],
      fakeGh.env
    );
    assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'cleanup');
    assert.equal(payload.nextAction.category, 'merge_cleanup');
    assert.match(payload.nextAction.command, /rev-parse --is-inside-work-tree/);
    assert.match(payload.nextAction.command, /status --porcelain --untracked-files=normal/);
    assert.match(payload.nextAction.command, /worktree remove --force/);
    assert.match(payload.nextAction.command, /leftover_meaningful=\$\(find/);
    assert.match(payload.nextAction.command, /worktree prune/);
    assert.match(payload.nextAction.command, /rm -rf/);

    await fs.mkdir(path.join(worktreePath, '.next', 'cache'), { recursive: true });
    await fs.writeFile(path.join(worktreePath, '.next', 'cache', 'build.txt'), 'artifact\n', 'utf-8');

    const cleanup = await runCommand(dir, 'sh', ['-c', payload.nextAction.command]);
    assert.equal(cleanup.code, 0, cleanup.stderr || cleanup.stdout);
    await assert.rejects(() => fs.access(worktreePath));
  });
});

test('workflow-stage reaches done only after merged PR cleanup is complete', async () => {
  await withTempDir('lsk-workflow-stage-done-after-merged-cleanup-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      headRefName: 'feat/123-alpha',
      state: 'MERGED',
      mergedAt: '2026-04-17T03:12:00Z',
      reviewDecision: 'APPROVED',
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const backToMain = await runCommand(dir, 'git', ['checkout', 'main']);
    assert.equal(backToMain.code, 0, backToMain.stderr || backToMain.stdout);
    const mergeFeature = await runCommand(dir, 'git', ['merge', '--ff-only', 'feat/123-alpha']);
    assert.equal(mergeFeature.code, 0, mergeFeature.stderr || mergeFeature.stdout);
    const deleteBranch = await runCommand(dir, 'git', ['branch', '-D', 'feat/123-alpha']);
    assert.equal(deleteBranch.code, 0, deleteBranch.stderr || deleteBranch.stdout);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'done');
    assert.equal(payload.reviewState, 'merged');
    assert.equal(payload.nextAction, null);
    assert.equal(payload.approvalRequired, false);
  });
});

test('workflow-stage fails closed to code_review when remote PR review state cannot be verified', async () => {
  await withTempDir('lsk-workflow-stage-code-review-remote-unknown-', async (dir) => {
    const fakeGh = await setupFailingPrViewGhCli(dir);
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'code_review');
    assert.equal(payload.reviewState, 'unknown');
    assert.equal(payload.approvalRequired, true);
  });
});

test('workflow-stage advances to merge only after PR review approval is recorded', async () => {
  await withTempDir('lsk-workflow-stage-merge-', async (dir) => {
    const fakeGh = await setupFakeReviewGhCli(dir, {
      reviewDecision: 'APPROVED',
    });
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
    await commitFeatureDocs(dir, 'docs(#123): F001-alpha 문서 업데이트');
    await commitTaskProject(dir);

    const payload = await readStage(dir, fakeGh.env);
    assert.equal(payload.stage, 'merge');
    assert.equal(payload.nextAction.category, 'pr_merge');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.implementationAllowed, false);
    assert.equal(payload.reviewState, 'approved');
    assert.equal(payload.primaryActionLabel, 'A');
    assert.equal(payload.actionOptions.length, 2);
    assert.deepEqual(
      payload.actionOptions.map((option) => [option.label, option.reply]),
      [['A', 'A OK'], ['B', 'B']]
    );
    assert.match(payload.actionOptions[0].command || '', /--merge --confirm OK/);
  });
});

test('workflow-stage respects explicit approval category overrides', async () => {
  await withTempDir('lsk-workflow-stage-approval-override-', async (dir) => {
    await initRepo(dir);
    await setStatus(path.join(featureDir(dir), 'spec.md'), 'Status', 'Approved');
    await setStatus(path.join(featureDir(dir), 'plan.md'), 'Status', 'Review');

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = {
      mode: 'category',
      default: 'skip',
      requireCheckCategories: ['spec_approve', 'implementation_approve', 'plan_approve'],
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'plan');
    assert.equal(payload.nextAction.category, 'plan_approve');
    assert.equal(payload.approvalRequired, true);
    assert.equal(payload.primaryActionLabel, 'A');
    assert.deepEqual(
      payload.actionOptions.map((option) => [option.label, option.reply]),
      [['A', 'A'], ['B', 'B']]
    );
    assert.match(payload.actionOptions[0].summary, /approve plan\.md/i);
  });
});

test('workflow-stage treats legacy builtin approval mode like the old default auto policy', async () => {
  await withTempDir('lsk-workflow-stage-builtin-approval-', async (dir) => {
    await initRepo(dir);
    await setStatus(path.join(featureDir(dir), 'spec.md'), 'Status', 'Approved');
    await setStatus(path.join(featureDir(dir), 'plan.md'), 'Status', 'Review');

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = { mode: 'builtin' };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'plan');
    assert.equal(payload.nextAction.category, 'plan_approve');
    assert.equal(payload.approvalRequired, false);
  });
});

test('workflow-stage defaults category approval configs without a default field to skip', async () => {
  await withTempDir('lsk-workflow-stage-category-default-skip-', async (dir) => {
    await initRepo(dir);
    await setStatus(path.join(featureDir(dir), 'spec.md'), 'Status', 'Approved');
    await setStatus(path.join(featureDir(dir), 'plan.md'), 'Status', 'Review');

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.approval = {
      mode: 'category',
      requireCheckCategories: ['spec_approve', 'implementation_approve'],
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const payload = await readStage(dir);
    assert.equal(payload.stage, 'plan');
    assert.equal(payload.nextAction.category, 'plan_approve');
    assert.equal(payload.approvalRequired, false);
  });
});

test('workflow-stage skips GitHub gates for the local workflow', async () => {
  await withTempDir('lsk-workflow-stage-local-', async (dir) => {
    await initRepo(dir, { workflow: 'local' });

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    delete config.workflow.mode;
    config.workflow.preset = 'local';
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

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
    await commitFeatureDocs(dir, 'docs: F001-alpha 문서 업데이트', [
      'docs/.lee-spec-kit.json',
    ]);
    await commitTaskProject(dir, 'feat(F001-alpha): implement alpha shell');

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

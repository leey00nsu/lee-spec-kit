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

test('init --non-interactive works with explicit flags without --yes', async () => {
  await withTempDir('lsk-init-noninteractive-', async (dir) => {
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
    const configRaw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configRaw);

    assert.equal(config.projectName, 'demo');
    assert.equal(config.projectType, 'single');
    assert.equal(config.lang, 'en');
    assert.equal(config.workflow?.mode, 'local');
  });
});

test('init --non-interactive defaults to multi with app component', async () => {
  await withTempDir('lsk-init-default-multi-', async (dir) => {
    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
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
    assert.equal(config.projectType, 'multi');
    assert.deepEqual(config.components, ['app']);
  });
});

test('feature auto-selects the only component in multi mode', async () => {
  await withTempDir('lsk-feature-auto-component-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--lang',
      'en',
      '--workflow',
      'local',
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

    const featureDir = path.join(dir, 'docs', 'features', 'app', 'F001-alpha');
    const exists = await fs.stat(featureDir);
    assert.equal(exists.isDirectory(), true);
  });
});

test('init standalone non-interactive supports explicit standalone options', async () => {
  await withTempDir('lsk-init-standalone-', async (dir) => {
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
      '--docs-repo',
      'standalone',
      '--project-root',
      '/tmp/project-root',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.docsRepo, 'standalone');
    assert.equal(config.projectRoot, '/tmp/project-root');
    assert.equal(config.pushDocs, false);
  });
});

test('init standalone multi supports custom components with component project roots', async () => {
  await withTempDir('lsk-init-standalone-multi-custom-', async (dir) => {
    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'fe,be,worker',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--docs-repo',
      'standalone',
      '--component-project-roots',
      'fe=/tmp/fe,be=/tmp/be,worker=/tmp/worker',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.docsRepo, 'standalone');
    assert.equal(config.projectType, 'multi');
    assert.deepEqual(config.components, ['fe', 'be', 'worker']);
    assert.deepEqual(config.projectRoot, {
      fe: '/tmp/fe',
      be: '/tmp/be',
      worker: '/tmp/worker',
    });
  });
});

test('init standalone multi requires project roots for every component', async () => {
  await withTempDir('lsk-init-standalone-multi-roots-required-', async (dir) => {
    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'fe,be,worker',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--docs-repo',
      'standalone',
      '--component-project-roots',
      'fe=/tmp/fe,be=/tmp/be',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /\[PROMPT_BLOCKED\]/);
    assert.match(result.stderr, /worker/);
  });
});

test('init non-interactive can overwrite non-empty directory with --force', async () => {
  await withTempDir('lsk-init-force-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, 'keep.txt'), 'x\n', 'utf-8');

    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--force',
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
  });
});

test('fullstack init supports custom components and feature --component', async () => {
  await withTempDir('lsk-components-custom-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'fullstack',
      '--components',
      'fe,be,worker',
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
    assert.equal(config.projectType, 'multi');
    assert.deepEqual(config.components, ['fe', 'be', 'worker']);

    const featureResult = await runCli(dir, [
      'feature',
      'queue-jobs',
      '--component',
      'worker',
      '--id',
      'F001',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const featureDir = path.join(dir, 'docs', 'features', 'worker', 'F001-queue-jobs');
    const exists = await fs.stat(featureDir);
    assert.equal(exists.isDirectory(), true);

    const status = await runCli(dir, ['status', '--json']);
    assert.equal(status.code, 0, status.stderr || status.stdout);
    const payload = JSON.parse(status.stdout.trim());
    assert.equal(payload.features[0].repo, 'demo-worker');
  });
});

test('feature --component rejects unknown component in fullstack project', async () => {
  await withTempDir('lsk-components-invalid-', async (dir) => {
    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'fullstack',
      '--components',
      'fe,be,worker',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const featureResult = await runCli(dir, [
      'feature',
      'queue-jobs',
      '--component',
      'mobile',
    ]);
    assert.equal(featureResult.code, 1);
    assert.match(featureResult.stderr, /\[INVALID_ARGUMENT\]/);
  });
});

test('github issue --create requires --confirm OK', async () => {
  await withTempDir('lsk-github-issue-confirm-required-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-issue-body.md');
    await writeIssueBodyWithoutTodo(bodyFile);

    const result = await runCli(dir, [
      'github',
      'issue',
      'F001-alpha',
      '--create',
      '--body-file',
      bodyFile,
      '--json',
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'APPROVAL_REQUIRED');
  });
});

test('github issue --create succeeds with --confirm OK', async () => {
  await withTempDir('lsk-github-issue-confirm-ok-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-issue-body.md');
    await writeIssueBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'issue',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'ISSUE_CREATED');
    assert.match(String(payload.issueUrl || ''), /\/issues\/123$/);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(log, /^issue create /m);
  });
});

test('github issue default title uses overview summary instead of docs-update suffix', async () => {
  await withTempDir('lsk-github-issue-default-title-summary-', async (dir) => {
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

    const featureResult = await runCli(dir, [
      'feature',
      'daily-theme-hall-of-fame',
      '--id',
      'F013',
      '--desc',
      'Reflect daily winners in hall of fame',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-issue-body.md');
    await writeIssueBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'issue',
        'F013-daily-theme-hall-of-fame',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(
      log,
      /--title daily-theme-hall-of-fame \(Reflect daily winners in hall of fame\)/
    );
    assert.doesNotMatch(log, /documentation update/);
  });
});

test('github issue --create runs gh from standalone project root', async () => {
  await withTempDir('lsk-github-issue-standalone-cwd-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    const docsRoot = path.join(dir, 'docs-repo');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(docsRoot, { recursive: true });

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

    const featureResult = await runCli(docsRoot, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(docsRoot, 'tmp-issue-body.md');
    await writeIssueBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      docsRoot,
      [
        'github',
        'issue',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'ISSUE_CREATED');

    const cwdLog = await fs.readFile(fakeGh.cwdLogPath, 'utf-8');
    const invocations = cwdLog
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const normalizedInvocations = await Promise.all(
      invocations.map((invocation) => normalizePathForCompare(invocation))
    );
    const expectedCwd = await normalizePathForCompare(projectRoot);
    assert.deepEqual([...new Set(normalizedInvocations)], [expectedCwd]);
  });
});

test('github issue --create blocks TODO placeholders even with approval', async () => {
  await withTempDir('lsk-github-issue-todo-block-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-issue-body-todo.md');
    await writeIssueBodyWithoutTodo(bodyFile);
    const bodyWithTodo = (await fs.readFile(bodyFile, 'utf-8')).replace(
      '- [ ] Define explicit user impact.',
      '- [ ] TODO: Define explicit user impact.'
    );
    await fs.writeFile(bodyFile, bodyWithTodo, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'issue',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(payload.error, /TODO placeholders/i);

    const logExists = await pathExists(fakeGh.logPath);
    assert.equal(logExists, false);
  });
});

test('github help is localized based on docs language (ko)', async () => {
  await withTempDir('lsk-github-help-lang-ko-', async (dir) => {
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

    const help = await runCli(dir, ['--no-banner', 'github', 'issue', '--help']);
    assert.equal(help.code, 0, help.stderr || help.stdout);
    assert.match(help.stdout, /feature 문서 기반 GitHub issue 본문 생성\/생성/);
    assert.match(help.stdout, /에이전트용 JSON 형식으로 출력/);
    assert.doesNotMatch(help.stdout, /Output in JSON format for agents/);
  });
});

test('github issue body template uses Korean template when config lang is ko', async () => {
  await withTempDir('lsk-github-issue-ko-template-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const result = await runCli(dir, ['github', 'issue', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'ISSUE_TEMPLATE_GENERATED');
    assert.equal(typeof payload.body, 'string');

    const body = await fs.readFile(payload.bodyFile, 'utf-8');
    assert.equal(payload.body, body);
    assert.match(body, /^## 개요$/m);
    assert.match(body, /^## 목표$/m);
    assert.match(body, /^## 완료 기준$/m);
    assert.match(body, /^## 관련 문서$/m);
    assert.match(body, /^## 라벨$/m);
    assert.doesNotMatch(body, /^## Overview$/m);
  });
});

test('github pr body template uses Korean template when config lang is ko', async () => {
  await withTempDir('lsk-github-pr-ko-template-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const result = await runCli(dir, ['github', 'pr', 'F001-alpha', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PR_TEMPLATE_GENERATED');
    assert.equal(typeof payload.body, 'string');

    const body = await fs.readFile(payload.bodyFile, 'utf-8');
    assert.equal(payload.body, body);
    assert.match(body, /^## 개요$/m);
    assert.match(body, /^## 변경 사항$/m);
    assert.match(body, /^## 테스트$/m);
    assert.match(body, /^### 실행한 테스트$/m);
    assert.match(body, /^## 관련 문서$/m);
    assert.doesNotMatch(body, /^## Overview$/m);
  });
});

test('github pr body template includes artifact sections when modes are on', async () => {
  await withTempDir('lsk-github-pr-artifact-modes-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const result = await runCli(dir, [
      'github',
      'pr',
      'F001-alpha',
      '--json',
      '--screenshots',
      'on',
      '--mermaid',
      'on',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PR_TEMPLATE_GENERATED');
    assert.equal(payload.artifactPolicy?.screenshots, true);
    assert.equal(payload.artifactPolicy?.mermaid, true);
    assert.match(payload.body, /^## Screenshots$/m);
    assert.match(payload.body, /^## Architecture Diagram$/m);
    assert.match(payload.body, /```mermaid/);
  });
});

test('github issue/pr body templates derive overview from spec with docs-root paths', async () => {
  await withTempDir('lsk-github-overview-from-spec-', async (dir) => {
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

    const featureResult = await runCli(dir, [
      'feature',
      'alpha',
      '--id',
      'F001',
      '--desc',
      'Allow users to sign in with email and password.',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const issueResult = await runCli(dir, ['github', 'issue', 'F001-alpha', '--json']);
    assert.equal(issueResult.code, 0, issueResult.stderr || issueResult.stdout);
    const issuePayload = JSON.parse(issueResult.stdout.trim());
    assert.equal(issuePayload.status, 'ok');
    assert.equal(issuePayload.reasonCode, 'ISSUE_TEMPLATE_GENERATED');
    assert.match(issuePayload.body, /Allow users to sign in with email and password\./);
    assert.doesNotMatch(issuePayload.body, /TODO:/);
    assert.match(issuePayload.body, /^## Goals$/m);
    assert.match(issuePayload.body, /^## Completion Criteria$/m);
    const goalsSection = issuePayload.body.match(
      /^## Goals\s*\n\n([\s\S]*?)\n\n## Completion Criteria$/m
    );
    assert.ok(goalsSection);
    const goalCount = (goalsSection[1].match(/^- \[ \] /gm) || []).length;
    assert.ok(goalCount >= 3);

    const criteriaSection = issuePayload.body.match(
      /^## Completion Criteria\s*\n\n([\s\S]*?)\n\n## Related Documents$/m
    );
    assert.ok(criteriaSection);
    const criteriaCount = (criteriaSection[1].match(/^- \[ \] /gm) || []).length;
    assert.ok(criteriaCount >= 4);
    assert.match(issuePayload.body, /`docs\/features\/F001-alpha\/spec\.md`/);
    assert.match(issuePayload.body, /`docs\/features\/F001-alpha\/plan\.md`/);
    assert.match(issuePayload.body, /`docs\/features\/F001-alpha\/tasks\.md`/);
    assert.doesNotMatch(issuePayload.body, /Finalize feature scope and implementation outcome/);

    const prResult = await runCli(dir, ['github', 'pr', 'F001-alpha', '--json']);
    assert.equal(prResult.code, 0, prResult.stderr || prResult.stdout);
    const prPayload = JSON.parse(prResult.stdout.trim());
    assert.equal(prPayload.status, 'ok');
    assert.equal(prPayload.reasonCode, 'PR_TEMPLATE_GENERATED');
    assert.match(prPayload.body, /Allow users to sign in with email and password\./);
    assert.doesNotMatch(prPayload.body, /TODO:/);
    assert.match(prPayload.body, /^## Changes$/m);
    assert.match(prPayload.body, /^## Tests$/m);
    const changesSection = prPayload.body.match(
      /^## Changes\s*\n\n([\s\S]*?)\n\n## Tests$/m
    );
    assert.ok(changesSection);
    const changesCount = (changesSection[1].match(/^- \[ \] /gm) || []).length;
    assert.ok(changesCount >= 3);

    const testsSection = prPayload.body.match(
      /^### Tests Run\s*\n\n([\s\S]*?)\n\n## Related Documents$/m
    );
    assert.ok(testsSection);
    const testsCount = (testsSection[1].match(/^- \[ \] /gm) || []).length;
    assert.ok(testsCount >= 2);
    assert.match(prPayload.body, /`docs\/features\/F001-alpha\/spec\.md`/);
    assert.match(prPayload.body, /`docs\/features\/F001-alpha\/tasks\.md`/);
    assert.doesNotMatch(prPayload.body, /Deliver implementation for the feature scope/);
  });
});

test('github body template files are project-scoped and overwritten by default', async () => {
  await withTempDir('lsk-github-body-file-default-', async (dir) => {
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

    const featureA = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureA.code, 0, featureA.stderr || featureA.stdout);

    const featureB = await runCli(dir, ['feature', 'beta', '--id', 'F002']);
    assert.equal(featureB.code, 0, featureB.stderr || featureB.stdout);

    const issueAResult = await runCli(dir, ['github', 'issue', 'F001-alpha', '--json']);
    assert.equal(issueAResult.code, 0, issueAResult.stderr || issueAResult.stdout);
    const issueA = JSON.parse(issueAResult.stdout.trim());

    const issueBResult = await runCli(dir, ['github', 'issue', 'F002-beta', '--json']);
    assert.equal(issueBResult.code, 0, issueBResult.stderr || issueBResult.stdout);
    const issueB = JSON.parse(issueBResult.stdout.trim());

    assert.equal(issueA.bodyFile, issueB.bodyFile);
    assert.match(path.basename(issueA.bodyFile), /^lee-spec-kit\.[0-9a-f]{12}\.issue\.md$/);

    const issueBody = await fs.readFile(issueB.bodyFile, 'utf-8');
    assert.match(issueBody, /F002-beta/);
    assert.doesNotMatch(issueBody, /F001-alpha/);

    const prAResult = await runCli(dir, ['github', 'pr', 'F001-alpha', '--json']);
    assert.equal(prAResult.code, 0, prAResult.stderr || prAResult.stdout);
    const prA = JSON.parse(prAResult.stdout.trim());

    const prBResult = await runCli(dir, ['github', 'pr', 'F002-beta', '--json']);
    assert.equal(prBResult.code, 0, prBResult.stderr || prBResult.stdout);
    const prB = JSON.parse(prBResult.stdout.trim());

    assert.equal(prA.bodyFile, prB.bodyFile);
    assert.match(path.basename(prA.bodyFile), /^lee-spec-kit\.[0-9a-f]{12}\.pr\.md$/);

    const prBody = await fs.readFile(prB.bodyFile, 'utf-8');
    assert.match(prBody, /F002-beta/);
    assert.doesNotMatch(prBody, /F001-alpha/);
  });
});

test('github pr --create requires --confirm OK', async () => {
  await withTempDir('lsk-github-pr-confirm-required-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-pr-body.md');
    await writePrBodyWithoutTodo(bodyFile);

    const result = await runCli(dir, [
      'github',
      'pr',
      'F001-alpha',
      '--create',
      '--body-file',
      bodyFile,
      '--json',
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'APPROVAL_REQUIRED');
  });
});

test('github pr --create runs gh from standalone project root', async () => {
  await withTempDir('lsk-github-pr-standalone-cwd-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    const docsRoot = path.join(dir, 'docs-repo');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(docsRoot, { recursive: true });

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

    const featureResult = await runCli(docsRoot, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(docsRoot, 'tmp-pr-body.md');
    await writePrBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      docsRoot,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PR_CREATED_SYNCED');

    const cwdLog = await fs.readFile(fakeGh.cwdLogPath, 'utf-8');
    const invocations = cwdLog
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const normalizedInvocations = await Promise.all(
      invocations.map((invocation) => normalizePathForCompare(invocation))
    );
    const expectedCwd = await normalizePathForCompare(projectRoot);
    assert.deepEqual([...new Set(normalizedInvocations)], [expectedCwd]);
  });
});

test('github pr --create --commit-sync skips docs push when standalone pushDocs=false', async () => {
  await withTempDir('lsk-github-pr-standalone-no-docs-push-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    const docsRoot = path.join(dir, 'docs-repo');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(docsRoot, { recursive: true });

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

    const configPath = path.join(docsRoot, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(config.docsRepo, 'standalone');
    assert.equal(config.pushDocs, false);

    const featureResult = await runCli(docsRoot, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(docsRoot, 'tmp-pr-body.md');
    await writePrBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const createResult = await runCli(
      docsRoot,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--commit-sync',
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(createResult.code, 0, createResult.stderr || createResult.stdout);
    const payload = JSON.parse(createResult.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PR_CREATED_SYNCED');

    const docsGitRoot = path.join(docsRoot, 'docs');
    const remoteList = await runCommand(docsGitRoot, 'git', ['remote']);
    assert.equal(remoteList.code, 0, remoteList.stderr || remoteList.stdout);
    assert.equal(remoteList.stdout.trim(), '');
  });
});

test('github pr --create blocks TODO placeholders even with approval', async () => {
  await withTempDir('lsk-github-pr-todo-block-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-pr-body-todo.md');
    await writePrBodyWithoutTodo(bodyFile);
    const bodyWithTodo = (await fs.readFile(bodyFile, 'utf-8')).replace(
      '- [ ] Summarize main implementation changes.',
      '- [ ] TODO: Summarize main implementation changes.'
    );
    await fs.writeFile(bodyFile, bodyWithTodo, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(payload.error, /TODO placeholders/i);

    const logExists = await pathExists(fakeGh.logPath);
    assert.equal(logExists, false);
  });
});

test('github pr --create enforces screenshot/mermaid sections when mode is on', async () => {
  await withTempDir('lsk-github-pr-artifacts-enforced-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-pr-body-missing-artifacts.md');
    await writePrBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const screenshotMissing = await runCli(
      dir,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        bodyFile,
        '--confirm',
        'OK',
        '--screenshots',
        'on',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(
      screenshotMissing.code,
      1,
      screenshotMissing.stderr || screenshotMissing.stdout
    );
    const screenshotPayload = JSON.parse(screenshotMissing.stdout.trim());
    assert.equal(screenshotPayload.status, 'error');
    assert.equal(screenshotPayload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(screenshotPayload.error, /Screenshots/i);

    const mermaidBodyFile = path.join(dir, 'tmp-pr-body-missing-mermaid.md');
    const bodyWithDiagram = await fs.readFile(bodyFile, 'utf-8');
    const bodyWithoutDiagram = bodyWithDiagram.replace(
      /## Architecture Diagram[\s\S]*?```[\s\S]*?```[\t ]*\n?/,
      ''
    );
    await fs.writeFile(mermaidBodyFile, bodyWithoutDiagram, 'utf-8');

    const mermaidMissing = await runCli(
      dir,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        mermaidBodyFile,
        '--confirm',
        'OK',
        '--mermaid',
        'on',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(
      mermaidMissing.code,
      1,
      mermaidMissing.stderr || mermaidMissing.stdout
    );
    const mermaidPayload = JSON.parse(mermaidMissing.stdout.trim());
    assert.equal(mermaidPayload.status, 'error');
    assert.equal(mermaidPayload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(mermaidPayload.error, /Architecture Diagram/i);

    const logExists = await pathExists(fakeGh.logPath);
    assert.equal(logExists, false);
  });
});

test('github pr --merge requires --confirm OK and does not mutate tasks.md', async () => {
  await withTempDir('lsk-github-pr-merge-confirm-required-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const before = await fs.readFile(tasksPath, 'utf-8');

    const result = await runCli(dir, [
      'github',
      'pr',
      'F001-alpha',
      '--pr',
      'https://github.com/acme/repo/pull/77',
      '--merge',
      '--json',
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'APPROVAL_REQUIRED');

    const after = await fs.readFile(tasksPath, 'utf-8');
    assert.equal(after, before);
  });
});

test('github pr --merge infers PR ref from tasks.md PR link when available', async () => {
  await withTempDir('lsk-github-pr-merge-infer-pr-ref-', async (dir) => {
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

    const featureResult = await runCli(dir, ['feature', 'alpha', '--id', 'F001']);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const before = await fs.readFile(tasksPath, 'utf-8');
    const withPrLink = before.replace(
      '- **PR**: -',
      '- **PR**: https://github.com/acme/repo/pull/77'
    );
    await fs.writeFile(tasksPath, withPrLink, 'utf-8');

    const result = await runCli(dir, [
      'github',
      'pr',
      'F001-alpha',
      '--merge',
      '--json',
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'APPROVAL_REQUIRED');
  });
});

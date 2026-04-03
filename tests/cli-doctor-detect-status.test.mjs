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

test('doctor --json error includes reasonCode and labeled suggestions', async () => {
  await withTempDir('lsk-doctor-error-json-', async (dir) => {
    const result = await runCli(dir, ['doctor', '--json']);
    assert.equal(result.code, 1);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'CONFIG_NOT_FOUND');
    assert.ok(Array.isArray(payload.suggestions));
    assert.equal(payload.suggestions.length > 0, true);
    assert.equal(payload.suggestions[0].label, 'A');
  });
});

test('detect --json reports PROJECT_NOT_DETECTED on empty workspace', async () => {
  await withTempDir('lsk-detect-empty-', async (dir) => {
    const result = await runCli(dir, ['detect', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PROJECT_NOT_DETECTED');
    assert.equal(payload.isLeeSpecKitProject, false);
    assert.equal(payload.docsDir, null);
    assert.equal(payload.configPath, null);
    assert.equal(payload.configFilePresent, false);
    assert.equal(payload.detectionSource, null);
    assert.equal(payload.projectType, null);
    assert.equal(payload.lang, null);
  });
});

test('detect --json reports PROJECT_DETECTED via config file', async () => {
  await withTempDir('lsk-detect-config-', async (dir) => {
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

    const result = await runCli(dir, ['detect', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    const detectedDocsDir = await normalizePathForCompare(payload.docsDir);
    const expectedDocsDir = await normalizePathForCompare(path.join(dir, 'docs'));
    const detectedConfigPath = await normalizePathForCompare(payload.configPath);
    const expectedConfigPath = await normalizePathForCompare(
      path.join(dir, 'docs', '.lee-spec-kit.json')
    );
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PROJECT_DETECTED');
    assert.equal(payload.isLeeSpecKitProject, true);
    assert.equal(detectedDocsDir, expectedDocsDir);
    assert.equal(detectedConfigPath, expectedConfigPath);
    assert.equal(payload.configFilePresent, true);
    assert.equal(payload.detectionSource, 'config');
    assert.equal(payload.projectType, 'single');
    assert.equal(payload.lang, 'en');
    assert.equal(payload.projectName, 'demo');
  });
});

test('detect --json reports PROJECT_DETECTED via folder heuristics', async () => {
  await withTempDir('lsk-detect-heuristic-', async (dir) => {
    await fs.mkdir(path.join(dir, 'docs', 'agents'), { recursive: true });
    await fs.mkdir(path.join(dir, 'docs', 'features'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'agents', 'custom.md'),
      '한국어 힌트 문서\n',
      'utf-8'
    );

    const result = await runCli(dir, ['detect', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    const detectedDocsDir = await normalizePathForCompare(payload.docsDir);
    const expectedDocsDir = await normalizePathForCompare(path.join(dir, 'docs'));
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PROJECT_DETECTED');
    assert.equal(payload.isLeeSpecKitProject, true);
    assert.equal(detectedDocsDir, expectedDocsDir);
    assert.equal(payload.configPath, null);
    assert.equal(payload.configFilePresent, false);
    assert.equal(payload.detectionSource, 'heuristic');
    assert.equal(payload.projectType, 'single');
    assert.equal(payload.lang, 'ko');
  });
});

test('doctor --dry-run without --fix returns INVALID_ARGUMENT', async () => {
  await withTempDir('lsk-doctor-dryrun-invalid-', async (dir) => {
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

    const result = await runCli(dir, ['doctor', '--dry-run']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[INVALID_ARGUMENT\]/);
  });
});

test('doctor --fix --dry-run reports fixes without modifying files', async () => {
  await withTempDir('lsk-doctor-fix-dryrun-', async (dir) => {
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
    await fs.writeFile(
      specPath,
      `# Feature Spec: alpha

## Overview

- **Feature ID**: F001
- **Feature Name**: alpha
- **Created**: 2026-02-08
- **Status**: Review
- Placeholder: {Story Title}
`,
      'utf-8'
    );
    const before = await fs.readFile(specPath, 'utf-8');

    const result = await runCli(dir, ['doctor', '--fix', '--dry-run', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.fixes.enabled, true);
    assert.equal(payload.fixes.dryRun, true);
    assert.equal(payload.fixes.changedFiles > 0, true);

    const after = await fs.readFile(specPath, 'utf-8');
    assert.equal(after, before);
  });
});

test('doctor --fix applies safe fixes to tasks doc status', async () => {
  await withTempDir('lsk-doctor-fix-apply-', async (dir) => {
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

## Local Tracking

- **Repo**: demo
- **Branch**: feat/1-alpha

## Task List

- [TODO] T-F001-alpha-01 example
`,
      'utf-8'
    );

    const result = await runCli(dir, ['doctor', '--fix', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.fixes.enabled, true);
    assert.equal(payload.fixes.dryRun, false);
    assert.equal(payload.fixes.changedFiles > 0, true);

    const tasksAfter = await fs.readFile(tasksPath, 'utf-8');
    assert.match(tasksAfter, /\*\*Doc Status\*\*:\s*Review/);
  });
});

test('doctor --json warns when tasks use invented PRD IDs without source definitions', async () => {
  await withTempDir('lsk-doctor-prd-mapping-warning-', async (dir) => {
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

    const featureDir = path.join(dir, 'docs', 'features', 'F001-alpha');
    const tasksPath = path.join(featureDir, 'tasks.md');
    await fs.writeFile(
      tasksPath,
      `# Tasks: alpha

## GitHub Issue

- **Doc Status**: Review

## Task List

- [TODO][P1][PRD-FR-001] T-F001-01 implement alpha
`,
      'utf-8'
    );

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.status, 'warn');
    assert.equal(
      payload.issues.some((issue) => issue.code === 'tasks_prd_tag_unknown'),
      true
    );
    const issue = payload.issues.find((entry) => entry.code === 'tasks_prd_tag_unknown');
    assert.match(String(issue?.message || ''), /PRD-FR-001/);
    assert.match(String(issue?.message || ''), /backfill/i);
  });
});

test('doctor --json warns on unmanaged docs entries outside the canonical docs surface', async () => {
  await withTempDir('lsk-doctor-unmanaged-docs-', async (dir) => {
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

    await fs.mkdir(path.join(dir, 'docs', 'plans'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'plans', 'external-plan.md'),
      '# External plan\n',
      'utf-8'
    );

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(payload.status, 'warn');
    assert.equal(
      payload.issues.some((issue) => issue.code === 'unmanaged_docs_entry'),
      true
    );
    const issue = payload.issues.find((entry) => entry.code === 'unmanaged_docs_entry');
    assert.match(String(issue?.message || ''), /docs\/plans/);
    assert.match(String(issue?.message || ''), /feature-local docs|normalize/i);
  });
});

test('doctor ignores unmanaged docs entries that are explicitly allowed in config', async () => {
  await withTempDir('lsk-doctor-unmanaged-docs-allowed-', async (dir) => {
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
    config.allowedDocsEntries = { dirs: ['plans'] };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    await fs.mkdir(path.join(dir, 'docs', 'plans'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'plans', 'external-plan.md'),
      '# External plan\n',
      'utf-8'
    );

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(
      payload.issues.some((issue) => issue.code === 'unmanaged_docs_entry'),
      false
    );
  });
});

test('doctor treats docs/AGENTS.md as part of the managed docs surface', async () => {
  await withTempDir('lsk-doctor-managed-docs-agents-', async (dir) => {
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

    await fs.writeFile(
      path.join(dir, 'docs', 'AGENTS.md'),
      '# Project Agents\n',
      'utf-8'
    );

    const doctor = await runCli(dir, ['doctor', '--json']);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
    const payload = JSON.parse(doctor.stdout.trim());
    assert.equal(
      payload.issues.some((issue) => issue.code === 'unmanaged_docs_entry'),
      false
    );
  });
});

test('status text-mode errors include reason code and labeled next options', async () => {
  await withTempDir('lsk-status-error-text-', async (dir) => {
    const result = await runCli(dir, ['status']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[CONFIG_NOT_FOUND\]/);
    assert.match(result.stderr, /Next Options \(Error\)/);
    assert.match(result.stderr, /\n\s*A\. /);
  });
});

test('status --json returns NO_FEATURES on initialized empty docs', async () => {
  await withTempDir('lsk-status-json-', async (dir) => {
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

    const result = await runCli(dir, ['status', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'NO_FEATURES');
  });
});

test('local workflow templates reduce issue/pr focused fields', async () => {
  await withTempDir('lsk-local-template-', async (dir) => {
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

    const featureSpec = await fs.readFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'spec.md'),
      'utf-8'
    );
    const featureTasks = await fs.readFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      'utf-8'
    );

    assert.doesNotMatch(featureSpec, /\*\*Issue Number\*\*:/);
    assert.doesNotMatch(featureTasks, /## GitHub Issue/);
    assert.match(featureTasks, /## Local Tracking/);
    assert.doesNotMatch(featureTasks, /\*\*PR\*\*:/);
    assert.doesNotMatch(featureTasks, /\*\*PR Status\*\*:/);
    assert.doesNotMatch(featureTasks, /\*\*Pre-PR Review\*\*:/);

    const issueDocExists = await pathExists(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'issue.md')
    );
    const prDocExists = await pathExists(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'pr.md')
    );
    assert.equal(issueDocExists, false);
    assert.equal(prDocExists, false);
  });
});

test('github workflow feature template includes issue.md and pr.md drafts', async () => {
  await withTempDir('lsk-feature-issue-pr-drafts-', async (dir) => {
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

    const issueDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'issue.md');
    const prDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'pr.md');
    assert.equal(await pathExists(issueDocPath), true);
    assert.equal(await pathExists(prDocPath), true);

    const issueDoc = await fs.readFile(issueDocPath, 'utf-8');
    const prDoc = await fs.readFile(prDocPath, 'utf-8');
    assert.match(issueDoc, /\*\*Status\*\*:\s*-/);
    assert.match(issueDoc, /Values:\s*Draft \| Ready/);
    assert.match(prDoc, /\*\*Status\*\*:\s*-/);
    assert.match(prDoc, /Values:\s*Draft \| Ready/);
    assert.match(prDoc, /^\- \*\*Title\*\*:\s*alpha$/m);
    assert.match(prDoc, /^\- \*\*Labels\*\*:\s*enhancement$/m);
  });
});

test('feature keeps YYYY-MM-DD placeholder in test log format text', async () => {
  await withTempDir('lsk-feature-testlog-date-format-', async (dir) => {
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

    const featureTasks = await fs.readFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      'utf-8'
    );
    assert.match(featureTasks, /YYYY-MM-DD/);
    assert.doesNotMatch(featureTasks, /YYYY-MM-DD HH-MM/);
  });
});

test('docs list/get expose CLI-managed built-in docs without restoring agents.md', async () => {
  await withTempDir('lsk-docs-command-', async (dir) => {
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
      'github',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const listed = await runCli(dir, ['docs', 'list', '--json']);
    assert.equal(listed.code, 0, listed.stderr || listed.stdout);
    const listPayload = JSON.parse(listed.stdout.trim());
    assert.equal(listPayload.status, 'ok');
    assert.equal(listPayload.reasonCode, 'DOCS_LISTED');
    assert.equal(Array.isArray(listPayload.docs), true);
    assert.equal(listPayload.docs.some((doc) => doc.id === 'agents'), true);
    assert.equal(listPayload.docs.some((doc) => doc.id === 'create-issue'), true);
    assert.equal(listPayload.docs.some((doc) => doc.id === 'issue-doc'), true);
    assert.equal(listPayload.docs.some((doc) => doc.id === 'pr-doc'), true);
    assert.equal(listPayload.docs.some((doc) => doc.id === 'issue-template'), false);
    assert.equal(listPayload.docs.some((doc) => doc.id === 'pr-template'), false);

    const loaded = await runCli(dir, ['docs', 'get', 'agents', '--json']);
    assert.equal(loaded.code, 0, loaded.stderr || loaded.stdout);
    const getPayload = JSON.parse(loaded.stdout.trim());
    assert.equal(getPayload.status, 'ok');
    assert.equal(getPayload.reasonCode, 'DOC_FETCHED');
    assert.equal(getPayload.doc.id, 'agents');
    assert.equal(typeof getPayload.doc.hash, 'string');
    assert.equal(getPayload.doc.hash.length, 12);
    assert.match(getPayload.doc.content, /사용자 확인 필수 규칙/);
    assert.equal(Array.isArray(getPayload.requiredDocs), true);
    assert.equal(
      getPayload.requiredDocs.some((doc) => doc.id === 'create-issue'),
      true
    );

    const createIssueLoaded = await runCli(dir, [
      'docs',
      'get',
      'create-issue',
      '--json',
    ]);
    assert.equal(
      createIssueLoaded.code,
      0,
      createIssueLoaded.stderr || createIssueLoaded.stdout
    );
    const createIssuePayload = JSON.parse(createIssueLoaded.stdout.trim());
    assert.equal(createIssuePayload.status, 'ok');
    assert.equal(createIssuePayload.doc.id, 'create-issue');

    const executeTaskLoaded = await runCli(dir, [
      'docs',
      'get',
      'execute-task',
      '--json',
    ]);
    assert.equal(
      executeTaskLoaded.code,
      0,
      executeTaskLoaded.stderr || executeTaskLoaded.stdout
    );
    const executeTaskPayload = JSON.parse(executeTaskLoaded.stdout.trim());
    assert.equal(executeTaskPayload.status, 'ok');
    assert.equal(executeTaskPayload.doc.id, 'execute-task');

    const createPrLoaded = await runCli(dir, ['docs', 'get', 'create-pr', '--json']);
    assert.equal(
      createPrLoaded.code,
      0,
      createPrLoaded.stderr || createPrLoaded.stdout
    );
    const createPrPayload = JSON.parse(createPrLoaded.stdout.trim());
    assert.equal(createPrPayload.status, 'ok');
    assert.equal(createPrPayload.doc.id, 'create-pr');
    assert.equal(createPrPayload.contract?.kind, 'pr');
    assert.equal(Array.isArray(createPrPayload.contract?.requiredSections), true);
    assert.equal(
      createPrPayload.contract.requiredSections.includes('개요'),
      true
    );
    assert.equal(Array.isArray(createPrPayload.contract?.artifacts), true);
    assert.equal(
      createPrPayload.contract.artifacts.some((artifact) => artifact.id === 'screenshots'),
      true
    );
    assert.doesNotMatch(createIssuePayload.doc.content, /^\s*gh issue create\b/m);
    assert.match(
      createIssuePayload.doc.content,
      /npx lee-spec-kit github issue F001 --create --confirm OK --labels enhancement/
    );
    assert.doesNotMatch(createPrPayload.doc.content, /^\s*gh pr create\b/m);
    assert.match(
      createPrPayload.doc.content,
      /npx lee-spec-kit github pr F001 --create --confirm OK --labels enhancement/
    );
    assert.match(
      executeTaskPayload.doc.content,
      /새 태스크를 추가해야 한다면 우선 `npx lee-spec-kit task add <feature-ref> --title "\.\.\." --ref NON-PRD\|PRD-FR-001`를 사용하세요/
    );

    const koAgentsDoc = await fs.readFile(
      path.join(process.cwd(), 'templates', 'ko', 'common', 'agents', 'agents.md'),
      'utf-8'
    );
    assert.match(
      koAgentsDoc,
      /\| 이슈 생성 \| `npx lee-spec-kit github issue <featureRef> --create` 전 \|/
    );
    assert.match(
      koAgentsDoc,
      /\| PR 생성 \| `npx lee-spec-kit github pr <featureRef> --create` 전 \|/
    );
    assert.doesNotMatch(koAgentsDoc, /`gh issue create` 전/);
    assert.doesNotMatch(koAgentsDoc, /`gh pr create` 전/);

    const enCreateIssueDoc = await fs.readFile(
      path.join(
        process.cwd(),
        'templates',
        'en',
        'common',
        'agents',
        'skills',
        'create-issue.md'
      ),
      'utf-8'
    );
    assert.doesNotMatch(enCreateIssueDoc, /^\s*gh issue create\b/m);
    assert.match(
      enCreateIssueDoc,
      /npx lee-spec-kit github issue F001 --create --confirm OK --labels enhancement/
    );

    const enCreatePrDoc = await fs.readFile(
      path.join(
        process.cwd(),
        'templates',
        'en',
        'common',
        'agents',
        'skills',
        'create-pr.md'
      ),
      'utf-8'
    );
    assert.doesNotMatch(enCreatePrDoc, /^\s*gh pr create\b/m);
    assert.match(
      enCreatePrDoc,
      /npx lee-spec-kit github pr F001 --create --confirm OK --labels enhancement/
    );

    const koTasksTemplateDoc = await fs.readFile(
      path.join(
        process.cwd(),
        'templates',
        'ko',
        'common',
        'features',
        'feature-base',
        'tasks.md'
      ),
      'utf-8'
    );
    assert.match(
      koTasksTemplateDoc,
      /새 태스크는 가급적 `npx lee-spec-kit task add <feature-ref> --title "\.\.\." --ref NON-PRD\|PRD-FR-001`로 추가하세요/
    );

    const enExecuteTaskDoc = await fs.readFile(
      path.join(
        process.cwd(),
        'templates',
        'en',
        'common',
        'agents',
        'skills',
        'execute-task.md'
      ),
      'utf-8'
    );
    assert.match(
      enExecuteTaskDoc,
      /If you need to add a new task, prefer `npx lee-spec-kit task add <feature-ref> --title "\.\.\." --ref NON-PRD\|PRD-FR-001`/i
    );

    const enTasksTemplateDoc = await fs.readFile(
      path.join(
        process.cwd(),
        'templates',
        'en',
        'common',
        'features',
        'feature-base',
        'tasks.md'
      ),
      'utf-8'
    );
    assert.match(
      enTasksTemplateDoc,
      /prefer `npx lee-spec-kit task add <feature-ref> --title "\.\.\." --ref NON-PRD\|PRD-FR-001`/i
    );

    const enAgentsDoc = await fs.readFile(
      path.join(process.cwd(), 'templates', 'en', 'common', 'agents', 'agents.md'),
      'utf-8'
    );
    assert.match(
      enAgentsDoc,
      /\| Issue creation \| Before `npx lee-spec-kit github issue <featureRef> --create` \|/
    );
    assert.match(
      enAgentsDoc,
      /\| PR creation \| Before `npx lee-spec-kit github pr <featureRef> --create` \|/
    );
    assert.doesNotMatch(enAgentsDoc, /Before `gh issue create`/);
    assert.doesNotMatch(enAgentsDoc, /Before `gh pr create`/);

    const legacyIssueTemplateAliasLoaded = await runCli(dir, [
      'docs',
      'get',
      'issue-template',
      '--json',
    ]);
    assert.equal(
      legacyIssueTemplateAliasLoaded.code,
      0,
      legacyIssueTemplateAliasLoaded.stderr || legacyIssueTemplateAliasLoaded.stdout
    );
    const legacyIssueTemplateAliasPayload = JSON.parse(
      legacyIssueTemplateAliasLoaded.stdout.trim()
    );
    assert.equal(legacyIssueTemplateAliasPayload.status, 'ok');
    assert.equal(legacyIssueTemplateAliasPayload.doc.id, 'issue-doc');

    const legacyPrTemplateAliasLoaded = await runCli(dir, [
      'docs',
      'get',
      'pr-template',
      '--json',
    ]);
    assert.equal(
      legacyPrTemplateAliasLoaded.code,
      0,
      legacyPrTemplateAliasLoaded.stderr || legacyPrTemplateAliasLoaded.stdout
    );
    const legacyPrTemplateAliasPayload = JSON.parse(
      legacyPrTemplateAliasLoaded.stdout.trim()
    );
    assert.equal(legacyPrTemplateAliasPayload.status, 'ok');
    assert.equal(legacyPrTemplateAliasPayload.doc.id, 'pr-doc');

    const removedIssueMdAlias = await runCli(dir, [
      'docs',
      'get',
      'issue-md',
      '--json',
    ]);
    assert.notEqual(removedIssueMdAlias.code, 0);
    assert.match(
      removedIssueMdAlias.stderr || removedIssueMdAlias.stdout,
      /invalid.+doc/i
    );

    const removedPrMdAlias = await runCli(dir, [
      'docs',
      'get',
      'pr-md',
      '--json',
    ]);
    assert.notEqual(removedPrMdAlias.code, 0);
    assert.match(
      removedPrMdAlias.stderr || removedPrMdAlias.stdout,
      /invalid.+doc/i
    );

    const removedFeatureSplitAlias = await runCli(dir, [
      'docs',
      'get',
      'feature-split',
      '--json',
    ]);
    assert.notEqual(removedFeatureSplitAlias.code, 0);
    assert.match(
      removedFeatureSplitAlias.stderr || removedFeatureSplitAlias.stdout,
      /invalid.+doc/i
    );
  });
});

test('init keeps only project-scoped policy docs in docs tree', async () => {
  await withTempDir('lsk-init-project-scoped-agents-', async (dir) => {
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

    const docsRoot = path.join(dir, 'docs');
    const docsGitignorePath = path.join(docsRoot, '.gitignore');
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'custom.md')),
      true
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'constitution.md')),
      true
    );

    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'agents.md')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'git-workflow.md')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'issue-template.md')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'pr-template.md')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'agents', 'skills')),
      false
    );
    assert.equal(
      await pathExists(path.join(docsRoot, 'features', 'feature-base')),
      false
    );

    assert.equal(await pathExists(docsGitignorePath), true);
    const docsGitignore = await fs.readFile(docsGitignorePath, 'utf-8');
    assert.match(docsGitignore, /^\.lee-spec-kit\.lock$/m);
    assert.match(docsGitignore, /^\.lee-spec-kit\.\*\.lock$/m);
  });
});

test('Korean localized suggestions are shown for PROMPT_BLOCKED', async () => {
  await withTempDir('lsk-prompts-ko-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, 'keep.txt'), 'x\n', 'utf-8');

    const result = await runCli(dir, [
      'init',
      '--non-interactive',
      '--lang',
      'ko',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[PROMPT_BLOCKED\]/);
    assert.match(result.stderr, /다음 옵션 \(오류\)/);
    assert.match(result.stderr, /--non-interactive 없이 같은 명령을 다시 실행하세요/);
  });
});

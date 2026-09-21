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

async function init(dir, extra = []) {
  await runCommand(dir, 'git', ['init', '-b', 'main']);
  await runCommand(dir, 'git', ['config', 'user.email', 'owner@example.com']);
  await runCommand(dir, 'git', ['config', 'user.name', 'Owner']);
  const result = await runCli(dir, [
    'init',
    '--name',
    'parallel',
    '--type',
    'single',
    '--lang',
    'en',
    '--workflow',
    'local',
    '--non-interactive',
    ...extra,
  ]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
}
const json = (result) => JSON.parse(result.stdout);

test('local identifiers are independent; claim rejects competing sessions and stale mutations', async () => {
  await withTempDir('lee-parallel-', async (dir) => {
    await init(dir);
    const [a, b] = await Promise.all(
      ['alpha', 'beta'].map((name) => runCli(dir, ['feature', name, '--json']))
    );
    assert.equal(a.code, 0, a.stdout);
    assert.equal(b.code, 0, b.stdout);
    const first = json(a),
      second = json(b);
    assert.match(first.featureId, /^[A-HJ-NP-Z][A-HJ-NP-Z2-9]{11}$/);
    assert.notEqual(first.featureId, second.featureId);
    const firstWorkspace = json(
      await runCli(dir, [
        'workspace',
        'prepare',
        first.featureId,
        '--json',
      ])
    );
    const secondWorkspace = json(
      await runCli(dir, [
        'workspace',
        'prepare',
        second.featureId,
        '--json',
      ])
    );
    assert.notEqual(
      firstWorkspace.projectDirectory,
      secondWorkspace.projectDirectory
    );
    assert.equal(
      path.basename(firstWorkspace.projectDirectory),
      `feat-${first.featureId}-alpha`
    );
    assert.equal(
      path.basename(secondWorkspace.projectDirectory),
      `feat-${second.featureId}-beta`
    );
    assert.match(
      await fs.readFile(path.join(first.featurePath, 'spec.md'), 'utf8'),
      new RegExp(first.featureId)
    );
    const duplicate = await runCli(dir, [
      'feature',
      'different-slug',
      '--id',
      first.featureId,
      '--json',
    ]);
    assert.equal(json(duplicate).reasonCode, 'FEATURE_ID_EXISTS');
    const claim = await runCli(dir, [
      'task',
      'claim',
      first.featureId,
      '--json',
    ]);
    assert.equal(claim.code, 0, claim.stdout);
    const competing = await runCli(dir, [
      'task',
      'claim',
      first.featureId,
      '--json',
    ]);
    assert.equal(competing.code, 1);
    const stale = await runCli(dir, [
      'task',
      'transition',
      first.featureId,
      'T-example-01',
      '--session',
      json(claim).session,
      '--expected-hash',
      'outdated',
      '--from',
      'TODO',
      '--to',
      'DOING',
      '--json',
    ]);
    assert.match(json(stale).error, /changed since/);
    const release = await runCli(dir, [
      'task',
      'release',
      first.featureId,
      '--session',
      json(claim).session,
      '--json',
    ]);
    assert.equal(release.code, 0, release.stdout);
  });
});

test('github mode requires issue intake before new Feature docs', async () => {
  await withTempDir('lee-parallel-', async (dir) => {
    await init(dir);
    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    config.workflow.mode = 'github';
    await fs.writeFile(configPath, JSON.stringify(config));
    const result = await runCli(dir, ['feature', 'intake', '--json']);
    assert.equal(json(result).reasonCode, 'ISSUE_REQUIRED');
  });
});

test('GitHub issue identity is available before planning and duplicates fail CI audit', async () => {
  await withTempDir('lee-issue-identity-', async (dir) => {
    await init(dir);
    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    config.workflow.mode = 'github';
    await fs.writeFile(configPath, JSON.stringify(config));
    const bin = path.join(dir, 'fake-bin');
    await fs.mkdir(bin);
    await fs.writeFile(
      path.join(bin, 'gh'),
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== 'issue' || args[1] !== 'view') process.exit(9);
console.log(JSON.stringify({ number: Number(args[2]), url: 'https://github.com/acme/app/issues/' + args[2], title: 'Login' }));
`
    );
    await fs.chmod(path.join(bin, 'gh'), 0o755);
    const env = { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const created = await runCli(
      dir,
      ['feature', 'login', '--issue', '123', '--json'],
      env
    );
    assert.equal(created.code, 0, created.stdout);
    assert.equal(json(created).featureId, '123');
    assert.match(json(created).featurePath, /123-login$/);
    const stage = await runCli(dir, ['workflow-stage', '123', '--json'], env);
    assert.equal(json(stage).stage, 'workspace');
    assert.equal(json(stage).nextAction.category, 'workspace_prepare');
    const precreatedBranch = await runCommand(dir, 'git', [
      'branch',
      'feat/123-login',
      'HEAD',
    ]);
    assert.equal(precreatedBranch.code, 0, precreatedBranch.stderr);
    const prepared = await runCli(dir, ['workspace', 'prepare', '123', '--json'], env);
    assert.equal(prepared.code, 0, prepared.stdout);
    const isolated = json(prepared).projectDirectory;
    const isolatedStage = await runCli(isolated, ['workflow-stage', '123', '--json'], env);
    assert.equal(json(isolatedStage).stage, 'spec');
    const audit = await runCli(
      dir,
      ['feature-audit', '--enforce', '--json'],
      env
    );
    assert.equal(audit.code, 0, audit.stdout);
    const copy = path.join(dir, 'docs', 'features', '123-other');
    await fs.cp(json(created).featurePath, copy, { recursive: true });
    const duplicate = await runCli(
      dir,
      ['feature-audit', '--enforce', '--json'],
      env
    );
    assert.equal(duplicate.code, 1);
    assert.match(duplicate.stdout, /Duplicate Feature ID/);
  });
});

test('standalone GitHub Feature isolates issue-scoped planning in a docs worktree', async () => {
  await withTempDir('lee-standalone-github-planning-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot);
    await runCommand(projectRoot, 'git', ['init', '-b', 'main']);
    await runCommand(projectRoot, 'git', ['config', 'user.email', 'owner@example.com']);
    await runCommand(projectRoot, 'git', ['config', 'user.name', 'Owner']);
    await fs.writeFile(path.join(projectRoot, 'README.md'), '# project\n');
    await runCommand(projectRoot, 'git', ['add', 'README.md']);
    await runCommand(projectRoot, 'git', ['commit', '-m', 'baseline']);
    const initialized = await runCli(dir, [
      'init',
      '--name',
      'standalone-github',
      '--type',
      'single',
      '--lang',
      'en',
      '--workflow',
      'github',
      '--docs-repo',
      'standalone',
      '--project-root',
      './project',
      '--dir',
      './docs',
      '--non-interactive',
    ]);
    assert.equal(initialized.code, 0, initialized.stdout + initialized.stderr);
    const fakeGh = await setupFakeGhCli(dir);
    const env = { ...process.env, ...fakeGh.env };
    const created = await runCli(
      dir,
      ['feature', 'login', '--issue', '123', '--json'],
      env
    );
    assert.equal(created.code, 0, created.stdout);
    assert.equal(json(created).featureId, '123');
    const stage = json(
      await runCli(dir, ['workflow-stage', '123', '--json'], env)
    );
    assert.equal(stage.nextAction.category, 'workspace_prepare');
    const prepared = json(
      await runCli(dir, ['workspace', 'prepare', '123', '--json'], env)
    );
    assert.notEqual(prepared.docsDirectory, path.join(dir, 'docs'));
    assert.match(
      prepared.docsDirectory,
      /\.worktrees\/docs\/docs-single-123$/u
    );
    const isolated = json(
      await runCli(prepared.docsDirectory, ['workflow-stage', '123', '--json'], env)
    );
    assert.equal(isolated.stage, 'spec', JSON.stringify(isolated));
  });
});

test('embedded multi Features isolate the selected component before planning', async () => {
  await withTempDir('lee-parallel-multi-', async (dir) => {
    await init(dir, ['--type', 'fullstack', '--components', 'web,api']);
    const created = await runCli(dir, [
      'feature',
      'order-export',
      '--component',
      'web',
      '--json',
    ]);
    assert.equal(created.code, 0, created.stdout);
    const feature = json(created);
    assert.match(feature.featurePathFromDocs, /^features\/web\//u);
    const stage = json(
      await runCli(dir, [
        'workflow-stage',
        feature.featureId,
        '--component',
        'web',
        '--json',
      ])
    );
    assert.equal(stage.nextAction.category, 'workspace_prepare');
    const prepared = json(
      await runCli(dir, [
        'workspace',
        'prepare',
        feature.featureId,
        '--component',
        'web',
        '--json',
      ])
    );
    assert.equal(prepared.status, 'ok', JSON.stringify(prepared));
    await fs.access(
      path.join(
        prepared.projectDirectory,
        'docs',
        feature.featurePathFromDocs,
        'spec.md'
      )
    );
    const duplicateAcrossComponents = await runCli(dir, [
      'feature',
      'another-scope',
      '--component',
      'api',
      '--id',
      feature.featureId,
      '--json',
    ]);
    assert.equal(duplicateAcrossComponents.code, 1);
    assert.equal(
      json(duplicateAcrossComponents).reasonCode,
      'FEATURE_ID_EXISTS'
    );
    const legacyWeb = await runCli(dir, [
      'feature',
      'legacy-web',
      '--component',
      'web',
      '--id',
      'F001',
      '--json',
    ]);
    const legacyApi = await runCli(dir, [
      'feature',
      'legacy-api',
      '--component',
      'api',
      '--id',
      'F001',
      '--json',
    ]);
    assert.equal(legacyWeb.code, 0, legacyWeb.stdout);
    assert.equal(legacyApi.code, 0, legacyApi.stdout);
  });
});

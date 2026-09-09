import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  runCommand,
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
    assert.equal(json(stage).stage, 'spec');
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

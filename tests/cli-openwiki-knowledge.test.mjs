import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  ignoreGitArtifacts,
  path,
  runCli,
  runCommand,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

async function git(dir, args) {
  const result = await runCommand(dir, 'git', args);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  return result;
}

async function initializeOpenWikiFeature(dir, openwiki = true) {
  await git(dir, ['init']);
  await git(dir, ['branch', '-M', 'main']);
  await git(dir, ['config', 'user.name', 'Test User']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n', 'utf-8');

  const init = await runCli(dir, [
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
    '--task-agent',
    'off',
    '--reviews',
    'none',
    '--completion-strategy',
    'none',
    '--openwiki',
    String(openwiki),
    '--dir',
    './docs',
  ]);
  assert.equal(init.code, 0, init.stderr || init.stdout);

  const feature = await runCli(dir, [
    'feature',
    'alpha',
    '--id',
    'F001',
    '--non-interactive',
  ]);
  assert.equal(feature.code, 0, feature.stderr || feature.stdout);

  await git(dir, ['add', '.']);
  await git(dir, ['commit', '-m', 'chore: initialize demo']);
  await git(dir, ['switch', '-c', 'feat/F001-alpha']);

  const featureDir = path.join(dir, 'docs', 'features', 'F001-alpha');
  await setStatus(path.join(featureDir, 'spec.md'), 'Status', 'Approved');
  await setStatus(path.join(featureDir, 'plan.md'), 'Status', 'Approved');
  await setStatus(path.join(featureDir, 'tasks.md'), 'Doc Status', 'Approved');

  const planPath = path.join(featureDir, 'plan.md');
  let plan = await fs.readFile(planPath, 'utf-8');
  plan = plan
    .replace('- **System architecture**: NONE', '- **System architecture**: UPDATE')
    .replace('- **Targets**: -', '- **Targets**: project:README.md')
    .replace(
      '- **Reason**: This feature has no curated project-wide documentation impact.',
      '- **Reason**: The project README is the curated onboarding entrypoint for this demo.'
    );
  await fs.writeFile(planPath, plan, 'utf-8');

  const tasksPath = path.join(featureDir, 'tasks.md');
  let tasks = await fs.readFile(tasksPath, 'utf-8');
  tasks = tasks
    .replace(
      /^- \*\*Branch\*\*:.*$/mu,
      '- **Branch**: `feat/F001-alpha`'
    )
    .replace(
    '## Completion Criteria',
    `- [DONE][NON-PRD] T-F001-alpha-01 implement alpha shell
  - Date: 2026-09-02
  - Acceptance:
    - alpha shell renders
  - Checklist:
    - [x] add shell
  - Docs:
    - project:README.md

## Completion Criteria`
    );
  await fs.writeFile(tasksPath, tasks, 'utf-8');
  await fs.appendFile(path.join(dir, 'README.md'), '\nImplemented alpha shell.\n');
  await git(dir, ['add', '.']);
  await git(dir, ['commit', '-m', 'feat(F001): implement alpha shell']);
}

async function setStatus(filePath, label, value) {
  let content = await fs.readFile(filePath, 'utf-8');
  content = content.replace(
    new RegExp(`- \\*\\*${label}\\*\\*: .*`, 'u'),
    `- **${label}**: ${value}`
  );
  if (path.basename(filePath) === 'plan.md') {
    content = content
      .replace('- **Assessment**: Pending', '- **Assessment**: Complete')
      .replace('- **Product requirements**: -', '- **Product requirements**: NONE')
      .replace('- **System architecture**: -', '- **System architecture**: NONE')
      .replace('- **Onboarding entrypoint**: -', '- **Onboarding entrypoint**: NONE')
      .replace(
        '- **Operational/runtime contract**: -',
        '- **Operational/runtime contract**: NONE'
      )
      .replace(
        '- **Reason**: -',
        '- **Reason**: This feature has no curated project-wide documentation impact.'
      );
  }
  await fs.writeFile(filePath, content, 'utf-8');
}

async function setupFakeOpenWiki(dir) {
  const binDir = path.join(dir, 'fake-openwiki-bin');
  const invocationLog = path.join(dir, 'openwiki-invocations.log');
  await ignoreGitArtifacts(dir, ['/fake-openwiki-bin/', '/openwiki-invocations.log']);
  await fs.mkdir(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'openwiki');
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(invocationLog)}, args.join(' ') + '\\n');
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('0.5.0\\n');
  process.exit(0);
}
if (args.join(' ') !== 'code --update --print --language en') {
  process.stderr.write('unexpected OpenWiki arguments: ' + args.join(' '));
  process.exit(2);
}
const root = process.cwd();
const wiki = path.join(root, 'openwiki');
fs.mkdirSync(wiki, { recursive: true });
if (!fs.existsSync(path.join(wiki, 'INSTRUCTIONS.md'))) {
  process.stderr.write('missing protected instructions');
  process.exit(3);
}
fs.writeFileSync(path.join(wiki, 'index.md'), '---\\nokf_version: "0.1"\\n---\\n# Demo Knowledge\\n\\n[Architecture](architecture%20map.md)\\n');
fs.writeFileSync(path.join(wiki, 'architecture map.md'), '---\\ntype: concept\\n---\\n# Architecture\\n\\nThe tracked [README](../README.md) is the demo entrypoint.\\n');
fs.writeFileSync(path.join(wiki, '.last-update.json'), JSON.stringify({ status: 'complete', command: 'update' }, null, 2) + '\\n');
const begin = '<!-- OPENWIKI:START -->';
const end = '<!-- OPENWIKI:END -->';
const block = begin + '\\n## OpenWiki\\n\\nRead openwiki/index.md as derived evidence.\\n' + end;
for (const fileName of ['AGENTS.md', 'CLAUDE.md']) {
  const target = path.join(root, fileName);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const start = current.indexOf(begin);
  const finish = current.indexOf(end);
  const next = start >= 0 && finish > start
    ? current.slice(0, start) + block + current.slice(finish + end.length)
    : current.trimEnd() + (current.trim() ? '\\n\\n' : '') + block + '\\n';
  fs.writeFileSync(target, next);
}
process.stdout.write('updated\\n');
`,
    'utf-8'
  );
  await fs.chmod(scriptPath, 0o755);
  return {
    invocationLog,
    env: { PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}` },
  };
}

function json(result) {
  assert.ok(result.stdout.trim(), result.stderr);
  return JSON.parse(result.stdout);
}

test('OpenWiki true adds a verified sync, dedicated commit, and Feature review gate', async () => {
  await withTempDir('lsk-openwiki-enabled-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);

    const setupStage = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'])
    );
    assert.equal(setupStage.stage, 'knowledge_setup');
    assert.equal(setupStage.blockedReasonCode, 'KNOWLEDGE_SETUP_REQUIRED');

    const fake = await setupFakeOpenWiki(dir);
    const doctor = json(
      await runCli(dir, ['knowledge', 'doctor', 'F001-alpha', '--json'], fake.env)
    );
    assert.equal(doctor.status, 'ok');
    assert.equal(doctor.runtime.version, '0.5.0');

    const beforeSync = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'], fake.env)
    );
    assert.equal(beforeSync.stage, 'knowledge_sync');

    const syncResult = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(syncResult.status, 'ok', syncResult.error);
    assert.equal(syncResult.initialized, true);
    assert.equal(
      syncResult.command,
      'openwiki code --update --print --language en'
    );
    assert.equal(syncResult.receipt.featureRef, 'F001-alpha');
    const openWikiIgnore = await fs.readFile(
      path.join(dir, '.openwikiignore'),
      'utf-8'
    );
    assert.match(openWikiIgnore, /^\.env$/mu);
    assert.match(openWikiIgnore, /^\*\*\/secrets\/$/mu);
    assert.match(
      openWikiIgnore,
      /# lee-spec-kit:openwiki-ignore:end\s*$/u
    );
    const invocations = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.match(invocations, /code --update --print --language en\n$/u);
    assert.doesNotMatch(invocations, /--init/u);

    const audit = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--enforce', '--json'])
    );
    assert.equal(audit.status, 'commit_required');
    assert.equal(audit.unexpectedPaths.length, 0);

    const commitStage = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'])
    );
    assert.equal(commitStage.stage, 'knowledge_commit');
    assert.match(
      commitStage.nextAction.summary,
      /chore\(F001\): refresh OpenWiki knowledge layer/
    );

    await git(dir, ['add', '.lee-spec-kit/openwiki-sync.json']);
    const partialCommitAudit = json(
      await runCli(dir, [
        'commit-audit',
        '--message',
        'chore(F001): refresh OpenWiki knowledge layer',
        '--enforce',
        '--json',
      ])
    );
    assert.equal(partialCommitAudit.status, 'blocked');
    assert.equal(
      partialCommitAudit.reasonCode,
      'KNOWLEDGE_COMMIT_POLICY_VIOLATION'
    );

    await git(dir, [
      'add',
      'openwiki',
      '.lee-spec-kit/openwiki-sync.json',
      '.openwikiignore',
      'AGENTS.md',
      'CLAUDE.md',
    ]);

    const savedAgents = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    await fs.writeFile(
      path.join(dir, 'AGENTS.md'),
      `unmanaged tamper\n${savedAgents}`,
      'utf-8'
    );
    await git(dir, ['add', 'AGENTS.md']);
    const tamperedAudit = json(
      await runCli(dir, [
        'commit-audit',
        '--message',
        'chore(F001): refresh OpenWiki knowledge layer',
        '--enforce',
        '--json',
      ])
    );
    assert.equal(tamperedAudit.status, 'blocked');
    assert.equal(tamperedAudit.reasonCode, 'KNOWLEDGE_COMMIT_POLICY_VIOLATION');

    await fs.writeFile(path.join(dir, 'AGENTS.md'), savedAgents, 'utf-8');
    await git(dir, ['add', 'AGENTS.md']);
    const commitAudit = json(
      await runCli(dir, [
        'commit-audit',
        '--message',
        'chore(F001): refresh OpenWiki knowledge layer',
        '--enforce',
        '--json',
      ])
    );
    assert.equal(commitAudit.status, 'ok');

    await git(dir, [
      'commit',
      '-m',
      'chore(F001): refresh OpenWiki knowledge layer',
    ]);
    const verified = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--enforce', '--json'])
    );
    assert.equal(verified.status, 'verified');

    const countUpdates = async () => {
      const content = await fs.readFile(fake.invocationLog, 'utf-8');
      return content
        .split('\n')
        .filter((entry) => entry.startsWith('code --update ')).length;
    };
    const updatesBeforeProtectedDeletion = await countUpdates();
    for (const protectedPath of ['AGENTS.md', 'CLAUDE.md', '.openwikiignore']) {
      const target = path.join(dir, protectedPath);
      const saved = await fs.readFile(target, 'utf-8');
      await fs.rm(target);
      const rejected = json(
        await runCli(
          dir,
          ['knowledge', 'sync', 'F001-alpha', '--json'],
          fake.env,
          { timeoutMs: 60_000 }
        )
      );
      assert.equal(rejected.status, 'error', protectedPath);
      assert.equal(
        rejected.reasonCode,
        'OPENWIKI_PROTECTED_CONTENT_CHANGED',
        protectedPath
      );
      const stillExists = await fs.access(target).then(
        () => true,
        () => false
      );
      assert.equal(stillExists, false, protectedPath);
      assert.equal(await countUpdates(), updatesBeforeProtectedDeletion);
      await fs.writeFile(target, saved, 'utf-8');
    }

    const reviewStage = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'])
    );
    assert.equal(
      reviewStage.stage,
      'pre_pr_review',
      JSON.stringify(reviewStage.nextAction)
    );
    assert.equal(reviewStage.nextAction.reviewScope, 'feature');
    const requiredPaths = reviewStage.nextAction.delegationContext.requiredDocuments.map(
      (entry) => entry.path
    );
    assert.ok(
      requiredPaths.some(
        (entry) =>
          entry === 'openwiki/index.md' || entry.endsWith('/openwiki/index.md')
      ),
      JSON.stringify(requiredPaths)
    );
    assert.ok(
      requiredPaths.some((entry) => entry.endsWith('/README.md')),
      JSON.stringify(requiredPaths)
    );
    assert.ok(
      requiredPaths.some(
        (entry) =>
          entry === '.lee-spec-kit/openwiki-sync.json' ||
          entry.endsWith('/.lee-spec-kit/openwiki-sync.json')
      ),
      JSON.stringify(requiredPaths)
    );

    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    const afterIntegration = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--enforce', '--json'])
    );
    assert.equal(afterIntegration.status, 'verified');

    await fs.appendFile(path.join(dir, 'README.md'), '\nNew tracked behavior.\n');
    await git(dir, ['add', 'README.md']);
    await git(dir, ['commit', '-m', 'fix(F001): adjust alpha behavior']);
    const stale = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(stale.status, 'sync_required');
    assert.equal(stale.reasonCode, 'OPENWIKI_SOURCE_STALE');
  });
});

test('OpenWiki false remains a zero-behavior configuration', async () => {
  await withTempDir('lsk-openwiki-disabled-', async (dir) => {
    await initializeOpenWikiFeature(dir, false);
    const detect = json(await runCli(dir, ['detect', '--json']));
    assert.equal(detect.experimentalOpenwiki, false);

    const audit = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--enforce', '--json'])
    );
    assert.equal(audit.status, 'disabled');
    assert.equal(audit.reasonCode, 'OPENWIKI_DISABLED');

    const stage = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'])
    );
    assert.doesNotMatch(stage.stage, /^knowledge_/);
  });
});

test('OpenWiki sync blocks a Knowledge surface ignored by Git', async () => {
  await withTempDir('lsk-openwiki-ignored-output-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    await fs.writeFile(
      path.join(dir, '.gitignore'),
      'openwiki/\n.lee-spec-kit/\n.openwikiignore\nCLAUDE.md\n',
      'utf-8'
    );
    await git(dir, ['add', '.gitignore']);
    await git(dir, ['commit', '-m', 'chore(F001): configure ignored local docs']);
    const fake = await setupFakeOpenWiki(dir);

    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'error');
    assert.equal(result.reasonCode, 'OPENWIKI_OUTPUT_SCOPE_VIOLATION');
    assert.match(result.error, /ignored by Git/i);
  });
});

test('OpenWiki root files alone are classified as a Knowledge commit', async () => {
  await withTempDir('lsk-openwiki-root-only-commit-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    await fs.writeFile(path.join(dir, '.openwikiignore'), '# local rule\n', 'utf-8');
    await git(dir, ['add', '.openwikiignore']);

    const audit = json(
      await runCli(dir, [
        'commit-audit',
        '--message',
        'chore(F001): refresh OpenWiki knowledge layer',
        '--enforce',
        '--json',
      ])
    );
    assert.equal(audit.status, 'blocked');
    assert.equal(audit.reasonCode, 'KNOWLEDGE_COMMIT_POLICY_VIOLATION');
    assert.ok(
      audit.violations.some(
        (entry) => entry.path === '.lee-spec-kit/openwiki-sync.json'
      )
    );
  });
});

test('OpenWiki sync rejects a symlinked output root before external writes', async () => {
  if (process.platform === 'win32') return;
  await withTempDir('lsk-openwiki-root-symlink-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const externalRoot = path.join(dir, 'external-knowledge');
    const sentinel = path.join(externalRoot, 'sentinel.txt');
    await fs.mkdir(externalRoot, { recursive: true });
    await fs.writeFile(sentinel, 'do not change\n', 'utf-8');
    await fs.symlink(externalRoot, path.join(dir, 'openwiki'), 'dir');
    const fake = await setupFakeOpenWiki(dir);

    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'error');
    assert.equal(result.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.equal(await fs.readFile(sentinel, 'utf-8'), 'do not change\n');
  });
});

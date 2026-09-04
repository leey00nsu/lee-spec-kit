import { test } from 'vitest';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
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
    .replace(
      '- **System architecture**: NONE',
      '- **System architecture**: UPDATE'
    )
    .replace('- **Targets**: -', '- **Targets**: project:README.md')
    .replace(
      '- **Reason**: This feature has no curated project-wide documentation impact.',
      '- **Reason**: The project README is the curated onboarding entrypoint for this demo.'
    );
  await fs.writeFile(planPath, plan, 'utf-8');

  const tasksPath = path.join(featureDir, 'tasks.md');
  let tasks = await fs.readFile(tasksPath, 'utf-8');
  tasks = tasks
    .replace(/^- \*\*Branch\*\*:.*$/mu, '- **Branch**: `feat/F001-alpha`')
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
  await fs.appendFile(
    path.join(dir, 'README.md'),
    '\nImplemented alpha shell.\n'
  );
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
      .replaceAll('- **Assessment**: Pending', '- **Assessment**: Complete')
      .replace('- **Decision**: -', '- **Decision**: NONE')
      .replace(
        '- **Product requirements**: -',
        '- **Product requirements**: NONE'
      )
      .replace(
        '- **System architecture**: -',
        '- **System architecture**: NONE'
      )
      .replace(
        '- **Onboarding entrypoint**: -',
        '- **Onboarding entrypoint**: NONE'
      )
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
  const packageRoot = path.join(dir, 'fake-openwiki-package');
  const invocationLog = path.join(dir, 'openwiki-invocations.log');
  await ignoreGitArtifacts(dir, [
    '/fake-openwiki-bin/',
    '/fake-openwiki-package/',
    '/openwiki-invocations.log',
  ]);
  await fs.mkdir(binDir, { recursive: true });
  const scriptPath = path.join(packageRoot, 'dist', 'cli', 'cli.js');
  await fs.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.writeFile(
    path.join(packageRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'openwiki',
        version: '0.5.0',
        engines: { node: '>=22' },
        bin: { openwiki: './dist/cli/cli.js' },
      },
      null,
      2
    ),
    'utf-8'
  );
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(invocationLog)}, args.join(' ') + '\\n');
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('OpenWiki v0.5.0\\n');
  process.exit(0);
}
if (args.length === 1 && args[0] === '--version') {
  process.stderr.write('Unknown option: --version\\n');
  process.exit(1);
}
if (args.join(' ') !== 'code --update --print --language en') {
  process.stderr.write('unexpected OpenWiki arguments: ' + args.join(' '));
  process.exit(2);
}
const root = process.cwd();
const wiki = path.join(root, 'openwiki');
const updateInvocationCount = fs.readFileSync(${JSON.stringify(invocationLog)}, 'utf8')
  .split(/\\r?\\n/u)
  .filter((entry) => entry === 'code --update --print --language en').length;
fs.mkdirSync(wiki, { recursive: true });
if (!fs.existsSync(path.join(wiki, 'INSTRUCTIONS.md'))) {
  process.stderr.write('missing protected instructions');
  process.exit(3);
}
const interruptedMode = process.env.FAKE_OPENWIKI_INTERRUPTED || '';
const pageStatus = interruptedMode === 'skipped' ? 'skipped' : 'complete';
fs.writeFileSync(path.join(wiki, '.run.json'), JSON.stringify({ schemaVersion: 1, runId: 'fake-run', mode: 'update', phase: 'generating', plan: { pages: [{ path: '/openwiki/architecture map.md', status: pageStatus }] } }, null, 2) + '\\n');
if (process.env.FAKE_OPENWIKI_FAIL === '1') {
  process.stderr.write('simulated provider failure\\n');
  process.exit(7);
}
const sleepMs = Number(process.env.FAKE_OPENWIKI_SLEEP_MS || 0);
if (sleepMs > 0) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepMs);
}
if (process.env.FAKE_OPENWIKI_ASSERT_RUN_OWNER_IGNORE === '1') {
  const ignoreLines = fs.readFileSync(path.join(root, '.openwikiignore'), 'utf8')
    .split(/\\r?\\n/u)
    .map((line) => line.trim());
  if (!ignoreLines.includes('.lee-spec-kit/openwiki-run.json')) {
    process.stderr.write('run owner is visible to OpenWiki source fingerprint\\n');
    process.exit(8);
  }
  const owner = JSON.parse(fs.readFileSync(path.join(root, '.lee-spec-kit', 'openwiki-run.json'), 'utf8'));
  if (owner.runId !== 'fake-run') {
    process.stderr.write('lee-spec-kit did not persist the observed OpenWiki run id\\n');
    process.exit(9);
  }
}
const indexLink = process.env.FAKE_OPENWIKI_INDEX_LINK || '/openwiki/architecture%20map.md';
fs.writeFileSync(path.join(wiki, 'index.md'), '---\\nokf_version: "0.2"\\n---\\n# Demo Knowledge\\n\\n[Architecture](' + indexLink + ')\\n');
const citationMode = process.env.FAKE_OPENWIKI_CITATION_MODE || '';
const staleCitation = citationMode === 'stale' || (citationMode === 'stale-first' && updateInvocationCount === 1);
const citation = citationMode ? '\\nEvidence: \`README.md#L1-L' + (staleCitation ? '99' : '1') + '\`\\n' : '';
fs.writeFileSync(path.join(wiki, 'architecture map.md'), '---\\ntype: concept\\n---\\n# Architecture\\n\\nThe tracked [README](/README.md) is the demo entrypoint.\\n' + citation);
const claimMode = process.env.FAKE_OPENWIKI_CLAIM_MODE || '';
if (claimMode) {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const firstLine = (readme.match(/[^\\n]*\\n|[^\\n]+$/gu) || [])[0] || '';
  const validHash = crypto.createHash('sha256').update(firstLine).digest('hex');
  const staleClaim = claimMode === 'stale' || (claimMode === 'stale-first' && updateInvocationCount === 1);
  const claimRoot = path.join(wiki, '.claims');
  fs.mkdirSync(claimRoot, { recursive: true });
  fs.writeFileSync(path.join(claimRoot, 'architecture.json'), JSON.stringify({
    schemaVersion: 1,
    claims: [{
      id: 'claim_demo',
      statement: 'README is the entrypoint.',
      evidence: [{
        resource: 'repo://README.md#L1-L1',
        version: 'repo-lines-v1:sha256:' + (staleClaim ? '0'.repeat(64) : validHash) + ':fixture'
      }]
    }]
  }, null, 2) + '\\n');
}
fs.writeFileSync(path.join(wiki, '.last-update.json'), JSON.stringify({ status: interruptedMode ? 'interrupted' : 'complete', command: 'update' }, null, 2) + '\\n');
fs.unlinkSync(path.join(wiki, '.run.json'));
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
    packageJsonPath: path.join(packageRoot, 'package.json'),
    scriptPath,
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      LEE_SPEC_KIT_OPENWIKI_BIN: scriptPath,
      OPENWIKI_CONFIG_DIR: path.join(dir, 'fake-openwiki-config'),
      OPENWIKI_PROVIDER: 'openai',
      OPENWIKI_MODEL_ID: 'gpt-5.6-terra',
      OPENAI_API_KEY: 'fake-openwiki-test-key',
    },
  };
}

function json(result) {
  assert.ok(result.stdout.trim(), result.stderr);
  return JSON.parse(result.stdout);
}

test('OpenWiki 0.5.0 compatibility fixture pins the published contract', async () => {
  const contract = JSON.parse(
    await fs.readFile(
      new URL('./fixtures/openwiki-0.5.0-contract.json', import.meta.url),
      'utf-8'
    )
  );
  assert.equal(contract.package.version, '0.5.0');
  assert.equal(contract.package.node, '>=22');
  assert.equal(contract.cli.versionFlagSupported, false);
  assert.equal(contract.cli.updateBootstrapsMissingWiki, true);
  assert.equal(contract.cli.interruptedRunResumes, true);
  assert.equal(contract.configuration.envPath, '~/.openwiki/.env');
  assert.equal(contract.configuration.chatgptOAuthRequired.length, 4);
  assert.equal(contract.configuration.chatgptAuthOnlyCommand, null);
  assert.equal(contract.output.okfVersion, '0.2');
  assert.equal(contract.output.runStateSchemaVersion, 1);
  assert.match(contract.integrity, /^sha512-/u);
});

test('OpenWiki true adds a verified sync, dedicated commit, and Feature review gate', async () => {
  await withTempDir('lsk-openwiki-enabled-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);

    const setupStage = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'], {
        LEE_SPEC_KIT_OPENWIKI_BIN: path.join(dir, 'missing-openwiki'),
      })
    );
    assert.equal(setupStage.stage, 'knowledge_setup');
    assert.equal(setupStage.blockedReasonCode, 'KNOWLEDGE_SETUP_REQUIRED');

    const fake = await setupFakeOpenWiki(dir);
    const doctor = json(
      await runCli(
        dir,
        ['knowledge', 'doctor', 'F001-alpha', '--json'],
        fake.env
      )
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
    assert.equal(syncResult.receipt.triggerFeatureRef, 'F001-alpha');
    assert.equal(syncResult.receipt.schemaVersion, 2);
    assert.equal(syncResult.receipt.okfVersion, '0.2');
    assert.equal(syncResult.progress.phase, 'complete');
    assert.equal(
      syncResult.progress.completedPages,
      syncResult.progress.totalPages
    );
    assert.equal(syncResult.progress.skippedPages, 0);
    assert.deepEqual(syncResult.progress.skippedPagePaths, []);
    assert.equal(syncResult.progress.currentPage, undefined);
    const openWikiIgnore = await fs.readFile(
      path.join(dir, '.openwikiignore'),
      'utf-8'
    );
    assert.match(openWikiIgnore, /^\.env$/mu);
    assert.match(openWikiIgnore, /^\.lee-spec-kit\/openwiki-run\.json$/mu);
    assert.match(openWikiIgnore, /^\*\*\/secrets\/$/mu);
    assert.match(openWikiIgnore, /# lee-spec-kit:openwiki-ignore:end\s*$/u);
    const invocations = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.match(invocations, /code --update --print --language en\n$/u);
    assert.doesNotMatch(invocations, /--init/u);

    const audit = json(
      await runCli(dir, [
        'knowledge',
        'audit',
        'F001-alpha',
        '--enforce',
        '--json',
      ])
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
      await runCli(dir, [
        'knowledge',
        'audit',
        'F001-alpha',
        '--enforce',
        '--json',
      ])
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
    const requiredPaths =
      reviewStage.nextAction.delegationContext.requiredDocuments.map(
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
      await runCli(dir, [
        'knowledge',
        'audit',
        'F001-alpha',
        '--enforce',
        '--json',
      ])
    );
    assert.equal(afterIntegration.status, 'verified');

    const secondFeature = await runCli(dir, [
      'feature',
      'beta',
      '--id',
      'F002',
      '--non-interactive',
    ]);
    assert.equal(
      secondFeature.code,
      0,
      secondFeature.stderr || secondFeature.stdout
    );
    await git(dir, ['add', 'docs/features/F002-beta']);
    await git(dir, ['commit', '-m', 'docs(F002): add beta feature']);
    const projectLevelReceipt = json(
      await runCli(dir, [
        'knowledge',
        'audit',
        'F002-beta',
        '--enforce',
        '--json',
      ])
    );
    assert.equal(projectLevelReceipt.status, 'verified');
    assert.equal(projectLevelReceipt.receipt.triggerFeatureRef, 'F001-alpha');

    await fs.appendFile(
      path.join(dir, 'README.md'),
      '\nNew tracked behavior.\n'
    );
    await git(dir, ['add', 'README.md']);
    await git(dir, ['commit', '-m', 'fix(F001): adjust alpha behavior']);
    const stale = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(stale.status, 'sync_required');
    assert.equal(stale.reasonCode, 'OPENWIKI_SOURCE_STALE');
  });
});

test('OpenWiki sync regenerates once when incremental claim evidence is stale', async () => {
  await withTempDir('lsk-openwiki-evidence-retry-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        { ...fake.env, FAKE_OPENWIKI_CLAIM_MODE: 'stale-first' },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(result.status, 'ok', result.error);
    const invocations = (await fs.readFile(fake.invocationLog, 'utf-8'))
      .split('\n')
      .filter((entry) => entry === 'code --update --print --language en');
    assert.equal(invocations.length, 2);
    assert.equal(
      await fs
        .readFile(
          path.join(dir, 'openwiki', '.claims', 'architecture.json'),
          'utf-8'
        )
        .then((content) => content.includes('sha256:' + '0'.repeat(64))),
      false
    );
  });
});

test('OpenWiki sync refuses a receipt when regenerated evidence remains invalid', async () => {
  /** @type {Array<[string, string, RegExp]>} */
  const cases = [
    ['FAKE_OPENWIKI_CLAIM_MODE', 'stale', /stale line evidence/u],
    ['FAKE_OPENWIKI_CITATION_MODE', 'stale', /exceeds README\.md's/u],
  ];
  for (const [environmentName, environmentValue, expectedDetail] of cases) {
    await withTempDir('lsk-openwiki-evidence-invalid-', async (dir) => {
      await initializeOpenWikiFeature(dir, true);
      const fake = await setupFakeOpenWiki(dir);
      const result = await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        { ...fake.env, [environmentName]: environmentValue },
        { timeoutMs: 60_000 }
      );
      const payload = json(result);

      assert.equal(result.code, 1);
      assert.equal(payload.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
      assert.match(payload.error, expectedDetail);
      assert.equal(payload.details.validation, 'evidence_integrity');
      assert.equal(
        await fs
          .access(path.join(dir, '.lee-spec-kit', 'openwiki-sync.json'))
          .then(
            () => true,
            () => false
          ),
        false
      );
      const invocations = (await fs.readFile(fake.invocationLog, 'utf-8'))
        .split('\n')
        .filter((entry) => entry === 'code --update --print --language en');
      assert.equal(invocations.length, 2);
    });
  }
});

test('OpenWiki audit validates claim hashes and Markdown citation ranges even with a matching receipt hash', async () => {
  await withTempDir('lsk-openwiki-evidence-audit-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const sync = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        { ...fake.env, FAKE_OPENWIKI_CLAIM_MODE: 'valid' },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(sync.status, 'ok', sync.error);
    await git(dir, [
      'add',
      'openwiki',
      '.lee-spec-kit/openwiki-sync.json',
      '.openwikiignore',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    await git(dir, [
      'commit',
      '-m',
      'chore(F001): refresh OpenWiki knowledge layer',
    ]);

    const claimPath = path.join(
      dir,
      'openwiki',
      '.claims',
      'architecture.json'
    );
    const originalClaim = await fs.readFile(claimPath, 'utf-8');
    await fs.writeFile(
      claimPath,
      originalClaim.replace(/sha256:[0-9a-f]{64}/u, `sha256:${'0'.repeat(64)}`),
      'utf-8'
    );
    const receiptPath = path.join(dir, '.lee-spec-kit', 'openwiki-sync.json');
    const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf-8'));
    const claimHashMismatch = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.ok(claimHashMismatch.outputHash);
    receipt.outputHash = claimHashMismatch.outputHash;
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    const staleClaim = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(staleClaim.status, 'sync_required');
    assert.equal(staleClaim.reasonCode, 'OPENWIKI_OUTPUT_STALE');
    assert.match(
      staleClaim.detail,
      /stale line evidence/u,
      JSON.stringify(staleClaim)
    );

    await fs.writeFile(claimPath, originalClaim, 'utf-8');
    const pagePath = path.join(dir, 'openwiki', 'architecture map.md');
    await fs.appendFile(pagePath, '\n`README.md#L1-L99`\n', 'utf-8');
    const citationHashMismatch = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.ok(citationHashMismatch.outputHash);
    receipt.outputHash = citationHashMismatch.outputHash;
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    const staleCitation = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(staleCitation.status, 'sync_required');
    assert.equal(staleCitation.reasonCode, 'OPENWIKI_OUTPUT_STALE');
    assert.match(staleCitation.detail, /exceeds README\.md's/u);
  });
});

test('OpenWiki run-owner updates stay outside the source fingerprint', async () => {
  await withTempDir('lsk-openwiki-run-owner-ignore-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);

    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_SLEEP_MS: '1500',
          FAKE_OPENWIKI_ASSERT_RUN_OWNER_IGNORE: '1',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(result.status, 'ok', result.error);
    assert.equal(result.reasonCode, 'OPENWIKI_SYNCED');
    assert.equal(result.progress.phase, 'complete');
    assert.equal(result.progress.completedPages, 1);
    assert.equal(result.progress.totalPages, 1);
    assert.equal(result.progress.skippedPages, 0);
  });
});

test('OpenWiki reports an interrupted finished process without claiming its queue was never persisted', async () => {
  await withTempDir('lsk-openwiki-interrupted-finish-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const before = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    await fs.mkdir(path.join(dir, 'openwiki'), { recursive: true });
    await fs.mkdir(path.join(dir, '.lee-spec-kit'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'openwiki', '.last-update.json'),
      `${JSON.stringify({ status: 'interrupted', command: 'update' }, null, 2)}\n`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, '.lee-spec-kit', 'openwiki-run.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          ownerId: 'test-owner',
          featureRef: 'F001-alpha',
          component: 'single',
          language: 'en',
          sourceHead: 'test-head',
          sourceFingerprint: before.sourceFingerprint,
          baseHead: 'test-base',
          startedAt: '2026-09-03T00:00:00.000Z',
          runId: 'finished-run',
        },
        null,
        2
      )}\n`,
      'utf-8'
    );

    const interrupted = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(interrupted.status, 'sync_required');
    assert.equal(interrupted.reasonCode, 'OPENWIKI_RUN_INCOMPLETE');
    assert.match(interrupted.detail, /no active page queue remains/i);
    assert.doesNotMatch(interrupted.detail, /before OpenWiki persisted/i);
    assert.equal(
      interrupted.interruption.reasonCode,
      'OPENWIKI_SOURCE_DRIFT_OR_SKIPPED_PAGES'
    );
    assert.equal(interrupted.interruption.lastUpdateStatus, 'interrupted');
    assert.equal(interrupted.interruption.activePageQueue, false);
    assert.equal(interrupted.interruption.ownerRunId, 'finished-run');
  });
});

test('OpenWiki interrupted completion reports observed skipped pages without writing a receipt', async () => {
  await withTempDir('lsk-openwiki-interrupted-details-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = await runCli(
      dir,
      ['knowledge', 'sync', 'F001-alpha', '--json'],
      {
        ...fake.env,
        FAKE_OPENWIKI_SLEEP_MS: '1500',
        FAKE_OPENWIKI_INTERRUPTED: 'skipped',
      },
      { timeoutMs: 60_000 }
    );
    const payload = json(result);

    assert.equal(result.code, 1);
    assert.equal(payload.reasonCode, 'OPENWIKI_RUN_INCOMPLETE');
    assert.equal(
      payload.details.interruption.reasonCode,
      'OPENWIKI_SKIPPED_PAGES_OBSERVED'
    );
    assert.equal(payload.details.interruption.activePageQueue, false);
    assert.equal(payload.details.interruption.observedSkippedPages, 1);
    assert.deepEqual(payload.details.interruption.observedSkippedPagePaths, [
      '/openwiki/architecture map.md',
    ]);
    assert.match(payload.details.interruption.limitation, /source drift/u);
    assert.equal(
      await fs
        .access(path.join(dir, '.lee-spec-kit', 'openwiki-sync.json'))
        .then(
          () => true,
          () => false
        ),
      false
    );
  });
});

test('OpenWiki false remains a zero-behavior configuration', async () => {
  await withTempDir('lsk-openwiki-disabled-', async (dir) => {
    await initializeOpenWikiFeature(dir, false);
    const detect = json(await runCli(dir, ['detect', '--json']));
    assert.equal(detect.experimentalOpenwiki, false);

    const audit = json(
      await runCli(dir, [
        'knowledge',
        'audit',
        'F001-alpha',
        '--enforce',
        '--json',
      ])
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
    await git(dir, [
      'commit',
      '-m',
      'chore(F001): configure ignored local docs',
    ]);
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
    await fs.writeFile(
      path.join(dir, '.openwikiignore'),
      '# local rule\n',
      'utf-8'
    );
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

test('Knowledge commit resolves its Feature from the receipt on a multi-Feature main branch', async () => {
  await withTempDir('lsk-openwiki-main-commit-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const secondFeature = await runCli(dir, [
      'feature',
      'beta',
      '--id',
      'F002',
      '--non-interactive',
    ]);
    assert.equal(
      secondFeature.code,
      0,
      secondFeature.stderr || secondFeature.stdout
    );
    await git(dir, ['add', 'docs/features/F002-beta']);
    await git(dir, ['commit', '-m', 'docs(F002): add beta feature']);
    await git(dir, ['branch', '-D', 'main']);
    await git(dir, ['branch', '-m', 'main']);

    const fake = await setupFakeOpenWiki(dir);
    const sync = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(sync.status, 'ok', sync.error);
    await git(dir, [
      'add',
      'openwiki',
      '.lee-spec-kit/openwiki-sync.json',
      '.openwikiignore',
      'AGENTS.md',
      'CLAUDE.md',
    ]);

    const wrongSubjectAudit = json(
      await runCli(dir, [
        'commit-audit',
        '--message',
        'chore(F002): refresh OpenWiki knowledge layer',
        '--enforce',
        '--json',
      ])
    );
    assert.equal(wrongSubjectAudit.status, 'blocked');
    assert.equal(
      wrongSubjectAudit.reasonCode,
      'COMMIT_MESSAGE_POLICY_VIOLATION'
    );

    const audit = json(
      await runCli(dir, [
        'commit-audit',
        '--message',
        'chore(F001): refresh OpenWiki knowledge layer',
        '--enforce',
        '--json',
      ])
    );
    assert.equal(audit.status, 'ok');
    assert.equal(audit.reasonCode, 'COMMIT_ALLOWED');
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

test('OpenWiki preserves owned partial state and rejects cross-Feature resume', async () => {
  await withTempDir('lsk-openwiki-resume-owner-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const failed = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        { ...fake.env, FAKE_OPENWIKI_FAIL: '1' },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(failed.status, 'error');
    assert.equal(failed.reasonCode, 'OPENWIKI_SYNC_FAILED');
    assert.equal(
      await fs.access(path.join(dir, 'openwiki', '.run.json')).then(
        () => true,
        () => false
      ),
      true
    );
    assert.equal(
      await fs
        .access(path.join(dir, '.lee-spec-kit', 'openwiki-run.json'))
        .then(
          () => true,
          () => false
        ),
      true
    );

    const secondFeature = await runCli(dir, [
      'feature',
      'beta',
      '--id',
      'F002',
      '--non-interactive',
    ]);
    assert.equal(
      secondFeature.code,
      0,
      secondFeature.stderr || secondFeature.stdout
    );
    await git(dir, ['add', 'docs/features/F002-beta']);
    await git(dir, ['commit', '-m', 'docs(F002): add beta feature']);

    const wrongOwner = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F002-beta', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(wrongOwner.status, 'error');
    assert.equal(wrongOwner.reasonCode, 'OPENWIKI_RUN_OWNER_MISMATCH');

    const resumed = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(resumed.status, 'ok', resumed.error);
    assert.equal(
      await fs
        .access(path.join(dir, '.lee-spec-kit', 'openwiki-run.json'))
        .then(
          () => true,
          () => false
        ),
      false
    );
  });
});

test('Knowledge migration is dry-run by default and never infers NONE decisions', async () => {
  await withTempDir('lsk-openwiki-migration-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const planPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'plan.md'
    );
    const current = await fs.readFile(planPath, 'utf-8');
    const legacy = current.replace(
      /\n## Curated Documentation Impact\n[\s\S]*?(?=\n## Verification Contract)/u,
      ''
    );
    await fs.writeFile(planPath, legacy, 'utf-8');
    const tasksPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'tasks.md'
    );
    const tasks = (await fs.readFile(tasksPath, 'utf-8'))
      .replace(/^- \[ \](?=.*lee-spec-kit:completion:)/gmu, '- [x]')
      .replace(/\s*<!-- lee-spec-kit:completion:[^>]+ -->/gu, '');
    await fs.writeFile(tasksPath, tasks, 'utf-8');
    await git(dir, ['add', planPath, tasksPath]);
    await git(dir, ['commit', '-m', 'docs(F001): restore legacy plan fixture']);
    const activeFeature = await runCli(dir, [
      'feature',
      'active',
      '--id',
      'F002',
      '--non-interactive',
    ]);
    assert.equal(
      activeFeature.code,
      0,
      activeFeature.stderr || activeFeature.stdout
    );

    const before = await fs.readFile(planPath, 'utf-8');
    const dryRun = json(await runCli(dir, ['knowledge', 'migrate', '--json']));
    assert.equal(dryRun.reasonCode, 'OPENWIKI_MIGRATION_DRY_RUN');
    assert.equal(dryRun.dryRun, true);
    assert.equal(
      dryRun.features[0].status,
      'eligible',
      JSON.stringify(dryRun.features[0])
    );
    assert.equal(dryRun.features[1].status, 'manual_review');
    assert.equal(await fs.readFile(planPath, 'utf-8'), before);

    const applied = json(
      await runCli(dir, ['knowledge', 'migrate', '--apply', '--json'])
    );
    assert.equal(applied.reasonCode, 'OPENWIKI_MIGRATION_APPLIED');
    assert.equal(applied.changed.length, 1);
    const migrated = await fs.readFile(planPath, 'utf-8');
    assert.match(
      migrated,
      /lee-spec-kit:curated-impact-grandfathered v2 feature-docs=sha256:[a-f0-9]{64}/u
    );
    assert.doesNotMatch(migrated, /Product requirements.*NONE/iu);

    const stage = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'], {
        LEE_SPEC_KIT_OPENWIKI_BIN: path.join(dir, 'missing-openwiki'),
      })
    );
    assert.notEqual(stage.stage, 'plan');

    const grandfatherMarker = migrated.match(
      /<!-- lee-spec-kit:curated-impact-grandfathered v2 feature-docs=sha256:[a-f0-9]{64} -->/u
    )?.[0];
    assert.ok(grandfatherMarker);
    await fs.writeFile(
      planPath,
      `${migrated.trimEnd()}\n${grandfatherMarker}\n`,
      'utf-8'
    );
    const duplicateStage = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'], {
        LEE_SPEC_KIT_OPENWIKI_BIN: path.join(dir, 'missing-openwiki'),
      })
    );
    assert.equal(duplicateStage.stage, 'plan');
    assert.match(
      duplicateStage.nextAction.summary,
      /Exactly one provenance-bound/u
    );

    await fs.writeFile(planPath, migrated, 'utf-8');

    await fs.appendFile(
      planPath,
      '\nLegacy Feature reopened for correction.\n'
    );
    const staleStage = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'], {
        LEE_SPEC_KIT_OPENWIKI_BIN: path.join(dir, 'missing-openwiki'),
      })
    );
    assert.equal(staleStage.stage, 'plan');
    assert.match(
      staleStage.nextAction.summary,
      /provenance marker was recorded/i
    );
  });
});

test('OpenWiki absolute timeout preserves resumable state and one JSON result', async () => {
  await withTempDir('lsk-openwiki-timeout-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = await runCli(
      dir,
      [
        'knowledge',
        'sync',
        'F001-alpha',
        '--absolute-timeout-ms',
        '100',
        '--idle-timeout-ms',
        '60000',
        '--json',
      ],
      { ...fake.env, FAKE_OPENWIKI_SLEEP_MS: '10000' },
      { timeoutMs: 60_000 }
    );
    const payload = json(result);
    assert.equal(result.code, 1);
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'OPENWIKI_ABSOLUTE_TIMEOUT');
    assert.equal(result.stdout.trim().split('\n{').length, 1);
    assert.equal(payload.details.partialStatePreserved, true);
    assert.equal(payload.details.resumable, true);
    assert.equal(payload.details.progress.completedPages, 1);
    assert.match(payload.details.resumeCommand, /knowledge sync F001-alpha/u);
    assert.equal(payload.details.timeout.absoluteTimeoutMs, 100);
    assert.equal(
      await fs.access(path.join(dir, 'openwiki', '.run.json')).then(
        () => true,
        () => false
      ),
      true
    );
    assert.equal(
      await fs
        .access(path.join(dir, '.lee-spec-kit', 'openwiki-sync.json'))
        .then(
          () => true,
          () => false
        ),
      false
    );
  });
});

test('OpenWiki idle timeout returns structured resumable progress without raw output', async () => {
  await withTempDir('lsk-openwiki-idle-timeout-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = await runCli(
      dir,
      [
        'knowledge',
        'sync',
        'F001-alpha',
        '--idle-timeout-ms',
        '100',
        '--absolute-timeout-ms',
        '60000',
        '--json',
      ],
      { ...fake.env, FAKE_OPENWIKI_SLEEP_MS: '10000' },
      { timeoutMs: 60_000 }
    );
    const payload = json(result);
    assert.equal(result.code, 1);
    assert.equal(payload.reasonCode, 'OPENWIKI_IDLE_TIMEOUT');
    assert.equal(payload.details.progress.completedPages, 1);
    assert.equal(payload.details.progress.totalPages, 1);
    assert.ok(payload.details.elapsedMs >= 100);
    assert.equal(payload.details.timeout.idleTimeoutMs, 100);
    assert.doesNotMatch(result.stdout, /simulated provider failure/u);
  });
});

test('OpenWiki rejects an incompatible existing OKF before starting generation', async () => {
  await withTempDir('lsk-openwiki-okf-preflight-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    await fs.mkdir(path.join(dir, 'openwiki'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'openwiki', 'index.md'),
      '---\nokf_version: "9.9"\n---\n# incompatible\n',
      'utf-8'
    );

    const result = await runCli(
      dir,
      ['knowledge', 'sync', 'F001-alpha', '--json'],
      fake.env
    );
    const payload = json(result);
    assert.equal(result.code, 1);
    assert.equal(payload.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.match(payload.error, /OKF 9\.9/u);
    const invocations = await fs
      .readFile(fake.invocationLog, 'utf-8')
      .catch(() => '');
    assert.equal(invocations, '');
  });
});

test('OpenWiki accepts relative links and reports unsafe links with file location', async () => {
  await withTempDir('lsk-openwiki-relative-link-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const relative = json(
      await runCli(dir, ['knowledge', 'sync', 'F001-alpha', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_INDEX_LINK: 'architecture%20map.md',
      })
    );
    assert.equal(relative.status, 'ok');
  });

  await withTempDir('lsk-openwiki-unsafe-link-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const unsafe = json(
      await runCli(dir, ['knowledge', 'sync', 'F001-alpha', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_INDEX_LINK: '../../outside.md',
      })
    );
    assert.equal(unsafe.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.match(unsafe.error, /index\.md:6:\d+/u);
    assert.match(unsafe.error, /\.\.\/\.\.\/outside\.md/u);
  });
});

test('OpenWiki doctor distinguishes unsupported and unverifiable executables', async () => {
  await withTempDir('lsk-openwiki-probe-reasons-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const manifest = JSON.parse(
      await fs.readFile(fake.packageJsonPath, 'utf-8')
    );
    manifest.version = '0.6.0';
    await fs.writeFile(
      fake.packageJsonPath,
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );
    const unsupported = json(
      await runCli(
        dir,
        ['knowledge', 'doctor', 'F001-alpha', '--json'],
        fake.env
      )
    );
    assert.equal(unsupported.status, 'blocked');
    assert.equal(unsupported.reasonCode, 'OPENWIKI_VERSION_UNSUPPORTED');

    const unknownPath = path.join(dir, 'unknown-openwiki');
    await fs.writeFile(unknownPath, '#!/bin/sh\nexit 1\n', 'utf-8');
    await fs.chmod(unknownPath, 0o755);
    const unverifiable = json(
      await runCli(dir, ['knowledge', 'doctor', 'F001-alpha', '--json'], {
        LEE_SPEC_KIT_OPENWIKI_BIN: unknownPath,
      })
    );
    assert.equal(unverifiable.status, 'blocked');
    assert.equal(unverifiable.reasonCode, 'OPENWIKI_VERSION_PROBE_FAILED');
  });
});

test('OpenWiki doctor verifies API-key and ChatGPT OAuth readiness without exposing secrets', async () => {
  await withTempDir('lsk-openwiki-provider-doctor-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);

    const missing = await runCli(
      dir,
      ['knowledge', 'doctor', 'F001-alpha', '--json'],
      { ...fake.env, OPENAI_API_KEY: '' }
    );
    const missingPayload = json(missing);
    assert.equal(missingPayload.status, 'blocked');
    assert.equal(missingPayload.reasonCode, 'OPENWIKI_RUNTIME_NOT_READY');
    assert.equal(missingPayload.provider.provider, 'openai');
    assert.deepEqual(missingPayload.provider.missing, ['OPENAI_API_KEY']);
    const missingSync = await runCli(
      dir,
      ['knowledge', 'sync', 'F001-alpha', '--json'],
      { ...fake.env, OPENAI_API_KEY: '' }
    );
    assert.equal(json(missingSync).reasonCode, 'OPENWIKI_RUNTIME_NOT_READY');
    assert.equal(
      await fs.readFile(fake.invocationLog, 'utf-8').catch(() => ''),
      ''
    );

    await fs.rm(path.join(dir, 'docs', 'features', 'F001-alpha'), {
      recursive: true,
    });
    const apiKey = await runCli(
      dir,
      ['knowledge', 'doctor', '--json'],
      fake.env
    );
    const apiKeyPayload = json(apiKey);
    assert.equal(apiKeyPayload.status, 'ok');
    assert.equal(apiKeyPayload.provider.credentialStatus, 'present');
    assert.equal(apiKeyPayload.knowledgeState, null);
    assert.equal(apiKeyPayload.featureSelection.status, 'no_features');
    assert.doesNotMatch(apiKey.stdout, /fake-openwiki-test-key/u);

    await git(dir, ['restore', 'docs/features/F001-alpha']);

    const oauthSecret = 'oauth-access-must-not-leak';
    const oauth = await runCli(
      dir,
      ['knowledge', 'doctor', 'F001-alpha', '--json'],
      {
        ...fake.env,
        OPENWIKI_PROVIDER: 'openai-chatgpt',
        OPENAI_API_KEY: '',
        OPENAI_CHATGPT_ACCESS_TOKEN: oauthSecret,
        OPENAI_CHATGPT_REFRESH_TOKEN: 'oauth-refresh-must-not-leak',
        OPENAI_CHATGPT_EXPIRES_AT: String(Date.now() + 60_000),
        OPENAI_CHATGPT_ACCOUNT_ID: 'account-must-not-leak',
      }
    );
    const oauthPayload = json(oauth);
    assert.equal(oauthPayload.status, 'ok');
    assert.equal(oauthPayload.provider.provider, 'openai-chatgpt');
    assert.equal(oauthPayload.provider.authMethod, 'oauth');
    assert.doesNotMatch(oauth.stdout, /must-not-leak/u);

    const incompleteOauth = json(
      await runCli(dir, ['knowledge', 'doctor', 'F001-alpha', '--json'], {
        ...fake.env,
        OPENWIKI_PROVIDER: 'openai-chatgpt',
        OPENAI_API_KEY: '',
        OPENAI_CHATGPT_ACCESS_TOKEN: oauthSecret,
        OPENAI_CHATGPT_REFRESH_TOKEN: '',
        OPENAI_CHATGPT_EXPIRES_AT: '',
        OPENAI_CHATGPT_ACCOUNT_ID: '',
      })
    );
    assert.equal(incompleteOauth.status, 'blocked');
    assert.equal(incompleteOauth.reasonCode, 'OPENWIKI_RUNTIME_NOT_READY');
    assert.match(
      incompleteOauth.provider.setupCommand,
      /OPENWIKI_PROVIDER=openai-chatgpt openwiki code --init/u
    );
  });
});

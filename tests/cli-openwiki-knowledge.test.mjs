import { setupFakeOpenWiki } from './helpers/fake-openwiki.mjs';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import {
  fs,
  ignoreGitArtifacts,
  normalizePathForCompare,
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

async function initializeOpenWikiFeature(dir, openwiki = true, options = {}) {
  const docsDirectory = options.docsDirectory || './docs';
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
    'feature',
    '--completion-strategy',
    'none',
    '--openwiki',
    String(openwiki),
    ...(options.force ? ['--force'] : []),
    '--dir',
    docsDirectory,
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

  const initialFeatureDir = path.join(
    path.resolve(dir, docsDirectory),
    'features',
    'F001-alpha'
  );
  const initialTasksPath = path.join(initialFeatureDir, 'tasks.md');
  let initialTasks = await fs.readFile(initialTasksPath, 'utf-8');
  initialTasks = initialTasks.replace(
    /^- \*\*Branch\*\*:.*$/mu,
    '- **Branch**: `feat/F001-alpha`'
  );
  await fs.writeFile(initialTasksPath, initialTasks, 'utf-8');
  if (options.requireWorktree) {
    const configPath = path.join(
      path.resolve(dir, docsDirectory),
      '.lee-spec-kit.json'
    );
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow.requireWorktree = true;
    await fs.writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      'utf-8'
    );
  }

  await git(dir, ['add', '.']);
  await git(dir, ['commit', '-m', 'chore: initialize demo']);
  let workingDir = dir;
  if (options.requireWorktree) {
    const worktreePath = path.join(dir, '.worktrees', 'feat-F001-alpha');
    await git(dir, ['branch', 'feat/F001-alpha']);
    await git(dir, ['worktree', 'add', worktreePath, 'feat/F001-alpha']);
    workingDir = worktreePath;
  } else {
    await git(dir, ['switch', '-c', 'feat/F001-alpha']);
  }

  const featureDir = path.join(
    workingDir,
    path.relative(dir, initialFeatureDir)
  );
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
    path.join(workingDir, 'README.md'),
    '\nImplemented alpha shell.\n'
  );
  await git(workingDir, ['add', '.']);
  await git(workingDir, ['commit', '-m', 'feat(F001): implement alpha shell']);
  return { workingDir, featureDir };
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

function json(result) {
  assert.ok(result.stdout.trim(), result.stderr);
  return JSON.parse(result.stdout);
}

async function refreshFakePageVersion(dir) {
  const pagePath = path.join(dir, 'openwiki', 'architecture map.md');
  const pageVersion = `sha256:${createHash('sha256')
    .update(await fs.readFile(pagePath))
    .digest('hex')}`;
  const manifestPath = path.join(dir, 'openwiki', '.page-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  manifest.pages['/openwiki/architecture map.md'].pageVersion = pageVersion;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const claimPath = path.join(
    dir,
    'openwiki',
    '.claims',
    'architecture map.json'
  );
  const claim = JSON.parse(await fs.readFile(claimPath, 'utf-8'));
  claim.pageVersion = pageVersion;
  await fs.writeFile(claimPath, `${JSON.stringify(claim, null, 2)}\n`);
}

async function rebindOpenWikiReceiptOutputHash(dir) {
  const audit = json(
    await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
  );
  assert.ok(audit.outputHash, JSON.stringify(audit));
  const receiptPath = path.join(dir, '.lee-spec-kit', 'openwiki-sync.json');
  const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf-8'));
  receipt.outputHash = audit.outputHash;
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
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

test('OpenWiki 0.5.2 compatibility fixture pins the verified contract', async () => {
  const contract = JSON.parse(
    await fs.readFile(
      new URL('./fixtures/openwiki-0.5.2-contract.json', import.meta.url),
      'utf-8'
    )
  );
  assert.equal(contract.package.version, '0.5.2');
  assert.equal(contract.package.node, '>=22.22.0');
  assert.equal(contract.cli.versionFlagSupported, false);
  // 0.5.2 keeps the prior source checkpoint for pages a run did not rewrite.
  assert.equal(contract.manifest.restampsRegeneratedPagesOnly, true);
  assert.equal(contract.manifest.preservesUntouchedPageCheckpoints, true);
  assert.equal(contract.output.okfVersion, '0.2');
  assert.equal(contract.output.runStateSchemaVersion, 1);
  assert.match(contract.integrity, /^sha512-/u);
});

test('embedded Knowledge sync resolves the managed Feature worktree from the main checkout', async () => {
  await withTempDir('lsk-openwiki-embedded-worktree-', async (dir) => {
    const { workingDir } = await initializeOpenWikiFeature(dir, true, {
      requireWorktree: true,
    });
    const fake = await setupFakeOpenWiki(dir);

    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'ok', result.error);
    assert.equal(
      await normalizePathForCompare(result.projectRoot),
      await normalizePathForCompare(workingDir)
    );
    assert.equal(
      await fs.access(path.join(workingDir, 'openwiki', 'index.md')).then(
        () => true,
        () => false
      ),
      true
    );
    assert.equal(
      await fs.access(path.join(dir, 'openwiki', 'index.md')).then(
        () => true,
        () => false
      ),
      false
    );
    assert.match(
      await fs.readFile(path.join(workingDir, '.openwikiignore'), 'utf-8'),
      /^docs\/features\/$/mu
    );

    const audit = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(audit.status, 'commit_required');
    assert.equal(
      await normalizePathForCompare(audit.projectRoot),
      await normalizePathForCompare(workingDir)
    );
  });
});

test('root docsDir excludes Feature documents from the Knowledge fingerprint', async () => {
  await withTempDir('lsk-openwiki-root-docs-', async (dir) => {
    const { featureDir } = await initializeOpenWikiFeature(dir, true, {
      docsDirectory: '.',
      force: true,
    });
    const fake = await setupFakeOpenWiki(dir);
    const synced = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(synced.status, 'ok', synced.error);
    assert.match(
      await fs.readFile(path.join(dir, '.openwikiignore'), 'utf-8'),
      /^features\/$/mu
    );
    await git(dir, ['add', '.']);
    await git(dir, [
      'commit',
      '-m',
      'chore(F001): refresh OpenWiki knowledge layer',
    ]);
    await fs.appendFile(
      path.join(featureDir, 'spec.md'),
      '\nFeature-local note.\n',
      'utf-8'
    );
    await git(dir, ['add', path.join('features', 'F001-alpha', 'spec.md')]);
    await git(dir, ['commit', '-m', 'docs(F001): update feature note']);

    const audit = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(audit.status, 'verified');
    assert.equal(audit.sourceFingerprint, synced.receipt.sourceFingerprint);
  });
});

test('standalone Knowledge sync fails closed until its managed worktree exists', async () => {
  await withTempDir(
    'lsk-openwiki-standalone-worktree-required-',
    async (dir) => {
      const projectRoot = path.join(dir, 'project');
      await fs.mkdir(projectRoot, { recursive: true });
      await git(projectRoot, ['init']);
      await git(projectRoot, ['branch', '-M', 'main']);
      await git(projectRoot, ['config', 'user.name', 'Test User']);
      await git(projectRoot, ['config', 'user.email', 'test@example.com']);
      await fs.writeFile(path.join(projectRoot, 'README.md'), '# Project\n');
      await git(projectRoot, ['add', 'README.md']);
      await git(projectRoot, ['commit', '-m', 'chore: initialize project']);

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
        '--completion-strategy',
        'none',
        '--docs-repo',
        'standalone',
        '--project-root',
        './project',
        '--openwiki',
        'true',
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
      const tasksPath = path.join(
        dir,
        'docs',
        'features',
        'F001-alpha',
        'tasks.md'
      );
      const tasks = await fs.readFile(tasksPath, 'utf-8');
      await fs.writeFile(
        tasksPath,
        tasks.replace(
          /^- \*\*Branch\*\*:.*$/mu,
          '- **Branch**: `feat/F001-alpha`'
        )
      );

      const result = await runCli(dir, [
        'knowledge',
        'sync',
        'F001-alpha',
        '--json',
      ]);
      const payload = json(result);
      assert.equal(result.code, 1);
      assert.equal(payload.reasonCode, 'OPENWIKI_WORKTREE_REQUIRED');
      assert.equal(
        await fs.access(path.join(projectRoot, 'openwiki')).then(
          () => true,
          () => false
        ),
        false
      );
    }
  );
});

test('legacy in-place generation remains verifiable without a pre-review Knowledge gate', async () => {
  await withTempDir('lsk-openwiki-enabled-', async (dir) => {
    const { workingDir, featureDir } = await initializeOpenWikiFeature(
      dir,
      true
    );
    const workflowAudit = json(await runCli(dir, ['workflow-audit', '--json']));
    assert.match(
      workflowAudit.expectedWorkflowSyncMarker,
      /^<!-- lee-spec-kit:workflow-sync sha256:[a-f0-9]{64} -->$/u
    );
    await fs.appendFile(
      path.join(featureDir, 'tasks.md'),
      `\n${workflowAudit.expectedWorkflowSyncMarker}\n`,
      'utf-8'
    );
    await git(workingDir, ['add', path.join(featureDir, 'tasks.md')]);
    await git(workingDir, ['commit', '-m', 'docs(F001): record workflow sync']);

    const setupStage = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'], {
        LEE_SPEC_KIT_OPENWIKI_BIN: path.join(dir, 'missing-openwiki'),
      })
    );
    assert.equal(setupStage.stage, 'pre_pr_review');

    const fake = await setupFakeOpenWiki(dir);
    const doctor = json(
      await runCli(
        dir,
        ['knowledge', 'doctor', 'F001-alpha', '--json'],
        fake.env
      )
    );
    assert.equal(doctor.status, 'ok');
    assert.equal(doctor.runtime.version, '0.5.2');

    const beforeSync = json(
      await runCli(dir, ['workflow-stage', 'F001-alpha', '--json'], fake.env)
    );
    assert.equal(beforeSync.stage, 'pre_pr_review');

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
    assert.equal(syncResult.receipt.schemaVersion, 3);
    assert.equal(syncResult.receipt.okfVersion, '0.2');
    assert.equal(
      syncResult.receipt.writingPolicy.adapterId,
      'lee-spec-kit.technical-writing'
    );
    assert.equal(
      syncResult.receipt.writingPolicy.skillName,
      'lee-spec-kit-technical-writing'
    );
    assert.equal(syncResult.receipt.writingPolicy.adapterVersion, '1.7.0');
    assert.match(syncResult.receipt.writingPolicy.skillHash, /^sha256:/u);
    assert.match(syncResult.receipt.writingPolicy.instructionHash, /^sha256:/u);
    assert.equal(syncResult.progress.phase, 'complete');
    assert.equal(
      syncResult.progress.completedPages,
      syncResult.progress.totalPages
    );
    assert.equal(syncResult.progress.skippedPages, 0);
    assert.deepEqual(syncResult.progress.skippedPagePaths, []);
    assert.equal(syncResult.evidenceIntegrity.readerPagesValidated, 1);
    assert.equal(syncResult.evidenceIntegrity.markdownSourceLinksValidated, 1);
    assert.match(
      await fs.readFile(path.join(dir, '.openwikiignore'), 'utf-8'),
      /^docs\/features\/$/mu
    );
    assert.equal(syncResult.progress.currentPage, undefined);
    const openWikiIgnore = await fs.readFile(
      path.join(dir, '.openwikiignore'),
      'utf-8'
    );
    assert.match(openWikiIgnore, /^\.env$/mu);
    assert.match(openWikiIgnore, /^\.lee-spec-kit\/openwiki-run\.json$/mu);
    assert.match(openWikiIgnore, /^\*\*\/secrets\/$/mu);
    assert.match(openWikiIgnore, /# lee-spec-kit:openwiki-ignore:end\s*$/u);
    const instructions = await fs.readFile(
      path.join(dir, 'openwiki', 'INSTRUCTIONS.md'),
      'utf-8'
    );
    assert.match(instructions, /<!-- lee-spec-kit:writing-policy:begin -->/u);
    assert.match(
      instructions,
      /\/skills\/lee-spec-kit-technical-writing\/SKILL\.md/u
    );
    assert.match(
      await fs.readFile(
        path.join(
          fake.env.OPENWIKI_CONFIG_DIR,
          'skills',
          'lee-spec-kit-technical-writing',
          'SKILL.md'
        ),
        'utf-8'
      ),
      /Plan, write, and revise code-grounded OpenWiki documentation/u
    );
    assert.match(
      await fs.readFile(
        path.join(
          fake.env.OPENWIKI_CONFIG_DIR,
          'skills',
          'lee-spec-kit-technical-writing',
          'SKILL.md'
        ),
        'utf-8'
      ),
      /every generated reader-facing page except the index/u
    );
    assert.match(instructions, /### Planner contract/u);
    assert.match(instructions, /### Page-worker contract/u);
    assert.match(
      instructions,
      /tutorials, how-to guides, explanations, or references/u
    );
    assert.match(
      instructions,
      /Copy every bullet under \*\*Page-worker contract\*\* into every page job's `instructions`/u
    );
    assert.match(instructions, /exact planned page path/u);
    assert.match(instructions, /including the `\.md` suffix/u);
    assert.match(instructions, /literal forward slashes/u);
    assert.match(instructions, /Never insert backslashes/u);
    assert.match(instructions, /Seed page jobs only with tracked files/u);
    assert.match(instructions, /excluded from that fingerprint/u);
    assert.match(instructions, /never valid .*targets or Claim sources/u);
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
    assert.equal(commitStage.stage, beforeSync.stage);

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
      !requiredPaths.some(
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
      !requiredPaths.some(
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

test('OpenWiki sync rejects Korean prose that violates the writing adapter voice', async () => {
  await withTempDir('lsk-openwiki-korean-style-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.lang = 'ko';
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    await git(dir, ['add', configPath]);
    await git(dir, ['commit', '-m', 'chore(F001): use Korean documentation']);

    const fake = await setupFakeOpenWiki(dir);
    const result = await runCli(
      dir,
      ['knowledge', 'sync', 'F001-alpha', '--json'],
      {
        ...fake.env,
        FAKE_OPENWIKI_LANGUAGE: 'ko',
        FAKE_OPENWIKI_PAGE_PROSE: '워커가 만료된 작업을 이어받는다.',
      },
      { timeoutMs: 60_000 }
    );
    const payload = json(result);

    assert.equal(result.code, 1);
    assert.equal(payload.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.equal(payload.details.validation, 'writing_style');
    assert.equal(payload.details.failureCount, 1);
    assert.deepEqual(payload.details.violations, [
      {
        path: 'openwiki/architecture map.md',
        line: 6,
        rule: 'ko_reader_voice',
        excerpt: '워커가 만료된 작업을 이어받는다.',
      },
    ]);
    assert.match(payload.error, /OpenWiki writing style failed/u);
    assert.equal(
      await fs
        .access(path.join(dir, '.lee-spec-kit', 'openwiki-sync.json'))
        .then(
          () => true,
          () => false
        ),
      false
    );
    const instructions = await fs.readFile(
      path.join(dir, 'openwiki', 'INSTRUCTIONS.md'),
      'utf-8'
    );
    assert.match(instructions, /`해요체`/u);
    assert.match(instructions, /`-하세요`/u);

    const retry = json(
      await runCli(dir, ['knowledge', 'sync', 'F001-alpha', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_LANGUAGE: 'ko',
        FAKE_OPENWIKI_PAGE_PROSE: '워커가 만료된 작업을 이어받아요.',
      })
    );
    assert.equal(retry.status, 'ok', retry.error);
    await fs.mkdir(path.join(dir, 'openwiki', 'operations'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(dir, 'openwiki', 'operations', 'index.md'),
      '# 운영\n\n워커를 실행합니다.\n'
    );
    const audit = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(audit.status, 'blocked');
    assert.match(audit.detail, /openwiki\/operations\/index\.md:3/u);
  });
});

test('OpenWiki sync repairs stale evidence without resetting existing pages', async () => {
  await withTempDir('lsk-openwiki-evidence-retry-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_CLAIM_MODE: 'stale-first',
          FAKE_OPENWIKI_RUN_ID: 'first-attempt',
          FAKE_OPENWIKI_REPAIR_RUN_ID: 'repair-attempt',
          FAKE_OPENWIKI_REPAIR_REQUIRE_EXISTING_PAGE: '1',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(result.status, 'ok', result.error);
    const invocations = (await fs.readFile(fake.invocationLog, 'utf-8'))
      .split('\n')
      .filter((entry) =>
        entry.startsWith('code --update --print --language en')
      );
    assert.equal(invocations.length, 2);
    assert.match(invocations[1], /validation repair/u);
    const runtime = path.join(
      dir,
      '.git',
      'lee-spec-kit.runtime',
      'knowledge-executions'
    );
    const executions = await fs.readdir(runtime);
    const journal = await fs.readFile(
      path.join(runtime, executions[0], 'events.jsonl'),
      'utf8'
    );
    const events = journal
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const failure = events.find((event) => event.stage === 'validation_failed');
    assert.equal(failure.attempt, 1);
    assert.equal(failure.runId, 'first-attempt');
    assert.ok(failure.paths.includes('README.md'));
    assert.ok(failure.paths.includes('openwiki/.claims/architecture map.json'));
    assert.equal(events.at(-1).runId, 'repair-attempt');
    assert.equal(failure.phase, 'evidence_integrity');
    assert.match(failure.message, /stale line evidence/u);
    assert.equal(events.at(-1).stage, 'complete');
    assert.equal(events.at(-1).attempt, 2);
    const retry = events.find((event) => event.stage === 'retry');
    await fs.access(
      path.join(retry.snapshotPath, '.claims', 'architecture map.json')
    );
    assert.doesNotMatch(journal, /lee-spec-kit validation repair/u);
    assert.equal(
      await fs
        .readFile(
          path.join(dir, 'openwiki', '.claims', 'architecture map.json'),
          'utf-8'
        )
        .then((content) => content.includes('sha256:' + '0'.repeat(64))),
      false
    );
  });
});

test('OpenWiki migrates an older receipt to the managed writing policy and preserves custom instructions', async () => {
  await withTempDir('lsk-openwiki-writing-migration-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const first = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(first.status, 'ok', first.error);

    const instructionsPath = path.join(dir, 'openwiki', 'INSTRUCTIONS.md');
    await fs.appendFile(
      instructionsPath,
      '\nProject-specific rule: introduce the demo API before its worker.\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, 'openwiki', 'obsolete.md'),
      '# Obsolete generated page\n',
      'utf-8'
    );
    const receiptPath = path.join(dir, '.lee-spec-kit', 'openwiki-sync.json');
    const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf-8'));
    receipt.schemaVersion = 2;
    delete receipt.writingPolicy;
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    const stale = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(stale.status, 'sync_required');
    assert.equal(stale.reasonCode, 'OPENWIKI_WRITING_POLICY_STALE');

    const migrated = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(migrated.status, 'ok', migrated.error);
    const runtime = path.join(
      dir,
      '.git',
      'lee-spec-kit.runtime',
      'knowledge-executions'
    );
    const events = (
      await Promise.all(
        (await fs.readdir(runtime)).map(async (entry) =>
          (await fs.readFile(path.join(runtime, entry, 'events.jsonl'), 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
        )
      )
    ).flat();
    const reset = events.find((event) => event.stage === 'regeneration');
    assert.match(reset.retryReason, /writing policy/u);
    assert.equal(
      await fs.readFile(path.join(reset.snapshotPath, 'obsolete.md'), 'utf8'),
      '# Obsolete generated page\n'
    );
    assert.equal(migrated.receipt.schemaVersion, 3);
    assert.equal(
      await fs.access(path.join(dir, 'openwiki', 'obsolete.md')).then(
        () => true,
        () => false
      ),
      false
    );
    assert.match(
      await fs.readFile(instructionsPath, 'utf-8'),
      /Project-specific rule: introduce the demo API before its worker\./u
    );
    const invocations = (await fs.readFile(fake.invocationLog, 'utf-8'))
      .split('\n')
      .filter((entry) => entry === 'code --update --print --language en');
    assert.equal(invocations.length, 2);
  });
});

test('OpenWiki does not overwrite a same-name user skill', async () => {
  await withTempDir('lsk-openwiki-writing-conflict-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const skillDirectory = path.join(
      fake.env.OPENWIKI_CONFIG_DIR,
      'skills',
      'lee-spec-kit-technical-writing'
    );
    await fs.mkdir(skillDirectory, { recursive: true });
    await fs.writeFile(
      path.join(skillDirectory, 'SKILL.md'),
      '# User-owned skill\n',
      'utf-8'
    );

    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'error');
    assert.equal(result.reasonCode, 'OPENWIKI_WRITING_SKILL_CONFLICT');
    assert.equal(
      await fs.readFile(path.join(skillDirectory, 'SKILL.md'), 'utf-8'),
      '# User-owned skill\n'
    );
  });
});

test('OpenWiki does not replace a dangling same-name user skill symlink', async () => {
  await withTempDir('lsk-openwiki-writing-symlink-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const skillsDirectory = path.join(fake.env.OPENWIKI_CONFIG_DIR, 'skills');
    const skillDirectory = path.join(
      skillsDirectory,
      'lee-spec-kit-technical-writing'
    );
    await fs.mkdir(skillsDirectory, { recursive: true });
    await fs.symlink(path.join(dir, 'missing-user-skill'), skillDirectory);

    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'error');
    assert.equal(result.reasonCode, 'OPENWIKI_WRITING_SKILL_CONFLICT');
    assert.equal((await fs.lstat(skillDirectory)).isSymbolicLink(), true);
  });
});

test('OpenWiki normalizes a relative config directory for installation and the child process', async () => {
  await withTempDir('lsk-openwiki-relative-config-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const relativeConfigDir = `../${path.basename(dir)}-openwiki-config`;
    const absoluteConfigDir = path.resolve(
      await fs.realpath(dir),
      relativeConfigDir
    );
    try {
      const result = json(
        await runCli(
          dir,
          ['knowledge', 'sync', 'F001-alpha', '--json'],
          {
            ...fake.env,
            OPENWIKI_CONFIG_DIR: relativeConfigDir,
            FAKE_OPENWIKI_EXPECT_CONFIG_DIR: absoluteConfigDir,
          },
          { timeoutMs: 60_000 }
        )
      );
      assert.equal(result.status, 'ok', result.error);
      assert.equal(
        await fs
          .access(
            path.join(
              absoluteConfigDir,
              'skills',
              'lee-spec-kit-technical-writing',
              'SKILL.md'
            )
          )
          .then(
            () => true,
            () => false
          ),
        true
      );
    } finally {
      await fs.rm(absoluteConfigDir, { recursive: true, force: true });
    }
  });
});

test('OpenWiki rejects an unignored project-local config directory before installation', async () => {
  await withTempDir('lsk-openwiki-visible-config-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const visibleConfigDir = path.join(dir, 'visible-openwiki-config');
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        { ...fake.env, OPENWIKI_CONFIG_DIR: visibleConfigDir },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'error');
    assert.equal(result.reasonCode, 'OPENWIKI_CONFIG_DIR_UNSAFE');
    assert.equal(
      await fs.access(visibleConfigDir).then(
        () => true,
        () => false
      ),
      false
    );
  });
});

test('OpenWiki refuses a receipt when the installed writing skill changes during generation', async () => {
  await withTempDir('lsk-openwiki-writing-tamper-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        { ...fake.env, FAKE_OPENWIKI_TAMPER_WRITING_SKILL: '1' },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'error');
    assert.equal(result.reasonCode, 'OPENWIKI_WRITING_SKILL_UNAVAILABLE');
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
      assert.equal(
        payload.details.validation,
        environmentName === 'FAKE_OPENWIKI_CITATION_MODE'
          ? 'citation_ranges'
          : 'evidence_integrity'
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
      const invocations = (await fs.readFile(fake.invocationLog, 'utf-8'))
        .split('\n')
        .filter((entry) => entry === 'code --update --print --language en');
      assert.equal(invocations.length, 1);
    });
  }
});

test('OpenWiki sync refuses reader pages without a repo source link', async () => {
  await withTempDir('lsk-openwiki-reader-source-link-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = await runCli(
      dir,
      ['knowledge', 'sync', 'F001-alpha', '--json'],
      { ...fake.env, FAKE_OPENWIKI_OMIT_SOURCE_LINK: '1' },
      { timeoutMs: 60_000 }
    );
    const payload = json(result);

    assert.equal(result.code, 1);
    assert.equal(payload.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.equal(payload.details.validation, 'evidence_structure');
    assert.match(payload.error, /no valid reader-facing repo:\/\//u);
    const log = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
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

test('OpenWiki feeds a directory-link failure back once and verifies the repaired output', async () => {
  await withTempDir('lsk-openwiki-feedback-repair-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'entry.ts'), 'export {};\n');
    await git(dir, ['add', 'src']);
    await git(dir, ['commit', '-m', 'feat(F001): add source entry']);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_SOURCE_LINK_TARGET: 'src',
          FAKE_OPENWIKI_REPAIR_SUCCEEDS: '1',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'ok', result.error);
    const log = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    assert.match(log, /non-regular Git object \(040000 tree\): src/u);
    assert.match(log, /architecture map\.md:\d+/u);
    assert.equal(
      await fs.readFile(path.join(dir, 'src', 'entry.ts'), 'utf-8'),
      'export {};\n'
    );
    assert.ok(result.receipt.outputHash);
    assert.ok(result.evidenceIntegrity.repoLineEvidenceValidated > 0);
  });
});

test('OpenWiki repairs a citation to a fingerprint-excluded source', async () => {
  await withTempDir('lsk-openwiki-excluded-evidence-repair-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_SOURCE_LINK_TARGET: 'AGENTS.md#L1-L1',
          FAKE_OPENWIKI_REPAIR_SUCCEEDS: '1',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'ok', result.error);
    const log = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    assert.match(log, /excluded from the Knowledge fingerprint: AGENTS\.md/u);
    assert.ok(result.receipt.outputHash);
  });
});

test('OpenWiki sync rejects generated Knowledge as a repo source link', async () => {
  await withTempDir('lsk-openwiki-reader-generated-link-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = await runCli(
      dir,
      ['knowledge', 'sync', 'F001-alpha', '--json'],
      {
        ...fake.env,
        FAKE_OPENWIKI_SOURCE_LINK_TARGET: 'openwiki/index.md',
      },
      { timeoutMs: 60_000 }
    );
    const payload = json(result);

    assert.equal(result.code, 1);
    assert.equal(payload.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.equal(payload.details.validation, 'evidence_structure');
    assert.match(payload.error, /excluded from the Knowledge fingerprint/u);
    // The diagnostic names the page, so the run offers one bounded repair. The
    // fake keeps the same broken citation, so publication still fails closed.
    assert.equal(
      (await fs.readFile(fake.invocationLog, 'utf-8')).split(
        'lee-spec-kit validation repair'
      ).length - 1,
      1
    );
  });
});

test('OpenWiki refuses a receipt when tracked source changes during feedback repair', async () => {
  await withTempDir('lsk-openwiki-repair-drift-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_OMIT_SOURCE_LINK: '1',
          FAKE_OPENWIKI_REPAIR_SUCCEEDS: '1',
          FAKE_OPENWIKI_REPAIR_SOURCE_DRIFT: '1',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.reasonCode, 'OPENWIKI_OUTPUT_SCOPE_VIOLATION');
    await assert.rejects(
      fs.access(path.join(dir, '.lee-spec-kit', 'openwiki-sync.json'))
    );
    await fs.access(path.join(dir, 'openwiki', 'architecture map.md'));
  });
});

test('OpenWiki validates reader source links with balanced path parentheses and an EOF boundary', async () => {
  await withTempDir('lsk-openwiki-reader-source-syntax-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const sourceDirectory = path.join(dir, 'app', '(group)');
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.writeFile(
      path.join(sourceDirectory, 'page.tsx'),
      'export default function Page() {}\n',
      'utf-8'
    );
    await git(dir, ['add', 'app/(group)/page.tsx']);
    await git(dir, ['commit', '-m', 'test(F001): add grouped route']);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_SOURCE_LINK_TARGET: 'app/(group)/page.tsx#L1-L2',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(result.status, 'ok', result.error);
    assert.equal(result.evidenceIntegrity.readerPagesValidated, 1);
    assert.equal(result.evidenceIntegrity.markdownSourceLinksValidated, 1);
  });
});

test('OpenWiki still rejects reader source ranges beyond the trailing EOF boundary', async () => {
  await withTempDir('lsk-openwiki-reader-source-range-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_SOURCE_LINK_TARGET: 'README.md#L1-L5',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(result.status, 'error');
    assert.equal(result.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.equal(result.details.validation, 'citation_ranges');
    assert.match(result.error, /exceeds README\.md's 3 lines: L1-L5/u);
  });
});

test('OpenWiki preserves current-policy terminal output for a later validation retry', async () => {
  await withTempDir('lsk-openwiki-terminal-validation-retry-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const invalid = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_SOURCE_LINK_TARGET: 'README.md#L1-L99',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(invalid.status, 'error');
    assert.equal(invalid.details.validation, 'citation_ranges');

    const pending = json(
      await runCli(
        dir,
        ['knowledge', 'audit', 'F001-alpha', '--json'],
        fake.env
      )
    );
    assert.equal(pending.reasonCode, 'OPENWIKI_RUN_INCOMPLETE');
    assert.equal(
      pending.interruption.reasonCode,
      'OPENWIKI_POST_GENERATION_VALIDATION_PENDING'
    );
    assert.match(pending.detail, /completed generation/u);
    assert.doesNotMatch(pending.detail, /before OpenWiki persisted/u);
    assert.match(pending.interruption.validationFailure.message, /L1-L99/u);

    const recovered = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_REQUIRE_EXISTING_PAGE: '1',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(recovered.status, 'ok', recovered.error);
    const invocations = (await fs.readFile(fake.invocationLog, 'utf-8'))
      .split('\n')
      .filter((entry) => entry === 'code --update --print --language en');
    assert.equal(invocations.length, 2);
  });
});

test('OpenWiki repairs internal links, missing reader links and citation ranges in one pass', async () => {
  await withTempDir('lsk-openwiki-combined-repair-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_BROKEN_LINK_MODE: 'always',
          FAKE_OPENWIKI_OMIT_SOURCE_LINK: '1',
          FAKE_OPENWIKI_CITATION_MODE: 'stale',
          FAKE_OPENWIKI_REPAIR_SUCCEEDS: '1',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'ok', result.error);
    const log = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    for (const type of [
      'internal_links',
      'evidence_structure',
      'citation_ranges',
    ])
      assert.ok(log.includes(type), type);
    await fs.access(path.join(dir, 'openwiki', 'missing.md'));
  });
});

test('OpenWiki repairs an unsafe generated local link in one bounded pass', async () => {
  await withTempDir('lsk-openwiki-unsafe-link-repair-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_INDEX_LINK: '?:#',
          FAKE_OPENWIKI_REPAIR_SUCCEEDS: '1',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(result.status, 'ok', result.error);
    const log = await fs.readFile(fake.invocationLog, 'utf8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    assert.match(log, /unsafe_local_path/u);
  });
});

test('OpenWiki retries only a page worker skipped during bounded validation repair', async () => {
  await withTempDir('lsk-openwiki-repair-skip-recovery-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_INDEX_LINK: '?:#',
          FAKE_OPENWIKI_REPAIR_SUCCEEDS: '1',
          FAKE_OPENWIKI_REPAIR_INTERRUPTED: 'skipped',
          FAKE_OPENWIKI_REPAIR_SLEEP_MS: '1500',
          FAKE_OPENWIKI_SKIPPED_RECOVERY_SUCCEEDS: '1',
          FAKE_OPENWIKI_REPAIR_REQUIRE_EXISTING_PAGE: '1',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(result.status, 'ok', result.error);
    const log = await fs.readFile(fake.invocationLog, 'utf8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    assert.equal(log.split('lee-spec-kit skipped page recovery').length - 1, 1);
    assert.match(log, /\/openwiki\/architecture map\.md/u);
  });
});

test('OpenWiki repairs once then fails closed on a repeated excluded source', async () => {
  await withTempDir('lsk-openwiki-combined-block-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_BROKEN_LINK_MODE: 'always',
          FAKE_OPENWIKI_SOURCE_LINK_TARGET: 'openwiki/index.md',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.match(result.error, /excluded/u);
    // Both failures are repairable, so the run repairs once. The fake keeps
    // emitting the broken link, so the second validation still fails closed.
    assert.equal(
      (await fs.readFile(fake.invocationLog, 'utf-8')).split(
        'lee-spec-kit validation repair'
      ).length - 1,
      1
    );
  });
});

test('OpenWiki repairs mixed evidence and broken-link diagnostics in a single pass', async () => {
  await withTempDir('lsk-openwiki-link-repair-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_CLAIM_MODE: 'stale-first',
          FAKE_OPENWIKI_BROKEN_LINK_MODE: 'first',
          FAKE_OPENWIKI_REPAIR_SUCCEEDS: '1',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(result.status, 'ok', result.error);
    const invocations = (await fs.readFile(fake.invocationLog, 'utf-8'))
      .split('\n')
      .filter((entry) => entry === 'code --update --print --language en');
    assert.equal(invocations.length, 1);
    const log = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    assert.match(log, /architecture map\.md/);
    assert.match(log, /\/openwiki\/missing\.md/);
    // Both failures from the same verification pass must reach the one repair request.
    const executions = path.join(
      dir,
      '.git',
      'lee-spec-kit.runtime',
      'knowledge-executions'
    );
    const journal = await fs.readFile(
      path.join(executions, (await fs.readdir(executions))[0], 'events.jsonl'),
      'utf-8'
    );
    const events = journal
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(
      events.find((event) => event.stage === 'validation_failed').phase,
      'document_repair'
    );
    assert.equal(
      events.some((event) => event.stage === 'regeneration'),
      false
    );
    assert.match(log, /stale line evidence/u);
    await fs.access(path.join(dir, 'openwiki', 'missing.md'));
    assert.match(
      await fs.readFile(
        path.join(dir, 'openwiki', 'architecture map.md'),
        'utf-8'
      ),
      /\[Missing\]\(missing\.md\)/u
    );
    assert.doesNotMatch(
      await fs.readFile(
        path.join(dir, 'openwiki', 'architecture map.md'),
        'utf-8'
      ),
      /openwiki: broken internal link/u
    );
  });
});

test('OpenWiki repairs existing root-relative Knowledge targets for visualization', async () => {
  await withTempDir('lsk-openwiki-link-root-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_INDEX_LINK: '/openwiki/architecture%20map.md#overview',
          FAKE_OPENWIKI_REPAIR_SUCCEEDS: '1',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'ok', result.error);
    const log = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    assert.match(log, /visualize_root_link/u);
    assert.match(log, /suggestedHref/u);
    assert.match(
      await fs.readFile(path.join(dir, 'openwiki', 'index.md'), 'utf-8'),
      /\[Architecture\]\(architecture%20map\.md#overview\)/u
    );
  });
});

test('OpenWiki does not certify existing root-relative targets when repair fails', async () => {
  await withTempDir('lsk-openwiki-link-root-failed-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_INDEX_LINK: '/openwiki/architecture%20map.md',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.match(result.error, /Invalid OpenWiki navigation links/u);
    const log = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    assert.match(log, /visualize_root_link/u);
    await assert.rejects(
      fs.access(path.join(dir, '.lee-spec-kit', 'openwiki-sync.json')),
      { code: 'ENOENT' }
    );
  });
});

test('OpenWiki stops after one failed internal-link repair without a receipt', async () => {
  await withTempDir('lsk-openwiki-link-repair-failed-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_BROKEN_LINK_MODE: 'always',
          FAKE_OPENWIKI_INDEX_LINK: '/openwiki/other-missing.md',
          FAKE_OPENWIKI_PAGE_PROSE: Array.from(
            { length: 6 },
            (_, i) => `[Topic ${i}](/openwiki/topic-${i}.md)`
          ).join(' '),
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.match(result.error, /Invalid OpenWiki navigation links/);
    const log = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    assert.match(log, /other-missing\.md/u);
    assert.match(log, /architecture map\.md/u);
    assert.match(log, /index\.md/u);
    assert.match(log, /repairTargets/u);
    assert.match(log, /topic-5\.md/u);
    await assert.rejects(
      fs.access(path.join(dir, '.lee-spec-kit', 'openwiki-sync.json')),
      { code: 'ENOENT' }
    );
  });
});

test('OpenWiki repairs an unstamped missing page from generated navigation', async () => {
  await withTempDir('lsk-openwiki-link-unstamped-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_INDEX_LINK: '/openwiki/missing.md',
          FAKE_OPENWIKI_BROKEN_LINK_MODE: 'restore-only',
          FAKE_OPENWIKI_REPAIR_SUCCEEDS: '1',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(result.status, 'ok', result.error);
    await fs.access(path.join(dir, 'openwiki', 'missing.md'));
    const log = await fs.readFile(fake.invocationLog, 'utf-8');
    assert.equal(log.split('lee-spec-kit validation repair').length - 1, 1);
    assert.match(log, /index\.md/u);
  });
});

test('OpenWiki replaces a terminal validation owner after a writing policy change', async () => {
  await withTempDir('lsk-openwiki-terminal-policy-owner-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const invalid = await runCli(
      dir,
      ['knowledge', 'sync', 'F001-alpha', '--json'],
      {
        ...fake.env,
        FAKE_OPENWIKI_SOURCE_LINK_TARGET: 'openwiki/index.md',
      },
      { timeoutMs: 60_000 }
    );
    assert.equal(invalid.code, 1);

    const ownerPath = path.join(dir, '.lee-spec-kit', 'openwiki-run.json');
    const owner = JSON.parse(await fs.readFile(ownerPath, 'utf-8'));
    owner.writingPolicyHash = `sha256:${'0'.repeat(64)}`;
    await fs.writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);

    const inspect = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(inspect.status, 'sync_required');
    assert.equal(inspect.reasonCode, 'OPENWIKI_WRITING_POLICY_STALE');

    const recovered = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        fake.env,
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(recovered.status, 'ok', recovered.error);
    assert.equal(recovered.reasonCode, 'OPENWIKI_SYNCED');
    assert.equal(recovered.evidenceIntegrity.readerPagesValidated, 1);
    await assert.rejects(fs.access(ownerPath));
  });
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
      'architecture map.json'
    );
    const originalClaim = await fs.readFile(claimPath, 'utf-8');
    await fs.writeFile(
      claimPath,
      originalClaim.replace(
        /repo-lines-v1:sha256:[0-9a-f]{64}/u,
        `repo-lines-v1:sha256:${'0'.repeat(64)}`
      ),
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
    await refreshFakePageVersion(dir);
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

test('OpenWiki validates raw repo-file evidence and does not retry unsupported evidence', async () => {
  await withTempDir('lsk-openwiki-file-evidence-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    await fs.writeFile(
      path.join(dir, 'fixture.bin'),
      new Uint8Array([0, 255, 10, 13, 128, 1])
    );
    await git(dir, ['add', 'fixture.bin']);
    await git(dir, ['commit', '-m', 'test(F001): add binary evidence']);
    const fake = await setupFakeOpenWiki(dir);
    const valid = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_EVIDENCE_MODE: 'file',
          FAKE_OPENWIKI_EVIDENCE_PATH: 'fixture.bin',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(valid.status, 'ok', valid.error);
    assert.equal(valid.evidenceIntegrity.repoFileEvidenceValidated, 1);
    assert.equal(valid.evidenceIntegrity.repoLineEvidenceValidated, 0);
  });

  await withTempDir('lsk-openwiki-unsupported-evidence-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = await runCli(
      dir,
      ['knowledge', 'sync', 'F001-alpha', '--json'],
      { ...fake.env, FAKE_OPENWIKI_EVIDENCE_MODE: 'unsupported' },
      { timeoutMs: 60_000 }
    );
    const payload = json(result);
    assert.equal(result.code, 1);
    assert.equal(payload.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.equal(payload.details.validation, 'evidence_structure');
    const invocations = (await fs.readFile(fake.invocationLog, 'utf-8'))
      .split('\n')
      .filter((entry) => entry === 'code --update --print --language en');
    assert.equal(invocations.length, 1);
    assert.doesNotMatch(
      await fs.readFile(fake.invocationLog, 'utf-8'),
      /lee-spec-kit validation repair/u
    );
  });

  await withTempDir('lsk-openwiki-stale-file-evidence-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const result = await runCli(
      dir,
      ['knowledge', 'sync', 'F001-alpha', '--json'],
      { ...fake.env, FAKE_OPENWIKI_EVIDENCE_MODE: 'file-stale' },
      { timeoutMs: 60_000 }
    );
    const payload = json(result);
    assert.equal(result.code, 1);
    assert.equal(payload.details.validation, 'evidence_integrity');
    assert.match(payload.error, /stale file evidence/u);
    const invocations = (await fs.readFile(fake.invocationLog, 'utf-8'))
      .split('\n')
      .filter((entry) => entry === 'code --update --print --language en');
    assert.equal(invocations.length, 1);
  });
});

test('OpenWiki modern provenance binds Markdown, manifest, claims, and last-update metadata', async () => {
  await withTempDir('lsk-openwiki-modern-provenance-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const sync = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        { ...fake.env, FAKE_OPENWIKI_EXTRA_PAGE: '1' },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(sync.status, 'ok', sync.error);
    assert.equal(sync.evidenceIntegrity.manifestPages, 2);
    assert.equal(sync.evidenceIntegrity.distinctRunCount, 2);

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

    const manifestPath = path.join(dir, 'openwiki', '.page-manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    manifest.pages['/openwiki/architecture map.md'].pageVersion =
      `sha256:${'0'.repeat(64)}`;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await rebindOpenWikiReceiptOutputHash(dir);
    const stalePage = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(stalePage.status, 'sync_required');
    assert.match(
      stalePage.detail,
      /pageVersion does not match Markdown bytes/u
    );
  });
});

test('OpenWiki audit rejects lingering run state and mismatched completion metadata', async () => {
  await withTempDir('lsk-openwiki-run-provenance-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
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
    await git(dir, [
      'commit',
      '-m',
      'chore(F001): refresh OpenWiki knowledge layer',
    ]);

    const runPath = path.join(dir, 'openwiki', '.run.json');
    await fs.writeFile(
      runPath,
      `${JSON.stringify({
        schemaVersion: 1,
        runId: 'orphan-run',
        mode: 'update',
        phase: 'generating',
        plan: { pages: [] },
      })}\n`
    );
    const incomplete = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.notEqual(incomplete.status, 'verified');
    assert.equal(incomplete.reasonCode, 'OPENWIKI_RUN_OWNER_MISMATCH');
    await fs.rm(runPath);

    const lastUpdatePath = path.join(dir, 'openwiki', '.last-update.json');
    const lastUpdate = JSON.parse(await fs.readFile(lastUpdatePath, 'utf-8'));
    lastUpdate.gitHead = '0'.repeat(40);
    await fs.writeFile(
      lastUpdatePath,
      `${JSON.stringify(lastUpdate, null, 2)}\n`
    );
    await rebindOpenWikiReceiptOutputHash(dir);
    const mismatched = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(mismatched.status, 'sync_required');
    assert.match(mismatched.detail, /gitHead does not match/u);
  });
});

test('OpenWiki accepts legacy OKF 0.1 output without modern provenance metadata', async () => {
  await withTempDir('lsk-openwiki-legacy-provenance-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
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
    await fs.rm(path.join(dir, 'openwiki', '.page-manifest.json'));
    const indexPath = path.join(dir, 'openwiki', 'index.md');
    await fs.writeFile(
      indexPath,
      (await fs.readFile(indexPath, 'utf-8')).replace('"0.2"', '"0.1"'),
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, 'openwiki', '.last-update.json'),
      `${JSON.stringify({ status: 'complete', command: 'update' }, null, 2)}\n`
    );
    const receiptPath = path.join(dir, '.lee-spec-kit', 'openwiki-sync.json');
    const modernReceipt = JSON.parse(await fs.readFile(receiptPath, 'utf-8'));
    modernReceipt.okfVersion = '0.1';
    modernReceipt.outputHash = 'sha256:pending';
    await fs.writeFile(
      receiptPath,
      `${JSON.stringify(modernReceipt, null, 2)}\n`
    );
    await rebindOpenWikiReceiptOutputHash(dir);
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
      'chore(F001): preserve legacy OpenWiki knowledge',
    ]);
    const audit = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(audit.status, 'verified', JSON.stringify(audit));
    assert.equal(audit.receipt.schemaVersion, 3);
    assert.equal(audit.receipt.okfVersion, '0.1');
    assert.equal(audit.evidenceIntegrity.manifestPages, undefined);
  });
});

test('OpenWiki audit resolves a squashed fresh-clone snapshot from equivalent HEAD', async () => {
  await withTempDir('lsk-openwiki-squash-fallback-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
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
    await git(dir, [
      'commit',
      '-m',
      'chore(F001): refresh OpenWiki knowledge layer',
    ]);
    const featureTree = (
      await git(dir, ['rev-parse', 'HEAD^{tree}'])
    ).stdout.trim();
    const squashCommit = (
      await git(dir, [
        'commit-tree',
        featureTree,
        '-p',
        sync.receipt.baseHead,
        '-m',
        'feat(F001): squash alpha',
      ])
    ).stdout.trim();
    await git(dir, ['branch', '-f', 'main', squashCommit]);
    await git(dir, ['switch', 'main']);
    await git(dir, ['branch', '-D', 'feat/F001-alpha']);
    await git(dir, ['reflog', 'expire', '--expire=now', '--all']);
    await git(dir, ['gc', '--prune=now']);
    const missingSource = await runCommand(dir, 'git', [
      'cat-file',
      '-e',
      `${sync.receipt.sourceHead}^{commit}`,
    ]);
    assert.notEqual(missingSource.code, 0);

    const audit = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(audit.status, 'verified', JSON.stringify(audit));
    assert.equal(audit.evidenceIntegrity.resolvedFrom, 'head');
    assert.equal(
      audit.evidenceIntegrity.recordedSourceHead,
      sync.receipt.sourceHead
    );
    assert.equal(audit.evidenceIntegrity.resolvedHead, squashCommit);
    assert.equal(audit.receipt.sourceHead, sync.receipt.sourceHead);
  });
});

test('OpenWiki rejects claim evidence from fingerprint-excluded Feature docs', async () => {
  await withTempDir('lsk-openwiki-excluded-evidence-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
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
    await git(dir, [
      'commit',
      '-m',
      'chore(F001): refresh OpenWiki knowledge layer',
    ]);
    const claimPath = path.join(
      dir,
      'openwiki',
      '.claims',
      'architecture map.json'
    );
    const claim = JSON.parse(await fs.readFile(claimPath, 'utf-8'));
    claim.claims[0].evidence[0] = {
      resource: 'repo://docs/features/F001-alpha/spec.md#L1-L1',
      version: `repo-lines-v1:sha256:${'0'.repeat(64)}:fixture`,
    };
    await fs.writeFile(claimPath, `${JSON.stringify(claim, null, 2)}\n`);
    await rebindOpenWikiReceiptOutputHash(dir);
    const audit = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(audit.status, 'sync_required');
    assert.match(audit.detail, /excluded from the Knowledge fingerprint/u);
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
    const fake = await setupFakeOpenWiki(dir);
    const failed = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_SLEEP_MS: '1500',
          FAKE_OPENWIKI_INTERRUPTED: 'finished',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(failed.status, 'error');
    assert.equal(failed.reasonCode, 'OPENWIKI_RUN_INCOMPLETE');

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
    assert.equal(interrupted.interruption.ownerRunId, 'fake-run');
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
    const audit = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(
      audit.interruption.reasonCode,
      'OPENWIKI_SKIPPED_PAGES_OBSERVED'
    );
    assert.deepEqual(
      audit.interruption.observedSkippedPagePaths,
      payload.details.interruption.observedSkippedPagePaths
    );
    assert.match(audit.interruption.limitation, /unavailable from upstream/u);
    const ownerPath = path.join(dir, '.lee-spec-kit', 'openwiki-run.json');
    const owner = JSON.parse(await fs.readFile(ownerPath, 'utf-8'));
    owner.lastProgress.runId = 'other-run';
    await fs.writeFile(ownerPath, JSON.stringify(owner));
    const mismatched = json(
      await runCli(dir, ['knowledge', 'audit', 'F001-alpha', '--json'])
    );
    assert.equal(mismatched.interruption.observedSkippedPages, null);
    assert.equal(
      await fs
        .access(path.join(dir, '.lee-spec-kit', 'openwiki-sync.json'))
        .then(
          () => true,
          () => false
        ),
      false
    );
    const resumed = json(
      await runCli(dir, ['knowledge', 'sync', 'F001-alpha', '--json'], fake.env)
    );
    assert.equal(resumed.status, 'ok', resumed.error);
    await assert.rejects(fs.access(ownerPath), { code: 'ENOENT' });
  });
});

test('OpenWiki retries only the explicitly skipped page after a terminal interrupted run', async () => {
  await withTempDir('lsk-openwiki-skipped-page-recovery-', async (dir) => {
    await initializeOpenWikiFeature(dir, true);
    const fake = await setupFakeOpenWiki(dir);
    const failed = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_SLEEP_MS: '1500',
          FAKE_OPENWIKI_INTERRUPTED: 'skipped',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(failed.reasonCode, 'OPENWIKI_RUN_INCOMPLETE');
    const page = path.join(dir, 'openwiki', 'architecture map.md');
    const preserved = await fs.readFile(page);

    const recovered = json(
      await runCli(
        dir,
        ['knowledge', 'sync', 'F001-alpha', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_EXPECT_SKIPPED_RECOVERY: '1',
          FAKE_OPENWIKI_REQUIRE_EXISTING_PAGE: '1',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(recovered.status, 'ok', recovered.error);
    assert.deepEqual(await fs.readFile(page), preserved);
    const invocations = await fs.readFile(fake.invocationLog, 'utf8');
    assert.match(invocations, /lee-spec-kit skipped page recovery/u);
    assert.match(invocations, /\/openwiki\/architecture map\.md/u);
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
    assert.equal(failed.details?.outputTail, undefined);
    const survivedOwner = JSON.parse(
      await fs.readFile(
        path.join(dir, '.lee-spec-kit', 'openwiki-run.json'),
        'utf-8'
      )
    );
    assert.equal(survivedOwner.lastFailure?.exitCode, 7);
    assert.equal(survivedOwner.lastFailure?.outputTail, undefined);
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
        FAKE_OPENWIKI_BROKEN_LINK_MODE: 'always',
      })
    );
    assert.equal(unsafe.reasonCode, 'OPENWIKI_OUTPUT_INVALID');
    assert.match(unsafe.error, /index\.md:6:\d+/u);
    assert.match(unsafe.error, /\.\.\/\.\.\/outside\.md/u);
    assert.doesNotMatch(
      await fs.readFile(fake.invocationLog, 'utf-8'),
      /lee-spec-kit validation repair/u
    );
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
    assert.match(unsupported.runtime.detail, /Verified versions: 0[.]5[.]2/u);

    // An older 0.5.x patch is not verified either: it recorded page checkpoints
    // differently, so it fails fast instead of producing rejected Knowledge.
    manifest.version = '0.5.0';
    await fs.writeFile(
      fake.packageJsonPath,
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );
    const stale = json(
      await runCli(
        dir,
        ['knowledge', 'doctor', 'F001-alpha', '--json'],
        fake.env
      )
    );
    assert.equal(stale.status, 'blocked');
    assert.equal(stale.reasonCode, 'OPENWIKI_VERSION_UNSUPPORTED');

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

test('repository publication requires the dedicated CI path', async () => {
  await withTempDir('lsk-ci-only-publication-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const result = await runCli(dir, ['knowledge', 'publish', '--json']);
    assert.equal(result.code, 1);
    assert.equal(json(result).reasonCode, 'OPENWIKI_CI_REQUIRED');
  });
});

test('CI publication uses only the integrated revision and keeps the last good artifact on failure', async () => {
  await withTempDir('lsk-ci-publication-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'main']);
    const stale = await runCli(
      dir,
      ['knowledge', 'publish', '--ci', '--json'],
      fake.env
    );
    assert.equal(json(stale).reasonCode, 'OPENWIKI_CI_TARGET_STALE');
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const published = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(published.status, 'ok', published.error);
    assert.equal((await git(dir, ['status', '--porcelain'])).stdout.trim(), '');
    const cached = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_FAIL: '1',
      })
    );
    assert.equal(cached.artifactPath, published.artifactPath);
    const applied = json(await runCli(dir, ['knowledge', 'apply', '--json']));
    assert.equal(applied.reasonCode, 'OPENWIKI_APPLIED', JSON.stringify(applied));
    const clone = `${dir}-clone`;
    await runCommand(path.dirname(dir), 'git', ['clone', dir, clone]);
    const clonedStatus = json(
      await runCli(clone, ['knowledge', 'status', '--json'])
    );
    assert.equal(
      clonedStatus.knowledge.status,
      'current',
      JSON.stringify(clonedStatus)
    );
    assert.equal(
      clonedStatus.knowledge.publishedRevision,
      published.sourceHead
    );
    await fs.rm(clone, { recursive: true, force: true });
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const unchanged = json(
      await runCli(dir, ['knowledge', 'update', '--ci', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_FAIL: '1',
      })
    );
    assert.equal(unchanged.reasonCode, 'OPENWIKI_UP_TO_DATE');
    const lastGoodSourceHead = json(
      await runCli(dir, ['knowledge', 'status', '--json'])
    ).latest.sourceHead;
    await fs.appendFile(path.join(dir, 'README.md'), '\nSecond integration\n');
    await git(dir, ['add', 'README.md']);
    await git(dir, ['commit', '-m', 'feat: second integration']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const failure = await runCli(
      dir,
      ['knowledge', 'publish', '--ci', '--json'],
      { ...fake.env, FAKE_OPENWIKI_FAIL: '1' }
    );
    assert.equal(failure.code, 1);
    const status = json(await runCli(dir, ['knowledge', 'status', '--json']));
    assert.equal(status.attempt.status, 'failed');
    assert.equal(status.latest.sourceHead, lastGoodSourceHead);
    assert.equal(status.knowledge.status, 'failed');
    assert.equal(status.knowledge.currentRevision, (await git(dir, ['rev-parse', 'HEAD'])).stdout.trim());
    assert.equal(status.knowledge.publishedRevision, lastGoodSourceHead);
    await fs.access(path.join(published.artifactPath, 'publication.json'));
    const workflow = json(await runCli(dir, ['knowledge', 'ci', '--json']));
    const yaml = await fs.readFile(workflow.path, 'utf8');
    assert.match(yaml, /schedule:\n {4}- cron:/u);
    assert.match(yaml, /workflow_dispatch:/u);
    assert.match(yaml, /openwiki@0\.5\.2/u);
    assert.match(yaml, /permissions:\n {2}actions: read/u);
    assert.doesNotMatch(yaml, /timeout-minutes:/u);
    assert.match(yaml, /knowledge update --ci/u);
    assert.match(yaml, /--baseline-ref "refs\/remotes\/origin\/\$KNOWLEDGE_BRANCH"/u);
    assert.match(yaml, /git push --force-with-lease origin/u);
    assert.match(yaml, /gh pr create/u);
    assert.match(yaml, /cancel-in-progress: false/u);
    assert.match(yaml, /steps\.prior_failure\.outputs\.blocked != 'true'/u);
    assert.match(yaml, /knowledge-existing\.json/u);
    assert.match(yaml, /knowledge status --ci --base-branch 'main' --lang en/u);
    assert.match(yaml, /knowledge apply --ci --base-branch 'main' --lang en/u);
    assert.match(yaml, /gh pr list --head "\$KNOWLEDGE_BRANCH"/u);
    assert.match(yaml, /git switch -C 'main' "\$base"/u);
    assert.match(yaml, /upload-artifact@v4/u);
    assert.match(yaml, /knowledge-status\.json/u);
    assert.match(yaml, /Collect sanitized diagnostics and partial-output inventory/u);
    assert.match(yaml, /partial-output-inventory\.json/u);
    assert.match(yaml, /outputtail\|stdout\|stderr\|prompt\|token/u);
    assert.match(yaml, /Avoid repeating a failed scheduled revision/u);
    assert.match(yaml, /github\.event_name == 'schedule'/u);
    assert.match(yaml, /actions\/workflows\/lee-spec-kit-knowledge\.yml\/runs\?event=schedule/u);
    assert.match(yaml, /\.conclusion == "cancelled"/u);
    assert.match(yaml, /\.conclusion == "timed_out"/u);
    assert.match(yaml, /workflow_dispatch to retry/u);
    assert.match(yaml, /workflow_dispatch to retry[^\n]+>&2\n {12}exit 1/u);
    assert.doesNotMatch(yaml, /runner\.temp \}\}\/knowledge-result\.json/u);
    assert.match(yaml, /pnpm install --frozen-lockfile/u);
    assert.doesNotMatch(yaml, /^ {2}push:/mu);
    await fs.appendFile(workflow.path, '\n# custom\n');
    assert.equal(
      json(await runCli(dir, ['knowledge', 'ci', '--json'])).reasonCode,
      'OPENWIKI_CI_EXISTS'
    );
    await runCli(dir, ['config', '--openwiki', 'false']);
    const disabled = await runCli(dir, [
      'knowledge',
      'publish',
      '--ci',
      '--json',
    ]);
    assert.equal(disabled.code, 0);
    assert.equal(json(disabled).status, 'disabled');
  });
});

test('CI publication rejects a base that advances during generation', async () => {
  await withTempDir('lsk-publication-race-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const generating = runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
      ...fake.env,
      FAKE_OPENWIKI_SLEEP_MS: '2000',
    });
    // Wait until generation has captured the old integration tip.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const log = await fs.readFile(fake.invocationLog, 'utf8').catch(() => '');
      if (log.includes('code --update')) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await fs.appendFile(
      path.join(dir, 'README.md'),
      '\nNew integrated source\n'
    );
    await git(dir, ['add', 'README.md']);
    await git(dir, ['commit', '-m', 'feat: concurrent integration']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const result = await generating;
    assert.equal(json(result).reasonCode, 'OPENWIKI_PUBLICATION_SUPERSEDED');
    const status = json(await runCli(dir, ['knowledge', 'status', '--json']));
    assert.equal(status.latest, null);
    assert.equal(status.attempt.status, 'failed');
  });
});

test('configless CI failure preserves branch language and component in its retry command', async () => {
  await withTempDir('lsk-ci-retry-context-', async (dir) => {
    await git(dir, ['init']);
    await git(dir, ['config', 'user.name', 'Test User']);
    await git(dir, ['config', 'user.email', 'test@example.com']);
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n');
    await git(dir, ['add', '.']);
    await git(dir, ['commit', '-m', 'chore: baseline']);
    await git(dir, ['update-ref', 'refs/remotes/origin/release/docs', 'HEAD']);
    const fake = await setupFakeOpenWiki(dir);
    const failed = json(
      await runCli(
        dir,
        [
          'knowledge',
          'publish',
          '--ci',
          '--base-branch',
          'release/docs',
          '--lang',
          'ko',
          '--component',
          'api',
          '--json',
        ],
        {
          ...fake.env,
          FAKE_OPENWIKI_FAIL: '1',
          FAKE_OPENWIKI_LANGUAGE: 'ko',
        }
      )
    );
    assert.equal(failed.reasonCode, 'OPENWIKI_SYNC_FAILED');
    assert.equal(
      failed.details.resumeCommand,
      'npx lee-spec-kit knowledge publish --ci --base-branch release/docs --lang ko --component api --json'
    );
    assert.match(failed.error, /resume the preserved page queue/u);
    assert.doesNotMatch(failed.error, /same.*sync to resume/u);
    assert.equal(failed.details.resumable, true);
  });
});

test('configless standalone project CI can publish, apply, and inspect tracked Knowledge', async () => {
  await withTempDir('lsk-ci-configless-apply-', async (dir) => {
    await git(dir, ['init', '-b', 'main']);
    await git(dir, ['config', 'user.name', 'Test User']);
    await git(dir, ['config', 'user.email', 'test@example.com']);
    await fs.writeFile(path.join(dir, 'README.md'), '# Demo\n');
    await git(dir, ['add', '.']);
    await git(dir, ['commit', '-m', 'chore: baseline']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const fake = await setupFakeOpenWiki(dir);
    const published = json(
      await runCli(
        dir,
        [
          'knowledge',
          'update',
          '--ci',
          '--base-branch',
          'main',
          '--lang',
          'en',
          '--json',
        ],
        fake.env
      )
    );
    assert.equal(published.status, 'ok', JSON.stringify(published));
    const hooks = path.join(dir, '.git', 'test-hooks');
    await fs.mkdir(hooks);
    await fs.writeFile(
      path.join(hooks, 'commit-msg'),
      `#!/bin/sh\n${JSON.stringify(process.execPath)} ${JSON.stringify(path.resolve('dist/index.js'))} commit-audit --message-file "$1" --enforce --json\n`
    );
    await fs.chmod(path.join(hooks, 'commit-msg'), 0o755);
    await git(dir, ['config', 'core.hooksPath', hooks]);
    const applied = json(
      await runCli(dir, [
        'knowledge',
        'apply',
        '--ci',
        '--base-branch',
        'main',
        '--lang',
        'en',
        '--json',
      ])
    );
    assert.equal(
      applied.reasonCode,
      'OPENWIKI_APPLIED',
      JSON.stringify(applied)
    );
    const status = json(
      await runCli(dir, [
        'knowledge',
        'status',
        '--ci',
        '--base-branch',
        'main',
        '--lang',
        'en',
        '--json',
      ])
    );
    assert.equal(status.knowledge.status, 'current', JSON.stringify(status));
  });
});

test('publication atomically rejects a base changed immediately before the ref transaction', async () => {
  await withTempDir('lsk-publication-cleanup-race-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const previous = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(previous.status, 'ok', previous.error);
    await fs.appendFile(path.join(dir, 'README.md'), '\nNext integration\n');
    await git(dir, ['add', 'README.md']);
    await git(dir, ['commit', '-m', 'feat: next integration']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const head = (await git(dir, ['rev-parse', 'HEAD'])).stdout.trim();
    const tree = (await git(dir, ['rev-parse', 'HEAD^{tree}'])).stdout.trim();
    const future = (
      await git(dir, [
        'commit-tree',
        tree,
        '-p',
        head,
        '-m',
        'concurrent integration',
      ])
    ).stdout.trim();
    const realGit = (await runCommand(dir, 'which', ['git'])).stdout.trim();
    const wrapper = path.join(dir, 'fake-openwiki-bin', 'git');
    await fs.writeFile(
      wrapper,
      `#!/usr/bin/env node
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2);
const git = ${JSON.stringify(realGit)};
if (args[0] === 'update-ref' && args[1] === '--stdin') {
  const moved = spawnSync(git, ['update-ref', 'refs/remotes/origin/main', ${JSON.stringify(future)}], {stdio: 'inherit'});
  if (moved.status !== 0) process.exit(moved.status || 1);
}
const result = spawnSync(git, args, {stdio: 'inherit'});
process.exit(result.status === null ? 1 : result.status);
`
    );
    await fs.chmod(wrapper, 0o755);
    const rejected = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(rejected.reasonCode, 'OPENWIKI_PUBLICATION_SUPERSEDED');
    assert.equal(
      (await git(dir, ['rev-parse', 'refs/remotes/origin/main'])).stdout.trim(),
      future
    );
    const status = json(await runCli(dir, ['knowledge', 'status', '--json']));
    assert.equal(status.latest.sourceHead, previous.sourceHead);
    assert.equal(status.attempt.status, 'failed');
    await fs.access(
      path.join(rejected.details.worktree, 'openwiki', 'index.md')
    );
  });
});

test('tooling updates reuse published Knowledge without changing generation evidence', async () => {
  await withTempDir('lsk-tooling-publication-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const published = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(published.status, 'ok', published.error);
    const receiptPath = path.join(
      published.artifactPath,
      '.lee-spec-kit/openwiki-sync.json'
    );
    const receiptBefore = await fs.readFile(receiptPath, 'utf8');
    const agentsPath = path.join(dir, 'AGENTS.md');
    const agents = await fs.readFile(agentsPath, 'utf8');
    await fs.writeFile(
      agentsPath,
      agents.replace(
        '<!-- lee-spec-kit:begin -->',
        '<!-- lee-spec-kit:begin -->\nUpdated task execution policy.'
      )
    );
    const configPath = path.join(dir, 'docs/.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    config.workflow.featureChecks = [{ command: 'pnpm', args: ['test'] }];
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    await git(dir, ['add', 'AGENTS.md', 'docs/.lee-spec-kit.json']);
    const audit = json(
      await runCli(dir, ['commit-audit', '--json', '--enforce'])
    );
    assert.equal(audit.status, 'ok', JSON.stringify(audit));
    await git(dir, ['commit', '-m', 'chore: update tooling policy']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const head = (await git(dir, ['rev-parse', 'HEAD'])).stdout.trim();
    const cached = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_FAIL: '1',
      })
    );
    assert.equal(cached.status, 'ok', cached.error);
    assert.equal(cached.artifactPath, published.artifactPath);
    assert.equal(cached.sourceHead, published.sourceHead);
    assert.equal(cached.appliedSourceHead, head);
    assert.equal(await fs.readFile(receiptPath, 'utf8'), receiptBefore);
    const again = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_FAIL: '1',
      })
    );
    assert.equal(again.artifactPath, published.artifactPath);
    config.lang = 'ko';
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    await git(dir, ['add', 'docs/.lee-spec-kit.json']);
    await git(dir, ['commit', '-m', 'chore: change knowledge language']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const languageChanged = await runCli(
      dir,
      ['knowledge', 'publish', '--ci', '--lang', 'ko', '--json'],
      { ...fake.env, FAKE_OPENWIKI_FAIL: '1' }
    );
    assert.equal(languageChanged.code, 1);
    config.lang = 'en';
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    await git(dir, ['add', 'docs/.lee-spec-kit.json']);
    await git(dir, ['commit', '-m', 'chore: restore knowledge language']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const restored = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_FAIL: '1',
      })
    );
    assert.equal(restored.artifactPath, published.artifactPath);
    await fs.appendFile(agentsPath, '\nHuman architecture rule has changed.\n');
    await git(dir, ['add', 'AGENTS.md']);
    await git(dir, ['commit', '-m', 'docs: change architecture policy']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const changed = await runCli(
      dir,
      ['knowledge', 'publish', '--ci', '--json'],
      { ...fake.env, FAKE_OPENWIKI_FAIL: '1' }
    );
    assert.equal(changed.code, 1);
    assert.equal(
      json(changed).reasonCode,
      'OPENWIKI_SYNC_FAILED',
      changed.stdout
    );
  });
});

test('publication handles SIGTERM and derives interruption for an abandoned running record', async () => {
  await withTempDir('lsk-publication-interruption-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const statusPath = path.join(
      dir,
      '.git',
      'lee-spec-kit.runtime',
      'knowledge',
      'status.json'
    );
    const running = runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
      ...fake.env,
      FAKE_OPENWIKI_SLEEP_MS: '10000',
    });
    let observed;
    for (let count = 0; count < 150; count++) {
      observed = await fs
        .readFile(statusPath, 'utf8')
        .then(JSON.parse)
        .catch(() => null);
      if (observed?.runId) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    let stopped;
    let terminationError;
    try {
      assert.equal(observed?.status, 'running');
      let live;
      const heartbeatDeadline = Date.now() + 4000;
      do {
        await new Promise((resolve) => setTimeout(resolve, 100));
        live = json(await runCli(dir, ['knowledge', 'status', '--json']));
      } while (
        live.attempt.elapsedMs < observed.elapsedMs + 900 &&
        Date.now() < heartbeatDeadline
      );
      assert.ok(
        live.attempt.elapsedMs >= observed.elapsedMs + 900,
        'heartbeat elapsed time must advance without a new page event'
      );
      assert.equal(live.attempt.status, 'running');
    } finally {
      // Join the publisher even if an assertion fails, so fixture cleanup cannot
      // race a running writer and hide the original assertion with ENOTEMPTY.
      if (observed?.pid) {
        try {
          process.kill(observed.pid, 'SIGTERM');
        } catch (error) {
          if (error.code !== 'ESRCH') terminationError = error;
        }
      }
      stopped = await running;
    }
    if (terminationError) throw terminationError;
    const result = json(stopped);
    assert.equal(result.reasonCode, 'OPENWIKI_SYNC_INTERRUPTED');
    assert.equal(
      json(await runCli(dir, ['knowledge', 'status', '--json'])).attempt.status,
      'interrupted'
    );
    // Simulate SIGKILL's uncatchable leftover record; no live child is needed.
    await fs.writeFile(
      statusPath,
      JSON.stringify({ ...observed, status: 'running' })
    );
    const dead = json(await runCli(dir, ['knowledge', 'status', '--json']));
    assert.equal(dead.attempt.status, 'interrupted');
    assert.equal(dead.attempt.statusDerived, true);
    await fs.access(result.details.worktree);
    assert.equal(
      (await git(dir, ['rev-parse', 'main'])).stdout.trim(),
      observed.sourceHead
    );
  });
});

test('temporary worktree cleanup failure preserves published status and generation evidence', async () => {
  await withTempDir('lsk-publication-cleanup-failure-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const head = (await git(dir, ['rev-parse', 'main'])).stdout.trim();
    const realGit = (await runCommand(dir, 'which', ['git'])).stdout.trim();
    const wrapper = path.join(dir, 'fake-openwiki-bin', 'git');
    await fs.writeFile(
      wrapper,
      `#!/usr/bin/env node
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'worktree' && args[1] === 'remove') process.exit(73);
const result = spawnSync(${JSON.stringify(realGit)}, args, {stdio: 'inherit'});
process.exit(result.status === null ? 1 : result.status);
`
    );
    await fs.chmod(wrapper, 0o755);
    const result = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(result.status, 'ok', result.error);
    const status = json(await runCli(dir, ['knowledge', 'status', '--json']));
    assert.equal(status.attempt.status, 'published');
    assert.equal(status.attempt.cleanupPending, true);
    assert.equal(status.latest.id, result.id);
    await fs.access(path.join(status.attempt.worktree, 'openwiki', 'index.md'));
    assert.equal((await git(dir, ['rev-parse', 'main'])).stdout.trim(), head);
  });
});

test('publication resumes a durable page without rewriting it and keeps the prior diagnostic chain', async () => {
  await withTempDir('lsk-publish-resume-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const failed = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_FAIL_AFTER_PAGE: '1',
        FAKE_OPENWIKI_RUN_ID: 'durable-run',
      })
    );
    assert.equal(failed.reasonCode, 'OPENWIKI_SYNC_FAILED', failed.error);
    assert.equal(failed.details.resumable, true, failed.error);
    const page = path.join(
      failed.details.worktree,
      'openwiki',
      'architecture map.md'
    );
    const before = await fs.readFile(page);
    const priorEvents = await fs.readFile(
      failed.details.diagnosticsPath,
      'utf8'
    );
    const result = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_EXPECT_RESUME: '1',
      })
    );
    assert.equal(result.status, 'ok', result.error);
    assert.equal(result.id, path.basename(failed.details.worktree));
    assert.deepEqual(
      await fs.readFile(
        path.join(result.artifactPath, 'openwiki', 'architecture map.md')
      ),
      before
    );
    assert.equal(
      await fs.readFile(failed.details.diagnosticsPath, 'utf8'),
      priorEvents
    );
    const status = json(await runCli(dir, ['knowledge', 'status', '--json']));
    assert.equal(status.attempt.resumed, true);
    assert.equal(status.attempt.launch, 2);
    assert.equal(status.attempt.attempt, 2);
    assert.ok(
      status.attempt.previousDiagnosticsPaths.includes(
        failed.details.diagnosticsPath
      )
    );
    assert.equal(status.attempt.status, 'published');
    assert.equal((await git(dir, ['status', '--porcelain'])).stdout, '');
  });
});

test('publication reuses completed policy-migration pages and repairs only a skipped page', async () => {
  await withTempDir('lsk-publish-skipped-page-recovery-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const failed = json(
      await runCli(
        dir,
        ['knowledge', 'publish', '--ci', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_SLEEP_MS: '1500',
          FAKE_OPENWIKI_INTERRUPTED: 'skipped',
        },
        { timeoutMs: 60_000 }
      )
    );
    assert.equal(failed.reasonCode, 'OPENWIKI_RUN_INCOMPLETE', failed.error);
    assert.equal(failed.details.resumable, true, failed.error);
    const failedId = path.basename(failed.details.worktree);

    const recovered = json(
      await runCli(
        dir,
        ['knowledge', 'publish', '--ci', '--json'],
        {
          ...fake.env,
          FAKE_OPENWIKI_EXPECT_SKIPPED_RECOVERY: '1',
          FAKE_OPENWIKI_REQUIRE_EXISTING_PAGE: '1',
        },
        { timeoutMs: 60_000 }
      )
    );

    assert.equal(recovered.status, 'ok', recovered.error);
    assert.equal(recovered.id, failedId);
    const status = json(await runCli(dir, ['knowledge', 'status', '--json']));
    assert.equal(status.attempt.resumed, true);
    assert.equal(status.attempt.launch, 2);
    assert.match(
      await fs.readFile(fake.invocationLog, 'utf8'),
      /lee-spec-kit skipped page recovery/u
    );
  });
});

test('publication rejects modified completed checkpoint before another model invocation', async () => {
  await withTempDir('lsk-resume-tamper-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const failed = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_FAIL_AFTER_PAGE: '1',
      })
    );
    const page = path.join(
      failed.details.worktree,
      'openwiki',
      'architecture map.md'
    );
    const originalPage = await fs.readFile(page);
    await fs.appendFile(page, '\nUnexpected edit\n');
    const calls = await fs.readFile(fake.invocationLog, 'utf8');
    const retry = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(retry.reasonCode, 'OPENWIKI_OUTPUT_INVALID', retry.error);
    assert.equal(await fs.readFile(fake.invocationLog, 'utf8'), calls);
    assert.match(await fs.readFile(page, 'utf8'), /Unexpected edit/u);
    await fs.writeFile(page, originalPage);
    const ownerPath = path.join(
      failed.details.worktree,
      '.lee-spec-kit',
      'openwiki-run.json'
    );
    const originalOwner = await fs.readFile(ownerPath, 'utf8');
    await fs.writeFile(
      ownerPath,
      JSON.stringify({
        ...JSON.parse(originalOwner),
        writingPolicyHash: 'changed-policy',
      })
    );
    const policyFailure = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(policyFailure.reasonCode, 'OPENWIKI_RUN_OWNER_MISMATCH');
    await fs.writeFile(ownerPath, originalOwner);
    await fs.appendFile(
      path.join(failed.details.worktree, 'README.md'),
      '\nsource changed\n'
    );
    const sourceFailure = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(sourceFailure.reasonCode, 'OPENWIKI_PROJECT_NOT_CLEAN');
    assert.equal(await fs.readFile(fake.invocationLog, 'utf8'), calls);
    assert.equal(
      json(await runCli(dir, ['knowledge', 'status', '--json'])).latest,
      null
    );
  });
});

test('publication seeds the next source revision from the verified published artifact', async () => {
  await withTempDir('lsk-publish-baseline-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const first = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(first.status, 'ok', first.error);
    await fs.writeFile(path.join(dir, 'new-source.txt'), 'new source\n');
    await git(dir, ['add', 'new-source.txt']);
    await git(dir, ['commit', '-m', 'feat: change source']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const secondRun = await runCli(
      dir,
      ['knowledge', 'publish', '--ci', '--json'],
      {
        ...fake.env,
        FAKE_OPENWIKI_REQUIRE_EXISTING_PAGE: '1',
        FAKE_OPENWIKI_EXPECT_BASELINE_HEAD: first.sourceHead,
        FAKE_OPENWIKI_SLEEP_MS: '600',
        FAKE_OPENWIKI_PLAN_SECRET: 'never-log-plan-instructions',
      }
    );
    const second = json(secondRun);
    const events = secondRun.stderr
      .split('\n')
      .filter((line) => line.startsWith('[openwiki] '))
      .map((line) => JSON.parse(line.slice('[openwiki] '.length)));
    const scope = events.find((event) => event.stage === 'scope');
    assert.equal(scope.baselineSourceHead, first.sourceHead);
    assert.deepEqual(scope.pagePlan[0], {
      path: '/openwiki/architecture map.md',
      action: 'review-existing',
      sourcePaths: ['README.md#L1-L1'],
    });
    assert.doesNotMatch(
      secondRun.stderr + secondRun.stdout,
      /never-log-plan-instructions/u
    );
    assert.doesNotMatch(
      await fs.readFile(scope.diagnosticsPath, 'utf8'),
      /never-log-plan-instructions/u
    );
    assert.equal(second.status, 'ok', second.error);
    assert.notEqual(second.sourceHead, first.sourceHead);
    assert.equal(
      json(await runCli(dir, ['knowledge', 'status', '--json'])).attempt
        .baselineArtifactId,
      first.id
    );
    await fs.access(first.artifactPath);
    assert.equal((await git(dir, ['status', '--porcelain'])).stdout, '');
  });
});

test('fresh CI seeds an incremental update from the tracked Knowledge branch', async () => {
  await withTempDir('lsk-ci-branch-baseline-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const first = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(first.status, 'ok', first.error);
    const applied = json(
      await runCli(dir, ['knowledge', 'apply', '--ci', '--json'], fake.env)
    );
    assert.equal(applied.status, 'ok', applied.error);
    await git(dir, ['branch', 'lee-spec-kit/knowledge-main', applied.commit]);
    await git(dir, ['reset', '--hard', first.sourceHead]);
    await git(dir, ['update-ref', '-d', 'refs/lee-spec-kit/knowledge/publication']);
    await fs.rm(path.join(dir, '.git', 'lee-spec-kit.runtime', 'knowledge'), {
      recursive: true,
      force: true,
    });
    await fs.writeFile(path.join(dir, 'new-source.txt'), 'new source\n');
    await git(dir, ['add', 'new-source.txt']);
    await git(dir, ['commit', '-m', 'feat: change source']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const secondRun = await runCli(
      dir,
      [
        'knowledge',
        'publish',
        '--ci',
        '--baseline-ref',
        'refs/heads/lee-spec-kit/knowledge-main',
        '--json',
      ],
      {
        ...fake.env,
        FAKE_OPENWIKI_REQUIRE_EXISTING_PAGE: '1',
        FAKE_OPENWIKI_EXPECT_BASELINE_HEAD: first.sourceHead,
      }
    );
    const second = json(secondRun);
    assert.equal(second.status, 'ok', second.error);
    const status = json(await runCli(dir, ['knowledge', 'status', '--json']));
    assert.equal(status.attempt.baselineSourceHead, first.sourceHead);
    assert.equal(
      status.attempt.baselineRef,
      'refs/heads/lee-spec-kit/knowledge-main'
    );
  });
});

test('publication never imposes a duration limit on simulated elapsed time', async () => {
  await withTempDir('lsk-publish-unlimited-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const clock = path.join(dir, 'fake-openwiki-package', 'clock.cjs');
    await fs.writeFile(
      clock,
      `const now = Date.now.bind(Date); const start = now(); Date.now = () => now() + (now() - start > 100 ? 4 * 60 * 60 * 1000 : 0);`
    );
    const result = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
        ...fake.env,
        NODE_OPTIONS: '--require=' + clock,
        FAKE_OPENWIKI_SLEEP_MS: '1400',
      })
    );
    assert.equal(result.status, 'ok', result.error);
    const status = json(await runCli(dir, ['knowledge', 'status', '--json']));
    assert.ok(status.attempt.elapsedMs >= 4 * 60 * 60 * 1000);
  });
});

test('publication refuses a damaged baseline instead of silently regenerating', async () => {
  await withTempDir('lsk-baseline-corrupt-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const first = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    const pointer = (
      await git(dir, ['rev-parse', 'refs/lee-spec-kit/knowledge/publication'])
    ).stdout;
    const calls = await fs.readFile(fake.invocationLog, 'utf8');
    await fs.appendFile(
      path.join(first.artifactPath, 'openwiki', 'architecture map.md'),
      '\nchanged artifact\n'
    );
    const next = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(next.reasonCode, 'OPENWIKI_OUTPUT_INVALID', next.error);
    assert.equal(
      (await git(dir, ['rev-parse', 'refs/lee-spec-kit/knowledge/publication']))
        .stdout,
      pointer
    );
    assert.equal(await fs.readFile(fake.invocationLog, 'utf8'), calls);
    assert.equal(
      (await git(dir, ['rev-parse', 'main'])).stdout.trim(),
      first.sourceHead
    );
  });
});

test('publication validates relocated evidence without model repair', async () => {
  await withTempDir('lsk-relocated-evidence-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await fs.writeFile(
      path.join(dir, 'README.md'),
      'Prepended\n# Demo\nTail\n'
    );
    await git(dir, ['add', 'README.md']);
    await git(dir, ['commit', '-m', 'docs: prepend introduction']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const result = await runCli(
      dir,
      ['knowledge', 'publish', '--ci', '--json'],
      {
        ...fake.env,
        FAKE_OPENWIKI_EVIDENCE_MODE: 'relocated',
      }
    );
    assert.equal(json(result).status, 'ok', result.stdout);
    assert.doesNotMatch(result.stderr, /validation_failed|"stage":"retry"/u);
    assert.equal(
      (await fs.readFile(fake.invocationLog, 'utf8'))
        .split('\n')
        .filter((line) => line.startsWith('code --update')).length,
      1
    );
  });
});

test('knowledge apply updates the reader tree without generation and preserves dirty or damaged inputs', async () => {
  await withTempDir('lsk-apply-publication-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const head = (await git(dir, ['rev-parse', 'HEAD'])).stdout.trim();
    const published = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(published.status, 'ok');
    const calls = await fs.readFile(fake.invocationLog, 'utf8');
    const status = () =>
      runCli(dir, ['knowledge', 'status', '--json']).then(json);
    assert.equal((await status()).workingCopy.current, false);
    await ignoreGitArtifacts(dir, ['/openwiki/local-note.txt']);
    await fs.mkdir(path.join(dir, 'openwiki'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'openwiki', 'local-note.txt'),
      'ignored local notes'
    );
    assert.equal(
      json(await runCli(dir, ['knowledge', 'apply', '--json'])).reasonCode,
      'OPENWIKI_APPLY_DIRTY_WORKTREE'
    );
    await fs.rm(path.join(dir, 'openwiki', 'local-note.txt'));
    await fs.writeFile(path.join(dir, 'uncommitted.txt'), 'preserve me');
    const dirty = json(await runCli(dir, ['knowledge', 'apply', '--json']));
    assert.equal(dirty.reasonCode, 'OPENWIKI_APPLY_DIRTY_WORKTREE');
    assert.equal((await git(dir, ['rev-parse', 'HEAD'])).stdout.trim(), head);
    await fs.rm(path.join(dir, 'uncommitted.txt'));
    const index = path.join(published.artifactPath, 'openwiki', 'index.md');
    const saved = await fs.readFile(index);
    await fs.appendFile(index, '\ncorrupted artifact');
    assert.equal(
      json(await runCli(dir, ['knowledge', 'apply', '--json'])).reasonCode,
      'OPENWIKI_PUBLICATION_REQUIRED'
    );
    await fs.writeFile(index, saved);
    const applied = json(
      await runCli(dir, ['knowledge', 'apply', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_FAIL: '1',
      })
    );
    assert.equal(applied.status, 'ok', JSON.stringify(applied));
    assert.equal(applied.reasonCode, 'OPENWIKI_APPLIED');
    assert.equal(await fs.readFile(fake.invocationLog, 'utf8'), calls);
    assert.equal((await status()).workingCopy.current, true);
    assert.deepEqual(
      await fs.readFile(path.join(dir, 'openwiki', 'index.md')),
      saved
    );
    assert.equal((await git(dir, ['status', '--porcelain'])).stdout.trim(), '');
    assert.equal((await git(dir, ['rev-parse', 'HEAD^'])).stdout.trim(), head);
    const paths = (await git(dir, ['diff', '--name-only', head, 'HEAD'])).stdout
      .trim()
      .split('\n');
    assert.ok(
      paths.every(
        (p) =>
          p.startsWith('openwiki/') || p === '.lee-spec-kit/openwiki-sync.json'
      )
    );
    const again = json(await runCli(dir, ['knowledge', 'apply', '--json']));
    assert.equal(again.unchanged, true);
    assert.equal(again.commit, applied.commit);
    await fs.mkdir(path.join(dir, '.codex'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.codex', 'tooling-note.txt'),
      'tooling only'
    );
    await git(dir, ['add', '.codex/tooling-note.txt']);
    await git(dir, ['commit', '-m', 'chore: update tooling']);
    assert.equal((await status()).workingCopy.current, true);
    await fs.appendFile(path.join(dir, 'openwiki', 'index.md'), '\nlocal edit');
    assert.equal((await status()).workingCopy.current, false);
    assert.equal(
      json(await runCli(dir, ['knowledge', 'apply', '--json'])).reasonCode,
      'OPENWIKI_APPLY_DIRTY_WORKTREE'
    );
  });
});

test('knowledge apply preserves main on commit failure and refuses a newer source revision', async () => {
  await withTempDir('lsk-apply-failure-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const published = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], fake.env)
    );
    assert.equal(published.status, 'ok');
    const head = (await git(dir, ['rev-parse', 'HEAD'])).stdout.trim();
    const ref = (
      await git(dir, ['rev-parse', 'refs/lee-spec-kit/knowledge/publication'])
    ).stdout.trim();
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    await git(dir, ['config', 'core.hooksPath', '.git/hooks']);
    await fs.writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const failed = json(await runCli(dir, ['knowledge', 'apply', '--json']));
    assert.equal(failed.reasonCode, 'OPENWIKI_APPLY_FAILED');
    assert.equal((await git(dir, ['rev-parse', 'HEAD'])).stdout.trim(), head);
    assert.equal((await git(dir, ['status', '--porcelain'])).stdout.trim(), '');
    assert.equal(
      (
        await git(dir, ['rev-parse', 'refs/lee-spec-kit/knowledge/publication'])
      ).stdout.trim(),
      ref
    );
    await fs.access(failed.details.worktree);
    await fs.rm(hook);
    await fs.appendFile(path.join(dir, 'README.md'), '\nNew source change\n');
    await git(dir, ['add', 'README.md']);
    await git(dir, ['commit', '-m', 'feat: newer source']);
    assert.equal(
      json(await runCli(dir, ['knowledge', 'apply', '--json'])).reasonCode,
      'OPENWIKI_PUBLICATION_REQUIRED'
    );
    assert.equal(
      (
        await git(dir, ['rev-parse', 'refs/lee-spec-kit/knowledge/publication'])
      ).stdout.trim(),
      ref
    );
  });
});

test('publication verifies a completed saved run without another generation call', async () => {
  await withTempDir('lsk-verify-completed-', async (dir) => {
    await initializeOpenWikiFeature(dir);
    const fake = await setupFakeOpenWiki(dir);
    await git(dir, ['switch', 'main']);
    await git(dir, ['merge', '--ff-only', 'feat/F001-alpha']);
    await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const first = json(
      await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
        ...fake.env,
        FAKE_OPENWIKI_FAIL_AFTER_FINISH: '1',
      })
    );
    assert.equal(first.reasonCode, 'OPENWIKI_SYNC_FAILED', first.error);
    assert.equal(first.details.resumable, true);
    const before = (await fs.readFile(fake.invocationLog, 'utf8'))
      .split('\n')
      .filter((line) => line.startsWith('code --update'));
    const next = await runCli(dir, ['knowledge', 'publish', '--ci', '--json'], {
      ...fake.env,
      FAKE_OPENWIKI_FAIL: '1',
    });
    assert.equal(json(next).status, 'ok', next.stdout);
    assert.match(next.stderr, /validating_saved_output/u);
    assert.deepEqual(
      (await fs.readFile(fake.invocationLog, 'utf8'))
        .split('\n')
        .filter((line) => line.startsWith('code --update')),
      before
    );
  });
});

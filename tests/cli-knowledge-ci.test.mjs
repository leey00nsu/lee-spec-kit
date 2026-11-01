import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  fs,
  path,
  runCli,
  runCommand,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

async function initializeProject(dir) {
  const git = await runCommand(dir, 'git', ['init', '-q']);
  assert.equal(git.code, 0, git.stderr || git.stdout);
  await fs.mkdir(path.join(dir, 'docs', 'features'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'docs', '.lee-spec-kit.json'),
    `${JSON.stringify(
      {
        projectName: 'demo',
        projectType: 'single',
        lang: 'ko',
        docsRepo: 'embedded',
        experimental: { openwiki: true },
        workflow: { mode: 'local', baseBranch: 'main' },
      },
      null,
      2
    )}\n`
  );
}

test('knowledge ci scaffolds direct OpenWiki execution and writing guidance', async () => {
  await withTempDir('lsk-knowledge-ci-', async (dir) => {
    await initializeProject(dir);

    const result = await runCli(dir, ['knowledge', 'ci', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    const workflow = await fs.readFile(payload.path, 'utf8');
    const instructions = await fs.readFile(payload.instructions, 'utf8');
    const ignore = await fs.readFile(payload.ignore, 'utf8');

    assert.equal(payload.executionOwner, 'openwiki');
    assert.equal(payload.instructionsCreated, true);
    assert.equal(payload.instructionsAssessment.state, 'current');
    assert.equal(payload.ignoreUpdated, true);
    assert.match(ignore, /\/AGENTS\.md\n\/CLAUDE\.md/u);
    assert.match(workflow, /openwiki code --update --print --language ko/u);
    assert.doesNotMatch(workflow, /lee-spec-kit knowledge update/u);
    assert.doesNotMatch(
      workflow,
      /Avoid repeating a failed scheduled revision/u
    );
    assert.match(
      instructions,
      /\/skills\/lee-spec-kit-technical-writing\/SKILL\.md/u
    );

    const customInstructions = '# Project-owned instructions\n';
    await fs.writeFile(payload.instructions, customInstructions);
    const repeated = await runCli(dir, ['knowledge', 'ci', '--json']);
    assert.equal(repeated.code, 0, repeated.stderr || repeated.stdout);
    assert.equal(JSON.parse(repeated.stdout).instructionsCreated, false);
    assert.equal(JSON.parse(repeated.stdout).ignoreUpdated, false);
    assert.equal(
      await fs.readFile(payload.instructions, 'utf8'),
      customInstructions
    );
  });
});

test('preview is read-only before enablement and never reads instruction symlinks', async () => {
  await withTempDir('lsk-knowledge-preview-disabled-', async (dir) => {
    await initializeProject(dir);
    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    config.experimental.openwiki = false;
    await fs.writeFile(configPath, JSON.stringify(config));
    const empty = await runCli(dir, ['knowledge', 'ci', '--dry-run', '--json']);
    assert.equal(empty.code, 0, empty.stderr || empty.stdout);
    assert.equal(JSON.parse(empty.stdout).instructions.state, 'missing');
    assert.equal(
      await fs.stat(path.join(dir, '.github')).catch(() => false),
      false
    );
    await fs.mkdir(path.join(dir, 'openwiki'));
    const privatePath = path.join(dir, 'private.txt');
    await fs.writeFile(privatePath, 'RAW_PRIVATE_PROMPT_SENTINEL');
    await fs.symlink(
      privatePath,
      path.join(dir, 'openwiki', 'INSTRUCTIONS.md')
    );
    const linked = await runCli(dir, [
      'knowledge',
      'ci',
      '--dry-run',
      '--json',
    ]);
    assert.equal(linked.code, 0, linked.stderr || linked.stdout);
    assert.equal(JSON.parse(linked.stdout).instructions.state, 'manual_review');
    assert.deepEqual(
      JSON.parse(linked.stdout).instructions.proposedAdditions,
      []
    );
    assert.ok(!linked.stdout.includes('RAW_PRIVATE_PROMPT_SENTINEL'));
    assert.equal(await fs.readFile(configPath, 'utf8'), JSON.stringify(config));
    assert.equal(
      await fs.readFile(privatePath, 'utf8'),
      'RAW_PRIVATE_PROMPT_SENTINEL'
    );
  });
});

test('knowledge ci enables auto-merge only when requested', async () => {
  await withTempDir('lsk-knowledge-auto-merge-', async (dir) => {
    await initializeProject(dir);
    const result = await runCli(dir, [
      'knowledge',
      'ci',
      '--auto-merge',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    const workflow = await fs.readFile(payload.path, 'utf8');
    assert.match(workflow, /gh pr merge --auto --squash/u);
  });
});

test('knowledge ci preserves even recognized legacy workflows and previews migration', async () => {
  await withTempDir('lsk-knowledge-ci-migrate-', async (dir) => {
    await initializeProject(dir);
    const workflowPath = path.join(
      dir,
      '.github',
      'workflows',
      'lee-spec-kit-knowledge.yml'
    );
    await fs.mkdir(path.dirname(workflowPath), { recursive: true });
    const legacy =
      '# Generated by lee-spec-kit. Configure OPENAI_API_KEY in repository secrets.\n# Avoid repeating a failed scheduled revision\n# lee-spec-kit knowledge update --ci\n# Custom provider and schedule\n';
    await fs.writeFile(workflowPath, legacy);

    const migrated = await runCli(dir, ['knowledge', 'ci', '--json']);
    assert.notEqual(migrated.code, 0);
    assert.match(migrated.stdout, /OPENWIKI_CI_EXISTS/u);
    assert.equal(await fs.readFile(workflowPath, 'utf8'), legacy);
    const preview = await runCli(dir, [
      'knowledge',
      'ci',
      '--dry-run',
      '--json',
    ]);
    assert.equal(preview.code, 0, preview.stderr || preview.stdout);
    const assessment = JSON.parse(preview.stdout);
    assert.equal(assessment.workflow.state, 'legacy_adapter');
    assert.equal(assessment.instructions.state, 'missing');
    assert.deepEqual(assessment.changed, []);
    assert.match(assessment.workflow.defaultPreview, /ci-observe.cjs/u);
    assert.equal(await fs.readFile(workflowPath, 'utf8'), legacy);
    assert.equal(
      await fs.stat(path.join(dir, 'openwiki')).catch(() => false),
      false
    );

    await fs.writeFile(workflowPath, 'name: custom-openwiki\n');
    const refused = await runCli(dir, ['knowledge', 'ci', '--json']);
    assert.notEqual(refused.code, 0);
    assert.match(refused.stdout, /OPENWIKI_CI_EXISTS/u);
    assert.equal(
      await fs.readFile(workflowPath, 'utf8'),
      'name: custom-openwiki\n'
    );
  });
});

test('CI preview diagnoses old policy without echoing private content or changing configuration', async () => {
  await withTempDir('lsk-knowledge-preview-', async (dir) => {
    await initializeProject(dir);
    const first = await runCli(dir, [
      'knowledge',
      'ci',
      '--auto-merge',
      '--json',
    ]);
    assert.equal(first.code, 0, first.stderr || first.stdout);
    const files = JSON.parse(first.stdout);
    const current = await fs.readFile(files.instructions, 'utf8');
    const legacy = current
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith('- For each planned page,') &&
          !line.startsWith('- On routine updates,')
      )
      .map((line) =>
        line.startsWith('- Use page-relative Markdown links')
          ? '- Use page-relative Markdown links between Knowledge pages and keep the exact `.md` suffix.'
          : line
      )
      .join('\n');
    await fs.writeFile(files.instructions, legacy.replaceAll('\n', '\r\n'));
    const secret = 'PRIVATE_SENTINEL_CREDENTIAL';
    const customWorkflow =
      (await fs.readFile(files.path, 'utf8'))
        .replace('17 3 * * *', '0 17 * * 1')
        .replace(
          'OPENWIKI_PROVIDER: openai',
          'OPENWIKI_PROVIDER: some-provider\n          OPENWIKI_MODEL_ID: custom-model'
        ) + `# ${secret}\n`;
    await fs.writeFile(files.path, customWorkflow);
    const before = await runCommand(dir, 'git', [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ]);
    const result = await runCli(dir, [
      'knowledge',
      'ci',
      '--dry-run',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.instructions.state, 'known_legacy');
    assert.equal(report.instructions.proposedAdditions.length, 3);
    assert.deepEqual(report.instructions.proposedDeletions, []);
    assert.equal(report.workflow.state, 'different');
    assert.ok(!result.stdout.includes(secret));
    assert.equal(await fs.readFile(files.path, 'utf8'), customWorkflow);
    assert.equal(
      await fs.readFile(files.instructions, 'utf8'),
      legacy.replaceAll('\n', '\r\n')
    );
    assert.equal(
      (
        await runCommand(dir, 'git', [
          'status',
          '--porcelain=v1',
          '--untracked-files=all',
        ])
      ).stdout,
      before.stdout
    );
    await fs.writeFile(
      files.instructions,
      `${current}\n# Project private prose ${secret}\n`
    );
    const customized = await runCli(dir, [
      'knowledge',
      'ci',
      '--dry-run',
      '--json',
    ]);
    assert.equal(
      JSON.parse(customized.stdout).instructions.state,
      'customized'
    );
    assert.deepEqual(
      JSON.parse(customized.stdout).instructions.proposedAdditions,
      []
    );
    assert.ok(!customized.stdout.includes(secret));
  });
});

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

test('setup codex-bootstrap creates managed block in CODEX_HOME config.toml', async () => {
  await withTempDir('lsk-setup-codex-bootstrap-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const env = { HOME: homeDir };

    const result = await runCli(dir, ['setup', 'codex-bootstrap'], env);

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const configPath = path.join(homeDir, '.codex', 'config.toml');
    const config = await fs.readFile(configPath, 'utf-8');

    assert.match(config, /# lee-spec-kit:codex-bootstrap:begin/);
    assert.match(
      config,
      /project_doc_fallback_filenames = \["docs\/AGENTS\.md"\]/
    );
    assert.match(
      config,
      /compact_prompt = """[\s\S]*After context compression\/reset, read \.\/docs\/AGENTS\.md again before resuming project-specific work\.[\s\S]*"""/
    );
  });
});

test('setup codex-bootstrap preserves custom global instructions and updates managed block', async () => {
  await withTempDir('lsk-setup-codex-bootstrap-update-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      [
        'model = "gpt-5.4"',
        '',
        '# keep this',
        '',
        '# lee-spec-kit:codex-bootstrap:begin',
        'OLD',
        '# lee-spec-kit:codex-bootstrap:end',
        '',
      ].join('\n'),
      'utf-8'
    );

    const result = await runCli(
      dir,
      ['setup', 'codex-bootstrap'],
      { HOME: homeDir }
    );

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const config = await fs.readFile(configPath, 'utf-8');
    assert.match(config, /model = "gpt-5\.4"/);
    assert.match(config, /# keep this/);
    assert.doesNotMatch(config, /^OLD$/m);
    assert.equal(
      config.match(/# lee-spec-kit:codex-bootstrap:begin/g)?.length,
      1
    );
  });
});

test('init output recommends codex bootstrap setup command', async () => {
  await withTempDir('lsk-init-codex-bootstrap-hint-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const result = await runCli(
      dir,
      [
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
      ],
      { HOME: homeDir }
    );

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /npx lee-spec-kit setup codex-bootstrap/);
  });
});

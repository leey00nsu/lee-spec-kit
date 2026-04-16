import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  pathExists,
  runCli,
  runCommand,
  setupFakeNpxCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

test('integrations codex-bootstrap creates managed Codex hooks flag in CODEX_HOME config.toml', async () => {
  await withTempDir('lsk-setup-codex-bootstrap-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const env = { HOME: homeDir };

    const result = await runCli(dir, ['integrations', 'codex-bootstrap'], env);

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const configPath = path.join(homeDir, '.codex', 'config.toml');
    const config = await fs.readFile(configPath, 'utf-8');

    assert.match(config, /# lee-spec-kit:codex-bootstrap:begin/);
    assert.match(config, /codex_hooks = true/);
    assert.doesNotMatch(config, /project_doc_fallback_filenames/);
    assert.doesNotMatch(config, /compact_prompt/);
  });
});

test('integrations codex creates managed block in CODEX_HOME config.toml', async () => {
  await withTempDir('lsk-integrations-codex-bootstrap-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const env = { HOME: homeDir };

    const result = await runCli(dir, ['integrations', 'codex'], env);

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const configPath = path.join(homeDir, '.codex', 'config.toml');
    const config = await fs.readFile(configPath, 'utf-8');

    assert.match(config, /# lee-spec-kit:codex-bootstrap:begin/);
    assert.match(config, /codex_hooks = true/);
    assert.doesNotMatch(config, /project_doc_fallback_filenames/);
  });
});

test('integrations codex-hooks scaffolds repo-local Codex hooks for lee-spec-kit workflow', async () => {
  await withTempDir('lsk-integrations-codex-hooks-', async (dir) => {
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

    const result = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const hooksJsonPath = path.join(dir, '.codex', 'hooks.json');
    const hooksJson = JSON.parse(await fs.readFile(hooksJsonPath, 'utf-8'));
    assert.equal(Array.isArray(hooksJson.hooks?.SessionStart), true);
    assert.equal(Array.isArray(hooksJson.hooks?.PreToolUse), true);
    assert.equal(Array.isArray(hooksJson.hooks?.Stop), true);

    const hooksDir = path.join(dir, '.codex', 'hooks');
    const sessionStartScriptPath = path.join(hooksDir, 'session_start_lee_spec_kit.mjs');
    assert.equal(
      hooksJson.hooks.SessionStart[0].hooks[0].command.startsWith(
        `${JSON.stringify(process.execPath)} -e `
      ),
      true
    );
    assert.match(
      hooksJson.hooks.SessionStart[0].hooks[0].command,
      /session_start_lee_spec_kit\.mjs/
    );
    const sessionStartScript = await fs.readFile(
      sessionStartScriptPath,
      'utf-8'
    );
    const stopScript = await fs.readFile(
      path.join(hooksDir, 'stop_workflow_audit.mjs'),
      'utf-8'
    );

    assert.match(sessionStartScript, /npx lee-spec-kit detect --json/);
    assert.match(
      sessionStartScript,
      /infer the workflow automatically even for generic rule-following requests/
    );
    assert.match(
      sessionStartScript,
      /Prefer Codex native execution with workspace-scoped AGENTS\.md plus official hooks/
    );
    assert.match(sessionStartScript, /workflow-stage --json/);
    assert.match(stopScript, /workflow-audit --json/);
    const preToolScript = await fs.readFile(
      path.join(hooksDir, 'pre_tool_use_policy.mjs'),
      'utf-8'
    );
    assert.match(preToolScript, /commit-audit', '--json/);
    assert.match(preToolScript, /getGitSubcommand/);
  });
});

test('integrations codex-hooks --remove removes managed hook files but keeps custom repo codex files', async () => {
  await withTempDir('lsk-integrations-codex-hooks-remove-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(
      installResult.code,
      0,
      installResult.stderr || installResult.stdout
    );

    const customPath = path.join(dir, '.codex', 'hooks', 'custom-note.txt');
    await fs.writeFile(customPath, 'keep me\n', 'utf-8');

    const removeResult = await runCli(dir, [
      'integrations',
      'codex-hooks',
      '--remove',
    ]);
    assert.equal(
      removeResult.code,
      0,
      removeResult.stderr || removeResult.stdout
    );

    const hooksJsonPath = path.join(dir, '.codex', 'hooks.json');
    assert.equal(await fs.readFile(customPath, 'utf-8'), 'keep me\n');
    const hooksJson = JSON.parse(await fs.readFile(hooksJsonPath, 'utf-8'));
    assert.equal(hooksJson.hooks?.SessionStart, undefined);
    assert.equal(hooksJson.hooks?.PreToolUse, undefined);
    assert.equal(hooksJson.hooks?.Stop, undefined);
  });
});

test('integrations codex rejects conflicting table-style codex_hooks settings', async () => {
  await withTempDir('lsk-integrations-codex-conflict-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      ['[features]', 'codex_hooks = false', ''].join('\n'),
      'utf-8'
    );

    const result = await runCli(dir, ['integrations', 'codex'], { HOME: homeDir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Codex config already defines/);
  });
});

test('integrations codex rejects conflicting table-style codex_hooks settings with commented table header', async () => {
  await withTempDir('lsk-integrations-codex-commented-table-conflict-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      ['[features] # keep local override', 'codex_hooks = false', ''].join('\n'),
      'utf-8'
    );

    const result = await runCli(dir, ['integrations', 'codex'], { HOME: homeDir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Codex config already defines codex_hooks outside lee-spec-kit managed block/);
  });
});

test('integrations codex rejects conflicting table-style codex_hooks settings with tight commented table header', async () => {
  await withTempDir('lsk-integrations-codex-tight-commented-table-conflict-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      ['[features]#keep local override', 'codex_hooks = false', ''].join('\n'),
      'utf-8'
    );

    const result = await runCli(dir, ['integrations', 'codex'], { HOME: homeDir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Codex config already defines codex_hooks outside lee-spec-kit managed block/);
  });
});

test('integrations codex rejects conflicting inline-table codex_hooks settings', async () => {
  await withTempDir('lsk-integrations-codex-inline-conflict-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      ['features = { codex_hooks = false }', ''].join('\n'),
      'utf-8'
    );

    const result = await runCli(dir, ['integrations', 'codex'], { HOME: homeDir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Codex config already defines codex_hooks outside lee-spec-kit managed block/);
  });
});

test('integrations codex preserves existing compact prompt and fallback settings outside the managed block', async () => {
  await withTempDir('lsk-integrations-codex-preserve-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      [
        'compact_prompt = """keep my compaction rules"""',
        'project_doc_fallback_filenames = ["AGENTS.md"]',
        '',
      ].join('\n'),
      'utf-8'
    );

    const result = await runCli(dir, ['integrations', 'codex'], { HOME: homeDir });
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const config = await fs.readFile(configPath, 'utf-8');
    assert.match(config, /compact_prompt = """keep my compaction rules"""/);
    assert.match(config, /project_doc_fallback_filenames = \["AGENTS\.md"\]/);
    assert.match(config, /# lee-spec-kit:codex-bootstrap:begin/);
    assert.match(config, /^codex_hooks = true$/m);
  });
});

test('integrations codex does not treat commented codex_hooks text as an installed bootstrap', async () => {
  await withTempDir('lsk-integrations-codex-commented-flag-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      ['# codex_hooks = true', ''].join('\n'),
      'utf-8'
    );

    const result = await runCli(dir, ['integrations', 'codex'], { HOME: homeDir });
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const config = await fs.readFile(configPath, 'utf-8');
    assert.equal(
      config.match(/# lee-spec-kit:codex-bootstrap:begin/g)?.length,
      1
    );
    assert.match(config, /^codex_hooks = true$/m);
  });
});

test('integrations codex ignores codex_hooks text that only appears inside multiline strings', async () => {
  await withTempDir('lsk-integrations-codex-multiline-string-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      [
        'description = """',
        'codex_hooks = true',
        '"""',
        '',
      ].join('\n'),
      'utf-8'
    );

    const result = await runCli(dir, ['integrations', 'codex'], { HOME: homeDir });
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const config = await fs.readFile(configPath, 'utf-8');
    assert.equal(
      config.match(/# lee-spec-kit:codex-bootstrap:begin/g)?.length,
      1
    );
    assert.match(config, /^codex_hooks = true$/m);
  });
});

test('integrations codex rejects conflicting codex_hooks settings outside an existing managed block', async () => {
  await withTempDir('lsk-integrations-codex-conflict-managed-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      [
        '# lee-spec-kit:codex-bootstrap:begin',
        'codex_hooks = true',
        '# lee-spec-kit:codex-bootstrap:end',
        '',
        '[features]',
        'codex_hooks = false',
        '',
      ].join('\n'),
      'utf-8'
    );

    const result = await runCli(dir, ['integrations', 'codex'], { HOME: homeDir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Codex config already defines codex_hooks outside lee-spec-kit managed block/);
  });
});

test('integrations codex-hooks --remove preserves custom hooks in a mixed group', async () => {
  await withTempDir('lsk-integrations-codex-hooks-mixed-remove-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const hooksJsonPath = path.join(dir, '.codex', 'hooks.json');
    const hooksJson = JSON.parse(await fs.readFile(hooksJsonPath, 'utf-8'));
    hooksJson.hooks.PreToolUse = [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'node ./custom-hook.mjs',
          },
          ...hooksJson.hooks.PreToolUse[0].hooks,
        ],
      },
    ];
    await fs.writeFile(hooksJsonPath, `${JSON.stringify(hooksJson, null, 2)}\n`, 'utf-8');

    const removeResult = await runCli(dir, ['integrations', 'codex-hooks', '--remove']);
    assert.equal(removeResult.code, 0, removeResult.stderr || removeResult.stdout);

    const after = JSON.parse(await fs.readFile(hooksJsonPath, 'utf-8'));
    assert.deepEqual(after.hooks.PreToolUse, [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'node ./custom-hook.mjs',
          },
        ],
      },
    ]);
  });
});

test('integrations codex-hooks --remove keeps custom hooks that only mention managed filenames in text', async () => {
  await withTempDir('lsk-integrations-codex-hooks-custom-text-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const hooksJsonPath = path.join(dir, '.codex', 'hooks.json');
    const hooksJson = JSON.parse(await fs.readFile(hooksJsonPath, 'utf-8'));
    hooksJson.hooks.PreToolUse = [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'echo ".codex/hooks/pre_tool_use_policy.mjs.backup"',
          },
          ...hooksJson.hooks.PreToolUse[0].hooks,
        ],
      },
    ];
    await fs.writeFile(hooksJsonPath, `${JSON.stringify(hooksJson, null, 2)}\n`, 'utf-8');

    const removeResult = await runCli(dir, ['integrations', 'codex-hooks', '--remove']);
    assert.equal(removeResult.code, 0, removeResult.stderr || removeResult.stdout);

    const after = JSON.parse(await fs.readFile(hooksJsonPath, 'utf-8'));
    assert.deepEqual(after.hooks.PreToolUse, [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'echo ".codex/hooks/pre_tool_use_policy.mjs.backup"',
          },
        ],
      },
    ]);
  });
});

test('integrations codex-hooks --remove still prunes managed hooks when the recorded node path differs', async () => {
  await withTempDir('lsk-integrations-codex-hooks-node-path-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const hooksJsonPath = path.join(dir, '.codex', 'hooks.json');
    const hooksJson = JSON.parse(await fs.readFile(hooksJsonPath, 'utf-8'));
    for (const eventName of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Stop']) {
      for (const group of hooksJson.hooks[eventName] || []) {
        for (const hook of group.hooks || []) {
          if (typeof hook.command === 'string' && hook.command.includes(' -e ')) {
            hook.command = hook.command.replace(
              /^"[^"]+"(?= -e )/,
              '"/opt/custom/node"'
            );
          }
        }
      }
    }
    await fs.writeFile(hooksJsonPath, `${JSON.stringify(hooksJson, null, 2)}\n`, 'utf-8');

    const removeResult = await runCli(dir, ['integrations', 'codex-hooks', '--remove']);
    assert.equal(removeResult.code, 0, removeResult.stderr || removeResult.stdout);

    const after = JSON.parse(await fs.readFile(hooksJsonPath, 'utf-8'));
    assert.equal(after.hooks?.SessionStart, undefined);
    assert.equal(after.hooks?.UserPromptSubmit, undefined);
    assert.equal(after.hooks?.PreToolUse, undefined);
    assert.equal(after.hooks?.Stop, undefined);
  });
});

test('generated pre-tool hook blocks commit when staged docs paths violate commit-audit', async () => {
  await withTempDir('lsk-codex-hook-pre-tool-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    await fs.mkdir(path.join(dir, 'docs', 'plans'), { recursive: true });
    await fs.writeFile(path.join(dir, 'docs', 'plans', 'external-plan.md'), '# External\n', 'utf-8');
    const addResult = await runCommand(dir, 'git', ['add', 'docs/plans/external-plan.md']);
    assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);

    const fakeNpx = await setupFakeNpxCli(dir);
    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
      {
        env: fakeNpx.env,
        input: JSON.stringify({
          cwd: dir,
          tool_input: {
            command: 'git commit -m "test"',
          },
        }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(payload.reason, /Normalize or allowlist non-canonical docs paths before committing/);
  });
});

test('generated pre-tool hook blocks wrapped and windows-style git commit commands', async () => {
  await withTempDir('lsk-codex-hook-pre-tool-wrapped-', async (dir) => {
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
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    await fs.writeFile(path.join(dir, 'docs', 'random.md'), '# stray\n', 'utf-8');
    const gitAdd = await runCommand(dir, 'git', ['add', 'docs/random.md']);
    assert.equal(gitAdd.code, 0, gitAdd.stderr || gitAdd.stdout);
    await fs.writeFile(
      path.join(dir, 'dangerous-wrapper.js'),
      "const a='gi'; const b='t'; require('child_process').spawnSync(a+b,['commit','-m','test']);\n",
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, 'dangerous-wrapper.py'),
      "import os\nos.system('git push')\n",
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, 'dangerous-shell.sh'),
      "#!/usr/bin/env bash\ngit push\n",
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, 'dangerous-bun.js'),
      "require('child_process').spawnSync('gh',['pr','merge','123'])\n",
      'utf-8'
    );

    const hookPath = path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs');
    for (const command of [
      'sh -c "git commit -m test"',
      "bash -c './dangerous-shell.sh'",
      'bash -lc "git -C . commit -m test"',
      'sudo bash -lc "git commit -m test"',
      'sudo -E bash -lc "git commit -m test"',
      'sudo -u root bash -lc "git commit -m test"',
      'env bash -lc "git commit -m test"',
      'fish -c "git commit -m test"',
      `perl -e 'system("git commit -m test")'`,
      `node -e "require('child_process').spawnSync('git',['commit','-m','test'])"`,
      `node -e "const a='gi'; const b='t'; require('child_process').spawnSync(a+b,['commit','-m','test'])"`,
      `node -e "const a='g'; const b='h'; require('child_process').spawnSync(a+b,['repo','delete','acme/demo','--yes'])"`,
      'node dangerous-wrapper.js',
      'uv run dangerous-wrapper.py',
      'uv run --with requests dangerous-wrapper.py',
      'bun dangerous-bun.js',
      'bash dangerous-shell.sh',
      "python <<'PY'\nimport os\nos.system('git commit -m test')\nPY",
      'GIT_DIR=.git GIT_WORK_TREE=. git commit -m test',
      'git.exe commit -m test',
    ]) {
      const hookResult = await runCommand(dir, process.execPath, [hookPath], {
        input: JSON.stringify({
          cwd: dir,
          tool_input: { command },
        }),
      });
      assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
      const payload = JSON.parse(hookResult.stdout.trim());
      assert.equal(payload.decision, 'block');
      assert.match(
        payload.reason,
        /Normalize or allowlist non-canonical docs paths before committing|--git-dir, --work-tree, GIT_DIR, or GIT_WORK_TREE are not supported|do not support this shell wrapper/i
      );
    }
  });
}, 15000);

test('generated pre-tool hook blocks git commit commands that target another worktree via --git-dir/--work-tree', async () => {
  await withTempDir('lsk-codex-hook-pre-tool-git-dir-', async (dir) => {
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
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
      {
        input: JSON.stringify({
          cwd: dir,
          tool_input: {
            command: 'git --git-dir .git --work-tree . commit -m "test"',
          },
        }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(
      payload.reason,
      /--git-dir, --work-tree, GIT_DIR, or GIT_WORK_TREE are not supported/i
    );
  });
});

test('integrations codex-hooks in standalone installs hooks at the configured workspace root even from docs root', async () => {
  await withTempDir('lsk-codex-hooks-standalone-docs-root-install-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

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
      '--docs-repo',
      'standalone',
      '--project-root',
      './project',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const installResult = await runCli(path.join(dir, 'docs'), ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    assert.equal(await pathExists(path.join(dir, '.codex', 'hooks.json')), true);
    assert.equal(await pathExists(path.join(dir, 'docs', '.codex', 'hooks.json')), false);
    assert.equal(await pathExists(path.join(projectRoot, '.codex', 'hooks.json')), false);
  });
});

test('integrations codex-hooks refuses installation from an unrelated project repo', async () => {
  await withTempDir('lsk-codex-hooks-wrong-root-', async (dir) => {
    const workspaceRoot = path.join(dir, 'workspace');
    const projectRoot = path.join(workspaceRoot, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

    const initResult = await runCli(workspaceRoot, [
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
      './project',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const installResult = await runCli(projectRoot, ['integrations', 'codex-hooks']);
    assert.notEqual(installResult.code, 0);
    assert.match(installResult.stderr, /docs were not detected from the current directory/i);
    assert.equal(await pathExists(path.join(projectRoot, '.codex', 'hooks.json')), false);
  });
});

test('integrations codex-hooks refuses installation when standalone workspaceRoot is invalid', async () => {
  await withTempDir('lsk-codex-hooks-invalid-workspace-root-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

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
      '--docs-repo',
      'standalone',
      '--project-root',
      './project',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workspaceRoot = '../project';
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const installResult = await runCli(path.join(dir, 'docs'), ['integrations', 'codex-hooks']);
    assert.notEqual(installResult.code, 0);
    assert.match(installResult.stderr, /workspaceRoot is missing or invalid/i);
    assert.equal(await pathExists(path.join(projectRoot, '.codex', 'hooks.json')), false);
  });
});

test('integrations codex-hooks refuses installation when standalone projectRoot is missing', async () => {
  await withTempDir('lsk-codex-hooks-missing-project-root-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

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
      '--docs-repo',
      'standalone',
      '--project-root',
      './project',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    delete config.projectRoot;
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const installResult = await runCli(path.join(dir, 'docs'), ['integrations', 'codex-hooks']);
    assert.notEqual(installResult.code, 0);
    assert.match(installResult.stderr, /workspaceRoot is missing or invalid/i);
    assert.equal(await pathExists(path.join(projectRoot, '.codex', 'hooks.json')), false);
  });
});

test('generated pre-tool hook blocks docs-repo commit from workspace root in standalone mode', async () => {
  await withTempDir('lsk-codex-hook-pre-tool-standalone-docs-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    await fs.mkdir(path.join(dir, 'docs', 'plans'), { recursive: true });
    await fs.writeFile(path.join(dir, 'docs', 'plans', 'external-plan.md'), '# External\n', 'utf-8');
    const addResult = await runCommand(path.join(dir, 'docs'), 'git', ['add', 'plans/external-plan.md']);
    assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);

    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
      {
        input: JSON.stringify({
          cwd: dir,
          tool_input: {
            command: 'git -C docs commit -m "test"',
          },
        }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(payload.reason, /Normalize or allowlist non-canonical docs paths before committing/);
  });
});

test('generated pre-tool hook blocks project commit from workspace root when standalone docs are not synced', async () => {
  await withTempDir('lsk-codex-hook-pre-tool-standalone-project-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'src', 'demo.ts'), 'export const demo = 1;\n', 'utf-8');
    const addResult = await runCommand(projectRoot, 'git', ['add', 'src/demo.ts']);
    assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);

    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
      {
        input: JSON.stringify({
          cwd: dir,
          tool_input: {
            command: 'git -C project commit -m "test"',
          },
        }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(payload.reason, /Sync the active feature docs before running remote or destructive commands/);
  });
});

test('generated pre-tool hook blocks dangerous git -C commands unless they are commits', async () => {
  await withTempDir('lsk-codex-hook-pre-tool-standalone-project-push-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

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
      '--docs-repo',
      'standalone',
      '--project-root',
      './project',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
      {
        input: JSON.stringify({
          cwd: dir,
          tool_input: {
            command: 'git -C project push origin main',
          },
        }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(payload.reason, /targeting another repo via -C are only supported for git commit/i);
  });
});

test('generated pre-tool hook blocks git commit commands targeting repos outside the current topology', async () => {
  await withTempDir('lsk-codex-hook-pre-tool-cross-repo-commit-', async (dir) => {
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
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const otherRepo = path.join(dir, 'other-repo');
    await fs.mkdir(otherRepo, { recursive: true });
    const otherGitInit = await runCommand(otherRepo, 'git', ['init']);
    assert.equal(otherGitInit.code, 0, otherGitInit.stderr || otherGitInit.stdout);
    await fs.writeFile(path.join(otherRepo, 'README.md'), '# other\n', 'utf-8');
    const otherAdd = await runCommand(otherRepo, 'git', ['add', 'README.md']);
    assert.equal(otherAdd.code, 0, otherAdd.stderr || otherAdd.stdout);

    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
      {
        input: JSON.stringify({
          cwd: dir,
          tool_input: {
            command: 'git -C other-repo commit -m "test"',
          },
        }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(
      payload.reason,
      /outside the current lee-spec-kit project topology/i
    );
  });
});

test('generated pre-tool hook blocks destructive gh repo delete commands', async () => {
  await withTempDir('lsk-codex-hook-pre-tool-gh-repo-delete-', async (dir) => {
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
      'local',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    for (const command of [
      'gh repo delete acme/demo --yes',
      `node -e "require('child_process').spawnSync('gh',['repo','delete','acme/demo','--yes'])"`,
      'gh api repos/acme/demo -X DELETE',
      `gh api graphql -f query='mutation { closeIssue(input:{issueId:\"X\"}) { clientMutationId } }'`,
      'gh api graphql -f query=@query.gql',
    ]) {
      const hookResult = await runCommand(
        dir,
        process.execPath,
        [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
        {
          input: JSON.stringify({
            cwd: dir,
            tool_input: {
              command,
            },
          }),
        }
      );
      assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
      const payload = JSON.parse(hookResult.stdout.trim());
      assert.equal(payload.decision, 'block');
      assert.match(
        payload.reason,
        /not supported by lee-spec-kit hooks|do not support this shell wrapper/i
      );
    }
  });
});

test('generated pre-tool hook blocks standalone multi commits that target a different component repo than the active feature', async () => {
  await withTempDir('lsk-codex-hook-pre-tool-standalone-multi-component-mismatch-', async (dir) => {
    const apiRoot = path.join(dir, 'api');
    const webRoot = path.join(dir, 'web');
    await fs.mkdir(apiRoot, { recursive: true });
    await fs.mkdir(webRoot, { recursive: true });

    const apiGitInit = await runCommand(apiRoot, 'git', ['init']);
    assert.equal(apiGitInit.code, 0, apiGitInit.stderr || apiGitInit.stdout);
    const webGitInit = await runCommand(webRoot, 'git', ['init']);
    assert.equal(webGitInit.code, 0, webGitInit.stderr || webGitInit.stdout);

    const initResult = await runCli(dir, [
      'init',
      '--non-interactive',
      '--name',
      'demo',
      '--type',
      'multi',
      '--components',
      'api,web',
      '--lang',
      'en',
      '--workflow',
      'local',
      '--docs-repo',
      'standalone',
      '--component-project-roots',
      'api=./api,web=./web',
      '--dir',
      './docs',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    const featureResult = await runCli(dir, [
      'feature',
      'alpha',
      '--id',
      'F001',
      '--component',
      'api',
      '--non-interactive',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    await fs.writeFile(path.join(webRoot, 'index.ts'), 'export const web = 1;\n', 'utf-8');
    const webAdd = await runCommand(webRoot, 'git', ['add', 'index.ts']);
    assert.equal(webAdd.code, 0, webAdd.stderr || webAdd.stdout);

    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
      {
        input: JSON.stringify({
          cwd: dir,
          tool_input: {
            command: 'git -C web commit -m "test"',
          },
        }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(
      payload.reason,
      /Sync the active feature docs before running remote or destructive commands/i
    );
  });
});

test('generated session-start hook injects workflow context when project is detected', async () => {
  await withTempDir('lsk-codex-hook-session-start-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const fakeNpx = await setupFakeNpxCli(dir);
    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'session_start_lee_spec_kit.mjs')],
      {
        env: fakeNpx.env,
        input: JSON.stringify({ cwd: dir }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(payload.hookSpecificOutput.additionalContext, /lee-spec-kit project detected/);
    assert.match(payload.hookSpecificOutput.additionalContext, /Docs dir:/);
    assert.match(payload.hookSpecificOutput.additionalContext, /workflow-stage --json/);
  });
});

test('generated user-prompt hook injects workflow context for generic requests', async () => {
  await withTempDir('lsk-codex-hook-user-prompt-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const fakeNpx = await setupFakeNpxCli(dir);
    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'user_prompt_submit_lee_spec_kit.mjs')],
      {
        env: fakeNpx.env,
        input: JSON.stringify({ cwd: dir, prompt: 'continue the next feature according to the rules' }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(payload.hookSpecificOutput.additionalContext, /generic rule-following requests/);
    assert.match(payload.hookSpecificOutput.additionalContext, /workflow-stage --json/);
  });
});

test('generated session-start hook stays quiet when detect fails', async () => {
  await withTempDir('lsk-codex-hook-session-start-fail-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const hookUtilsPath = path.join(dir, '.codex', 'hooks', '_lee_spec_kit_hook_utils.mjs');
    const hookUtils = await fs.readFile(hookUtilsPath, 'utf-8');
    await fs.writeFile(
      hookUtilsPath,
      hookUtils.replace(
        /const CLI_ENTRYPOINT = .+;/,
        `const CLI_ENTRYPOINT = ${JSON.stringify(path.join(dir, '.codex', 'hooks', 'missing-cli-entrypoint.js'))};`
      ),
      'utf-8'
    );
    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'session_start_lee_spec_kit.mjs')],
      {
        input: JSON.stringify({ cwd: dir }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    assert.equal(hookResult.stdout.trim(), '');
  });
});

test('generated stop hook blocks when workflow-audit still needs docs sync', async () => {
  await withTempDir('lsk-codex-hook-stop-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'demo.ts'), 'export const demo = 1;\n', 'utf-8');

    const fakeNpx = await setupFakeNpxCli(dir);
    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'stop_workflow_audit.mjs')],
      {
        env: fakeNpx.env,
        input: JSON.stringify({ cwd: dir }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(payload.reason, /Run one more pass and sync the active feature docs before stopping/);
  });
}, 15_000);

test('generated pre-tool hook fails closed when commit-audit returns invalid JSON', async () => {
  await withTempDir('lsk-codex-hook-fail-closed-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const hookUtilsPath = path.join(dir, '.codex', 'hooks', '_lee_spec_kit_hook_utils.mjs');
    const hookUtils = await fs.readFile(hookUtilsPath, 'utf-8');
    await fs.writeFile(
      hookUtilsPath,
      hookUtils.replace(
        'export function runLeeSpecKitJson(args, cwd = process.cwd()) {',
        `export function runLeeSpecKitJson(args, cwd = process.cwd()) {
  if (Array.isArray(args) && args[0] === 'commit-audit') {
    return {
      ok: false,
      error: 'Injected invalid JSON for commit-audit',
      status: 0,
    };
  }
`
      ),
      'utf-8'
    );
    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
      {
        input: JSON.stringify({
          cwd: dir,
          tool_input: {
            command: 'git commit -m "test"',
          },
        }),
      }
    );
    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(payload.reason, /commit-audit failed inside the Codex hook/);
  });
});

test('generated pre-tool hook fails closed when hook stdin payload is malformed', async () => {
  await withTempDir('lsk-codex-hook-malformed-payload-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const hookResult = await runCommand(
      dir,
      process.execPath,
      [path.join(dir, '.codex', 'hooks', 'pre_tool_use_policy.mjs')],
      {
        input: 'not-json',
      }
    );

    assert.equal(hookResult.code, 0, hookResult.stderr || hookResult.stdout);
    const payload = JSON.parse(hookResult.stdout.trim());
    assert.equal(payload.decision, 'block');
    assert.match(payload.reason, /Codex hook input was malformed/);
  });
});

test('integrations codex-hooks generated commands survive repo moves', async () => {
  await withTempDir('lsk-codex-hook-move-', async (dir) => {
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

    const installResult = await runCli(dir, ['integrations', 'codex-hooks']);
    assert.equal(installResult.code, 0, installResult.stderr || installResult.stdout);

    const originalHooksJsonPath = path.join(dir, '.codex', 'hooks.json');
    const hooksJson = JSON.parse(await fs.readFile(originalHooksJsonPath, 'utf-8'));
    const command = hooksJson.hooks.SessionStart[0].hooks[0].command;
    const renamedDir = `${dir}-renamed`;
    await fs.rename(dir, renamedDir);

    try {
      const runResult = await runCommand(renamedDir, 'zsh', ['-lc', command], {
        input: JSON.stringify({
          cwd: renamedDir,
        }),
      });

      assert.equal(runResult.code, 0, runResult.stderr || runResult.stdout);
      const payload = JSON.parse(runResult.stdout.trim());
      assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
    } finally {
      await fs.rm(renamedDir, { recursive: true, force: true });
    }
  });
});

test('integrations codex-bootstrap preserves custom global instructions and updates managed block', async () => {
  await withTempDir('lsk-setup-codex-bootstrap-update-', async (dir) => {
    const homeDir = path.join(dir, 'home');
    const codexDir = path.join(homeDir, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      configPath,
      [
        'model = "gpt-5.4"',
        'compact_prompt = """keep my compaction rules"""',
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
      ['integrations', 'codex-bootstrap'],
      { HOME: homeDir }
    );

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const config = await fs.readFile(configPath, 'utf-8');
    assert.match(config, /model = "gpt-5\.4"/);
    assert.match(config, /compact_prompt = """keep my compaction rules"""/);
    assert.match(config, /# keep this/);
    assert.doesNotMatch(config, /^OLD$/m);
    assert.equal(
      config.match(/# lee-spec-kit:codex-bootstrap:begin/g)?.length,
      1
    );
  });
});

test('init output recommends codex bootstrap integrations command', async () => {
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
    assert.match(result.stdout, /npx lee-spec-kit integrations codex-hooks/);
    assert.match(result.stdout, /npx lee-spec-kit integrations codex/);
  });
});

test('root help exposes the supported Codex-native command surface', async () => {
  await withTempDir('lsk-root-help-surface-', async (dir) => {
    const help = await runCli(dir, ['--no-banner', '--help']);
    assert.equal(help.code, 0, help.stderr || help.stdout);
    assert.match(help.stdout, /Docs Schema Commands:/);
    assert.match(help.stdout, /Workflow Policy Commands:/);
    assert.match(help.stdout, /Codex Integration Commands:/);
    assert.match(help.stdout, /\binit\b/);
    assert.match(help.stdout, /\bidea\b/);
    assert.match(help.stdout, /\bfeature\b/);
    assert.match(help.stdout, /\bdocs\b/);
    assert.match(help.stdout, /\bdetect\b/);
    assert.match(help.stdout, /\bworkflow-stage\b/);
    assert.match(help.stdout, /\bgithub\b/);
    assert.match(help.stdout, /\bintegrations\b/);
    assert.match(help.stdout, /\bcommit-audit\b/);
    assert.match(help.stdout, /\bworkflow-audit\b/);
    assert.doesNotMatch(help.stdout, /\bsetup\b/);
    assert.doesNotMatch(help.stdout, /\blegacy\b/);
    assert.doesNotMatch(help.stdout, /\bcontext\b/);
    assert.doesNotMatch(help.stdout, /\bflow\b/);
  });
});

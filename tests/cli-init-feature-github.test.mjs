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
} from './helpers/cli-contract-helpers.mjs';

async function setupMergeGhCli(
  dir,
  {
    mergeCode,
    mergeStdout = '',
    mergeStderr = '',
    state = 'MERGED',
    mergedAt = '2026-02-17T08:51:35Z',
    baseRefName = 'main',
  }
) {
  const binDir = path.join(dir, 'fake-merge-gh-bin');
  const scriptPath = path.join(binDir, 'gh');
  const cmdScriptPath = path.join(binDir, 'gh.cmd');
  const configLiteral = JSON.stringify({
    mergeCode,
    mergeStdout,
    mergeStderr,
    state,
    mergedAt,
    baseRefName,
  });

  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env node
const config = ${configLiteral};
const args = process.argv.slice(2);
if (args[0] === 'pr' && args[1] === 'merge') {
  if (config.mergeStdout) process.stdout.write(config.mergeStdout + '\\n');
  if (config.mergeStderr) process.stderr.write(config.mergeStderr + '\\n');
  process.exit(config.mergeCode);
}
if (args[0] === 'pr' && args[1] === 'view') {
  const jsonIdx = args.indexOf('--json');
  const fields = jsonIdx >= 0 ? args[jsonIdx + 1] : '';
  if (fields === 'state,mergedAt,baseRefName') {
    console.log(JSON.stringify({
      state: config.state,
      mergedAt: config.mergedAt,
      baseRefName: config.baseRefName,
    }));
    process.exit(0);
  }
  console.log(JSON.stringify({
    url: 'https://github.com/acme/repo/pull/77',
    headRefName: 'feature-branch',
    baseRefName: config.baseRefName,
  }));
  process.exit(0);
}
process.exit(0);
`,
    'utf-8'
  );
  await fs.chmod(scriptPath, 0o755);
  await fs.writeFile(
    cmdScriptPath,
    `@echo off\r\n"${process.execPath}" "%~dp0\\gh" %*\r\n`,
    'utf-8'
  );
  return {
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    },
  };
}

async function setupLocalOriginRemote(repoDir) {
  const remotePath = path.join(repoDir, 'origin.git');
  const initBare = await runCommand(repoDir, 'git', ['init', '--bare', remotePath]);
  assert.equal(initBare.code, 0, initBare.stderr || initBare.stdout);
  const addRemote = await runCommand(repoDir, 'git', ['remote', 'add', 'origin', remotePath]);
  assert.equal(addRemote.code, 0, addRemote.stderr || addRemote.stdout);
  const pushMain = await runCommand(repoDir, 'git', ['push', '-u', 'origin', 'HEAD']);
  assert.equal(pushMain.code, 0, pushMain.stderr || pushMain.stdout);
}

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

    const agentsMdPath = path.join(dir, 'AGENTS.md');
    const agentsMd = await fs.readFile(agentsMdPath, 'utf-8');
    assert.match(agentsMd, /<!-- lee-spec-kit:begin -->/);
    assert.match(
      agentsMd,
      /If the user gives a generic request such as continuing the next feature according to the rules, interpret it through this workflow automatically\./
    );
    assert.match(agentsMd, /workflow-stage <feature-ref> --json/);
  });
});

test('init appends lee-spec-kit managed block to existing AGENTS.md', async () => {
  await withTempDir('lsk-init-agents-append-', async (dir) => {
    const agentsMdPath = path.join(dir, 'AGENTS.md');
    await fs.writeFile(agentsMdPath, '# Existing Instructions\n\nKeep this.\n', 'utf-8');

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
      'github',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const agentsMd = await fs.readFile(agentsMdPath, 'utf-8');
    assert.match(agentsMd, /# Existing Instructions/);
    assert.match(agentsMd, /Keep this\./);
    assert.match(agentsMd, /<!-- lee-spec-kit:begin -->/);
    assert.match(agentsMd, /<!-- lee-spec-kit:end -->/);
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
      'github',
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

test('idea creates an indexed idea document with canonical metadata', async () => {
  await withTempDir('lsk-idea-create-', async (dir) => {
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

    const ideaResult = await runCli(dir, [
      'idea',
      'login-rate-limit',
      '--non-interactive',
      '--json',
    ]);
    assert.equal(ideaResult.code, 0, ideaResult.stderr || ideaResult.stdout);

    const payload = JSON.parse(ideaResult.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'IDEA_CREATED');
    assert.equal(payload.ideaId, 'I001');
    assert.equal(payload.ideaName, 'login-rate-limit');

    const ideaPath = path.join(dir, 'docs', 'ideas', 'I001-login-rate-limit.md');
    const ideaDoc = await fs.readFile(ideaPath, 'utf-8');
    assert.match(ideaDoc, /- \*\*Idea ID\*\*: I001/);
    assert.match(ideaDoc, /- \*\*Idea Name\*\*: login-rate-limit/);
    assert.match(ideaDoc, /- \*\*Status\*\*: Active/);
    assert.match(ideaDoc, /- \*\*Feature\*\*: -/);
    assert.match(ideaDoc, /- \*\*PRD Refs\*\*: -/);
  });
});

test('feature --idea promotes the linked idea and records the origin in spec', async () => {
  await withTempDir('lsk-feature-promote-idea-', async (dir) => {
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

    const ideaResult = await runCli(dir, [
      'idea',
      'login-rate-limit',
      '--non-interactive',
      '--json',
    ]);
    assert.equal(ideaResult.code, 0, ideaResult.stderr || ideaResult.stdout);

    const featureResult = await runCli(dir, [
      'feature',
      'api-login-rate-limit',
      '--id',
      'F001',
      '--idea',
      'I001',
      '--non-interactive',
      '--json',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const ideaPath = path.join(dir, 'docs', 'ideas', 'I001-login-rate-limit.md');
    const ideaDoc = await fs.readFile(ideaPath, 'utf-8');
    assert.match(ideaDoc, /- \*\*Status\*\*: Featureized/);
    assert.match(ideaDoc, /- \*\*Feature\*\*: F001-api-login-rate-limit/);

    const specPath = path.join(
      dir,
      'docs',
      'features',
      'F001-api-login-rate-limit',
      'spec.md'
    );
    const specDoc = await fs.readFile(specPath, 'utf-8');
    assert.match(specDoc, /- Idea: `\.\.\/\.\.\/ideas\/I001-login-rate-limit\.md`/);
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
    assert.equal(config.workspaceRoot, '..');
    assert.equal(config.projectRoot, '/tmp/project-root');
    assert.equal(config.pushDocs, false);
  });
});

test('init standalone seeds workspace AGENTS without touching docs or project roots', async () => {
  await withTempDir('lsk-init-standalone-workspace-agents-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

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
      './project',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.equal(await pathExists(path.join(dir, 'AGENTS.md')), true);
    assert.equal(await pathExists(path.join(dir, 'docs', 'AGENTS.md')), false);
    assert.equal(await pathExists(path.join(projectRoot, 'AGENTS.md')), false);
  });
});

test('init standalone fails when launched from inside an existing project repo', async () => {
  await withTempDir('lsk-init-standalone-inside-project-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

    const result = await runCli(projectRoot, [
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

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Standalone init must be started from the shared workspace root/i);
    assert.equal(await pathExists(path.join(projectRoot, 'AGENTS.md')), false);
    assert.equal(await pathExists(path.join(projectRoot, '.codex')), false);
  });
});

test('init standalone fails when launched from the docs repo root instead of the shared workspace root', async () => {
  await withTempDir('lsk-init-standalone-from-docs-root-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    const docsRoot = path.join(dir, 'docs');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(docsRoot, { recursive: true });

    const result = await runCli(docsRoot, [
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
      '../project',
      '--dir',
      '.',
    ]);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /must be started from the shared workspace root above the docs directory/i);
    assert.equal(await pathExists(path.join(docsRoot, '.lee-spec-kit.json')), false);
    assert.equal(await pathExists(path.join(projectRoot, 'AGENTS.md')), false);
  });
});

test('init standalone fails when docs dir points inside an existing project repo', async () => {
  await withTempDir('lsk-init-standalone-target-inside-project-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

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
      './project',
      '--dir',
      './project/docs',
    ]);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Standalone init cannot place docs inside an existing project git repository/i);
    assert.equal(await pathExists(path.join(projectRoot, 'AGENTS.md')), false);
    assert.equal(await pathExists(path.join(projectRoot, 'docs', '.lee-spec-kit.json')), false);
  });
});

test('init standalone fails when docs dir points at the project repo root', async () => {
  await withTempDir('lsk-init-standalone-target-project-root-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

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
      './project',
      '--dir',
      './project',
    ]);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Standalone init cannot place docs at the project repo root/i);
    assert.equal(await pathExists(path.join(projectRoot, 'AGENTS.md')), false);
    assert.equal(await pathExists(path.join(projectRoot, '.lee-spec-kit.json')), false);
  });
});

test('init standalone fails when docs dir points at another existing git repo root', async () => {
  await withTempDir('lsk-init-standalone-target-other-repo-root-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    const docsRepoRoot = path.join(dir, 'docs-repo');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(docsRepoRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);
    const docsRepoGitInit = await runCommand(docsRepoRoot, 'git', ['init']);
    assert.equal(docsRepoGitInit.code, 0, docsRepoGitInit.stderr || docsRepoGitInit.stdout);

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
      './project',
      '--dir',
      './docs-repo',
    ]);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /existing git repo root unless that root is the verified shared workspace root/i);
    assert.equal(await pathExists(path.join(docsRepoRoot, '.lee-spec-kit.json')), false);
    assert.equal(await pathExists(path.join(docsRepoRoot, 'AGENTS.md')), false);
  });
});

test('init standalone allows a git-backed workspace root when the project repo is separate', async () => {
  await withTempDir('lsk-init-standalone-git-workspace-root-', async (dir) => {
    const workspaceGitInit = await runCommand(dir, 'git', ['init']);
    assert.equal(workspaceGitInit.code, 0, workspaceGitInit.stderr || workspaceGitInit.stdout);

    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);

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
      './project',
      '--dir',
      './docs',
    ]);

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.equal(await pathExists(path.join(dir, 'AGENTS.md')), true);
    assert.equal(await pathExists(path.join(dir, 'docs', 'AGENTS.md')), false);
    assert.equal(await pathExists(path.join(projectRoot, 'AGENTS.md')), false);
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
    assert.equal(config.workspaceRoot, '..');
    assert.equal(config.projectType, 'multi');
    assert.deepEqual(config.components, ['fe', 'be', 'worker']);
    assert.deepEqual(config.projectRoot, {
      fe: '/tmp/fe',
      be: '/tmp/be',
      worker: '/tmp/worker',
    });
  });
});

test('update --agents-md in standalone syncs workspace AGENTS without modifying docs or project roots', async () => {
  await withTempDir('lsk-update-standalone-agents-md-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

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

    const projectAgentsPath = path.join(projectRoot, 'AGENTS.md');
    await fs.writeFile(projectAgentsPath, '# Project-owned instructions\n', 'utf-8');
    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.workflow.requireWorktree = false;
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const updateResult = await runCli(dir, ['update', '--agents-md', '--force']);
    assert.equal(updateResult.code, 0, updateResult.stderr || updateResult.stdout);

    const projectAgents = await fs.readFile(projectAgentsPath, 'utf-8');
    assert.equal(projectAgents, '# Project-owned instructions\n');

    const workspaceAgents = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    assert.match(workspaceAgents, /<!-- lee-spec-kit:begin -->/);
    assert.equal(await pathExists(path.join(dir, 'docs', 'AGENTS.md')), false);
    const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(updatedConfig.workflow.requireWorktree, true);
  });
});

test('update --agents-md backfills standalone workspaceRoot when run from workspace root', async () => {
  await withTempDir('lsk-update-standalone-workspace-root-backfill-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

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
    delete config.workspaceRoot;
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const updateResult = await runCli(dir, ['update', '--agents-md', '--force']);
    assert.equal(updateResult.code, 0, updateResult.stderr || updateResult.stdout);

    const nextConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    assert.equal(nextConfig.workspaceRoot, '..');
  });
});

test('update --agents-md in standalone fails when workspaceRoot points into the project repo', async () => {
  await withTempDir('lsk-update-standalone-invalid-workspace-root-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

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

    const updateResult = await runCli(dir, ['update', '--agents-md', '--force']);
    assert.notEqual(updateResult.code, 0);
    assert.match(updateResult.stderr, /workspaceRoot is missing or invalid/i);
    assert.equal(await pathExists(path.join(projectRoot, 'AGENTS.md')), false);
  });
});

test('update --agents-md in standalone fails when projectRoot is missing from config', async () => {
  await withTempDir('lsk-update-standalone-missing-project-root-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

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

    const updateResult = await runCli(dir, ['update', '--agents-md', '--force']);
    assert.notEqual(updateResult.code, 0);
    assert.match(updateResult.stderr, /workspaceRoot is missing or invalid/i);
    assert.equal(await pathExists(path.join(projectRoot, 'AGENTS.md')), false);
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

    const featureSpec = await fs.readFile(path.join(featureDir, 'spec.md'), 'utf-8');
    assert.match(featureSpec, /\*\*Feature ID\*\*:\s*F001/);
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
      'github',
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

test('github issue/pr create sync workflow draft docs so later PR body gets close keyword', async () => {
  await withTempDir('lsk-github-issue-syncs-for-pr-close-', async (dir) => {
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

    const issueBodyFile = path.join(dir, 'tmp-issue-body.md');
    const prBodyFile = path.join(dir, 'tmp-pr-body.md');
    await writeIssueBodyWithoutTodo(issueBodyFile);
    await writePrBodyWithoutTodo(prBodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const issueCreate = await runCli(
      dir,
      [
        'github',
        'issue',
        'F001-alpha',
        '--create',
        '--body-file',
        issueBodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(issueCreate.code, 0, issueCreate.stderr || issueCreate.stdout);
    const issuePayload = JSON.parse(issueCreate.stdout.trim());
    assert.equal(issuePayload.reasonCode, 'ISSUE_CREATED');

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasksContent = await fs.readFile(tasksPath, 'utf-8');
    assert.match(tasksContent, /^- \*\*Issue\*\*: #123$/m);
    const issueDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'issue.md');
    const issueDocContent = await fs.readFile(issueDocPath, 'utf-8');
    assert.match(issueDocContent, /^- \*\*Issue\*\*: #123$/m);

    const prCreate = await runCli(
      dir,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        prBodyFile,
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(prCreate.code, 0, prCreate.stderr || prCreate.stdout);
    const prPayload = JSON.parse(prCreate.stdout.trim());
    assert.equal(prPayload.reasonCode, 'PR_CREATED_SYNCED');
    assert.match(prPayload.body, /\nCloses #123\n$/);

    const prDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'pr.md');
    const prDocContent = await fs.readFile(prDocPath, 'utf-8');
    assert.match(
      prDocContent,
      /^- \*\*PR\*\*: https:\/\/github\.com\/acme\/repo\/pull\/77$/m
    );
    assert.match(prDocContent, /^- \*\*PR Status\*\*: Review$/m);
  });
});

test('github issue --create uses Ready issue.md when --body-file is omitted', async () => {
  await withTempDir('lsk-github-issue-create-from-ready-doc-', async (dir) => {
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

    const issueDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'issue.md');
    const issueDoc = `# Issue Draft: alpha

## Metadata

- **Status**: Ready
- **Title**: issue.md title should be used
- **Labels**: enhancement,bug
- **Created**: 2026-02-17

## Overview

issue.md custom overview should be used as-is.

## Goals

- [ ] goal from issue.md

## Completion Criteria

- [ ] criterion from issue.md

## Related Docs

- Spec: \`docs/features/F001-alpha/spec.md\`
- Plan: \`docs/features/F001-alpha/plan.md\`
- Tasks: \`docs/features/F001-alpha/tasks.md\`
`;
    await fs.writeFile(issueDocPath, issueDoc, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      ['github', 'issue', 'F001-alpha', '--create', '--confirm', 'OK', '--json'],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'ISSUE_CREATED');
    assert.notEqual(
      await normalizePathForCompare(payload.bodyFile),
      await normalizePathForCompare(issueDocPath)
    );
    assert.equal(payload.title, 'issue.md title should be used');
    assert.deepEqual(payload.labels, ['enhancement', 'bug']);
    assert.match(payload.body, /issue\.md custom overview should be used as-is\./);
    assert.doesNotMatch(payload.body, /^## Metadata$/m);
    assert.doesNotMatch(payload.body, /^- \*\*Status\*\*:/m);
    assert.doesNotMatch(payload.body, /## Labels/);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(
      log,
      new RegExp(
        `--body-file ${String(payload.bodyFile).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      )
    );
  });
});

test('github issue --create accepts issue.md via explicit --body-file', async () => {
  await withTempDir('lsk-github-issue-create-explicit-ready-doc-', async (dir) => {
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

    const issueDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'issue.md');
    const issueDoc = `# Issue Draft: alpha

## Metadata

- **Status**: Ready
- **Title**: explicit body-file issue.md title
- **Labels**: enhancement,bug
- **Created**: 2026-02-17

## Overview

explicit issue.md body-file overview

## Goals

- [ ] goal

## Completion Criteria

- [ ] criterion

## Related Docs

- Spec: \`docs/features/F001-alpha/spec.md\`
- Plan: \`docs/features/F001-alpha/plan.md\`
- Tasks: \`docs/features/F001-alpha/tasks.md\`
`;
    await fs.writeFile(issueDocPath, issueDoc, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'issue',
        'F001-alpha',
        '--create',
        '--body-file',
        issueDocPath,
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
    assert.notEqual(
      await normalizePathForCompare(payload.bodyFile),
      await normalizePathForCompare(issueDocPath)
    );
    assert.doesNotMatch(payload.body, /^## Metadata$/m);
    assert.doesNotMatch(payload.body, /^- \*\*Status\*\*:/m);
    assert.match(payload.body, /explicit issue\.md body-file overview/i);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(
      log,
      new RegExp(
        `--body-file ${String(payload.bodyFile).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      )
    );
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

test('github issue falls back to the generated summary title when ready issue.md still uses the bare slug', async () => {
  await withTempDir('lsk-github-issue-ready-slug-fallback-', async (dir) => {
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

    const featureResult = await runCli(dir, [
      'feature',
      'daily-theme-hall-of-fame',
      '--id',
      'F013',
      '--desc',
      'Reflect daily winners in hall of fame',
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const issueDocPath = path.join(
      dir,
      'docs',
      'features',
      'F013-daily-theme-hall-of-fame',
      'issue.md'
    );
    let issueDoc = await fs.readFile(issueDocPath, 'utf-8');
    issueDoc = issueDoc.replace(/- \*\*(Status|상태)\*\*: .*/u, '- **Status**: Ready');
    issueDoc = issueDoc.replace(/- \*\*(Title|제목)\*\*: .*/u, '- **Title**: daily-theme-hall-of-fame');
    issueDoc = issueDoc.replace(/- \*\*(Labels|라벨)\*\*: .*/u, '- **Labels**: enhancement');
    await fs.writeFile(issueDocPath, issueDoc, 'utf-8');

    const result = await runCli(
      dir,
      ['github', 'issue', 'F013-daily-theme-hall-of-fame', '--json']
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(
      payload.title,
      'daily-theme-hall-of-fame (Reflect daily winners in hall of fame)'
    );
  });
});

test('github pr default title includes feature ref instead of generic implementation-update suffix', async () => {
  await withTempDir('lsk-github-pr-default-title-feature-ref-', async (dir) => {
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
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const bodyFile = path.join(dir, 'tmp-pr-body.md');
    await writePrBodyWithoutTodo(bodyFile);

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'pr',
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
      /--title feat: daily-theme-hall-of-fame \(F013-daily-theme-hall-of-fame implementation\)/
    );
    assert.doesNotMatch(log, /implementation update/);
  });
});

test('github pr --create strips markdown formatting from ready pr.md title metadata', async () => {
  await withTempDir('lsk-github-pr-title-sanitize-', async (dir) => {
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
    ]);
    assert.equal(featureResult.code, 0, featureResult.stderr || featureResult.stdout);

    const prDocPath = path.join(
      dir,
      'docs',
      'features',
      'F013-daily-theme-hall-of-fame',
      'pr.md'
    );
    const prDoc = `# PR Draft: daily-theme-hall-of-fame

## Metadata

- **Status**: Ready
- **Title**: \`feat:\` **daily-theme-hall-of-fame** ([PR](https://example.com))
- **Base**: main
- **Created**: 2026-03-09

## Overview

ready pr.md title metadata should be sanitized before gh pr create.

## Changes

- [ ] sanitize markdown title

## Tests

- [ ] title metadata regression

## Architecture Diagram

\`\`\`mermaid
flowchart TD
  A[Metadata] --> B[Sanitized Title]
\`\`\`

## Related Docs

- Spec: \`docs/features/F013-daily-theme-hall-of-fame/spec.md\`
- Tasks: \`docs/features/F013-daily-theme-hall-of-fame/tasks.md\`
`;
    await fs.writeFile(prDocPath, prDoc, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'pr',
        'F013-daily-theme-hall-of-fame',
        '--create',
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
      /--title feat: daily-theme-hall-of-fame \(PR\)/
    );
    assert.doesNotMatch(log, /--title .*`/);
    assert.doesNotMatch(log, /--title .*\*\*/);
    assert.doesNotMatch(log, /--title .*\[PR\]\(/);
  });
});

test('github pr --create keeps issue-scoped conventional title even when ready pr.md sets a custom title', async () => {
  await withTempDir('lsk-github-pr-issue-title-convention-', async (dir) => {
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
    const tasksContent = await fs.readFile(tasksPath, 'utf-8');
    await fs.writeFile(
      tasksPath,
      /- \*\*(Issue|이슈)\*\*:\s*/.test(tasksContent)
        ? tasksContent.replace(/^- \*\*(Issue|이슈)\*\*:\s*.*$/m, '- **Issue**: #123')
        : tasksContent.replace(
            '## Local Tracking\n',
            '## Local Tracking\n- **Issue**: #123\n'
          ),
      'utf-8'
    );

    const prDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'pr.md');
    const prDoc = `# PR Draft: alpha

## Metadata

- **Status**: Ready
- **Title**: descriptive custom title that should be ignored
- **Base**: main
- **Created**: 2026-02-17

## Overview

Issue-linked PRs should keep the existing repo title convention.

## Changes

- [ ] convention preserved

## Tests

- [ ] regression covered

## Architecture Diagram

\`\`\`mermaid
flowchart TD
  A[Convention] --> B[Preserved]
\`\`\`

## Related Docs

- Spec: \`docs/features/F001-alpha/spec.md\`
- Tasks: \`docs/features/F001-alpha/tasks.md\`
`;
    await fs.writeFile(prDocPath, prDoc, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      ['github', 'pr', 'F001-alpha', '--create', '--confirm', 'OK', '--json'],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.title, 'feat(#123): alpha (F001-alpha implementation)');

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(log, /--title feat\(#123\): alpha \(F001-alpha implementation\)/);
    assert.doesNotMatch(log, /descriptive custom title that should be ignored/);

    const afterPrDoc = await fs.readFile(prDocPath, 'utf-8');
    assert.match(afterPrDoc, /- \*\*Title\*\*: feat\(#123\): alpha \(F001-alpha implementation\)/);
  });
});

test('github pr --create blocks explicit non-conventional title when issue is linked', async () => {
  await withTempDir('lsk-github-pr-explicit-title-block-', async (dir) => {
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
    const tasksContent = await fs.readFile(tasksPath, 'utf-8');
    await fs.writeFile(
      tasksPath,
      /- \*\*(Issue|이슈)\*\*:\s*/.test(tasksContent)
        ? tasksContent.replace(/^- \*\*(Issue|이슈)\*\*:\s*.*$/m, '- **Issue**: #123')
        : tasksContent.replace(
            '## Local Tracking\n',
            '## Local Tracking\n- **Issue**: #123\n'
          ),
      'utf-8'
    );

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--title',
        'custom descriptive title',
        '--confirm',
        'OK',
        '--json',
      ],
      fakeGh.env
    );
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(payload.error, /PR title must follow the existing convention/);
    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(log, /issue view 123 --json number,state/);
    assert.doesNotMatch(log, /pr create/);
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
}, 15_000);

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

test('github pr --create runs gh from standalone managed worktree when tasks branch exists', async () => {
  await withTempDir('lsk-github-pr-standalone-worktree-cwd-', async (dir) => {
    const projectRoot = path.join(dir, 'project');
    const docsRoot = path.join(dir, 'docs-repo');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(docsRoot, { recursive: true });

    const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
    assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);
    const projectMain = await runCommand(projectRoot, 'git', ['branch', '-M', 'main']);
    assert.equal(projectMain.code, 0, projectMain.stderr || projectMain.stdout);
    const gitUserName = await runCommand(projectRoot, 'git', ['config', 'user.name', 'Test User']);
    assert.equal(gitUserName.code, 0, gitUserName.stderr || gitUserName.stdout);
    const gitUserEmail = await runCommand(projectRoot, 'git', ['config', 'user.email', 'test@example.com']);
    assert.equal(gitUserEmail.code, 0, gitUserEmail.stderr || gitUserEmail.stdout);
    await fs.writeFile(path.join(projectRoot, 'README.md'), '# project\n', 'utf-8');
    const projectAdd = await runCommand(projectRoot, 'git', ['add', 'README.md']);
    assert.equal(projectAdd.code, 0, projectAdd.stderr || projectAdd.stdout);
    const projectCommit = await runCommand(projectRoot, 'git', ['commit', '-m', 'baseline']);
    assert.equal(projectCommit.code, 0, projectCommit.stderr || projectCommit.stdout);

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
      'github',
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

    const tasksPath = path.join(docsRoot, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **Issue**: #', '- **Issue**: #123');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const worktreePath = path.join(docsRoot, '.worktrees', path.basename(projectRoot), 'feat--alpha');
    const addWorktree = await runCommand(projectRoot, 'git', [
      'worktree',
      'add',
      '-b',
      'feat/-alpha',
      worktreePath,
    ]);
    assert.equal(addWorktree.code, 0, addWorktree.stderr || addWorktree.stdout);

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
    const expectedCwd = await normalizePathForCompare(worktreePath);
    assert.deepEqual([...new Set(normalizedInvocations)], [expectedCwd]);
  });
});

test('github pr --create uses Ready pr.md when --body-file is omitted', async () => {
  await withTempDir('lsk-github-pr-create-from-ready-doc-', async (dir) => {
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

    const prDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'pr.md');
    const prDoc = `# PR Draft: alpha

## Metadata

- **Status**: Ready
- **Title**: pr.md title should be used
- **Base**: main
- **Created**: 2026-02-17

## Overview

pr.md custom overview should be used as-is.

## Changes

- [ ] change from pr.md

## Tests

- [ ] test from pr.md

## Architecture Diagram

\`\`\`mermaid
flowchart TD
  A[Input] --> B[Output]
\`\`\`

## Related Docs

- Spec: \`docs/features/F001-alpha/spec.md\`
- Tasks: \`docs/features/F001-alpha/tasks.md\`
`;
    await fs.writeFile(prDocPath, prDoc, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      ['github', 'pr', 'F001-alpha', '--create', '--confirm', 'OK', '--json'],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PR_CREATED_SYNCED');
    assert.notEqual(
      await normalizePathForCompare(payload.bodyFile),
      await normalizePathForCompare(prDocPath)
    );
    assert.equal(payload.title, 'pr.md title should be used');
    assert.match(payload.body, /pr\.md custom overview should be used as-is\./);
    assert.doesNotMatch(payload.body, /^## Metadata$/m);
    assert.doesNotMatch(payload.body, /^- \*\*Status\*\*:/m);
    assert.doesNotMatch(payload.body, /^### Tests Run$/m);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(
      log,
      new RegExp(
        `--body-file ${String(payload.bodyFile).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      )
    );
  });
});

test('github pr --create adds plain close keyword when Ready pr.md only has coded keyword', async () => {
  await withTempDir('lsk-github-pr-create-ready-doc-close-keyword-', async (dir) => {
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

    const fakeGh = await setupFakeGhCli(dir);
    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasksContent = await fs.readFile(tasksPath, 'utf-8');
    const nextTasksContent = /- \*\*(Issue|이슈)\*\*:\s*/.test(tasksContent)
      ? tasksContent.replace(/^- \*\*(Issue|이슈)\*\*:\s*.*$/m, '- **Issue**: #123')
      : tasksContent.replace(
          '## Local Tracking\n',
          '## Local Tracking\n- **Issue**: #123\n'
        );
    await fs.writeFile(
      tasksPath,
      nextTasksContent,
      'utf-8'
    );

    const prDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'pr.md');
    const prDoc = `# PR Draft: alpha

## Metadata

- **Status**: Ready
- **Title**: ready pr.md with coded close keyword
- **Base**: main
- **Created**: 2026-02-17

## Overview

The coded keyword below should not count.

## Changes

- [ ] Implement change
- [ ] \`Closes #123\`

\`\`\`text
Closes #123
\`\`\`

## Tests

- [ ] Add tests

## Architecture Diagram

\`\`\`mermaid
flowchart TD
  A[Start] --> B[Done]
\`\`\`

## Related Docs

- Spec: \`docs/features/F001-alpha/spec.md\`
- Tasks: \`docs/features/F001-alpha/tasks.md\`
`;
    await fs.writeFile(prDocPath, prDoc, 'utf-8');

    const prCreateResult = await runCli(
      dir,
      ['github', 'pr', 'F001-alpha', '--create', '--confirm', 'OK', '--json'],
      fakeGh.env
    );
    assert.equal(prCreateResult.code, 0, prCreateResult.stderr || prCreateResult.stdout);
    const prPayload = JSON.parse(prCreateResult.stdout.trim());
    assert.equal(prPayload.status, 'ok');
    assert.equal(prPayload.reasonCode, 'PR_CREATED_SYNCED');
    assert.equal(prPayload.title, 'feat(#123): alpha (F001-alpha implementation)');
    assert.match(prPayload.body, /\nCloses #123\n$/);

    const normalizedBody = await fs.readFile(prPayload.bodyFile, 'utf-8');
    assert.match(normalizedBody, /\nCloses #123\n$/);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(
      log,
      new RegExp(
        `--body-file ${String(prPayload.bodyFile).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      )
    );
  });
});

test('github pr --create blocks invalid issue references before remote create', async () => {
  await withTempDir('lsk-github-pr-create-invalid-issue-block-', async (dir) => {
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

    const fakeGh = await setupFakeGhCli(dir);
    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasksContent = await fs.readFile(tasksPath, 'utf-8');
    await fs.writeFile(
      tasksPath,
      /- \*\*(Issue|이슈)\*\*:\s*/.test(tasksContent)
        ? tasksContent.replace(/^- \*\*(Issue|이슈)\*\*:\s*.*$/m, '- **Issue**: TBD')
        : tasksContent.replace(
            '## Local Tracking\n',
            '## Local Tracking\n- **Issue**: TBD\n'
          ),
      'utf-8'
    );

    const prCreateResult = await runCli(
      dir,
      ['github', 'pr', 'F001-alpha', '--create', '--confirm', 'OK', '--json'],
      fakeGh.env
    );
    assert.equal(prCreateResult.code, 1);
    const payload = JSON.parse(prCreateResult.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(payload.error, /not a valid github issue reference/i);

    assert.equal(await pathExists(fakeGh.logPath), false);
  });
});

test('github pr --create blocks when referenced issue does not exist remotely', async () => {
  await withTempDir('lsk-github-pr-create-missing-issue-block-', async (dir) => {
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

    const fakeGh = await setupFakeGhCli(dir);
    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    const tasksContent = await fs.readFile(tasksPath, 'utf-8');
    await fs.writeFile(
      tasksPath,
      /- \*\*(Issue|이슈)\*\*:\s*/.test(tasksContent)
        ? tasksContent.replace(/^- \*\*(Issue|이슈)\*\*:\s*.*$/m, '- **Issue**: #999')
        : tasksContent.replace(
            '## Local Tracking\n',
            '## Local Tracking\n- **Issue**: #999\n'
          ),
      'utf-8'
    );

    const prCreateResult = await runCli(
      dir,
      ['github', 'pr', 'F001-alpha', '--create', '--confirm', 'OK', '--json'],
      fakeGh.env
    );
    assert.equal(prCreateResult.code, 1);
    const payload = JSON.parse(prCreateResult.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'PRECONDITION_FAILED');
    assert.match(payload.error, /was not found|not accessible/i);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(log, /issue view 999 --json number,state/);
    assert.doesNotMatch(log, /pr create/);
  });
});

test('github pr --create accepts pr.md via explicit --body-file', async () => {
  await withTempDir('lsk-github-pr-create-explicit-ready-doc-', async (dir) => {
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

    const prDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'pr.md');
    const prDoc = `# PR Draft: alpha

## Metadata

- **Status**: Ready
- **Title**: explicit body-file pr.md title
- **Base**: main
- **Created**: 2026-02-17

## Overview

explicit pr.md body-file overview

## Changes

- [ ] change

## Tests

- [ ] test

## Architecture Diagram

\`\`\`mermaid
flowchart TD
  A[Input] --> B[Output]
\`\`\`

## Related Docs

- Spec: \`docs/features/F001-alpha/spec.md\`
- Tasks: \`docs/features/F001-alpha/tasks.md\`
`;
    await fs.writeFile(prDocPath, prDoc, 'utf-8');

    const fakeGh = await setupFakeGhCli(dir);
    const result = await runCli(
      dir,
      [
        'github',
        'pr',
        'F001-alpha',
        '--create',
        '--body-file',
        prDocPath,
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
    assert.notEqual(
      await normalizePathForCompare(payload.bodyFile),
      await normalizePathForCompare(prDocPath)
    );
    assert.match(payload.body, /explicit pr\.md body-file overview/i);
    assert.doesNotMatch(payload.body, /^## Metadata$/m);
    assert.doesNotMatch(payload.body, /^- \*\*Status\*\*:/m);

    const log = await fs.readFile(fakeGh.logPath, 'utf-8');
    assert.match(
      log,
      new RegExp(
        `--body-file ${String(payload.bodyFile).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      )
    );
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

test('github pr --create accepts mermaid heading with qualifier text', async () => {
  await withTempDir('lsk-github-pr-mermaid-heading-qualifier-', async (dir) => {
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

    const bodyFile = path.join(dir, 'tmp-pr-body-mermaid-qualified-heading.md');
    await writePrBodyWithoutTodo(bodyFile);
    const originalBody = await fs.readFile(bodyFile, 'utf-8');
    const qualifiedHeadingBody = originalBody.replace(
      /^## Architecture Diagram$/m,
      '## Architecture Diagram (Backend / core structure changes)'
    );
    await fs.writeFile(bodyFile, qualifiedHeadingBody, 'utf-8');

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
        '--mermaid',
        'on',
        '--json',
      ],
      fakeGh.env
    );

    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'PR_CREATED_SYNCED');
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

test('github pr --merge treats already-merged remote state as success', async () => {
  await withTempDir('lsk-github-pr-merge-already-merged-success-', async (dir) => {
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
    await setupLocalOriginRemote(dir);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **PR**: -', '- **PR**: https://github.com/acme/repo/pull/77');
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const fakeGh = await setupMergeGhCli(dir, {
      mergeCode: 1,
      mergeStderr: 'GraphQL: Pull request is already merged',
      state: 'MERGED',
      mergedAt: '2026-02-17T08:51:35Z',
      baseRefName: 'main',
    });

    const result = await runCli(
      dir,
      ['github', 'pr', 'F001-alpha', '--merge', '--confirm', 'OK', '--json'],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.merged, true);
    assert.equal(payload.mergeAlreadyMerged, true);

    const after = await fs.readFile(tasksPath, 'utf-8');
    assert.match(after, /- \*\*PR Status\*\*: Approved/);
  });
});

test('github pr --merge leaves post-merge cleanup to the workflow cleanup stage', async () => {
  await withTempDir('lsk-github-pr-merge-cleanup-stage-', async (dir) => {
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
    await setupLocalOriginRemote(dir);

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    let tasks = await fs.readFile(tasksPath, 'utf-8');
    tasks = tasks.replace('- **PR**: -', '- **PR**: https://github.com/acme/repo/pull/77');
    tasks = tasks.replace('- **PR Status**: -', '- **PR Status**: Review');
    await fs.writeFile(tasksPath, tasks, 'utf-8');

    const fakeGh = await setupMergeGhCli(dir, {
      mergeCode: 0,
      state: 'MERGED',
      mergedAt: '2026-02-17T08:51:35Z',
      baseRefName: 'definitely-missing-base-branch',
    });

    const result = await runCli(
      dir,
      ['github', 'pr', 'F001-alpha', '--merge', '--confirm', 'OK', '--json'],
      fakeGh.env
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.merged, true);
    assert.equal(payload.postMergeWarnings, undefined);

    const after = await fs.readFile(tasksPath, 'utf-8');
    assert.match(after, /- \*\*PR Status\*\*: Approved/);
  });
});

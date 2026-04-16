import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  runCommand,
  setFeatureAsDone,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

test('workflow-audit reports docs sync required when code changes exist without feature-doc updates', async () => {
  await withTempDir('lsk-workflow-audit-sync-', async (dir) => {
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
    assert.equal(
      featureResult.code,
      0,
      featureResult.stderr || featureResult.stdout
    );

    const srcDir = path.join(dir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'demo.ts'), 'export const demo = 1;\n');

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(
      auditResult.code,
      0,
      auditResult.stderr || auditResult.stdout
    );

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'needs_sync');
    assert.equal(payload.reasonCode, 'CODE_WITHOUT_DOCS_SYNC');
  });
});

test('workflow-audit ignores untouched canonical feature docs even if their mtime changes', async () => {
  await withTempDir('lsk-workflow-audit-touch-only-', async (dir) => {
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

    const srcDir = path.join(dir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'demo.ts'), 'export const demo = 1;\n');

    const specPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'spec.md');
    const now = new Date();
    await fs.utimes(specPath, now, now);

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'needs_sync');
    assert.equal(payload.reasonCode, 'CODE_WITHOUT_DOCS_SYNC');
  });
});

test('workflow-audit only accepts docs sync from the active feature scope', async () => {
  await withTempDir('lsk-workflow-audit-active-feature-', async (dir) => {
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

    const alphaResult = await runCli(dir, [
      'feature',
      'alpha',
      '--id',
      'F001',
      '--non-interactive',
    ]);
    assert.equal(alphaResult.code, 0, alphaResult.stderr || alphaResult.stdout);

    const betaResult = await runCli(dir, [
      'feature',
      'beta',
      '--id',
      'F002',
      '--non-interactive',
    ]);
    assert.equal(betaResult.code, 0, betaResult.stderr || betaResult.stdout);

    await setFeatureAsDone(dir, 'F002-beta');

    const srcDir = path.join(dir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'demo.ts'), 'export const demo = 1;\n');
    await fs.appendFile(
      path.join(dir, 'docs', 'features', 'F002-beta', 'tasks.md'),
      '\n<!-- touched unrelated feature docs -->\n',
      'utf-8'
    );

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'needs_sync');
    assert.equal(payload.reasonCode, 'ACTIVE_FEATURE_SCOPE_UNCLEAR');
    assert.equal(payload.activeFeatureRef, null);
    assert.equal(payload.changedFeatureDocPaths.includes('docs/features/F002-beta/tasks.md'), true);
  });
}, 15000);

test('workflow-audit in standalone uses projectRoot code changes from workspace root', async () => {
  await withTempDir('lsk-workflow-audit-standalone-workspace-', async (dir) => {
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

    const srcDir = path.join(projectRoot, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'demo.ts'), 'export const demo = 1;\n');

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'needs_sync');
    assert.equal(payload.reasonCode, 'CODE_WITHOUT_DOCS_SYNC');
    assert.equal(payload.activeFeatureRef, 'F001-alpha');
    assert.equal(payload.changedCodePaths.includes('src/demo.ts'), true);
  });
});

test('workflow-audit in standalone multi fails closed when another component repo is dirty outside the active feature scope', async () => {
  await withTempDir('lsk-workflow-audit-standalone-multi-out-of-scope-', async (dir) => {
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

    await fs.writeFile(path.join(webRoot, 'index.ts'), 'export const web = 1;\n');

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'needs_sync');
    assert.equal(payload.reasonCode, 'ACTIVE_FEATURE_SCOPE_UNCLEAR');
    assert.equal(payload.changedCodePaths.includes('index.ts'), true);
  });
});

test('workflow-audit treats .cjs code changes as requiring docs sync', async () => {
  await withTempDir('lsk-workflow-audit-cjs-', async (dir) => {
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

    await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(dir, 'scripts', 'demo.cjs'), 'module.exports = 1;\n');

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'needs_sync');
    assert.equal(payload.reasonCode, 'CODE_WITHOUT_DOCS_SYNC');
    assert.equal(payload.changedCodePaths.includes('scripts/demo.cjs'), true);
  });
});

test('workflow-audit in standalone accepts newer active feature docs from separate docs repo', async () => {
  await withTempDir('lsk-workflow-audit-standalone-docs-sync-', async (dir) => {
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

    const srcDir = path.join(projectRoot, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'demo.ts'), 'export const demo = 1;\n');

    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.appendFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      `\n- [ ] Sync note\n<!-- lee-spec-kit:workflow-sync ${new Date().toISOString()} -->\n`,
      'utf-8'
    );

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'WORKFLOW_IN_SYNC');
    assert.equal(payload.activeFeatureRef, 'F001-alpha');
  });
});

test('workflow-audit requires an explicit workflow-sync marker even when active feature docs changed', async () => {
  await withTempDir('lsk-workflow-audit-sync-marker-required-', async (dir) => {
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

    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'demo.ts'), 'export const demo = 1;\n');
    await fs.appendFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      '\n- [ ] Changed without sync marker\n',
      'utf-8'
    );

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'needs_sync');
    assert.equal(payload.reasonCode, 'CODE_WITHOUT_DOCS_SYNC');
  });
});

test('workflow-audit ignores future workflow-sync markers', async () => {
  await withTempDir('lsk-workflow-audit-future-sync-marker-', async (dir) => {
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

    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'demo.ts'), 'export const demo = 1;\n');
    const futureMarker = new Date(Date.now() + 30_000).toISOString();
    await fs.appendFile(
      path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md'),
      `\n<!-- lee-spec-kit:workflow-sync ${futureMarker} -->\n`,
      'utf-8'
    );

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'needs_sync');
    assert.equal(payload.reasonCode, 'CODE_WITHOUT_DOCS_SYNC');
    assert.equal(payload.latestFeatureDocSyncAt, null);
  });
});

test('workflow-audit does not treat later tracked-doc edits as sync without a newer workflow-sync marker', async () => {
  await withTempDir('lsk-workflow-audit-tracked-doc-without-new-marker-', async (dir) => {
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

    const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
    await fs.appendFile(
      tasksPath,
      '\n<!-- lee-spec-kit:workflow-sync 2026-04-16T00:00:00.000Z -->\n',
      'utf-8'
    );

    const addResult = await runCommand(dir, 'git', ['add', '.']);
    assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);
    const commitResult = await runCommand(dir, 'git', [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'baseline',
    ]);
    assert.equal(commitResult.code, 0, commitResult.stderr || commitResult.stdout);

    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'demo.ts'), 'export const demo = 1;\n');
    await fs.appendFile(tasksPath, '\n- [ ] unrelated tracked doc edit\n', 'utf-8');

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'needs_sync');
    assert.equal(payload.reasonCode, 'CODE_WITHOUT_DOCS_SYNC');
  });
});

test('workflow-audit in standalone fails closed when workspaceRoot is missing from config', async () => {
  await withTempDir('lsk-workflow-audit-standalone-missing-workspace-root-', async (dir) => {
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
    delete config.workspaceRoot;
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'STANDALONE_WORKSPACE_ROOT_REQUIRED');
  });
});

test('workflow-audit in standalone fails closed when workspaceRoot points into the project repo', async () => {
  await withTempDir('lsk-workflow-audit-standalone-invalid-workspace-root-', async (dir) => {
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

    const auditResult = await runCli(dir, ['workflow-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'error');
    assert.equal(payload.reasonCode, 'STANDALONE_WORKSPACE_ROOT_REQUIRED');
  });
});

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  runCommand,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

async function initRepo(dir) {
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

  const gitUserName = await runCommand(dir, 'git', ['config', 'user.name', 'Test User']);
  assert.equal(gitUserName.code, 0, gitUserName.stderr || gitUserName.stdout);
  const gitUserEmail = await runCommand(dir, 'git', ['config', 'user.email', 'test@example.com']);
  assert.equal(gitUserEmail.code, 0, gitUserEmail.stderr || gitUserEmail.stdout);
}

async function initStandaloneRepo(dir) {
  const projectRoot = path.join(dir, 'project');
  await fs.mkdir(projectRoot, { recursive: true });

  const projectGitInit = await runCommand(projectRoot, 'git', ['init']);
  assert.equal(projectGitInit.code, 0, projectGitInit.stderr || projectGitInit.stdout);
  const gitUserName = await runCommand(projectRoot, 'git', ['config', 'user.name', 'Test User']);
  assert.equal(gitUserName.code, 0, gitUserName.stderr || gitUserName.stdout);
  const gitUserEmail = await runCommand(projectRoot, 'git', ['config', 'user.email', 'test@example.com']);
  assert.equal(gitUserEmail.code, 0, gitUserEmail.stderr || gitUserEmail.stdout);
  await fs.writeFile(path.join(projectRoot, 'README.md'), '# project\n', 'utf-8');
  const projectAdd = await runCommand(projectRoot, 'git', ['add', 'README.md']);
  assert.equal(projectAdd.code, 0, projectAdd.stderr || projectAdd.stdout);
  const projectCommit = await runCommand(projectRoot, 'git', ['commit', '-m', 'baseline']);
  assert.equal(projectCommit.code, 0, projectCommit.stderr || projectCommit.stdout);

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

  const commitDocs = await runCommand(path.join(dir, 'docs'), 'git', ['add', '.']);
  assert.equal(commitDocs.code, 0, commitDocs.stderr || commitDocs.stdout);
  const commitDocsResult = await runCommand(path.join(dir, 'docs'), 'git', ['commit', '-m', 'baseline']);
  assert.equal(commitDocsResult.code, 0, commitDocsResult.stderr || commitDocs.stdout);

  return { projectRoot };
}

async function stage(dir, relativePath) {
  const addResult = await runCommand(dir, 'git', ['add', relativePath]);
  assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);
}

async function setIssueReference(dir, issueRef = '#123') {
  const tasksPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'tasks.md');
  const tasksContent = await fs.readFile(tasksPath, 'utf-8');
  const nextContent = /- \*\*(Issue|이슈)\*\*:\s*/.test(tasksContent)
    ? tasksContent.replace(/^- \*\*(Issue|이슈)\*\*:\s*.*$/m, `- **Issue**: ${issueRef}`)
    : tasksContent.replace(
        '## Local Tracking\n',
        `## Local Tracking\n- **Issue**: ${issueRef}\n`
      );
  await fs.writeFile(tasksPath, nextContent, 'utf-8');
}

test('commit-audit blocks staged unmanaged top-level docs entries by default', async () => {
  await withTempDir('lsk-commit-audit-unmanaged-', async (dir) => {
    await initRepo(dir);

    await fs.mkdir(path.join(dir, 'docs', 'plans'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'plans', 'external-plan.md'),
      '# External plan\n',
      'utf-8'
    );
    await stage(dir, 'docs/plans/external-plan.md');

    const auditResult = await runCli(dir, ['commit-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'blocked');
    assert.equal(payload.reasonCode, 'UNMANAGED_DOCS_COMMIT');
    assert.equal(payload.blockedPaths.includes('docs/plans/external-plan.md'), true);
  });
});

test('commit-audit allows staged top-level docs entries when allowlisted in config', async () => {
  await withTempDir('lsk-commit-audit-allowlisted-', async (dir) => {
    await initRepo(dir);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.allowedDocsEntries = { dirs: ['plans'] };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    await fs.mkdir(path.join(dir, 'docs', 'plans'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'plans', 'external-plan.md'),
      '# External plan\n',
      'utf-8'
    );
    await stage(dir, 'docs/plans/external-plan.md');

    const auditResult = await runCli(dir, ['commit-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.deepEqual(payload.blockedPaths, []);
  });
});

test('commit-audit allows staged top-level docs files when allowlisted in config', async () => {
  await withTempDir('lsk-commit-audit-allowlisted-file-', async (dir) => {
    await initRepo(dir);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.allowedDocsEntries = { files: ['overview.md'] };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    await fs.writeFile(path.join(dir, 'docs', 'overview.md'), '# Overview\n', 'utf-8');
    await stage(dir, 'docs/overview.md');

    const auditResult = await runCli(dir, ['commit-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.deepEqual(payload.blockedPaths, []);
  });
});

test('commit-audit allows mixed top-level docs dirs and files when both are allowlisted', async () => {
  await withTempDir('lsk-commit-audit-allowlisted-mixed-', async (dir) => {
    await initRepo(dir);

    const configPath = path.join(dir, 'docs', '.lee-spec-kit.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config.allowedDocsEntries = {
      dirs: ['plans'],
      files: ['overview.md'],
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    await fs.mkdir(path.join(dir, 'docs', 'plans'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docs', 'plans', 'external-plan.md'),
      '# External plan\n',
      'utf-8'
    );
    await fs.writeFile(path.join(dir, 'docs', 'overview.md'), '# Overview\n', 'utf-8');
    await stage(dir, 'docs/plans/external-plan.md');
    await stage(dir, 'docs/overview.md');

    const auditResult = await runCli(dir, ['commit-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.deepEqual(payload.blockedPaths, []);
  });
});

test('commit-audit blocks staged non-canonical feature docs files', async () => {
  await withTempDir('lsk-commit-audit-feature-extra-', async (dir) => {
    await initRepo(dir);

    const extraDocPath = path.join(
      dir,
      'docs',
      'features',
      'F001-alpha',
      'research.md'
    );
    await fs.writeFile(extraDocPath, '# Research\n', 'utf-8');
    await stage(dir, 'docs/features/F001-alpha/research.md');

    const auditResult = await runCli(dir, ['commit-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'blocked');
    assert.equal(payload.reasonCode, 'NON_CANONICAL_FEATURE_DOC_COMMIT');
    assert.equal(payload.blockedPaths.includes('docs/features/F001-alpha/research.md'), true);
  });
});

test('commit-audit blocks staged deletions of canonical feature docs', async () => {
  await withTempDir('lsk-commit-audit-feature-delete-', async (dir) => {
    await initRepo(dir);

    const commitAll = await runCommand(dir, 'git', ['add', '.']);
    assert.equal(commitAll.code, 0, commitAll.stderr || commitAll.stdout);
    const baselineCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'baseline',
    ]);
    assert.equal(
      baselineCommit.code,
      0,
      baselineCommit.stderr || baselineCommit.stdout
    );

    const addResult = await runCommand(dir, 'git', [
      'rm',
      '-f',
      'docs/features/F001-alpha/tasks.md',
    ]);
    assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);

    const auditResult = await runCli(dir, ['commit-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'blocked');
    assert.equal(payload.reasonCode, 'CANONICAL_FEATURE_DOC_DELETION');
    assert.equal(
      payload.blockedPaths.includes('docs/features/F001-alpha/tasks.md'),
      true
    );
  });
});

test('commit-audit allows standalone managed worktree project commits from the shared workspace', async () => {
  await withTempDir('lsk-commit-audit-standalone-worktree-', async (dir) => {
    const { projectRoot } = await initStandaloneRepo(dir);
    await setIssueReference(dir, '#123');

    const worktreePath = path.join(
      dir,
      '.worktrees',
      path.basename(projectRoot),
      'feat-123-alpha'
    );
    const addWorktree = await runCommand(projectRoot, 'git', [
      'worktree',
      'add',
      '-b',
      'feat/123-alpha',
      worktreePath,
    ]);
    assert.equal(addWorktree.code, 0, addWorktree.stderr || addWorktree.stdout);

    await fs.writeFile(path.join(worktreePath, 'README.md'), '# project\n\nchange\n', 'utf-8');
    const addResult = await runCommand(worktreePath, 'git', ['add', 'README.md']);
    assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);

    const auditResult = await runCli(dir, [
      'commit-audit',
      '--json',
      '--git-root',
      worktreePath,
      '--message',
      'feat(#123): update standalone worktree change',
    ]);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'COMMIT_ALLOWED');
  });
});

test('commit-audit blocks staged extensionless feature files', async () => {
  await withTempDir('lsk-commit-audit-feature-extensionless-', async (dir) => {
    await initRepo(dir);

    const extraDocPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'research');
    await fs.writeFile(extraDocPath, 'notes\n', 'utf-8');
    await stage(dir, 'docs/features/F001-alpha/research');

    const auditResult = await runCli(dir, ['commit-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'blocked');
    assert.equal(payload.reasonCode, 'NON_CANONICAL_FEATURE_DOC_COMMIT');
    assert.equal(payload.blockedPaths.includes('docs/features/F001-alpha/research'), true);
  });
});

test('commit-audit blocks renaming canonical feature docs away from their original file', async () => {
  await withTempDir('lsk-commit-audit-feature-rename-', async (dir) => {
    await initRepo(dir);

    const commitAll = await runCommand(dir, 'git', ['add', '.']);
    assert.equal(commitAll.code, 0, commitAll.stderr || commitAll.stdout);
    const baselineCommit = await runCommand(dir, 'git', [
      'commit',
      '-m',
      'baseline',
    ]);
    assert.equal(
      baselineCommit.code,
      0,
      baselineCommit.stderr || baselineCommit.stdout
    );

    const renameResult = await runCommand(dir, 'git', [
      'mv',
      'docs/features/F001-alpha/spec.md',
      'docs/features/F001-alpha/issue.md',
    ]);
    assert.equal(renameResult.code, 0, renameResult.stderr || renameResult.stdout);

    const auditResult = await runCli(dir, ['commit-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'blocked');
    assert.equal(payload.reasonCode, 'CANONICAL_FEATURE_DOC_DELETION');
    assert.equal(payload.blockedPaths.includes('docs/features/F001-alpha/spec.md'), true);
  });
});

test('commit-audit allows issue-scoped project commit subjects for code changes', async () => {
  await withTempDir('lsk-commit-audit-project-message-', async (dir) => {
    await initRepo(dir);
    await setIssueReference(dir);

    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'export const alpha = true;\n', 'utf-8');
    await stage(dir, 'src/index.ts');

    const auditResult = await runCli(dir, [
      'commit-audit',
      '--json',
      '--message',
      'feat(#123): implement alpha shell',
    ]);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'COMMIT_ALLOWED');
  });
});

test('commit-audit blocks non-issue-scoped project commit subjects', async () => {
  await withTempDir('lsk-commit-audit-project-message-block-', async (dir) => {
    await initRepo(dir);
    await setIssueReference(dir);

    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'export const alpha = true;\n', 'utf-8');
    await stage(dir, 'src/index.ts');

    const auditResult = await runCli(dir, [
      'commit-audit',
      '--json',
      '--message',
      'fix(pr#86): tighten follow-up',
    ]);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'blocked');
    assert.equal(payload.reasonCode, 'COMMIT_MESSAGE_POLICY_VIOLATION');
    assert.equal(payload.blockedPaths.includes('(commit message)'), true);
  });
});

test('commit-audit allows issue-scoped docs commit subjects for docs-only changes', async () => {
  await withTempDir('lsk-commit-audit-docs-message-', async (dir) => {
    await initRepo(dir);
    await setIssueReference(dir);

    const decisionsPath = path.join(dir, 'docs', 'features', 'F001-alpha', 'decisions.md');
    await fs.appendFile(decisionsPath, '\n- follow-up note\n', 'utf-8');
    await stage(dir, 'docs/features/F001-alpha/decisions.md');

    const auditResult = await runCli(dir, [
      'commit-audit',
      '--json',
      '--message',
      'docs(#123): F001-alpha 문서 업데이트',
    ]);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);

    const payload = JSON.parse(auditResult.stdout.trim());
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'COMMIT_ALLOWED');
  });
});

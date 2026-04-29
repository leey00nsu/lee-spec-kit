import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

test('isRegisteredGitWorktree reuses git worktree list output per project root', async () => {
  const previousPath = process.env.PATH;

  await withTempDir('lsk-worktree-cache-', async (dir) => {
    const binDir = path.join(dir, 'bin');
    const projectRoot = path.join(dir, 'project');
    const worktreePath = path.join(dir, 'worktrees', 'feature-a');
    const countPath = path.join(dir, 'count.txt');
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.writeFile(countPath, '0', 'utf-8');

    const gitScript = path.join(binDir, 'git');
    await fs.writeFile(
      gitScript,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const countPath = ${JSON.stringify(countPath)};
const worktreePath = ${JSON.stringify(worktreePath)};

if (args.join(' ') === 'worktree list --porcelain') {
  const count = Number(fs.readFileSync(countPath, 'utf-8')) + 1;
  fs.writeFileSync(countPath, String(count));
  process.stdout.write('worktree ' + worktreePath + '\\nHEAD abc123\\nbranch refs/heads/feature-a\\n');
  process.exit(0);
}

process.exit(1);
`,
      'utf-8'
    );
    await fs.chmod(gitScript, 0o755);

    process.env.PATH = `${binDir}${path.delimiter}${previousPath || ''}`;
    const { isRegisteredGitWorktree } = await import('../src/utils/standalone-workspace.ts');

    assert.equal(isRegisteredGitWorktree(projectRoot, worktreePath), true);
    assert.equal(isRegisteredGitWorktree(projectRoot, worktreePath), true);
    assert.equal(isRegisteredGitWorktree(projectRoot, path.join(dir, 'missing')), false);
    assert.equal(await fs.readFile(countPath, 'utf-8'), '1');
  });

  process.env.PATH = previousPath;
});

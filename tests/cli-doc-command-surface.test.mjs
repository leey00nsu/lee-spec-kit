import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const supportedRootCommands = new Set([
  'commit-audit',
  'config',
  'decision',
  'detect',
  'docs',
  'docs-audit',
  'feature',
  'github',
  'help',
  'idea',
  'init',
  'integrations',
  'local',
  'task',
  'update',
  'workflow-audit',
  'workflow-stage',
]);

const cliInvocationPattern = /\bnpx\s+lee-spec-kit\s+([a-z][a-z-]*)\b/g;
const retiredCommandPattern =
  /`(onboard|status|context|doctor|view)\s+--[a-z-]+/g;

const docRoots = [
  'README.md',
  'README.en.md',
  'errors.md',
  'docs/reference',
  'templates/en',
  'templates/ko',
];

async function collectMarkdownFiles(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const stats = await fs.stat(absolutePath);
  if (stats.isFile()) {
    return absolutePath.endsWith('.md') ? [absolutePath] : [];
  }

  const files = [];
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await collectMarkdownFiles(path.relative(repoRoot, child)))
      );
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(child);
    }
  }
  return files;
}

test('current docs and templates do not reference retired lee-spec-kit commands', async () => {
  const files = (
    await Promise.all(docRoots.map((root) => collectMarkdownFiles(root)))
  ).flat();

  const violations = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const relativePath = path.relative(repoRoot, file);
    for (const match of content.matchAll(cliInvocationPattern)) {
      if (!supportedRootCommands.has(match[1])) {
        violations.push(`${relativePath}: ${match[0]}`);
      }
    }
    for (const match of content.matchAll(retiredCommandPattern)) {
      violations.push(`${relativePath}: ${match[0]}`);
    }
  }

  assert.deepEqual(violations, []);
});

import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  knowledgeEntrypointSource,
  isKnowledgeChange,
} from '../src/utils/knowledge-scope.js';

it('excludes only complete owned blocks from Knowledge source', () => {
  const tool = '<!-- lee-spec-kit:begin -->\nrule\n<!-- lee-spec-kit:end -->';
  const wiki = '<!-- OPENWIKI:START -->\nwiki\n<!-- OPENWIKI:END -->';
  expect(knowledgeEntrypointSource(`${tool}\n${wiki}\nHuman rule`)).toBe(
    'Human rule'
  );
  expect(
    knowledgeEntrypointSource('<!-- lee-spec-kit:begin -->\nHuman rule')
  ).toContain('Human rule');
});

it('uses staged block changes, preserving partial staging and deletion detection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsk-knowledge-scope-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  const wiki = '<!-- OPENWIKI:START -->\nwiki\n<!-- OPENWIKI:END -->';
  try {
    git('init');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), `Human\n${wiki}`);
    git('add', '.');
    git('commit', '-m', 'initial');
    fs.writeFileSync(
      path.join(root, 'AGENTS.md'),
      `Different human rule\n${wiki}`
    );
    git('add', '.');
    expect(isKnowledgeChange(root, 'AGENTS.md')).toBe(false);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Different human rule');
    expect(isKnowledgeChange(root, 'AGENTS.md')).toBe(false);
    expect(isKnowledgeChange(root, 'AGENTS.md', 'index', 'worktree')).toBe(
      true
    );
    git('add', '.');
    expect(isKnowledgeChange(root, 'AGENTS.md')).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

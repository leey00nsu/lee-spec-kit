import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { areChangesOpenWikiOnly } from '../src/utils/openwiki-policy.js';

test('recognizes only OpenWiki output and managed agent-file block edits', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lsk-openwiki-policy-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
      cwd: root,
    });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
    writeFileSync(
      path.join(root, 'AGENTS.md'),
      '# Project rules\n<!-- OPENWIKI:START -->\nold\n<!-- OPENWIKI:END -->\n'
    );
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: root });

    mkdirSync(path.join(root, 'openwiki'), { recursive: true });
    writeFileSync(path.join(root, 'openwiki', '구조 설명.md'), '# generated\n');
    writeFileSync(
      path.join(root, 'AGENTS.md'),
      '# Project rules\n<!-- OPENWIKI:START -->\nnew\n<!-- OPENWIKI:END -->\n'
    );
    expect(areChangesOpenWikiOnly(root)).toBe(true);

    writeFileSync(
      path.join(root, 'AGENTS.md'),
      '# Changed project rules\n<!-- OPENWIKI:START -->\nnew\n<!-- OPENWIKI:END -->\n'
    );
    expect(areChangesOpenWikiOnly(root)).toBe(false);

    execFileSync('git', ['restore', 'AGENTS.md'], { cwd: root });
    writeFileSync(
      path.join(root, 'CLAUDE.md'),
      '\n<!-- OPENWIKI:START -->\nnew\n<!-- OPENWIKI:END -->\n'
    );
    expect(areChangesOpenWikiOnly(root)).toBe(true);
    writeFileSync(
      path.join(root, 'CLAUDE.md'),
      '# Human policy\n<!-- OPENWIKI:START -->\nnew\n<!-- OPENWIKI:END -->\n'
    );
    expect(areChangesOpenWikiOnly(root)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

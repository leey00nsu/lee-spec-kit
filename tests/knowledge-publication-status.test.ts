import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readKnowledgePublicationStatus } from '../src/utils/knowledge-publication.js';

test('publication status requires matching live ownership and never rewrites saved evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsk-status-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    const runtime = path.join(
      root,
      '.git',
      'lee-spec-kit.runtime',
      'knowledge'
    );
    fs.mkdirSync(runtime, { recursive: true });
    const statusPath = path.join(runtime, 'status.json');
    const lockPath = path.join(runtime, 'publish.lock');
    const owner = { pid: process.pid, nonce: 'active-owner' };
    fs.writeFileSync(lockPath, JSON.stringify(owner));
    for (const [record, expected] of [
      [
        { status: 'running', pid: process.pid, lockNonce: owner.nonce },
        'running',
      ],
      [
        { status: 'running', pid: process.pid, lockNonce: 'previous-owner' },
        'interrupted',
      ],
      [
        { status: 'running', pid: 2147483647, lockNonce: owner.nonce },
        'interrupted',
      ],
      [{ status: 'running' }, 'unknown'],
      [{ status: 'published' }, 'published'],
      [{ status: 'failed' }, 'failed'],
      [{ status: 'interrupted' }, 'interrupted'],
    ] as const) {
      const raw = JSON.stringify({
        updatedAt: new Date().toISOString(),
        ...record,
      });
      fs.writeFileSync(statusPath, raw);
      expect((await readKnowledgePublicationStatus(root)).status).toBe(
        expected
      );
      expect(fs.readFileSync(statusPath, 'utf8')).toBe(raw);
    }
    fs.writeFileSync(
      statusPath,
      JSON.stringify({
        status: 'running',
        pid: process.pid,
        lockNonce: owner.nonce,
        updatedAt: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    expect((await readKnowledgePublicationStatus(root)).status).toBe('unknown');
    fs.writeFileSync(statusPath, JSON.stringify({ status: 'running' }));
    fs.unlinkSync(lockPath);
    expect((await readKnowledgePublicationStatus(root)).status).toBe(
      'interrupted'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

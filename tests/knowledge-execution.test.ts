import { test, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  KnowledgeExecution,
  safeKnowledgeText,
  describeKnowledgeValidation,
} from '../src/utils/knowledge-execution.js';

test('execution history retains every attempt regardless of elapsed time', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsk-execution-'));
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const execution = new KnowledgeExecution(root, 1000);
    execution.attempt = 1;
    execution.runId = 'run-1';
    execution.event('validation_failed', {
      code: 'OPENWIKI_OUTPUT_INVALID',
      message: 'Stale evidence',
    });
    now.mockReturnValue(1000 + 24 * 60 * 60 * 1000);
    execution.attempt = 2;
    execution.runId = 'run-2';
    expect(() => execution.checkInterrupted()).not.toThrow();
    execution.event('generation');
    const events = fs
      .readFileSync(execution.diagnosticsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events[1]).toMatchObject({
      attempt: 1,
      runId: 'run-1',
      stage: 'validation_failed',
    });
    expect(events[2]).toMatchObject({ attempt: 2, runId: 'run-2' });
  } finally {
    now.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('external cancellation between attempts prevents another generation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsk-cancel-'));
  try {
    const controller = new AbortController();
    const execution = new KnowledgeExecution(
      root,
      Date.now(),
      undefined,
      controller.signal
    );
    execution.attempt = 1;
    execution.event('validation_failed', { message: 'Stale evidence' });
    controller.abort();
    expect(() => execution.checkInterrupted()).toThrow(/interrupted/u);
    expect(execution.attempt).toBe(1);
    expect(fs.readFileSync(execution.diagnosticsPath, 'utf8')).toContain(
      'Stale evidence'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validation summaries omit prose excerpts and arbitrary provider payloads', () => {
  const summary = describeKnowledgeValidation({
    details: {
      validation: 'document_repair',
      diagnostics: [
        {
          details: {
            validation: 'writing_style',
            violations: [
              {
                path: 'openwiki/page.md',
                line: 3,
                excerpt: 'private prompt text',
              },
            ],
            prompt: 'private prompt text',
          },
        },
        {
          message: 'Stale evidence in page claims',
          details: {
            paths: ['README.md', 'openwiki/.claims/page.json'],
            stdout: 'private provider output',
          },
        },
      ],
    },
  });
  expect(summary.paths).toEqual([
    'openwiki/page.md',
    'README.md',
    'openwiki/.claims/page.json',
  ]);
  expect(JSON.stringify(summary)).not.toMatch(/private|prompt|stdout/u);
});

test('diagnostic text redacts credentials, bearer tokens, and remote URLs', () => {
  vi.stubEnv('TEST_KNOWLEDGE_API_KEY', 'fixture-sensitive-credential');
  try {
    const safe = safeKnowledgeText(
      'fixture-sensitive-credential Bearer abc123 https://user:pass@example.test/path?token=secret sk-testKey123'
    );
    expect(safe).not.toMatch(/fixture-sensitive|abc123|user:pass|testKey123/u);
  } finally {
    vi.unstubAllEnvs();
  }
});

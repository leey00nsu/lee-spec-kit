import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  ensureOpenWikiWritingInstructions,
  inspectOpenWikiMarkdownStyle,
  OPENWIKI_WRITING_POLICY_BEGIN,
  OPENWIKI_WRITING_POLICY_END,
  resolveOpenWikiConfigDir,
  type ResolvedOpenWikiWritingPolicy,
} from '../../utils/openwiki-writing.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenWiki writing config path resolution', () => {
  it('expands slash and backslash home-relative paths', () => {
    expect(resolveOpenWikiConfigDir('/workspace', '~/openwiki-test')).toBe(
      path.join(os.homedir(), 'openwiki-test')
    );
    expect(resolveOpenWikiConfigDir('/workspace', '~\\openwiki-test')).toBe(
      path.join(os.homedir(), 'openwiki-test')
    );
  });

  it('resolves relative paths once from the caller directory', () => {
    expect(resolveOpenWikiConfigDir('/workspace/docs', '../config')).toBe(
      path.resolve('/workspace/docs', '../config')
    );
  });

  it('preserves an instruction edit made while a managed update is prepared', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'lsk-openwiki-instructions-race-')
    );
    const instructionsPath = path.join(directory, 'INSTRUCTIONS.md');
    const original = '# Project instructions\n';
    const concurrent = '# Concurrent project edit\n';
    await fs.writeFile(instructionsPath, original, 'utf-8');
    const managedBlock = `${OPENWIKI_WRITING_POLICY_BEGIN}\nUse the managed skill.\n${OPENWIKI_WRITING_POLICY_END}`;
    const policy: ResolvedOpenWikiWritingPolicy = {
      bundlePath: '/unused',
      managedBlock,
      policyHash: 'sha256:policy',
      inspectMarkdown: () => [],
      receipt: {
        adapterId: 'test',
        adapterVersion: '1',
        skillName: 'test-writing',
        skillHash: 'sha256:skill',
        instructionHash: 'sha256:instructions',
      },
    };
    const originalWriteFile = fs.writeFile.bind(fs) as (
      ...args: unknown[]
    ) => Promise<void>;
    let injected = false;
    vi.spyOn(fs, 'writeFile').mockImplementation((async (
      ...args: unknown[]
    ) => {
      await originalWriteFile(...args);
      const target = String(args[0]);
      if (
        !injected &&
        path.basename(target).startsWith('.INSTRUCTIONS.md.') &&
        target.endsWith('.tmp')
      ) {
        injected = true;
        await originalWriteFile(instructionsPath, concurrent, 'utf-8');
      }
    }) as typeof fs.writeFile);

    try {
      await expect(
        ensureOpenWikiWritingInstructions(
          instructionsPath,
          '# Default\n',
          policy
        )
      ).rejects.toMatchObject({
        code: 'OPENWIKI_PROTECTED_CONTENT_CHANGED',
      });
      expect(await fs.readFile(instructionsPath, 'utf-8')).toBe(concurrent);
    } finally {
      await fs.remove(directory);
    }
  });
});

describe('OpenWiki writing adapter', () => {
  it('accepts the Korean reader voice and ignores literal examples', () => {
    const markdown = `---
type: how-to
description: 실패한 작업을 안전하게 다시 처리해요.
---

# 실패한 작업 다시 처리하기

먼저 작업 상태를 확인하세요. 리스가 끝났다면 다른 워커가 이어받을 수 있어요.

> runtime: 작업을 처리한다.

인라인 예시는 \`작업을 처리한다.\`예요.

\`\`\`text
작업을 처리합니다.
\`\`\`
`;

    expect(inspectOpenWikiMarkdownStyle('ko', markdown)).toEqual([]);
  });

  it('reports declarative and formal Korean prose with line evidence', () => {
    const markdown = `---
type: explanation
description: 작업 리스의 복구 원리를 설명한다.
---

# 작업 리스

워커가 만료된 작업을 이어받는다.
처리 상태를 확인합니다.
`;

    expect(inspectOpenWikiMarkdownStyle('ko', markdown)).toEqual([
      {
        rule: 'ko_reader_voice',
        line: 3,
        excerpt: '작업 리스의 복구 원리를 설명한다.',
      },
      {
        rule: 'ko_reader_voice',
        line: 8,
        excerpt: '워커가 만료된 작업을 이어받는다.',
      },
      {
        rule: 'ko_reader_voice',
        line: 9,
        excerpt: '처리 상태를 확인합니다.',
      },
    ]);
  });

  it('does not impose Korean voice rules on English output', () => {
    expect(inspectOpenWikiMarkdownStyle('en', '작업을 처리한다.')).toEqual([]);
  });

  it('does not mistake Korean nouns ending in 다 for declarative prose', () => {
    expect(
      inspectOpenWikiMarkdownStyle(
        'ko',
        '페이지마다 같은 규칙을 적용해요. 바다 데이터를 함께 보여줘요.\n책임. 런타임. 프레임. 포함.'
      )
    ).toEqual([]);
  });
});

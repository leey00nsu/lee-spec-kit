import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  ensureOpenWikiWritingInstructions,
  inspectOpenWikiMarkdownStyle,
  inspectOpenWikiSharedDiagrams,
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

describe('OpenWiki writing adapter readability rules', () => {
  const page = (frontmatter: string, body: string) =>
    `---\ntype: reference\n${frontmatter}---\n\n${body}\n`;
  const rules = (markdown: string) =>
    inspectOpenWikiMarkdownStyle('ko', markdown).map((entry) => entry.rule);

  it('reports a title longer than 30 characters with its line', () => {
    const markdown = page(
      'title: Better Auth·Leemage·Modal 외부 서비스 계약\n',
      '# 짧은 제목\n\n본문이에요.'
    );

    expect(inspectOpenWikiMarkdownStyle('ko', markdown)).toEqual([
      {
        rule: 'ko_title_length',
        line: 3,
        excerpt: 'Better Auth·Leemage·Modal 외부 서비스 계약',
      },
    ]);
  });

  it('reports a question title', () => {
    const markdown = page('title: 큐는 어떻게 복구하나요?\n', '본문이에요.');

    expect(rules(markdown)).toEqual(['ko_title_question']);
  });

  it('reports a fourth-level heading', () => {
    const markdown = page(
      '',
      '# 작업 상태\n\n## 상태 전이\n\n#### 재시도 세부\n\n내용이에요.'
    );

    expect(rules(markdown)).toEqual(['ko_heading_depth']);
  });

  it('sends a long code-span enumeration to a table', () => {
    const markdown = page(
      '',
      '# 저장 필드\n\n작업은 `catalogRevision`, `catalogPosition`, `recommendedShift`, `scoringVersion`, `vocalProfileId`를 저장해요.'
    );

    expect(rules(markdown)).toEqual(['ko_metric_enumeration']);
  });

  it('keeps short enumerations and file paths out of the table rule', () => {
    const markdown = page(
      '',
      '# 상태\n\n작업은 `PENDING`, `PROCESSING`, `SUCCEEDED` 중 하나예요.\n\n경계는 `src/features/create-mixing/api/mixing-queue.ts`, `src/entities/ticket/api/ticket-service.ts`, `src/shared/media/operations.ts`, `src/shared/lib/admission/queue.ts`, `prisma/schema.prisma`에 있어요.'
    );

    expect(rules(markdown)).toEqual([]);
  });

  it('accepts a value list inside a table row', () => {
    const markdown = page(
      '',
      '# 상태 값\n\n| 모델 | 값 |\n| --- | --- |\n| `MixingJobStatus` | `PENDING`, `PREPARING`, `SUBMITTED`, `PROCESSING`, `SUCCEEDED` |'
    );

    expect(rules(markdown)).toEqual([]);
  });

  it('accepts 진행 as a real verb and reports 수행', () => {
    const prose = page(
      '',
      '# 진행\n\n검증을 통과하면 다음 단계로 진행해요.\n\n차감은 한 트랜잭션에서 함께 수행해요.'
    );

    expect(rules(prose)).toEqual(['ko_sino_korean']);
  });

  it('reports empty Sino-Korean verbs', () => {
    const markdown = page(
      '',
      '# 저장\n\n작업 생성과 차감은 한 트랜잭션에서 함께 수행해요.\n\nmigration을 적용하세요.'
    );

    expect(rules(markdown)).toEqual(['ko_sino_korean']);
  });

  it('reports an English term in prose and ignores it inside a code span', () => {
    const prose = page('', '# 미디어\n\nmedia 저장소는 파일을 보관해요.');
    const identifier = page('', '# 미디어\n\n`MediaAsset`은 파일을 가리켜요.');

    expect(rules(prose)).toEqual(['ko_term_english']);
    expect(rules(identifier)).toEqual([]);
  });
});

describe('OpenWiki shared state diagram detection', () => {
  const diagramPage = (path: string, body: string) => ({
    path,
    content:
      '---\ntype: explanation\n---\n\n# 작업 상태\n\n```mermaid\n' +
      body +
      '\n```\n',
  });

  it('reports the same state machine drawn with different transitions', () => {
    const left = diagramPage(
      '/openwiki/workflows/a.md',
      'stateDiagram-v2\n  [*] --> PENDING\n  PENDING --> PREPARING\n  PREPARING --> SUBMITTED\n  SUBMITTED --> PROCESSING\n  PROCESSING --> SUCCEEDED\n  PREPARING --> FAILED\n  PENDING --> CANCELED'
    );
    const right = diagramPage(
      '/openwiki/operations/b.md',
      'stateDiagram-v2\n  [*] --> PENDING\n  PENDING --> PROCESSING\n  PROCESSING --> SUBMITTED\n  SUBMITTED --> PROCESSING\n  PROCESSING --> SUCCEEDED\n  PROCESSING --> FAILED'
    );

    expect(
      inspectOpenWikiSharedDiagrams([left, right])
        .map((finding) => finding.path)
        .sort()
    ).toEqual(['/openwiki/operations/b.md', '/openwiki/workflows/a.md']);
  });

  it('accepts an identical state machine repeated on two pages', () => {
    const body = 'stateDiagram-v2\n  [*] --> PENDING\n  PENDING --> SUCCEEDED';

    expect(
      inspectOpenWikiSharedDiagrams([
        diagramPage('/openwiki/a.md', body),
        diagramPage('/openwiki/b.md', body),
      ])
    ).toEqual([]);
  });
});

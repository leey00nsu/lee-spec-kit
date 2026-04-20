import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  insertFieldInMetadataSection,
  resolveIssueTitleSummary,
  syncIssueDraftMetadata,
  syncPrDraftMetadata,
} from '../../services/GithubWorkflowService.js';

describe('GithubWorkflowService metadata sync helpers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lsk-github-meta-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('insertFieldInMetadataSection supports Korean metadata headings', () => {
    const input = `# PR 초안

## 메타데이터
- **상태**: Ready

## 본문
내용
`;
    const result = insertFieldInMetadataSection(input, 'PR', 'https://example/pull/1');
    expect(result.changed).toBe(true);
    expect(result.content).toContain('## 메타데이터');
    expect(result.content).toContain('- **PR**: https://example/pull/1');
  });

  it('syncIssueDraftMetadata inserts issue field into Korean issue draft when missing', async () => {
    const issueDocPath = path.join(tempDir, 'issue.md');
    await fs.writeFile(
      issueDocPath,
      `# 이슈 초안

## 메타데이터
- **상태**: Ready
`,
      'utf-8'
    );

    const result = syncIssueDraftMetadata(issueDocPath, '42');
    expect(result.changed).toBe(true);
    const content = await fs.readFile(issueDocPath, 'utf-8');
    expect(content).toContain('- **Issue**: #42');
  });

  it('syncPrDraftMetadata inserts PR fields into Korean pr draft when missing', async () => {
    const prDocPath = path.join(tempDir, 'pr.md');
    await fs.writeFile(
      prDocPath,
      `# PR 초안

## 메타데이터
- **상태**: Ready
`,
      'utf-8'
    );

    const result = syncPrDraftMetadata(
      prDocPath,
      'https://github.com/acme/repo/pull/77',
      'Review',
      'feat(#77): alpha (F077-alpha 구현)'
    );
    expect(result.changed).toBe(true);
    const content = await fs.readFile(prDocPath, 'utf-8');
    expect(content).toContain('- **PR**: https://github.com/acme/repo/pull/77');
    expect(content).toContain('- **PR Status**: Review');
    expect(content).toContain('- **Title**: feat(#77): alpha (F077-alpha 구현)');
  });

  it('resolveIssueTitleSummary rewrites long summaries into a complete shorter phrase without ellipsis', () => {
    const summary = resolveIssueTitleSummary(
      'Hugging Face Space를 프로젝트에서 API처럼 재사용할 수 있도록, 오디오 생성용 HF Space 연동 계층의 호환성을 공통화하고 생성 실패 회귀를 줄인다.',
      {
        id: 'F044',
        slug: 'audio-qwen-tts-bugfix',
        folderName: 'F044-audio-qwen-tts-bugfix',
        type: 'single',
        path: '/tmp/F044-audio-qwen-tts-bugfix',
        docs: { featurePathFromDocs: 'features/F044-audio-qwen-tts-bugfix' },
        git: { docsGitCwd: '/tmp/docs', projectGitCwd: '/tmp/project' },
      },
      'ko'
    );

    expect(summary).toContain('오디오 생성용 HF Space 연동 계층');
    expect(summary).toContain('생성 실패 회귀');
    expect(summary).not.toContain('...');
    expect(summary.length).toBeLessThanOrEqual(72);
  });
});

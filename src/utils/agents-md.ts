import fs from 'fs-extra';

export const LEE_SPEC_KIT_AGENTS_BEGIN = '<!-- lee-spec-kit:begin -->';
export const LEE_SPEC_KIT_AGENTS_END = '<!-- lee-spec-kit:end -->';

type DocsRepoMode = 'embedded' | 'standalone';

function renderManagedBlock(lang: 'ko' | 'en', docsRepo: DocsRepoMode): string {
  const lines: string[] = [];
  lines.push(LEE_SPEC_KIT_AGENTS_BEGIN);

  if (lang === 'ko') {
    lines.push('## lee-spec-kit (컨텍스트 압축/리셋 재개)');
    lines.push('');
    lines.push('세션 시작 또는 컨텍스트 압축/리셋 후:');
    lines.push('');
    lines.push('1. `npx lee-spec-kit detect --json` 실행');
    lines.push('2. 감지 성공 시(`status: ok` + `isLeeSpecKitProject: true`):');
    lines.push('   - `npx lee-spec-kit context --json-compact` 실행');
    lines.push(
      '   - `requiredDocs[*].command` 중 이번 세션에 아직 읽지 않은 문서만 1회 조회(캐시)'
    );
    lines.push(
      '   - `autoRun.run.resumeCommand`가 있으면 그 명령으로 재개 (없으면 `autoRun.resume.flowCommand`)'
    );
    lines.push('3. `approvalRequest.required === true`면:');
    lines.push(
      '   - `actionOptions[*].approvalPrompt`와 `approvalRequest.finalPrompt`를 원문 그대로 보여주고 승인 대기'
    );
    if (docsRepo === 'standalone') {
      lines.push('');
      lines.push('Standalone docs에서 `detect`가 실패하면:');
      lines.push('- `docs/` 폴더가 있는 워크스페이스 루트에서 실행하거나');
      lines.push('- `LEE_SPEC_KIT_DOCS_DIR=<docs 경로>` 환경변수를 설정합니다.');
    }
    lines.push('');
    lines.push('정책/세부 규칙 SSOT:');
    lines.push('- `docs/agents/custom.md`');
    lines.push('- `docs/agents/agents.md`');
  } else {
    lines.push('## lee-spec-kit (context reset / resume)');
    lines.push('');
    lines.push('On session start OR after context compression/reset:');
    lines.push('');
    lines.push('1. Run `npx lee-spec-kit detect --json`');
    lines.push('2. If detected (`status: ok` + `isLeeSpecKitProject: true`):');
    lines.push('   - Run `npx lee-spec-kit context --json-compact`');
    lines.push(
      '   - From `requiredDocs[*].command`, read only unread docs once per session (cache)'
    );
    lines.push(
      '   - If `autoRun.run.resumeCommand` exists, run it (else `autoRun.resume.flowCommand`)'
    );
    lines.push('3. If `approvalRequest.required === true`:');
    lines.push(
      '   - Show `actionOptions[*].approvalPrompt` and `approvalRequest.finalPrompt` verbatim, then wait'
    );
    if (docsRepo === 'standalone') {
      lines.push('');
      lines.push('If `detect` fails in standalone docs setups:');
      lines.push('- run from the workspace root that contains the `docs/` folder, or');
      lines.push('- set `LEE_SPEC_KIT_DOCS_DIR=<path-to-docs>`.');
    }
    lines.push('');
    lines.push('Policy SSOT:');
    lines.push('- `docs/agents/custom.md`');
    lines.push('- `docs/agents/agents.md`');
  }

  lines.push(LEE_SPEC_KIT_AGENTS_END);
  lines.push('');

  return lines.join('\n') + '\n';
}

export async function upsertLeeSpecKitAgentsMd(
  filePath: string,
  options: { lang: 'ko' | 'en'; docsRepo: DocsRepoMode }
): Promise<{ changed: boolean; action: 'created' | 'appended' | 'noop' }> {
  const block = renderManagedBlock(options.lang, options.docsRepo);

  const exists = await fs.pathExists(filePath);
  if (!exists) {
    const content = ['# Agent Instructions', '', block].join('\n');
    await fs.writeFile(filePath, content, 'utf-8');
    return { changed: true, action: 'created' };
  }

  const current = await fs.readFile(filePath, 'utf-8');
  // Treat any existing begin marker as already managed to avoid duplicate inserts.
  if (current.includes(LEE_SPEC_KIT_AGENTS_BEGIN)) {
    return { changed: false, action: 'noop' };
  }

  let next = current;
  if (next.length > 0 && !next.endsWith('\n')) next += '\n';
  if (next.trim().length > 0 && !next.endsWith('\n\n')) next += '\n';
  next += block;

  await fs.writeFile(filePath, next, 'utf-8');
  return { changed: true, action: 'appended' };
}

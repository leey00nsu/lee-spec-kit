import fs from 'fs-extra';

export const LEE_SPEC_KIT_AGENTS_BEGIN = '<!-- lee-spec-kit:begin -->';
export const LEE_SPEC_KIT_AGENTS_END = '<!-- lee-spec-kit:end -->';

type DocsRepoMode = 'embedded' | 'standalone';

function renderManagedBlock(lang: 'ko' | 'en', docsRepo: DocsRepoMode): string {
  const lines: string[] = [];
  lines.push(LEE_SPEC_KIT_AGENTS_BEGIN);
  lines.push(
    lang === 'ko'
      ? '<!-- 이 블록은 lee-spec-kit이 관리합니다. 직접 수정하지 마세요. -->'
      : '<!-- This block is managed by lee-spec-kit. Do not edit manually. -->'
  );
  lines.push('');

  if (lang === 'ko') {
    lines.push('## lee-spec-kit (감지/재개 규칙)');
    lines.push('');
    lines.push('lee-spec-kit 워크플로우는 `detect`로 감지된 경우에만 적용합니다.');
    lines.push('');
    lines.push('### Detection Gate (항상 먼저)');
    lines.push('');
    lines.push('1. `npx lee-spec-kit detect --json` 실행');
    lines.push('2. 아래 조건이 모두 만족할 때만 lee-spec-kit 규칙/명령을 적용:');
    lines.push('   - `status === "ok"`');
    lines.push('   - `isLeeSpecKitProject === true`');
    lines.push('3. 감지 실패/파싱 실패/명령 실패 시:');
    lines.push('   - lee-spec-kit 전용 절차를 건너뛰고 일반 워크플로우로 진행');
    if (docsRepo === 'standalone') {
      lines.push('');
      lines.push('Standalone docs에서 `detect`가 실패하면:');
      lines.push('- `docs/` 폴더가 있는 워크스페이스 루트에서 실행하거나');
      lines.push('- `LEE_SPEC_KIT_DOCS_DIR=<docs 경로>` 환경변수를 설정합니다.');
    }

    lines.push('');
    lines.push('### 세션 시작 또는 컨텍스트 압축/리셋 후');
    lines.push('');
    lines.push('1. `npx lee-spec-kit detect --json`');
    lines.push('2. 감지 성공 시:');
    lines.push('   - (세션당 1회) `npx lee-spec-kit docs get agents --json`');
    lines.push('   - `npx lee-spec-kit context --json-compact`');
    lines.push('   - `requiredDocs[*].command` 중 이번 세션에 아직 읽지 않은 문서만 실행(캐시)');
    lines.push('3. 재개 우선순위:');
    lines.push('   - `autoRun.run.resumeCommand`가 있으면 그 명령');
    lines.push('   - else `autoRun.resume.flowCommand`');
    lines.push('   - else `npx lee-spec-kit context --json-compact`');

    lines.push('');
    lines.push('### 작업 시작 전 (매 태스크/단계)');
    lines.push('');
    lines.push('1. `npx lee-spec-kit detect --json`');
    lines.push('2. 감지 성공 시 `npx lee-spec-kit context --json-compact`');
    lines.push('3. `requiredDocs[*].command` 중 읽지 않은 문서만 실행');
    lines.push('4. `docs get agents --json`는 기본적으로 재실행하지 않음');
    lines.push('   - 예외: 세션 시작/리셋, 사용자 요청, `lee-spec-kit update` 후, 정책/설정 변경');

    lines.push('');
    lines.push('### 승인 대기 상태 출력 (중요)');
    lines.push('');
    lines.push('`approvalRequest.required === true`이면:');
    lines.push('- `actionOptions[*].approvalPrompt`를 원문 그대로 출력');
    lines.push('- 마지막 줄에 `approvalRequest.finalPrompt`를 원문 그대로 출력');
    lines.push('- 의역/요약 금지');

    lines.push('');
    lines.push('정책/세부 규칙 SSOT:');
    lines.push('- `docs/agents/custom.md`');
    lines.push('- `docs/agents/agents.md`');
  } else {
    lines.push('## lee-spec-kit (detection / resume rules)');
    lines.push('');
    lines.push('Apply lee-spec-kit workflow only when it is explicitly detected via `detect`.');
    lines.push('');
    lines.push('### Detection Gate (always first)');
    lines.push('');
    lines.push('1. Run `npx lee-spec-kit detect --json`');
    lines.push('2. Apply lee-spec-kit rules/commands only if:');
    lines.push('   - `status === "ok"`');
    lines.push('   - `isLeeSpecKitProject === true`');
    lines.push('3. If detection is false/unusable (parse fail / command fail):');
    lines.push('   - Skip lee-spec-kit-specific workflow and proceed normally');
    if (docsRepo === 'standalone') {
      lines.push('');
      lines.push('If `detect` fails in standalone docs setups:');
      lines.push('- run from the workspace root that contains the `docs/` folder, or');
      lines.push('- set `LEE_SPEC_KIT_DOCS_DIR=<path-to-docs>`.');
    }

    lines.push('');
    lines.push('### On Session Start OR After Context Compression/Reset');
    lines.push('');
    lines.push('1. Run `npx lee-spec-kit detect --json`');
    lines.push('2. If detected:');
    lines.push('   - (once per session) run `npx lee-spec-kit docs get agents --json`');
    lines.push('   - run `npx lee-spec-kit context --json-compact`');
    lines.push('   - from `requiredDocs[*].command`, run only unread docs (cache)');
    lines.push('3. Resume priority:');
    lines.push('   - if `autoRun.run.resumeCommand` exists, run it');
    lines.push('   - else `autoRun.resume.flowCommand`');
    lines.push('   - else `npx lee-spec-kit context --json-compact`');

    lines.push('');
    lines.push('### Before Doing Any Task');
    lines.push('');
    lines.push('1. Run `npx lee-spec-kit detect --json`');
    lines.push('2. If detected, run `npx lee-spec-kit context --json-compact`');
    lines.push('3. From `requiredDocs[*].command`, run only unread docs');
    lines.push('4. Do not re-run `docs get agents --json` by default');
    lines.push('   - Exceptions: session start/reset, user requested refresh, after `lee-spec-kit update`, policy/config changed');

    lines.push('');
    lines.push('### Approval-Waiting Output (important)');
    lines.push('');
    lines.push('When `approvalRequest.required === true`:');
    lines.push('- Show `actionOptions[*].approvalPrompt` verbatim');
    lines.push('- End with `approvalRequest.finalPrompt` verbatim');
    lines.push('- Do not paraphrase');

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

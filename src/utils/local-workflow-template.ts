import fs from 'fs-extra';
import path from 'path';
import type { Lang } from './i18n.js';

function normalizeTrailingBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function sanitizeSpecForLocal(content: string): string {
  const withoutIssueLine = content
    .split('\n')
    .filter(
      (line) =>
        !/^\s*-\s*\*\*(Issue Number|이슈 번호)\*\*\s*:/.test(line)
    )
    .join('\n');
  return normalizeTrailingBlankLines(withoutIssueLine);
}

function sanitizeTasksForLocal(content: string, lang: Lang): string {
  let next = content;

  next = next.replace(
    /^##\s+GitHub Issue\s*$/m,
    lang === 'ko' ? '## 로컬 추적 정보' : '## Local Tracking'
  );

  const lines = next.split('\n');
  const filtered: string[] = [];

  for (const line of lines) {
    if (
      /^\s*-\s*\*\*(Issue|PR|PR Status|PR 상태|PR Review|PR 리뷰|PR Review Evidence|PR 리뷰 Evidence)\*\*\s*:/.test(
        line
      )
    ) {
      continue;
    }
    if (
      /^\s*-\s*\*\*(PR Review Decision|PR 리뷰 Decision)\*\*\s*:/.test(
        line
      )
    ) {
      continue;
    }
    if (/^\s*-\s*(Example|Values)\s*:/.test(line)) continue;
    if (/^\s*-\s*(예|값)\s*:/.test(line)) continue;
    if (/^\s*-\s*Mark\s+`?Done`?/i.test(line)) continue;
    if (/^\s*-\s*사전 코드리뷰 완료 후/.test(line)) continue;
    if (/^\s*-\s*Record your key review decision/i.test(line)) continue;
    if (/^\s*-\s*사전 리뷰 주요 판단 근거를/.test(line)) continue;
    if (/^\s*-\s*Example:\s*review note link/i.test(line)) continue;
    if (/^\s*-\s*사전 리뷰 최종 결과/.test(line)) continue;
    if (/^\s*-\s*예:\s*리뷰 노트 링크/.test(line)) continue;
    if (/^\s*-\s*PR creation requires/i.test(line)) continue;
    if (/^\s*-\s*PR 생성 전/.test(line)) continue;
    if (/agents\/skills\/create-pr\.md/.test(line)) continue;
    if (/^\s*-\s*Mark .*PR review handoff/i.test(line)) continue;
    if (/^\s*-\s*PR 리뷰 handoff/.test(line)) continue;
    if (/^\s*-\s*Record why\/how review comments/i.test(line)) continue;
    if (/^\s*-\s*리뷰 지적사항을/.test(line)) continue;
    filtered.push(line);
  }

  next = filtered.join('\n');
  next = lang === 'ko'
    ? next
        .replaceAll('**PR 전 리뷰**', '**Feature 리뷰**')
        .replaceAll('**PR 전 리뷰 Evidence**', '**Feature 리뷰 Evidence**')
        .replaceAll('**PR 전 리뷰 Decision**', '**Feature 리뷰 Decision**')
        .replaceAll('**PR 전 리뷰 Head**', '**Feature 리뷰 Head**')
        .replaceAll('**PR 전 리뷰 Tree**', '**Feature 리뷰 Tree**')
        .replaceAll('pre-PR 리뷰 handoff', 'Feature 리뷰 handoff')
    : next
        .replaceAll('**Pre-PR Review**', '**Feature Review**')
        .replaceAll('**Pre-PR Evidence**', '**Feature Review Evidence**')
        .replaceAll('**Pre-PR Decision**', '**Feature Review Decision**')
        .replaceAll('**Pre-PR Reviewed Head**', '**Feature Reviewed Head**')
        .replaceAll('**Pre-PR Reviewed Tree**', '**Feature Reviewed Tree**')
        .replaceAll('pre-PR review handoff', 'Feature review handoff');
  next = next
    .replace(/feat\/\{issue-number\}-/g, 'feat/')
    .replace(/feat\/\{이슈번호\}-/g, 'feat/')
    .replace(/feat\/-/g, 'feat/');

  return normalizeTrailingBlankLines(next);
}

export function applyLocalWorkflowTemplateToContent(
  fileName: string,
  content: string,
  lang: Lang
): string | null {
  if (fileName === 'issue.md' || fileName === 'pr.md') {
    return null;
  }
  if (fileName === 'spec.md') {
    return sanitizeSpecForLocal(content);
  }
  if (fileName === 'tasks.md') {
    return sanitizeTasksForLocal(content, lang);
  }
  return content;
}

async function patchMarkdownIfExists(
  filePath: string,
  transform: (content: string) => string
): Promise<void> {
  if (!(await fs.pathExists(filePath))) return;
  const content = await fs.readFile(filePath, 'utf-8');
  await fs.writeFile(filePath, transform(content), 'utf-8');
}

export async function applyLocalWorkflowTemplateToFeatureDir(
  featureDir: string,
  lang: Lang
): Promise<void> {
  await patchMarkdownIfExists(path.join(featureDir, 'spec.md'), sanitizeSpecForLocal);
  await patchMarkdownIfExists(path.join(featureDir, 'tasks.md'), (content) =>
    sanitizeTasksForLocal(content, lang)
  );
  // Local workflow does not require remote issue/PR tracking docs.
  await fs.remove(path.join(featureDir, 'issue.md'));
  await fs.remove(path.join(featureDir, 'pr.md'));
}

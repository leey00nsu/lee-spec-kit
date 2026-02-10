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
      /^\s*-\s*\*\*(Issue|PR|PR Status|PR 상태|Pre-PR Review|PR 전 리뷰)\*\*\s*:/.test(
        line
      )
    ) {
      continue;
    }
    if (/^\s*-\s*(Example|Values)\s*:/.test(line)) continue;
    if (/^\s*-\s*(예|값)\s*:/.test(line)) continue;
    if (/^\s*-\s*Mark\s+`?Done`?/i.test(line)) continue;
    if (/^\s*-\s*사전 코드리뷰 완료 후/.test(line)) continue;
    filtered.push(line);
  }

  next = filtered.join('\n');
  next = next
    .replace(/feat\/\{issue-number\}-/g, 'feat/')
    .replace(/feat\/\{이슈번호\}-/g, 'feat/')
    .replace(/feat\/-/g, 'feat/');

  return normalizeTrailingBlankLines(next);
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
}

export async function applyLocalWorkflowTemplateToFeatureBase(
  docsDir: string,
  lang: Lang
): Promise<void> {
  const baseDir = path.join(docsDir, 'features', 'feature-base');
  await applyLocalWorkflowTemplateToFeatureDir(baseDir, lang);
}

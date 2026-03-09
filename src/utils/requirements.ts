import path from 'path';
import { IFileSystemAdapter } from '../ports/FileSystemAdapter.js';
import { walkFiles } from './fs-walk.js';

export type RequirementTaskStatus = 'TODO' | 'DOING' | 'DONE' | 'REVIEW';

export interface PrdRequirementDefinition {
  id: string;
  title?: string;
  file: string; // path relative to docsDir (POSIX-style)
  line: number; // 1-based
}

export interface ParsedTaskLine {
  status: RequirementTaskStatus;
  tags: string[];
  title: string;
  line: number; // 1-based
}

export const PRD_REQUIREMENT_ID_RE =
  /\bPRD-(?:FR|US|NFR)-\d+\b/gi;

export function isPrdRequirementId(value: string): boolean {
  return /^PRD-(?:FR|US|NFR)-\d+$/i.test(value.trim());
}

export function isNonPrdTag(value: string): boolean {
  const trimmed = value.trim();
  return /^NON[-_ ]?PRD$/i.test(trimmed);
}

function normalizeRelPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function extractTitleAfterId(line: string, id: string): string | undefined {
  const idx = line.indexOf(id);
  if (idx < 0) return undefined;
  const after = line.slice(idx + id.length);
  const cleaned = after.replace(/^[\s:：\-–—)\]]+/, '').trim();
  return cleaned ? cleaned : undefined;
}

export async function scanPrdRequirements(
  fsAdapter: IFileSystemAdapter,
  docsDir: string
): Promise<{
  definitions: Map<string, PrdRequirementDefinition>;
  duplicates: Array<PrdRequirementDefinition>;
  filesScanned: number;
}> {
  const prdDir = path.join(docsDir, 'prd');
  const files = await walkFiles(fsAdapter, prdDir, {
    extensions: ['.md'],
    ignoreDirs: ['.git', 'node_modules', 'dist', 'tmp'],
  });

  const definitions = new Map<string, PrdRequirementDefinition>();
  const duplicates: PrdRequirementDefinition[] = [];

  for (const filePath of files) {
    if (path.basename(filePath).toLowerCase() === 'readme.md') {
      continue;
    }

    let content = '';
    try {
      content = await fsAdapter.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const relFile = normalizeRelPath(path.relative(docsDir, filePath));
    const lines = content.split(/\r?\n/);
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] || '';
      if (/^\s*(```|~~~)/.test(line)) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const ids = [...line.matchAll(PRD_REQUIREMENT_ID_RE)].map(
        (match) => (match[0] || '').toUpperCase()
      );
      if (ids.length === 0) continue;

      for (const id of ids) {
        const def: PrdRequirementDefinition = {
          id,
          title: extractTitleAfterId(line, id),
          file: relFile,
          line: i + 1,
        };
        const existing = definitions.get(id);
        if (existing) {
          duplicates.push(def);
          continue;
        }
        definitions.set(id, def);
      }
    }
  }

  return { definitions, duplicates, filesScanned: files.length };
}

export function parseTaskLines(content: string): ParsedTaskLine[] {
  const out: ParsedTaskLine[] = [];
  const lines = content.split(/\r?\n/);
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || '';
    if (/^\s*(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(
      /^\s*-\s*\[([A-Z]+)\]((?:\[[^\]]+\])*)\s*(.+?)\s*$/
    );
    if (!match) continue;

    const status = (match[1] || '').trim().toUpperCase();
    const tagsPart = match[2] || '';
    const title = (match[3] || '').trim();
    if (!title) continue;

    // Only accept known statuses we model.
    if (status !== 'TODO' && status !== 'DOING' && status !== 'DONE' && status !== 'REVIEW') {
      continue;
    }

    const tags = [...tagsPart.matchAll(/\[([^\]]+)\]/g)]
      .map((m) => (m[1] || '').trim())
      .filter(Boolean);

    out.push({
      status: status as RequirementTaskStatus,
      tags,
      title,
      line: i + 1,
    });
  }

  return out;
}

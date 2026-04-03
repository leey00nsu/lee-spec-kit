import path from 'path';
import fs from 'fs-extra';

export interface AllowedDocsEntriesConfig {
  dirs?: string[];
  files?: string[];
}

export interface UnmanagedDocsEntry {
  name: string;
  kind: 'dir' | 'file';
  absPath: string;
  relPath: string;
}

export const DEFAULT_MANAGED_DOC_DIRS = [
  'agents',
  'designs',
  'features',
  'ideas',
  'prd',
  'scripts',
] as const;

export const DEFAULT_MANAGED_DOC_FILES = [
  'AGENTS.md',
  'README.md',
  '.lee-spec-kit.json',
  '.gitignore',
] as const;

const DOC_LIKE_FILE_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.rst',
  '.adoc',
]);

function normalizeEntryName(value: string): string {
  return value.trim().toLowerCase();
}

function toAllowedSet(values: readonly string[], extras?: string[]): Set<string> {
  return new Set(
    [...values, ...(extras || [])]
      .map((entry) => normalizeEntryName(entry))
      .filter(Boolean)
  );
}

function isDocLikeFile(name: string): boolean {
  return DOC_LIKE_FILE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

export async function collectUnmanagedDocsEntries(
  docsDir: string,
  allowed?: AllowedDocsEntriesConfig
): Promise<UnmanagedDocsEntry[]> {
  const allowedDirs = toAllowedSet(DEFAULT_MANAGED_DOC_DIRS, allowed?.dirs);
  const allowedFiles = toAllowedSet(DEFAULT_MANAGED_DOC_FILES, allowed?.files);
  const entries = await fs.readdir(docsDir, { withFileTypes: true });
  const unmanaged: UnmanagedDocsEntry[] = [];

  for (const entry of entries) {
    const name = entry.name || '';
    if (!name) continue;

    if (entry.isDirectory()) {
      if (name.startsWith('.')) continue;
      if (allowedDirs.has(normalizeEntryName(name))) continue;
      unmanaged.push({
        name,
        kind: 'dir',
        absPath: path.join(docsDir, name),
        relPath: `docs/${name}`,
      });
      continue;
    }

    if (!entry.isFile()) continue;
    if (allowedFiles.has(normalizeEntryName(name))) continue;
    if (!isDocLikeFile(name)) continue;
    unmanaged.push({
      name,
      kind: 'file',
      absPath: path.join(docsDir, name),
      relPath: `docs/${name}`,
    });
  }

  return unmanaged.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

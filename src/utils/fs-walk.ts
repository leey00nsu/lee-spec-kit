import path from 'path';
import { IFileSystemAdapter } from '../ports/FileSystemAdapter.js';

interface WalkFilesOptions {
  extensions?: string[];
  ignoreDirs?: string[];
}

export async function walkFiles(
  fsAdapter: IFileSystemAdapter,
  rootDir: string,
  options: WalkFilesOptions = {}
): Promise<string[]> {
  const out: string[] = [];
  const normalizedExtensions = new Set(
    (options.extensions || [])
      .map((ext) => ext.trim().toLowerCase())
      .filter(Boolean)
      .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
  );
  const ignored = new Set(
    (options.ignoreDirs || [])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );

  async function visit(current: string): Promise<void> {
    const entries = await fsAdapter.readdir(current);
    for (const entryName of entries) {
      const absolute = path.join(current, entryName);
      const stat = await fsAdapter.stat(absolute);
      if (stat.isDirectory()) {
        if (ignored.has(entryName.trim().toLowerCase())) continue;
        await visit(absolute);
        continue;
      }
      if (!stat.isFile()) continue;
      if (normalizedExtensions.size > 0) {
        const ext = path.extname(entryName).toLowerCase();
        if (!normalizedExtensions.has(ext)) continue;
      }
      out.push(absolute);
    }
  }

  if (await fsAdapter.pathExists(rootDir)) {
    await visit(rootDir);
  }
  return out;
}

export async function listSubdirectories(
  fsAdapter: IFileSystemAdapter,
  rootDir: string
): Promise<string[]> {
  if (!(await fsAdapter.pathExists(rootDir))) return [];
  const entries = await fsAdapter.readdir(rootDir);
  const dirs: string[] = [];
  for (const entryName of entries) {
    const absolute = path.join(rootDir, entryName);
    const stat = await fsAdapter.stat(absolute);
    if (stat.isDirectory()) {
      dirs.push(absolute);
    }
  }
  return dirs;
}

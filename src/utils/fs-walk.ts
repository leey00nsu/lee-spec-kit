import path from 'path';
import fs from 'fs-extra';

interface WalkFilesOptions {
  extensions?: string[];
  ignoreDirs?: string[];
}

export async function walkFiles(
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
    (options.ignoreDirs || []).map((value) => value.trim().toLowerCase()).filter(Boolean)
  );

  async function visit(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (ignored.has(entry.name.trim().toLowerCase())) continue;
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (normalizedExtensions.size > 0) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!normalizedExtensions.has(ext)) continue;
      }
      out.push(absolute);
    }
  }

  if (await fs.pathExists(rootDir)) {
    await visit(rootDir);
  }
  return out;
}

export async function listSubdirectories(rootDir: string): Promise<string[]> {
  if (!(await fs.pathExists(rootDir))) return [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name));
}

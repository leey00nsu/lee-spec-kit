import path from 'node:path';
import fs from 'fs-extra';

export async function ensureGitignoreEntries(
  gitignorePath: string,
  entries: string[],
  heading = '# lee-spec-kit managed paths'
): Promise<boolean> {
  const existing = (await fs.pathExists(gitignorePath))
    ? await fs.readFile(gitignorePath, 'utf-8')
    : '';
  const existingEntries = new Set(
    existing
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const missing = entries.filter((entry) => !existingEntries.has(entry));
  if (missing.length === 0) return false;

  const sections: string[] = [];
  const normalized = existing.replace(/\r\n/g, '\n').replace(/\n*$/u, '');
  if (normalized) sections.push(normalized);
  if (!existingEntries.has(heading)) sections.push(heading);
  sections.push(missing.join('\n'));

  await fs.ensureDir(path.dirname(gitignorePath));
  await fs.writeFile(gitignorePath, `${sections.join('\n\n')}\n`, 'utf-8');
  return true;
}

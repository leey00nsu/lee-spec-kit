import fs from 'fs-extra';
import { walkFiles } from './fs-walk.js';

export async function copyTemplates(src: string, dest: string): Promise<void> {
  await fs.copy(src, dest, {
    overwrite: true,
    errorOnExist: false,
  });
}

export function applyReplacements(
  content: string,
  replacements: Record<string, string>
): string {
  // Avoid overlap issues (e.g. "{{projectName}}" vs "{{projectName}}-{component}")
  // by applying longer keys first.
  const keys = Object.keys(replacements).sort((a, b) => b.length - a.length);
  let next = content;
  for (const key of keys) {
    next = next.replaceAll(key, replacements[key]);
  }
  return next;
}

export async function replaceInFiles(
  dir: string,
  replacements: Record<string, string>
): Promise<void> {
  const files = await walkFiles(dir, { extensions: ['.md'] });

  for (const file of files) {
    let content = await fs.readFile(file, 'utf-8');
    content = applyReplacements(content, replacements);

    await fs.writeFile(file, content, 'utf-8');
  }

  // .sh 파일도 치환
  const shFiles = await walkFiles(dir, { extensions: ['.sh'] });

  for (const file of shFiles) {
    let content = await fs.readFile(file, 'utf-8');
    content = applyReplacements(content, replacements);

    await fs.writeFile(file, content, 'utf-8');
  }
}

import { IFileSystemAdapter } from '../ports/FileSystemAdapter.js';
import { walkFiles } from './fs-walk.js';

export async function copyTemplates(
  fsImpl: IFileSystemAdapter,
  src: string,
  dest: string
): Promise<void> {
  await fsImpl.copy(src, dest, {
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
  fsImpl: IFileSystemAdapter,
  dir: string,
  replacements: Record<string, string>
): Promise<void> {
  const files = await walkFiles(fsImpl, dir, { extensions: ['.md'] });

  for (const file of files) {
    let content = await fsImpl.readFile(file, 'utf-8');
    content = applyReplacements(content, replacements);

    await fsImpl.writeFile(file, content, 'utf-8');
  }

  // .sh 파일도 치환
  const shFiles = await walkFiles(fsImpl, dir, { extensions: ['.sh'] });

  for (const file of shFiles) {
    let content = await fsImpl.readFile(file, 'utf-8');
    content = applyReplacements(content, replacements);

    await fsImpl.writeFile(file, content, 'utf-8');
  }
}

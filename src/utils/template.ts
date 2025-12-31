import fs from "fs-extra";
import { glob } from "glob";

export async function copyTemplates(src: string, dest: string): Promise<void> {
  await fs.copy(src, dest, {
    overwrite: true,
    errorOnExist: false,
  });
}

export async function replaceInFiles(
  dir: string,
  replacements: Record<string, string>,
): Promise<void> {
  const files = await glob("**/*.md", { cwd: dir, absolute: true });

  for (const file of files) {
    let content = await fs.readFile(file, "utf-8");

    for (const [search, replace] of Object.entries(replacements)) {
      content = content.replaceAll(search, replace);
    }

    await fs.writeFile(file, content, "utf-8");
  }

  // .sh 파일도 치환
  const shFiles = await glob("**/*.sh", { cwd: dir, absolute: true });

  for (const file of shFiles) {
    let content = await fs.readFile(file, "utf-8");

    for (const [search, replace] of Object.entries(replacements)) {
      content = content.replaceAll(search, replace);
    }

    await fs.writeFile(file, content, "utf-8");
  }
}

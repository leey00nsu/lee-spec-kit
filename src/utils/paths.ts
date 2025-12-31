import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getTemplatesDir(): string {
  // 개발 모드: src/utils/ -> templates/
  // 배포 모드: dist/ -> templates/
  const rootDir = path.resolve(__dirname, "..", "..");
  return path.join(rootDir, "templates");
}

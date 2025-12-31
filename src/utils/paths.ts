import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getTemplatesDir(): string {
  // 빌드 후: dist/index.js -> templates/
  // 개발 시에도 동일하게 동작 (src/utils/paths.ts 기준이 아님)
  // tsup이 모든 코드를 dist/index.js로 번들링하므로 __dirname은 dist/
  const rootDir = path.resolve(__dirname, "..");
  return path.join(rootDir, "templates");
}

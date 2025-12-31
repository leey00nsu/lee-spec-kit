import { Command } from "commander";
import chalk from "chalk";
import path from "path";
import fs from "fs-extra";
import { getConfig } from "../utils/config.js";

interface StatusOptions {
  write?: boolean;
  strict?: boolean;
}

interface FeatureInfo {
  id: string;
  name: string;
  repo: string;
  issue: string;
  status: string;
  progress: string;
  path: string;
}

export function statusCommand(program: Command): void {
  program
    .command("status")
    .description("Show feature status")
    .option("-w, --write", "Write status.md file")
    .option("-s, --strict", "Fail on missing/duplicate feature IDs")
    .action(async (options: StatusOptions) => {
      try {
        await runStatus(options);
      } catch (error) {
        console.error(chalk.red("오류:"), error);
        process.exit(1);
      }
    });
}

async function runStatus(options: StatusOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    console.error(
      chalk.red("docs 폴더를 찾을 수 없습니다. 먼저 init을 실행하세요."),
    );
    process.exit(1);
  }

  const { docsDir, projectType } = config;
  const featuresDir = path.join(docsDir, "features");

  const features: FeatureInfo[] = [];
  const idMap = new Map<string, string[]>();

  const scopes = projectType === "fullstack" ? ["be", "fe"] : [""];

  for (const scope of scopes) {
    const scanDir = scope ? path.join(featuresDir, scope) : featuresDir;
    if (!(await fs.pathExists(scanDir))) continue;

    const entries = await fs.readdir(scanDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "feature-base") continue;

      const featureDir = path.join(scanDir, entry.name);
      const specPath = path.join(featureDir, "spec.md");
      const tasksPath = path.join(featureDir, "tasks.md");

      if (!(await fs.pathExists(specPath))) continue;
      if (!(await fs.pathExists(tasksPath))) continue;

      const specContent = await fs.readFile(specPath, "utf-8");
      const tasksContent = await fs.readFile(tasksPath, "utf-8");

      const id =
        extractSpecValue(specContent, "기능 ID") ||
        extractSpecValue(specContent, "Feature ID") ||
        "UNKNOWN";
      const name =
        extractSpecValue(specContent, "기능명") ||
        extractSpecValue(specContent, "Feature Name") ||
        entry.name;
      const repo =
        extractSpecValue(specContent, "대상 레포") ||
        extractSpecValue(specContent, "Target Repo") ||
        (scope ? `{{projectName}}-${scope}` : "{{projectName}}");
      const issue =
        extractSpecValue(specContent, "이슈 번호") ||
        extractSpecValue(specContent, "Issue Number") ||
        "-";

      // 중복 ID 체크
      const relPath = path.relative(docsDir, featureDir);
      if (!idMap.has(id)) {
        idMap.set(id, []);
      }
      idMap.get(id)!.push(relPath);

      // 태스크 카운트
      const { total, done, doing, todo } = countTasks(tasksContent);

      let status = "TODO";
      if (total > 0 && done === total) {
        status = "DONE";
      } else if (doing > 0) {
        status = "DOING";
      } else if (todo > 0) {
        status = "TODO";
      } else if (total === 0) {
        status = "NO_TASKS";
      }

      features.push({
        id,
        name,
        repo,
        issue,
        status,
        progress: `${done}/${total}`,
        path: relPath,
      });
    }
  }

  if (features.length === 0) {
    console.log(chalk.yellow("Feature를 찾을 수 없습니다."));
    return;
  }

  // 중복 ID 확인
  if (options.strict) {
    const duplicates = [...idMap.entries()].filter(
      ([, paths]) => paths.length > 1,
    );
    if (duplicates.length > 0) {
      console.error(chalk.red("중복 Feature ID 발견:"));
      for (const [id, paths] of duplicates) {
        console.error(chalk.red(`  ${id}:`));
        for (const p of paths) {
          console.error(chalk.red(`    - ${p}`));
        }
      }
      process.exit(1);
    }

    const unknowns = [...idMap.entries()].filter(([id]) => id === "UNKNOWN");
    if (unknowns.length > 0) {
      console.error(chalk.red("Feature ID가 없는 항목:"));
      for (const [, paths] of unknowns) {
        for (const p of paths) {
          console.error(chalk.red(`  - ${p}`));
        }
      }
      process.exit(1);
    }
  }

  // 정렬
  features.sort((a, b) => a.id.localeCompare(b.id));

  // 테이블 출력
  const header = "| ID | Name | Repo | Issue | Status | Progress | Path |";
  const separator = "| --- | --- | --- | --- | --- | --- | --- |";

  console.log();
  console.log(header);
  console.log(separator);
  for (const f of features) {
    const statusColor =
      f.status === "DONE"
        ? chalk.green
        : f.status === "DOING"
          ? chalk.yellow
          : chalk.gray;
    console.log(
      `| ${f.id} | ${f.name} | ${f.repo} | ${f.issue} | ${statusColor(f.status)} | ${f.progress} | ${f.path} |`,
    );
  }
  console.log();

  // 파일 쓰기
  if (options.write) {
    const outputPath = path.join(featuresDir, "status.md");
    const date = new Date().toISOString().split("T")[0];

    const content = [
      "# Feature Status",
      "",
      `- Generated: ${date}`,
      "- Source: `tasks.md`, `spec.md`",
      "",
      header,
      separator,
      ...features.map(
        (f) =>
          `| ${f.id} | ${f.name} | ${f.repo} | ${f.issue} | ${f.status} | ${f.progress} | ${f.path} |`,
      ),
      "",
    ].join("\n");

    await fs.writeFile(outputPath, content, "utf-8");
    console.log(chalk.green(`✅ ${outputPath} 생성 완료`));
  }
}

function extractSpecValue(content: string, key: string): string {
  const regex = new RegExp(`^- \\*\\*${key}\\*\\*:\\s*(.*)$`, "m");
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

function countTasks(content: string): {
  total: number;
  done: number;
  doing: number;
  todo: number;
} {
  let total = 0;
  let done = 0;
  let doing = 0;
  let todo = 0;

  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^- \[([A-Z]+)\]/);
    if (match) {
      total++;
      const status = match[1];
      if (status === "DONE") done++;
      else if (status === "DOING" || status === "REVIEW") doing++;
      else if (status === "TODO") todo++;
    }
  }

  return { total, done, doing, todo };
}

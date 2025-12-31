import { Command } from "commander";
import prompts from "prompts";
import chalk from "chalk";
import path from "path";
import fs from "fs-extra";
import { getConfig } from "../utils/config.js";
import { replaceInFiles } from "../utils/template.js";

interface FeatureOptions {
  repo?: "be" | "fe";
  id?: string;
}

export function featureCommand(program: Command): void {
  program
    .command("feature <name>")
    .description("Create a new feature folder")
    .option("-r, --repo <repo>", "Repository type: be | fe (fullstack only)")
    .option("--id <id>", "Feature ID (default: auto)")
    .action(async (name: string, options: FeatureOptions) => {
      try {
        await runFeature(name, options);
      } catch (error) {
        if (error instanceof Error && error.message === "canceled") {
          console.log(chalk.yellow("\n작업이 취소되었습니다."));
          process.exit(0);
        }
        console.error(chalk.red("오류:"), error);
        process.exit(1);
      }
    });
}

async function runFeature(
  name: string,
  options: FeatureOptions,
): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    console.error(
      chalk.red("docs 폴더를 찾을 수 없습니다. 먼저 init을 실행하세요."),
    );
    process.exit(1);
  }

  const { docsDir, projectType, lang } = config;

  let repo = options.repo;

  // fullstack인 경우 repo 선택 필요
  if (projectType === "fullstack" && !repo) {
    const response = await prompts(
      {
        type: "select",
        name: "repo",
        message: "레포지토리를 선택하세요:",
        choices: [
          { title: "Backend (be)", value: "be" },
          { title: "Frontend (fe)", value: "fe" },
        ],
      },
      {
        onCancel: () => {
          throw new Error("canceled");
        },
      },
    );
    repo = response.repo;
  }

  // Feature ID 생성
  const featureId =
    options.id || (await getNextFeatureId(docsDir, projectType));

  // 기능 폴더 경로
  let featuresDir: string;
  if (projectType === "fullstack" && repo) {
    featuresDir = path.join(docsDir, "features", repo);
  } else {
    featuresDir = path.join(docsDir, "features");
  }

  const featureFolderName = `${featureId}-${name}`;
  const featureDir = path.join(featuresDir, featureFolderName);

  // 중복 확인
  if (await fs.pathExists(featureDir)) {
    console.error(chalk.red(`이미 존재하는 폴더입니다: ${featureDir}`));
    process.exit(1);
  }

  // feature-base 복사
  const featureBasePath = path.join(docsDir, "features", "feature-base");
  if (!(await fs.pathExists(featureBasePath))) {
    console.error(chalk.red("feature-base 템플릿을 찾을 수 없습니다."));
    process.exit(1);
  }

  await fs.copy(featureBasePath, featureDir);

  // 플레이스홀더 치환
  const idNumber = featureId.replace("F", "");
  const repoName =
    projectType === "fullstack" && repo
      ? `{{projectName}}-${repo}`
      : "{{projectName}}";

  const replacements: Record<string, string> = {
    "{기능명}": name,
    "{번호}": idNumber,
    "YYYY-MM-DD": new Date().toISOString().split("T")[0],
    "{be|fe}": repo || "",
    "git-dungeon-{be|fe}": repoName,
    "{이슈번호}": "",
  };

  // 한국어 템플릿의 경우 추가 치환
  if (lang === "en") {
    replacements["기능 ID"] = "Feature ID";
    replacements["기능명"] = "Feature Name";
    replacements["대상 레포"] = "Target Repo";
    replacements["이슈 번호"] = "Issue Number";
    replacements["작성일"] = "Created";
    replacements["상태"] = "Status";
  }

  await replaceInFiles(featureDir, replacements);

  console.log();
  console.log(chalk.green(`✅ Feature 폴더 생성 완료: ${featureDir}`));
  console.log();
  console.log(chalk.blue("다음 단계:"));
  console.log(chalk.gray(`  1. ${featureDir}/spec.md 작성`));
  console.log(chalk.gray("  2. 사용자 리뷰 요청"));
  console.log(chalk.gray("  3. 승인 후 plan.md 작성"));
  console.log();
}

async function getNextFeatureId(
  docsDir: string,
  projectType: string,
): Promise<string> {
  const featuresDir = path.join(docsDir, "features");
  let max = 0;

  const scanDirs: string[] = [];

  if (projectType === "fullstack") {
    scanDirs.push(path.join(featuresDir, "be"));
    scanDirs.push(path.join(featuresDir, "fe"));
  } else {
    scanDirs.push(featuresDir);
  }

  for (const dir of scanDirs) {
    if (!(await fs.pathExists(dir))) continue;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^F(\d+)-/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  }

  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `F${String(next).padStart(width, "0")}`;
}

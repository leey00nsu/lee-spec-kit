import path from "path";
import fs from "fs-extra";

export interface ProjectConfig {
  docsDir: string;
  projectType: "single" | "fullstack";
  lang: "ko" | "en";
}

export async function getConfig(cwd: string): Promise<ProjectConfig | null> {
  // docs 폴더 탐색
  const possibleDirs = [
    path.join(cwd, "docs"),
    cwd, // 이미 docs 폴더 안에 있을 수 있음
  ];

  for (const docsDir of possibleDirs) {
    const agentsPath = path.join(docsDir, "agents");
    const featuresPath = path.join(docsDir, "features");

    if (
      (await fs.pathExists(agentsPath)) &&
      (await fs.pathExists(featuresPath))
    ) {
      // 프로젝트 타입 감지
      const bePath = path.join(featuresPath, "be");
      const fePath = path.join(featuresPath, "fe");
      const projectType =
        (await fs.pathExists(bePath)) || (await fs.pathExists(fePath))
          ? "fullstack"
          : "single";

      // 언어 감지 (agents.md 내용 기반)
      const agentsMdPath = path.join(agentsPath, "agents.md");
      let lang: "ko" | "en" = "ko";
      if (await fs.pathExists(agentsMdPath)) {
        const content = await fs.readFile(agentsMdPath, "utf-8");
        // 한국어가 포함되어 있는지 확인
        if (!/[가-힣]/.test(content)) {
          lang = "en";
        }
      }

      return { docsDir, projectType, lang };
    }
  }

  return null;
}

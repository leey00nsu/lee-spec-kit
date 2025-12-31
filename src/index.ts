import { program } from "commander";
import { initCommand } from "./commands/init.js";
import { featureCommand } from "./commands/feature.js";
import { statusCommand } from "./commands/status.js";

program
  .name("lee-spec-kit")
  .description(
    "Project documentation structure generator for AI-assisted development",
  )
  .version("0.1.0");

initCommand(program);
featureCommand(program);
statusCommand(program);

program.parse();

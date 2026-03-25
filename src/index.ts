import { program, type Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { initCommand } from './commands/init.js';
import { featureCommand } from './commands/feature.js';
import { ideaCommand } from './commands/idea.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';
import { configCommand } from './commands/config.js';
import { contextCommand } from './commands/context.js';
import { doctorCommand } from './commands/doctor.js';
import { viewCommand } from './commands/view.js';
import { flowCommand } from './commands/flow.js';
import { githubCommand } from './commands/github.js';
import { docsCommand } from './commands/docs.js';
import { detectCommand } from './commands/detect.js';
import { onboardCommand } from './commands/onboard.js';
import { prePrReviewCommand } from './commands/pre-pr-review.js';
import { codeReviewRunCommand } from './commands/code-review-run.js';
import { requirementsCommand } from './commands/requirements.js';
import { taskRunCommand } from './commands/task-run.js';
import { taskCompleteCommand } from './commands/task-complete.js';
import { setupCommand } from './commands/setup.js';
import { getBanner } from './utils/banner.js';
import { checkForUpdates } from './utils/version-check.js';

function shouldShowBanner(): boolean {
  const argv = process.argv.slice(2);
  const disabledByEnv = (process.env.LEE_SPEC_KIT_NO_BANNER || '').trim() === '1';
  const disabledByFlag = argv.includes('--no-banner');
  const hasJsonFlag = argv.includes('--json');
  const isNonTtyOutput = !process.stdout.isTTY;
  if (disabledByEnv || disabledByFlag) return false;
  // Keep machine output lean: suppress banner for JSON/non-TTY executions.
  if (hasJsonFlag || isNonTtyOutput) return false;
  return true;
}

function shouldCheckForUpdates(): boolean {
  const argv = process.argv.slice(2);
  const hasJsonFlag = argv.includes('--json');
  const isHelpOrVersion =
    argv.includes('--help') ||
    argv.includes('-h') ||
    argv.includes('--version') ||
    argv.includes('-V');

  const disabledByEnv =
    (process.env.LEE_SPEC_KIT_NO_UPDATE_CHECK || '').trim() === '1';

  // 머신 출력(JSON) / 파이프 환경에서는 stdout 오염 방지
  if (hasJsonFlag) return false;
  if (!process.stdout.isTTY) return false;
  if (isHelpOrVersion) return false;
  if (disabledByEnv) return false;

  return true;
}

// 비동기로 새 버전 확인 (CLI 실행 차단하지 않음)
if (shouldCheckForUpdates()) checkForUpdates();

function getCliVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = fs.readJsonSync(packageJsonPath);
      if (pkg?.version) return String(pkg.version);
    }
  } catch {
    // ignore
  }
  return '0.0.0';
}

function configureRootCommandSurface(): void {
  const publicCommands = new Set(['init', 'idea', 'feature', 'context', 'flow']);

  for (const command of program.commands) {
    if (publicCommands.has(command.name())) {
      command.helpGroup('Core Commands:');
      continue;
    }
    (command as Command & { _hidden?: boolean })._hidden = true;
  }
}

const cliVersion = getCliVersion();

program
  .name('lee-spec-kit')
  .description(
    'Agent-guided development harness for spec-driven projects'
  )
  .version(cliVersion)
  .option('--no-banner', 'Hide banner in help output');

if (shouldShowBanner()) {
  program.addHelpText('beforeAll', getBanner({ version: cliVersion }));
}

initCommand(program);
ideaCommand(program);
featureCommand(program);
statusCommand(program);
updateCommand(program);
configCommand(program);
contextCommand(program);
doctorCommand(program);
viewCommand(program);
flowCommand(program);
githubCommand(program);
docsCommand(program);
detectCommand(program);
onboardCommand(program);
prePrReviewCommand(program);
codeReviewRunCommand(program);
taskRunCommand(program);
taskCompleteCommand(program);
requirementsCommand(program);
setupCommand(program);

configureRootCommandSurface();

await program.parseAsync();

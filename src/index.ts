import { program, type Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { initCommand } from './commands/init.js';
import { featureCommand } from './commands/feature.js';
import { ideaCommand } from './commands/idea.js';
import { updateCommand } from './commands/update.js';
import { configCommand } from './commands/config.js';
import { githubCommand } from './commands/github.js';
import { docsCommand } from './commands/docs.js';
import { taskCommand } from './commands/task.js';
import { decisionCommand } from './commands/decision.js';
import { detectCommand } from './commands/detect.js';
import { integrationsCommand } from './commands/integrations.js';
import { workflowStageCommand } from './commands/workflow-stage.js';
import { workflowAuditCommand } from './commands/workflow-audit.js';
import { commitAuditCommand } from './commands/commit-audit.js';
import { docsAuditCommand } from './commands/docs-audit.js';
import { getBanner } from './utils/banner.js';
import { checkForUpdates } from './utils/version-check.js';

function shouldShowBanner(): boolean {
  const argv = process.argv.slice(2);
  const disabledByEnv =
    (process.env.LEE_SPEC_KIT_NO_BANNER || '').trim() === '1';
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
  const groupedCommands = new Map<string, string>([
    ['init', 'Docs Schema Commands:'],
    ['idea', 'Docs Schema Commands:'],
    ['feature', 'Docs Schema Commands:'],
    ['task', 'Docs Schema Commands:'],
    ['decision', 'Docs Schema Commands:'],
    ['docs', 'Workflow Policy Commands:'],
    ['detect', 'Workflow Policy Commands:'],
    ['github', 'Workflow Policy Commands:'],
    ['workflow-stage', 'Workflow Policy Commands:'],
    ['integrations', 'Codex Integration Commands:'],
    ['commit-audit', 'Codex Integration Commands:'],
    ['docs-audit', 'Codex Integration Commands:'],
    ['workflow-audit', 'Codex Integration Commands:'],
  ]);

  for (const command of program.commands) {
    const helpGroup = groupedCommands.get(command.name());
    if (helpGroup) {
      command.helpGroup(helpGroup);
      continue;
    }
    (command as Command & { _hidden?: boolean })._hidden = true;
  }
}

const cliVersion = getCliVersion();

program
  .name('lee-spec-kit')
  .description(
    'Document-centered harness engineering toolkit for AI agent development'
  )
  .version(cliVersion)
  .option('--no-banner', 'Hide banner in help output');

if (shouldShowBanner()) {
  program.addHelpText('beforeAll', getBanner({ version: cliVersion }));
}

initCommand(program);
ideaCommand(program);
featureCommand(program);
updateCommand(program);
configCommand(program);
githubCommand(program);
docsCommand(program);
taskCommand(program);
decisionCommand(program);
detectCommand(program);
workflowStageCommand(program);
integrationsCommand(program);
workflowAuditCommand(program);
commitAuditCommand(program);
docsAuditCommand(program);

configureRootCommandSurface();

await program.parseAsync();

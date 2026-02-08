import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { initCommand } from './commands/init.js';
import { featureCommand } from './commands/feature.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';
import { configCommand } from './commands/config.js';
import { contextCommand } from './commands/context.js';
import { doctorCommand } from './commands/doctor.js';
import { getBanner } from './utils/banner.js';
import { checkForUpdates } from './utils/version-check.js';

function shouldShowBanner(): boolean {
  const argv = process.argv.slice(2);
  const disabledByEnv = (process.env.LEE_SPEC_KIT_NO_BANNER || '').trim() === '1';
  const disabledByFlag = argv.includes('--no-banner');
  return !disabledByEnv && !disabledByFlag;
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

const cliVersion = getCliVersion();

program
  .name('lee-spec-kit')
  .description(
    'Project documentation structure generator for AI-assisted development'
  )
  .version(cliVersion)
  .option('--no-banner', 'Hide banner in help output');

if (shouldShowBanner()) {
  program.addHelpText('beforeAll', getBanner({ version: cliVersion }));
}

initCommand(program);
featureCommand(program);
statusCommand(program);
updateCommand(program);
configCommand(program);
contextCommand(program);
doctorCommand(program);

await program.parseAsync();

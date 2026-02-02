import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { initCommand } from './commands/init.js';
import { featureCommand } from './commands/feature.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';
import { configCommand } from './commands/config.js';
import { contextCommand } from './commands/context.js';
import { checkForUpdates } from './utils/version-check.js';

// 비동기로 새 버전 확인 (CLI 실행 차단하지 않음)
checkForUpdates();

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

program
  .name('lee-spec-kit')
  .description(
    'Project documentation structure generator for AI-assisted development'
  )
  .version(getCliVersion());

initCommand(program);
featureCommand(program);
statusCommand(program);
updateCommand(program);
configCommand(program);
contextCommand(program);

program.parse();

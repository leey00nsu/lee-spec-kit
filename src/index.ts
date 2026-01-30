import { program } from 'commander';
import { initCommand } from './commands/init.js';
import { featureCommand } from './commands/feature.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';
import { configCommand } from './commands/config.js';
import { checkForUpdates } from './utils/version-check.js';

// 비동기로 새 버전 확인 (CLI 실행 차단하지 않음)
checkForUpdates();

program
  .name('lee-spec-kit')
  .description(
    'Project documentation structure generator for AI-assisted development'
  )
  .version('0.2.0');

initCommand(program);
featureCommand(program);
statusCommand(program);
updateCommand(program);
configCommand(program);

program.parse();

import { Command } from 'commander';
import { toCliError } from '../utils/cli-error.js';
import { collectWorkflowStage } from '../utils/workflow-stage.js';

interface WorkflowStageOptions {
  json?: boolean;
  component?: string;
}

export function workflowStageCommand(program: Command): void {
  program
    .command('workflow-stage [feature-name]')
    .description('Resolve the current high-level workflow stage for the active feature')
    .option('--json', 'Output JSON for agents and hooks')
    .option('--component <component>', 'Component name for multi projects')
    .action(async (featureName: string | undefined, options: WorkflowStageOptions) => {
      try {
        const payload = await collectWorkflowStage(
          process.cwd(),
          featureName,
          options.component
        );
        if (options.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        if (payload.status !== 'ok') {
          console.log(`${payload.status}: ${payload.reasonCode}`);
          process.exitCode = 1;
          return;
        }
        console.log(`stage: ${payload.stage}`);
        if (payload.nextAction) {
          console.log(`next: ${payload.nextAction.category}`);
        }
      } catch (error) {
        const cliError = toCliError(error);
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'error',
                reasonCode: cliError.code,
                error: cliError.message,
              },
              null,
              2
            )
          );
          process.exitCode = 1;
          return;
        }
        process.stderr.write(`[${cliError.code}] ${cliError.message}\n`);
        process.exitCode = 1;
      }
    });
}

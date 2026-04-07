import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { detectSchemaProject } from '../adapters/schema/index.js';

interface DetectOptions {
  dir?: string;
  json?: boolean;
}

type DetectionReasonCode = 'PROJECT_DETECTED' | 'PROJECT_NOT_DETECTED';
type DetectionSource = 'config' | 'heuristic';

export function detectCommand(program: Command): void {
  program
    .command('detect')
    .description(tr(DEFAULT_LANG, 'cli', 'detect.cmdDescription'))
    .option('--dir <dir>', tr(DEFAULT_LANG, 'cli', 'detect.optDir'))
    .option('--json', tr(DEFAULT_LANG, 'cli', 'detect.optJson'))
    .action(async (options: DetectOptions) => {
      try {
        await runDetect(options);
      } catch (error) {
        const config = await getConfig(process.cwd());
        const lang = config?.lang ?? DEFAULT_LANG;
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, lang);
        if (options.json) {
          console.log(
            JSON.stringify({
              status: 'error',
              reasonCode: cliError.code,
              error: cliError.message,
              suggestions,
            })
          );
        } else {
          console.error(
            chalk.red(tr(lang, 'cli', 'common.errorLabel')),
            chalk.red(`[${cliError.code}] ${cliError.message}`)
          );
          printCliErrorSuggestions(suggestions, lang);
        }
        process.exitCode = 1;
        return;
      }
    });
}

async function runDetect(options: DetectOptions): Promise<void> {
  const cwd = process.cwd();
  const targetCwd = options.dir ? path.resolve(cwd, options.dir) : cwd;
  const detection = await detectSchemaProject(targetCwd);
  const config = detection.config;

  const detected = !!config;
  const reasonCode: DetectionReasonCode = detected
    ? 'PROJECT_DETECTED'
    : 'PROJECT_NOT_DETECTED';

  if (options.json) {
    if (!config) {
      console.log(
        JSON.stringify(
          {
            status: 'ok',
            reasonCode,
            isLeeSpecKitProject: false,
            targetCwd,
            docsDir: null,
            configPath: null,
            configFilePresent: false,
            detectionSource: null,
            projectType: null,
            lang: null,
            projectName: null,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          reasonCode,
          isLeeSpecKitProject: true,
          targetCwd,
          docsDir: detection.docsDir,
          configPath: detection.configPath,
          configFilePresent: detection.configFilePresent,
          detectionSource: detection.detectionSource,
          projectType: config.projectType,
          lang: config.lang,
          projectName: config.projectName ?? null,
        },
        null,
        2
      )
    );
    return;
  }

  const lang = config?.lang ?? DEFAULT_LANG;
  console.log();
  console.log(chalk.blue(tr(lang, 'cli', 'detect.header')));
  console.log(chalk.gray(`- ${tr(lang, 'cli', 'detect.labelTarget')}: ${targetCwd}`));

  if (!config) {
    console.log(chalk.yellow(`- ${tr(lang, 'cli', 'detect.resultNotDetected')}`));
    console.log(chalk.gray(`- ${tr(lang, 'cli', 'detect.notDetectedHint')}`));
    console.log();
    return;
  }

  console.log(chalk.green(`- ${tr(lang, 'cli', 'detect.resultDetected')}`));
  console.log(chalk.gray(`- ${tr(lang, 'cli', 'detect.labelDocsDir')}: ${detection.docsDir}`));
  console.log(
    chalk.gray(
      `- ${tr(lang, 'cli', 'detect.labelConfigPath')}: ${
        detection.configPath || '-'
      }`
    )
  );
  console.log(
    chalk.gray(
      `- ${tr(lang, 'cli', 'detect.labelSource')}: ${tr(
        lang,
        'cli',
        detection.detectionSource === 'config'
          ? 'detect.sourceConfig'
          : 'detect.sourceHeuristic'
      )}`
    )
  );
  console.log(
    chalk.gray(
      `- ${tr(lang, 'cli', 'detect.labelProjectType')}: ${config.projectType}`
    )
  );
  console.log(chalk.gray(`- ${tr(lang, 'cli', 'detect.labelLang')}: ${config.lang}`));
  if (config.projectName) {
    console.log(
      chalk.gray(
        `- ${tr(lang, 'cli', 'detect.labelProjectName')}: ${config.projectName}`
      )
    );
  }
  console.log();
}

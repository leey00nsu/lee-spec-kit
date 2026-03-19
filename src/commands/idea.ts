import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '../utils/config.js';
import type { Lang } from '../utils/i18n.js';
import {
  assertAllowedComponent,
  resolveProjectComponents,
} from '../utils/components.js';
import {
  assertValid,
  validateIdeaIdWithLang,
  validateSafeNameWithLang,
} from '../utils/validation.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { getDocsLockPath, withFileLock } from '../utils/lock.js';
import { getTemplatesDir } from '../utils/paths.js';
import { getLocalDateString } from '../utils/date.js';

interface IdeaOptions {
  component?: string;
  id?: string;
  desc?: string;
  nonInteractive?: boolean;
  json?: boolean;
}

interface IdeaRunResult {
  ideaId: string;
  ideaName: string;
  component?: string;
  ideaPath: string;
  ideaPathFromDocs: string;
}

export function ideaCommand(program: Command): void {
  program
    .command('idea <name>')
    .description('Create a new indexed idea document')
    .option('--component <component>', 'Component name (optional)')
    .option('--id <id>', 'Idea ID (default: auto)')
    .option('-d, --desc <description>', 'Idea description for the document')
    .option('--non-interactive', 'Reserved for parity with other generators')
    .option('--json', 'Output in JSON format for agents')
    .action(async (name: string, options: IdeaOptions) => {
      try {
        const result = await runIdea(name, options);
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                reasonCode: 'IDEA_CREATED',
                ideaId: result.ideaId,
                ideaName: result.ideaName,
                component: result.component,
                ideaPath: result.ideaPath,
                ideaPathFromDocs: result.ideaPathFromDocs,
              },
              null,
              2
            )
          );
        }
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
          process.exitCode = 1;
          return;
        }
        console.error(
          chalk.red(tr(lang, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        printCliErrorSuggestions(suggestions, lang);
        process.exitCode = 1;
      }
    });
}

async function runIdea(name: string, options: IdeaOptions): Promise<IdeaRunResult> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    throw createCliError(
      'DOCS_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.docsNotFound')
    );
  }

  const { docsDir, projectType, lang } = config;
  const configuredComponents = resolveProjectComponents(
    projectType,
    config.components
  );

  assertValid(
    validateSafeNameWithLang(name, lang),
    tr(lang, 'cli', 'validation.context.ideaName'),
    lang
  );

  let component = (options.component || '').trim().toLowerCase();
  if (component && projectType === 'single') {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--component` can only be used in multi mode.'
    );
  }
  if (projectType === 'multi' && component) {
    assertAllowedComponent(component, configuredComponents);
  }

  return withFileLock(
    getDocsLockPath(docsDir),
    async () => {
      const ideaId = options.id
        ? validateProvidedIdeaId(options.id, lang)
        : await getNextIdeaId(docsDir);
      const ideasDir = path.join(docsDir, 'ideas');
      const ideaFileName = `${ideaId}-${name}.md`;
      const ideaPath = path.join(ideasDir, ideaFileName);

      if (await fs.pathExists(ideaPath)) {
        throw createCliError(
          'INVALID_ARGUMENT',
          tr(lang, 'cli', 'idea.fileExists', { path: ideaPath })
        );
      }

      const templatePath = path.join(
        getTemplatesDir(),
        lang,
        'common',
        'ideas',
        'idea.md'
      );
      if (!(await fs.pathExists(templatePath))) {
        throw createCliError(
          'DOCS_NOT_FOUND',
          tr(lang, 'cli', 'idea.templateNotFound')
        );
      }

      await fs.mkdir(ideasDir, { recursive: true });
      const template = await fs.readFile(templatePath, 'utf-8');
      const content = applyIdeaTemplate(template, {
        ideaId,
        name,
        description: options.desc || '',
        component: component || '-',
        created: getLocalDateString(),
      });
      await fs.writeFile(ideaPath, content, 'utf-8');

      if (!options.json) {
        console.log();
        console.log(chalk.green(tr(lang, 'cli', 'idea.created', { path: ideaPath })));
        console.log();
        console.log(chalk.blue(tr(lang, 'cli', 'idea.nextStepsTitle')));
        console.log(chalk.gray(tr(lang, 'cli', 'idea.nextSteps1')));
        console.log(chalk.gray(tr(lang, 'cli', 'idea.nextSteps2', { ideaId })));
        console.log(chalk.gray(tr(lang, 'cli', 'idea.nextSteps3')));
        console.log();
      }

      return {
        ideaId,
        ideaName: name,
        component: component || undefined,
        ideaPath,
        ideaPathFromDocs: path.relative(docsDir, ideaPath),
      };
    },
    { owner: 'idea' }
  );
}

function validateProvidedIdeaId(id: string, lang: Lang): string {
  assertValid(
    validateIdeaIdWithLang(id, lang),
    tr(lang, 'cli', 'validation.context.ideaId'),
    lang
  );
  return id;
}

function applyIdeaTemplate(
  template: string,
  values: {
    ideaId: string;
    name: string;
    description: string;
    component: string;
    created: string;
  }
): string {
  return template
    .replaceAll('{idea-id}', values.ideaId)
    .replaceAll('{idea-name}', values.name)
    .replaceAll('{YYYY-MM-DD}', values.created)
    .replaceAll('{{description}}', values.description)
    .replaceAll('{component}', values.component);
}

async function getNextIdeaId(docsDir: string): Promise<string> {
  const ideasDir = path.join(docsDir, 'ideas');
  let max = 0;

  if (await fs.pathExists(ideasDir)) {
    const entries = await fs.readdir(ideasDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^I(\d+)-/);
      if (!match) continue;
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }

  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `I${String(next).padStart(width, '0')}`;
}

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  BuiltinDocId,
  getBuiltinDoc,
  getBuiltinDocIds,
  listBuiltinDocs,
  normalizeBuiltinDocId,
  toBuiltinDocCommand,
} from '../utils/builtin-docs.js';
import { getGithubDraftContractForBuiltinDoc } from '../utils/github-draft-contract.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

interface DocsBaseOptions {
  json?: boolean;
}

interface DocsGetOptions extends DocsBaseOptions {
  id?: string;
}

function ensureDocConfig(config: Awaited<ReturnType<typeof getConfig>>) {
  if (config) return config;
  throw createCliError(
    'CONFIG_NOT_FOUND',
    tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
  );
}

function toDocIdOrThrow(raw: string, lang: 'ko' | 'en'): BuiltinDocId {
  const docId = normalizeBuiltinDocId(raw);
  if (docId) return docId;
  const available = getBuiltinDocIds().join(', ');
  throw createCliError(
    'INVALID_ARGUMENT',
    tr(lang, 'cli', 'docs.invalidDocId', {
      docId: raw,
      available,
    })
  );
}

export function docsCommand(program: Command): void {
  const defaultLang = DEFAULT_LANG;
  const docs = program
    .command('docs')
    .description(tr(defaultLang, 'cli', 'docs.cmdDocsDescription'));

  docs
    .command('list')
    .description(tr(defaultLang, 'cli', 'docs.cmdListDescription'))
    .option('--json', tr(defaultLang, 'cli', 'docs.optJson'))
    .action(async (options: DocsBaseOptions) => {
      try {
        const config = ensureDocConfig(await getConfig(process.cwd()));
        const docsList = listBuiltinDocs(config.projectType, config.lang).map((doc) => ({
          id: doc.id,
          title: doc.title,
          command: toBuiltinDocCommand(doc.id),
          source: `builtin://${doc.relativePath}`,
        }));

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                reasonCode: 'DOCS_LISTED',
                lang: config.lang,
                projectType: config.projectType,
                docs: docsList,
              },
              null,
              2
            )
          );
          return;
        }

        console.log();
        console.log(chalk.bold(tr(config.lang, 'cli', 'docs.listHeader')));
        for (const doc of docsList) {
          console.log(`- ${doc.id}: ${doc.title}`);
          console.log(chalk.gray(`  ${doc.command}`));
        }
        console.log();
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

  docs
    .command('get <doc-id>')
    .description(tr(defaultLang, 'cli', 'docs.cmdGetDescription'))
    .option('--json', tr(defaultLang, 'cli', 'docs.optJson'))
    .action(async (docRaw: string, options: DocsGetOptions) => {
      try {
        const config = ensureDocConfig(await getConfig(process.cwd()));
        const docId = toDocIdOrThrow(docRaw, config.lang);
        const loaded = await getBuiltinDoc(docId, config.projectType, config.lang);
        const followups = loaded.followups.map((id) => ({
          id,
          command: toBuiltinDocCommand(id),
        }));
        const contract = getGithubDraftContractForBuiltinDoc(docId, config.lang);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                reasonCode: 'DOC_FETCHED',
                lang: config.lang,
                projectType: config.projectType,
                doc: {
                  id: loaded.entry.id,
                  title: loaded.entry.title,
                  source: `builtin://${loaded.entry.relativePath}`,
                  hash: loaded.hash,
                  content: loaded.content,
                },
                requiredDocs: followups,
                contract: contract || undefined,
              },
              null,
              2
            )
          );
          return;
        }

        const relativeFromCwd = path.relative(process.cwd(), loaded.entry.absolutePath);
        console.log();
        console.log(chalk.bold(`📄 ${loaded.entry.id}: ${loaded.entry.title}`));
        console.log(
          chalk.gray(
            `${tr(config.lang, 'cli', 'docs.sourceLabel')}: ${
              relativeFromCwd || loaded.entry.absolutePath
            }`
          )
        );
        console.log(
          chalk.gray(`${tr(config.lang, 'cli', 'docs.hashLabel')}: ${loaded.hash}`)
        );
        console.log();
        process.stdout.write(loaded.content.endsWith('\n') ? loaded.content : `${loaded.content}\n`);
        if (followups.length > 0) {
          console.log();
          console.log(chalk.blue(`${tr(config.lang, 'cli', 'docs.nextDocs')}:`));
          for (const followup of followups) {
            console.log(chalk.gray(`- ${followup.command}`));
          }
          console.log();
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

import { Command } from 'commander';
import { getConfig } from '../utils/config.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import {
  collectDocsTaxonomyViolations,
  type DocsTaxonomyViolation,
} from '../utils/docs-taxonomy.js';

interface DocsAuditOptions {
  json?: boolean;
}

interface DocsAuditPayload {
  status: 'ok' | 'warning' | 'error';
  reasonCode:
    | 'DOCS_TAXONOMY_OK'
    | 'DOCS_TAXONOMY_WARNING'
    | 'CONFIG_NOT_FOUND'
    | 'UNEXPECTED_ERROR';
  mode: 'warn';
  docsDir: string | null;
  violations: DocsTaxonomyViolation[];
}

export function docsAuditCommand(program: Command): void {
  program
    .command('docs-audit')
    .description(
      'Audit whether managed documents are stored in the right location'
    )
    .option('--json', 'Output JSON for agents and automation')
    .action(async (options: DocsAuditOptions) => {
      try {
        const payload = await collectDocsAudit(process.cwd());
        if (options.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        console.log(`${payload.status}: ${payload.reasonCode}`);
        for (const violation of payload.violations) {
          console.log(`- ${violation.path}: ${violation.message}`);
        }
      } catch (error) {
        const cliError = toCliError(error);
        const payload: DocsAuditPayload = {
          status: 'error',
          reasonCode:
            cliError.code === 'CONFIG_NOT_FOUND'
              ? 'CONFIG_NOT_FOUND'
              : 'UNEXPECTED_ERROR',
          mode: 'warn',
          docsDir: null,
          violations: [],
        };
        if (options.json) {
          console.log(
            JSON.stringify({ ...payload, error: cliError.message }, null, 2)
          );
        } else {
          process.stderr.write(`[${cliError.code}] ${cliError.message}\n`);
        }
        process.exitCode = 1;
      }
    });
}

async function collectDocsAudit(cwd: string): Promise<DocsAuditPayload> {
  const config = await getConfig(cwd);
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'Config file not found. Run `init` first.'
    );
  }

  const violations = await collectDocsTaxonomyViolations(config.docsDir);
  return {
    status: violations.length > 0 ? 'warning' : 'ok',
    reasonCode:
      violations.length > 0 ? 'DOCS_TAXONOMY_WARNING' : 'DOCS_TAXONOMY_OK',
    mode: 'warn',
    docsDir: config.docsDir,
    violations,
  };
}

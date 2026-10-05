import { Command } from 'commander';
import { getConfig } from '../utils/config.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import {
  collectDocsTaxonomyViolations,
  type DocsTaxonomyViolation,
} from '../utils/docs-taxonomy.js';
import {
  collectDocsFeatureReferences,
  type DocsFeatureReferenceViolation,
} from '../utils/docs-feature-references.js';

interface DocsAuditOptions {
  json?: boolean;
  enforce?: boolean;
}

interface DocsAuditPayload {
  status: 'ok' | 'warning' | 'blocked' | 'error';
  reasonCode:
    | 'DOCS_TAXONOMY_OK'
    | 'DOCS_TAXONOMY_WARNING'
    | 'FEATURE_REFERENCE_IN_SHARED_DOC'
    | 'CONFIG_NOT_FOUND'
    | 'UNEXPECTED_ERROR';
  mode: 'warn' | 'enforce';
  docsDir: string | null;
  violations: Array<DocsTaxonomyViolation | DocsFeatureReferenceViolation>;
}

export function docsAuditCommand(program: Command): void {
  program
    .command('docs-audit')
    .description(
      'Audit document routing and concrete Feature/task references in shared docs'
    )
    .option('--json', 'Output JSON for agents and automation')
    .option(
      '--enforce',
      'Exit non-zero for forbidden shared-document references'
    )
    .action(async (options: DocsAuditOptions) => {
      try {
        const payload = await collectDocsAudit(process.cwd());
        if (options.enforce && payload.status === 'blocked')
          process.exitCode = 1;
        if (options.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        console.log(`${payload.status}: ${payload.reasonCode}`);
        for (const violation of payload.violations) {
          const location =
            'line' in violation ? `:${violation.line}:${violation.column}` : '';
          console.log(`- ${violation.path}${location}: ${violation.message}`);
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

  const references = await collectDocsFeatureReferences(config.docsDir);
  const violations = [
    ...(await collectDocsTaxonomyViolations(config.docsDir)),
    ...references,
  ];
  return {
    status:
      references.length > 0
        ? 'blocked'
        : violations.length > 0
          ? 'warning'
          : 'ok',
    reasonCode:
      references.length > 0
        ? 'FEATURE_REFERENCE_IN_SHARED_DOC'
        : violations.length > 0
          ? 'DOCS_TAXONOMY_WARNING'
          : 'DOCS_TAXONOMY_OK',
    mode: references.length > 0 ? 'enforce' : 'warn',
    docsDir: config.docsDir,
    violations,
  };
}

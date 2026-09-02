import { Command } from 'commander';
import { getConfig } from '../utils/config.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import { resolveFeatureSelection } from '../utils/feature-resolver.js';
import {
  inspectOpenWikiKnowledge,
  isOpenWikiEnabled,
  probeOpenWikiRuntime,
  runOpenWikiSync,
} from '../utils/openwiki-knowledge.js';

interface KnowledgeOptions {
  component?: string;
  json?: boolean;
  enforce?: boolean;
}

export function knowledgeCommand(program: Command): void {
  const knowledge = program
    .command('knowledge')
    .description('Manage the experimental required OpenWiki knowledge layer');

  knowledge
    .command('doctor [feature-name]')
    .description('Check OpenWiki runtime and project Knowledge readiness')
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON')
    .action(async (featureName: string | undefined, options: KnowledgeOptions) => {
      await handleKnowledgeAction(options, async () => {
        const context = await resolveKnowledgeContext(featureName, options);
        if (!isOpenWikiEnabled(context.config)) {
          return {
            status: 'disabled',
            reasonCode: 'OPENWIKI_DISABLED',
            enabled: false,
            knowledgeState: await inspectOpenWikiKnowledge(context),
          };
        }
        const runtime = probeOpenWikiRuntime();
        const knowledgeState = await inspectOpenWikiKnowledge(context);
        return {
          status: runtime.ok ? 'ok' : 'blocked',
          reasonCode: runtime.ok ? 'OPENWIKI_RUNTIME_READY' : runtime.reasonCode,
          enabled: isOpenWikiEnabled(context.config),
          runtime,
          knowledgeState,
        };
      });
    });

  knowledge
    .command('sync [feature-name]')
    .description('Generate or update OpenWiki and write a verified receipt')
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON')
    .action(async (featureName: string | undefined, options: KnowledgeOptions) => {
      await handleKnowledgeAction(options, async () => {
        const context = await resolveKnowledgeContext(featureName, options);
        return runOpenWikiSync(context);
      });
    });

  knowledge
    .command('audit [feature-name]')
    .description('Validate OpenWiki freshness, output scope, and receipt')
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON')
    .option('--enforce', 'Exit non-zero unless Knowledge is verified or disabled')
    .action(async (featureName: string | undefined, options: KnowledgeOptions) => {
      await handleKnowledgeAction(options, async () => {
        const context = await resolveKnowledgeContext(featureName, options);
        const payload = await inspectOpenWikiKnowledge(context);
        if (
          options.enforce &&
          payload.status !== 'verified' &&
          payload.status !== 'disabled'
        ) {
          process.exitCode = 1;
        }
        return payload;
      });
    });
}

async function resolveKnowledgeContext(
  featureName: string | undefined,
  options: KnowledgeOptions
) {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError('CONFIG_NOT_FOUND', 'Config file not found. Run `init` first.');
  }
  const selection = await resolveFeatureSelection(
    process.cwd(),
    featureName,
    options.component
  );
  if (selection.status !== 'selected' || !selection.matchedFeature) {
    throw createCliError(
      'FEATURE_SELECTION_REQUIRED',
      'Select exactly one active Feature before running a Knowledge command.'
    );
  }
  const feature = selection.matchedFeature;
  return {
    config,
    featureRef: feature.folderName,
    component: feature.type,
    projectCwd: feature.git.projectGitCwd,
  };
}

async function handleKnowledgeAction(
  options: KnowledgeOptions,
  action: () => Promise<unknown>
): Promise<void> {
  try {
    const payload = await action();
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    const value = payload as { status?: string; reasonCode?: string };
    console.log(`${value.status || 'ok'}: ${value.reasonCode || 'OPENWIKI_OK'}`);
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
}

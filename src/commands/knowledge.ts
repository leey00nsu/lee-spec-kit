import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import { getConfig } from '../utils/config.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import { resolveFeatureSelection } from '../utils/feature-resolver.js';
import {
  inspectOpenWikiKnowledge,
  isOpenWikiEnabled,
  probeOpenWikiProvider,
  probeOpenWikiRuntime,
  runOpenWikiSync,
} from '../utils/openwiki-knowledge.js';
import {
  CURATED_IMPACT_GRANDFATHER_MARKER,
  parseCuratedDocumentationImpact,
} from '../utils/documentation-impact.js';
import { getDocsLockPath, withFileLock } from '../utils/lock.js';

interface KnowledgeOptions {
  component?: string;
  json?: boolean;
  enforce?: boolean;
  lockTimeoutMs?: string;
  idleTimeoutMs?: string;
  absoluteTimeoutMs?: string;
  apply?: boolean;
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
    .action(
      async (featureName: string | undefined, options: KnowledgeOptions) => {
        await handleKnowledgeAction(options, async () => {
          const config = await getConfig(process.cwd());
          if (!config) {
            throw createCliError(
              'CONFIG_NOT_FOUND',
              'Config file not found. Run `init` first.'
            );
          }
          const selection = await resolveFeatureSelection(
            process.cwd(),
            featureName,
            options.component
          );
          const feature = selection.matchedFeature;
          if (featureName?.trim() && !feature) {
            throw createCliError(
              'FEATURE_SELECTION_REQUIRED',
              `No unique Feature matched ${featureName}. Omit the selector for a runtime-only doctor check or provide an exact Feature reference.`
            );
          }
          const context = feature
            ? {
                config,
                featureRef: feature.folderName,
                component: feature.type,
                projectCwd: feature.git.projectGitCwd,
              }
            : null;
          const featureSelection = {
            status: selection.status,
            selected: feature?.folderName || null,
            candidates: selection.features.map((entry) => entry.folderName),
          };
          if (!isOpenWikiEnabled(config)) {
            return {
              status: 'disabled',
              reasonCode: 'OPENWIKI_DISABLED',
              enabled: false,
              featureSelection,
              knowledgeState: context
                ? await inspectOpenWikiKnowledge(context)
                : null,
            };
          }
          const runtime = probeOpenWikiRuntime();
          const provider = runtime.ok
            ? await probeOpenWikiProvider(runtime)
            : null;
          const knowledgeState = context
            ? await inspectOpenWikiKnowledge(context)
            : null;
          const blocked =
            !runtime.ok ||
            provider?.ok === false ||
            knowledgeState?.status === 'blocked';
          return {
            status: blocked ? 'blocked' : 'ok',
            reasonCode: !runtime.ok
              ? runtime.reasonCode
              : provider?.ok === false
                ? provider.reasonCode
                : knowledgeState?.status === 'blocked'
                  ? knowledgeState.reasonCode
                  : 'OPENWIKI_RUNTIME_READY',
            enabled: true,
            runtime,
            provider,
            featureSelection,
            knowledgeState,
          };
        });
      }
    );

  knowledge
    .command('migrate')
    .description('Dry-run legacy Curated Documentation Impact grandfathering')
    .option(
      '--apply',
      'Mark only approved, terminal, committed legacy Features as grandfathered'
    )
    .option('--json', 'Output JSON')
    .action(async (options: KnowledgeOptions) => {
      await handleKnowledgeAction(options, async () =>
        migrateLegacyDocumentationImpact(process.cwd(), options.apply === true)
      );
    });

  knowledge
    .command('sync [feature-name]')
    .description('Generate or update OpenWiki and write a verified receipt')
    .option('--component <component>', 'Component name for multi projects')
    .option(
      '--lock-timeout-ms <milliseconds>',
      'Lock acquisition timeout override'
    )
    .option('--idle-timeout-ms <milliseconds>', 'No-progress timeout override')
    .option(
      '--absolute-timeout-ms <milliseconds>',
      'Absolute execution timeout override'
    )
    .option('--json', 'Output JSON')
    .action(
      async (featureName: string | undefined, options: KnowledgeOptions) => {
        await handleKnowledgeAction(options, async () => {
          const context = await resolveKnowledgeContext(featureName, options);
          return runOpenWikiSync({
            ...context,
            lockTimeoutMs: parseTimeoutOption(options.lockTimeoutMs),
            idleTimeoutMs: parseTimeoutOption(options.idleTimeoutMs),
            absoluteTimeoutMs: parseTimeoutOption(options.absoluteTimeoutMs),
            onProgress: options.json
              ? undefined
              : (progress) => {
                  const page = progress.currentPage
                    ? ` current=${progress.currentPage}`
                    : '';
                  process.stderr.write(
                    `[openwiki] phase=${progress.phase || 'unknown'} pages=${progress.completedPages}/${progress.totalPages}${page}\n`
                  );
                },
          });
        });
      }
    );

  knowledge
    .command('audit [feature-name]')
    .description('Validate OpenWiki freshness, output scope, and receipt')
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON')
    .option(
      '--enforce',
      'Exit non-zero unless Knowledge is verified or disabled'
    )
    .action(
      async (featureName: string | undefined, options: KnowledgeOptions) => {
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
      }
    );
}

async function migrateLegacyDocumentationImpact(
  cwd: string,
  apply: boolean
): Promise<unknown> {
  const config = await getConfig(cwd);
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'Config file not found. Run `init` first.'
    );
  }
  const selection = await resolveFeatureSelection(cwd);
  const assess = async () => {
    const changedPaths: string[] = [];
    const results: Array<{
      featureRef: string;
      component: string;
      status: 'current' | 'grandfathered' | 'eligible' | 'manual_review';
      reason: string;
      planPath: string;
    }> = [];
    for (const feature of selection.features) {
      const planPath = path.join(feature.path, 'plan.md');
      const tasksPath = path.join(feature.path, 'tasks.md');
      const [plan, tasks] = await Promise.all([
        fs
          .pathExists(planPath)
          .then((exists) => (exists ? fs.readFile(planPath, 'utf-8') : '')),
        fs
          .pathExists(tasksPath)
          .then((exists) => (exists ? fs.readFile(tasksPath, 'utf-8') : '')),
      ]);
      const impact = parseCuratedDocumentationImpact(plan);
      const base = {
        featureRef: feature.folderName,
        component: feature.type,
        planPath,
      };
      if (impact.present && impact.valid) {
        results.push({
          ...base,
          status: 'current',
          reason: 'Curated Documentation Impact is already valid.',
        });
        continue;
      }
      if (impact.grandfathered) {
        results.push({
          ...base,
          status: 'grandfathered',
          reason: 'The legacy policy marker is already present.',
        });
        continue;
      }
      if (impact.present) {
        results.push({
          ...base,
          status: 'manual_review',
          reason: `An incomplete assessment must not be grandfathered: ${impact.errors.join(' ')}`,
        });
        continue;
      }
      const planApproved =
        readMetadataValue(plan, ['Status', '상태']) === 'approved';
      const tasksApproved =
        readMetadataValue(tasks, ['Doc Status', '문서 상태']) === 'approved';
      const taskList = tasks.replace(/```[\s\S]*?```/gu, '');
      const hasDoneTask = /^\s*-\s*\[DONE\]/imu.test(taskList);
      const hasOpenTask = /^\s*-\s*\[(?:TODO|DOING|REVIEW)\]/imu.test(taskList);
      const gitState = inspectCommittedFeatureDocs(
        feature.git.docsGitCwd,
        feature.path
      );
      if (
        !planApproved ||
        !tasksApproved ||
        !hasDoneTask ||
        hasOpenTask ||
        gitState !== 'committed'
      ) {
        results.push({
          ...base,
          status: 'manual_review',
          reason: `Only approved, terminal, fully committed legacy Features are eligible (planApproved=${planApproved}, tasksApproved=${tasksApproved}, hasDoneTask=${hasDoneTask}, hasOpenTask=${hasOpenTask}, gitState=${gitState}).`,
        });
        continue;
      }
      if (apply) {
        const next = `${plan.trimEnd()}\n\n${CURATED_IMPACT_GRANDFATHER_MARKER}\n`;
        const temporary = `${planPath}.${process.pid}.${randomUUID()}.tmp`;
        try {
          await fs.writeFile(temporary, next, {
            encoding: 'utf-8',
            flag: 'wx',
          });
          await fs.rename(temporary, planPath);
          changedPaths.push(planPath);
        } finally {
          await fs.remove(temporary).catch(() => undefined);
        }
      }
      results.push({
        ...base,
        status: apply ? 'grandfathered' : 'eligible',
        reason: apply
          ? 'Recorded a policy-cutover marker without inferring NONE decisions.'
          : 'Eligible for explicit --apply; dry-run made no changes.',
      });
    }
    return {
      status: 'ok',
      reasonCode: apply
        ? 'OPENWIKI_MIGRATION_APPLIED'
        : 'OPENWIKI_MIGRATION_DRY_RUN',
      dryRun: !apply,
      changed: changedPaths,
      features: results,
    };
  };
  return apply
    ? withFileLock(getDocsLockPath(config.docsDir), assess, {
        owner: 'openwiki:migrate',
      })
    : assess();
}

function readMetadataValue(content: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const value = content.match(
      new RegExp(`^\\s*-\\s*\\*\\*${escaped}\\*\\*:\\s*(.*?)\\s*$`, 'imu')
    )?.[1];
    if (value) return value.trim().replace(/^`|`$/gu, '').toLowerCase();
  }
  return '';
}

function inspectCommittedFeatureDocs(
  docsGitCwd: string,
  featurePath: string
): 'committed' | 'dirty' | 'unavailable' {
  try {
    const root = String(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: docsGitCwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    ).trim();
    const relative = path.relative(root, featurePath).replace(/\\/gu, '/');
    const tracked = String(
      execFileSync('git', ['ls-files', '--', relative], {
        cwd: root,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    ).trim();
    const dirty = String(
      execFileSync(
        'git',
        ['status', '--porcelain=v1', '--untracked-files=all', '--', relative],
        {
          cwd: root,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
    ).trim();
    return tracked && !dirty ? 'committed' : 'dirty';
  } catch {
    return 'unavailable';
  }
}

function parseTimeoutOption(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createCliError(
      'INVALID_ARGUMENT',
      'OpenWiki timeout overrides must be positive integer milliseconds.'
    );
  }
  return parsed;
}

async function resolveKnowledgeContext(
  featureName: string | undefined,
  options: KnowledgeOptions
) {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'Config file not found. Run `init` first.'
    );
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
    console.log(
      `${value.status || 'ok'}: ${value.reasonCode || 'OPENWIKI_OK'}`
    );
  } catch (error) {
    const cliError = toCliError(error);
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            status: 'error',
            reasonCode: cliError.code,
            error: cliError.message,
            ...(cliError.details ? { details: cliError.details } : {}),
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

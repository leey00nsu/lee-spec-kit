import type { KnowledgeExecutionEvent } from '../utils/knowledge-execution.js';
import { applyKnowledge, readKnowledgeView } from '../utils/knowledge-apply.js';
import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import { getConfig } from '../utils/config.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import {
  requiresManagedFeatureWorktree,
  resolveFeatureSelection,
} from '../utils/feature-resolver.js';
import {
  inspectOpenWikiKnowledge,
  isOpenWikiEnabled,
  OPENWIKI_DIR,
  OPENWIKI_RECEIPT_PATH,
  probeOpenWikiProvider,
  probeOpenWikiRuntime,
  readOpenWikiReceipt,
  runOpenWikiSync,
  verifyPublishedKnowledgeOutput,
} from '../utils/openwiki-knowledge.js';
import {
  buildCuratedImpactGrandfatherMarker,
  computeFeatureDocumentationFingerprint,
  isTerminalFeatureForCuratedImpact,
  parseCuratedDocumentationImpact,
  removeCuratedImpactGrandfatherMarkers,
} from '../utils/documentation-impact.js';
import {
  publishKnowledge,
  readKnowledgePublicationStatus,
  readLatestKnowledgePublication,
} from '../utils/knowledge-publication.js';
import { buildKnowledgeWorkflow } from '../utils/knowledge-ci.js';
import {
  resolveGitPrimaryWorktreeRoot,
  resolveStandaloneProjectRoots,
} from '../utils/standalone-workspace.js';
import { runGitCapture } from '../utils/git-run.js';
import { getDocsLockPath, withFileLock } from '../utils/lock.js';

function reportKnowledgeProgress(event: KnowledgeExecutionEvent): void {
  // stderr remains separate from the single final --json result on stdout.
  process.stderr.write(`[openwiki] ${JSON.stringify(event)}\n`);
}

interface KnowledgeOptions {
  component?: string;
  json?: boolean;
  enforce?: boolean;
  lockTimeoutMs?: string;
  apply?: boolean;
  ci?: boolean;
  baseBranch?: string;
  baselineRef?: string;
  lang?: string;
}

export function knowledgeCommand(program: Command): void {
  const knowledge = program
    .command('knowledge')
    .description('Manage the derived repository-level OpenWiki knowledge layer');

  knowledge
    .command('publish')
    .alias('update')
    .description(
      'Publish verified repository Knowledge from the CI checkout'
    )
    .option('--component <component>', 'Component name for multi projects')
    .option(
      '--ci',
      'Publish the checked-out integration tip in CI without Feature selection'
    )
    .option('--base-branch <branch>', 'Integration branch for CI')
    .option('--baseline-ref <ref>', 'Verified prior Knowledge branch ref for CI')
    .option('--lang <lang>', 'Knowledge language for CI: ko | en')
    .option('--lock-timeout-ms <milliseconds>', 'Lock acquisition timeout')
    .option('--json', 'Output JSON')
    .action(
      async (options: KnowledgeOptions) => {
        await handleKnowledgeAction(options, async () => {
          if (!options.ci) {
            throw createCliError(
              'OPENWIKI_CI_REQUIRED',
              'Knowledge publication is repository maintenance run by the scheduled or manually dispatched CI workflow. Use `knowledge ci` to scaffold it; `knowledge sync` remains available only for legacy in-place compatibility.'
            );
          }
          const cwd = process.cwd();
          let config = await getConfig(cwd);
          if (options.lang && !['ko', 'en'].includes(options.lang)) {
            throw createCliError('INVALID_ARGUMENT', '--lang must be ko or en.');
          }
          const projectRoot =
            runGitCapture(['rev-parse', '--show-toplevel'], cwd) || cwd;
          config = config || {
            docsDir: path.join(projectRoot, 'docs'),
            projectType: 'single',
            lang: 'en',
            experimental: { openwiki: true },
          };
          config = {
            ...config,
            lang: (options.lang as 'ko' | 'en' | undefined) || config.lang,
            workflow: {
              ...config.workflow,
              baseBranch:
                options.baseBranch || config.workflow?.baseBranch || 'main',
            },
          };
          if (!isOpenWikiEnabled(config)) {
            return { status: 'disabled', reasonCode: 'OPENWIKI_DISABLED' };
          }
          if (
            (await fs.pathExists(
              path.join(projectRoot, OPENWIKI_DIR, 'index.md')
            )) &&
            (await fs.pathExists(
              path.join(projectRoot, OPENWIKI_RECEIPT_PATH)
            ))
          ) {
            const receipt = await readOpenWikiReceipt(projectRoot);
            const current =
              !!receipt &&
              (await verifyPublishedKnowledgeOutput(
                projectRoot,
                config,
                receipt
              )
                .then(() => true)
                .catch(() => false));
            if (current) {
              return {
                status: 'ok',
                reasonCode: 'OPENWIKI_UP_TO_DATE',
                unchanged: true,
                sourceHead:
                  runGitCapture(['rev-parse', 'HEAD'], projectRoot) || null,
              };
            }
          }
          return publishKnowledge({
            config,
            projectRoot,
            component: options.component,
            ci: true,
            baselineRef: options.baselineRef,
            lockTimeoutMs: parseLockTimeoutOption(options.lockTimeoutMs),
            onEvent: reportKnowledgeProgress,
          });
        });
      }
    );

  knowledge
    .command('ci')
    .description(
      'Write the scheduled GitHub Knowledge update workflow (no immediate remote changes)'
    )
    .option(
      '--component <component>',
      'Component name for standalone multi projects'
    )
    .option('--json', 'Output JSON')
    .action(async (options: KnowledgeOptions) => {
      await handleKnowledgeAction(options, async () => {
        const config = await getConfig(process.cwd());
        if (!config)
          throw createCliError('CONFIG_NOT_FOUND', 'Run init first.');
        if (!isOpenWikiEnabled(config))
          throw createCliError(
            'OPENWIKI_DISABLED',
            'Enable experimental.openwiki first.'
          );
        const roots =
          config.docsRepo === 'standalone'
            ? resolveStandaloneProjectRoots(config, options.component)
            : [resolveGitPrimaryWorktreeRoot(config.docsDir)];
        if (roots.length !== 1)
          throw createCliError(
            'COMPONENT_SELECTION_REQUIRED',
            'Select exactly one project component.'
          );
        const target = path.join(
          roots[0],
          '.github',
          'workflows',
          'lee-spec-kit-knowledge.yml'
        );
        const content = buildKnowledgeWorkflow(
          config.workflow?.baseBranch || 'main',
          config.lang,
          program.version() || '0.0.0'
        );
        await fs.ensureDir(path.dirname(target));
        if (await fs.pathExists(target)) {
          if ((await fs.readFile(target, 'utf8')) !== content)
            throw createCliError(
              'OPENWIKI_CI_EXISTS',
              'An existing workflow differs; update it manually instead of overwriting customizations.'
            );
        } else await fs.writeFile(target, content, { flag: 'wx' });
        return { status: 'ok', reasonCode: 'OPENWIKI_CI_READY', path: target };
      });
    });

  knowledge
    .command('apply')
    .description(
      'Apply the verified publication to openwiki/ as a Knowledge-only commit; never calls a model'
    )
    .option(
      '--component <component>',
      'Component name for standalone multi projects'
    )
    .option('--ci', 'Apply in a checked-out CI project repository')
    .option('--base-branch <branch>', 'Integration branch for CI')
    .option('--lang <lang>', 'Knowledge language for CI: ko | en')
    .option('--json', 'Output JSON')
    .action(async (options: KnowledgeOptions) => {
      await handleKnowledgeAction(options, async () => {
        const cwd = process.cwd();
        let config = await getConfig(cwd);
        if (!config && !options.ci)
          throw createCliError('CONFIG_NOT_FOUND', 'Run init first.');
        if (options.ci) {
          if (options.lang && !['ko', 'en'].includes(options.lang))
            throw createCliError('INVALID_ARGUMENT', '--lang must be ko or en.');
          const projectRoot =
            runGitCapture(['rev-parse', '--show-toplevel'], cwd) || cwd;
          config = config || {
            docsDir: path.join(projectRoot, 'docs'),
            projectType: 'single',
            lang: 'en',
            experimental: { openwiki: true },
          };
          config = {
            ...config,
            lang: (options.lang as 'ko' | 'en' | undefined) || config.lang,
            workflow: {
              ...config.workflow,
              baseBranch:
                options.baseBranch || config.workflow?.baseBranch || 'main',
            },
          };
        }
        if (!config)
          throw createCliError('CONFIG_NOT_FOUND', 'Run init first.');
        const roots =
          options.ci
            ? [resolveGitPrimaryWorktreeRoot(cwd)]
            : config.docsRepo === 'standalone'
            ? resolveStandaloneProjectRoots(config, options.component)
            : [resolveGitPrimaryWorktreeRoot(process.cwd())];
        if (roots.length !== 1)
          throw createCliError(
            'COMPONENT_SELECTION_REQUIRED',
            'Select exactly one project component.'
          );
        return applyKnowledge(roots[0], config);
      });
    });

  knowledge
    .command('status')
    .description(
      'Read the last publication attempt and last successful artifact'
    )
    .option(
      '--component <component>',
      'Component name for standalone multi projects'
    )
    .option('--ci', 'Inspect a checked-out CI project repository')
    .option('--base-branch <branch>', 'Integration branch for CI')
    .option('--lang <lang>', 'Knowledge language for CI: ko | en')
    .option('--json', 'Output JSON')
    .action(async (options: KnowledgeOptions) => {
      await handleKnowledgeAction(options, async () => {
        const cwd = process.cwd();
        let config = await getConfig(cwd);
        if (options.ci) {
          if (options.lang && !['ko', 'en'].includes(options.lang))
            throw createCliError('INVALID_ARGUMENT', '--lang must be ko or en.');
          const projectRoot =
            runGitCapture(['rev-parse', '--show-toplevel'], cwd) || cwd;
          config = config || {
            docsDir: path.join(projectRoot, 'docs'),
            projectType: 'single',
            lang: 'en',
            experimental: { openwiki: true },
          };
          config = {
            ...config,
            lang: (options.lang as 'ko' | 'en' | undefined) || config.lang,
            workflow: {
              ...config.workflow,
              baseBranch:
                options.baseBranch || config.workflow?.baseBranch || 'main',
            },
          };
        } else if (options.baseBranch || options.lang) {
          throw createCliError(
            'INVALID_ARGUMENT',
            'Branch/language overrides are only available with --ci.'
          );
        }
        const roots =
          options.ci
            ? [resolveGitPrimaryWorktreeRoot(cwd)]
            : config?.docsRepo === 'standalone'
            ? resolveStandaloneProjectRoots(config, options.component)
            : config
              ? [resolveGitPrimaryWorktreeRoot(config.docsDir)]
              : [process.cwd()];
        if (roots.length !== 1)
          throw createCliError(
            'COMPONENT_SELECTION_REQUIRED',
            'Select exactly one project component.'
          );
        const attempt = await readKnowledgePublicationStatus(roots[0]);
        const latest = readLatestKnowledgePublication(roots[0]);
        const baseBranch = config?.workflow?.baseBranch || 'main';
        const currentRevision =
          runGitCapture(['rev-parse', `refs/heads/${baseBranch}`], roots[0]) ||
          runGitCapture(['rev-parse', 'HEAD'], roots[0]) ||
          null;
        const repositoryState = config
          ? await inspectOpenWikiKnowledge({
              config,
              featureRef: 'integrated',
              component: options.component || config.projectType,
              projectCwd: roots[0],
            })
          : null;
        const receipt = await readOpenWikiReceipt(roots[0]);
        let trackedValidationError: string | null = null;
        const trackedCurrent =
          !!config &&
          !!receipt &&
          (await verifyPublishedKnowledgeOutput(roots[0], config, receipt)
            .then(() => true)
            .catch((error: unknown) => {
              trackedValidationError =
                error instanceof Error ? error.message : 'validation failed';
              return false;
            }));
        const workingCopy = config
          ? await readKnowledgeView(roots[0], config)
          : null;
        const freshness = trackedCurrent
          ? 'current'
          : attempt?.status === 'failed' || attempt?.status === 'interrupted'
            ? 'failed'
            : receipt || latest
              ? 'stale'
              : 'missing';
        return {
          status: 'ok',
          reasonCode: 'OPENWIKI_PUBLICATION_STATUS',
          knowledge: {
            status: freshness,
            publishedRevision:
              receipt?.sourceHead || latest?.sourceHead || null,
            currentRevision,
          },
          attempt,
          latest,
          ...(repositoryState && !trackedCurrent ? { repositoryState } : {}),
          ...(trackedValidationError ? { trackedValidationError } : {}),
          ...(workingCopy ? { workingCopy } : {}),
        };
      });
    });

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
    .description(
      'Legacy in-place generation; use publish for integrated artifacts'
    )
    .option('--component <component>', 'Component name for multi projects')
    .option(
      '--lock-timeout-ms <milliseconds>',
      'Lock acquisition timeout override'
    )
    .option('--json', 'Output JSON')
    .action(
      async (featureName: string | undefined, options: KnowledgeOptions) => {
        await handleKnowledgeAction(options, async () => {
          const context = await resolveKnowledgeContext(
            featureName,
            options,
            true
          );
          return runOpenWikiSync({
            ...context,
            lockTimeoutMs: parseLockTimeoutOption(options.lockTimeoutMs),
            onEvent: reportKnowledgeProgress,
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
      schemaStatus: string;
      reason: string;
      planPath: string;
    }> = [];
    for (const feature of selection.features) {
      const specPath = path.join(feature.path, 'spec.md');
      const planPath = path.join(feature.path, 'plan.md');
      const tasksPath = path.join(feature.path, 'tasks.md');
      const [spec, plan, tasks] = await Promise.all([
        fs
          .pathExists(specPath)
          .then((exists) => (exists ? fs.readFile(specPath, 'utf-8') : '')),
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
        schemaStatus: impact.schemaStatus,
      };
      if (impact.schemaStatus === 'current-v2' && impact.valid) {
        results.push({
          ...base,
          status: 'current',
          reason: 'Curated Documentation Impact is already valid.',
        });
        continue;
      }
      if (impact.grandfathered) {
        const terminal = isTerminalFeatureForCuratedImpact({
          spec,
          plan,
          tasks,
        });
        const currentFingerprint = await computeFeatureDocumentationFingerprint(
          feature.path
        );
        const gitState = inspectCommittedFeatureDocs(
          feature.git.docsGitCwd,
          feature.path
        );
        const validGrandfather =
          terminal.terminal &&
          gitState === 'committed' &&
          impact.grandfatheredFingerprint === currentFingerprint;
        results.push({
          ...base,
          status: validGrandfather ? 'grandfathered' : 'manual_review',
          reason: validGrandfather
            ? 'The provenance-bound legacy policy marker is valid.'
            : `The grandfather marker is stale or the Feature is no longer terminal (gitState=${gitState}; ${terminal.reasons.join(', ') || 'feature documentation fingerprint changed'}).`,
        });
        continue;
      }
      if (impact.schemaStatus === 'partial') {
        results.push({
          ...base,
          status: 'manual_review',
          reason: `An incomplete assessment must not be grandfathered: ${impact.errors.join(' ')}`,
        });
        continue;
      }
      const terminal = isTerminalFeatureForCuratedImpact({
        spec,
        plan,
        tasks,
      });
      const gitState = inspectCommittedFeatureDocs(
        feature.git.docsGitCwd,
        feature.path
      );
      if (!terminal.terminal || gitState !== 'committed') {
        results.push({
          ...base,
          status: 'manual_review',
          reason: `Only approved, terminal, fully committed legacy Features are eligible (gitState=${gitState}; ${terminal.reasons.join(', ') || 'terminal document state confirmed'}).`,
        });
        continue;
      }
      if (apply) {
        const fingerprint = await computeFeatureDocumentationFingerprint(
          feature.path
        );
        const next = `${removeCuratedImpactGrandfatherMarkers(plan)}\n\n${buildCuratedImpactGrandfatherMarker(fingerprint)}\n`;
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
        schemaStatus: apply ? 'grandfathered' : impact.schemaStatus,
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

function parseLockTimeoutOption(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createCliError(
      'INVALID_ARGUMENT',
      'The Knowledge lock timeout must be a positive integer in milliseconds.'
    );
  }
  return parsed;
}

async function resolveKnowledgeContext(
  featureName: string | undefined,
  options: KnowledgeOptions,
  requireExecutionWorktree = false
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
  if (
    requireExecutionWorktree &&
    requiresManagedFeatureWorktree(config, feature.id) &&
    !feature.git.managedWorktree
  ) {
    throw createCliError(
      'OPENWIKI_WORKTREE_REQUIRED',
      'Knowledge sync must run in the registered managed Feature worktree. Run the branch/worktree command returned by `workflow-stage`, then retry.'
    );
  }
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

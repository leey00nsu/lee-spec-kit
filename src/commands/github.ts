import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import chalk from 'chalk';
import { tr } from '../utils/i18n.js';
import {
  createCliError,
  toCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
} from '../utils/cli-error.js';
import { runProcessOrThrow } from './github/process.js';
import * as ghService from '../services/GithubWorkflowService.js';

export function githubCommand(program: Command): void {
  const commandLang = ghService.detectGithubCliLangSync(process.cwd());
  const github = program
    .command('github')
    .description(ghService.tg(commandLang, 'cmdGithubDescription'));

  github
    .command('issue [feature-name]')
    .description(ghService.tg(commandLang, 'cmdIssueDescription'))
    .option('--json', ghService.tg(commandLang, 'optJson'))
    .option(
      '--component <component>',
      ghService.tg(commandLang, 'optComponent')
    )
    .option('--title <title>', ghService.tg(commandLang, 'optIssueTitle'))
    .option('--labels <labels>', ghService.tg(commandLang, 'optLabels'))
    .option('--body-file <path>', ghService.tg(commandLang, 'optIssueBodyFile'))
    .option(
      '--assignee <assignee>',
      ghService.tg(commandLang, 'optIssueAssignee')
    )
    .option('--create', ghService.tg(commandLang, 'optIssueCreate'))
    .option('--confirm <reply>', ghService.tg(commandLang, 'optIssueConfirm'))
    .action(
      async (
        featureName: string | undefined,
        options: ghService.GithubIssueOptions
      ) => {
        try {
          const { config, feature } = await ghService.resolveFeatureOrThrow(
            featureName,
            {
              component: options.component,
            },
            commandLang
          );

          const optionLabels = (options.labels || '').trim();
          const generatedLabels = ghService.parseLabels(
            optionLabels || undefined,
            config.lang
          );
          const paths = ghService.getFeatureDocPaths(feature);
          ghService.ensureDocsExist(
            config.docsDir,
            [paths.specPath, paths.planPath, paths.tasksPath],
            config.lang
          );
          const specContent = await fs.readFile(
            path.join(config.docsDir, paths.specPath),
            'utf-8'
          );
          const planContent = await fs.readFile(
            path.join(config.docsDir, paths.planPath),
            'utf-8'
          );
          const tasksContent = await fs.readFile(
            path.join(config.docsDir, paths.tasksPath),
            'utf-8'
          );
          const overview = ghService.resolveOverviewFromSpec(
            specContent,
            feature,
            config.lang
          );

          const defaultTitle = ghService.tg(config.lang, 'issueDefaultTitle', {
            slug: feature.slug,
            summary: ghService.resolveIssueTitleSummary(
              overview,
              feature,
              config.lang
            ),
          });
          const generatedBody = ghService.buildIssueBody(
            specContent,
            planContent,
            tasksContent,
            overview,
            generatedLabels,
            paths,
            config.lang
          );
          ghService.ensureSections(
            generatedBody,
            ghService.getRequiredIssueSections(config.lang),
            ghService.tg(config.lang, 'kindIssue'),
            config.lang
          );

          const defaultBodyFile = ghService.toBodyFilePath(
            options.bodyFile,
            'issue',
            config.docsDir,
            feature.type,
            config.lang
          );
          const explicitBodyFile = (options.bodyFile || '').trim();
          const preparedBody = await ghService.prepareGithubBody({
            create: options.create,
            explicitBodyFile,
            defaultBodyFile,
            workflowDraftPath: path.join(config.docsDir, paths.issuePath),
            generatedBody,
            requiredSections: ghService.getRequiredIssueSections(config.lang),
            kindLabel: ghService.tg(config.lang, 'kindIssue'),
            lang: config.lang,
          });
          const body = ghService.stripIssueDraftMetadataSection(preparedBody.body);
          let bodyFile = preparedBody.bodyFile;
          if (options.create && body !== preparedBody.body) {
            const sanitizedBodyFile = ghService.toBodyFilePath(
              undefined,
              'issue',
              config.docsDir,
              `${feature.type}-issue-sanitized`,
              config.lang
            );
            await fs.ensureDir(path.dirname(sanitizedBodyFile));
            await fs.writeFile(sanitizedBodyFile, body, 'utf-8');
            bodyFile = sanitizedBodyFile;
          }
          const title =
            options.title?.trim() ||
            (preparedBody.source === 'workflow-ready' &&
            !ghService.isPlaceholderWorkflowDraftTitle(
              preparedBody.draftMetadata?.title,
              feature
            )
              ? preparedBody.draftMetadata?.title
              : undefined) ||
            defaultTitle;
          const labels = ghService.parseLabels(
            optionLabels ||
              (preparedBody.source === 'workflow-ready'
                ? preparedBody.draftMetadata?.labels
                : undefined),
            config.lang
          );

          let issueUrl: string | undefined;
          let syncChanged = false;
          if (options.create) {
            const projectGitCwd = ghService.resolveGithubProjectCwd(
              config,
              feature
            );
            ghService.ensureNoTodoPlaceholders(
              body,
              ghService.tg(config.lang, 'kindIssue'),
              config.lang
            );
            ghService.assertRemoteApproval(
              options.confirm,
              ghService.tg(config.lang, 'operationIssueCreate'),
              config.lang
            );
            const args = [
              'issue',
              'create',
              '--title',
              title,
              '--body-file',
              bodyFile,
              '--assignee',
              options.assignee?.trim() || '@me',
            ];
            for (const label of labels) {
              args.push('--label', label);
            }
            const created = runProcessOrThrow(
              'gh',
              args,
              projectGitCwd,
              ghService.tg(config.lang, 'createIssueFailed')
            );
            issueUrl = created.stdout.trim() || undefined;
            const syncedIssueNumber = ghService.extractIssueNumberFromUrl(issueUrl);
            if (syncedIssueNumber) {
              const synced = ghService.syncTasksIssueMetadata(
                path.join(config.docsDir, paths.tasksPath),
                syncedIssueNumber,
                config.lang,
                feature.slug
              );
              const draftSynced = ghService.syncIssueDraftMetadata(
                path.join(config.docsDir, paths.issuePath),
                syncedIssueNumber,
                title
              );
              syncChanged = synced.changed || draftSynced.changed;
            }
          }

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  status: 'ok',
                  reasonCode: options.create
                    ? 'ISSUE_CREATED'
                    : 'ISSUE_TEMPLATE_GENERATED',
                  feature: feature.folderName,
                  component: feature.type,
                  title,
                  labels,
                  body,
                  bodyFile,
                  issueUrl,
                  syncChanged,
                },
                null,
                2
              )
            );
            return;
          }

          console.log();
          console.log(chalk.bold(ghService.tg(config.lang, 'issueHeader')));
          console.log(
            chalk.gray(
              `- ${ghService.tg(config.lang, 'labelFeature')}: ${feature.folderName}`
            )
          );
          console.log(
            chalk.gray(
              `- ${ghService.tg(config.lang, 'labelBodyFile')}: ${bodyFile}`
            )
          );
          console.log(
            chalk.gray(
              `- ${ghService.tg(config.lang, 'labelLabels')}: ${labels.join(', ')}`
            )
          );
          if (issueUrl) {
            console.log(
              chalk.green(
                ghService.tg(config.lang, 'issueCreated', { url: issueUrl })
              )
            );
          } else {
            console.log(
              chalk.blue(ghService.tg(config.lang, 'issueTemplateGenerated'))
            );
          }
          console.log();
        } catch (error) {
          const lang = ghService.detectGithubCliLangSync(process.cwd());
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
      }
    );

  github
    .command('pr [feature-name]')
    .description(ghService.tg(commandLang, 'cmdPrDescription'))
    .option('--json', ghService.tg(commandLang, 'optJson'))
    .option(
      '--component <component>',
      ghService.tg(commandLang, 'optComponent')
    )
    .option('--title <title>', ghService.tg(commandLang, 'optPrTitle'))
    .option('--labels <labels>', ghService.tg(commandLang, 'optLabels'))
    .option('--body-file <path>', ghService.tg(commandLang, 'optPrBodyFile'))
    .option('--assignee <assignee>', ghService.tg(commandLang, 'optPrAssignee'))
    .option('--base <branch>', ghService.tg(commandLang, 'optPrBase'), 'main')
    .option('--create', ghService.tg(commandLang, 'optPrCreate'))
    .option('--pr <ref>', ghService.tg(commandLang, 'optPrRef'))
    .option('--merge', ghService.tg(commandLang, 'optPrMerge'))
    .option('--confirm <reply>', ghService.tg(commandLang, 'optPrConfirm'))
    .option('--retry <count>', ghService.tg(commandLang, 'optPrRetry'))
    .option(
      '--screenshots <mode>',
      ghService.tg(commandLang, 'optPrScreenshots'),
      'auto'
    )
    .option(
      '--mermaid <mode>',
      ghService.tg(commandLang, 'optPrMermaid'),
      'auto'
    )
    .option('--no-sync-tasks', ghService.tg(commandLang, 'optPrNoSyncTasks'))
    .option('--commit-sync', ghService.tg(commandLang, 'optPrCommitSync'))
    .action(
      async (
        featureName: string | undefined,
        options: ghService.GithubPrOptions
      ) => {
        try {
          const { config, feature } = await ghService.resolveFeatureOrThrow(
            featureName,
            {
              component: options.component,
            },
            commandLang
          );

          const optionLabels = (options.labels || '').trim();
          const paths = ghService.getFeatureDocPaths(feature);
          ghService.ensureDocsExist(
            config.docsDir,
            [paths.specPath, paths.tasksPath],
            config.lang
          );
          const specContent = await fs.readFile(
            path.join(config.docsDir, paths.specPath),
            'utf-8'
          );
          const planPath = path.join(config.docsDir, paths.planPath);
          const planContent = (await fs.pathExists(planPath))
            ? await fs.readFile(planPath, 'utf-8')
            : '';
          const tasksContent = await fs.readFile(
            path.join(config.docsDir, paths.tasksPath),
            'utf-8'
          );
          const overview = ghService.resolveOverviewFromSpec(
            specContent,
            feature,
            config.lang
          );

          const defaultTitle = feature.issueNumber
            ? ghService.tg(config.lang, 'prDefaultTitleWithIssue', {
                issue: feature.issueNumber,
                slug: feature.slug,
                featureRef: feature.folderName,
              })
            : ghService.tg(config.lang, 'prDefaultTitleNoIssue', {
                slug: feature.slug,
                featureRef: feature.folderName,
              });
          const artifactPolicy = ghService.resolvePrArtifactPolicy(
            config,
            options
          );
          const generatedBody = ghService.buildPrBody(
            feature,
            specContent,
            planContent,
            tasksContent,
            overview,
            paths,
            artifactPolicy,
            config.lang
          );
          ghService.ensureSections(
            generatedBody,
            ghService.getRequiredPrSections(config.lang),
            ghService.tg(config.lang, 'kindPr'),
            config.lang
          );

          const defaultBodyFile = ghService.toBodyFilePath(
            options.bodyFile,
            'pr',
            config.docsDir,
            feature.type,
            config.lang
          );
          const explicitBodyFile = (options.bodyFile || '').trim();
          const preparedBody = await ghService.prepareGithubBody({
            create: options.create,
            explicitBodyFile,
            defaultBodyFile,
            workflowDraftPath: path.join(config.docsDir, paths.prPath),
            generatedBody,
            requiredSections: ghService.getRequiredPrSections(config.lang),
            kindLabel: ghService.tg(config.lang, 'kindPr'),
            lang: config.lang,
          });
          let body = ghService.stripWorkflowDraftMetadataSection(
            preparedBody.body
          );
          let bodyFile = preparedBody.bodyFile;
          if (options.create && body !== preparedBody.body) {
            const sanitizedBodyFile = ghService.toBodyFilePath(
              undefined,
              'pr',
              config.docsDir,
              `${feature.type}-pr-sanitized`,
              config.lang
            );
            await fs.ensureDir(path.dirname(sanitizedBodyFile));
            await fs.writeFile(sanitizedBodyFile, body, 'utf-8');
            bodyFile = sanitizedBodyFile;
          }
          const requestedTitle =
            options.title?.trim() ||
            (preparedBody.source === 'workflow-ready'
              ? preparedBody.draftMetadata?.title
              : undefined) ||
            '';
          let title = requestedTitle || defaultTitle;
          const labels = ghService.parseLabels(
            optionLabels ||
              (preparedBody.source === 'workflow-ready'
                ? preparedBody.draftMetadata?.labels
                : undefined),
            config.lang
          );
          const baseBranch = options.base || 'main';

          const retryCount = ghService.toRetryCount(options.retry, config.lang);
          let prUrl = options.pr?.trim() || '';
          let mergedAttempts: number | undefined;
          let mergeAlreadyMerged: boolean | undefined;
          let syncChanged = false;
          const pushDocsSync = ghService.shouldPushDocsSync(config);

          if (options.create) {
            const projectGitCwd = ghService.resolveGithubProjectCwd(
              config,
              feature
            );
            const closingIssueNumber = ghService.resolvePrClosingIssueNumber(
              tasksContent,
              feature.issueNumber ? String(feature.issueNumber) : undefined,
              config.lang
            );
            const remoteIssue = ghService.assertRemoteIssueExists(
              closingIssueNumber,
              projectGitCwd,
              config.lang
            );
            const linkedIssueTitle = remoteIssue?.title?.trim() || '';
            const issueLinkedDefaultTitle = linkedIssueTitle
              ? `feat(#${closingIssueNumber}): ${linkedIssueTitle}`
              : defaultTitle;
            title =
              closingIssueNumber && closingIssueNumber.trim()
                ? issueLinkedDefaultTitle
                : requestedTitle || defaultTitle;
            if (
              closingIssueNumber &&
              options.title?.trim() &&
              options.title.trim() !== issueLinkedDefaultTitle
            ) {
              throw createCliError(
                'PRECONDITION_FAILED',
                `PR title must match the linked issue conventional title: "${issueLinkedDefaultTitle}".`
              );
            }
            const normalizedBody = ghService.ensureIssueClosingLine(
              body,
              closingIssueNumber
            );
            if (normalizedBody !== body) {
              body = normalizedBody;
              const fallbackBodyFile = defaultBodyFile;
              if (preparedBody.source === 'generated') {
                await fs.writeFile(bodyFile, body, 'utf-8');
              } else {
                await fs.ensureDir(path.dirname(fallbackBodyFile));
                await fs.writeFile(fallbackBodyFile, body, 'utf-8');
                bodyFile = fallbackBodyFile;
              }
            }

            ghService.ensureNoTodoPlaceholders(
              body,
              ghService.tg(config.lang, 'kindPr'),
              config.lang
            );
            ghService.ensurePrArtifacts(body, artifactPolicy, config.lang);
            ghService.assertRemoteApproval(
              options.confirm,
              ghService.tg(config.lang, 'operationPrCreate'),
              config.lang
            );
            const args = [
              'pr',
              'create',
              '--title',
              title,
              '--body-file',
              bodyFile,
              '--base',
              baseBranch,
              '--assignee',
              options.assignee?.trim() || '@me',
            ];
            for (const label of labels) {
              args.push('--label', label);
            }
            const created = runProcessOrThrow(
              'gh',
              args,
              projectGitCwd,
              ghService.tg(config.lang, 'createPrFailed')
            );
            prUrl = created.stdout.trim();
          }

          if (!prUrl && options.merge) {
            prUrl = (ghService.extractTasksPrReference(tasksContent) || '').trim();
          }

          if (!prUrl && options.merge) {
            throw createCliError(
              'INVALID_ARGUMENT',
              ghService.tg(config.lang, 'mergeRequiresPr')
            );
          }

          if (options.merge) {
            ghService.assertRemoteApproval(
              options.confirm,
              ghService.tg(config.lang, 'operationPrMerge'),
              config.lang
            );
          }

          if (prUrl && options.syncTasks !== false) {
            const syncedTasks = ghService.syncTasksPrMetadata(
              path.join(config.docsDir, paths.tasksPath),
              prUrl,
              'Review',
              config.lang
            );
            const syncedDraft = ghService.syncPrDraftMetadata(
              path.join(config.docsDir, paths.prPath),
              prUrl,
              'Review',
              title
            );
            syncChanged = syncedTasks.changed || syncedDraft.changed;
            const shouldCommitSync = !!options.commitSync || !!options.merge;
            if (syncChanged && shouldCommitSync) {
              const docsGitCwd = ghService.resolveGithubDocsCwd(
                config,
                feature
              );
              const message = feature.issueNumber
                ? ghService.tg(config.lang, 'syncCommitWithIssue', {
                    issue: feature.issueNumber,
                    folder: feature.folderName,
                  })
                : ghService.tg(config.lang, 'syncCommitNoIssue', {
                    folder: feature.folderName,
                  });
              ghService.commitAndPushPaths(
                docsGitCwd,
                [syncedTasks.path, syncedDraft.path],
                message,
                config.lang,
                { pushToOrigin: pushDocsSync }
              );
            }
          }

          if (options.merge) {
            const projectGitCwd = ghService.resolveGithubProjectCwd(
              config,
              feature
            );
            const merged = ghService.mergePrWithRetry(
              prUrl,
              projectGitCwd,
              retryCount,
              config.lang
            );
            mergedAttempts = merged.attempts;
            mergeAlreadyMerged = merged.alreadyMerged;

            if (prUrl && options.syncTasks !== false) {
              const mergedTasksSync = ghService.syncTasksPrMetadata(
                path.join(config.docsDir, paths.tasksPath),
                prUrl,
                'Approved',
                config.lang
              );
              const mergedDraftSync = ghService.syncPrDraftMetadata(
                path.join(config.docsDir, paths.prPath),
                prUrl,
                'Approved'
              );
              syncChanged =
                syncChanged || mergedTasksSync.changed || mergedDraftSync.changed;
              if (mergedTasksSync.changed || mergedDraftSync.changed) {
                const docsGitCwd = ghService.resolveGithubDocsCwd(
                  config,
                  feature
                );
                const message = feature.issueNumber
                  ? ghService.tg(config.lang, 'syncCommitWithIssue', {
                    issue: feature.issueNumber,
                    folder: feature.folderName,
                  })
                  : ghService.tg(config.lang, 'syncCommitNoIssue', {
                      folder: feature.folderName,
                    });
                ghService.commitAndPushPaths(
                  docsGitCwd,
                  [mergedTasksSync.path, mergedDraftSync.path],
                  message,
                  config.lang,
                  { pushToOrigin: pushDocsSync }
                );
              }
            }
          }

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  status: 'ok',
                  reasonCode: options.merge
                    ? 'PR_CREATED_SYNCED_MERGED'
                    : options.create
                      ? 'PR_CREATED_SYNCED'
                      : 'PR_TEMPLATE_GENERATED',
                  feature: feature.folderName,
                  component: feature.type,
                  title,
                  labels,
                  body,
                  bodyFile,
                  artifactPolicy: {
                    screenshots: artifactPolicy.includeScreenshots,
                    mermaid: artifactPolicy.includeMermaid,
                  },
                  prUrl: prUrl || undefined,
                  syncChanged,
                  merged: !!options.merge,
                  mergeAttempts: mergedAttempts,
                  mergeAlreadyMerged,
                },
                null,
                2
              )
            );
            return;
          }

          console.log();
          console.log(chalk.bold(ghService.tg(config.lang, 'prHeader')));
          console.log(
            chalk.gray(
              `- ${ghService.tg(config.lang, 'labelFeature')}: ${feature.folderName}`
            )
          );
          console.log(
            chalk.gray(
              `- ${ghService.tg(config.lang, 'labelBodyFile')}: ${bodyFile}`
            )
          );
          console.log(
            chalk.gray(
              `- ${ghService.tg(config.lang, 'labelLabels')}: ${labels.join(', ')}`
            )
          );
          if (prUrl) {
            console.log(
              chalk.gray(`- ${ghService.tg(config.lang, 'labelPr')}: ${prUrl}`)
            );
          }
          if (syncChanged) {
            console.log(
              chalk.green(ghService.tg(config.lang, 'prTasksSynced'))
            );
          }
          if (options.merge) {
            console.log(
              chalk.green(
                ghService.tg(config.lang, 'prMerged', {
                  attempts: mergedAttempts ?? 1,
                })
              )
            );
            if (mergeAlreadyMerged) {
              console.log(
                chalk.yellow(ghService.tg(config.lang, 'prAlreadyMergedNotice'))
              );
            }
          } else if (!options.create) {
            console.log(
              chalk.blue(ghService.tg(config.lang, 'prTemplateGenerated'))
            );
          }
          console.log();
        } catch (error) {
          const lang = ghService.detectGithubCliLangSync(process.cwd());
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
      }
    );
}

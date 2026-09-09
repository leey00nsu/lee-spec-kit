import { newLocalFeatureId } from '../utils/feature-identity.js';
import { runProcess } from './github/process.js';
import { runGitCapture } from '../utils/git-run.js';
import { resolveStandaloneProjectRoots } from '../utils/standalone-workspace.js';
import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '../utils/config.js';
import {
  assertAllowedComponent,
  resolveProjectComponents,
} from '../utils/components.js';
import { replaceInFiles } from '../utils/template.js';
import { DefaultFileSystemAdapter } from '../adapters/DefaultFileSystemAdapter.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import {
  getDocsLockPath,
  getInitLockPath,
  waitForLockRelease,
  withFileLock,
} from '../utils/lock.js';
import {
  validateSafeNameWithLang,
  validateFeatureIdWithLang,
  assertValid,
} from '../utils/validation.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { getLocalDateString } from '../utils/date.js';
import { applyLocalWorkflowTemplateToFeatureDir } from '../utils/local-workflow-template.js';
import { getTemplatesDir } from '../utils/paths.js';
import { sleep } from '../utils/async.js';
import { resolveIdeaReference } from '../utils/idea-promotion.js';
import {
  getSchemaAdapterForConfig,
} from '../adapters/schema/index.js';

export interface FeatureOptions {
  component?: string;
  id?: string;
  issue?: string;
  createIssue?: boolean;
  confirm?: string;
  owner?: string;
  desc?: string;
  idea?: string;
  nonInteractive?: boolean;
  json?: boolean;
}

export interface FeatureRunResult {
  featureId: string;
  featureName: string;
  component?: string;
  featurePath: string;
  featurePathFromDocs: string;
}

export function featureCommand(program: Command): void {
  program
    .command('feature <name>')
    .description('Create a new feature folder')
    .option('--component <component>', 'Component name (multi only)')
    .option('--id <id>', 'Explicit local or legacy migration ID')
    .option('--issue <number>', 'Bind an existing GitHub issue before creating docs')
    .option('--create-issue', 'Create the GitHub issue first using name and --desc')
    .option('--confirm <token>', 'OK authorizes --create-issue')
    .option('--owner <owner>', 'Single Feature owner (default: git user.email)')
    .option('-d, --desc <description>', 'Feature description for spec.md')
    .option('--idea <ref>', 'Idea reference to promote (I001 | I001-slug | docs/ideas/...)')
    .option('--non-interactive', 'Fail instead of prompting for input')
    .option('--json', 'Output in JSON format for agents')
    .action(async (name: string, options: FeatureOptions) => {
      try {
        const result = await runFeature(name, options);
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                reasonCode: 'FEATURE_CREATED',
                featureId: result.featureId,
                featureName: result.featureName,
                component: result.component,
                featurePath: result.featurePath,
                featurePathFromDocs: result.featurePathFromDocs,
              },
              null,
              2
            )
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'canceled') {
          const config = await getConfig(process.cwd());
          const lang = config?.lang ?? DEFAULT_LANG;
          if (options.json) {
            console.log(
              JSON.stringify({
                status: 'canceled',
                reasonCode: 'CANCELED',
              })
            );
            return;
          }
          console.log(chalk.yellow(`\n${tr(lang, 'cli', 'common.canceled')}`));
          return;
        }
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
        return;
      }
    });
}

export async function runFeature(
  name: string,
  options: FeatureOptions
): Promise<FeatureRunResult> {
  const cwd = process.cwd();
  let config = await getConfig(cwd);

  if (!config) {
    config = await waitForConfigAfterInit(cwd);
  }

  if (!config) {
    throw createCliError(
      'DOCS_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.docsNotFound')
    );
  }

  const { docsDir, projectType, lang } = config;
  const projectName = config.projectName;
  const schemaAdapter = getSchemaAdapterForConfig(config);
  const configuredComponents = resolveProjectComponents(
    projectType,
    config.components
  );
  const linkedIdea = options.idea
    ? await resolveIdeaReference(docsDir, options.idea, lang)
    : null;

  // 기능 이름 검증 (Path Traversal 방지)
  assertValid(
    validateSafeNameWithLang(name, lang),
    tr(lang, 'cli', 'validation.context.featureName'),
    lang
  );

  let component = (options.component || '').trim().toLowerCase();
  if (!component) component = '';

  if (projectType === 'single' && component) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--component` can only be used in multi mode.'
    );
  }

  // multi인 경우 component 선택 필요
  if (projectType === 'multi' && !component) {
    if (configuredComponents.length === 1) {
      component = configuredComponents[0];
    } else if (options.nonInteractive) {
      throw createCliError(
        'PROMPT_BLOCKED',
        '`--component` is required in multi mode when using `--non-interactive`.'
      );
    } else {
      const response = await prompts(
        {
          type: 'select',
          name: 'component',
          message: tr(lang, 'cli', 'feature.selectRepo'),
          choices: configuredComponents.map((value) => ({
            title: value.toUpperCase(),
            value,
          })),
        },
        {
          onCancel: () => {
            throw new Error('canceled');
          },
        }
      );
      component = response.component;
    }
  }

  if (projectType === 'multi') {
    assertAllowedComponent(component, configuredComponents);
  }

  const githubMode = config.workflow?.mode !== 'local';
  if (options.issue && options.createIssue || options.id && (options.issue || options.createIssue)) {
    throw createCliError('INVALID_ARGUMENT', 'Use exactly one of --id, --issue, or --create-issue.');
  }
  if (!githubMode && (options.issue || options.createIssue)) {
    throw createCliError('INVALID_ARGUMENT', 'Issue binding requires GitHub mode.');
  }
  if (githubMode && !options.issue && !options.createIssue && !/^F\d{3,}$/.test(options.id || '')) {
    throw createCliError('ISSUE_REQUIRED', 'Create/select a GitHub Issue first: feature <name> --issue <number>, or --create-issue --desc <summary> --confirm OK.');
  }
  if (!githubMode && options.id && /^[0-9]+$/.test(options.id)) {
    throw createCliError('INVALID_ARGUMENT', 'Numeric IDs are reserved for GitHub issues. Omit --id to generate a local ID.');
  }
  const projectCwd = config.docsRepo === 'standalone'
    ? resolveStandaloneProjectRoots(config, component || undefined)[0]
    : cwd;
  if (!projectCwd) throw createCliError('PRECONDITION_FAILED', 'Project repository is required.');
  const owner = options.owner?.trim() || runGitCapture(['config', 'user.email'], projectCwd) || null;
  let issue: { number: number; url: string; title: string } | null = null;
  if (options.issue || options.createIssue) {
    const gh = (args: string[]): string => {
      const result = runProcess('gh', args, projectCwd);
      if (result.code !== 0) throw createCliError('EXECUTION_FAILED', result.stderr || result.stdout);
      return result.stdout.trim();
    };
    let issueRef = options.issue;
    if (issueRef && !/^[1-9]\d*$/.test(issueRef)) {
      throw createCliError('INVALID_ARGUMENT', '--issue must be a positive issue number.');
    }
    if (options.createIssue) {
      if (options.confirm !== 'OK' || !options.desc?.trim()) {
        throw createCliError('APPROVAL_REQUIRED', 'Share the issue title (name) and body (--desc), then use --create-issue --confirm OK.');
      }
      issueRef = gh(['issue', 'create', '--title', name, '--body', options.desc]);
    }
    issue = JSON.parse(gh(['issue', 'view', issueRef!, '--json', 'number,url,title']));
    if (!issue || !Number.isSafeInteger(issue.number) || issue.number <= 0 || !/^https:\/\//.test(issue.url)) {
      throw createCliError('PRECONDITION_FAILED', 'Invalid GitHub issue response.');
    }
  }

  const docsLockPath = getDocsLockPath(docsDir);
  return withFileLock(
    docsLockPath,
    async () => {
      // Feature ID 생성
      let featureId: string;
      if (options.id) {
        assertValid(
          validateFeatureIdWithLang(options.id, lang),
          tr(lang, 'cli', 'validation.context.featureId'),
          lang
        );
        featureId = options.id;
      } else {
        featureId = issue ? String(issue.number) : newLocalFeatureId();
      }


      if (!schemaAdapter?.resolveFeaturePaths) {
        throw createCliError(
          'PRECONDITION_FAILED',
          `Schema "${config.schemaId || 'unknown'}" does not support feature path resolution.`
        );
      }

      const { featureFolderName, featureDir, featurePathFromDocs } =
        schemaAdapter.resolveFeaturePaths({
          docsDir,
          projectType,
          component: projectType === 'multi' ? component : undefined,
          featureId,
          featureName: name,
        });

      // Identity must be unique even when the slug differs.
      const siblings = await fs.readdir(path.dirname(featureDir)).catch(() => [] as string[]);
      if (siblings.some((entry) => entry.toLowerCase().startsWith(`${featureId.toLowerCase()}-`))) {
        throw createCliError('FEATURE_ID_EXISTS', `Feature ${featureId} already exists in this component.`);
      }
      // 중복 확인
      if (await fs.pathExists(featureDir)) {
        throw createCliError(
          'INVALID_ARGUMENT',
          tr(lang, 'cli', 'feature.folderExists', { path: featureDir })
        );
      }

      // Feature templates are sourced from CLI built-ins (single source of truth).
      const featureBasePath = path.join(
        getTemplatesDir(),
        lang,
        'common',
        'features',
        'feature-base'
      );
      if (!(await fs.pathExists(featureBasePath))) {
        throw createCliError(
          'DOCS_NOT_FOUND',
          tr(lang, 'cli', 'feature.baseNotFound')
        );
      }

      await fs.copy(featureBasePath, featureDir);

      // 플레이스홀더 치환
      const idNumber = featureId.replace('F', '');
      const repoName =
        projectType === 'multi'
          ? `{{projectName}}-${component}`
          : '{{projectName}}';

      const replacements: Record<string, string> = {
        '{{projectName}}': projectName ?? '{{projectName}}',
        // ko placeholders
        '{기능명}': name,
        'F{번호}': featureId,
        '{번호}': idNumber,
        '{결정 제목}': `${name} 결정`,
        '{YYYY-MM-DD}': getLocalDateString(),
        '{component}': component || '',
        '{{projectName}}-{component}': repoName,
        '{be|fe}': component || '',
        '{이슈번호}': issue ? String(issue.number) : '',
        '{{description}}': options.desc || '',

        // en placeholders
        '{feature-name}': name,
        'F{number}': featureId,
        '{number}': idNumber,
        '{Decision Title}': `${name} design decision`,
        '{issue-number}': issue ? String(issue.number) : '',
        '{{projectName}}-{be|fe}': repoName,
      };

      // 한국어 템플릿의 경우 추가 치환
      if (lang === 'en') {
        replacements['기능 ID'] = 'Feature ID';
        replacements['기능명'] = 'Feature Name';
        replacements['대상 레포'] = 'Target Repo';
        replacements['이슈 번호'] = 'Issue Number';
        replacements['작성일'] = 'Created';
        replacements['상태'] = 'Status';
      }

      const fsAdapter = new DefaultFileSystemAdapter();
      await replaceInFiles(fsAdapter, featureDir, replacements);

      if (linkedIdea) {
        await stampIdeaReferenceInSpec(
          path.join(featureDir, 'spec.md'),
          path.relative(featureDir, linkedIdea.path)
        );
        await markIdeaAsFeatureized(linkedIdea.path, featureFolderName);
      }

      if (config.workflow?.mode === 'local') {
        await applyLocalWorkflowTemplateToFeatureDir(featureDir, lang);
      }

      if (!/^F\d{3,}$/.test(featureId)) {
        const branch = `feat/${featureId}-${name}`;
        const tasksPath = path.join(featureDir, 'tasks.md');
        const tasks = await fs.readFile(tasksPath, 'utf8');
        await fs.writeFile(tasksPath, tasks.replace(/^(- \*\*(?:Branch|브랜치)\*\*:) .*$/m, `$1 \`${branch}\``));
        await fs.writeJson(path.join(featureDir, '.feature.json'), {
          version: 1, id: featureId, owner, branch,
          identity: issue ? issue.url : `local:${featureId}`,
          issue: issue ? { number: issue.number, url: issue.url } : null,
        }, { spaces: 2 });
      }
      if (issue) {
        await fs.writeFile(path.join(featureDir, 'issue.md'),
          `# Issue: ${issue.title}\n\n- **Status**: Ready\n- **Title**: ${issue.title}\n- **Issue**: ${issue.url}\n\n${options.desc || ''}\n\n## Related Docs\n\n- [Spec](spec.md)\n- [Plan](plan.md)\n- [Tasks](tasks.md)\n\nIssue binding does not approve implementation; follow the Spec and Plan gates.\n`);
      }

      if (!options.json) {
        console.log();
        console.log(
          chalk.green(tr(lang, 'cli', 'feature.created', { path: featureDir }))
        );
        console.log();
        console.log(chalk.blue(tr(lang, 'cli', 'feature.nextStepsTitle')));
        console.log(
          chalk.gray(
            tr(lang, 'cli', 'feature.nextSteps1', { path: featureDir })
          )
        );
        console.log(chalk.gray(tr(lang, 'cli', 'feature.nextSteps2')));
        console.log(chalk.gray(tr(lang, 'cli', 'feature.nextSteps3')));
        console.log();
      }

      return {
        featureId,
        featureName: name,
        component: projectType === 'multi' ? component : undefined,
        featurePath: featureDir,
        featurePathFromDocs,
      };
    },
    { owner: 'feature' }
  );
}

async function stampIdeaReferenceInSpec(
  specPath: string,
  relativeIdeaPath: string
): Promise<void> {
  const normalizedPath = relativeIdeaPath.replace(/\\/g, '/');
  const ideaLine = `- Idea: \`${normalizedPath}\``;
  let content = await fs.readFile(specPath, 'utf-8');

  if (content.includes(ideaLine)) {
    return;
  }

  if (content.includes('## Related Documents')) {
    content = content.replace(
      '## Related Documents\n\n',
      `## Related Documents\n\n${ideaLine}\n`
    );
  } else {
    content = `${content.trimEnd()}\n\n${ideaLine}\n`;
  }

  await fs.writeFile(specPath, content, 'utf-8');
}

async function markIdeaAsFeatureized(
  ideaPath: string,
  featureFolderName: string
): Promise<void> {
  let content = await fs.readFile(ideaPath, 'utf-8');
  content = replaceOrAppendIdeaMetadata(content, 'Status', 'Featureized');
  content = replaceOrAppendIdeaMetadata(content, 'Feature', featureFolderName);
  await fs.writeFile(ideaPath, content, 'utf-8');
}

function replaceOrAppendIdeaMetadata(
  content: string,
  label: string,
  value: string
): string {
  const pattern = new RegExp(`^- \\*\\*${escapeRegExp(label)}\\*\\*:.*$`, 'm');
  const line = `- **${label}**: ${value}`;
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const heading = '## Promotion Tracking';
  if (content.includes(heading)) {
    return content.replace(heading, `${heading}\n\n${line}`);
  }

  return `${content.trimEnd()}\n\n${heading}\n\n${line}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForConfigAfterInit(
  cwd: string,
  timeoutMs = 8_000
): Promise<Awaited<ReturnType<typeof getConfig>> | null> {
  const explicitDocsDir = (process.env.LEE_SPEC_KIT_DOCS_DIR || '').trim();
  const candidates = [
    ...(explicitDocsDir ? [path.resolve(explicitDocsDir)] : []),
    path.resolve(cwd, 'docs'),
    path.resolve(cwd),
  ];

  const endAt = Date.now() + timeoutMs;

  while (Date.now() < endAt) {
    const config = await getConfig(cwd);
    if (config) return config;

    let sawLock = false;
    for (const dir of candidates) {
      const initLockPath = getInitLockPath(dir);
      const docsLockPath = getDocsLockPath(dir);
      for (const lockPath of [initLockPath, docsLockPath]) {
        if (await fs.pathExists(lockPath)) {
          sawLock = true;
          await waitForLockRelease(lockPath, {
            timeoutMs: Math.max(200, endAt - Date.now()),
            pollMs: 120,
          });
        }
      }
    }

    if (!sawLock) {
      await sleep(150);
    }
  }

  return getConfig(cwd);
}

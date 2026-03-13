import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG } from '../utils/i18n.js';
import { resolveContextSelection } from '../utils/context-selection.js';
import { createCliContext } from '../utils/cli-context.js';
import { resolveComponentOption } from '../utils/context/component-option.js';
import {
  PrePrDecisionOutcome,
  resolvePrePrReviewPolicy,
} from '../utils/workflow.js';
import { getLocalDateString } from '../utils/date.js';
import { getPrePrReviewPrompt } from '../utils/agent-orchestration.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';

interface PrePrReviewOptions {
  component?: string;
  decision?: string;
  note?: string;
  evidence?: string;
  json?: boolean;
}

interface PrePrReviewRunOptions {
  component?: string;
  json?: boolean;
}

function buildPrePrReviewRecordCommand(
  featureFolder: string,
  component: string | undefined,
  evidencePath: string,
  decision: PrePrDecisionOutcome
): string {
  const args = ['pre-pr-review', featureFolder];
  if (component) {
    args.push('--component', component);
  }
  args.push('--evidence', evidencePath, '--decision', decision);
  return `npx lee-spec-kit ${args.join(' ')}`;
}

const DEFAULT_EVIDENCE_FOR_ANY_MODE: PrePrReviewEvidence = {
  summary: 'manual pre-PR quality review completed',
  featureIntentSummary:
    'reviewed the feature against the approved docs and intended scope',
  implementationFit:
    'the implementation appears aligned with the documented feature intent',
  missingCases: 'no significant missing cases identified',
  specAlignmentChecked: true,
  findingCount: 0,
  blockingFindings: 0,
  files: [],
  residualRisks: ['none'],
  commandsExecuted: [],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDecision(
  raw: string | undefined
): PrePrDecisionOutcome | null {
  if (!raw) return null;
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (value === 'approve' || value === 'approved') return 'approve';
  if (
    value === 'changes_requested' ||
    value === 'change_requested' ||
    value === 'changes'
  ) {
    return 'changes_requested';
  }
  if (value === 'blocked' || value === 'block') return 'blocked';
  return null;
}

function findSpecLineIndex(lines: string[], keys: string[]): number {
  const escaped = keys.map((key) => escapeRegExp(key));
  const re = new RegExp(
    `^\\s*-\\s*\\*\\*(?:${escaped.join('|')})\\*\\*\\s*:\\s*`
  );
  return lines.findIndex((line) => re.test(line));
}

function replaceSpecLine(
  line: string,
  keys: string[],
  preferredKey: string,
  value: string
): string {
  const escaped = keys.map((key) => escapeRegExp(key));
  const re = new RegExp(
    `^(\\s*-\\s*\\*\\*)(?:${escaped.join('|')})(\\*\\*\\s*:\\s*)(.*)$`
  );
  if (!re.test(line)) return line;
  return line.replace(re, `$1${preferredKey}$2${value}`);
}

function computeInsertIndex(lines: string[], anchorKeys: string[]): number {
  const anchorIndex = findSpecLineIndex(lines, anchorKeys);
  if (anchorIndex !== -1) {
    let cursor = anchorIndex + 1;
    while (cursor < lines.length && /^\s{2,}-\s+/.test(lines[cursor])) {
      cursor += 1;
    }
    return cursor;
  }
  const sectionIndex = lines.findIndex((line) =>
    /^\s*##\s+(Task List|태스크 목록)\s*$/.test(line)
  );
  if (sectionIndex !== -1) return sectionIndex;
  return lines.length;
}

function upsertSpecLine(
  content: string,
  keys: string[],
  preferredKey: string,
  value: string,
  anchorKeys: string[]
): string {
  const lines = content.split('\n');
  const index = findSpecLineIndex(lines, keys);
  if (index !== -1) {
    lines[index] = replaceSpecLine(lines[index], keys, preferredKey, value);
    return lines.join('\n');
  }

  const insertAt = computeInsertIndex(lines, anchorKeys);
  lines.splice(insertAt, 0, `- **${preferredKey}**: ${value}`);
  return lines.join('\n');
}

function normalizePathForDoc(value: string): string {
  return value.replace(/\\/g, '/');
}

function normalizeShellLikeCommand(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function getPreferredKeys(lang: 'ko' | 'en'): {
  review: string;
  evidence: string;
  decision: string;
  prStatus: string;
} {
  if (lang === 'ko') {
    return {
      review: 'PR 전 리뷰',
      evidence: 'PR 전 리뷰 Evidence',
      decision: 'PR 전 리뷰 Decision',
      prStatus: 'PR 상태',
    };
  }
  return {
    review: 'Pre-PR Review',
    evidence: 'Pre-PR Evidence',
    decision: 'Pre-PR Decision',
    prStatus: 'PR Status',
  };
}

import {
  PrePrReviewEvidence,
  PrePrReviewScope,
  PrePrReviewValidator,
} from '../services/PrePrReviewValidator.js';

function buildReportContent(input: {
  folderName: string;
  date: string;
  decision: PrePrDecisionOutcome;
  fallback: string;
  skills: string[];
  evidence: PrePrReviewEvidence;
  scope: PrePrReviewScope;
}): string {
  const skills =
    input.skills.length > 0
      ? input.skills.join(', ')
      : 'code-review-excellence';

  const normalizedCommands = input.evidence.commandsExecuted
    .map((entry) => normalizeShellLikeCommand(entry))
    .filter(Boolean);
  const commandsRun =
    normalizedCommands.length > 0
      ? `- **Commands Executed**:\n${normalizedCommands
          .map((c) => `  - \`${c}\``)
          .join('\n')}\n\n`
      : '';

  let filesSection = '';
  if (input.evidence.findingCount === 0 || input.evidence.files.length === 0) {
    filesSection = '  - 0 findings';
  } else {
    filesSection = input.evidence.files
      .map((f) => {
        return `  - **${f.path}** (Lines ${f.review.fileLine})
    - Risk: ${f.review.risk}
    - Security: ${f.review.security}
    - Perf: ${f.review.perf}
    - Maintainability: ${f.review.maintainability}`;
      })
      .join('\n');
  }

  const residualRisksSection =
    input.evidence.residualRisks.length > 0
      ? input.evidence.residualRisks.map((entry) => `  - ${entry}`).join('\n')
      : '  - none';

  const mainScopeFiles =
    input.scope.mainChangedFiles.length > 0
      ? input.scope.mainChangedFiles.map((entry) => `    - ${entry}`).join('\n')
      : '    - (none)';
  const worktreeScopeFiles =
    input.scope.worktreeChangedFiles.length > 0
      ? input.scope.worktreeChangedFiles
          .map((entry) => `    - ${entry}`)
          .join('\n')
      : '    - (none)';

  return `## Pre-PR Review Log (${input.date})

- **Feature**: ${input.folderName}
- **Baseline**: ${input.fallback}
- **Skills**: ${skills}
- **Decision**: ${input.decision}
- **Summary**: ${input.evidence.summary}
- **Feature Intent Summary**: ${input.evidence.featureIntentSummary}
- **Implementation Fit**: ${input.evidence.implementationFit}
- **Missing Cases**: ${input.evidence.missingCases}
- **Spec Alignment Checked**: ${input.evidence.specAlignmentChecked ? 'yes' : 'no'}
- **Finding Count**: ${input.evidence.findingCount}
- **Blocking Findings**: ${input.evidence.blockingFindings}
${commandsRun}

- **Residual Risks**:
${residualRisksSection}

- **Review Scope**:
  - **Main Base Ref**: ${input.scope.baseRef}
  - **Main Merge Base**: ${input.scope.mergeBase ?? 'unresolved'}
  - **Main Range**: ${input.scope.mainRange}
  - **Main Changed Files**:
${mainScopeFiles}
  - **Worktree Changed Files**:
${worktreeScopeFiles}

- **Findings**:
${filesSection}

- **Trace**: pre-pr-review command executed and synced with tasks.md
`;
}

function createFallbackReviewScope(): PrePrReviewScope {
  return {
    baseRef: 'origin/main',
    mergeBase: null,
    mainRange: 'HEAD~1..HEAD',
    mainChangedFiles: [],
    worktreeChangedFiles: [],
  };
}

function appendDecisionLog(content: string, entry: string): string {
  const normalized = content.trimEnd();
  if (!normalized) return `${entry.trim()}\n`;
  return `${normalized}\n\n${entry.trim()}\n`;
}

export function prePrReviewCommand(program: Command): void {
  program
    .command('pre-pr-review-run [feature-name]')
    .description('Prepare the pre-PR review handoff prompt for agent execution')
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON')
    .action(
      async (
        featureName: string | undefined,
        options: PrePrReviewRunOptions
      ) => {
        try {
          await runPrePrReviewRun(featureName, options);
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
            console.error(chalk.red(`[${cliError.code}] ${cliError.message}`));
            printCliErrorSuggestions(suggestions, lang);
          }
          process.exitCode = 1;
        }
      }
    );

  program
    .command('pre-pr-review [feature-name]')
    .description('Run and record pre-PR review evidence for a feature')
    .option('--component <component>', 'Component name for multi projects')
    .option(
      '--decision <outcome>',
      'Decision outcome: approve | changes_requested | blocked'
    )
    .option('--note <text>', 'Decision note text')
    .option(
      '--evidence <path>',
      'Optional review evidence path (for example review-trace.json); required only when policy demands it'
    )
    .option('--json', 'Output JSON')
    .action(
      async (featureName: string | undefined, options: PrePrReviewOptions) => {
        try {
          await runPrePrReview(featureName, options);
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
            console.error(chalk.red(`[${cliError.code}] ${cliError.message}`));
            printCliErrorSuggestions(suggestions, lang);
          }
          process.exitCode = 1;
        }
      }
    );
}

async function resolvePrePrFeatureContext(
  featureName: string | undefined,
  component: string | undefined
): Promise<{
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>;
  ctx: NonNullable<Awaited<ReturnType<typeof createCliContext>>>;
  state: Awaited<ReturnType<typeof resolveContextSelection>>;
  feature: NonNullable<Awaited<ReturnType<typeof resolveContextSelection>>['matchedFeature']>;
}> {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'No lee-spec-kit config found in this workspace.'
    );
  }

  const selectionOptions = {
    component: resolveComponentOption(component),
  };
  const ctx = await createCliContext({ cwd: process.cwd() });
  if (!ctx) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'No lee-spec-kit config found in this workspace.'
    );
  }
  const state = await resolveContextSelection(ctx, featureName, selectionOptions);
  if (state.status !== 'single_matched' || !state.matchedFeature) {
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'pre-pr-review requires a single matched feature. Pass <feature-name> explicitly.'
    );
  }

  return {
    config,
    ctx,
    state,
    feature: state.matchedFeature,
  };
}

async function runPrePrReviewRun(
  featureName: string | undefined,
  options: PrePrReviewRunOptions
): Promise<void> {
  const { config, feature } = await resolvePrePrFeatureContext(
    featureName,
    options.component
  );
  const policy = resolvePrePrReviewPolicy(config.workflow);
  const preferred = getPreferredKeys(config.lang);
  const tasksPath = path.join(feature.path, 'tasks.md');
  let tasksUpdated = false;
  if (await fs.pathExists(tasksPath)) {
    const tasksContent = await fs.readFile(tasksPath, 'utf-8');
    const nextTasks = upsertSpecLine(
      tasksContent,
      ['PR 전 리뷰', 'Pre-PR Review'],
      preferred.review,
      'Running',
      ['PR 상태', 'PR Status']
    );
    tasksUpdated = nextTasks !== tasksContent;
    if (tasksUpdated) {
      await fs.writeFile(tasksPath, nextTasks, 'utf-8');
    }
  }

  const prompt = getPrePrReviewPrompt(
    config.lang,
    policy.skills,
    policy.fallback
  );
  const featureRef = feature.folderName;
  const component = feature.type && feature.type !== 'single' ? feature.type : undefined;
  const changesRequestedCommand = buildPrePrReviewRecordCommand(
    featureRef,
    component,
    'review-trace.json',
    'changes_requested'
  );
  const approveCommand = buildPrePrReviewRecordCommand(
    featureRef,
    component,
    'review-trace.json',
    'approve'
  );

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          status: 'ready',
          reasonCode: 'PRE_PR_REVIEW_RUN_READY',
          feature: featureRef,
          skills: policy.skills,
          fallback: policy.fallback,
          handoffOnly: true,
          advancesWorkflow: false,
          reuseKey: `pre-pr:${featureRef}`,
          suggestedParallelism: 1,
          fallbackToMainAgentWhenQuotaExceeded: true,
          nextStepRequirement: 'generate_review_trace_then_record',
          delegatedWorkRequired: true,
          nextMainState: 'pre_pr_review_running',
          evidenceFile: 'review-trace.json',
          tasksUpdated,
          tasksPath,
          prompt,
          recordCommands: {
            changesRequested: changesRequestedCommand,
            approve: approveCommand,
          },
        },
        null,
        2
      )
    );
    return;
  }

  console.log(prompt);
  console.log();
  console.log(
    chalk.yellow(
      config.lang === 'ko'
        ? '이 명령은 리뷰 handoff만 준비합니다. review-trace.json을 직접 생성하거나 워크플로우 상태를 바로 넘기지 않습니다.'
        : 'This command only prepares the review handoff. It does not generate review-trace.json or advance workflow state by itself.'
    )
  );
  console.log(
    chalk.gray(
      config.lang === 'ko'
        ? '- 기존 pre-PR 리뷰 보조 에이전트가 있으면 재사용하고, 기본은 1개만 사용하세요.'
        : '- Reuse the existing pre-PR helper agent if one already exists; default to a single helper agent.'
    )
  );
  console.log(
    chalk.gray(
      config.lang === 'ko'
        ? '- 보조 에이전트 한도에 걸리면 메인 에이전트에서 리뷰를 이어가세요.'
        : '- If helper-agent quota is exhausted, continue the review in the main agent.'
    )
  );
  console.log(`Reuse key: pre-pr:${featureRef}`);
  console.log(`Suggested parallelism: 1`);
  console.log(`Next main state: pre_pr_review_running`);
  console.log(`Evidence file: review-trace.json`);
  console.log(
    config.lang === 'ko'
      ? 'Next required: delegated review를 이어서 수행하고 review-trace.json을 만든 뒤 pre-pr-review로 기록'
      : 'Next required: continue the delegated review, generate review-trace.json, then record the result with pre-pr-review'
  );
  if (tasksUpdated) {
    console.log(`tasks.md updated: ${tasksPath}`);
    console.log(
      config.lang === 'ko'
        ? 'PR 전 리뷰 상태: Running'
        : 'Pre-PR Review status: Running'
    );
  }
  console.log(`Record changes requested: ${changesRequestedCommand}`);
  console.log(`Record approval: ${approveCommand}`);
}

async function runPrePrReview(
  featureName: string | undefined,
  options: PrePrReviewOptions
): Promise<void> {
  const { config, ctx, feature } = await resolvePrePrFeatureContext(
    featureName,
    options.component
  );
  if (!feature.docs.tasksExists) {
    throw createCliError(
      'PRECONDITION_FAILED',
      `tasks.md not found for feature: ${feature.folderName}`
    );
  }

  const tasksPath = path.join(feature.path, 'tasks.md');
  const tasksContent = await fs.readFile(tasksPath, 'utf-8');
  const policy = resolvePrePrReviewPolicy(config.workflow);
  const preferred = getPreferredKeys(config.lang);
  const date = getLocalDateString();

  const explicitDecision = normalizeDecision(options.decision);
  if (options.decision && !explicitDecision) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--decision` must be one of: approve, changes_requested, blocked.'
    );
  }
  if (
    !explicitDecision &&
    feature.prePrReview.decisionOutcome &&
    feature.prePrReview.decisionOutcome !== 'approve'
  ) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Existing Pre-PR decision is "${feature.prePrReview.decisionOutcome}". Re-run with explicit --decision to avoid replaying the previous non-approve decision.`
    );
  }
  const decision =
    explicitDecision || feature.prePrReview.decisionOutcome || 'approve';
  if (!policy.decisionEnum.includes(decision)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Decision "${decision}" is not allowed by workflow.prePrReview.decisionEnum.`
    );
  }

  let evidenceObj: PrePrReviewEvidence | undefined;
  let reviewScope: PrePrReviewScope = createFallbackReviewScope();
  if (policy.enforceExecutionEvidence && !options.evidence) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--evidence <path>` is required when workflow.prePrReview.enforceExecutionEvidence=true.'
    );
  }
  if (options.evidence) {
    const validator = new PrePrReviewValidator(ctx);
    const validationResult = await validator.validateEvidenceWithScope(
      options.evidence,
      process.cwd()
    );
    evidenceObj = validationResult.evidence;
    reviewScope = validationResult.scope;
  } else if (policy.evidenceMode === 'path_required') {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--evidence <path>` is required. E.g. --evidence review-trace.json'
    );
  } else {
    evidenceObj = DEFAULT_EVIDENCE_FOR_ANY_MODE;
    const validator = new PrePrReviewValidator(ctx);
    try {
      reviewScope = await validator.collectReviewScope(process.cwd());
    } catch {
      reviewScope = createFallbackReviewScope();
    }
  }

  const note =
    options.note?.trim() ||
    evidenceObj?.summary ||
    (decision === 'approve'
      ? 'implementation quality review completed'
      : decision === 'changes_requested'
        ? 'follow-up changes are required before PR creation'
        : 'blocked until prerequisite risk is resolved');

  if (decision === 'approve') {
    if (!evidenceObj!.specAlignmentChecked) {
      throw createCliError(
        'VALIDATION_FAILED',
        'Cannot approve pre-PR review when specAlignmentChecked=false.'
      );
    }
    if (evidenceObj!.blockingFindings > 0) {
      throw createCliError(
        'VALIDATION_FAILED',
        'Cannot approve pre-PR review while blockingFindings is greater than 0.'
      );
    }
  }

  if (policy.enforceExecutionEvidence) {
    const normalizedCommands = evidenceObj!.commandsExecuted
      .map((entry) => normalizeShellLikeCommand(entry))
      .filter(Boolean);
    if (normalizedCommands.length === 0) {
      throw createCliError(
        'VALIDATION_FAILED',
        'Evidence must include non-empty commandsExecuted entries when workflow.prePrReview.enforceExecutionEvidence=true.'
      );
    }
    if (policy.executionCommandPrefixes.length > 0) {
      const hasMatchedPrefix = normalizedCommands.some((cmd) =>
        policy.executionCommandPrefixes.some((prefix) =>
          cmd
            .toLowerCase()
            .startsWith(normalizeShellLikeCommand(prefix).toLowerCase())
        )
      );
      if (!hasMatchedPrefix) {
        throw createCliError(
          'VALIDATION_FAILED',
          `Evidence commandsExecuted must include at least one command starting with workflow.prePrReview.executionCommandPrefixes: ${policy.executionCommandPrefixes.join(', ')}`
        );
      }
    }
  }

  const decisionsPath = path.join(feature.path, 'decisions.md');
  const decisionLogEntry = buildReportContent({
    folderName: feature.folderName,
    date,
    decision,
    fallback: policy.fallback,
    skills: policy.skills,
    evidence: evidenceObj!,
    scope: reviewScope,
  });

  const decisionsContent = (await fs.pathExists(decisionsPath))
    ? await fs.readFile(decisionsPath, 'utf-8')
    : '';
  const nextDecisions = appendDecisionLog(decisionsContent, decisionLogEntry);
  if (nextDecisions !== decisionsContent) {
    await fs.writeFile(decisionsPath, nextDecisions, 'utf-8');
  }

  const decisionsPathFromDocs = normalizePathForDoc(
    path.join(feature.docs.featurePathFromDocs, 'decisions.md')
  );
  const evidencePath =
    path.basename(config.docsDir) === 'docs'
      ? normalizePathForDoc(path.join('docs', decisionsPathFromDocs))
      : decisionsPathFromDocs;

  let nextTasks = tasksContent;
  nextTasks = upsertSpecLine(
    nextTasks,
    ['PR 전 리뷰', 'Pre-PR Review'],
    preferred.review,
    'Done',
    ['PR 상태', 'PR Status']
  );
  nextTasks = upsertSpecLine(
    nextTasks,
    ['PR 전 리뷰 Evidence', 'Pre-PR Evidence'],
    preferred.evidence,
    evidencePath,
    ['PR 전 리뷰', 'Pre-PR Review']
  );
  nextTasks = upsertSpecLine(
    nextTasks,
    ['PR 전 리뷰 Decision', 'Pre-PR Decision'],
    preferred.decision,
    `decision: ${decision} - ${note}`,
    ['PR 전 리뷰 Evidence', 'Pre-PR Evidence']
  );

  if (nextTasks !== tasksContent) {
    await fs.writeFile(tasksPath, nextTasks, 'utf-8');
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          reasonCode: 'PRE_PR_REVIEW_RECORDED',
          feature: feature.folderName,
          reportPath: normalizePathForDoc(decisionsPath),
          decisionsPath: normalizePathForDoc(decisionsPath),
          evidencePath,
          decision,
          reviewScope,
          tasksUpdated: nextTasks !== tasksContent,
        },
        null,
        2
      )
    );
    return;
  }

  console.log();
  console.log(chalk.green(`✅ pre-pr-review completed: ${feature.folderName}`));
  console.log(chalk.gray(`- Decision: ${decision}`));
  console.log(chalk.gray(`- Decisions log: ${decisionsPath}`));
  if (nextTasks !== tasksContent) {
    console.log(chalk.gray(`- tasks.md updated: ${tasksPath}`));
  }
  console.log();
}

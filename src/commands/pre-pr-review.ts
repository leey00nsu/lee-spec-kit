import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG } from '../utils/i18n.js';
import { resolveContextSelection } from '../utils/context-selection.js';
import { resolveComponentOption } from '../utils/context/component-option.js';
import {
  PrePrDecisionOutcome,
  resolvePrePrReviewPolicy,
} from '../utils/workflow.js';
import { getLocalDateString } from '../utils/date.js';
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
  json?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDecision(raw: string | undefined): PrePrDecisionOutcome | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
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
  const re = new RegExp(`^\\s*-\\s*\\*\\*(?:${escaped.join('|')})\\*\\*\\s*:\\s*`);
  return lines.findIndex((line) => re.test(line));
}

function replaceSpecLine(line: string, keys: string[], preferredKey: string, value: string): string {
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

function buildReportContent(input: {
  folderName: string;
  date: string;
  decision: PrePrDecisionOutcome;
  note: string;
  fallback: string;
  skills: string[];
}): string {
  const skills = input.skills.length > 0 ? input.skills.join(', ') : 'code-review-excellence';
  return `## Pre-PR Review Log (${input.date})

- **Feature**: ${input.folderName}
- **Baseline**: ${input.fallback}
- **Skills**: ${skills}
- **Decision**: ${input.decision}
- **Summary**: ${input.note}
- **Findings**:
  - TODO: <file:line | severity: low|medium|high | fix: required|optional | note: ...> OR 0 findings
- **Residual Risks**:
  - TODO: residual risk assessment after review
- **Tests Run**:
  - TODO: commands/results verified during pre-PR review
- **Evidence**:
  - TODO: review comments/paths/tests verified during pre-PR review
- **Trace**: pre-pr-review command executed and synced with tasks.md
`;
}

function appendDecisionLog(content: string, entry: string): string {
  const normalized = content.trimEnd();
  if (!normalized) return `${entry.trim()}\n`;
  return `${normalized}\n\n${entry.trim()}\n`;
}

export function prePrReviewCommand(program: Command): void {
  program
    .command('pre-pr-review [feature-name]')
    .description('Run and record pre-PR review evidence for a feature')
    .option('--component <component>', 'Component name for multi projects')
    .option(
      '--decision <outcome>',
      'Decision outcome: approve | changes_requested | blocked'
    )
    .option('--note <text>', 'Decision note text')
    .option('--json', 'Output JSON')
    .action(async (featureName: string | undefined, options: PrePrReviewOptions) => {
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
    });
}

async function runPrePrReview(
  featureName: string | undefined,
  options: PrePrReviewOptions
): Promise<void> {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'No lee-spec-kit config found in this workspace.'
    );
  }

  const selectionOptions = {
    component: resolveComponentOption(options.component),
  };
  const state = await resolveContextSelection(config, featureName, selectionOptions);
  if (state.status !== 'single_matched' || !state.matchedFeature) {
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'pre-pr-review requires a single matched feature. Pass <feature-name> explicitly.'
    );
  }

  const feature = state.matchedFeature;
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
  const decision =
    explicitDecision || feature.prePrReview.decisionOutcome || 'approve';
  if (!policy.decisionEnum.includes(decision)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Decision "${decision}" is not allowed by workflow.prePrReview.decisionEnum.`
    );
  }

  const note =
    options.note?.trim() ||
    (decision === 'approve'
      ? 'baseline review completed'
      : decision === 'changes_requested'
        ? 'follow-up changes are required before PR creation'
        : 'blocked until prerequisite risk is resolved');

  const decisionsPath = path.join(feature.path, 'decisions.md');
  const decisionLogEntry = buildReportContent({
    folderName: feature.folderName,
    date,
    decision,
    note,
    fallback: policy.fallback,
    skills: policy.skills,
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

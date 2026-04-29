import fs from 'fs-extra';
import chalk from 'chalk';
import { Command } from 'commander';
import { DEFAULT_LANG } from '../utils/i18n.js';
import {
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import {
  collectRepeatableOption,
  localDate,
  normalizeMarkdownEnd,
  normalizeRequiredItems,
  normalizeRequiredText,
  resolveFeatureDocTarget,
} from '../utils/doc-mutation.js';

interface DecisionAddOptions {
  component?: string;
  title: string;
  context: string;
  constraints?: string;
  option?: string[];
  decision: string;
  rationale: string;
  evidence?: string[];
  consequence?: string;
  json?: boolean;
}

function getNextDecisionSequence(content: string): number {
  let max = 0;
  for (const match of content.matchAll(/^##\s+D(\d+):\s+/gm)) {
    if (/\{(?:Decision Title|결정 제목)\}/.test(match[0])) continue;
    const parsed = Number(match[1] || '0');
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return max + 1;
}

function findPlaceholderDecisionRange(content: string): {
  start: number;
  end: number;
  sequence: number;
} | null {
  const match = /^##\s+D(\d+):\s+.*$/m.exec(content);
  if (!match || match.index === undefined) return null;

  const afterHeadingIndex = match.index + match[0].length;
  const nextHeadingMatch = /^##\s+D\d+:\s+/m.exec(content.slice(afterHeadingIndex));
  const end = nextHeadingMatch
    ? afterHeadingIndex + nextHeadingMatch.index
    : content.length;
  const block = content.slice(match.index, end);
  const isPlaceholder =
    /\{(?:Decision Title|결정 제목)\}/.test(match[0]) ||
    /-\s+\*\*Decision\*\*:\s*(Final choice|최종 선택)/.test(block);
  if (!isPlaceholder) return null;

  const sequence = Number(match[1] || '1');
  return {
    start: match.index,
    end,
    sequence: Number.isFinite(sequence) ? sequence : 1,
  };
}

function formatOptions(options: string[]): string {
  return options.length > 0 ? options.join('; ') : '-';
}

function formatDecisionBlock(input: {
  decisionId: string;
  title: string;
  date: string;
  context: string;
  constraints: string;
  options: string[];
  decision: string;
  rationale: string;
  evidence: string[];
  consequence: string;
}): string {
  return [
    `## ${input.decisionId}: ${input.title} (${input.date})`,
    '',
    `- **Context**: ${input.context}`,
    `- **Constraints**: ${input.constraints}`,
    `- **Options**: ${formatOptions(input.options)}`,
    `- **Decision**: ${input.decision}`,
    `- **Rationale**: ${input.rationale}`,
    '- **Trace**:',
    '  - **At DOING start**: Recorded by `decision add` when the decision was created.',
    '  - **Before DONE**: Update this line when the related task is completed.',
    '  - **Post-merge check**: Update this line after merge when applicable.',
    '- **Evidence**:',
    ...input.evidence.map((item) => `  - **Test/Log**: ${item}`),
    `- **Consequences**: ${input.consequence}`,
  ].join('\n');
}

async function runDecisionAdd(
  featureName: string | undefined,
  options: DecisionAddOptions
): Promise<void> {
  const target = await resolveFeatureDocTarget({
    cwd: process.cwd(),
    selector: featureName,
    component: options.component,
    fileName: 'decisions.md',
  });
  const title = normalizeRequiredText(options.title, '--title');
  const context = normalizeRequiredText(options.context, '--context');
  const decision = normalizeRequiredText(options.decision, '--decision');
  const rationale = normalizeRequiredText(options.rationale, '--rationale');
  const evidence = normalizeRequiredItems(options.evidence, '--evidence');
  const constraints = (options.constraints || '').trim() || '-';
  const consequence = (options.consequence || '').trim() || '-';
  const optionItems = (options.option || [])
    .map((value) => value.trim())
    .filter(Boolean);

  const content = await fs.readFile(target.path, 'utf-8');
  const placeholderRange = findPlaceholderDecisionRange(content);
  const decisionSequence = placeholderRange?.sequence ?? getNextDecisionSequence(content);
  const decisionId = `D${String(decisionSequence).padStart(3, '0')}`;
  const recordedAt = localDate();
  const block = formatDecisionBlock({
    decisionId,
    title,
    date: recordedAt,
    context,
    constraints,
    options: optionItems,
    decision,
    rationale,
    evidence,
    consequence,
  });

  const nextContent = placeholderRange
    ? normalizeMarkdownEnd(
        `${content.slice(0, placeholderRange.start)}${block}${content.slice(
          placeholderRange.end
        )}`
      )
    : `${normalizeMarkdownEnd(content)}\n${block}\n`;
  await fs.writeFile(target.path, nextContent, 'utf-8');

  const payload = {
    status: 'ok',
    reasonCode: 'DECISION_ADDED',
    feature: target.feature.folderName,
    decisionId,
    title,
    decisionsUpdated: true,
    decisionsPath: target.path,
    recordedAt,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.green(`Added decision ${decisionId} to ${target.feature.folderName}.`));
  console.log(chalk.gray(`- decisions.md updated: ${target.path}`));
}

export function decisionCommand(program: Command): void {
  const decision = program
    .command('decision')
    .description('Patch feature decision docs');

  decision
    .command('add [feature-name]')
    .description('Append a docs-only ADR block to decisions.md')
    .requiredOption('--title <title>', 'Decision title')
    .requiredOption('--context <text>', 'Decision context')
    .option('--constraints <text>', 'Decision constraints')
    .option(
      '--option <text>',
      'Alternative considered. Repeat to add more than one.',
      collectRepeatableOption,
      []
    )
    .requiredOption('--decision <text>', 'Final decision')
    .requiredOption('--rationale <text>', 'Decision rationale')
    .option(
      '--evidence <text>',
      'Evidence link or test/log note. Repeat to add more than one.',
      collectRepeatableOption,
      []
    )
    .option('--consequence <text>', 'Decision consequence')
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON')
    .action(async (featureName: string | undefined, options: DecisionAddOptions) => {
      try {
        await runDecisionAdd(featureName, options);
      } catch (error) {
        const cliError = toCliError(error);
        const suggestions = getCliErrorSuggestions(cliError.code, DEFAULT_LANG);
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
        console.error(chalk.red(`[${cliError.code}] ${cliError.message}`));
        printCliErrorSuggestions(suggestions, DEFAULT_LANG);
        process.exitCode = 1;
      }
    });
}

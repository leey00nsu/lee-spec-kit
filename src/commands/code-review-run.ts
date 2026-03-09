import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG } from '../utils/i18n.js';
import { resolveContextSelection } from '../utils/context-selection.js';
import { createCliContext } from '../utils/cli-context.js';
import { resolveComponentOption } from '../utils/context/component-option.js';
import { getCodeReviewPrompt } from '../utils/agent-orchestration.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { getLocalDateString } from '../utils/date.js';

interface CodeReviewRunOptions {
  component?: string;
  json?: boolean;
}

function buildCodeReviewRunPrompt(input: {
  featureRef: string;
  basePrompt: string;
  lang: 'ko' | 'en';
}): string {
  if (input.lang === 'ko') {
    return [
      'PR 리뷰 코멘트를 확인하고 보조 에이전트로 수정 작업을 진행하세요.',
      `- Feature: ${input.featureRef}`,
      `- ${input.basePrompt}`,
      '- 사람/CodeRabbit이 남긴 리뷰 코멘트를 검토하고 필요한 코드/문서 수정을 진행하세요.',
      '- 수정 내용과 검토 결과를 반영한 뒤 `tasks.md`의 `PR Review Evidence/Decision`을 최신으로 기록하세요.',
      '- 관련 수정이 생기면 코드/문서 변경을 정리하고, push/merge는 메인 에이전트 최종 상태에서만 진행하세요.',
    ].join('\n');
  }

  return [
    'Review PR comments and use a helper agent/sub-agent for the follow-up fixes.',
    `- Feature: ${input.featureRef}`,
    `- ${input.basePrompt}`,
    '- Check human/CodeRabbit review comments and make the required code/docs changes.',
    '- Update `PR Review Evidence` and `PR Review Decision` in `tasks.md` after applying the fixes and summarizing the outcome.',
    '- If review fixes are needed, keep code/docs changes ready for the main-agent finalize state. Push/merge stays in the main agent.',
  ].join('\n');
}

async function runCodeReviewRun(
  featureName: string | undefined,
  options: CodeReviewRunOptions
): Promise<void> {
  const config = await getConfig(process.cwd());
  if (!config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      'No lee-spec-kit config found in this workspace.'
    );
  }

  const ctx = (await createCliContext({ cwd: process.cwd() }))!;
  const state = await resolveContextSelection(ctx, featureName, {
    component: resolveComponentOption(options.component),
  });
  if (state.status !== 'single_matched' || !state.matchedFeature) {
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      'code-review-run requires a single matched feature. Pass <feature-name> explicitly.'
    );
  }

  const feature = state.matchedFeature;
  const prompt = buildCodeReviewRunPrompt({
    featureRef: feature.folderName,
    basePrompt: getCodeReviewPrompt(config.lang),
    lang: config.lang,
  });
  const payload = {
    status: 'ready',
    reasonCode: 'CODE_REVIEW_RUN_READY',
    feature: feature.folderName,
    substateId: 'code_review_run',
    owner: 'subagent',
    handoffOnly: true,
    advancesWorkflow: false,
    nextMainState: 'code_review_finalize',
    tasksPath: path.join(feature.path, 'tasks.md'),
    decisionsPath: path.join(feature.path, 'decisions.md'),
    prompt,
    recordedAt: getLocalDateString(),
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(prompt);
  console.log();
  console.log(
    chalk.yellow(
      config.lang === 'ko'
        ? '이 명령은 PR 리뷰 코멘트 대응용 handoff만 준비합니다. 코멘트를 직접 읽어오거나 evidence/decision을 자동 기록하지 않으며, 상태도 바로 넘기지 않습니다.'
        : 'This command only prepares a handoff for addressing PR review comments. It does not fetch comments automatically, record review evidence/decision, or advance workflow state by itself.'
    )
  );
  console.log(chalk.gray(`- substate: ${payload.substateId}`));
  console.log(chalk.gray(`- owner: ${payload.owner}`));
  console.log(chalk.gray(`- next main state: ${payload.nextMainState}`));
  console.log(chalk.gray(`- tasks.md: ${payload.tasksPath}`));
  console.log(chalk.gray(`- decisions.md: ${payload.decisionsPath}`));
}

export function codeReviewRunCommand(program: Command): void {
  program
    .command('code-review-run [feature-name]')
    .description('Prepare a PR review execution handoff for sub-agent work')
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON')
    .action(
      async (featureName: string | undefined, options: CodeReviewRunOptions) => {
        try {
          await runCodeReviewRun(featureName, options);
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

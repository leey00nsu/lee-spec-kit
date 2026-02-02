import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { getConfig } from '../utils/config.js';
import {
  scanFeatures,
  FeatureContext,
  STEP_DEFINITIONS,
  STEPS,
} from '../utils/context.js';

interface ContextOptions {
  json?: boolean;
  repo?: 'fe' | 'be';
}

export function contextCommand(program: Command): void {
  program
    .command('context [feature-name]')
    .description('Show current feature context and next actions')
    .option('--json', 'Output in JSON format for agents')
    .option('--repo <repo>', 'Repository type for fullstack: fe | be')
    .action(
      async (featureName: string | undefined, options: ContextOptions) => {
        try {
          await runContext(featureName, options);
        } catch (error) {
          if (options.json) {
            console.log(
              JSON.stringify({
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
              })
            );
          } else {
            console.error(chalk.red('오류:'), error);
          }
          process.exit(1);
        }
      }
    );
}

function matchesFeatureSelector(f: FeatureContext, selector: string): boolean {
  const s = selector.trim();
  if (!s) return false;
  if (f.folderName.toLowerCase() === s.toLowerCase()) return true;
  if (f.slug.toLowerCase() === s.toLowerCase()) return true;
  if (f.id && f.id.toLowerCase() === s.toLowerCase()) return true;
  return false;
}

function detectFromBranch(
  branchName: string,
  features: FeatureContext[]
): FeatureContext[] {
  // feat/123-user-auth  또는 feat/123-F001-user-auth
  const match = branchName.match(/^feat\/\d+-(.+)$/);
  if (!match) return [];
  const detected = match[1];
  return features.filter(
    (f) =>
      f.slug.toLowerCase() === detected.toLowerCase() ||
      f.folderName.toLowerCase() === detected.toLowerCase()
  );
}

async function runContext(
  featureName: string | undefined,
  options: ContextOptions
): Promise<void> {
  const cwd = process.cwd();
  const config = await getConfig(cwd);

  if (!config) {
    throw new Error('설정 파일을 찾을 수 없습니다. 먼저 init을 실행해주세요.');
  }

  const { features, branches, warnings } = await scanFeatures(config);

  // 1. 타겟 Feature 찾기
  let targetFeatures: FeatureContext[] = [];

  if (featureName) {
    // selector로 검색: slug | F001 | F001-user-auth
    targetFeatures = features.filter((f) => matchesFeatureSelector(f, featureName));
    if (options.repo) {
      targetFeatures = targetFeatures.filter((f) => f.type === options.repo);
    }
  } else {
    // 자동 감지: 브랜치 이름에서 추출
    if (config.projectType === 'single') {
      const branchName = branches.project.single || '';
      targetFeatures = detectFromBranch(branchName, features);
    } else if (options.repo) {
      const branchName = branches.project[options.repo] || '';
      targetFeatures = detectFromBranch(
        branchName,
        features.filter((f) => f.type === options.repo)
      );
    } else {
      const feMatches = branches.project.fe
        ? detectFromBranch(
            branches.project.fe,
            features.filter((f) => f.type === 'fe')
          )
        : [];
      const beMatches = branches.project.be
        ? detectFromBranch(
            branches.project.be,
            features.filter((f) => f.type === 'be')
          )
        : [];
      targetFeatures = [...feMatches, ...beMatches];
    }

    if (targetFeatures.length === 0) targetFeatures = features;
  }

  // 2. 결과 출력 (JSON)
  if (options.json) {
    const result = {
      status:
        features.length === 0
          ? 'no_features'
          : targetFeatures.length === 1
          ? 'single_matched'
          : targetFeatures.length > 1
            ? 'multiple_active'
            : 'no_match',
      branches,
      warnings,
      matchedFeature: targetFeatures.length === 1 ? targetFeatures[0] : null,
      candidates: targetFeatures.length > 1 ? targetFeatures : [],
      actions: targetFeatures.length === 1 ? targetFeatures[0].actions : [],
      recommendation: '',
    };

    if (result.status === 'multiple_active') {
      result.recommendation =
        'Multiple features detected. Please specify feature name (slug | F001 | F001-slug) or use --repo.';
    } else if (result.status === 'no_features') {
      result.recommendation = 'No features found. Create a feature first.';
    } else if (result.status === 'no_match') {
      result.recommendation = 'No features found.';
    } else {
      result.recommendation = targetFeatures[0].nextAction;
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 3. 결과 출력 (Text)
  console.log();
  console.log(chalk.bold('📍 Current Context Check'));
  if (config.projectType === 'single') {
    if (branches.project.single) {
      console.log(
        chalk.gray(`   (Detected from Project Branch: ${branches.project.single})`)
      );
    }
  } else if (options.repo) {
    const branchName = branches.project[options.repo] || '';
    if (branchName) {
      console.log(
        chalk.gray(
          `   (Detected from Project Branch: ${options.repo.toUpperCase()} ${branchName})`
        )
      );
    }
  } else if (branches.project.fe || branches.project.be) {
    const parts = [
      branches.project.fe ? `FE ${branches.project.fe}` : null,
      branches.project.be ? `BE ${branches.project.be}` : null,
    ].filter(Boolean);
    console.log(chalk.gray(`   (Detected from Project Branch: ${parts.join(' / ')})`));
  }
  if (config.docsRepo === 'standalone' && branches.docs) {
    console.log(chalk.gray(`   (Docs Branch: ${branches.docs})`));
  }
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log();

  if (features.length === 0) {
    console.log(chalk.yellow('⚠️  진행 중인 Feature를 찾을 수 없습니다.'));
    console.log();
    return;
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow('⚠️  환경 경고:'));
    warnings.forEach((w) => console.log(chalk.yellow(`   - ${w}`)));
    console.log();
  }

  if (targetFeatures.length > 1) {
    console.log(
      chalk.blue(`🔹 ${targetFeatures.length} Active Features Detected:`)
    );
    console.log();

    targetFeatures.forEach((f) => {
      const stepName = STEPS[f.currentStep] || 'Unknown';
      const typeStr =
        config.projectType === 'fullstack' ? chalk.cyan(`(${f.type})`) : '';
      console.log(
        `   • ${chalk.bold(f.folderName)} ${typeStr} - ${chalk.yellow(stepName)}`
      );
    });

    console.log();
    console.log(chalk.gray('Tip: 특정 Feature의 상세 정보를 보려면:'));
    console.log(
      chalk.gray('   $ npx lee-spec-kit context <slug|F001|F001-slug> [--repo fe|be]')
    );
    console.log();
    return;
  }

  // Single Matched Feature
  const f = targetFeatures[0];
  const stepName = STEPS[f.currentStep] || 'Unknown';

  console.log(
    `🔹 Feature: ${chalk.bold(f.folderName)} ${config.projectType === 'fullstack' ? chalk.cyan(`(${f.type})`) : ''}`
  );
  if (f.issueNumber) {
    console.log(`   • Issue: #${f.issueNumber}`);
  }
  console.log(`   • Path: ${path.relative(cwd, f.path)}`);
  if (f.git.projectBranch) {
    console.log(`   • Project Branch: ${f.git.projectBranch}`);
  }

  console.log();
  console.log(
    `🔹 Progress: ${chalk.yellow(`Step ${f.currentStep}. ${stepName}`)}`
  );

  if (f.activeTask) {
    console.log(
      `   • Active Task: ${chalk.yellow(`[${f.activeTask.status}]`)} ${f.activeTask.title}`
    );
  } else if (f.nextTodoTask && f.currentStep === 8) {
    console.log(
      `   • Next TODO: ${chalk.gray(`[${f.nextTodoTask.status}]`)} ${f.nextTodoTask.title}`
    );
  }

  // 체크리스트 표시
  printChecklist(f);

  if (f.warnings.length > 0) {
    console.log();
    console.log(chalk.yellow('⚠️  Feature Warnings:'));
    f.warnings.forEach((w) => console.log(chalk.yellow(`   - ${w}`)));
  }

  console.log();
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  if (!f.actions || f.actions.length === 0) {
    console.log(`👉 Next Action: ${chalk.green(chalk.bold(f.nextAction))}`);
    console.log();
    return;
  }

  if (f.actions.length === 1) {
    const action = f.actions[0];
    if (action.type === 'command') {
      console.log(
        `👉 Next Action (${chalk.cyan(action.scope)}): ${chalk.green(chalk.bold(action.cmd))}`
      );
    } else {
      console.log(`👉 Next Action: ${chalk.green(chalk.bold(action.message))}`);
    }
    console.log();
    return;
  }

  console.log(chalk.green(chalk.bold('👉 Next Actions:')));
  f.actions.forEach((action) => {
    if (action.type === 'command') {
      console.log(`   • (${action.scope}) ${action.cmd}`);
    } else {
      console.log(`   • ${action.message}`);
    }
  });
  console.log();
}

function printChecklist(f: FeatureContext): void {
  const checklistSteps = [...STEP_DEFINITIONS].sort((a, b) => a.step - b.step);

  checklistSteps.forEach((definition) => {
    const done = definition.checklist.done(f);
    const detail = definition.checklist.detail?.(f) ?? '';
    const mark = done ? chalk.green('✅') : chalk.gray('◯');
    const label =
      definition.step === f.currentStep
        ? chalk.bold(definition.name)
        : definition.name;
    console.log(`   ${mark} ${definition.step}. ${label} ${detail}`);
  });
}

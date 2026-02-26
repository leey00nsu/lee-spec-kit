import { Lang } from './context/types.js';

export function getPrePrReviewPrompt(
  lang: Lang,
  skills: string[],
  fallbackText: string
): string {
  if (lang === 'ko') {
    return `PR 생성 전 사전 코드리뷰를 진행하세요.
1. 자동화된 오류 분석기(예: vitest, biome check, pnpm audit)를 실행하세요.
2. 리뷰 범위를 분리해 확인하세요.
   - main 기준: 'git diff --name-only $(git merge-base HEAD origin/main)..HEAD'
   - worktree 기준: 'git diff --name-only', 'git diff --name-only --cached', 'git ls-files --others --exclude-standard'
3. 확인된 각 파일에 대해 risk, security, perf, maintainability 평가와 구체적인 fileLine 위치가 포함된 'review-trace.json' 증거 파일을 생성하세요. 잔여 위험(residualRisks)과 실행한 명령어(commandsExecuted)도 포함하세요.
4. 기본 베이스라인은 '${fallbackText}'이며, 'create-pr' 문서의 'Pre-PR 기본 체크리스트' 섹션을 수행하세요. 
5. 우선순위 스킬: ${skills.length > 0 ? skills.join(', ') : '없음'} 로 심화 검토를 진행하세요.
6. 지적사항이 남아 있으면 먼저 'npx lee-spec-kit pre-pr-review <feature> --evidence review-trace.json --decision changes_requested' 로 기록하고 코드를 수정하세요.
7. 수정/재검증 후 최종 승인 시점에 'npx lee-spec-kit pre-pr-review <feature> --evidence review-trace.json --decision approve' 를 실행하세요.`;
  }
  return `Conduct a pre-PR code review.
1. Run automated analyzers (e.g., vitest, biome check, pnpm audit).
2. Split and check the review scope.
   - Main scope: 'git diff --name-only $(git merge-base HEAD origin/main)..HEAD'
   - Worktree scope: 'git diff --name-only', 'git diff --name-only --cached', 'git ls-files --others --exclude-standard'
3. Generate a 'review-trace.json' file for all changed files, including evaluations for risk, security, perf, maintainability, and specific fileLine locators. Also include residualRisks and commandsExecuted array.
4. The baseline is '${fallbackText}'. Always perform the 'Pre-PR Core Checklist' section of the 'create-pr' document. 
5. Priority skills: ${skills.length > 0 ? skills.join(', ') : 'None'} for deeper technical review.
6. If unresolved findings remain, first record them with 'npx lee-spec-kit pre-pr-review <feature> --evidence review-trace.json --decision changes_requested' and apply code fixes.
7. After fixes and re-validation, run 'npx lee-spec-kit pre-pr-review <feature> --evidence review-trace.json --decision approve' for final pre-PR approval.`;
}

export function getCodeReviewPrompt(lang: Lang): string {
  if (lang === 'ko') {
    return `리뷰 코멘트를 확인/분석한 뒤 필요한 수정을 진행하세요. PR 상태는 Review를 유지하고 'PR 리뷰 Evidence/Decision'을 최신으로 기록하세요. 원격 반영(push)은 명시적인 머지 승인(라벨) 후, 로컬 브랜치가 upstream보다 앞선 경우에만 진행하세요.`;
  }
  return `Review and analyze comments, then make necessary fixes. Keep PR status as Review and record the latest 'PR Review Evidence/Decision'. Push changes only after explicit approval (label) and only if the local branch is ahead of upstream.`;
}

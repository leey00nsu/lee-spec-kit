import { Lang } from './context/types.js';

export function getPrePrReviewPrompt(
  lang: Lang,
  skills: string[],
  fallbackText: string
): string {
  if (lang === 'ko') {
    return `PR 생성 전 사전 코드리뷰를 진행하세요.
0. 같은 feature/pre-PR 리뷰를 담당하던 보조 에이전트가 이미 있으면 새로 만들지 말고 재사용하세요. 기본은 보조 에이전트 1개입니다.
1. \`spec.md\`, \`plan.md\`, \`tasks.md\`를 읽고 feature 목표/범위/완료 기준을 먼저 요약하세요.
2. 리뷰 범위를 분리해 확인하세요.
   - main 기준: 'git diff --name-only $(git merge-base HEAD origin/main)..HEAD'
   - worktree 기준: 'git diff --name-only', 'git diff --name-only --cached', 'git ls-files --others --exclude-standard'
    3. 구현이 feature 의도에 맞는지 평가하세요. 특히 \`featureIntentSummary\`, \`implementationFit\`, \`missingCases\`, \`residualRisks\`, \`approvalRationale\`를 구체적으로 작성하세요.
    4. 확인된 각 파일에 대해 risk, security, perf, maintainability 평가와 구체적인 fileLine 위치가 포함된 'review-trace.json' 증거 파일을 생성하세요. 증거에는 반드시 \`baseSha\`, \`headSha\`, \`changedFiles\`, \`reviewedFiles\`, \`riskSummaries\`(blocking/important/minor)가 포함되어야 합니다.
5. 기본 베이스라인은 '${fallbackText}'이며, 'create-pr' 문서의 'Pre-PR 기본 체크리스트' 섹션을 수행하세요.
6. 우선순위 스킬: ${skills.length > 0 ? skills.join(', ') : '없음'} 로 심화 검토를 진행하세요.
7. 추가 검증이 꼭 필요할 때만 audit/타깃 명령을 실행하세요. 별도 보조 에이전트 추가 생성도 꼭 필요할 때만 하세요.
8. 보조 에이전트 한도에 걸리면 메인 에이전트에서 리뷰를 이어가고, 이미 수집한 결과만 정리해도 됩니다.
9. 실행한 명령이 있으면 \`commandsExecuted\`에 기록하세요.
    10. 지적사항이 남아 있으면 먼저 'npx lee-spec-kit pre-pr-review <feature> --evidence review-trace.json --decision changes_requested' 로 기록하세요. 단, \`workflow.prePrReview.evidenceMode=any\` 이고 실행 증거 강제가 없으면 \`--evidence\` 없이 직접 기록해도 됩니다.
    11. 수정/재검증 후 최종 승인 시점에는 반드시 구조화된 evidence와 함께 'npx lee-spec-kit pre-pr-review <feature> --evidence review-trace.json --decision approve' 를 실행하세요. approve는 evidence 없이 기록할 수 없습니다.`;
  }
  return `Conduct a pre-PR code review.
0. Reuse the existing helper/sub-agent for this feature review if one already exists. Default to a single helper agent.
1. Read \`spec.md\`, \`plan.md\`, and \`tasks.md\` first, then summarize the feature goal, scope, and done criteria.
2. Split and check the review scope.
   - Main scope: 'git diff --name-only $(git merge-base HEAD origin/main)..HEAD'
   - Worktree scope: 'git diff --name-only', 'git diff --name-only --cached', 'git ls-files --others --exclude-standard'
    3. Evaluate whether the implementation actually fits the feature intent. Capture concrete \`featureIntentSummary\`, \`implementationFit\`, \`missingCases\`, \`residualRisks\`, and \`approvalRationale\`, and explicitly set \`specAlignmentChecked\`.
    4. Generate a 'review-trace.json' file for all changed files, including \`baseSha\`, \`headSha\`, \`changedFiles\`, \`reviewedFiles\`, \`riskSummaries\` (blocking/important/minor), \`findingCount\`, \`blockingFindings\`, per-file risk/security/perf/maintainability evaluations, and specific \`fileLine\` locators.
5. The baseline is '${fallbackText}'. Always perform the 'Pre-PR Core Checklist' section of the 'create-pr' document.
6. Priority skills: ${skills.length > 0 ? skills.join(', ') : 'None'} for deeper technical review.
7. Run extra audit/targeted verification only when the review truly needs more evidence. Spawn additional helper agents only when necessary.
8. If helper-agent quota is exhausted, continue the review in the main agent and just keep the evidence consistent.
9. Record commands in \`commandsExecuted\` only when you actually ran them.
    10. If unresolved findings remain, first record them with 'npx lee-spec-kit pre-pr-review <feature> --evidence review-trace.json --decision changes_requested'. When \`workflow.prePrReview.evidenceMode=any\` and execution evidence is not enforced, direct record mode without \`--evidence\` is also valid.
    11. After fixes and re-validation, run 'npx lee-spec-kit pre-pr-review <feature> --evidence review-trace.json --decision approve' for final pre-PR approval. Approve never records without structured evidence.`;
}

export function getCodeReviewPrompt(lang: Lang): string {
  if (lang === 'ko') {
    return `리뷰 코멘트를 확인/분석한 뒤 필요한 수정을 진행하세요. 기존 review 담당 보조 에이전트가 있으면 재사용하고, 기본은 1개만 사용하세요. 보조 에이전트 한도에 걸리면 메인 에이전트에서 이어가세요. PR 상태는 Review를 유지하고 'PR 리뷰 Evidence/Decision'을 최신으로 기록하세요. 원격 반영(push)은 명시적인 머지 승인(라벨) 후, 로컬 브랜치가 upstream보다 앞선 경우에만 진행하세요.`;
  }
  return `Review and analyze comments, then make necessary fixes. Reuse the existing review helper agent if one already exists, and default to a single helper agent. If helper-agent quota is exhausted, continue in the main agent. Keep PR status as Review and record the latest 'PR Review Evidence/Decision'. Push changes only after explicit approval (label) and only if the local branch is ahead of upstream.`;
}

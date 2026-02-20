import { Lang } from './context/types.js';

export function getPrePrReviewPrompt(
  lang: Lang,
  skills: string[],
  fallbackText: string
): string {
  if (lang === 'ko') {
    return `PR 생성 전 사전 코드리뷰를 진행하세요. 기본 베이스라인은 '${fallbackText}'이며, 'create-pr' 문서의 'Pre-PR 기본 체크리스트' 섹션을 항상 수행하세요. 우선순위 스킬: ${
      skills.length > 0 ? skills.join(', ') : '없음'
    } (설치된 더 적합한 스킬이 있다면 먼저 제안 후 사용)로 추가 심화 검토를 진행하세요. 완료 후 'PR 전 리뷰'를 Done으로 업데이트하세요.`;
  }
  return `Conduct a pre-PR code review. The baseline is '${fallbackText}', and always perform the 'Pre-PR Core Checklist' section of the 'create-pr' document. Priority skills: ${
    skills.length > 0 ? skills.join(', ') : 'None'
  } (if a more suitable skill is installed, suggest it before use) to conduct a deeper technical review. After completion, update 'Pre-PR Review' to Done.`;
}

export function getCodeReviewPrompt(lang: Lang): string {
  if (lang === 'ko') {
    return `리뷰 코멘트를 확인/분석한 뒤 필요한 수정을 진행하세요. PR 상태는 Review를 유지하고 'PR 리뷰 Evidence/Decision'을 최신으로 기록하세요. 원격 반영(push)은 사용자 승인(OK) 후, 로컬 브랜치가 upstream보다 앞선 경우에만 진행하세요.`;
  }
  return `Review and analyze comments, then make necessary fixes. Keep PR status as Review and record the latest 'PR Review Evidence/Decision'. Push changes only after user confirmation (OK) and only if the local branch is ahead of upstream.`;
}

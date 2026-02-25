export const koWarnings = {
  projectBranchUnavailable:
    '프로젝트 브랜치를 확인할 수 없습니다. (standalone 모드에서는 projectRoot가 필요합니다.)',
  projectExpectedBranchOnMainWorkspace:
    'feature 브랜치가 메인 워크스페이스에서 체크아웃되어 있습니다. 가능하면 `.worktrees/*` 경로에서 작업하세요.',
  workflowWorktreeRequired:
    '`workflow.requireWorktree=true` 설정으로 인해 태스크 실행은 `.worktrees/*` 경로에서만 허용됩니다.',
  docsGitUnavailable:
    'docs 레포의 git 상태를 확인할 수 없습니다. (레포 위치 / git init 확인)',
  docsPathIgnored:
    '현재 Feature 문서 경로가 git ignore 대상입니다: {path} (docs 커밋 감지가 제한될 수 있습니다.)',
  docsUncommittedChanges:
    '문서 변경사항이 커밋되지 않았습니다. (추가 문서 커밋 필요) 커밋 메시지 규칙은 git-workflow 가이드를 기준으로 확인하세요.',
  projectUncommittedChanges:
    '프로젝트 코드 변경사항이 커밋되지 않았습니다. (추가 코드 커밋 필요)',
  featureScopeSplitSuggested:
    'Feature 범위가 단일 이슈로 처리하기에 큽니다. (tasks: {taskCount}, decisions 줄수: {decisionsLineCount}; 분할 제안 기준: tasks {taskThreshold}개 또는 decisions {decisionsThreshold}줄) 현재 권장 분할: {recommendedIssues}개 이슈 (4분할 하드 기준: tasks >= {recommendFourTaskThreshold} 또는 decisions 줄수 >= {recommendFourDecisionsThreshold}).',
  legacyTasksDocStatusField:
    '구버전 tasks.md 포맷입니다. `문서 상태` 필드(Draft/Review/Approved)를 추가해 태스크 승인 단계를 활성화하세요.',
  legacyTasksPrFields:
    '구버전 tasks.md 포맷입니다. PR 단계 전에 `PR` 및 `PR 상태` 필드를 추가하세요.',
  legacyTasksPrePrReviewField:
    '구버전 tasks.md 포맷입니다. PR 단계 전에 `PR 전 리뷰` 필드를 추가하세요. (`- **PR 전 리뷰**: Pending | Done`)',
  legacyTasksPrePrEvidenceField:
    '구버전 tasks.md 포맷입니다. PR 단계 전에 `PR 전 리뷰 Evidence` 필드를 추가하세요.',
  legacyTasksPrePrDecisionField:
    '구버전 tasks.md 포맷입니다. PR 단계 전에 `PR 전 리뷰 Decision` 필드를 추가하세요. (`- **PR 전 리뷰 Decision**: 결정: ...`)',
  legacyTasksPrReviewEvidenceField:
    '구버전 tasks.md 포맷입니다. 리뷰 단계 전에 `PR 리뷰 Evidence` 필드를 추가하세요.',
  legacyTasksPrReviewDecisionField:
    '구버전 tasks.md 포맷입니다. 리뷰 단계 전에 `PR 리뷰 Decision` 필드를 추가하세요. (`- **PR 리뷰 Decision**: 결정: ...`)',
  workflowSpecNotApproved:
    '완료 상태이지만 spec.md 상태가 Approved가 아닙니다. (spec.md의 상태를 Approved로 업데이트하세요.)',
  workflowPlanNotApproved:
    '완료 상태이지만 plan.md 상태가 Approved가 아닙니다. (plan.md의 상태를 Approved로 업데이트하세요.)',
  workflowIssueMissing:
    '완료 상태이지만 이슈 번호가 비어있습니다. (tasks.md의 이슈 번호를 채우세요.)',
  workflowProjectUncommittedChanges:
    '완료 조건 이전에 프로젝트 코드 변경사항을 커밋해야 합니다. (프로젝트 워크트리 미커밋 변경 존재)',
  workflowPrLinkMissing:
    '완료 상태이지만 PR 링크가 비어있습니다. (tasks.md의 PR 필드를 채우세요.)',
  workflowPrStatusMissing:
    '완료 상태이지만 PR 상태가 비어있습니다. (PR 생성/리뷰 단계에서는 PR 상태를 Review로 설정하세요.)',
  workflowPrStatusNotApproved:
    '완료 상태이지만 PR 상태가 Approved가 아닙니다. (PR 생성/리뷰 단계는 Review를 유지하고, merge 성공 시에만 Approved로 동기화하세요.)',
  workflowPrReviewEvidenceMissing:
    '리뷰 단계에서 `PR 리뷰 Evidence`가 비어있거나 유효하지 않습니다. (`요약: ...`/`summary: ...` 또는 `PR Review Log`의 `Summary`/`Decision`이 있는 경로를 기록)',
  workflowPrReviewDecisionMissing:
    '리뷰 단계에서 `PR 리뷰 Decision`이 비어있거나 결정 형식이 없습니다. (`결정: ...` 또는 `decision: ...` 형식으로 기록)',
  workflowPrRemoteChangesRequested:
    '원격 PR에서 변경 요청 또는 추가 리뷰가 감지되었습니다. 코멘트 반영 후 push하고 다시 확인하세요.',
  workflowPrRemoteChecksFailing:
    '원격 PR 체크 실패가 {count}건 감지되었습니다. 실패 원인을 해결 후 다시 확인하세요.',
  workflowPrRemoteChecksPending:
    '원격 PR 체크 대기가 {count}건 감지되었습니다. 체크 완료 후 다시 확인하세요.',
  workflowPrePrReviewMissing:
    '완료 상태이지만 `PR 전 리뷰` 필드가 없습니다. (tasks.md에 `- **PR 전 리뷰**: Pending | Done`을 추가하세요.)',
  workflowPrePrReviewNotDone:
    '완료 상태이지만 `PR 전 리뷰`가 Done이 아닙니다. (사전 코드리뷰 후 Done으로 업데이트하세요.)',
  workflowPrePrEvidenceMissing:
    '완료 상태이지만 `PR 전 리뷰 Evidence`가 비어있거나 유효하지 않습니다. (`Pre-PR Review Log`/`PR 전 리뷰 로그`에 placeholder가 아닌 `Summary`/`Decision`/`Findings`(또는 명시적 `0 findings`)/`Residual Risks`/`Tests Run`이 있는 실제 경로를 기록하세요.)',
  workflowPrePrDecisionMissing:
    '완료 상태이지만 `PR 전 리뷰 Decision`이 비어있거나 형식이 올바르지 않습니다. (`decision: approve|changes_requested|blocked ...` 형식)',
  workflowPrePrDecisionNotApproved:
    '완료 상태이지만 `PR 전 리뷰 Decision`이 `{outcome}`입니다. 리뷰 리스크를 해소한 뒤 pre-pr-review를 재실행해 `approve`로 맞추세요.',
} as const;

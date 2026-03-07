export const koMessages = {
  specCreate:
    'spec.md를 작성하고 상태를 Review로 변경하세요. (agents 가이드 기준)',
  specImprove: 'spec.md를 보완하고 상태를 Review로 변경하세요.',
  specApproval:
    'spec.md 내용을 사용자에게 공유하고 진행 승인(라벨 응답 제공)을 받으세요.',
  planCreate:
    'plan.md를 작성하고 상태를 Review로 변경하세요. (agents 가이드 기준)',
  planImprove: 'plan.md를 보완하고 상태를 Review로 변경하세요.',
  planApproval:
    'plan.md 내용을 사용자에게 공유하고 진행 승인(라벨 응답 제공)을 받으세요.',
  tasksCreate:
    'tasks.md를 작성하고 문서 상태를 Review로 변경하세요. (agents/execute-task 가이드 기준)',
  tasksNeedAtLeastOne: 'tasks.md에 최소 1개 이상의 태스크를 작성하세요.',
  tasksImprove: 'tasks.md를 보완하고 문서 상태를 Review로 변경하세요.',
  tasksApproval:
    'tasks.md 내용을 사용자에게 공유하고 진행 승인(라벨 응답 제공)을 받으세요. (승인 후 문서 상태를 Approved로 변경)',
  docsCommitPlanning:
    'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(planning): {folderName} 기획 문서"',
  issueCreateAndWrite:
    '이슈 본문 템플릿을 생성해 목표/완료 기준을 검토·보완하고, 명시적 승인(라벨) 후 이슈를 생성하세요. 이후 tasks.md의 이슈 번호를 채우고 문서 커밋을 준비하세요.',
  issuePrepareFromDoc:
    '`issue.md`를 기준으로 이슈 제목/본문/라벨 초안을 보완하고 명시적 승인(라벨)을 받아 상태를 `Ready`로 변경하세요.',
  issueCreateFromDoc:
    '`issue.md` 상태가 `Ready`이면 GitHub Issue를 생성하고, 생성된 이슈 번호를 `tasks.md`에 반영하세요.',
  docsCommitIssueUpdate:
    'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(#{issueNumber}): {folderName} 문서 업데이트"',
  docsCommitUpdate:
    'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs: {folderName} 문서 업데이트"',
  projectCommitIssueUpdate:
    'cd "{projectGitCwd}" && (git diff --cached --quiet && echo "스테이징된 파일이 없습니다. 이번 태스크에서 수정한 파일만 선택해 git add [files] 후 다시 실행하세요." && exit 1 || git commit -m "feat(#{issueNumber}): {commitTopic}")',
  projectCommitUpdate:
    'cd "{projectGitCwd}" && (git diff --cached --quiet && echo "스테이징된 파일이 없습니다. 이번 태스크에서 수정한 파일만 선택해 git add [files] 후 다시 실행하세요." && exit 1 || git commit -m "feat({folderName}): {commitTopic}")',
  reviewFixCommitIssueGuidance:
    'PR 리뷰 수정 커밋을 진행하세요. 리뷰 반영 파일만 스테이징한 뒤 `fix(#{issueNumber}): <review-fix-summary>` 형식으로 커밋하세요. `<review-fix-summary>`에는 이번 커밋에서 실제로 해결한 리뷰 항목 요약을 작성하세요. (태스크 제목 재사용 금지)',
  reviewFixCommitGuidance:
    'PR 리뷰 수정 커밋을 진행하세요. 리뷰 반영 파일만 스테이징한 뒤 `fix(review): <review-fix-summary>` 형식으로 커밋하세요. `<review-fix-summary>`에는 이번 커밋에서 실제로 해결한 리뷰 항목 요약을 작성하세요. (태스크 제목 재사용 금지)',
  prePrFixCommitIssueGuidance:
    'pre-PR 리뷰 지적사항 수정 커밋을 진행하세요. pre-PR 수정 파일만 스테이징한 뒤 `fix(#{issueNumber}): <pre-pr-fix-summary>` 형식으로 커밋하세요. `<pre-pr-fix-summary>`에는 pre-PR에서 해결한 지적사항을 작성하세요.',
  prePrFixCommitGuidance:
    'pre-PR 리뷰 지적사항 수정 커밋을 진행하세요. pre-PR 수정 파일만 스테이징한 뒤 `fix(pre-pr): <pre-pr-fix-summary>` 형식으로 커밋하세요. `<pre-pr-fix-summary>`에는 pre-PR에서 해결한 지적사항을 작성하세요.',
  standaloneNeedsProjectRoot:
    'standalone 모드에서는 projectRoot 설정이 필요합니다. (npx lee-spec-kit config --project-root ...)',
  createBranch:
    'cd "{projectGitCwd}" && mkdir -p .worktrees && (git worktree add ".worktrees/feat-{issueNumber}-{slug}" "feat/{issueNumber}-{slug}" || git worktree add -b "feat/{issueNumber}-{slug}" ".worktrees/feat-{issueNumber}-{slug}") && WT="{projectGitCwd}/.worktrees/feat-{issueNumber}-{slug}" && for f in .env .env.local .env.development .env.development.local .env.test .env.test.local .env.production .env.production.local; do [ -f "{projectGitCwd}/$f" ] && [ ! -e "$WT/$f" ] && cp "{projectGitCwd}/$f" "$WT/$f" || true; done && echo "worktree: {projectGitCwd}/.worktrees/feat-{issueNumber}-{slug}"',
  moveToExistingWorktree:
    '해당 feature용 worktree가 이미 있습니다. 먼저 `cd "{worktreePath}"`로 이동한 뒤 context를 다시 실행하세요.',
  worktreeRequiredFromMainBranch:
    '`workflow.requireWorktree`가 활성화되어 있지만 현재 feature 브랜치가 메인 워크스페이스에 체크아웃되어 있습니다. 메인 워크스페이스를 기본 브랜치로 되돌린 뒤 `.worktrees/feat-{issueNumber}-{slug}`를 생성/재사용하고 그 worktree에서 계속 진행하세요.',
  worktreeCleanupCommand:
    'cd "{projectGitCwd}" && WT="{worktreePath}" && ROOT="$(pwd)" && case "$WT" in "$ROOT"/.worktrees/*) if git worktree list --porcelain | grep -Fxq "worktree $WT"; then git worktree remove --force "$WT" || true; fi; [ -d "$WT" ] && rm -rf "$WT" || true ;; *) echo "skip unsafe worktree path: $WT" ;; esac && git worktree prune && CURRENT_BRANCH=$(git branch --show-current) && DEFAULT_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | cut -d/ -f2-) && TARGET_BRANCH="${DEFAULT_BRANCH:-$CURRENT_BRANCH}" && if [ -n "$TARGET_BRANCH" ]; then git checkout "$TARGET_BRANCH" >/dev/null 2>&1 || true; fi && if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1 && [ -z "$(git status --porcelain)" ]; then git pull --ff-only || true; fi',
  tasksAllDoneButNoChecklist:
    '완료 조건 체크리스트를 작성하세요. tasks.md의 "완료 조건" 섹션에 검증 항목을 추가하고, 사용자와 확인 후 충족 항목을 [x]로 체크하세요. 명시적인 최종 승인도 반영하세요.',
  tasksAllDoneButChecklist:
    '완료 조건 체크리스트의 남은 항목을 진행하세요. 현재 진행: ({checked}/{total}) 사용자와 확인 후 충족 항목을 [x]로 체크하고 명시적인 최종 승인을 반영하세요.',
  finishDoingTask:
    '현재 DOING/REVIEW 태스크를 수행하세요: "{title}" ({done}/{total}) 완료 시 결과/검증을 공유하고 DONE 처리',
  startNextTodoTask:
    '다음 TODO 태스크를 시작합니다: "{title}" ({done}/{total}) 작업을 시작하면 DOING 처리',
  checkTaskStatuses: '태스크 상태를 확인하세요. ({done}/{total})',
  taskCommitGateStrictBlock:
    '다음 TODO 태스크로 넘어가기 전에 `1 태스크 = 1 커밋` 규칙을 충족해야 합니다. 점검 결과: {reason}. 태스크 커밋 단위를 정리한 뒤 다시 진행하세요.',
  taskCommitGateWarnProceed:
    '⚠️ 태스크 커밋 단위 점검 경고: {reason}. 현재는 진행 가능하지만 `1 태스크 = 1 커밋`을 권장합니다.',
  taskCommitGateReasonNoTasksCommit:
    '최근 프로젝트 코드 커밋을 찾을 수 없습니다',
  taskCommitGateReasonTasksFileUnavailable:
    '최근 프로젝트 코드 커밋 이력을 판독할 수 없습니다',
  taskCommitGateReasonDoneCount:
    '최신 tasks.md 커밋에서 DONE 전환이 {count}건 감지되었습니다',
  taskCommitGateReasonMismatchLastDone:
    '최근 프로젝트 코드 커밋이 직전 완료 태스크와 일치하지 않습니다',
  prLegacyAsk:
    'tasks.md에 PR/PR 상태 필드가 없습니다. 템플릿을 최신 포맷으로 업데이트할까요? (확인 필요)',
  prePrReviewFieldMissing:
    'tasks.md에 `PR 전 리뷰` 필드가 없습니다. `- **PR 전 리뷰**: Pending | Done` 항목을 추가하고 다시 context를 실행하세요. (확인 필요)',
  prePrReviewRun:
    '코드 리뷰 에이전트를 실행해 `spec.md`/`plan.md`/`tasks.md` 대비 구현 적합성을 검토하고, `Summary`/`Feature Intent Summary`/`Implementation Fit`/`Missing Cases`/`Spec Alignment Checked`/`Finding Count`/`Blocking Findings`/`Findings`/`Residual Risks`가 포함된 `review-trace.json`을 생성한 뒤 `pre-pr-review`로 리뷰 결과를 기록하세요. 현재 evidence 정책이 경로를 요구할 때만 `--evidence review-trace.json`을 함께 사용하세요. (확인 필요)',
  prePrReviewEvidenceMissing:
    'tasks.md의 `PR 전 리뷰 Evidence`가 비어있거나 유효하지 않습니다. 실제 파일 경로와 `Pre-PR Review Log`(또는 `PR 전 리뷰 로그`)에 placeholder가 아닌 `Summary`/`Feature Intent Summary`/`Implementation Fit`/`Missing Cases`/`Spec Alignment Checked`/`Finding Count`/`Blocking Findings`/`Decision`/`Findings`(또는 명시적 `0 findings`)/`Residual Risks`를 기록하세요. (확인 필요)',
  prePrReviewDecisionMissing:
    'tasks.md의 `PR 전 리뷰 Decision`이 비어있거나 결정 형식이 없습니다. `결정: ...`(또는 `decision: ...`) 형식으로 기록하세요. (확인 필요)',
  prePrReviewFixRequired:
    '현재 `PR 전 리뷰 Decision`이 `{decision}`입니다. PR 생성 단계로 이동하기 전에 pre-PR 지적사항을 코드에 반영하세요. (확인 필요)',
  prePrReviewDecisionReconfirm:
    '현재 `PR 전 리뷰 Decision`이 `{decision}`입니다. 지적사항을 반영한 뒤 이전 상태 재사용을 막기 위해 명시적으로 Decision을 지정해 재실행하세요: `{command}` (확인 필요)',
  prReviewEvidenceFieldMissing:
    'tasks.md에 `PR 리뷰 Evidence` 필드가 없습니다. `- **PR 리뷰 Evidence**: -` 항목을 추가하고 다시 진행하세요. (확인 필요)',
  prReviewEvidenceMissing:
    'tasks.md의 `PR 리뷰 Evidence`가 비어있거나 유효하지 않습니다. `요약: ...`(또는 `summary: ...`) 형식으로 기록하거나 `PR Review Log`(또는 `PR 리뷰 로그`)의 `Summary`/`Decision`이 있는 파일 경로를 지정하세요. (확인 필요)',
  prReviewDecisionFieldMissing:
    'tasks.md에 `PR 리뷰 Decision` 필드가 없습니다. `- **PR 리뷰 Decision**: -` 항목을 추가하고 다시 진행하세요. (확인 필요)',
  prReviewDecisionMissing:
    'tasks.md의 `PR 리뷰 Decision`이 비어있거나 결정 형식이 없습니다. `결정: ...`(또는 `decision: ...`) 형식으로 기록하세요. (확인 필요)',
  prCreate:
    'PR 본문 템플릿을 생성해 변경 사항/테스트 섹션을 검토·보완하고, 명시적 진행 승인(라벨 제공) 후 PR을 생성하세요. 이후 tasks.md에 PR 링크를 기록하세요.',
  prCreatePrepareFromDoc:
    '`pr.md`를 기준으로 PR 제목/본문/라벨 초안을 보완하고 진행 승인을 받아 확인 후 상태를 `Ready`로 변경하세요.',
  prCreateExecuteFromDoc:
    '`pr.md` 상태가 `Ready`이면 PR을 생성하고, 생성된 PR 링크/PR 상태를 `tasks.md`에 기록하세요. (`pr.md`는 상태 `Ready`만 유지)',
  prCreatePrepare:
    'PR 본문 템플릿을 생성해 변경 사항/테스트 섹션을 검토·보완하고, PR 생성 전 명시적인 진행 승인을 받으세요.',
  prCreateExecute:
    '확정된 PR 본문으로 PR을 생성하고, 생성된 PR 링크를 tasks.md의 PR 필드에 기록하세요.',
  prCreateRequiredSequence:
    'PR 생성은 필수 2단계입니다: (1) PR 본문 템플릿 생성/보완 + 명시적 진행 승인, (2) PR 생성 + tasks.md PR 링크 기록. 위 순서를 모두 완료하세요.',
  prFillStatus:
    'tasks.md의 PR 상태를 Review로 설정하세요. (PR 생성/리뷰 단계에서는 Review를 유지합니다.)',
  prReviewMergedSyncStatus:
    '원격 PR이 이미 머지되었습니다. tasks.md의 PR 상태를 Approved로 업데이트하세요. (PR 리뷰 Evidence/Decision 필드도 최신 상태로 확인)',
  prResolveReview:
    '리뷰 코멘트를 해결하세요. PR 상태는 Review를 유지하고, 리뷰 수정 커밋 메시지는 실제로 해결한 항목 요약으로 작성하세요. (태스크 제목 재사용 금지) 머지 준비가 되면 명시적인 승인(라벨) 후 머지 옵션을 실행하세요. (성공 시 PR 상태가 Approved로 동기화됩니다.)',
  prReviewPush: 'cd "{projectGitCwd}" && git push',
  prReviewRemoteBlocked:
    '원격 PR 상태를 확인한 결과 아직 머지 준비가 되지 않았습니다: {reasons}. 리뷰 코멘트/체크 상태를 정리한 뒤 다시 확인하세요.',
  prReviewRemoteReasonChangesRequested:
    '리뷰 승인 상태가 변경 요청 또는 추가 리뷰 필요 상태입니다',
  prReviewRemoteReasonClosed:
    'PR이 머지되지 않은 채 닫혀 있습니다 (reopen 또는 새 PR 필요)',
  prReviewRemoteReasonChecksFailing: '실패한 체크가 {count}건 있습니다',
  prReviewRemoteReasonChecksPending: '대기 중인 체크가 {count}건 있습니다',
  prReviewRemoteReasonMergeBlocked:
    '머지 상태가 `{status}`로 차단되어 있습니다',
  prReviewRemoteReasonUnavailable:
    '원격 PR 상태를 확인하지 못했습니다 (gh 인증/네트워크/권한 확인 필요)',
  prReviewMerge:
    '머지 준비가 되면 명시적인 승인(라벨)을 받은 뒤 머지 옵션을 실행하세요. (성공 시 PR 상태가 Approved로 동기화됩니다.)',
  prReviewMergeCommand:
    'npx lee-spec-kit github pr {featureRef} --merge --confirm OK',
  prRequestReview:
    '리뷰어에게 리뷰를 요청하고 PR 상태를 Review로 설정/유지하세요.',
  featureScopeSplitKeep:
    'Feature 범위가 큽니다. (tasks: {taskCount}, decisions 줄수: {decisionsLineCount}; 분할 제안 기준: {taskThreshold}/{decisionsThreshold}) 현재 권장 분할은 {recommendedIssues}개 이슈입니다. 먼저 `{guideCommand}`를 확인하고 결합도, 변경 파일 겹침, 테스트 경계, 배포 독립성 기준으로 판단하세요. 이슈를 유지할 경우 tasks.md 범위를 축소하고 저우선 TODO는 활성 배치에서 제외하세요.',
  featureScopeSplitTwo:
    'Feature 범위가 큽니다. (tasks: {taskCount}, decisions 줄수: {decisionsLineCount}) 권장 규칙상 40~79 태스크이면서 하드 기준 미만이면 2개 이슈 분할이 기본입니다. `{guideCommand}`를 따라 결합도/파일겹침/테스트/배포 기준으로 분할하세요. 각 이슈에는 다음 템플릿을 기록하세요: 목표, 포함 범위, 제외 범위, 선행 의존성, PR 완료 기준.',
  featureScopeSplitFour:
    'Feature 범위가 큽니다. (tasks: {taskCount}, decisions 줄수: {decisionsLineCount}) tasks >= {recommendFourTaskThreshold} 또는 decisions 줄수 >= {recommendFourDecisionsThreshold}이면 4개 이슈 분할을 강하게 권장합니다. `{guideCommand}`를 따라 4개의 연관 이슈로 분리하고 의존 순서를 명시한 뒤 PR을 순차 머지하세요. 각 이슈 템플릿: 목표, 포함 범위, 제외 범위, 선행 의존성, PR 완료 기준.',
  userRequestReplan:
    '현재 단계와 별개로 사용자가 제안한 새 요구를 먼저 반영할 수 있습니다. 요구사항을 요약해 tasks.md에 추가하거나 별도 Feature로 분리한 뒤, 문서 상태를 맞추고 context를 다시 실행하세요.',
  featureDone:
    '워크플로우 요구사항과 모든 태스크/완료 조건이 충족되었습니다. 이 Feature는 완료 상태입니다.',
  fallbackRerunContext:
    '상태를 판별할 수 없습니다. 문서를 확인한 뒤 다시 context를 실행하세요.',
} as const;

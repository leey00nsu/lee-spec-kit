export const koContext = {
  'context.noActiveFeatures': '⚠️  진행 중인 Feature를 찾을 수 없습니다.',
  'context.header': '📍 현재 컨텍스트 확인',
  'context.envWarnings': '⚠️  환경 경고:',
  'context.openFallbackSummary':
    '(브랜치로 Feature를 특정하지 못해 미완료 Feature만 표시합니다. 진행 중: {inProgress}개 / 종료 대기: {readyToClose}개 / 완료: {done}개)',
  'context.sectionInProgress': '진행 중',
  'context.sectionReadyToClose': '종료 준비',
  'context.tipDetails': 'Tip: 특정 Feature의 상세 정보를 보려면:',
  'context.tipShowAll': '전체 보기',
  'context.tipShowDone': '완료만 보기',
  'context.checkRequired': '[확인 필요] ',
  'context.checkPolicyHint':
    'ℹ️  사용자 확인 정책은 세션 시작(또는 context 압축/리셋 직후)에 1회 확인하고, 이후에는 정책/설정 변경 또는 사용자 새로고침 요청 시에만 재확인하세요. (git push/merge/merge commit 포함) [확인 필요]가 있으면 라벨 토큰 규칙(`A`, `A OK`, `A 진행해`)에 맞는 응답을 받은 뒤 진행하세요. (config: approval로 조정 가능)',
  'context.actionOptionHint':
    '라벨 응답 규칙: `A`, `A OK`, `A 진행해` 중 하나의 형식으로 응답',
  'context.actionExplainHint':
    'CLI가 준 승인 문구를 먼저 그대로 보여주세요. 추가 설명은 사용자가 물을 때만 덧붙이고, 승인 문구 자체는 바꾸지 마세요.',
  'context.finalLabelPrompt':
    '현재 선택 가능한 라벨: {labels}. 라벨 응답 규칙(`A`, `A OK`, `A 진행해`)으로 응답하세요. (예: `{example}`)',
  'context.finalLabelPromptWithRequest':
    '현재 선택 가능한 라벨: {labels}. 라벨 응답 규칙(`A`, `A OK`, `A 진행해`)으로 응답하세요. (예: `{example}`) 요청 텍스트가 필요한 라벨은 다음 형식으로 입력하세요: {requestExamples}',
  'context.suggestionHeader': '추천 다음 선택지',
  'context.suggestionCommandHint': '라벨 참고 명령: {command}',
  'context.suggestionFinalPrompt':
    '현재 추천 라벨: {labels}. 응답은 라벨 토큰 포함 형식으로 해주세요. (예: {example}, `A 진행해`)',
  'context.autoRunUnavailable':
    '현재 컨텍스트에서는 자동 실행을 사용할 수 없습니다.',
  'context.autoRunSummary':
    'config 기준으로 승인 필요 카테고리 전까지 연속 실행하세요: {categories}',
  'context.autoRunCommandHint': '자동 실행 명령(config 게이트): {command}',
  'context.subAgentOrchestrationHint':
    '메인 에이전트가 전체 흐름과 승인을 관리합니다. 현재 단계의 owner가 `subagent`면 보조 에이전트에 맡기고, `main`이면 메인에서 진행하세요.',
  'context.commandDetail.branchCreateWithWorktree':
    '({scope}) worktree {worktree}를 사용해 브랜치 {branch}를 생성하거나 재사용하세요',
  'context.commandDetail.branchCreateWithBranch':
    '({scope}) 브랜치 {branch}용 worktree를 생성하거나 재사용하세요',
  'context.commandDetail.branchCreateGeneric':
    '({scope}) feature 브랜치용 worktree를 생성하거나 재사용하세요',
  'context.commandDetail.codeReviewMergeAfterOk':
    '({scope}) 명시적 승인 후 PR을 머지하세요',
  'context.commandDetail.codeReviewPushFix':
    '({scope}) 리뷰 수정 커밋을 push하세요',
  'context.commandDetail.prePrReviewRun':
    '({scope}) 보조 에이전트(sub-agent)로 PR 전 리뷰를 실행해 `review-trace.json`을 준비하세요',
  'context.commandDetail.prePrReviewRecord':
    '({scope}) Pre-PR 리뷰 evidence를 decisions.md와 tasks.md에 기록하세요',
  'context.commandDetail.codeReviewRun':
    '({scope}) 리뷰 코멘트를 확인하고, 보조 에이전트(sub-agent)로 수정 작업/evidence 정리를 진행하세요',
  'context.actionSummary.runDocsCommand': '문서 작업 명령을 실행하세요',
  'context.actionSummary.runProjectCommand': '프로젝트 작업 명령을 실행하세요',
  'context.actionDetail.featureFolder':
    'Feature 폴더와 기본 문서 골격을 준비하세요',
  'context.actionDetail.specWrite': 'spec.md를 작성/보완하고 상태를 맞추세요',
  'context.actionDetail.specApprove': 'spec.md를 승인합니다',
  'context.actionDetail.planWrite': 'plan.md를 작성/보완하고 상태를 맞추세요',
  'context.actionDetail.planApprove': 'plan.md를 승인합니다',
  'context.actionDetail.tasksWrite':
    'tasks.md를 작성/보완하고 문서 상태를 정렬하세요',
  'context.actionDetail.tasksWriteCreate':
    'tasks.md를 생성하고 문서 상태를 Review로 설정하세요',
  'context.actionDetail.tasksWriteNeedAtLeastOne':
    'tasks.md에 최소 1개 이상의 태스크를 추가하세요',
  'context.actionDetail.tasksWriteImprove':
    'tasks.md를 보완하고 문서 상태를 정렬하세요',
  'context.actionDetail.tasksApprove': 'tasks.md를 승인합니다',
  'context.actionDetail.issueCreate':
    '이슈를 생성하고 tasks.md의 이슈 정보를 맞추세요',
  'context.actionDetail.issueCreateAndWrite':
    '이슈 초안을 보완하고 라벨 승인(`A` 또는 `A OK`) 후 이슈를 생성해 번호를 동기화하세요',
  'context.actionDetail.issueCreatePrepareFromDoc':
    'issue.md 초안을 보완하고 상태를 Ready로 설정하세요',
  'context.actionDetail.issueCreateFromDoc':
    'Ready 상태 issue.md로 이슈를 생성하고 번호를 동기화하세요',
  'context.actionDetail.taskExecute': '현재 태스크를 진행하세요',
  'context.actionDetail.taskExecuteRun':
    '보조 에이전트(sub-agent) 작업 handoff를 준비하고 태스크를 시작하세요: {task}. (TODO면 DOING으로 변경)',
  'context.actionDetail.taskExecuteContinue':
    '보조 에이전트(sub-agent) 작업 handoff를 준비해 진행 중인 태스크를 마무리하세요: {task}. (완료 후 결과/검증을 공유하고 DONE으로 변경)',
  'context.actionDetail.taskExecuteComplete':
    '현재 태스크를 완료 처리하세요: {task}. (DOING을 DONE으로 변경)',
  'context.actionDetail.reviewFixCommit':
    '해결한 리뷰 항목 요약으로 리뷰 수정 커밋을 만드세요',
  'context.actionDetail.prePrReviewRun':
    '보조 에이전트(sub-agent)로 PR 전 리뷰를 실행해 `review-trace.json`을 준비하세요',
  'context.actionDetail.prePrReviewRecord':
    'PR 전 리뷰 evidence를 decisions.md와 tasks.md에 기록하세요',
  'context.actionDetail.codeReviewRun':
    '리뷰 코멘트를 확인하고, 보조 에이전트(sub-agent)로 수정 작업/evidence 정리를 진행하세요',
  'context.actionDetail.prCreate':
    'PR을 생성하고 tasks 기.md의 PR 정보를 맞추세요',
  'context.actionDetail.prCreateRequiredSequence':
    'PR 2단계(초안/승인 후 생성/동기화)를 순서대로 완료하세요',
  'context.actionDetail.prCreatePrepareFromDoc':
    'pr.md 초안을 보완하고 상태를 Ready로 설정하세요',
  'context.actionDetail.prCreateExecuteFromDoc':
    'Ready 상태 pr.md로 PR을 생성하고 링크/상태를 동기화하세요',
  'context.actionDetail.prStatusUpdate':
    'tasks.md의 PR 상태를 최신으로 업데이트하세요',
  'context.actionDetail.prStatusUpdateSetReview':
    'tasks.md의 PR 상태를 Review로 설정하세요',
  'context.actionDetail.prStatusUpdateSyncApproved':
    '원격 머지 상태를 반영해 PR 상태를 Approved로 동기화하세요',
  'context.actionDetail.codeReview':
    '코드 리뷰 지적사항을 반영하고 PR 리뷰 정보를 업데이트하세요',
  'context.actionDetail.codeReviewNeedEvidenceField':
    'tasks.md에 PR 리뷰 Evidence 필드를 추가하세요',
  'context.actionDetail.codeReviewNeedEvidence':
    '`summary: ...` 형식 또는 decisions.md의 PR 리뷰 로그 경로로 PR 리뷰 Evidence를 기록하세요',
  'context.actionDetail.codeReviewNeedDecisionField':
    'tasks.md에 PR 리뷰 Decision 필드를 추가하세요',
  'context.actionDetail.codeReviewNeedDecision':
    'PR 리뷰 Decision을 기록하세요',
  'context.actionDetail.codeReviewResolve':
    '리뷰 코멘트를 반영하고 PR 리뷰 문서를 최신화하세요',
  'context.actionDetail.codeReviewNeedProjectRoot':
    '리뷰 작업을 계속하려면 projectRoot를 설정하세요',
  'context.actionDetail.codeReviewRemoteBlocked':
    '원격 PR 차단 사유를 해소한 뒤 머지를 진행하세요',
  'context.actionDetail.codeReviewMergeAfterOk':
    '사용자 승인(OK) 후 PR을 머지하세요',
  'context.actionDetail.codeReviewRequestReview':
    '리뷰 요청을 진행하고 PR 상태를 Review로 유지하세요',
  'context.actionDetail.featureScopeSplit':
    '이 Feature를 더 작은 이슈 단위로 분리할지 검토하세요',
  'context.actionDetail.featureScopeSplitKeep':
    '분할 가이드를 확인한 뒤 현재 이슈 범위를 유지하고 진행하세요',
  'context.actionDetail.featureScopeSplitTwo':
    '결합도/파일겹침/테스트/배포 기준으로 2개 이슈로 분리하세요',
  'context.actionDetail.featureScopeSplitFour':
    '기준 기반으로 4개 이슈로 분리하고 의존 순서대로 PR을 머지하세요',
  'context.actionDetail.worktreeCleanup':
    '완료된 feature worktree를 정리하세요',
  'context.actionDetail.prMetadataMigrate':
    'tasks.md의 PR 항목 형식을 최신 템플릿으로 업데이트하세요',
  'context.actionDetail.prMetadataMigratePrFields':
    'tasks.md에 PR/PR 상태 필드를 추가하세요',
  'context.actionDetail.prMetadataMigratePrePrReviewField':
    'tasks.md에 PR 전 리뷰 필드를 추가하세요',
  'context.actionDetail.userRequestReplan':
    '새 사용자 요구를 먼저 반영한 뒤 context를 다시 실행하세요',
  'context.actionDetail.featureDone':
    '이 Feature의 완료 조건이 모두 충족되었습니다',
  'context.actionDetail.fallback':
    '현재 상태를 확인한 뒤 context를 다시 실행하세요',
  'context.suggestion.createFeature': '새 Feature를 생성합니다',
  'context.suggestion.runOnboard': '초기 설정 점검(onboard)을 실행합니다',
  'context.suggestion.showDone': '완료된 Feature 목록을 확인합니다',
  'context.suggestion.showAll': '전체 Feature 목록을 확인합니다',
  'context.suggestion.selectFeature':
    '진행할 Feature를 선택해 상세 컨텍스트를 엽니다',
  'context.suggestion.showOpen': '진행 중 Feature 목록을 확인합니다',
  'context.finalLabelCommandHint': '라벨을 받으면 승인 선택 실행: {command}',
  'context.finalTicketCommandHint':
    '명령 실행은 승인 결과의 티켓으로 실행: {command}',
  'context.readBuiltinDocFirst':
    '이번 세션에 아직 읽지 않았거나 변경 가능성이 있을 때만 필요한 내장 문서를 확인하세요: {command}',
  'context.tipDocsCommitRules':
    '커밋 메시지 규칙은 git-workflow 가이드를 기준으로 확인하세요.',
  'context.list.docsCommitNeeded': '문서 커밋 필요',
  'context.list.projectCommitNeeded': '프로젝트 코드 커밋 필요',
  'context.list.issueNumberNeeded': '이슈 번호 기록 필요',
  'context.list.addPrMetadata': 'PR 메타데이터(PR/PR 상태) 추가',
  'context.list.recordPrLink': 'PR 링크 기록',
  'context.list.addPrePrReviewField': 'Pre-PR Review 필드 추가',
  'context.list.completePrePrReview': 'Pre-PR 리뷰 완료 처리',
  'context.list.addPrePrEvidence': 'Pre-PR Evidence 근거 추가',
  'context.list.addPrePrDecision': 'Pre-PR Decision 기록',
  'context.list.resolvePrePrDecision': 'Pre-PR Decision을 approve로 정리',
  'context.list.addPrReviewEvidence': 'PR 리뷰 Evidence 요약 추가',
  'context.list.addPrReviewDecision': 'PR 리뷰 Decision 기록',
  'context.list.setPrStatus': 'PR 상태 설정',
  'context.list.prStatusToApproved':
    'PR 머지 필요 (현재 PR 상태: {status} → Approved)',
  'context.list.approveSpec': 'spec 승인 필요',
  'context.list.approvePlan': 'plan 승인 필요',

  'context.git.standaloneProjectRootMissing':
    'standalone 모드입니다. projectRoot가 설정되지 않아 프로젝트 브랜치 확인이 불가능합니다. (npx lee-spec-kit config --project-root ...)',
  'context.git.multiProjectRootShapeInvalid':
    'multi standalone 모드인데 projectRoot 형태가 올바르지 않습니다. (예: { "app": "...", "api": "...", "worker": "..." })',
  'context.git.multiProjectRootRepoMissing':
    'projectRoot.{repo}가 비어있습니다. (npx lee-spec-kit config --project-root ... --component {repo})',
  'context.git.singleProjectRootShapeInvalid':
    'single standalone 모드인데 projectRoot 형태가 올바르지 않습니다. (예: "/path/to/project")',
} as const;

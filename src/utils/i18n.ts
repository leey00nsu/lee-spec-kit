export type Lang = 'ko' | 'en';

export const DEFAULT_LANG: Lang = 'en';

export type I18nCategory = 'cli' | 'steps' | 'messages' | 'warnings';

export type I18nData = Record<I18nCategory, Record<string, string>>;

export function normalizeLang(lang: unknown): Lang {
  if (lang === 'ko' || lang === 'en') return lang;
  return DEFAULT_LANG;
}

export function formatTemplate(
  template: string,
  vars: Record<string, string | number | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

const I18N: Record<Lang, I18nData> = {
  ko: {
    cli: {
      'common.errorLabel': '오류:',
      'common.canceled': '작업이 취소되었습니다.',
      'common.configNotFound': '설정 파일을 찾을 수 없습니다. 먼저 init을 실행해주세요.',
      'common.docsNotFound': 'docs 폴더를 찾을 수 없습니다. 먼저 init을 실행하세요.',

      'status.noFeatures': 'Feature를 찾을 수 없습니다.',
      'status.duplicateIds': '중복 Feature ID 발견:',
      'status.missingIds': 'Feature ID가 없는 항목:',
      'status.wrote': '✅ {path} 생성 완료',

      'feature.selectRepo': '레포지토리를 선택하세요:',
      'feature.folderExists': '이미 존재하는 폴더입니다: {path}',
      'feature.baseNotFound': 'CLI 내장 feature 템플릿을 찾을 수 없습니다.',
      'feature.created': '✅ Feature 폴더 생성 완료: {path}',
      'feature.nextStepsTitle': '다음 단계:',
      'feature.nextSteps1': '  1. {path}/spec.md 작성',
      'feature.nextSteps2': '  2. 사용자 리뷰 요청',
      'feature.nextSteps3': '  3. 승인 후 plan.md 작성',

      'config.currentTitle': '📋 현재 설정:',
      'config.pathLabel': '경로',
      'config.projectRootStandaloneOnly':
        '⚠️  projectRoot는 standalone 모드에서만 설정 가능합니다.',
      'config.selectRepoToUpdate': '수정할 레포지토리를 선택하세요:',
      'config.fullstackRepoRequired':
        'Multi 프로젝트는 --component로 대상 컴포넌트를 지정해야 합니다.',
      'config.projectRootSet': '✅ {repo} projectRoot 설정 완료: {path}',
      'config.projectRootSetSingle': '✅ projectRoot 설정 완료: {path}',

      'update.start': '📦 템플릿 업데이트를 시작합니다...',
      'update.langLabel': '언어',
      'update.typeLabel': '타입',
      'update.updatingAgents': '📁 agents/ 폴더 업데이트 중...',
      'update.updatingSkills': '📁 agents/skills 폴더 업데이트 중...',
      'update.agentsUpdated': 'agents/ 업데이트 완료',
      'update.skillsUpdated': 'agents/skills 업데이트 완료',
      'update.updatingFeatureBase': '📁 features/feature-base/ 폴더 업데이트 중...',
      'update.engineManagedSkillsBuiltin':
        'agents/skills는 CLI 내장 규칙으로 관리되어 docs로 동기화하지 않습니다.',
      'update.engineManagedFeatureBaseBuiltin':
        'features/feature-base는 CLI 내장 템플릿으로 관리되어 docs로 동기화하지 않습니다.',
      'update.engineManagedPruned':
        'docs에서 CLI 관리 문서 {count}개를 정리했습니다.',
      'update.filesUpdated': '{count}개 파일 업데이트 완료',
      'update.updatedTotal': '총 {count}개 파일 업데이트 완료!',
      'update.changeDetected': '변경 감지 (--force로 덮어쓰기)',
      'update.fileUpdated': '{file} 업데이트',
      'update.gitStatusUnavailable':
        'git 상태를 확인할 수 없습니다. (git repo가 아니거나 git 실행 불가) --force로 강제 덮어쓰기를 사용하세요.',
      'update.docsWorktreeDirty':
        'docs 작업트리에 변경사항이 있어 update를 진행할 수 없습니다. 변경사항을 커밋/스태시 후 다시 실행하거나 --force로 덮어쓰세요.',

      'doctor.title': '🔎 문서 진단',
      'doctor.envWarnings': '⚠️  환경 경고:',
      'doctor.noIssues': '✅ 문제를 찾지 못했습니다.',
      'doctor.errorsTitle': '오류',
      'doctor.warningsTitle': '경고',
      'doctor.tipJson': 'Tip: 에이전트용 JSON 출력: npx lee-spec-kit doctor --json{strictFlag}',
      'doctor.issue.missingRequiredDir': '필수 폴더가 없습니다: {dir}',
      'doctor.issue.missingConfig':
        '설정 파일(.lee-spec-kit.json)이 없습니다. 일부 기능이 폴더 구조 추정으로 동작할 수 있습니다.',
      'doctor.issue.noFeatures':
        'Feature 폴더를 찾지 못했습니다. (feature-base만 존재하거나 아직 feature를 만들지 않았을 수 있습니다.)',
      'doctor.issue.placeholdersLeft': '플레이스홀더가 남아있습니다: {placeholders}',
      'doctor.issue.missingSpec': 'spec.md가 없습니다.',
      'doctor.issue.specStatusUnset':
        'spec.md의 Status(상태)가 설정되지 않았습니다. (템플릿 그대로일 수 있음)',
      'doctor.issue.planStatusUnset':
        'plan.md의 Status(상태)가 설정되지 않았습니다. (템플릿 그대로일 수 있음)',
      'doctor.issue.tasksEmpty': 'tasks.md에 태스크가 없습니다.',
      'doctor.issue.tasksDocStatusUnset':
        'tasks.md의 문서 상태(Doc Status)가 설정되지 않았습니다. (Review/Approved 중 하나로 설정하세요.)',
      'doctor.issue.tasksDocStatusMissing':
        'tasks.md에 문서 상태(Doc Status) 필드가 없습니다. `- **문서 상태**: Review | Approved`를 추가하세요.',
      'doctor.issue.duplicateFeatureId': '중복 Feature ID 감지: {id} ({count}개)',
      'doctor.issue.missingFeatureId':
        'Feature 폴더명이 F001-... 형식이 아닙니다. (ID를 추출할 수 없음)',

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
        'ℹ️  사용자 확인 정책은 세션 시작(또는 context 압축/리셋 직후)에 1회 확인하고, 이후에는 정책/설정 변경 또는 사용자 새로고침 요청 시에만 재확인하세요. (git push/merge/merge commit 포함) [확인 필요]가 있으면 사용자에게 `<라벨>` 또는 `<라벨> OK` (예: `A`, `A OK`) 응답을 받은 뒤 진행 (config: approval로 조정 가능)',
      'context.actionOptionHint':
        '승인 응답 형식: 라벨 토큰 포함 (예: `A`, `A OK`, `A 진행해`)',
      'context.actionExplainHint':
        '승인 요청 전, 각 라벨이 무엇을 실행/변경하는지 한 줄 요약과 함께 설명하세요.',
      'context.finalLabelPrompt':
        '현재 선택 가능한 라벨: {labels}. 응답은 `<라벨>` 또는 `<라벨> OK` 형식으로 해주세요. (예: {example})',
      'context.finalLabelCommandHint':
        '라벨을 받으면 승인 선택 실행: {command}',
      'context.finalTicketCommandHint':
        '명령 실행은 승인 결과의 티켓으로 실행: {command}',
      'context.readBuiltinDocFirst':
        '이번 세션에 아직 읽지 않았거나 변경 가능성이 있을 때만 필요한 내장 문서를 확인하세요.',
      'context.tipDocsCommitRules':
        '커밋 메시지 규칙은 git-workflow 가이드를 기준으로 확인하세요.',
      'context.list.docsCommitNeeded': '문서 커밋 필요',
      'context.list.projectCommitNeeded': '프로젝트 코드 커밋 필요',
      'context.list.issueNumberNeeded': '이슈 번호 기록 필요',
      'context.list.addPrMetadata': 'PR 메타데이터(PR/PR 상태) 추가',
      'context.list.recordPrLink': 'PR 링크 기록',
      'context.list.addPrePrReviewField': 'Pre-PR Review 필드 추가',
      'context.list.completePrePrReview': 'Pre-PR 리뷰 완료 처리',
      'context.list.setPrStatus': 'PR 상태 설정',
      'context.list.prStatusToApproved': 'PR 머지 필요 (현재 PR 상태: {status} → Approved)',
      'context.list.approveSpec': 'spec 승인 필요',
      'context.list.approvePlan': 'plan 승인 필요',

      'init.selectLangPrompt': '문서 언어를 선택하세요:',
      'init.currentDirectoryLabel': '📍 현재 위치',
      'init.gitDetected': '✅ Git 레포지토리 감지됨',
      'init.insideProjectRoot': '현재 프로젝트 루트 내에서 실행하고 계십니다.',
      'init.modeEmbeddedDesc': '• embedded: 여기에 ./docs 폴더를 생성합니다. 프로젝트와 함께 관리됩니다.',
      'init.modeStandaloneDesc': '• standalone: 별도 폴더에서 독립 docs 레포로 관리하려면,',
      'init.modeStandaloneMove': '  해당 폴더로 이동 후 다시 실행해주세요.',
      'init.gitNotDetected': '⚠️  Git 레포지토리가 감지되지 않았습니다.',
      'init.gitNotDetectedDetail': '새로운 Git 레포지토리가 생성됩니다.',
      'init.prompt.projectName': '프로젝트 이름을 입력하세요:',
      'init.prompt.projectType': '프로젝트 타입을 선택하세요:',
      'init.choice.projectType.single.title': 'Single - 단일 레포 프로젝트',
      'init.choice.projectType.single.desc': 'features/ 폴더 하나로 관리',
      'init.choice.projectType.fullstack.title': 'Multi - 멀티 컴포넌트 프로젝트',
      'init.choice.projectType.fullstack.desc': 'Multi 컴포넌트 프로젝트 (기본: features/{component}/)',
      'init.prompt.docsMode': 'Docs 관리 방식을 선택하세요:',
      'init.choice.docsRepo.embedded.title': 'embedded - 프로젝트 내 포함 (./docs)',
      'init.choice.docsRepo.embedded.desc': '프로젝트와 함께 push됩니다',
      'init.choice.docsRepo.standalone.title': 'standalone - 별도 독립 레포',
      'init.choice.docsRepo.standalone.desc': 'push 여부를 별도로 설정합니다',
      'init.prompt.componentRepoPath': '{component} 컴포넌트 레포지토리 경로를 입력하세요:',
      'init.prompt.projectRepoPath': '프로젝트 레포지토리 경로를 입력하세요:',
      'init.validation.enterPath': '경로를 입력해주세요',
      'init.prompt.pushMode': 'Docs push 방식을 선택하세요:',
      'init.choice.push.local': 'local - 로컬에서만 관리 (push 안 함)',
      'init.choice.push.remote': 'remote - 원격에도 push',
      'init.prompt.remoteUrl': '원격 레포 URL을 입력하세요:',
      'init.validation.enterUrl': 'URL을 입력해주세요',
      'init.prompt.overwrite': '{dir} 폴더가 이미 존재합니다. 덮어쓰시겠습니까?',
      'init.log.creatingDocs': '📁 docs 구조 생성 중...',
      'init.log.projectLabel': '프로젝트',
      'init.log.typeLabel': '타입',
      'init.log.langLabel': '언어',
      'init.log.pathLabel': '경로',
      'init.log.docsCreated': '✅ docs 구조 생성 완료!',
      'init.log.nextStepsTitle': '다음 단계:',
      'init.log.nextSteps1': '  1. {docsDir}/prd/README.md 작성',
      'init.log.nextSteps2': '  2. npx lee-spec-kit feature <name> 으로 기능 추가',
      'init.log.gitRepoDetectedCommit': '📦 Git 레포지토리 감지, docs 커밋 중...',
      'init.log.gitInit': '📦 Git 초기화 중...',
      'init.warn.stagedChangesSkip':
        '⚠️  현재 Git index에 이미 stage된 변경이 있습니다. (--dir "." 인 경우 커밋 범위를 안전하게 제한할 수 없어 자동 커밋을 건너뜁니다)',
      'init.warn.docsPathIgnoredSkipCommit':
        '⚠️  docs 경로가 .gitignore 규칙에 매칭되어 자동 커밋을 건너뜁니다: {path}',
      'init.warn.docsPathIgnoredHint':
        '    계속 추적하려면 `git add -f {path}` 후 커밋하거나, `--dir`를 ignore되지 않은 경로로 변경하세요.',
      'init.warn.commitManually': '    수동으로 변경 내용을 확인한 뒤 커밋해주세요.',
      'init.log.gitRemoteSet': '✅ Git remote 설정 완료: {remote}',
      'init.warn.gitRemoteExists': '⚠️  Git remote가 이미 존재합니다.',
      'init.log.gitInitialCommitDone': '✅ Git 초기 커밋 완료!',
      'init.warn.skipGitInit': '⚠️  Git 초기화를 건너뜁니다 (수동으로 커밋해주세요)',
      'init.error.templateNotFound': '템플릿을 찾을 수 없습니다: {path}',

      'github.cmdGithubDescription':
        'GitHub 워크플로우 도우미 (issue/pr 본문 템플릿 생성, 검증, merge 재시도)',
      'github.cmdIssueDescription': 'feature 문서 기반 GitHub issue 본문 생성/생성',
      'github.cmdPrDescription': 'GitHub PR 본문 생성/생성 + tasks 동기화 + merge 재시도',
      'github.optJson': '에이전트용 JSON 형식으로 출력',
      'github.optComponent': '멀티 프로젝트 컴포넌트 이름',
      'github.optIssueTitle': 'Issue 제목',
      'github.optLabels': '쉼표 구분 라벨 목록 (기본: enhancement)',
      'github.optIssueBodyFile':
        'Issue 본문 파일 출력 경로 (기본: OS 임시 디렉터리의 프로젝트/컴포넌트 고정 파일)',
      'github.optIssueAssignee': 'Issue 담당자 (기본: @me)',
      'github.optIssueCreate': 'gh CLI로 issue 생성',
      'github.optIssueConfirm': '원격 작업(--create)용 명시적 승인 토큰. 사용값: OK',
      'github.optPrTitle': 'PR 제목',
      'github.optPrBodyFile':
        'PR 본문 파일 출력 경로 (기본: OS 임시 디렉터리의 프로젝트/컴포넌트 고정 파일)',
      'github.optPrAssignee': 'PR 담당자 (기본: @me)',
      'github.optPrBase': 'PR base 브랜치 (기본: main)',
      'github.optPrCreate': 'gh CLI로 PR 생성',
      'github.optPrRef': '--merge 시 사용할 기존 PR URL/번호',
      'github.optPrMerge': '재시도/헤드 갱신과 함께 PR merge 수행',
      'github.optPrConfirm': '원격 작업(--create/--merge)용 명시적 승인 토큰. 사용값: OK',
      'github.optPrRetry': 'merge 재시도 횟수 (기본: 3)',
      'github.optPrScreenshots': 'PR 스크린샷 섹션 모드 (auto|on|off, 기본: auto)',
      'github.optPrMermaid': 'PR Mermaid 섹션 모드 (auto|on|off, 기본: auto)',
      'github.optPrNoSyncTasks': 'tasks.md PR URL/PR 상태 동기화를 건너뜀',
      'github.optPrCommitSync': 'tasks.md 동기화 변경을 자동 commit/push',
      'github.labelsRequired': '최소 1개 라벨이 필요합니다. `--labels enhancement`를 사용하세요.',
      'github.approvalRequired':
        '{operation}은(는) 사용자 명시 승인 후에만 실행할 수 있습니다. 계획 공유 후 `--confirm OK`로 다시 실행하세요.',
      'github.ghCommandFailed': 'GitHub CLI 명령 실행에 실패했습니다',
      'github.ghEmptyJson': 'GitHub CLI JSON 출력이 비어 있습니다.',
      'github.ghInvalidJson': 'GitHub CLI JSON 파싱에 실패했습니다: {snippet}',
      'github.sectionsMissing': '{kind} 본문에 필수 섹션이 없습니다: {sections}',
      'github.todoPlaceholdersRemain':
        '{kind} 본문에 TODO 항목이 남아 있습니다. 목표/완료 기준 등을 채운 뒤 다시 실행하세요.',
      'github.artifactModeInvalid':
        '`--{kind}` 값이 올바르지 않습니다: {value}. 허용값: auto,on,off',
      'github.prScreenshotsSectionMissing':
        'PR 본문에 필수 섹션이 없습니다: {section}',
      'github.prScreenshotImageMissing':
        'PR 본문의 `{section}` 섹션에 이미지 마크다운(`![](...)`)을 추가하세요.',
      'github.prMermaidSectionMissing':
        'PR 본문에 필수 섹션이 없습니다: {section}',
      'github.prMermaidBlockMissing':
        'PR 본문의 `{section}` 섹션에 ```mermaid 코드 블록을 추가하세요.',
      'github.docsMissing': '관련 문서 경로가 존재하지 않습니다: {paths}',
      'github.noFeatures': 'Feature를 찾을 수 없습니다.',
      'github.multipleFeaturesMatched':
        '여러 Feature가 매칭되었습니다. feature 이름(slug | F001 | F001-slug)을 명시하세요.',
      'github.featureSelectFailed':
        'Feature 자동 선택에 실패했습니다. feature 이름을 명시해서 다시 실행하세요.',
      'github.tasksNotFound': 'tasks.md를 찾을 수 없습니다: {path}',
      'github.detectBranchFailed': '현재 git 브랜치 확인에 실패했습니다',
      'github.inspectWorktreeFailed': 'git 워크트리 상태 확인에 실패했습니다',
      'github.worktreeNotClean':
        'git 워크트리가 깨끗하지 않습니다. merge 재시도 동기화 전에 커밋/스태시하세요.',
      'github.inspectFileStatusFailed': '파일 git 상태 확인에 실패했습니다',
      'github.stageFileFailed': '동기화 파일 stage에 실패했습니다',
      'github.commitSyncFailed': '동기화 메타데이터 commit에 실패했습니다',
      'github.pushSyncFailed': '동기화 메타데이터 push에 실패했습니다',
      'github.fetchPrBranchesFailed': 'PR 브랜치 fetch에 실패했습니다',
      'github.checkoutHeadFailed': 'PR 헤드 브랜치 checkout에 실패했습니다',
      'github.createLocalHeadFailed': '로컬 PR 헤드 브랜치 생성에 실패했습니다',
      'github.rebaseHeadFailed': 'PR 헤드 브랜치 rebase에 실패했습니다',
      'github.pushRebasedHeadFailed': 'rebase된 PR 헤드 브랜치 push에 실패했습니다',
      'github.restoreBranchFailed': 'PR 헤드 갱신 후 이전 브랜치 복원에 실패했습니다',
      'github.mergeRetryFailed': '재시도 후에도 PR merge에 실패했습니다.{lastError}',
      'github.retryInvalid': '`--retry`는 1 이상의 정수여야 합니다.',
      'github.operationIssueCreate': 'GitHub issue 생성',
      'github.operationPrCreate': 'GitHub PR 생성',
      'github.operationPrMerge': 'GitHub PR merge',
      'github.createIssueFailed': 'GitHub issue 생성에 실패했습니다',
      'github.createPrFailed': 'GitHub PR 생성에 실패했습니다',
      'github.mergeRequiresPr':
        '`--merge`를 사용하려면 `--create` 또는 `--pr <url|number>`가 필요합니다.',
      'github.checkoutBaseAfterMergeFailed': 'merge 후 {base} 브랜치 checkout에 실패했습니다',
      'github.pullBaseAfterMergeFailed': 'merge 후 {base} 브랜치 최신화에 실패했습니다',
      'github.issueDefaultTitle': '{slug} ({summary})',
      'github.prDefaultTitleWithIssue': 'feat(#{issue}): {slug} (구현 업데이트)',
      'github.prDefaultTitleNoIssue': 'feat: {slug} (구현 업데이트)',
      'github.issueHeader': '🧾 GitHub Issue 도우미',
      'github.prHeader': '🔀 GitHub PR 도우미',
      'github.labelFeature': 'Feature',
      'github.labelBodyFile': '본문 파일',
      'github.labelLabels': '라벨',
      'github.labelPr': 'PR',
      'github.issueCreated': '✅ 생성 완료: {url}',
      'github.issueTemplateGenerated':
        '본문 템플릿을 생성했습니다. 원격으로 이슈를 생성하려면 `--create`를 사용하세요.',
      'github.prTasksSynced': '✅ tasks.md PR 메타데이터를 동기화했습니다.',
      'github.prMerged': '✅ PR merge 완료 (시도 횟수: {attempts})',
      'github.prTemplateGenerated':
        '본문 템플릿을 생성했습니다. 원격으로 PR을 생성하려면 `--create`를 사용하세요.',
      'github.syncCommitWithIssue': 'docs(#{issue}): {folder} PR 메타데이터 동기화',
      'github.syncCommitNoIssue': 'docs: {folder} PR 메타데이터 동기화',
      'github.kindIssue': 'Issue',
      'github.kindPr': 'PR',
      'docs.cmdDocsDescription': 'CLI 내장 에이전트 문서를 조회합니다',
      'docs.cmdListDescription': '조회 가능한 내장 문서 목록을 출력합니다',
      'docs.cmdGetDescription': '내장 문서 1개를 출력합니다',
      'docs.optJson': '에이전트용 JSON 형식으로 출력',
      'docs.invalidDocId': '알 수 없는 문서 ID입니다: {docId}. 사용 가능: {available}',
      'docs.listHeader': '📚 내장 문서',
      'docs.nextDocs': '다음 문서',
      'docs.sourceLabel': 'source',
      'docs.hashLabel': 'hash',
      'detect.cmdDescription':
        '현재 워크스페이스가 lee-spec-kit 프로젝트인지 감지합니다',
      'detect.optDir': '감지 기준 경로 (기본: 현재 경로)',
      'detect.optJson': '에이전트용 JSON 형식으로 출력',
      'detect.header': '🔎 Project Detection',
      'detect.labelTarget': 'Target',
      'detect.resultDetected': 'lee-spec-kit 프로젝트를 감지했습니다',
      'detect.resultNotDetected': 'lee-spec-kit 프로젝트를 찾지 못했습니다',
      'detect.notDetectedHint':
        '`npx lee-spec-kit init`으로 초기화하거나 `--dir`로 올바른 경로를 지정하세요.',
      'detect.labelDocsDir': 'Docs',
      'detect.labelConfigPath': 'Config',
      'detect.labelSource': 'Source',
      'detect.labelProjectType': 'Project Type',
      'detect.labelLang': 'Lang',
      'detect.labelProjectName': 'Project',
      'detect.sourceConfig': 'config (.lee-spec-kit.json)',
      'detect.sourceHeuristic': 'heuristic (agents/features folder)',

      'cliError.headerNextOptionsError': '👉 다음 옵션 (오류):',
      'cliError.promptBlocked.retryWithoutNonInteractive':
        '--non-interactive 없이 같은 명령을 다시 실행하세요.',
      'cliError.promptBlocked.passRequiredFlags':
        '필수 플래그를 모두 명시하거나(`--force` 포함) 다시 실행하세요.',
      'cliError.promptBlocked.checkRequiredOptions': '필수 옵션을 먼저 확인하세요.',
      'cliError.configOrDocs.initializeDocs': '현재 워크스페이스에서 docs를 초기화하세요.',
      'cliError.configOrDocs.verifyDocsLocation': 'docs 위치와 설정을 점검하세요.',
      'cliError.configOrDocs.runFromDocsDir': 'docs/가 있는 디렉터리에서 명령을 실행하세요.',
      'cliError.lock.retryLater': '잠시 기다린 뒤 같은 명령을 다시 실행하세요.',
      'cliError.lock.checkOtherProcess': '다른 lee-spec-kit 프로세스가 실행 중인지 확인하세요.',
      'cliError.lock.inspectLockFiles':
        '런타임 lock 파일(프로젝트 `.git/lee-spec-kit.runtime/locks` 또는 OS temp)을 확인하세요.',
      'cliError.invalidArg.reviewUsage': '명령 사용법과 유효한 플래그를 확인하세요.',
      'cliError.invalidArg.fixValues': '잘못된 값을 수정한 뒤 다시 실행하세요.',
      'cliError.invalidArg.validateBeforeAutomation':
        '자동화 환경이라면 CLI 호출 전에 인자를 검증하세요.',
      'cliError.precondition.satisfyPreconditions':
        '실행 전제조건을 만족하도록 환경/작업트리를 먼저 정리하세요.',
      'cliError.precondition.runDoctor': '워크스페이스 진단으로 현재 상태를 확인하세요.',
      'cliError.precondition.considerForce': '의도한 덮어쓰기라면 강제 옵션 사용을 검토하세요.',
      'cliError.duplicateId.resolveDuplicates': '중복된 Feature ID를 정리한 뒤 다시 실행하세요.',
      'cliError.duplicateId.ensureUniqueFormat':
        '각 Feature 폴더명이 고유한 `F###-slug` 형식인지 확인하세요.',
      'cliError.duplicateId.inspectJson': '중복 여부를 JSON 진단으로 확인하세요.',
      'cliError.missingId.renameFolders':
        'ID가 없는 Feature 폴더를 `F###-slug` 형식으로 변경하세요.',
      'cliError.missingId.alignDocs': 'spec/tasks 문서의 Feature ID도 함께 정리하세요.',
      'cliError.missingId.inspectJson': '누락 항목을 JSON 진단으로 확인하세요.',
      'cliError.invalidApproval.fetchLatestOptions': '먼저 최신 옵션을 다시 조회하세요.',
      'cliError.invalidApproval.replyWithValidLabel':
        '유효한 라벨(또는 `<라벨> OK`)만 응답하세요. 예: A',
      'cliError.invalidApproval.oneLabelOnly': '한 번에 라벨 1개만 선택하세요.',
      'cliError.approvalRequired.reRunWithApprove':
        'context 승인 흐름이면 --approve <라벨>과 함께 다시 실행하세요.',
      'cliError.approvalRequired.githubConfirmOk':
        'github 원격 생성/머지면 --confirm OK를 함께 전달하세요.',
      'cliError.approvalRequired.shareAndGetApproval':
        '실행 전에 제목/본문/라벨(또는 머지 계획)을 사용자에게 공유하고 명시적 승인을 받으세요.',
      'cliError.contextSelection.specifySelector': '단일 Feature selector를 명시하세요.',
      'cliError.contextSelection.narrowByComponent':
        'multi 모드에서는 --component로 범위를 좁히세요.',
      'cliError.contextSelection.inspectAllCandidates': '먼저 전체 후보를 확인하세요.',
      'cliError.noActionOptions.refreshContext':
        '현재 상태를 보기 위해 context를 새로 조회하세요.',
      'cliError.noActionOptions.completeChecklist':
        'Feature 문서를 열어 누락된 체크 항목을 완료하세요.',
      'cliError.noActionOptions.listAllFeatures':
        '실행 가능한 옵션이 있는 Feature를 찾기 위해 전체를 조회하세요.',
      'cliError.contextStale.refreshBeforeApprove': '승인 전에 최신 context를 다시 조회하세요.',
      'cliError.contextStale.reapproveWithFreshLabel':
        '최신 출력의 라벨로 다시 승인하세요.',
      'cliError.contextStale.executeAfterFreshApproval':
        '최신 라벨 재승인 후에만 실행하세요.',
      'cliError.execution.notCommand': '승인 라벨이 command인지 먼저 확인하세요.',
      'cliError.execution.failed': '실패한 명령의 출력과 선행 조건을 확인하세요.',
      'cliError.execution.rerunContextAndExecute':
        'context를 다시 조회하고 최신 라벨 1개를 실행하세요.',
      'cliError.execution.runManually': '환경 문제 분리를 위해 명령을 수동 실행해보세요.',
      'cliError.unknown.rerunAndCaptureLogs':
        '같은 입력으로 재실행하고 전체 오류 로그를 수집하세요.',
      'cliError.unknown.runDoctor': '워크스페이스 상태를 진단하세요.',
      'cliError.unknown.reportReasonCode': 'reasonCode와 로그를 유지보수자에게 전달하세요.',

      'context.git.standaloneProjectRootMissing':
        'standalone 모드입니다. projectRoot가 설정되지 않아 프로젝트 브랜치 확인이 불가능합니다. (npx lee-spec-kit config --project-root ...)',
      'context.git.multiProjectRootShapeInvalid':
        'multi standalone 모드인데 projectRoot 형태가 올바르지 않습니다. (예: { "app": "...", "api": "...", "worker": "..." })',
      'context.git.multiProjectRootRepoMissing':
        'projectRoot.{repo}가 비어있습니다. (npx lee-spec-kit config --project-root ... --component {repo})',
      'context.git.singleProjectRootShapeInvalid':
        'single standalone 모드인데 projectRoot 형태가 올바르지 않습니다. (예: "/path/to/project")',

      'validation.nameEmpty': '이름은 비어있을 수 없습니다.',
      'validation.nameTooLong': '이름은 100자를 초과할 수 없습니다.',
      'validation.nameTraversal': "이름에 '..' 또는 경로 구분자를 사용할 수 없습니다.",
      'validation.nameNullByte': '이름에 null 문자를 사용할 수 없습니다.',
      'validation.nameInvalidChars':
        '이름에는 영문, 숫자, 하이픈, 언더스코어, 한글만 사용할 수 있습니다.',
      'validation.nameReserved': '예약된 이름은 사용할 수 없습니다.',
      'validation.projectTypeInvalid':
        '프로젝트 타입은 {values} 중 하나여야 합니다.',
      'validation.languageInvalid': '언어는 {values} 중 하나여야 합니다.',
      'validation.workflowModeInvalid':
        '워크플로우 모드는 {values} 중 하나여야 합니다.',
      'validation.featureIdEmpty': 'Feature ID는 비어있을 수 없습니다.',
      'validation.featureIdFormat': "Feature ID는 'F' + 숫자 형식이어야 합니다 (예: F001).",
      'validation.pathEmpty': '경로는 비어있을 수 없습니다.',
      'validation.pathNullByte': '경로에 null 문자를 사용할 수 없습니다.',
      'validation.genericFailed': '검증 실패',
      'validation.context.featureName': '기능 이름',
      'validation.context.featureId': 'Feature ID',
      'validation.context.projectName': '프로젝트 이름',
      'validation.context.projectType': '프로젝트 타입',
      'validation.context.language': '언어',
      'validation.context.workflowMode': '워크플로우 모드',

      'versionCheck.noticeAvailable': '📦 lee-spec-kit v{latest} 사용 가능 (현재: v{current})',
      'versionCheck.updateCommand': '   업데이트: npm update -g lee-spec-kit',
    },
    steps: {
      featureFolder: 'Feature 폴더 생성',
      specWrite: 'spec.md 작성',
      specApprove: 'spec.md 승인',
      planWrite: 'plan.md 작성',
      planApprove: 'plan.md 승인',
      tasksWrite: 'tasks.md 작성/승인',
      docsInitialCommit: '초기 문서 커밋',
      docsCommitPlanning: '문서 커밋(동기화)',
      issueCreate: 'GitHub Issue 생성',
      branchCreate: '브랜치 생성',
      tasksExecute: '태스크 실행',
      docsCommitSync: '문서 커밋(동기화)',
      prePrReview: 'Pre-PR 리뷰',
      prCreate: 'PR 생성',
      codeReview: '코드 리뷰',
      featureDone: 'Feature 완료',
    },
    messages: {
      specCreate:
        'spec.md를 작성하고 상태를 Review로 변경하세요. (agents 가이드 기준)',
      specImprove: 'spec.md를 보완하고 상태를 Review로 변경하세요.',
      specApproval:
        'spec.md 내용을 사용자에게 공유하고 승인(`A` 또는 `A OK` 형식)을 받으세요.',
      planCreate:
        'plan.md를 작성하고 상태를 Review로 변경하세요. (agents 가이드 기준)',
      planImprove: 'plan.md를 보완하고 상태를 Review로 변경하세요.',
      planApproval:
        'plan.md 내용을 사용자에게 공유하고 승인(`A` 또는 `A OK` 형식)을 받으세요.',
      tasksCreate:
        'tasks.md를 작성하고 문서 상태를 Review로 변경하세요. (agents/execute-task 가이드 기준)',
      tasksNeedAtLeastOne: 'tasks.md에 최소 1개 이상의 태스크를 작성하세요.',
      tasksImprove: 'tasks.md를 보완하고 문서 상태를 Review로 변경하세요.',
      tasksApproval:
        'tasks.md 내용을 사용자에게 공유하고 진행 승인(`A` 또는 `A OK` 형식)을 받으세요. (승인 후 문서 상태를 Approved로 변경)',
      docsCommitPlanning:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(planning): {folderName} 기획 문서"',
      issueCreateAndWrite:
        '이슈 본문 템플릿을 생성해 목표/완료 기준을 검토·보완하고, 사용자 승인(OK) 후 이슈를 생성하세요. 이후 spec.md/tasks.md의 이슈 번호를 채우고 문서 커밋을 준비하세요.',
      docsCommitIssueUpdate:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(#{issueNumber}): {folderName} 문서 업데이트"',
      docsCommitUpdate:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs: {folderName} 문서 업데이트"',
      projectCommitIssueUpdate:
        'cd "{projectGitCwd}" && (git diff --cached --quiet && echo "스테이징된 파일이 없습니다. 이번 태스크에서 수정한 파일만 선택해 git add [files] 후 다시 실행하세요." && exit 1 || git commit -m "feat(#{issueNumber}): {commitTopic}")',
      projectCommitUpdate:
        'cd "{projectGitCwd}" && (git diff --cached --quiet && echo "스테이징된 파일이 없습니다. 이번 태스크에서 수정한 파일만 선택해 git add [files] 후 다시 실행하세요." && exit 1 || git commit -m "feat({folderName}): {commitTopic}")',
      standaloneNeedsProjectRoot:
        'standalone 모드에서는 projectRoot 설정이 필요합니다. (npx lee-spec-kit config --project-root ...)',
      createBranch:
        'cd "{projectGitCwd}" && git checkout -b feat/{issueNumber}-{slug}',
      tasksAllDoneButNoChecklist:
        '완료 조건 체크리스트를 작성하세요. tasks.md의 "완료 조건" 섹션에 검증 항목을 추가하고, 사용자와 확인 후 충족 항목을 [x]로 체크하세요. 최종 승인(OK)도 반영하세요.',
      tasksAllDoneButChecklist:
        '완료 조건 체크리스트의 남은 항목을 진행하세요. 현재 진행: ({checked}/{total}) 사용자와 확인 후 충족 항목을 [x]로 체크하고 최종 승인(OK)을 반영하세요.',
      finishDoingTask:
        '현재 DOING/REVIEW 태스크를 완료합니다: "{title}" ({done}/{total}) 결과/검증 공유 + 승인(`A` 또는 `A OK` 형식) 후 DONE 처리',
      startNextTodoTask:
        '다음 TODO 태스크를 시작합니다: "{title}" ({done}/{total}) 승인(`A` 또는 `A OK` 형식) 후 DOING 처리',
      checkTaskStatuses:
        '태스크 상태를 확인하세요. ({done}/{total})',
      taskCommitGateStrictBlock:
        '다음 TODO 태스크로 넘어가기 전에 `1 태스크 = 1 커밋` 규칙을 충족해야 합니다. 점검 결과: {reason}. 태스크 커밋 단위를 정리한 뒤 다시 진행하세요.',
      taskCommitGateWarnProceed:
        '⚠️ 태스크 커밋 단위 점검 경고: {reason}. 현재는 진행 가능하지만 `1 태스크 = 1 커밋`을 권장합니다.',
      taskCommitGateReasonNoTasksCommit:
        '최근 tasks.md 커밋을 찾을 수 없습니다',
      taskCommitGateReasonTasksFileUnavailable:
        '최근 커밋에서 tasks.md 이력을 판독할 수 없습니다',
      taskCommitGateReasonDoneCount:
        '최근 tasks.md 커밋의 DONE 전환 수가 {count}개입니다 (정상: 1개)',
      taskCommitGateReasonMismatchLastDone:
        '최근 tasks.md 커밋이 직전 완료 태스크와 일치하지 않습니다',
      prLegacyAsk:
        'tasks.md에 PR/PR 상태 필드가 없습니다. 템플릿을 최신 포맷으로 업데이트할까요? (확인 필요)',
      prePrReviewFieldMissing:
        'tasks.md에 `PR 전 리뷰` 필드가 없습니다. `- **PR 전 리뷰**: Pending | Done` 항목을 추가하고 다시 context를 실행하세요. (확인 필요)',
      prePrReviewRun:
        'PR 생성 전 사전 코드리뷰를 진행하세요. 우선순위 스킬: {skills} (설치된 더 적합한 스킬이 있다면 먼저 제안 후 사용). 스킬을 쓸 수 없으면 `{fallback}` 정책으로 진행하고 `PR 전 리뷰`를 Done으로 업데이트하세요. Findings 정책: {findingsPolicy}',
      prePrReviewFindingsBlock:
        '중요 이슈는 수정/합의 후에만 PR 생성',
      prePrReviewFindingsWarn:
        '리스크를 공유하면 PR 생성 진행 가능',
      prCreate:
        'PR 본문 템플릿을 생성해 변경 사항/테스트 섹션을 검토·보완하고, 사용자 승인(OK) 후 PR을 생성하세요. 이후 tasks.md에 PR 링크를 기록하세요.',
      prFillStatus:
        'tasks.md의 PR 상태를 Review로 설정하세요. (PR 생성/리뷰 단계에서는 Review를 유지합니다.)',
      prResolveReview:
        '리뷰 코멘트를 해결하는 동안 PR 상태는 Review로 유지하세요. 머지 준비가 되면 사용자 승인(OK) 후 `npx lee-spec-kit github pr {featureRef} --merge --confirm OK`를 실행하세요. (성공 시 PR 상태가 Approved로 동기화됩니다.)',
      prRequestReview:
        '리뷰어에게 리뷰를 요청하고 PR 상태를 Review로 설정/유지하세요.',
      featureDone:
        '워크플로우 요구사항과 모든 태스크/완료 조건이 충족되었습니다. 이 Feature는 완료 상태입니다.',
      fallbackRerunContext:
        '상태를 판별할 수 없습니다. 문서를 확인한 뒤 다시 context를 실행하세요.',
    },
    warnings: {
      projectBranchUnavailable:
        '프로젝트 브랜치를 확인할 수 없습니다. (standalone 모드에서는 projectRoot가 필요합니다.)',
      docsGitUnavailable:
        'docs 레포의 git 상태를 확인할 수 없습니다. (레포 위치 / git init 확인)',
      docsPathIgnored:
        '현재 Feature 문서 경로가 git ignore 대상입니다: {path} (docs 커밋 감지가 제한될 수 있습니다.)',
      docsUncommittedChanges:
        '문서 변경사항이 커밋되지 않았습니다. (추가 문서 커밋 필요) 커밋 메시지 규칙은 git-workflow 가이드를 기준으로 확인하세요.',
      projectUncommittedChanges:
        '프로젝트 코드 변경사항이 커밋되지 않았습니다. (추가 코드 커밋 필요)',
      legacyTasksDocStatusField:
        '구버전 tasks.md 포맷입니다. `문서 상태` 필드(Review/Approved)를 추가해 태스크 승인 단계를 활성화하세요.',
      legacyTasksPrFields:
        '구버전 tasks.md 포맷입니다. PR 단계 전에 `PR` 및 `PR 상태` 필드를 추가하세요.',
      legacyTasksPrePrReviewField:
        '구버전 tasks.md 포맷입니다. PR 단계 전에 `PR 전 리뷰` 필드를 추가하세요. (`- **PR 전 리뷰**: Pending | Done`)',
      workflowSpecNotApproved:
        '완료 상태이지만 spec.md 상태가 Approved가 아닙니다. (spec.md의 상태를 Approved로 업데이트하세요.)',
      workflowPlanNotApproved:
        '완료 상태이지만 plan.md 상태가 Approved가 아닙니다. (plan.md의 상태를 Approved로 업데이트하세요.)',
      workflowIssueMissing:
        '완료 상태이지만 이슈 번호가 비어있습니다. (spec.md/tasks.md의 이슈 번호를 채우세요.)',
      workflowProjectUncommittedChanges:
        '완료 조건 이전에 프로젝트 코드 변경사항을 커밋해야 합니다. (프로젝트 워크트리 미커밋 변경 존재)',
      workflowPrLinkMissing:
        '완료 상태이지만 PR 링크가 비어있습니다. (tasks.md의 PR 필드를 채우세요.)',
      workflowPrStatusMissing:
        '완료 상태이지만 PR 상태가 비어있습니다. (PR 생성/리뷰 단계에서는 PR 상태를 Review로 설정하세요.)',
      workflowPrStatusNotApproved:
        '완료 상태이지만 PR 상태가 Approved가 아닙니다. (PR 생성/리뷰 단계는 Review를 유지하고, merge 성공 시에만 Approved로 동기화하세요.)',
      workflowPrePrReviewMissing:
        '완료 상태이지만 `PR 전 리뷰` 필드가 없습니다. (tasks.md에 `- **PR 전 리뷰**: Pending | Done`을 추가하세요.)',
      workflowPrePrReviewNotDone:
        '완료 상태이지만 `PR 전 리뷰`가 Done이 아닙니다. (사전 코드리뷰 후 Done으로 업데이트하세요.)',
    },
  },
  en: {
    cli: {
      'common.errorLabel': 'Error:',
      'common.canceled': 'Operation canceled.',
      'common.configNotFound': 'Config file not found. Run `init` first.',
      'common.docsNotFound': 'docs folder not found. Run `init` first.',

      'status.noFeatures': 'No features found.',
      'status.duplicateIds': 'Duplicate Feature IDs found:',
      'status.missingIds': 'Entries missing Feature ID:',
      'status.wrote': '✅ Wrote {path}',

      'feature.selectRepo': 'Select a repository:',
      'feature.folderExists': 'Folder already exists: {path}',
      'feature.baseNotFound': 'Built-in feature template not found.',
      'feature.created': '✅ Feature folder created: {path}',
      'feature.nextStepsTitle': 'Next steps:',
      'feature.nextSteps1': '  1. Write {path}/spec.md',
      'feature.nextSteps2': '  2. Ask for review',
      'feature.nextSteps3': '  3. After approval, write plan.md',

      'config.currentTitle': '📋 Current config:',
      'config.pathLabel': 'Path',
      'config.projectRootStandaloneOnly':
        '⚠️  projectRoot can only be set in standalone mode.',
      'config.selectRepoToUpdate': 'Select a repository to update:',
      'config.fullstackRepoRequired':
        'For multi projects, specify a target component via `--component`.',
      'config.projectRootSet': '✅ {repo} projectRoot set: {path}',
      'config.projectRootSetSingle': '✅ projectRoot set: {path}',

      'update.start': '📦 Starting template update...',
      'update.langLabel': 'Lang',
      'update.typeLabel': 'Type',
      'update.updatingAgents': '📁 Updating agents/ folder...',
      'update.updatingSkills': '📁 Updating agents/skills folder...',
      'update.agentsUpdated': 'agents/ updated',
      'update.skillsUpdated': 'agents/skills updated',
      'update.updatingFeatureBase': '📁 Updating features/feature-base/ folder...',
      'update.engineManagedSkillsBuiltin':
        'agents/skills is CLI-managed and is not synced into docs.',
      'update.engineManagedFeatureBaseBuiltin':
        'features/feature-base is CLI-managed and is not synced into docs.',
      'update.engineManagedPruned':
        'Removed {count} CLI-managed docs entries from this docs tree.',
      'update.filesUpdated': '{count} files updated',
      'update.updatedTotal': 'Updated {count} files!',
      'update.changeDetected': 'changes detected (use --force to overwrite)',
      'update.fileUpdated': '{file} updated',
      'update.gitStatusUnavailable':
        'Cannot determine git status (not a git repo or git unavailable). Use --force to overwrite.',
      'update.docsWorktreeDirty':
        'Docs working tree has changes. Commit/stash your changes, or run with --force to overwrite.',

      'doctor.title': '🔎 Docs Doctor',
      'doctor.envWarnings': '⚠️  Environment warnings:',
      'doctor.noIssues': '✅ No issues found.',
      'doctor.errorsTitle': 'Errors',
      'doctor.warningsTitle': 'Warnings',
      'doctor.tipJson': 'Tip: Agent JSON output: npx lee-spec-kit doctor --json{strictFlag}',
      'doctor.issue.missingRequiredDir': 'Missing required directory: {dir}',
      'doctor.issue.missingConfig':
        'Missing .lee-spec-kit.json. Some commands may rely on folder-structure heuristics.',
      'doctor.issue.noFeatures':
        'No feature folders found. (Only feature-base exists, or no features created yet.)',
      'doctor.issue.placeholdersLeft': 'Leftover placeholders detected: {placeholders}',
      'doctor.issue.missingSpec': 'Missing spec.md.',
      'doctor.issue.specStatusUnset': 'spec.md Status is not set. (May still be a template)',
      'doctor.issue.planStatusUnset': 'plan.md Status is not set. (May still be a template)',
      'doctor.issue.tasksEmpty': 'tasks.md has no tasks.',
      'doctor.issue.tasksDocStatusUnset':
        'tasks.md Doc Status is not set. (Set it to Review or Approved.)',
      'doctor.issue.tasksDocStatusMissing':
        'tasks.md is missing the Doc Status field. Add `- **Doc Status**: Review | Approved`.',
      'doctor.issue.duplicateFeatureId': 'Duplicate Feature ID detected: {id} ({count})',
      'doctor.issue.missingFeatureId':
        'Feature folder name is not in F001-... format. (Cannot extract ID)',

      'context.noActiveFeatures': '⚠️  No active features found.',
      'context.header': '📍 Current Context Check',
      'context.envWarnings': '⚠️  Environment warnings:',
      'context.openFallbackSummary':
        '(Could not detect a feature from the branch, so showing only open features. In Progress: {inProgress} / Ready To Close: {readyToClose} / Done: {done})',
      'context.sectionInProgress': 'In Progress',
      'context.sectionReadyToClose': 'Ready To Close',
      'context.tipDetails': 'Tip: To view details for a feature:',
      'context.tipShowAll': 'Show all',
      'context.tipShowDone': 'Show done only',
      'context.checkRequired': '[CHECK required] ',
      'context.checkPolicyHint':
        'ℹ️  Check user-approval policy once at session start (or right after context compression/reset); re-check only when policy/config changes or the user explicitly requests refresh. (includes git push/merge and merge commits). If you see [CHECK required], wait for `<label>` or `<label> OK` (e.g. `A`, `A OK`) before proceeding (config: approval can override)',
      'context.actionOptionHint':
        'Approval reply format: include a label token (e.g. `A`, `A OK`, `A proceed`)',
      'context.actionExplainHint':
        'Before requesting approval, explain what each label will run/change with a one-line summary.',
      'context.finalLabelPrompt':
        'Available labels now: {labels}. Please reply in `<label>` or `<label> OK` format. (e.g. {example})',
      'context.finalLabelCommandHint':
        'When a label is provided, run approval selection: {command}',
      'context.finalTicketCommandHint':
        'Execute commands using the ticket from approval result: {command}',
      'context.readBuiltinDocFirst':
        'Read required built-in docs only if not read in this session yet or likely changed.',
      'context.tipDocsCommitRules':
        'Check commit message rules against the git-workflow guide.',
      'context.list.docsCommitNeeded': 'Commit docs changes',
      'context.list.projectCommitNeeded': 'Commit project code changes',
      'context.list.issueNumberNeeded': 'Fill issue number in docs',
      'context.list.addPrMetadata': 'Add PR metadata (PR/PR Status)',
      'context.list.recordPrLink': 'Record PR link',
      'context.list.addPrePrReviewField': 'Add Pre-PR Review field',
      'context.list.completePrePrReview': 'Complete Pre-PR review',
      'context.list.setPrStatus': 'Set PR Status',
      'context.list.prStatusToApproved': 'PR merge required (PR Status: {status} → Approved)',
      'context.list.approveSpec': 'Approve spec',
      'context.list.approvePlan': 'Approve plan',

      'init.selectLangPrompt': 'Select docs language:',
      'init.currentDirectoryLabel': '📍 Current directory',
      'init.gitDetected': '✅ Git repository detected',
      'init.insideProjectRoot': 'You are running inside your project root.',
      'init.modeEmbeddedDesc':
        '• embedded: creates ./docs here and manages it with the project.',
      'init.modeStandaloneDesc': '• standalone: to manage docs as a separate repo,',
      'init.modeStandaloneMove': '  move to that folder and run again.',
      'init.gitNotDetected': '⚠️  Git repository not detected.',
      'init.gitNotDetectedDetail': 'A new Git repo will be initialized.',
      'init.prompt.projectName': 'Enter project name:',
      'init.prompt.projectType': 'Select project type:',
      'init.choice.projectType.single.title': 'Single - single repo project',
      'init.choice.projectType.single.desc': 'Manage with a single features/ folder',
      'init.choice.projectType.fullstack.title': 'Multi - multi-component project',
      'init.choice.projectType.fullstack.desc': 'Default structure uses features/{component}/',
      'init.prompt.docsMode': 'Select docs mode:',
      'init.choice.docsRepo.embedded.title': 'embedded - inside the project (./docs)',
      'init.choice.docsRepo.embedded.desc': 'Pushed together with the project',
      'init.choice.docsRepo.standalone.title': 'standalone - separate docs repo',
      'init.choice.docsRepo.standalone.desc': 'Configure push settings separately',
      'init.prompt.componentRepoPath': 'Enter repository path for component "{component}":',
      'init.prompt.projectRepoPath': 'Enter project repository path:',
      'init.validation.enterPath': 'Please enter a path',
      'init.prompt.pushMode': 'Select docs push mode:',
      'init.choice.push.local': 'local - manage locally (no push)',
      'init.choice.push.remote': 'remote - push to remote',
      'init.prompt.remoteUrl': 'Enter remote repository URL:',
      'init.validation.enterUrl': 'Please enter a URL',
      'init.prompt.overwrite': '{dir} already exists. Overwrite?',
      'init.log.creatingDocs': '📁 Creating docs structure...',
      'init.log.projectLabel': 'Project',
      'init.log.typeLabel': 'Type',
      'init.log.langLabel': 'Lang',
      'init.log.pathLabel': 'Path',
      'init.log.docsCreated': '✅ Docs structure created!',
      'init.log.nextStepsTitle': 'Next steps:',
      'init.log.nextSteps1': '  1. Write {docsDir}/prd/README.md',
      'init.log.nextSteps2': '  2. Add a feature with: npx lee-spec-kit feature <name>',
      'init.log.gitRepoDetectedCommit': '📦 Git repo detected, committing docs...',
      'init.log.gitInit': '📦 Initializing Git...',
      'init.warn.stagedChangesSkip':
        '⚠️  There are already staged changes in the Git index. (With --dir ".", commit scope cannot be safely restricted, so auto-commit is skipped.)',
      'init.warn.docsPathIgnoredSkipCommit':
        '⚠️  Docs path is matched by .gitignore, so auto-commit is skipped: {path}',
      'init.warn.docsPathIgnoredHint':
        '    To keep tracking docs, use `git add -f {path}` then commit, or move docs via `--dir` to a non-ignored path.',
      'init.warn.commitManually': '    Review the changes and commit manually.',
      'init.log.gitRemoteSet': '✅ Git remote set: {remote}',
      'init.warn.gitRemoteExists': '⚠️  Git remote already exists.',
      'init.log.gitInitialCommitDone': '✅ Initial Git commit created!',
      'init.warn.skipGitInit': '⚠️  Skipping Git initialization (please commit manually)',
      'init.error.templateNotFound': 'Template not found: {path}',

      'github.cmdGithubDescription':
        'GitHub workflow helpers (issue/pr templates, validation, merge retry)',
      'github.cmdIssueDescription':
        'Generate/create GitHub issue body from feature docs with validation',
      'github.cmdPrDescription':
        'Generate/create GitHub PR body with validation, tasks PR sync, and merge retry',
      'github.optJson': 'Output in JSON format for agents',
      'github.optComponent': 'Component name for multi projects',
      'github.optIssueTitle': 'Issue title',
      'github.optLabels': 'Comma-separated labels (default: enhancement)',
      'github.optIssueBodyFile':
        'Issue body file output path (default: project/component-scoped file in OS temp dir)',
      'github.optIssueAssignee': 'Issue assignee (default: @me)',
      'github.optIssueCreate': 'Create issue via gh CLI',
      'github.optIssueConfirm':
        'Explicit user approval token for remote operations (--create). Use: OK',
      'github.optPrTitle': 'PR title',
      'github.optPrBodyFile':
        'PR body file output path (default: project/component-scoped file in OS temp dir)',
      'github.optPrAssignee': 'PR assignee (default: @me)',
      'github.optPrBase': 'PR base branch (default: main)',
      'github.optPrCreate': 'Create PR via gh CLI',
      'github.optPrRef': 'Existing PR URL/number (used by --merge)',
      'github.optPrMerge': 'Merge PR with retry and head-branch refresh',
      'github.optPrConfirm':
        'Explicit user approval token for remote operations (--create/--merge). Use: OK',
      'github.optPrRetry': 'Retry count for merge (default: 3)',
      'github.optPrScreenshots': 'PR screenshots section mode (auto|on|off, default: auto)',
      'github.optPrMermaid': 'PR Mermaid section mode (auto|on|off, default: auto)',
      'github.optPrNoSyncTasks': 'Do not sync PR URL/PR status into tasks.md',
      'github.optPrCommitSync': 'Commit and push tasks.md metadata sync automatically',
      'github.labelsRequired': 'At least one label is required. Use `--labels enhancement`.',
      'github.approvalRequired':
        '{operation} requires explicit user approval. Re-run with `--confirm OK` after sharing the plan with the user.',
      'github.ghCommandFailed': 'GitHub CLI command failed',
      'github.ghEmptyJson': 'GitHub CLI returned empty JSON output.',
      'github.ghInvalidJson': 'GitHub CLI returned invalid JSON: {snippet}',
      'github.sectionsMissing': '{kind} body is missing required sections: {sections}',
      'github.todoPlaceholdersRemain':
        '{kind} body still contains TODO placeholders. Fill goals/completion criteria before creating remotely.',
      'github.artifactModeInvalid':
        'Invalid value for `--{kind}`: {value}. Allowed: auto,on,off',
      'github.prScreenshotsSectionMissing':
        'PR body is missing required section: {section}',
      'github.prScreenshotImageMissing':
        'Add image markdown (`![](...)`) to the `{section}` section in PR body.',
      'github.prMermaidSectionMissing':
        'PR body is missing required section: {section}',
      'github.prMermaidBlockMissing':
        'Add a ```mermaid code block to the `{section}` section in PR body.',
      'github.docsMissing': 'Related document paths do not exist: {paths}',
      'github.noFeatures': 'No features found.',
      'github.multipleFeaturesMatched':
        'Multiple features matched. Specify feature name (slug | F001 | F001-slug).',
      'github.featureSelectFailed':
        'Failed to auto-select a feature. Specify feature name explicitly.',
      'github.tasksNotFound': 'tasks.md not found: {path}',
      'github.detectBranchFailed': 'Failed to detect current git branch',
      'github.inspectWorktreeFailed': 'Failed to inspect git worktree',
      'github.worktreeNotClean':
        'Git worktree is not clean. Commit or stash changes before merge retry sync.',
      'github.inspectFileStatusFailed': 'Failed to inspect git file status',
      'github.stageFileFailed': 'Failed to stage file',
      'github.commitSyncFailed': 'Failed to commit synced metadata',
      'github.pushSyncFailed': 'Failed to push synced metadata commit',
      'github.fetchPrBranchesFailed': 'Failed to fetch PR branches',
      'github.checkoutHeadFailed': 'Failed to checkout PR head branch',
      'github.createLocalHeadFailed': 'Failed to create local PR head branch',
      'github.rebaseHeadFailed': 'Failed to rebase PR head branch',
      'github.pushRebasedHeadFailed': 'Failed to push rebased PR head branch',
      'github.restoreBranchFailed': 'Failed to restore previous branch after PR refresh',
      'github.mergeRetryFailed': 'Failed to merge PR after retry attempts.{lastError}',
      'github.retryInvalid': '`--retry` must be a positive integer.',
      'github.operationIssueCreate': 'GitHub issue creation',
      'github.operationPrCreate': 'GitHub PR creation',
      'github.operationPrMerge': 'GitHub PR merge',
      'github.createIssueFailed': 'Failed to create GitHub issue',
      'github.createPrFailed': 'Failed to create GitHub PR',
      'github.mergeRequiresPr': '`--merge` requires `--create` or `--pr <url|number>`.',
      'github.checkoutBaseAfterMergeFailed': 'Failed to checkout {base} after merge',
      'github.pullBaseAfterMergeFailed': 'Failed to update {base} after merge',
      'github.issueDefaultTitle': '{slug} ({summary})',
      'github.prDefaultTitleWithIssue': 'feat(#{issue}): {slug} (implementation update)',
      'github.prDefaultTitleNoIssue': 'feat: {slug} (implementation update)',
      'github.issueHeader': '🧾 GitHub Issue Helper',
      'github.prHeader': '🔀 GitHub PR Helper',
      'github.labelFeature': 'Feature',
      'github.labelBodyFile': 'Body file',
      'github.labelLabels': 'Labels',
      'github.labelPr': 'PR',
      'github.issueCreated': '✅ Created: {url}',
      'github.issueTemplateGenerated':
        'Template generated. Add --create to open the issue automatically.',
      'github.prTasksSynced': '✅ tasks.md PR metadata synced.',
      'github.prMerged': '✅ PR merged (attempts: {attempts}).',
      'github.prTemplateGenerated': 'Template generated. Add --create to open the PR automatically.',
      'github.syncCommitWithIssue': 'docs(#{issue}): sync PR metadata for {folder}',
      'github.syncCommitNoIssue': 'docs: sync PR metadata for {folder}',
      'github.kindIssue': 'Issue',
      'github.kindPr': 'PR',
      'docs.cmdDocsDescription': 'Read CLI-managed built-in agent docs',
      'docs.cmdListDescription': 'List available built-in docs',
      'docs.cmdGetDescription': 'Read one built-in doc',
      'docs.optJson': 'Output in JSON format for agents',
      'docs.invalidDocId': 'Unknown doc id: {docId}. Available: {available}',
      'docs.listHeader': '📚 Built-in Docs',
      'docs.nextDocs': 'Next docs',
      'docs.sourceLabel': 'source',
      'docs.hashLabel': 'hash',
      'detect.cmdDescription': 'Detect whether the current workspace is a lee-spec-kit project',
      'detect.optDir': 'Target directory to probe (default: current directory)',
      'detect.optJson': 'Output in JSON format for agents',
      'detect.header': '🔎 Project Detection',
      'detect.labelTarget': 'Target',
      'detect.resultDetected': 'Detected a lee-spec-kit project',
      'detect.resultNotDetected': 'No lee-spec-kit project detected',
      'detect.notDetectedHint':
        'Run `npx lee-spec-kit init` or pass `--dir` to the correct path.',
      'detect.labelDocsDir': 'Docs',
      'detect.labelConfigPath': 'Config',
      'detect.labelSource': 'Source',
      'detect.labelProjectType': 'Project Type',
      'detect.labelLang': 'Lang',
      'detect.labelProjectName': 'Project',
      'detect.sourceConfig': 'config (.lee-spec-kit.json)',
      'detect.sourceHeuristic': 'heuristic (agents/features folder)',

      'cliError.headerNextOptionsError': '👉 Next Options (Error):',
      'cliError.promptBlocked.retryWithoutNonInteractive':
        'Run the same command without --non-interactive.',
      'cliError.promptBlocked.passRequiredFlags':
        'Pass all required flags (including `--force` when needed), then run again.',
      'cliError.promptBlocked.checkRequiredOptions': 'Check required options first.',
      'cliError.configOrDocs.initializeDocs':
        'Initialize docs in the current workspace.',
      'cliError.configOrDocs.verifyDocsLocation':
        'Verify docs location and configuration.',
      'cliError.configOrDocs.runFromDocsDir':
        'Run command from the directory that contains docs/.',
      'cliError.lock.retryLater': 'Wait briefly, then retry the same command.',
      'cliError.lock.checkOtherProcess':
        'Check whether another lee-spec-kit process is still running.',
      'cliError.lock.inspectLockFiles':
        'Inspect runtime lock files (project `.git/lee-spec-kit.runtime/locks` or OS temp).',
      'cliError.invalidArg.reviewUsage': 'Review command usage and valid flags.',
      'cliError.invalidArg.fixValues': 'Fix invalid value(s) and retry.',
      'cliError.invalidArg.validateBeforeAutomation':
        'If using automation, validate arguments before invoking CLI.',
      'cliError.precondition.satisfyPreconditions':
        'Satisfy the command preconditions first (environment/worktree).',
      'cliError.precondition.runDoctor':
        'Run workspace diagnostics to inspect current state.',
      'cliError.precondition.considerForce':
        'If overwrite is intentional, consider the force flag.',
      'cliError.duplicateId.resolveDuplicates':
        'Resolve duplicate Feature IDs, then run again.',
      'cliError.duplicateId.ensureUniqueFormat':
        'Ensure each feature folder has a unique `F###-slug` name.',
      'cliError.duplicateId.inspectJson':
        'Inspect duplicates via JSON diagnostics.',
      'cliError.missingId.renameFolders':
        'Rename feature folders without IDs to `F###-slug` format.',
      'cliError.missingId.alignDocs':
        'Align Feature IDs in spec/tasks docs after renaming.',
      'cliError.missingId.inspectJson':
        'Inspect missing IDs via JSON diagnostics.',
      'cliError.invalidApproval.fetchLatestOptions': 'Fetch latest options first.',
      'cliError.invalidApproval.replyWithValidLabel':
        'Reply with a valid label only (or "<label> OK"), e.g. A.',
      'cliError.invalidApproval.oneLabelOnly': 'Use one label at a time.',
      'cliError.approvalRequired.reRunWithApprove':
        'For context approval flow, re-run with --approve <label>.',
      'cliError.approvalRequired.githubConfirmOk':
        'For github remote create/merge, pass --confirm OK.',
      'cliError.approvalRequired.shareAndGetApproval':
        'Share title/body/labels (or merge plan) and get explicit user approval first.',
      'cliError.contextSelection.specifySelector':
        'Specify one feature selector explicitly.',
      'cliError.contextSelection.narrowByComponent':
        'Narrow by component in multi mode.',
      'cliError.contextSelection.inspectAllCandidates':
        'Inspect all candidates first.',
      'cliError.noActionOptions.refreshContext':
        'Refresh context to see current state.',
      'cliError.noActionOptions.completeChecklist':
        'Open feature docs and complete the missing checklist item.',
      'cliError.noActionOptions.listAllFeatures':
        'List all features to find one with actionable options.',
      'cliError.contextStale.refreshBeforeApprove':
        'Get fresh context before approving.',
      'cliError.contextStale.reapproveWithFreshLabel':
        'Approve again using a label from the latest output.',
      'cliError.contextStale.executeAfterFreshApproval':
        'Execute only after re-approval of the fresh label.',
      'cliError.execution.notCommand':
        'Check whether the approved label points to a command action.',
      'cliError.execution.failed':
        'Review the failed command output and fix prerequisites.',
      'cliError.execution.rerunContextAndExecute':
        'Re-run context and execute one fresh label.',
      'cliError.execution.runManually':
        'Run the command manually to isolate environment issues.',
      'cliError.unknown.rerunAndCaptureLogs':
        'Re-run with the same input and capture full error logs.',
      'cliError.unknown.runDoctor': 'Run diagnostics for workspace state.',
      'cliError.unknown.reportReasonCode':
        'Report the reasonCode and logs to maintainers.',

      'context.git.standaloneProjectRootMissing':
        'Standalone mode is enabled, but projectRoot is missing. Cannot resolve project branch. (npx lee-spec-kit config --project-root ...)',
      'context.git.multiProjectRootShapeInvalid':
        'Multi standalone mode requires projectRoot as an object. (Example: { "app": "...", "api": "...", "worker": "..." })',
      'context.git.multiProjectRootRepoMissing':
        'projectRoot.{repo} is empty. (npx lee-spec-kit config --project-root ... --component {repo})',
      'context.git.singleProjectRootShapeInvalid':
        'Single standalone mode requires projectRoot as a string path. (Example: "/path/to/project")',

      'validation.nameEmpty': 'Name cannot be empty.',
      'validation.nameTooLong': 'Name cannot exceed 100 characters.',
      'validation.nameTraversal': "Name cannot contain '..' or path separators.",
      'validation.nameNullByte': 'Name cannot contain null bytes.',
      'validation.nameInvalidChars':
        'Name can only include letters, numbers, hyphens, underscores, and Korean characters.',
      'validation.nameReserved': 'Reserved name is not allowed.',
      'validation.projectTypeInvalid': 'Project type must be one of: {values}.',
      'validation.languageInvalid': 'Language must be one of: {values}.',
      'validation.workflowModeInvalid': 'Workflow mode must be one of: {values}.',
      'validation.featureIdEmpty': 'Feature ID cannot be empty.',
      'validation.featureIdFormat': "Feature ID must be 'F' + digits (e.g., F001).",
      'validation.pathEmpty': 'Path cannot be empty.',
      'validation.pathNullByte': 'Path cannot contain null bytes.',
      'validation.genericFailed': 'Validation failed',
      'validation.context.featureName': 'Feature name',
      'validation.context.featureId': 'Feature ID',
      'validation.context.projectName': 'Project name',
      'validation.context.projectType': 'Project type',
      'validation.context.language': 'Language',
      'validation.context.workflowMode': 'Workflow mode',

      'versionCheck.noticeAvailable':
        '📦 lee-spec-kit v{latest} is available (current: v{current})',
      'versionCheck.updateCommand': '   Update: npm update -g lee-spec-kit',
    },
    steps: {
      featureFolder: 'Create feature folder',
      specWrite: 'Write spec.md',
      specApprove: 'Approve spec.md',
      planWrite: 'Write plan.md',
      planApprove: 'Approve plan.md',
      tasksWrite: 'Write/approve tasks.md',
      docsInitialCommit: 'Initial docs commit',
      docsCommitPlanning: 'Commit docs (sync)',
      issueCreate: 'Create GitHub Issue',
      branchCreate: 'Create branch',
      tasksExecute: 'Execute tasks',
      docsCommitSync: 'Commit docs (sync)',
      prePrReview: 'Pre-PR review',
      prCreate: 'Create PR',
      codeReview: 'Code review',
      featureDone: 'Feature done',
    },
    messages: {
      specCreate:
        'Write spec.md and change Status to Review. (Follow the agents guide baseline.)',
      specImprove: 'Improve spec.md and change Status to Review.',
      specApproval:
        'Share spec.md with the user and get approval (`A` or `A OK` format).',
      planCreate:
        'Write plan.md and change Status to Review. (Follow the agents guide baseline.)',
      planImprove: 'Improve plan.md and change Status to Review.',
      planApproval:
        'Share plan.md with the user and get approval (`A` or `A OK` format).',
      tasksCreate:
        'Write tasks.md and change Doc Status to Review. (Follow the agents/execute-task guide baseline.)',
      tasksNeedAtLeastOne: 'Write at least 1 task in tasks.md.',
      tasksImprove: 'Improve tasks.md and change Doc Status to Review.',
      tasksApproval:
        'Share tasks.md with the user and get progress approval (`A` or `A OK` format). (Then set Doc Status to Approved)',
      docsCommitPlanning:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(planning): {folderName} planning docs"',
      issueCreateAndWrite:
        'Generate the issue body template, refine goals/completion criteria, get explicit user OK, create the issue, then update issue number in spec.md/tasks.md and prepare a docs commit.',
      docsCommitIssueUpdate:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(#{issueNumber}): {folderName} docs update"',
      docsCommitUpdate:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs: {folderName} docs update"',
      projectCommitIssueUpdate:
        'cd "{projectGitCwd}" && (git diff --cached --quiet && echo "No staged files. Stage only files changed in this task with git add [files], then run again." && exit 1 || git commit -m "feat(#{issueNumber}): {commitTopic}")',
      projectCommitUpdate:
        'cd "{projectGitCwd}" && (git diff --cached --quiet && echo "No staged files. Stage only files changed in this task with git add [files], then run again." && exit 1 || git commit -m "feat({folderName}): {commitTopic}")',
      standaloneNeedsProjectRoot:
        'Standalone mode requires projectRoot. (npx lee-spec-kit config --project-root ...)',
      createBranch:
        'cd "{projectGitCwd}" && git checkout -b feat/{issueNumber}-{slug}',
      tasksAllDoneButNoChecklist:
        'Create the completion checklist. Add verification items to the tasks.md "Completion Criteria" section, then mark satisfied items as [x] after user confirmation. Record final approval (OK) as well.',
      tasksAllDoneButChecklist:
        'Proceed with remaining completion checklist items. Current progress: ({checked}/{total}) Mark items as [x] only after user confirmation and real verification. Record final approval (OK) as well.',
      finishDoingTask:
        'Finish the current DOING/REVIEW task: "{title}" ({done}/{total}) Share outcome/verification + get OK before marking DONE',
      startNextTodoTask:
        'Start the next TODO task: "{title}" ({done}/{total}) Get approval (`A` or `A OK`) before marking DOING',
      checkTaskStatuses:
        'Check task statuses. ({done}/{total})',
      taskCommitGateStrictBlock:
        'Before moving to the next TODO task, you must satisfy the `1 task = 1 commit` rule. Check result: {reason}. Re-align task commit boundaries, then continue.',
      taskCommitGateWarnProceed:
        '⚠️ Task commit boundary warning: {reason}. You may continue, but `1 task = 1 commit` is recommended.',
      taskCommitGateReasonNoTasksCommit:
        'No recent tasks.md commit was found',
      taskCommitGateReasonTasksFileUnavailable:
        'Cannot read tasks.md history from the latest commit',
      taskCommitGateReasonDoneCount:
        'DONE transitions in the latest tasks.md commit: {count} (expected: 1)',
      taskCommitGateReasonMismatchLastDone:
        'The latest tasks.md commit does not match the last completed task',
      prLegacyAsk:
        'tasks.md is missing PR/PR Status fields. Update to the latest template format? (CHECK required)',
      prePrReviewFieldMissing:
        'tasks.md is missing the `Pre-PR Review` field. Add `- **Pre-PR Review**: Pending | Done` and run context again. (CHECK required)',
      prePrReviewRun:
        'Run a pre-PR code review before creating the PR. Preferred skills: {skills} (if a better installed skill fits this change, propose it first). If no skill can run, use `{fallback}` and set `Pre-PR Review` to Done in tasks.md. Findings policy: {findingsPolicy}',
      prePrReviewFindingsBlock:
        'major findings must be fixed/aligned before PR creation',
      prePrReviewFindingsWarn:
        'you may proceed after sharing the risks',
      prCreate:
        'Generate the PR body template, refine changes/tests sections, get explicit user OK, create the PR, then record the PR link in tasks.md.',
      prFillStatus:
        'Set PR Status in tasks.md to Review. (Keep Review during PR creation/review stages.)',
      prResolveReview:
        'Keep PR Status as Review while addressing comments. Once ready to merge, get explicit user OK and run `npx lee-spec-kit github pr {featureRef} --merge --confirm OK`. (On success, PR Status is synced to Approved.)',
      prRequestReview: 'Request review and set/keep PR Status as Review.',
      featureDone:
        'Workflow requirements and all tasks/completion criteria are satisfied. This feature is done.',
      fallbackRerunContext:
        'Cannot determine status. Check the docs and run context again.',
    },
    warnings: {
      projectBranchUnavailable:
        'Cannot determine project branch. (In standalone mode, projectRoot is required.)',
      docsGitUnavailable:
        'Cannot read git status for the docs repo. (Check repo location / git init.)',
      docsPathIgnored:
        'Current feature docs path is ignored by git: {path} (docs commit detection may be limited).',
      docsUncommittedChanges:
        'Docs changes are not committed. (Additional docs commit needed.) Check commit message rules against the git-workflow guide.',
      projectUncommittedChanges:
        'Project code changes are not committed. (Additional code commit needed.)',
      legacyTasksDocStatusField:
        'Legacy tasks.md format detected. Add a `Doc Status` field (Review/Approved) to enable tasks approval.',
      legacyTasksPrFields:
        'Legacy tasks.md format detected. Add `PR` and `PR Status` fields before PR steps.',
      legacyTasksPrePrReviewField:
        'Legacy tasks.md format detected. Add `Pre-PR Review` before PR steps. (`- **Pre-PR Review**: Pending | Done`)',
      workflowSpecNotApproved:
        'Implementation is done but spec.md Status is not Approved. (Update spec.md Status to Approved.)',
      workflowPlanNotApproved:
        'Implementation is done but plan.md Status is not Approved. (Update plan.md Status to Approved.)',
      workflowIssueMissing:
        'Implementation is done but Issue Number is missing. (Fill Issue Number in spec.md/tasks.md.)',
      workflowProjectUncommittedChanges:
        'Commit project code changes before completing workflow. (Project worktree has uncommitted changes.)',
      workflowPrLinkMissing:
        'Implementation is done but PR link is missing. (Fill the PR field in tasks.md.)',
      workflowPrStatusMissing:
        'Implementation is done but PR Status is missing. (Set PR Status to Review during PR creation/review stages.)',
      workflowPrStatusNotApproved:
        'Implementation is done but PR Status is not Approved. (Keep PR Status as Review before merge and sync to Approved only after successful merge.)',
      workflowPrePrReviewMissing:
        'Implementation is done but `Pre-PR Review` is missing. (Add `- **Pre-PR Review**: Pending | Done` in tasks.md.)',
      workflowPrePrReviewNotDone:
        'Implementation is done but `Pre-PR Review` is not Done. (Run pre-PR review, then update it to Done.)',
    },
  },
};

export function tr(
  lang: Lang,
  category: I18nCategory,
  key: string,
  vars: Record<string, string | number | undefined> = {}
): string {
  const safeLang = normalizeLang(lang);
  const template =
    I18N[safeLang]?.[category]?.[key] ??
    I18N[DEFAULT_LANG]?.[category]?.[key] ??
    I18N.ko?.[category]?.[key] ??
    `${category}.${key}`;
  return formatTemplate(template, vars);
}

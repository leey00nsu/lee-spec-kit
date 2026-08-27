export const koCli = {
  'common.errorLabel': '오류:',
  'common.canceled': '작업이 취소되었습니다.',
  'common.configNotFound':
    '설정 파일을 찾을 수 없습니다. 먼저 init을 실행해주세요.',
  'common.docsNotFound':
    'docs 폴더를 찾을 수 없습니다. 먼저 init을 실행하세요.',

  'feature.selectRepo': '레포지토리를 선택하세요:',
  'feature.folderExists': '이미 존재하는 폴더입니다: {path}',
  'feature.baseNotFound': 'CLI 내장 feature 템플릿을 찾을 수 없습니다.',
  'feature.created': '✅ Feature 폴더 생성 완료: {path}',
  'feature.nextStepsTitle': '다음 단계:',
  'feature.nextSteps1': '  1. {path}/spec.md 작성',
  'feature.nextSteps2': '  2. 사용자 리뷰 요청',
  'feature.nextSteps3': '  3. 승인 후 plan.md 작성',
  'feature.ideaNotFound': 'Idea 문서를 찾을 수 없습니다: {ref}',
  'feature.ideaAmbiguous':
    '{ref}와 매칭되는 Idea 문서가 여러 개입니다. 정확한 경로나 전체 indexed 이름을 사용하세요.',

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
  'update.agentsUpdated': 'agents/ 업데이트 완료',
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

  'init.selectLangPrompt': '문서 언어를 선택하세요:',
  'init.currentDirectoryLabel': '📍 현재 위치',
  'init.gitDetected': '✅ Git 레포지토리 감지됨',
  'init.insideProjectRoot': '현재 프로젝트 루트 내에서 실행하고 계십니다.',
  'init.modeEmbeddedDesc':
    '• embedded: 여기에 ./docs 폴더를 생성합니다. 프로젝트와 함께 관리됩니다.',
  'init.modeStandaloneDesc':
    '• standalone: 별도 폴더에서 독립 docs 레포로 관리하려면,',
  'init.modeStandaloneMove': '  해당 폴더로 이동 후 다시 실행해주세요.',
  'init.gitNotDetected': '⚠️  Git 레포지토리가 감지되지 않았습니다.',
  'init.gitNotDetectedDetail': '새로운 Git 레포지토리가 생성됩니다.',
  'init.prompt.projectName': '프로젝트 이름을 입력하세요:',
  'init.prompt.projectType': '프로젝트 타입을 선택하세요:',
  'init.choice.projectType.single.title': 'Single - 단일 레포 프로젝트',
  'init.choice.projectType.single.desc': 'features/ 폴더 하나로 관리',
  'init.choice.projectType.fullstack.title': 'Multi - 멀티 컴포넌트 프로젝트',
  'init.choice.projectType.fullstack.desc':
    'Multi 컴포넌트 프로젝트 (기본: features/{component}/)',
  'init.prompt.docsMode': 'Docs 관리 방식을 선택하세요:',
  'init.choice.docsRepo.embedded.title': 'embedded - 프로젝트 내 포함 (./docs)',
  'init.choice.docsRepo.embedded.desc': '프로젝트와 함께 push됩니다',
  'init.choice.docsRepo.standalone.title': 'standalone - 별도 독립 레포',
  'init.choice.docsRepo.standalone.desc': 'push 여부를 별도로 설정합니다',
  'init.prompt.workflowMode': '워크플로우 방식을 선택하세요:',
  'init.choice.workflow.github.title': 'GitHub - Issue와 PR 기반 워크플로우',
  'init.choice.workflow.github.desc':
    '원격 Issue, 브랜치, PR, 리뷰, 병합 단계를 사용합니다',
  'init.choice.workflow.local.title': 'Local - 로컬 통합 워크플로우',
  'init.choice.workflow.local.desc':
    'GitHub 없이 관리형 worktree와 로컬 검증을 사용합니다',
  'init.prompt.workflowSetup': '워크플로우 자동화 방식을 설정하세요:',
  'init.choice.workflowSetup.recommended.title':
    '권장 설정 - 균형 잡힌 기본값 사용',
  'init.choice.workflowSetup.recommended.desc':
    'Task 구현을 위임하고 Plan과 Feature를 검수합니다',
  'init.choice.workflowSetup.custom.title': '직접 설정 - 옵션 선택',
  'init.choice.workflowSetup.custom.desc':
    'Task 위임, 검수 단계, 로컬 통합 방식을 선택합니다',
  'init.prompt.taskAgent': 'Task 구현을 서브에이전트에게 위임할까요?',
  'init.choice.taskAgent.on': '사용 - 각 Task 구현을 위임',
  'init.choice.taskAgent.off': '사용 안 함 - 메인 에이전트가 직접 구현',
  'init.prompt.reviews': '독립 검수 단계를 선택하세요:',
  'init.choice.review.plan': 'Plan',
  'init.choice.review.task': 'Task',
  'init.choice.review.feature': 'Feature',
  'init.prompt.completionStrategy': '로컬 통합 방식을 선택하세요:',
  'init.choice.completionStrategy.localFf':
    'local-ff - 검증된 Feature 브랜치를 fast-forward 통합',
  'init.choice.completionStrategy.localSquash':
    'local-squash - 검증된 하나의 커밋으로 통합',
  'init.choice.completionStrategy.none':
    'none - Feature 브랜치를 통합하지 않고 종료',
  'init.prompt.componentRepoPath':
    '{component} 컴포넌트 레포지토리 경로를 입력하세요:',
  'init.prompt.projectRepoPath': '프로젝트 레포지토리 경로를 입력하세요:',
  'init.validation.enterPath': '경로를 입력해주세요',
  'init.prompt.pushMode': 'Docs push 방식을 선택하세요:',
  'init.choice.push.local': 'local - 로컬에서만 관리 (push 안 함)',
  'init.choice.push.remote': 'remote - 원격에도 push',
  'init.prompt.remoteUrl': '원격 레포 URL을 입력하세요:',
  'init.validation.enterUrl': 'URL을 입력해주세요',
  'init.prompt.overwrite': '{dir} 폴더가 이미 존재합니다. 덮어쓰시겠습니까?',
  'init.log.configSummaryTitle': '⚙️  설정 요약',
  'init.log.creatingDocs': '📁 docs 구조 생성 중...',
  'init.log.projectLabel': '프로젝트',
  'init.log.typeLabel': '타입',
  'init.log.langLabel': '언어',
  'init.log.pathLabel': '경로',
  'init.log.workflowLabel': '워크플로우',
  'init.log.taskAgentLabel': 'Task 구현',
  'init.log.reviewsLabel': '검수',
  'init.log.completionStrategyLabel': '로컬 통합',
  'init.summary.taskAgent.on': '서브에이전트',
  'init.summary.taskAgent.off': '메인 에이전트',
  'init.summary.reviews.none': '없음',
  'init.log.docsCreated': '✅ docs 구조 생성 완료!',
  'init.log.nextStepsTitle': '다음 단계:',
  'init.log.nextSteps1': '  1. {docsDir}/prd/README.md 작성',
  'init.log.nextSteps2': '  2. npx lee-spec-kit feature <name> 으로 기능 추가',
  'init.log.nextSteps3':
    '  3. lee-spec-kit 워크플로우용 workspace-local Codex hooks 설치: npx lee-spec-kit integrations codex-hooks',
  'init.log.nextSteps4':
    '  4. 필요하면 전역 Codex hooks bootstrap flag도 설치: npx lee-spec-kit integrations codex',
  'init.log.nextSteps5':
    '',
  'init.log.gitRepoDetectedCommit': '📦 Git 레포지토리 감지, docs 커밋 중...',
  'init.log.gitInit': '📦 Git 초기화 중...',
  'init.warn.stagedChangesSkip':
    '⚠️  현재 Git index에 이미 stage된 변경이 있습니다. (--dir "." 인 경우 커밋 범위를 안전하게 제한할 수 없어 자동 커밋을 건너뜁니다)',
  'init.warn.docsPathIgnoredSkipCommit':
    '⚠️  docs 경로가 .gitignore 규칙에 매칭되어 자동 커밋을 건너뜁니다: {path}',
  'init.warn.docsPathIgnoredHint':
    '    계속 추적하려면 `git add -f {path}` 후 커밋하거나, `--dir`를 ignore되지 않은 경로로 변경하세요.',
  'init.warn.commitManually':
    '    수동으로 변경 내용을 확인한 뒤 커밋해주세요.',
  'init.log.gitRemoteSet': '✅ Git remote 설정 완료: {remote}',
  'init.warn.gitRemoteExists': '⚠️  Git remote가 이미 존재합니다.',
  'init.log.gitInitialCommitDone': '✅ Git 초기 커밋 완료!',
  'init.warn.skipGitInit':
    '⚠️  Git 초기화를 건너뜁니다 (수동으로 커밋해주세요)',
  'init.error.templateNotFound': '템플릿을 찾을 수 없습니다: {path}',

  'idea.fileExists': '이미 존재하는 Idea 문서입니다: {path}',
  'idea.templateNotFound': 'CLI 내장 idea 템플릿을 찾을 수 없습니다.',
  'idea.created': '✅ Idea 문서 생성 완료: {path}',
  'idea.nextStepsTitle': '다음 단계:',
  'idea.nextSteps1': '  1. 범위, PRD Refs, 승격 메모를 작성',
  'idea.nextSteps2':
    '  2. Feature로 승격: npx lee-spec-kit feature <name> --idea {ideaId}',
  'idea.nextSteps3': '  3. Feature로 만들지 않을 경우 Dropped로 표시',

  'integrations.codexBootstrapInstalled':
    '✅ 선택적 Codex bootstrap 설치 완료: {path}',
  'integrations.codexBootstrapAlreadyInstalled':
    '✅ 선택적 Codex bootstrap 이 이미 설치되어 있습니다: {path}',
  'integrations.codexBootstrapRemoved':
    '✅ 선택적 Codex bootstrap 제거 완료: {path}',
  'integrations.codexBootstrapAlreadyAbsent':
    '✅ 선택적 Codex bootstrap 이 이미 없습니다: {path}',
  'integrations.codexHooksInstalled': '✅ Repo-local Codex hooks 설치 완료: {path}',
  'integrations.codexHooksAlreadyInstalled':
    '✅ Repo-local Codex hooks 가 이미 설치되어 있습니다: {path}',
  'integrations.codexHooksRemoved': '✅ Repo-local Codex hooks 제거 완료: {path}',
  'integrations.codexHooksAlreadyAbsent':
    '✅ Repo-local Codex hooks 가 이미 없습니다: {path}',
  'integrations.codexHooksTrustRequired':
    'Codex에서 /hooks를 실행해 설치된 프로젝트 훅을 검토하고 신뢰하세요. 훅 정의가 변경되면 다시 검토해야 합니다.',

  'github.cmdGithubDescription':
    'GitHub 워크플로우 도우미 (issue/pr 본문 템플릿 생성, 검증, merge 재시도)',
  'github.cmdIssueDescription': 'feature 문서 기반 GitHub issue 본문 생성/생성',
  'github.cmdPrDescription':
    'GitHub PR 본문 생성/생성 + tasks 동기화 + merge 재시도',
  'github.optJson': '에이전트용 JSON 형식으로 출력',
  'github.optComponent': '멀티 프로젝트 컴포넌트 이름',
  'github.optIssueTitle': 'Issue 제목',
  'github.optLabels': '쉼표 구분 라벨 목록 (기본: enhancement)',
  'github.optIssueBodyFile':
    'Issue 본문 파일 출력 경로 (기본: OS 임시 디렉터리의 프로젝트/컴포넌트 고정 파일)',
  'github.optIssueAssignee': 'Issue 담당자 (기본: @me)',
  'github.optIssueCreate': 'gh CLI로 issue 생성',
  'github.optIssueConfirm':
    '원격 작업(--create)용 명시적 승인 토큰. 사용값: OK',
  'github.optPrTitle': 'PR 제목',
  'github.optPrBodyFile':
    'PR 본문 파일 출력 경로 (기본: OS 임시 디렉터리의 프로젝트/컴포넌트 고정 파일)',
  'github.optPrAssignee': 'PR 담당자 (기본: @me)',
  'github.optPrBase': 'PR base 브랜치 (기본: main)',
  'github.optPrCreate': 'gh CLI로 PR 생성',
  'github.optPrRef': '--merge 시 사용할 기존 PR URL/번호',
  'github.optPrMerge': '재시도/헤드 갱신과 함께 PR merge 수행',
  'github.optPrConfirm':
    '원격 작업(--create/--merge)용 명시적 승인 토큰. 사용값: OK',
  'github.optPrRetry': 'merge 재시도 횟수 (기본: 3)',
  'github.optPrScreenshots': 'PR 스크린샷 섹션 모드 (auto|on|off, 기본: auto)',
  'github.optPrMermaid': 'PR Mermaid 섹션 모드 (auto|on|off, 기본: auto)',
  'github.optPrNoSyncTasks': 'tasks.md PR URL/PR 상태 동기화를 건너뜀',
  'github.optPrCommitSync': 'tasks.md 동기화 변경을 자동 commit/push',
  'github.labelsRequired':
    '최소 1개 라벨이 필요합니다. `--labels enhancement`를 사용하세요.',
  'github.approvalRequired':
    '{operation}은(는) 사용자 명시 승인 후에만 실행할 수 있습니다. 계획 공유 후 `--confirm OK`로 다시 실행하세요.',
  'github.ghCommandFailed': 'GitHub CLI 명령 실행에 실패했습니다',
  'github.issueLookupFailed': 'GitHub issue 존재 여부 확인에 실패했습니다',
  'github.ghEmptyJson': 'GitHub CLI JSON 출력이 비어 있습니다.',
  'github.ghInvalidJson': 'GitHub CLI JSON 파싱에 실패했습니다: {snippet}',
  'github.invalidIssueReference':
    'Issue 필드가 올바른 GitHub issue reference 형식이 아닙니다: {value}. `#123` 같은 실제 issue 번호를 사용하세요.',
  'github.issueNotFound':
    'GitHub issue {issue} 를 현재 repository context에서 찾을 수 없거나 접근할 수 없습니다.',
  'github.sectionsMissing': '{kind} 본문에 필수 섹션이 없습니다: {sections}',
  'github.todoPlaceholdersRemain':
    '{kind} 본문에 TODO 항목이 남아 있습니다. 목표/완료 기준 등을 채운 뒤 다시 실행하세요.',
  'github.artifactModeInvalid':
    '`--{kind}` 값이 올바르지 않습니다: {value}. 허용값: auto,on,off',
  'github.prScreenshotsSectionMissing':
    'PR 본문에 필수 섹션이 정해져 있습니다: {section}',
  'github.prScreenshotImageMissing':
    'PR 본문의 `{section}` 섹션에 이미지 마크다운(`![](...)`)을 추가하세요.',
  'github.prMermaidSectionMissing': 'PR 본문에 필수 섹션이 없습니다: {section}',
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
  'github.restoreBranchFailed':
    'PR 헤드 갱신 후 이전 브랜치 복원에 실패했습니다',
  'github.mergeRetryFailed':
    '재시도 후에도 PR merge에 실패했습니다.{lastError}',
  'github.retryInvalid': '`--retry`는 1 이상의 정수여야 합니다.',
  'github.operationIssueCreate': 'GitHub issue 생성',
  'github.operationPrCreate': 'GitHub PR 생성',
  'github.operationPrMerge': 'GitHub PR merge',
  'github.createIssueFailed': 'GitHub issue 생성에 실패했습니다',
  'github.createPrFailed': 'GitHub PR 생성에 실패했습니다',
  'github.mergeRequiresPr':
    '`--merge`를 사용하려면 `--create`, `--pr <url|number>`, 또는 tasks.md의 PR 링크가 필요합니다.',
  'github.checkoutBaseAfterMergeFailed':
    'merge 후 {base} 브랜치 checkout에 실패했습니다',
  'github.pullBaseAfterMergeFailed':
    'merge 후 {base} 브랜치 최신화에 실패했습니다',
  'github.postMergeCheckoutWarning':
    'PR merge는 완료되었지만 `{base}` checkout에 실패했습니다(치명 아님): {detail}',
  'github.postMergePullWarning':
    'PR merge는 완료되었지만 `{base}` pull에 실패했습니다(치명 아님): {detail}',
  'github.issueDefaultTitle': '{slug} ({summary})',
  'github.prDefaultTitleWithIssue':
    'feat(#{issue}): {slug} ({featureRef} 구현)',
  'github.prDefaultTitleNoIssue': 'feat: {slug} ({featureRef} 구현)',
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
  'github.prAlreadyMergedNotice':
    'ℹ️  PR이 이미 원격에서 merge된 상태입니다. 로컬/문서 동기화만 이어서 처리합니다.',
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
  'docs.invalidDocId':
    '알 수 없는 문서 ID입니다: {docId}. 사용 가능: {available}',
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
  'cliError.configOrDocs.initializeDocs':
    '현재 워크스페이스에서 docs를 초기화하세요.',
  'cliError.configOrDocs.verifyDocsLocation': 'docs 위치와 설정을 점검하세요.',
  'cliError.configOrDocs.runFromDocsDir':
    'docs/가 있는 디렉터리에서 명령을 실행하세요.',
  'cliError.lock.retryLater': '잠시 기다린 뒤 같은 명령을 다시 실행하세요.',
  'cliError.lock.checkOtherProcess':
    '다른 lee-spec-kit 프로세스가 실행 중인지 확인하세요.',
  'cliError.lock.inspectLockFiles':
    '런타임 lock 파일(프로젝트 `.git/lee-spec-kit.runtime/locks` 또는 OS temp)을 확인하세요.',
  'cliError.invalidArg.reviewUsage':
    '명령 사용법과 유효한 플래그를 확인하세요.',
  'cliError.invalidArg.fixValues': '잘못된 값을 수정한 뒤 다시 실행하세요.',
  'cliError.invalidArg.validateBeforeAutomation':
    '자동화 환경이라면 CLI 호출 전에 인자를 검증하세요.',
  'cliError.precondition.satisfyPreconditions':
    '실행 전제조건을 만족하도록 환경/작업트리를 먼저 정리하세요.',
  'cliError.precondition.inspectDocsAndConfig':
    '재시도 전에 docs 정책과 현재 설정을 확인하세요.',
  'cliError.precondition.considerForce':
    '의도한 덮어쓰기라면 강제 옵션 사용을 검토하세요.',
  'cliError.duplicateId.resolveDuplicates':
    '중복된 Feature ID를 정리한 뒤 다시 실행하세요.',
  'cliError.duplicateId.ensureUniqueFormat':
    '각 Feature 폴더명이 고유한 `F###-slug` 형식인지 확인하세요.',
  'cliError.duplicateId.inspectJson': '중복 여부를 JSON 진단으로 확인하세요.',
  'cliError.missingId.renameFolders':
    'ID가 없는 Feature 폴더를 `F###-slug` 형식으로 변경하세요.',
  'cliError.missingId.alignDocs':
    'spec/tasks 문서의 Feature ID도 함께 정리하세요.',
  'cliError.missingId.inspectJson': '누락 항목을 JSON 진단으로 확인하세요.',
  'cliError.approvalRequired.githubConfirmOk':
    'github 원격 생성/머지면 --confirm OK를 함께 전달하세요.',
  'cliError.approvalRequired.shareAndGetApproval':
    '실행 전에 제목/본문/라벨(또는 머지 계획)을 사용자에게 공유하고 명시적 승인을 받으세요.',
  'cliError.contextSelection.specifySelector':
    '단일 Feature selector를 명시하세요.',
  'cliError.contextSelection.narrowByComponent':
    'multi 모드에서는 --component로 범위를 좁히세요.',
  'cliError.contextSelection.inspectAllCandidates':
    '먼저 전체 후보를 확인하세요.',
  'cliError.execution.failed': '실패한 명령의 출력과 선행 조건을 확인하세요.',
  'cliError.execution.retryAfterFixingInputs':
    '실패 원인이나 입력을 정리한 뒤 다시 실행하세요.',
  'cliError.execution.runManually':
    '환경 문제 분리를 위해 명령을 수동 실행해보세요.',
  'cliError.unknown.rerunAndCaptureLogs':
    '같은 입력으로 재실행하고 전체 오류 로그를 수집하세요.',
  'cliError.unknown.inspectWorkspaceState':
    '워크스페이스 감지 결과와 설정 상태를 확인하세요.',
  'cliError.unknown.reportReasonCode':
    'reasonCode와 로그를 유지보수자에게 전달하세요.',

  'validation.nameEmpty': '이름은 비어있을 수 없습니다.',
  'validation.nameTooLong': '이름은 100자를 초과할 수 없습니다.',
  'validation.nameTraversal':
    "이름에 '..' 또는 경로 구분자를 사용할 수 없습니다.",
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
  'validation.featureIdFormat':
    "Feature ID는 'F' + 숫자 형식이어야 합니다 (예: F001).",
  'validation.ideaIdEmpty': 'Idea ID는 비어있을 수 없습니다.',
  'validation.ideaIdFormat':
    "Idea ID는 'I' + 숫자 형식이어야 합니다 (예: I001).",
  'validation.pathEmpty': '경로는 비어있을 수 없습니다.',
  'validation.pathNullByte': '경로에 null 문자를 사용할 수 없습니다.',
  'validation.genericFailed': '검증 실패',
  'validation.context.featureName': '기능 이름',
  'validation.context.featureId': 'Feature ID',
  'validation.context.ideaName': 'Idea 이름',
  'validation.context.ideaId': 'Idea ID',
  'validation.context.projectName': '프로젝트 이름',
  'validation.context.projectType': '프로젝트 타입',
  'validation.context.language': '언어',
  'validation.context.workflowMode': '워크플로우 모드',

  'versionCheck.noticeAvailable':
    '📦 lee-spec-kit v{latest} 사용 가능 (현재: v{current})',
  'versionCheck.updateCommand': '   업데이트: npm update -g lee-spec-kit',
} as const;

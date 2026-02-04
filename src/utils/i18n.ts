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
      'feature.baseNotFound': 'feature-base 템플릿을 찾을 수 없습니다.',
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
        'Fullstack 프로젝트는 --repo fe 또는 --repo be를 지정해야 합니다.',
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
      'doctor.issue.duplicateFeatureId': '중복 Feature ID 감지: {id} ({count}개)',
      'doctor.issue.missingFeatureId':
        'Feature 폴더명이 F001-... 형식이 아닙니다. (ID를 추출할 수 없음)',

      'context.noActiveFeatures': '⚠️  진행 중인 Feature를 찾을 수 없습니다.',
      'context.envWarnings': '⚠️  환경 경고:',
      'context.openFallbackSummary':
        '(브랜치로 Feature를 특정하지 못해 미완료 Feature만 표시합니다. 진행 중: {inProgress}개 / 종료 대기: {readyToClose}개 / 완료: {done}개)',
      'context.sectionInProgress': '진행 중',
      'context.sectionReadyToClose': '종료 준비',
      'context.tipDetails': 'Tip: 특정 Feature의 상세 정보를 보려면:',
      'context.tipShowAll': '전체 보기',
      'context.tipShowDone': '완료만 보기',
      'context.okRequired': '[OK 필요] ',
      'context.list.docsCommitNeeded': '문서 커밋 필요',
      'context.list.issueNumberNeeded': '이슈 번호 기록 필요',
      'context.list.addPrMetadata': 'PR 메타데이터(PR/PR 상태) 추가',
      'context.list.recordPrLink': 'PR 링크 기록',
      'context.list.setPrStatus': 'PR 상태 설정',
      'context.list.prStatusToApproved': 'PR 상태 {status} → Approved',
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
      'init.choice.projectType.fullstack.title': 'Fullstack - FE/BE 분리 프로젝트',
      'init.choice.projectType.fullstack.desc': 'features/be/, features/fe/ 분리 관리',
      'init.prompt.docsMode': 'Docs 관리 방식을 선택하세요:',
      'init.choice.docsRepo.embedded.title': 'embedded - 프로젝트 내 포함 (./docs)',
      'init.choice.docsRepo.embedded.desc': '프로젝트와 함께 push됩니다',
      'init.choice.docsRepo.standalone.title': 'standalone - 별도 독립 레포',
      'init.choice.docsRepo.standalone.desc': 'push 여부를 별도로 설정합니다',
      'init.prompt.feRepoPath': 'Frontend 레포지토리 경로를 입력하세요:',
      'init.prompt.beRepoPath': 'Backend 레포지토리 경로를 입력하세요:',
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
      'init.warn.commitManually': '    수동으로 변경 내용을 확인한 뒤 커밋해주세요.',
      'init.log.gitRemoteSet': '✅ Git remote 설정 완료: {remote}',
      'init.warn.gitRemoteExists': '⚠️  Git remote가 이미 존재합니다.',
      'init.log.gitInitialCommitDone': '✅ Git 초기 커밋 완료!',
      'init.warn.skipGitInit': '⚠️  Git 초기화를 건너뜁니다 (수동으로 커밋해주세요)',
      'init.error.templateNotFound': '템플릿을 찾을 수 없습니다: {path}',
    },
    steps: {
      featureFolder: 'Feature 폴더 생성',
      specWrite: 'spec.md 작성',
      specApprove: 'spec.md 승인',
      planWrite: 'plan.md 작성',
      planApprove: 'plan.md 승인',
      tasksWrite: 'tasks.md 작성',
      docsInitialCommit: '초기 문서 커밋',
      docsCommitPlanning: '문서 커밋(동기화)',
      issueCreate: 'GitHub Issue 생성',
      branchCreate: '브랜치 생성',
      tasksExecute: '태스크 실행',
      docsCommitSync: '문서 커밋(동기화)',
      prCreate: 'PR 생성',
      codeReview: '코드 리뷰',
      featureDone: 'Feature 완료',
    },
    messages: {
      specCreate:
        'spec.md 템플릿을 복사해 작성하세요. (features/feature-base/spec.md 참고)',
      specImprove: 'spec.md를 보완하고 상태를 Review로 변경하세요.',
      specApproval: 'spec.md 내용을 사용자에게 공유하고 승인(OK)을 받으세요.',
      planCreate:
        'plan.md 템플릿을 복사해 작성하세요. (features/feature-base/plan.md 참고)',
      planImprove: 'plan.md를 보완하고 상태를 Review로 변경하세요.',
      planApproval: 'plan.md 내용을 사용자에게 공유하고 승인(OK)을 받으세요.',
      tasksCreate:
        'tasks.md 템플릿을 복사해 태스크를 작성하세요. (features/feature-base/tasks.md 참고)',
      tasksNeedAtLeastOne: 'tasks.md에 최소 1개 이상의 태스크를 작성하세요.',
      docsCommitPlanning:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(planning): {folderName} 기획 문서"',
      issueCreateAndWrite:
        'GitHub Issue를 생성한 뒤, spec.md/tasks.md의 이슈 번호를 채우고 문서 커밋을 준비하세요. (skills/create-issue.md 참고)',
      docsCommitIssueUpdate:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(#{issueNumber}): {folderName} 문서 업데이트"',
      docsCommitUpdate:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs: {folderName} 문서 업데이트"',
      standaloneNeedsProjectRoot:
        'standalone 모드에서는 projectRoot 설정이 필요합니다. (npx lee-spec-kit config --project-root ...)',
      createBranch:
        'cd "{projectGitCwd}" && git checkout -b feat/{issueNumber}-{slug}',
      tasksAllDoneButNoChecklist:
        '모든 태스크가 DONE이지만 완료 조건 체크리스트 섹션을 찾지 못했습니다. tasks.md의 "완료 조건" 섹션을 추가/확인하세요.',
      tasksAllDoneButChecklist:
        '모든 태스크가 DONE이지만 완료 조건 체크리스트가 완전히 체크되지 않았습니다. ({checked}/{total})',
      finishDoingTask:
        '현재 DOING/REVIEW 중인 태스크를 완료하세요: "{title}" ({done}/{total}) (skills/execute-task.md 참고)',
      startNextTodoTask:
        '다음 TODO 태스크를 시작하세요: "{title}" ({done}/{total}) (skills/execute-task.md 참고)',
      checkTaskStatuses:
        '태스크 상태를 확인하세요. ({done}/{total}) (skills/execute-task.md 참고)',
      prLegacyAsk:
        'tasks.md에 PR/PR 상태 필드가 없습니다. 템플릿을 최신 포맷으로 업데이트할까요? (OK 필요)',
      prCreate:
        'PR을 생성하고 tasks.md에 PR 링크를 기록하세요. (skills/create-pr.md 참고)',
      prFillStatus:
        'tasks.md의 PR 상태를 Draft/Review/Approved 중 하나로 설정하세요. (merge 후 Approved로 업데이트)',
      prResolveReview:
        '리뷰 코멘트를 해결하고 PR 상태를 업데이트하세요. (PR 상태: Review → Approved)',
      prRequestReview:
        '리뷰어에게 리뷰를 요청하고 PR 상태를 Review로 업데이트하세요.',
      featureDone:
        'PR이 Approved이고 모든 태스크/완료 조건이 충족되었습니다. 이 Feature는 완료 상태입니다.',
      fallbackRerunContext:
        '상태를 판별할 수 없습니다. 문서를 확인한 뒤 다시 context를 실행하세요.',
    },
    warnings: {
      projectBranchUnavailable:
        '프로젝트 브랜치를 확인할 수 없습니다. (standalone 모드에서는 projectRoot가 필요합니다.)',
      docsGitUnavailable:
        'docs 레포의 git 상태를 확인할 수 없습니다. (레포 위치 / git init 확인)',
      docsUncommittedChanges: '문서 변경사항이 커밋되지 않았습니다. (추가 문서 커밋 필요)',
      legacyTasksPrFields:
        '구버전 tasks.md 포맷입니다. PR 단계 전에 `PR` 및 `PR 상태` 필드를 추가하세요.',
      workflowSpecNotApproved:
        '완료 상태이지만 spec.md 상태가 Approved가 아닙니다. (spec.md의 상태를 Approved로 업데이트하세요.)',
      workflowPlanNotApproved:
        '완료 상태이지만 plan.md 상태가 Approved가 아닙니다. (plan.md의 상태를 Approved로 업데이트하세요.)',
      workflowPrLinkMissing:
        '완료 상태이지만 PR 링크가 비어있습니다. (tasks.md의 PR 필드를 채우세요.)',
      workflowPrStatusMissing:
        '완료 상태이지만 PR 상태가 비어있습니다. (tasks.md의 PR 상태를 Draft/Review/Approved 중 하나로 설정하세요.)',
      workflowPrStatusNotApproved:
        '완료 상태이지만 PR 상태가 Approved가 아닙니다. (merge 후 PR 상태를 Approved로 업데이트하세요.)',
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
      'feature.baseNotFound': 'feature-base template not found.',
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
        'For fullstack projects, you must specify `--repo fe` or `--repo be`.',
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
      'doctor.issue.duplicateFeatureId': 'Duplicate Feature ID detected: {id} ({count})',
      'doctor.issue.missingFeatureId':
        'Feature folder name is not in F001-... format. (Cannot extract ID)',

      'context.noActiveFeatures': '⚠️  No active features found.',
      'context.envWarnings': '⚠️  Environment warnings:',
      'context.openFallbackSummary':
        '(Could not detect a feature from the branch, so showing only open features. In Progress: {inProgress} / Ready To Close: {readyToClose} / Done: {done})',
      'context.sectionInProgress': 'In Progress',
      'context.sectionReadyToClose': 'Ready To Close',
      'context.tipDetails': 'Tip: To view details for a feature:',
      'context.tipShowAll': 'Show all',
      'context.tipShowDone': 'Show done only',
      'context.okRequired': '[OK required] ',
      'context.list.docsCommitNeeded': 'Commit docs changes',
      'context.list.issueNumberNeeded': 'Fill issue number in docs',
      'context.list.addPrMetadata': 'Add PR metadata (PR/PR Status)',
      'context.list.recordPrLink': 'Record PR link',
      'context.list.setPrStatus': 'Set PR Status',
      'context.list.prStatusToApproved': 'PR Status {status} → Approved',
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
      'init.choice.projectType.fullstack.title': 'Fullstack - split FE/BE repos',
      'init.choice.projectType.fullstack.desc': 'Manage with features/be/ and features/fe/',
      'init.prompt.docsMode': 'Select docs mode:',
      'init.choice.docsRepo.embedded.title': 'embedded - inside the project (./docs)',
      'init.choice.docsRepo.embedded.desc': 'Pushed together with the project',
      'init.choice.docsRepo.standalone.title': 'standalone - separate docs repo',
      'init.choice.docsRepo.standalone.desc': 'Configure push settings separately',
      'init.prompt.feRepoPath': 'Enter frontend repository path:',
      'init.prompt.beRepoPath': 'Enter backend repository path:',
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
      'init.warn.commitManually': '    Review the changes and commit manually.',
      'init.log.gitRemoteSet': '✅ Git remote set: {remote}',
      'init.warn.gitRemoteExists': '⚠️  Git remote already exists.',
      'init.log.gitInitialCommitDone': '✅ Initial Git commit created!',
      'init.warn.skipGitInit': '⚠️  Skipping Git initialization (please commit manually)',
      'init.error.templateNotFound': 'Template not found: {path}',
    },
    steps: {
      featureFolder: 'Create feature folder',
      specWrite: 'Write spec.md',
      specApprove: 'Approve spec.md',
      planWrite: 'Write plan.md',
      planApprove: 'Approve plan.md',
      tasksWrite: 'Write tasks.md',
      docsInitialCommit: 'Initial docs commit',
      docsCommitPlanning: 'Commit docs (sync)',
      issueCreate: 'Create GitHub Issue',
      branchCreate: 'Create branch',
      tasksExecute: 'Execute tasks',
      docsCommitSync: 'Commit docs (sync)',
      prCreate: 'Create PR',
      codeReview: 'Code review',
      featureDone: 'Feature done',
    },
    messages: {
      specCreate:
        'Create spec.md by copying the template. (See features/feature-base/spec.md)',
      specImprove: 'Improve spec.md and change Status to Review.',
      specApproval: 'Share spec.md with the user and get approval (OK).',
      planCreate:
        'Create plan.md by copying the template. (See features/feature-base/plan.md)',
      planImprove: 'Improve plan.md and change Status to Review.',
      planApproval: 'Share plan.md with the user and get approval (OK).',
      tasksCreate:
        'Create tasks.md by copying the template. (See features/feature-base/tasks.md)',
      tasksNeedAtLeastOne: 'Write at least 1 task in tasks.md.',
      docsCommitPlanning:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(planning): {folderName} planning docs"',
      issueCreateAndWrite:
        'Create a GitHub Issue, fill the issue number in spec.md/tasks.md, then prepare a docs commit. (See skills/create-issue.md)',
      docsCommitIssueUpdate:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(#{issueNumber}): {folderName} docs update"',
      docsCommitUpdate:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs: {folderName} docs update"',
      standaloneNeedsProjectRoot:
        'Standalone mode requires projectRoot. (npx lee-spec-kit config --project-root ...)',
      createBranch:
        'cd "{projectGitCwd}" && git checkout -b feat/{issueNumber}-{slug}',
      tasksAllDoneButNoChecklist:
        'All tasks are DONE, but no completion checklist section was found. Add/verify the "Completion Criteria" section in tasks.md.',
      tasksAllDoneButChecklist:
        'All tasks are DONE, but the completion checklist is not fully checked. ({checked}/{total})',
      finishDoingTask:
        'Finish the current DOING/REVIEW task: "{title}" ({done}/{total}) (See skills/execute-task.md)',
      startNextTodoTask:
        'Start the next TODO task: "{title}" ({done}/{total}) (See skills/execute-task.md)',
      checkTaskStatuses:
        'Check task statuses. ({done}/{total}) (See skills/execute-task.md)',
      prLegacyAsk:
        'tasks.md is missing PR/PR Status fields. Update to the latest template format? (OK required)',
      prCreate: 'Create a PR and record the PR link in tasks.md. (See skills/create-pr.md)',
      prFillStatus:
        'Set PR Status in tasks.md to Draft/Review/Approved. (After merge, update it to Approved.)',
      prResolveReview:
        'Resolve review comments and update PR Status. (PR Status: Review → Approved)',
      prRequestReview: 'Request review and update PR Status to Review.',
      featureDone:
        'PR is Approved and all tasks/completion criteria are satisfied. This feature is done.',
      fallbackRerunContext:
        'Cannot determine status. Check the docs and run context again.',
    },
    warnings: {
      projectBranchUnavailable:
        'Cannot determine project branch. (In standalone mode, projectRoot is required.)',
      docsGitUnavailable:
        'Cannot read git status for the docs repo. (Check repo location / git init.)',
      docsUncommittedChanges:
        'Docs changes are not committed. (Additional docs commit needed.)',
      legacyTasksPrFields:
        'Legacy tasks.md format detected. Add `PR` and `PR Status` fields before PR steps.',
      workflowSpecNotApproved:
        'Implementation is done but spec.md Status is not Approved. (Update spec.md Status to Approved.)',
      workflowPlanNotApproved:
        'Implementation is done but plan.md Status is not Approved. (Update plan.md Status to Approved.)',
      workflowPrLinkMissing:
        'Implementation is done but PR link is missing. (Fill the PR field in tasks.md.)',
      workflowPrStatusMissing:
        'Implementation is done but PR Status is missing. (Set PR Status to Draft/Review/Approved in tasks.md.)',
      workflowPrStatusNotApproved:
        'Implementation is done but PR Status is not Approved. (After merge, update PR Status to Approved in tasks.md.)',
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

import { Lang } from './types.js';

type I18nCategory = 'steps' | 'messages' | 'warnings';

type I18nData = {
  steps: Record<string, string>;
  messages: Record<string, string>;
  warnings: Record<string, string>;
};

function formatTemplate(
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
    steps: {
      featureFolder: 'Feature 폴더 생성',
      specWrite: 'spec.md 작성',
      specApprove: 'spec.md 승인',
      planWrite: 'plan.md 작성',
      planApprove: 'plan.md 승인',
      tasksWrite: 'tasks.md 작성',
      docsCommitPlanning: '문서 커밋(동기화)',
      issueCreate: 'GitHub Issue 생성',
      branchCreate: '브랜치 생성',
      tasksExecute: '태스크 실행',
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
      prCreate: 'PR을 생성하고 tasks.md에 PR 링크를 기록하세요. (skills/create-pr.md 참고)',
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
      legacyTasksPrFields:
        '구버전 tasks.md 포맷입니다. PR 단계 전에 `PR` 및 `PR 상태` 필드를 추가하세요.',
      workflowSpecNotApproved:
        '완료 상태이지만 spec.md 상태가 Approved가 아닙니다. (spec.md의 상태를 Approved로 업데이트하세요.)',
      workflowPlanNotApproved:
        '완료 상태이지만 plan.md 상태가 Approved가 아닙니다. (plan.md의 상태를 Approved로 업데이트하세요.)',
      workflowPrLinkMissing:
        '완료 상태이지만 PR 링크가 없습니다. (tasks.md의 PR 필드를 채우세요.)',
      workflowPrStatusMissing:
        '완료 상태이지만 PR 상태가 없습니다. (tasks.md의 PR 상태를 Draft/Review/Approved 중 하나로 설정하세요.)',
      workflowPrStatusNotApproved:
        '완료 상태이지만 PR 상태가 Approved가 아닙니다. (merge 후 tasks.md의 PR 상태를 Approved로 업데이트하세요.)',
    },
  },
  en: {
    steps: {
      featureFolder: 'Create feature folder',
      specWrite: 'Write spec.md',
      specApprove: 'Approve spec.md',
      planWrite: 'Write plan.md',
      planApprove: 'Approve plan.md',
      tasksWrite: 'Write tasks.md',
      docsCommitPlanning: 'Commit docs (sync)',
      issueCreate: 'Create GitHub Issue',
      branchCreate: 'Create branch',
      tasksExecute: 'Execute tasks',
      prCreate: 'Create PR',
      codeReview: 'Code review',
      featureDone: 'Feature done',
    },
    messages: {
      specCreate:
        'Copy the spec.md template and write it. (See features/feature-base/spec.md)',
      specImprove: 'Improve spec.md and set Status to Review.',
      specApproval: 'Share spec.md with the user and get approval (OK).',
      planCreate:
        'Copy the plan.md template and write it. (See features/feature-base/plan.md)',
      planImprove: 'Improve plan.md and set Status to Review.',
      planApproval: 'Share plan.md with the user and get approval (OK).',
      tasksCreate:
        'Copy the tasks.md template and write tasks. (See features/feature-base/tasks.md)',
      tasksNeedAtLeastOne: 'Add at least one task to tasks.md.',
      docsCommitPlanning:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(planning): {folderName} planning docs"',
      issueCreateAndWrite:
        'Create a GitHub Issue, then fill in the issue number in spec.md/tasks.md and prepare to commit docs. (See skills/create-issue.md)',
      docsCommitIssueUpdate:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(#{issueNumber}): {folderName} docs update"',
      standaloneNeedsProjectRoot:
        'In standalone mode, projectRoot is required. (npx lee-spec-kit config --project-root ...)',
      createBranch:
        'cd "{projectGitCwd}" && git checkout -b feat/{issueNumber}-{slug}',
      tasksAllDoneButNoChecklist:
        'All tasks are DONE but no completion checklist section was found. Add/verify the "Completion Criteria" section in tasks.md.',
      tasksAllDoneButChecklist:
        'All tasks are DONE but the completion checklist is not fully checked. ({checked}/{total})',
      finishDoingTask:
        'Finish the active DOING/REVIEW task: "{title}" ({done}/{total}) (See skills/execute-task.md)',
      startNextTodoTask:
        'Start the next TODO task: "{title}" ({done}/{total}) (See skills/execute-task.md)',
      checkTaskStatuses:
        'Check task statuses. ({done}/{total}) (See skills/execute-task.md)',
      prLegacyAsk:
        'Legacy tasks.md format detected (missing PR/PR Status fields). Update to the latest format? (OK required)',
      prCreate:
        'Create a PR and record the PR link in tasks.md. (See skills/create-pr.md)',
      prFillStatus:
        'Set PR Status in tasks.md to Draft/Review/Approved. (After merge, update to Approved)',
      prResolveReview:
        'Resolve review comments and update PR status. (PR Status: Review → Approved)',
      prRequestReview:
        'Request reviews and update PR status to Review.',
      featureDone:
        'PR is Approved and all tasks/completion criteria are satisfied. This feature is done.',
      fallbackRerunContext:
        'Unable to determine current state. Verify docs and run context again.',
    },
    warnings: {
      projectBranchUnavailable:
        'Cannot determine project branch. (In standalone mode, projectRoot is required.)',
      docsGitUnavailable:
        'Cannot read git status for the docs repo. (Check repo location / git init.)',
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
  const template =
    I18N[lang][category][key] ?? I18N.ko[category][key] ?? `${category}.${key}`;
  return formatTemplate(template, vars);
}

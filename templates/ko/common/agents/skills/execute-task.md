# 태스크 실행 프로세스: Docs-first

활성 feature 폴더를 실행 SSOT로 사용하세요.

---

## 1. 현재 태스크 선택

- 코드를 건드리기 전에 `npx lee-spec-kit workflow-stage <feature-ref> --json`를 실행합니다.
- 반환값이 `stage === "implementation"`이고 `implementationAllowed === true`일 때만 구현을 계속합니다.
- 먼저 활성 feature를 정합니다.
- `tasks.md`에서:
  - 이미 `[DOING]`인 태스크가 하나 있으면 그것을 이어서 수행하고
  - 없으면 가장 우선순위가 높은 `[TODO]` 태스크를 `[DOING]`으로 바꿉니다
- 한 번에 하나의 태스크만 진행합니다.
- `nextAction.executor === "subagent"`이면 반환된 `workingDirectory`에서 해당 태스크의 구현과 태스크 범위 검증을 fresh 서브에이전트에게 반환된 `model`, `reasoningEffort`, `onUnavailable` 설정과 정확한 `workerContract`로 위임합니다. 지정 모델을 사용할 수 없을 때 `inherit`은 현재 모델을 상속해 다시 위임하고, `error`는 중단 후 실패를 보고한다는 뜻입니다.
- 구현 worker는 할당된 태스크를 직접 실행합니다. `workflow-stage` 재호출, 재위임, lee-spec-kit 문서 수정, 태스크 상태 변경, 커밋, 승인 요청, 원격/파괴적 작업은 하지 않습니다. 프로젝트 코드 수정과 태스크 범위 검사만 수행합니다.
- 명시적 ID가 없는 레거시 태스크는 `workflow-stage`가 안정적인 synthetic `taskId`를 반환합니다. ID 추가만을 위해 레거시 태스크 문서를 다시 쓰지 말고 반환된 ID를 사용합니다.

## 2. 실행과 기록

- `tasks.md`를 현실과 맞게 유지합니다:
  - 실제 완료/검증 없이 `[DONE]`로 바꾸지 않습니다
  - `workflow.agentReview.task.enabled=true`이면 구현/검증 완료 후 `[DONE]` 대신 `[REVIEW]`로 바꾸고 checkpoint commit을 만든 뒤 독립 리뷰를 진행합니다
  - task review가 현재 SHA/tree를 `approve`한 뒤에만 `[REVIEW]`를 `[DONE]`으로 바꿉니다
  - 태스크를 닫을 때는 같은 수정에서 `Acceptance`와 `Checklist`도 함께 갱신합니다
  - 완료된 태스크에 후속 작업이 생기면 히스토리를 고치지 말고 새 태스크를 추가합니다
- 새 태스크를 추가해야 한다면 `tasks.md`에 구체적인 제목, `Acceptance`, `Checklist`, 그리고 `NON-PRD` 또는 기존 `PRD-*` 태그가 있는 완전한 태스크 블록을 추가하세요.
- 새 태스크에 placeholder `Acceptance` 또는 `Checklist`를 남기지 않습니다.

## 3. 문서 동기화

- `spec.md`: 사용자-visible scope 또는 acceptance criteria가 바뀌면 갱신합니다
- `plan.md`: 아키텍처, 파일 구조, 테스트 전략이 바뀌면 갱신합니다
- `decisions.md`: 비자명한 결정, 트레이드오프, 호환성 처리, 사용자 요청으로 바뀐 동작을 기록합니다
- `대기 중 변경 요청`이 있으면 먼저 `tasks.md`에 반영하고, 관련 문서를 맞춘 뒤 필드를 비우고 구현을 이어갑니다

## 4. 커밋과 종료 가드레일

- docs 경로 검사가 중요하면 `git commit` 전에 `npx lee-spec-kit commit-audit --json`를 사용합니다.
- 문서/프로젝트 커밋과 태스크 checkpoint는 구현 서브에이전트가 아니라 메인 에이전트가 소유합니다.
- 코드나 feature 문서를 바꿨다면 종료 전에 `npx lee-spec-kit workflow-audit --json`로 동기화 상태를 확인합니다.
- `tasks.md` 테스트 로그는 명령어당 1개 행만 유지하고, 재실행 시 기존 행을 갱신합니다.

## 5. 승인 경계

- 사용자 승인은 문서화된 review checkpoint와 원격/파괴적 작업 전에만 요청합니다.
- issue 생성, PR 생성, push, merge 같은 원격 작업 전에는 올릴 artifact나 계획을 먼저 공유합니다.
- task/Feature review는 `workflow-stage`가 반환한 모델·추론도 설정의 fresh 읽기 전용 서브에이전트에게 맡기고, 문서 갱신, finding 반영, 승인 처리, 원격 작업은 메인 세션에서 유지합니다.

## 절대 규칙

1. 필요한 문서 업데이트를 건너뛰지 않습니다.
2. `[DONE]` 태스크를 다시 쓰지 않습니다.
3. unmanaged docs 산출물은 정규화하거나 allowlist하기 전까지 active workflow 상태로 취급하지 않습니다.
4. issue 생성, branch 생성, 그 이전 단계가 막혀 있으면 구현을 시작하지 않습니다.

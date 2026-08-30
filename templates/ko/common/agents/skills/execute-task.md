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
- 위임한 뒤 메인 에이전트는 worker의 종결 상태를 기다립니다. worker가 실행 중이면 가급적 긴 bounded wait를 반복하며, 한 번의 대기가 새 소식 없이 끝난 것, 상태 메시지가 없는 것, 파일 변경이 없는 것은 실패나 정체의 증거가 아닙니다.
- 조용하거나 파일을 변경하지 않았다는 이유만으로 실행 중인 worker를 중단·교체·포기하지 않습니다. 사용자의 명시적 중단 요청, 종결 실패·취소, 또는 복구 불가능한 런타임 상태가 있을 때만 중단합니다.
- 구현 worker는 승인된 `plan.md` Verification Contract를 따릅니다. `NONE`이면 영구 테스트를 추가하지 않고, `UPDATE`이면 계약을 소유한 기존 테스트만 최소 수정하며, `ADD`이면 계약에 연결된 테스트만 추가합니다. 승인된 결정이 충분하지 않다면 테스트 범위를 임의로 넓히지 말고 메인 에이전트에 보고합니다.
- 명시적 ID가 없는 레거시 태스크는 `workflow-stage`가 안정적인 synthetic `taskId`를 반환합니다. ID 추가만을 위해 레거시 태스크 문서를 다시 쓰지 말고 반환된 ID를 사용합니다.

## 2. 실행과 기록

- `tasks.md`를 현실과 맞게 유지합니다:
  - 실제 완료/검증 없이 `[DONE]`로 바꾸지 않습니다
  - `workflow.agentReview.task.enabled=true`이면 구현/검증 완료 후 `[DONE]` 대신 `[REVIEW]`로 바꾸고 checkpoint commit을 만든 뒤 독립 리뷰를 진행합니다
  - 반환된 `reviewRound`를 기록하고, task review가 현재 SHA/tree를 `approve`하거나 아래의 한도 소진 `changes_requested` 경로가 자동 완료된 뒤 `[REVIEW]`를 `[DONE]`으로 바꿉니다
  - `workflow.agentReview.maxRounds`는 fresh task 리뷰의 최대 실행 횟수입니다. 마지막 허용 Round가 `changes_requested`이면 지적을 한 번 반영하고 남은 finding과 그 결과의 target 변경을 잔여 위험으로 보존한 뒤, 추가 리뷰나 사용자 리뷰 승인 토큰 없이 task를 DONE으로 전환합니다. `maxRounds=1`이면 Round 2는 없습니다. `blocked`는 자동 완료하지 않습니다
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
- Plan/task/Feature review는 `workflow-stage`가 반환한 모델·추론도와 정확한 hash/SHA/tree target 설정의 fresh 읽기 전용 서브에이전트에게 맡기고, 문서 갱신, finding 반영, 승인 처리, 원격 작업은 메인 세션에서 유지합니다.

## 절대 규칙

1. 필요한 문서 업데이트를 건너뛰지 않습니다.
2. `[DONE]` 태스크를 다시 쓰지 않습니다.
3. unmanaged docs 산출물은 정규화하거나 allowlist하기 전까지 active workflow 상태로 취급하지 않습니다.
4. issue 생성, branch 생성, 그 이전 단계가 막혀 있으면 구현을 시작하지 않습니다.

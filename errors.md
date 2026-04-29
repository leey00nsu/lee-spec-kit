# Error Codes

`lee-spec-kit`는 자동화/오케스트레이션 환경에서 안정적으로 분기할 수 있도록 표준 오류 코드를 제공합니다.

## 1) 공통 CLI 오류 코드 (`CliReasonCode`)

아래 코드는 현재 유지되는 주요 명령(`init`, `idea`, `feature`, `task`, `decision`, `config`, `update`, `docs`, `detect`, `github`, `workflow-stage`, `workflow-audit`, `commit-audit`, `integrations`)에서 공통으로 사용됩니다.

| 코드 | 의미 | 대표 발생 상황 |
| --- | --- | --- |
| `PROMPT_BLOCKED` | 비대화형 모드에서 입력이 필요함 | `--non-interactive`인데 필수 옵션 누락 |
| `CONFIG_NOT_FOUND` | 설정 파일을 찾지 못함 | `.lee-spec-kit.json` 미존재 |
| `DOCS_NOT_FOUND` | docs 구조를 찾지 못함 | `init` 전 docs 의존 명령 실행 |
| `LOCK_WAIT_TIMEOUT` | 락 해제 대기 시간 초과 | 다른 프로세스 락 장기 점유 |
| `LOCK_ACQUIRE_TIMEOUT` | 락 획득 시간 초과 | 동시 실행 경쟁이 장시간 지속 |
| `PRECONDITION_FAILED` | 실행 전 조건 미충족 | GitHub issue/PR 생성 전 문서 상태가 준비되지 않음 |
| `INVALID_ARGUMENT` | 인자/입력값이 유효하지 않음 | 잘못된 옵션 조합 또는 알 수 없는 문서 ID |
| `APPROVAL_REQUIRED` | 원격/승인 필요 작업에 확인값 누락 | `github issue --create`, `github pr --create` 계열에서 확인 토큰 누락 |
| `CONTEXT_SELECTION_REQUIRED` | 단일 Feature 선택이 필요함 | Feature 후보가 없거나 다수인데 selector가 없음 |
| `EXECUTION_FAILED` | 외부 명령 실행 실패 | `git`/`gh` 실행 실패 |
| `VALIDATION_FAILED` | 문서 또는 입력 검증 실패 | 필수 필드/형식 불일치 |
| `UNKNOWN_ERROR` | 분류되지 않은 예외 | 미분류 런타임 에러 |

## 2) 주요 JSON reasonCode

### `detect --json`

| 코드 | 설명 |
| --- | --- |
| `PROJECT_DETECTED` | 현재 workspace가 lee-spec-kit 프로젝트로 감지됨 |
| `PROJECT_NOT_DETECTED` | 현재 workspace에서 lee-spec-kit 설정/문서 구조를 찾지 못함 |

### `docs list/get --json`

| 코드 | 설명 |
| --- | --- |
| `DOCS_LISTED` | 조회 가능한 built-in docs 목록 반환 |
| `DOC_FETCHED` | 요청한 built-in doc 반환 |
| `INVALID_ARGUMENT` | 알 수 없는 doc id 또는 잘못된 인자 |

### `workflow-stage --json`

| 코드 | 설명 |
| --- | --- |
| `WORKFLOW_STAGE_RESOLVED` | 활성 Feature의 현재 단계와 다음 허용 액션을 계산함 |
| `CONFIG_NOT_FOUND` | 설정 파일을 찾지 못함 |
| `NO_FEATURES` | Feature가 없음 |
| `FEATURE_SELECTION_REQUIRED` | 활성 Feature를 하나로 선택해야 함 |

`workflow-stage --json`은 단계 차단 사유를 `blockedReasonCode`로 함께 제공합니다. 대표 값은 `SPEC_NOT_APPROVED`, `PLAN_NOT_APPROVED`, `TASKS_NOT_READY`, `ISSUE_NOT_CREATED`, `BRANCH_NOT_READY`, `TASK_COMMIT_REQUIRED`, `IMPLEMENTATION_APPROVAL_REQUIRED`, `PRE_PR_REVIEW_NOT_APPROVED`, `PR_NOT_CREATED`, `PR_REVIEW_NOT_APPROVED`, `POST_MERGE_CLEANUP_REQUIRED`입니다.

### `workflow-audit --json`

| 코드 | 설명 |
| --- | --- |
| `WORKFLOW_IN_SYNC` | 코드 변경과 Feature 문서 sync marker가 최신 상태 |
| `CODE_WITHOUT_DOCS_SYNC` | 코드 변경 이후 Feature 문서 sync marker가 갱신되지 않음 |
| `ACTIVE_FEATURE_SCOPE_UNCLEAR` | 변경을 연결할 활성 Feature를 판단할 수 없음 |
| `NO_GIT_REPOSITORY` | Git 저장소가 아님 |
| `CONFIG_NOT_FOUND` | 설정 파일을 찾지 못함 |
| `UNEXPECTED_ERROR` | 예상하지 못한 검사 실패 |

### `commit-audit --json`

| 코드 | 설명 |
| --- | --- |
| `COMMIT_ALLOWED` | staged docs 경로가 정책을 통과함 |
| `UNMANAGED_DOCS_COMMIT` | canonical docs surface 밖의 top-level docs 엔트리가 staged됨 |
| `NON_CANONICAL_FEATURE_DOC_COMMIT` | feature-local 표준 파일이 아닌 문서가 staged됨 |
| `CANONICAL_FEATURE_DOC_DELETION` | canonical feature 문서 삭제가 staged됨 |
| `DOCS_COMMIT_POLICY_VIOLATION` | docs commit 경로 정책 위반 |
| `COMMIT_MESSAGE_POLICY_VIOLATION` | commit message 정책 위반 |
| `UNSUPPORTED_GIT_TARGET` | 검사 대상 Git 저장소를 해석할 수 없음 |
| `NO_GIT_REPOSITORY` | Git 저장소가 아님 |
| `CONFIG_NOT_FOUND` | 설정 파일을 찾지 못함 |
| `UNEXPECTED_ERROR` | 예상하지 못한 검사 실패 |

## 3) 출력 형식

- JSON 모드:
  - 오류: `{ "status": "error", "reasonCode": "...", "error": "...", "suggestions": [{ "label": "A", ... }] }`
  - 상태: `{ "status": "...", "reasonCode": "...", ... }`
- 텍스트 모드:
  - `[REASON_CODE]` 접두 형태 또는 `<status>: <reasonCode>` 형태로 출력
  - 다음 동작 제안은 `suggestions` 또는 `actionOptions`에 포함됩니다.

## 4) 자동화 권장 패턴

1. 먼저 `reasonCode`와 `blockedReasonCode`로 분기하고, `error` 문자열은 보조 진단에만 사용합니다.
2. 프로젝트 여부는 항상 `npx lee-spec-kit detect --json` 결과의 `isLeeSpecKitProject`로 판단합니다.
3. 다음 workflow 단계는 `npx lee-spec-kit workflow-stage <feature-ref> --json`의 `nextAction`만 따릅니다.
4. `LOCK_*_TIMEOUT`는 지수 백오프로 재시도합니다.

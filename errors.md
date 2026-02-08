# Error Codes

`lee-spec-kit`는 자동화/오케스트레이션 환경에서 안정적으로 분기할 수 있도록 표준 오류 코드를 제공합니다.

## 1) 공통 명령 오류 코드 (`CliReasonCode`)

아래 코드는 주요 명령(`init`, `feature`, `config`, `update`, `context`, `doctor`, `status`)에서 공통으로 사용됩니다.

| 코드 | 의미 | 대표 발생 상황 |
| --- | --- | --- |
| `PROMPT_BLOCKED` | 비대화형 모드에서 입력이 필요함 | `--non-interactive`인데 필수 옵션 누락 |
| `CONFIG_NOT_FOUND` | 설정 파일을 찾지 못함 | `.lee-spec-kit.json` 미존재 |
| `DOCS_NOT_FOUND` | docs 구조를 찾지 못함 | `init` 전 `feature` 실행 |
| `LOCK_WAIT_TIMEOUT` | 락 해제 대기 시간 초과 | 다른 프로세스 락 장기 점유 |
| `LOCK_ACQUIRE_TIMEOUT` | 락 획득 시간 초과 | 동시 실행 경쟁이 장시간 지속 |
| `INVALID_ARGUMENT` | 인자/입력값이 유효하지 않음 | 잘못된 옵션 조합 |
| `DUPLICATE_FEATURE_ID` | Feature ID 중복 감지 | `status --strict`에서 중복 ID 발견 |
| `MISSING_FEATURE_ID` | Feature ID 누락 감지 | `status --strict`에서 `F###-...` 형식 누락 |
| `INVALID_APPROVAL` | 승인 응답 형식/라벨이 유효하지 않음 | `--approve` 값이 `<LABEL>`/`<LABEL> OK` 규칙 불일치 |
| `APPROVAL_REQUIRED` | 승인 값이 필수인데 누락됨 | `--execute`만 사용 |
| `CONTEXT_SELECTION_REQUIRED` | 단일 Feature 선택이 필요함 | 승인 실행 시 대상 Feature 다중/없음 |
| `NO_ACTION_OPTIONS` | 승인 가능한 액션이 없음 | 현재 단계에 액션 미존재 |
| `CONTEXT_STALE` | 승인 시점 이후 컨텍스트 변경 | 라벨 승인 후 상태 변동 |
| `ACTION_NOT_AVAILABLE` | 승인 라벨 액션이 더 이상 유효하지 않음 | 액션 목록 변경 |
| `EXECUTION_FAILED` | 승인된 command 실행 실패 | shell 명령 자체 실패 |
| `UNKNOWN_ERROR` | 분류되지 않은 예외 | 미분류 런타임 에러 |

## 2) `context --json` 상태/이유 코드

`context --json`은 `status`와 함께 `reasonCode`를 제공합니다.

| 코드 | 설명 |
| --- | --- |
| `NO_FEATURES` | Feature가 없음 |
| `NO_OPEN_FEATURES` | 미완료 Feature가 없음 |
| `SINGLE_MATCHED` | 단일 Feature가 선택됨 |
| `MULTIPLE_ACTIVE_FEATURES` | 활성 Feature가 다수라 선택 필요 |
| `NO_MATCHED_FEATURES` | 조건에 맞는 Feature가 없음 |

### 승인 관련(`--approve`) 성공 응답 reasonCode

| 코드 | 설명 |
| --- | --- |
| `APPROVED_SELECTED` | 승인 라벨 선택 완료(실행 전) |
| `INSTRUCTION_ONLY` | 승인 라벨이 instruction-only 액션 |
| `APPROVED_EXECUTED` | 승인 라벨 command 실행 완료 |

## 3) 출력 형식

- JSON 모드:
  - 오류: `{ "status": "error", "reasonCode": "...", "error": "...", "suggestions": [{ "label": "A", ... }] }`
  - 상태: `{ "status": "...", "reasonCode": "...", ... }`
- 텍스트 모드:
  - `[REASON_CODE]` 접두 형태로 출력
  - 다음 동작 제안: `👉 Next Options (Error)` + `A/B/C` 라벨 목록

## 4) 자동화 권장 패턴

1. 먼저 `reasonCode`로 분기하고, `error` 문자열은 보조 진단에 사용
2. `CONTEXT_STALE`, `ACTION_NOT_AVAILABLE`는 `context` 재조회 후 재시도
3. `LOCK_*_TIMEOUT`는 지수 백오프로 재시도

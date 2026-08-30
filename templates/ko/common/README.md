# {{projectName}} 문서 구조 가이드

에이전트가 프로젝트 전반을 빠르게 파악할 수 있도록 문서를 기능별로 분리해 두었습니다.

## 에이전트 세션 시작 체크리스트

```bash
# 1) 프로젝트 감지
npx lee-spec-kit detect --json

# 2) 감지 성공 시 워크플로우 정책 조회
npx lee-spec-kit docs get agents --json
```

- `isLeeSpecKitProject: true`일 때만 lee-spec-kit 워크플로우를 적용합니다.
- 기본 실행 경로는 workspace-scoped `AGENTS.md`, Codex 공식 hooks, 그리고 활성 feature 문서입니다.
- 활성 feature를 정한 뒤에는 `spec.md`, `plan.md`, `tasks.md`, `decisions.md`를 작업 SSOT로 사용합니다.
- 사용자 승인 요청은 문서화된 workflow checkpoint와 원격/파괴적 작업 전에만 합니다.
- `git commit` 전에 `npx lee-spec-kit commit-audit --json`를 사용해 staged docs 경로와 canonical Feature-scoped commit 형식을 검증합니다.
- 코드나 feature 문서를 바꿨다면 종료 전 `npx lee-spec-kit workflow-audit --json`로 동기화 상태를 확인합니다.
- `isLeeSpecKitProject: false`면 lee-spec-kit 전용 절차를 건너뛰고 일반 워크플로우로 진행합니다.

## 신규 프로젝트 시작 순서

- 코드 프로젝트 스캐폴딩(예: Next.js/NestJS) 후 `lee-spec-kit init`을 실행하세요.
- 그 다음 `docs/prd/`에 상위 요구사항을 정리하고, `idea`/`feature`로 작업 단위를 구체화하세요.
- 이후 `detect --json`으로 감지 결과를 확인하고, `docs get agents --json`과 활성 feature 문서 기준으로 진행하세요.
- 대부분의 경우(기본값: embedded) 위 순서만 따르면 됩니다.
- docs를 코드 저장소와 분리해 운영할 때만 standalone을 선택하세요. 이때는 상위 워크스페이스 폴더(예: `workspace/docs`, `workspace/project`)에서 `init`을 실행해 docs/project 경로를 함께 지정하는 방식을 권장합니다. (예: `npx lee-spec-kit init --docs-repo standalone --dir ./docs --project-root ./project`)

## 상위 구조 요약

| 경로              | 목적               | 핵심 문서/역할                                                                                           |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| `docs/agents/`    | 에이전트 운영 규칙 | `custom.md`, `constitution.md` (엔진 종속 가이드는 `npx lee-spec-kit docs get <doc-id> --json`으로 조회) |
| `docs/prd/`       | 제품 요구사항      | 프로젝트별 작성                                                                                          |
| `docs/designs/`   | 디자인 참고 자료   | `README.md` (링크/가이드/레퍼런스)                                                                       |
| `docs/ideas/`     | 아이디어/To-do     | `README.md` (Idea → Feature 승격 규칙)                                                                   |
| `{{featurePath}}` | 기능별 문서        | `{feature-id}/spec.md`, `plan.md`, `tasks.md`, `decisions.md`                                            |

---

## 문서 라우팅

| 문서 내용                                    | 위치                          |
| -------------------------------------------- | ----------------------------- |
| 제품 요구사항·사용자 스토리·제품 로드맵      | `docs/prd/`                   |
| 여러 Feature가 공유하는 시스템 아키텍처 개요 | `docs/prd/*-overview.md`      |
| 변경하기 어려운 아키텍처 원칙                | `docs/agents/constitution.md` |
| Feature 승격 전 기술 조사·후보 비교          | 해당 `docs/ideas/I###-*.md`   |
| 활성 Feature의 구현 설계                     | 해당 Feature의 `plan.md`      |
| 기술 선택·대안·트레이드오프                  | 해당 Feature의 `decisions.md` |
| 화면, Figma, 디자인 시스템, UI 플로우        | `docs/designs/`               |

제품 로드맵은 `prd/`에 두지만 구현 순서와 작업 계획은 활성 Feature의 `plan.md`와 `tasks.md`에서 관리합니다. `designs/`는 UX와 시각 디자인 전용이며 기술 설계 문서를 두지 않습니다.

---

## SSOT 관계 (PRD / Ideas / Features)

문서 간 관계가 모호해지지 않도록, 아래를 “SSOT(단일 기준)”로 사용합니다.

권장 흐름:

1. `docs/prd/`: 상위 요구사항 정의
2. `docs/ideas/`: PRD에서 나온 후보/실험 정리
3. `docs/features/`: 승인된 작업을 실행 가능한 feature 단위로 전환

- **PRD (`docs/prd/`)**: 요구사항 SSOT
  - 이 공간은 `init`이 만들어 주며, 별도 생성 명령 없이 여기에서 직접 PRD를 관리합니다.
  - 요구사항마다 안정적인 `PRD-*` ID를 부여합니다: `PRD-FR-001`, `PRD-US-002`, `PRD-NFR-003` 같은 numeric ID 또는 `PRD-SCOPE-V1-DESKTOP-EDITOR` 같은 semantic key
  - ID는 안정적으로 유지합니다. (삭제 대신 `Deprecated` 표기 권장, 재번호 부여 금지)
  - PRD ID는 PRD 원문에 먼저 정의합니다. Feature 문서에서 임의 생성하지 않습니다.
- **Ideas (`docs/ideas/`)**: Feature 전 단계 SSOT (가설/실험/후보)
  - 가능하면 PRD에서 출발한 후보라는 점이 보이도록 `PRD Refs`를 유지합니다.
  - Idea 문서 상단에 `PRD Refs:`를 기록합니다. (예: `PRD-FR-001, PRD-US-002` 또는 `PRD-SCOPE-V1-DESKTOP-EDITOR`)
  - Feature로 승격되면 SSOT는 `docs/features/`로 이동하고, Idea는 archive로 정리합니다.
- **Features (`docs/features/`)**: 구현 범위/진행 SSOT
  - Feature는 PRD와 idea를 바탕으로 실제 구현을 진행하는 실행 단위입니다.
  - `spec.md`: 범위 정의 + `PRD Refs`(기능이 커버하는 PRD ID 목록)
  - `tasks.md`: 태스크 단위로 PRD ID를 태그(`[PRD-FR-001]`, `[PRD-SCOPE-V1-DESKTOP-EDITOR]`)로 매핑하거나, PRD 무관 태스크는 `[NON-PRD]`로 표시
    - `[NON-PRD]`는 refactor, rename, tooling, 테스트, cleanup 같은 내부 작업에만 사용합니다.
    - 태스크가 사용자 동작, acceptance criteria, 기능 범위를 바꾸게 되면 `[NON-PRD]`로 끝내지 말고 PRD를 backfill한 뒤 `[PRD-...]`로 연결합니다.
  - 레거시 문서에 PRD ID가 없다면, 먼저 원문 요구사항 문서에 ID를 backfill한 뒤 Feature 문서를 연결합니다.
  - `decisions.md`: 변경/트레이드오프/요구사항 변경(왜 바뀌었는지) 기록 + Evidence 링크
- **Canonical docs surface (`docs/`)**: lee-spec-kit가 관리하는 top-level 엔트리만 허용
  - 기본 디렉터리: `agents/`, `designs/`, `features/`, `ideas/`, `prd/`, `scripts/`
  - 기본 파일: `AGENTS.md`, `README.md`, `.lee-spec-kit.json`, `.gitignore`
  - 의도적으로 다른 top-level 엔트리를 유지해야 하면 `.lee-spec-kit.json`의 `allowedDocsEntries`에 명시합니다
- **Unmanaged docs 엔트리**: canonical surface 밖의 모든 `docs/` 최상위 엔트리
  - 예: `docs/plans/`, `docs/superpowers/`, 또는 다른 스킬이 만든 폴더
  - 이 문서들은 활성 워크플로우 SSOT가 아니라 staging/reference 입력으로만 취급합니다
  - commit 전에 정규화하거나 allowlist에 넣어야 하며, `commit-audit`는 staged된 비정규 docs 경로를 차단합니다
  - 아래처럼 feature-local 문서로 정규화하세요:
    - design/spec 산출물 → `spec.md`, `plan.md`, `decisions.md`
    - implementation plan 산출물 → `plan.md`, `tasks.md`

## 변경 프로토콜 (중간에 요구사항/기능이 추가·변경될 때)

요구사항/범위가 변하면, “무엇을 고쳐야 하는지”가 문서로 남아야 합니다. 최소 아래를 지킵니다.

1. **PRD 변경** (요구사항 추가/수정/폐기):
   - `docs/prd/*.md`: 해당 ID 추가/수정/Deprecated 표기
2. **Idea 단계라면**:
   - `docs/ideas/*.md`: `PRD Refs` 및 범위(포함/제외) 갱신
3. **Feature 단계라면**:
   - 시작은 `[NON-PRD]`였더라도, 진행 중 사용자 요구/동작/범위 변경으로 바뀌었다면 PRD 기반 작업으로 승격합니다:
     1. `docs/prd/*.md` backfill/수정
     2. `spec.md`의 `PRD Refs` 갱신
     3. 해당 태스크를 `[PRD-...]`로 재태깅 (필요하면 대체 태스크 추가)
   - `docs/plans/*`, `docs/superpowers/*`, 또는 다른 스킬이 만든 unmanaged docs가 있으면, 활성 워크플로우에 넣기 전에 먼저 Feature 문서로 흡수합니다.
   - `docs/features/.../spec.md`: `PRD Refs` 갱신 + 스코프 변경 요약 반영
   - `docs/features/.../tasks.md`: 변경을 반영하는 새 태스크 추가 + 각 태스크에 `[PRD-...]` 또는 `[NON-PRD]` 태그 부여
   - `docs/features/.../plan.md`: 아키텍처/테스트 전략이 바뀌면 함께 갱신
   - `docs/features/.../decisions.md`: 변경 사유/결정/영향 범위 + Evidence(커밋/PR/테스트) 기록

## CLI 설정 파일 (`.lee-spec-kit.json`)

`lee-spec-kit init`을 실행하면 문서 루트(기본: `docs/`)에 `.lee-spec-kit.json`이 생성됩니다.
대화형 init에서는 권장 설정을 그대로 쓰거나 Task 구현 위임, Plan/Task/Feature 검수,
Local 통합 방식을 직접 선택할 수 있습니다. 비대화형 실행에서는 `--task-agent`,
`--reviews`, `--max-review-rounds`, `--completion-strategy`로 같은 값을 지정합니다.
기존 프로젝트도 `lee-spec-kit config --interactive` 또는 같은 config 플래그로
이 설정을 변경할 수 있습니다.

- `lee-spec-kit feature`, `config`, `update`, `detect`, workflow validator에서 문서 위치/프로젝트 타입/언어를 해석하는 용도로 사용됩니다.
- `docsRepo`, `pushDocs`, `docsRemote`는 CLI 관리 **Docs Push 정책**을 위한 메타데이터입니다. (자동 push는 하지 않습니다)

### 필드

- `projectName` (string): 프로젝트 이름
- `projectType` ("single" | "multi"): 프로젝트 타입
- `lang` ("ko" | "en"): 문서 언어
- `createdAt` (string, YYYY-MM-DD): 생성 날짜
- `docsRepo` ("embedded" | "standalone"): Docs 관리 방식
- `pushDocs` (boolean, optional): `docsRepo: "standalone"`일 때만 생성 (원격 push 여부)
- `docsRemote` (string, optional): `pushDocs: true`일 때만 생성 (원격 레포 URL)
- `workflow.agentExecution.task` (object): 태스크 구현 위임 설정
  - `enabled`: 각 `task_execute`를 서브에이전트에게 위임할지 여부. 새 프로젝트의 기본값은 `true`이며, 이 설정이 생기기 전 프로젝트는 명시적으로 켜기 전까지 꺼진 상태를 유지
  - `type`: 현재 `"subagent"`만 지원
  - `model`: `"inherit"` 또는 런타임이 지원하는 모델명
  - `reasoningEffort`: `low | medium | high | xhigh | max | ultra`
  - `onUnavailable`: 지정 모델을 사용할 수 없을 때 `inherit | error`
  - `workflow-stage`는 안정적인 태스크 ID, 작업/docs 경로, machine-readable `workerContract`를 반환합니다. worker는 `workflow-stage` 재호출이나 재위임 없이 직접 실행합니다.
  - 구현 서브에이전트는 프로젝트 코드와 태스크 범위 검사를 담당하고, 메인 에이전트는 문서, 태스크 상태, 커밋, 승인, 원격 작업을 유지합니다. 공식 hook은 `task_execute` 중 커밋을 거부합니다.
- `workflow.agentAutomationConfigured` (boolean): `init` 또는 `config`에서 에이전트 자동화 정책을 명시적으로 선택했음을 기록해, 구버전 기본값 복구가 해당 선택을 덮어쓰지 않게 함
- `workflow.agentReview.maxRounds` (양의 정수): Plan/태스크/Feature 게이트에 공통 적용되는 fresh 리뷰 최대 실행 횟수. 마지막 허용 `changes_requested` 리뷰의 지적은 한 번 반영하고, 남은 finding과 그 결과의 target 변경을 잔여 위험으로 보존한 뒤 추가 리뷰 없이 게이트를 자동 완료합니다. 기본값은 `1`이며 Round 2는 실행하지 않습니다
- `workflow.agentReview.plan` / `workflow.agentReview.task` / `workflow.agentReview.feature` (object): Plan/태스크/Feature 독립 리뷰 설정
  - `enabled`: 해당 리뷰 게이트 활성화 여부. 새 프로젝트는 Plan과 Feature `true`, task `false`
  - `evidenceMode`: `path_required | any`
  - `reviewer`: fresh 읽기 전용 서브에이전트 실행 설정
  - `type`: 현재 `"subagent"`만 지원
  - `model`: `"inherit"` 또는 런타임이 지원하는 모델명
  - `reasoningEffort`: `low | medium | high | xhigh | max | ultra`
  - `onUnavailable`: 지정 모델을 사용할 수 없을 때 `inherit | error`
  - Plan 검수는 Plan 승인 전에 실행되며 `workflow-stage`가 반환한 정확한 `specHash`와 `planHash`에 evidence를 묶습니다. 이후 spec/plan 내용이 바뀌면 fresh 검수가 필요합니다.
- `workflow.baseBranch` (string): 완료된 local Feature를 통합할 기준 브랜치
- `workflow.completionStrategy` (`"local-ff" | "local-squash" | "none"`): fast-forward, 검증된 단일 squash commit 생성, 또는 명시적으로 통합 없이 종료
- `workflow.deleteFeatureBranchAfterMerge` (boolean): cleanup 후 통합된 local Feature 브랜치 삭제 여부. 원격 브랜치는 삭제하지 않음
- `workflow.featureChecks` (array): 통합 전에 Feature worktree에서 실행할 build/test/lint/typecheck 명령
- `workflow.postMergeChecks` (array): 통합된 기준 브랜치 환경이 실제로 필요한 선택적 검사
- `approval` (object, optional): repo 정책/커스텀 validator용 승인 checkpoint 메타데이터
  - 기본 Codex-native 경로는 여전히 문서화된 checkpoint와 원격/파괴적 작업을 우선 기준으로 승인 요청합니다.
  - legacy runtime은 이 필드를 직접 소비했지만, 이제는 category 기반 checkpoint 메타데이터가 정말 필요할 때만 유지하세요.
  - 현재 기본값:
    - `mode: "category"`
    - `default: "skip"`
    - `requireCheckCategories: ["spec_approve", "implementation_approve", "local_merge"]`
  - `local-ff` 또는 `local-squash` workflow에서 `implementation_approve`는 완료된 구현을 승인하고, `local_merge`는 설정된 통합, post-merge 검사, managed worktree 제거, 설정된 local Feature 브랜치 삭제를 별도로 승인합니다.
  - 구현 승인 한 번으로 남은 local 완료 흐름까지 진행하려는 경우에만 `requireCheckCategories`에서 `local_merge`를 제거하세요.
  - 승인 토큰: `A`
  - 허용 응답: `A`, `A OK`
- `allowedDocsEntries` (object, optional): 비표준 `docs/` top-level 엔트리를 unmanaged docs로 보지 않도록 허용 목록에 추가
  - `dirs` (string[]): `docs/` 바로 아래에 추가 허용할 디렉터리
  - `files` (string[]): `docs/` 바로 아래에 추가 허용할 파일

### 예시

```json
{
  "projectName": "{{projectName}}",
  "projectType": "{{projectType}}",
  "lang": "ko",
  "createdAt": "{{date}}",
  "docsRepo": "embedded",
  "workflow": {
    "mode": "local",
    "agentAutomationConfigured": true,
    "baseBranch": "main",
    "completionStrategy": "local-ff",
    "deleteFeatureBranchAfterMerge": true,
    "featureChecks": [],
    "postMergeChecks": [],
    "agentExecution": {
      "task": {
        "enabled": true,
        "type": "subagent",
        "model": "inherit",
        "reasoningEffort": "high",
        "onUnavailable": "inherit"
      }
    },
    "agentReview": {
      "maxRounds": 1,
      "plan": {
        "enabled": true,
        "evidenceMode": "path_required",
        "reviewer": {
          "type": "subagent",
          "model": "inherit",
          "reasoningEffort": "high",
          "onUnavailable": "inherit"
        }
      },
      "task": {
        "enabled": false,
        "evidenceMode": "path_required",
        "reviewer": {
          "type": "subagent",
          "model": "inherit",
          "reasoningEffort": "high",
          "onUnavailable": "inherit"
        }
      },
      "feature": {
        "enabled": true,
        "evidenceMode": "path_required",
        "reviewer": {
          "type": "subagent",
          "model": "inherit",
          "reasoningEffort": "high",
          "onUnavailable": "inherit"
        }
      }
    }
  },
  "allowedDocsEntries": {
    "dirs": ["plans"]
  },
  "approval": {
    "mode": "category",
    "default": "skip",
    "requireCheckCategories": [
      "spec_approve",
      "implementation_approve",
      "local_merge"
    ]
  }
}
```

새 프로젝트는 기본적으로 태스크 구현을 위임하고 Plan 검수를 활성화합니다. 해당 설정이 생기기 전의 기존 프로젝트는 Task 위임과 Plan/Task 검수를 꺼진 상태로 유지하므로, 업데이트만으로 실행 정책이 바뀌지 않습니다. v0.9.4-v0.9.6 업데이트가 생성 기본값을 이미 기록한 기존 프로젝트도 생성일과 수정되지 않은 기본 설정 형태로 식별되면 안전한 비활성 상태로 복구하며, 커스텀 에이전트 설정은 보존합니다. `lee-spec-kit config --interactive` 또는 `config --task-agent on|off --reviews plan,task,feature|none --max-review-rounds N`으로 명시적으로 켜거나 변경할 수 있습니다. 새 local 프로젝트는 `local-ff`와 Feature agent review를 사용합니다. 기존 Feature 리뷰 동작은 이전 Pre-PR 설정과 workflow mode의 의미를 보존합니다. fresh 리뷰 최대 실행 횟수의 기본값은 `1`입니다. 즉 Round 1의 지적을 한 번 반영한 뒤 다시 리뷰하지 않고, 남은 finding과 변경된 target을 잔여 위험으로 보존해 사용자 승인 없이 리뷰 게이트를 자동 완료합니다. `blocked`는 자동 완료하지 않습니다. base branch에 하나의 commit만 남기려면 `local-squash`를 선택하세요. 이때 task checkpoint 증거를 위해 원본 Feature tip을 내부 `refs/lee-spec-kit/integrations/*` ref로 보존합니다. 기존 local 프로젝트에 명시적 `completionStrategy`가 없으면 `update`가 `none`을 넣어 업그레이드 도중 현재 브랜치를 갑자기 병합하지 않습니다. 준비가 끝난 뒤 `local-ff` 또는 `local-squash`로 명시적으로 전환하세요.

```json
{
  "projectName": "{{projectName}}",
  "projectType": "{{projectType}}",
  "lang": "ko",
  "createdAt": "{{date}}",
  "docsRepo": "standalone",
  "pushDocs": true,
  "docsRemote": "git@github.com:org/{{projectName}}-docs.git",
  "approval": {
    "mode": "category",
    "default": "skip",
    "requireCheckCategories": [
      "spec_approve",
      "implementation_approve",
      "local_merge"
    ]
  }
}
```

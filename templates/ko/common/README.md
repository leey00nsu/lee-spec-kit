# {{projectName}} 문서 구조 가이드

에이전트가 프로젝트 전반을 빠르게 파악할 수 있도록 문서를 기능별로 분리해 두었습니다.

## 에이전트 세션 시작 체크리스트

```bash
# (최초 1회 권장) 초기 온보딩 점검
npx lee-spec-kit onboard --strict

# 1) 프로젝트 감지
npx lee-spec-kit detect --json

# 2) 감지 성공 시 워크플로우 정책 조회
npx lee-spec-kit docs get agents --json
```

- `isLeeSpecKitProject: true`일 때만 lee-spec-kit 워크플로우를 적용합니다.
- 기본 실행 경로는 workspace-scoped `AGENTS.md`, Codex 공식 hooks, 그리고 활성 feature 문서입니다.
- 활성 feature를 정한 뒤에는 `spec.md`, `plan.md`, `tasks.md`, `decisions.md`를 작업 SSOT로 사용합니다.
- 사용자 승인 요청은 문서화된 workflow checkpoint와 원격/파괴적 작업 전에만 합니다.
- staged된 docs 경로 검사가 필요하면 `git commit` 전에 `npx lee-spec-kit commit-audit --json`를 사용합니다.
- 코드나 feature 문서를 바꿨다면 종료 전 `npx lee-spec-kit workflow-audit --json`로 동기화 상태를 확인합니다.
- `isLeeSpecKitProject: false`면 lee-spec-kit 전용 절차를 건너뛰고 일반 워크플로우로 진행합니다.

## 신규 프로젝트 시작 순서

- 코드 프로젝트 스캐폴딩(예: Next.js/NestJS) 후 `lee-spec-kit init`을 실행하세요.
- 그 다음 `docs/prd/`에 상위 요구사항을 정리하고, `idea`/`feature`로 작업 단위를 구체화하세요.
- 이후 `detect --json`으로 감지 결과를 확인하고, `docs get agents --json`과 활성 feature 문서 기준으로 진행하세요.
- 대부분의 경우(기본값: embedded) 위 순서만 따르면 됩니다.
- docs를 코드 저장소와 분리해 운영할 때만 standalone을 선택하세요. 이때는 상위 워크스페이스 폴더(예: `workspace/docs`, `workspace/project`)에서 `init`을 실행해 docs/project 경로를 함께 지정하는 방식을 권장합니다. (예: `npx lee-spec-kit init --docs-repo standalone --dir ./docs --project-root ./project`)

## 상위 구조 요약

| 경로             | 목적               | 핵심 문서/역할 |
| ---------------- | ------------------ | -------------- |
| `docs/agents/`   | 에이전트 운영 규칙 | `custom.md`, `constitution.md` (엔진 종속 가이드는 `npx lee-spec-kit docs get <doc-id> --json`으로 조회) |
| `docs/prd/`      | 제품 요구사항      | 프로젝트별 작성 |
| `docs/designs/`  | 디자인 참고 자료   | `README.md` (링크/가이드/레퍼런스) |
| `docs/ideas/`    | 아이디어/To-do     | `README.md` (Idea → Feature 승격 규칙) |
| `{{featurePath}}` | 기능별 문서        | `{feature-id}/spec.md`, `plan.md`, `tasks.md`, `decisions.md` |

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

- `lee-spec-kit feature`, `status`, `update`에서 문서 위치/프로젝트 타입/언어를 감지하는 용도로 사용됩니다.
- `docsRepo`, `pushDocs`, `docsRemote`는 CLI 관리 **Docs Push 정책**을 위한 메타데이터입니다. (자동 push는 하지 않습니다)

### 필드

- `projectName` (string): 프로젝트 이름
- `projectType` ("single" | "multi"): 프로젝트 타입
- `lang` ("ko" | "en"): 문서 언어
- `createdAt` (string, YYYY-MM-DD): 생성 날짜
- `docsRepo` ("embedded" | "standalone"): Docs 관리 방식
- `pushDocs` (boolean, optional): `docsRepo: "standalone"`일 때만 생성 (원격 push 여부)
- `docsRemote` (string, optional): `pushDocs: true`일 때만 생성 (원격 레포 URL)
- `approval` (object, optional): repo 정책/커스텀 validator용 승인 checkpoint 메타데이터
  - 기본 Codex-native 경로는 여전히 문서화된 checkpoint와 원격/파괴적 작업을 우선 기준으로 승인 요청합니다.
  - legacy runtime은 이 필드를 직접 소비했지만, 이제는 category 기반 checkpoint 메타데이터가 정말 필요할 때만 유지하세요.
  - 현재 기본값:
    - `mode: "category"`
    - `default: "skip"`
    - `requireCheckCategories: ["spec_approve", "implementation_approve"]`
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
  "allowedDocsEntries": {
    "dirs": ["plans"]
  },
  "approval": {
    "mode": "category",
    "default": "skip",
    "requireCheckCategories": ["spec_approve", "implementation_approve"]
  }
}
```

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
    "requireCheckCategories": ["spec_approve", "implementation_approve"]
  }
}
```

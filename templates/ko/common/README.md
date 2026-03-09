# {{projectName}} 문서 구조 가이드

에이전트가 프로젝트 전반을 빠르게 파악할 수 있도록 문서를 기능별로 분리해 두었습니다.

## 에이전트 세션 시작 체크리스트

```bash
# (최초 1회 권장) 초기 온보딩 점검
npx lee-spec-kit onboard --strict

# 1) 프로젝트 감지
npx lee-spec-kit detect --json

# 2) 감지 성공 시 컨텍스트 조회
npx lee-spec-kit context --json-compact
```

- `isLeeSpecKitProject: true`일 때만 lee-spec-kit 워크플로우를 적용합니다.
- `actionOptions`가 있으면 `approvalPrompt`/`finalPrompt`를 그대로 사용자에게 보여주고 승인(`<LABEL>` 또는 `<LABEL> OK`)을 받은 뒤 실행합니다.
- `isLeeSpecKitProject: false`면 lee-spec-kit 전용 절차를 건너뛰고 일반 워크플로우로 진행합니다.

## 신규 프로젝트 시작 순서

- 코드 프로젝트 스캐폴딩(예: Next.js/NestJS) 후 `lee-spec-kit init`을 실행하세요.
- 그 다음 `detect --json`으로 감지 결과를 확인하고, `feature`/`context` 순서로 진행하세요.
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

- **PRD (`docs/prd/`)**: 요구사항 SSOT
  - 요구사항마다 ID를 부여합니다: `PRD-FR-001`, `PRD-US-002`, `PRD-NFR-003`
  - ID는 안정적으로 유지합니다. (삭제 대신 `Deprecated` 표기 권장, 재번호 부여 금지)
  - PRD ID는 PRD 원문에 먼저 정의합니다. Feature 문서에서 임의 생성하지 않습니다.
- **Ideas (`docs/ideas/`)**: Feature 전 단계 SSOT (가설/실험/후보)
  - Idea 문서 상단에 `PRD Refs:`를 기록합니다. (예: `PRD-FR-001, PRD-US-002`)
  - Feature로 승격되면 SSOT는 `docs/features/`로 이동하고, Idea는 archive로 정리합니다.
- **Features (`docs/features/`)**: 구현 범위/진행 SSOT
  - `spec.md`: 범위 정의 + `PRD Refs`(기능이 커버하는 PRD ID 목록)
  - `tasks.md`: 태스크 단위로 PRD ID를 태그(`[PRD-FR-001]`)로 매핑하거나, PRD 무관 태스크는 `[NON-PRD]`로 표시
  - 레거시 문서에 PRD ID가 없다면, 먼저 원문 요구사항 문서에 ID를 backfill한 뒤 Feature 문서를 연결합니다.
  - `decisions.md`: 변경/트레이드오프/요구사항 변경(왜 바뀌었는지) 기록 + Evidence 링크

## 변경 프로토콜 (중간에 요구사항/기능이 추가·변경될 때)

요구사항/범위가 변하면, “무엇을 고쳐야 하는지”가 문서로 남아야 합니다. 최소 아래를 지킵니다.

1. **PRD 변경** (요구사항 추가/수정/폐기):
   - `docs/prd/*.md`: 해당 ID 추가/수정/Deprecated 표기
2. **Idea 단계라면**:
   - `docs/ideas/*.md`: `PRD Refs` 및 범위(포함/제외) 갱신
3. **Feature 단계라면**:
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
- `approval` (object, optional): `context` 출력의 `[확인 필요]` / `requiresUserCheck` 정책 오버라이드 (승인 토큰: `A`, 허용: `A`/`A OK`)

### 예시

```json
{
  "projectName": "{{projectName}}",
  "projectType": "{{projectType}}",
  "lang": "ko",
  "createdAt": "{{date}}",
  "docsRepo": "embedded",
  "approval": { "mode": "builtin" }
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
  "approval": { "mode": "builtin" }
}
```

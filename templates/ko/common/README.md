# {{projectName}} 문서 구조 가이드

에이전트가 프로젝트 전반을 빠르게 파악할 수 있도록 문서를 기능별로 분리해 두었습니다.

## 에이전트 세션 시작 체크리스트

```bash
# 1) 프로젝트 감지
npx lee-spec-kit detect --json

# 2) 감지 성공 시 컨텍스트 조회
npx lee-spec-kit context --json
```

- `isLeeSpecKitProject: true`일 때만 lee-spec-kit 워크플로우를 적용합니다.
- `actionOptions`가 있으면 `approvalPrompt`/`finalPrompt`를 그대로 사용자에게 보여주고 승인(`<LABEL>` 또는 `<LABEL> OK`)을 받은 뒤 실행합니다.
- `isLeeSpecKitProject: false`면 lee-spec-kit 전용 절차를 건너뛰고 일반 워크플로우로 진행합니다.

## 신규 프로젝트 시작 순서

- 코드 프로젝트 스캐폴딩(예: Next.js/NestJS) 후 `lee-spec-kit init`을 실행하세요.
- 그 다음 `detect --json`으로 감지 결과를 확인하고, `feature`/`context` 순서로 진행하세요.
- 위 순서는 기본값인 `docsRepo: embedded` 기준입니다. `standalone`이면 docs 레포 경로 기준(`--dir` 또는 `LEE_SPEC_KIT_DOCS_DIR`)으로 실행하세요.

## 상위 구조 요약

| 경로             | 목적               | 핵심 문서/역할 |
| ---------------- | ------------------ | -------------- |
| `docs/agents/`   | 에이전트 운영 규칙 | `custom.md`, `constitution.md` (엔진 종속 가이드는 `npx lee-spec-kit docs get <doc-id> --json`으로 조회) |
| `docs/prd/`      | 제품 요구사항      | 프로젝트별 작성 |
| `docs/designs/`  | 디자인 참고 자료   | `README.md` (링크/가이드/레퍼런스) |
| `docs/ideas/`    | 아이디어/To-do     | `README.md` (Idea → Feature 승격 규칙) |
| `{{featurePath}}` | 기능별 문서        | `{feature-id}/spec.md`, `plan.md`, `tasks.md`, `decisions.md` |

---

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

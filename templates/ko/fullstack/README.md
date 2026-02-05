# {{projectName}} 문서 구조 가이드

에이전트가 프로젝트 전반을 빠르게 파악할 수 있도록 문서를 기능별로 분리해 두었습니다.

## 상위 구조 요약

| 경로                | 목적                 | 핵심 문서/역할                                                |
| ------------------- | -------------------- | ------------------------------------------------------------- |
| `docs/agents/`      | 에이전트 운영 규칙   | `agents.md`, `constitution.md`, `git-workflow.md`             |
| `docs/prd/`         | 제품 요구사항        | 프로젝트별 작성                                               |
| `docs/designs/`     | 디자인 참고 자료     | `README.md` (링크/가이드/레퍼런스)                            |
| `docs/ideas/`       | 아이디어/To-do        | `README.md` (Idea → Feature 승격 규칙)                        |
| `docs/features/be/` | Backend 기능별 문서  | `{feature-id}/spec.md`, `plan.md`, `tasks.md`, `decisions.md` |
| `docs/features/fe/` | Frontend 기능별 문서 | `{feature-id}/spec.md`, `plan.md`, `tasks.md`, `decisions.md` |

---

## CLI 설정 파일 (`.lee-spec-kit.json`)

`lee-spec-kit init`을 실행하면 문서 루트(기본: `docs/`)에 `.lee-spec-kit.json`이 생성됩니다.

- `lee-spec-kit feature`, `status`, `update`에서 문서 위치/프로젝트 타입/언어를 감지하는 용도로 사용됩니다.
- `docsRepo`, `pushDocs`, `docsRemote`는 `/docs/agents/git-workflow.md`의 **Docs Push 규칙**을 위한 메타데이터입니다. (자동 push는 하지 않습니다)

### 필드

- `projectName` (string): 프로젝트 이름
- `projectType` ("single" | "fullstack"): 프로젝트 타입
- `lang` ("ko" | "en"): 문서 언어
- `createdAt` (string, YYYY-MM-DD): 생성 날짜
- `docsRepo` ("embedded" | "standalone"): Docs 관리 방식
- `pushDocs` (boolean, optional): `docsRepo: "standalone"`일 때만 생성 (원격 push 여부)
- `docsRemote` (string, optional): `pushDocs: true`일 때만 생성 (원격 레포 URL)
- `approval` (object, optional): `context` 출력의 `[확인 필요]` / `requiresUserCheck` 정책 오버라이드 (승인 토큰: `OK`)

### 예시

```json
{
  "projectName": "{{projectName}}",
  "projectType": "fullstack",
  "lang": "ko",
  "createdAt": "{{date}}",
  "docsRepo": "embedded",
  "approval": { "mode": "builtin" }
}
```

```json
{
  "projectName": "{{projectName}}",
  "projectType": "fullstack",
  "lang": "ko",
  "createdAt": "{{date}}",
  "docsRepo": "standalone",
  "pushDocs": true,
  "docsRemote": "git@github.com:org/{{projectName}}-docs.git",
  "approval": { "mode": "builtin" }
}
```

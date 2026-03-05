# Ideas

Feature로 발전하기 전의 아이디어 / To-do / 실험 기록을 모아두는 폴더입니다.

핵심 원칙: **Feature로 승격되면 SSOT는 `docs/features/`로 이동**합니다.

---

## 작성 규칙

- 1 아이디어 = 1 파일 (kebab-case 권장)
  - 예: `login-rate-limit.md`
  - 예: `admin-dashboard-metrics.md`
- 상단에 최소한 아래 메타 정보를 둡니다:
  - 목적/배경
  - 대략 범위(뭘 할지/안 할지)
  - PRD Refs(권장): `PRD-FR-001, PRD-US-002` (PRD와 무관하면 `NON-PRD` 명시)
  - 대상 컴포넌트(필요 시): `api` / `app` / `worker` / `all`
  - 상태(권장): `Active | Converted | Dropped`

---

## 승격/정리 규칙 (Idea → Feature)

1. `npx lee-spec-kit feature <name>`로 Feature 폴더 생성
2. 새 Feature에 아래를 모두 남깁니다
   - `spec.md` 또는 `tasks.md`에 아이디어 문서 경로 (예: `docs/ideas/login-rate-limit.md`)
   - `spec.md`의 `PRD Refs`(예: `PRD-FR-001, PRD-US-002`)
   - `tasks.md` 태스크 라인에 `[PRD-FR-001]` 같은 PRD ID 태그 (PRD와 무관한 태스크는 `[NON-PRD]`)
3. 아이디어 문서는 **목록에서 제거**합니다 (둘 중 하나 선택):
   - **권장**: `docs/ideas/archive/`로 이동 후 상단에 `Status: Converted`, `Feature: F00X-...` 기록
   - 또는: 완전히 삭제 (히스토리가 필요 없을 때만)

> 💡 완전 삭제 대신 archive를 권장합니다: “왜 이 Feature가 생겼는지” 추적에 도움이 됩니다.

---

## 변경 프로토콜 (Idea 단계에서 내용이 바뀔 때)

Idea 단계에서도 변경은 “어디를 고쳤는지”가 남아야 합니다.

- PRD 요구사항이 추가/변경되면: Idea 문서의 `PRD Refs`를 먼저 갱신하고, 필요하면 PRD 문서(`docs/prd/*.md`)에도 ID를 추가/수정합니다.
- 아이디어가 Feature로 승격된 뒤에 변경이 생기면: Idea가 아니라 Feature(`spec.md`/`tasks.md`/`plan.md`/`decisions.md`)를 SSOT로 갱신합니다.

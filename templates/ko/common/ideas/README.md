# Ideas

Feature로 발전하기 전의 아이디어 / To-do / 실험 기록을 모아두는 폴더입니다.

핵심 원칙: **Feature로 승격되면 SSOT는 `docs/features/`로 이동**합니다.

---

## 작성 규칙

- 1 아이디어 = 1 파일
  - CLI로 생성한 문서는 `I001-login-rate-limit.md` 같은 indexed 이름을 사용합니다
  - 기존의 `login-rate-limit.md` 같은 자유 형식 파일도 유지할 수 있습니다
- 상단에 최소한 아래 메타 정보를 둡니다:
  - `Idea ID` (`I###` 형식의 indexed idea인 경우)
  - 목적/배경
  - 대략 범위(뭘 할지/안 할지)
  - PRD Refs(권장): `PRD-FR-001, PRD-US-002` (PRD와 무관하면 `NON-PRD` 명시)
  - 대상 컴포넌트(필요 시): `api` / `app` / `worker` / `all`
  - 상태: `Active | Featureized | Dropped`
  - Feature: 승격되면 `F###-slug`
- `PRD Refs`에는 이미 원문 PRD/요구사항 문서에 정의된 ID만 적습니다. 아직 ID가 없다면 원문부터 backfill하세요.

---

## 승격/정리 규칙 (Idea → Feature)

1. 추적 가능한 intake가 필요하면 `npx lee-spec-kit idea <name>`로 아이디어 문서를 먼저 만듭니다
2. Feature 승격 시 `npx lee-spec-kit feature <name> --idea I001`를 사용합니다
3. `--idea`를 사용하면 새 Feature의 `spec.md`에 source idea 경로가 자동 기록됩니다
4. 승격 후에도 다음은 직접 채워야 합니다
   - `spec.md`의 `PRD Refs`
   - `tasks.md` 태스크 라인의 PRD ID 태그(`[PRD-FR-001]` 등)
5. 아이디어 문서는 삭제하지 말고 `Status: Featureized`, `Feature: F00X-...`로 남기는 것을 권장합니다

> 💡 source idea 문서를 남겨두면 “왜 이 Feature가 생겼는지” 추적하기 쉽습니다.

---

## 변경 프로토콜 (Idea 단계에서 내용이 바뀔 때)

Idea 단계에서도 변경은 “어디를 고쳤는지”가 남아야 합니다.

- PRD 요구사항이 추가/변경되면: Idea 문서의 `PRD Refs`를 먼저 갱신하고, 필요하면 PRD 문서(`docs/prd/*.md`)에도 ID를 추가/수정합니다.
- 아이디어가 Feature로 승격된 뒤에 변경이 생기면: Idea가 아니라 Feature(`spec.md`/`tasks.md`/`plan.md`/`decisions.md`)를 SSOT로 갱신합니다.

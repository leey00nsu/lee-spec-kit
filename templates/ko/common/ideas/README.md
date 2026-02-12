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
  - 대상 컴포넌트(필요 시): `api` / `app` / `worker` / `all`

---

## 승격/정리 규칙 (Idea → Feature)

1. `npx lee-spec-kit feature <name>`로 Feature 폴더 생성
2. 새 Feature의 `spec.md` 또는 `tasks.md`에 아이디어 문서 경로를 남깁니다
   - 예: `docs/ideas/login-rate-limit.md`
3. 아이디어 문서는 **목록에서 제거**합니다 (둘 중 하나 선택):
   - **권장**: `docs/ideas/archive/`로 이동 후 상단에 `Status: Converted`, `Feature: F00X-...` 기록
   - 또는: 완전히 삭제 (히스토리가 필요 없을 때만)

> 💡 완전 삭제 대신 archive를 권장합니다: “왜 이 Feature가 생겼는지” 추적에 도움이 됩니다.

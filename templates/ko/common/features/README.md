# Features 가이드

기능별 스펙, 계획, 태스크를 관리하는 폴더입니다.

---

## 폴더 구조

```text
features/
├── README.md           # 이 파일
├── feature-base/       # 공용 템플릿 (수정 시 한 곳만 수정)
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   ├── issue.md
│   ├── pr.md
│   └── decisions.md
├── (single) F00X-{name}/
└── (multi)  {component}/F00X-{name}/
```

---

## 새 기능 생성

```bash
# Single 프로젝트
npx lee-spec-kit feature user-auth

# Multi 프로젝트
npx lee-spec-kit feature --component app user-profile
```

> 💡 CLI는 `feature-base/`에서 템플릿을 복사하고 ID를 자동 채번합니다.

---

## 기능 ID 규칙

- `F{번호}-{기능명}` (예: F001-user-auth)
- 번호는 **최소 3자리 패딩** (001, 002, ...)
- 999를 초과하면 **4자리 이상으로 확장** (F1000, F1001, ...)
- 기능명은 kebab-case
- **Feature = Issue**: 각 Feature는 하나의 GitHub Issue에 대응됩니다.

---

## 상태 확인

```bash
npx lee-spec-kit status
```

파일로 저장:

```bash
npx lee-spec-kit status --write
```

---

## PRD 요구사항 추적 (권장)

- PRD 문서(`docs/prd/*.md`)에 `PRD-FR-001` 같은 요구사항 ID를 부여하세요.
- `tasks.md`의 각 태스크 라인에 `[PRD-FR-001]` 태그로 연결하세요. PRD와 무관한 태스크는 `[NON-PRD]`를 사용하세요.
- `[NON-PRD]`는 refactor, 테스트 전용 작업, tooling, rename, cleanup 같은 내부 구현 작업에만 사용하세요.
- 변경이 사용자 동작, acceptance criteria, 범위를 바꾸면 PRD를 먼저 갱신하고 태스크도 `[PRD-...]`로 다시 연결하세요.
- 단, 태스크 문서에서 PRD ID를 임의 생성하지 않습니다. 먼저 PRD 원문에 정의하고, 레거시 문서는 원문 ID backfill 후 연결하세요.
- 커버리지 리포트: `npx lee-spec-kit requirements` (alias: `npx lee-spec-kit prd`)

---

## 변경 프로토콜 (기능 진행 중 요구사항/범위 변경)

중간 변경이 생기면, “어디를 고쳤는지”와 “무엇을 업데이트했는지”가 문서로 남아야 합니다.

- 변경은 **새 태스크로 추가**합니다. (`[DONE]` 태스크를 고치지 말고 새 태스크를 만드세요)
- 변경 태스크에는 `[PRD-...]` 또는 `[NON-PRD]` 태그를 반드시 붙입니다. (권장: `[CHANGE]` 태그 추가)
- 내부 검토로 시작했더라도, 최종적으로 사용자 요구/동작 변경이 되면 `[NON-PRD]`로 남기지 않습니다.
  - `docs/prd/*.md`를 backfill/수정
  - `spec.md`의 `PRD Refs` 갱신
  - 태스크를 `[PRD-...]`로 재태깅하거나 대체 태스크 추가
- 변경이 PRD/스펙/설계에 영향을 주면 아래도 함께 갱신합니다:
  - `docs/prd/*.md` (요구사항 ID 추가/수정/Deprecated)
  - `spec.md` (`PRD Refs`, 스코프/AC)
  - `plan.md` (아키텍처/테스트 전략)
  - `decisions.md` (왜 바뀌었는지 + Evidence)

---

## 상태 용어 정리

| 구분 | 필드 | 값 |
| --- | --- | --- |
| 문서 상태 | `spec.md`/`plan.md`의 `상태`, `tasks.md`의 `문서 상태` | `Draft` \| `Review` \| `Approved` |
| 이슈 문서 상태 | `issue.md`의 `상태` | `Draft` \| `Ready` |
| PR 문서 상태 | `pr.md`의 `상태` | `Draft` \| `Ready` |
| PR 리뷰 상태 | `tasks.md`의 `PR 상태` | `Review` \| `Approved` |
| Pre-PR 리뷰 상태 | `tasks.md`의 `PR 전 리뷰` | `Pending` \| `Done` |
| Pre-PR 리뷰 Evidence | `tasks.md`의 `PR 전 리뷰 Evidence` | 근거 링크/로그/문서 경로 |
| Pre-PR 리뷰 Decision | `tasks.md`의 `PR 전 리뷰 Decision` | `결정: approve|changes_requested|blocked ...` |
| PR 리뷰 Evidence | `tasks.md`의 `PR 리뷰 Evidence` | 근거 링크/로그/문서 경로 |
| PR 리뷰 Decision | `tasks.md`의 `PR 리뷰 Decision` | `결정: ...` (또는 `decision: ...`) |

---

## Pre-PR 폴백 체크리스트

모든 Pre-PR 리뷰에서 `agents/skills/create-pr.md`의 `Pre-PR 기본 체크리스트`를 기본 베이스라인으로 사용하고, 리뷰 스킬은 심화 검토용으로 추가 사용하세요.

---

## 각 파일 역할

| 파일           | 역할                       | 작성 시점      |
| -------------- | -------------------------- | -------------- |
| `spec.md`      | **무엇을, 왜** 만드는지    | 기능 정의 시   |
| `plan.md`      | **어떻게** 만드는지 (기술) | 스펙 승인 후   |
| `tasks.md`     | 구체적인 작업 목록         | 계획 승인 후   |
| `issue.md`     | 이슈 초안 + 이슈 상태(`Draft/Ready`) | 이슈 생성 전/생성 시 |
| `pr.md`        | PR 초안 + PR 상태(`Draft/Ready`) | PR 생성 전/생성 시 |
| `decisions.md` | 기술 결정 + 판단 근거(Trace) + 증거 링크(ADR) | 개발 중 수시로 (DOING 시작 / DONE 직전 / 머지 후) |

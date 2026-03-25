# PRD (Product Requirements Document)

이 폴더에는 제품 요구사항 문서를 작성합니다.

이 공간은 `lee-spec-kit init`이 만들어 주는 상위 요구사항 영역입니다.
먼저 여기에서 PRD를 작성하고, 이후 idea와 feature 문서가 이 요구사항을 참조하도록 연결하세요.

> **📌 문서 범위**
>
> - **이 폴더**: 제품 요구사항, 비즈니스 로직, 사용자 스토리
> - **Constitution**: 기술 스택, 아키텍처 원칙, 코드 품질, 보안 원칙 → `agents/constitution.md`

## 작성 가이드

1. 프로젝트 개요와 목표를 정의하세요
2. 주요 기능과 사용자 스토리를 작성하세요
3. 기술 아키텍처 개요를 포함하세요

## Ideas / Features와의 관계

- `docs/prd/`: 요구사항 원문 정의
- `docs/ideas/`: 요구사항에서 나온 후보/실험 정리
- `docs/features/`: 승인된 작업을 feature 단위로 실행

PRD에서 시작한 작업이라면, 이후 문서에서도 `PRD Refs`와 태스크 태그를 통해 연결이 계속 보이도록 유지하세요.

## 요구사항 ID 규칙 (권장)

PRD의 “어느 요구사항이 구현됐는지”를 CLI가 집계할 수 있도록, 요구사항에 **안정적인 ID**를 부여하세요.

- 형식: `PRD-FR-001`, `PRD-US-002`, `PRD-NFR-003`
- 같은 줄(헤더/불릿) 안에 ID만 포함되어 있으면 됩니다.
- Feature의 `tasks.md` 태스크 라인에 `[PRD-FR-001]`처럼 **대괄호 태그**로 참조하세요.
- PRD와 무관한 태스크는 `[NON-PRD]` 태그로 표시하세요.
- 중요한 점: `tasks.md`나 `spec.md`에서 PRD ID를 임의로 만들지 않습니다. 항상 이 폴더나 상위 요구사항 원문에 먼저 정의한 뒤 참조하세요.
- 레거시 PRD/요구사항 문서에 아직 ID가 없다면, 먼저 원문 문서에 ID를 backfill한 뒤 Feature의 `PRD Refs`와 태스크 태그를 맞추세요.

예시:

```md
- PRD-FR-001: 로그인 rate limit
### PRD-US-002: 관리자는 지표를 볼 수 있다
```

## 변경 규칙 (요구사항 추가/변경/폐기)

요구사항이 바뀌면 “어디를 고쳐야 하는지”가 명확해야 합니다.

- **ID 안정성**:
  - ID는 재번호 부여/재사용하지 않습니다.
  - 요구사항이 폐기되면 삭제 대신 `Deprecated` 표기 + 이유/대체 ID를 기록합니다.
  - 요구사항이 분리/병합되면, 기존 ID는 유지하고 새 ID를 추가한 뒤 관계를 PRD에 명시합니다.
- **연쇄 업데이트(필수)**:
  - PRD 변경이 이미 진행 중인 Feature에 영향을 주면, 해당 Feature의 `spec.md`(`PRD Refs`), `tasks.md`(태스크 태그), 필요 시 `plan.md`와 `decisions.md`까지 함께 갱신합니다.
  - 아직 Feature가 없다면, `docs/ideas/*.md`에 `PRD Refs`를 남겨 “승격 전 상태”에서도 추적 가능하게 유지합니다.

## 예시 파일

- `{project-name}-prd.md` - 메인 PRD 문서
- `backend-overview.md` - 백엔드 아키텍처 (선택)
- `frontend-overview.md` - 프론트엔드 아키텍처 (선택)

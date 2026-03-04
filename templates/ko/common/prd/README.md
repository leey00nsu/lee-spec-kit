# PRD (Product Requirements Document)

이 폴더에는 제품 요구사항 문서를 작성합니다.

> **📌 문서 범위**
>
> - **이 폴더**: 제품 요구사항, 비즈니스 로직, 사용자 스토리
> - **Constitution**: 기술 스택, 아키텍처 원칙, 코드 품질, 보안 원칙 → `agents/constitution.md`

## 작성 가이드

1. 프로젝트 개요와 목표를 정의하세요
2. 주요 기능과 사용자 스토리를 작성하세요
3. 기술 아키텍처 개요를 포함하세요

## 요구사항 ID 규칙 (권장)

PRD의 “어느 요구사항이 구현됐는지”를 CLI가 집계할 수 있도록, 요구사항에 **안정적인 ID**를 부여하세요.

- 형식: `PRD-FR-001`, `PRD-US-002`, `PRD-NFR-003`
- 같은 줄(헤더/불릿) 안에 ID만 포함되어 있으면 됩니다.
- Feature의 `tasks.md` 태스크 라인에 `[PRD-FR-001]`처럼 **대괄호 태그**로 참조하세요.
- PRD와 무관한 태스크는 `[NON-PRD]` 태그로 표시하세요.

예시:

```md
- PRD-FR-001: 로그인 rate limit
### PRD-US-002: 관리자는 지표를 볼 수 있다
```

## 예시 파일

- `{project-name}-prd.md` - 메인 PRD 문서
- `backend-overview.md` - 백엔드 아키텍처 (선택)
- `frontend-overview.md` - 프론트엔드 아키텍처 (선택)

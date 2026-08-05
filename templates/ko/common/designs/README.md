# UX / Visual Designs

프로젝트에서 참고할 디자인 리소스를 모아두는 폴더입니다.

(예: Figma 링크, 참고 화면, 디자인 시스템 규칙, UI 가이드)

---

## 포함 대상

- 화면/플로우 참고 자료 (Figma, 이미지, 링크)
- 컴포넌트/패턴 가이드 (버튼, 폼, 네비게이션 등)
- 브랜드/타이포/컬러 토큰 등 UI 규칙

---

## 포함하지 않는 문서

- 시스템/백엔드 아키텍처 (`docs/prd/*-overview.md` 또는 활성 Feature의 `plan.md`)
- 데이터 모델 및 API 설계 (Feature 전에는 `docs/ideas/I###-*.md`, 이후에는 활성 Feature의 `plan.md`)
- 오픈소스 후보 조사 (`docs/ideas/I###-*.md` 또는 활성 Feature의 `decisions.md`)
- 기술 결정과 대안 비교 (Feature 전에는 `docs/ideas/I###-*.md`, 이후에는 활성 Feature의 `decisions.md`)
- 구현 로드맵과 작업 계획 (활성 Feature의 `plan.md`와 `tasks.md`)

`designs/`의 design은 기술 설계가 아니라 UX, 화면, 시각 디자인을 뜻합니다.

---

## 작성 규칙

- 외부 링크는 가능한 한 **원본 URL + 요약(또는 캡처)**를 함께 남깁니다.
- 파일명은 kebab-case 사용 (예: `auth-flow.md`, `design-system.md`)
- 이미지/첨부 파일이 필요하면 `assets/` 폴더를 생성하여 관리합니다.

---

## 참조 방법

Feature 문서에서 디자인을 참조할 때는 상대경로보다 **프로젝트 루트 기준 경로**를 권장합니다.

- 예: `docs/designs/auth-flow.md`

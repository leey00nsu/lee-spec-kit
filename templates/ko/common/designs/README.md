# UX / Visual Designs

프로젝트에서 참고할 디자인 리소스를 모아두는 폴더입니다.

(예: Figma 링크, 참고 화면, 디자인 시스템 규칙, UI 가이드)

---

## 선택적 적용

`design-system.md`와 Feature visual brief는 모든 프로젝트의 필수 문서가 아닙니다.

- design system, UI/visual redesign, 디자인 일관성, 공통 UI/component library 정리, branding/theme/token 재설계, Figma/디자인 이미지 기반 구현 요청에만 사용을 검토합니다.
- 단순 web/frontend Feature, backend Feature, 장기 디자인 규칙을 바꾸지 않는 버그 수정에는 만들지 않습니다.
- 세부 정책: `npx lee-spec-kit docs get ui-ux-design --json`

---

## 포함 대상

- 화면/플로우 참고 자료 (Figma, 이미지, 링크)
- 컴포넌트/패턴 가이드 (버튼, 폼, 네비게이션 등)
- 브랜드/타이포/컬러 토큰 등 UI 규칙

## 권장 구조와 책임

```text
docs/designs/
├── README.md
├── design-system.md
├── <feature-visual-brief>.md
└── assets/
    └── <feature-name>/
```

- `design-system.md`: 여러 Feature가 공유하는 의미와 사용 규칙
- `<feature-visual-brief>.md`: 특정 Feature의 Figma/이미지, UX 방향, 데이터 계약과 시안의 차이
- `assets/<feature-name>/`: 구현이 의존하는 repo 내부 visual snapshot

이미 `design-system.md`가 있으면 새 파일을 만들지 않고 기존 문서를 참조하거나 갱신합니다. Feature마다 `design.md`를 만드는 방식을 기본값으로 사용하지 않습니다.

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
- 이미지/첨부 파일은 `assets/<feature-name>/` 같은 repo 내부 경로에서 관리하고 개인 컴퓨터의 절대 경로에 의존하지 않습니다.
- 디자인 문서는 `kind: ux-design`, `kind: design-system`, `kind: visual-reference` 중 맞는 frontmatter와 `scope: project`를 사용합니다.

## 실행 가능한 정본

- `design-system.md`: 의미와 사용 규칙
- CSS theme/globals 또는 token 파일: 실제 token 값
- 공통 UI 디렉터리: 실제 component/variant 계약
- Storybook 또는 동등한 workbench: variant와 상태의 실행 가능한 예시
- Feature `decisions.md`: 예외, 변경 이유, 제거 조건

`design-system.md`가 바뀌면 같은 Feature task에서 영향 받는 문서, token/theme, 공통 UI, Storybook/workbench와 검증을 함께 확인하고 동기화합니다.

---

## 참조 방법

Feature 문서에서 디자인을 참조할 때는 상대경로보다 **프로젝트 루트 기준 경로**를 권장합니다.

- 예: `docs/designs/auth-flow.md`

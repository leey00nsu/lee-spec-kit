# UI/UX 디자인 문서 정책

UI/UX 요청에서 장기 디자인 규칙과 Feature별 시각 자료를 분리하는 선택적 정책입니다.
이 문서는 workflow stage나 승인 gate를 추가하지 않습니다.

---

## 활성화 조건

사용자 요청에 다음 의도가 **명시적으로 포함된 경우에만** 이 정책을 적용합니다.

- design system 또는 디자인 시스템
- UI redesign 또는 visual redesign
- 디자인 일관성
- 공통 UI 또는 component library 정리
- branding 또는 theme/token 재설계
- Figma나 디자인 이미지 기반 구현

다음 경우에는 적용하지 않습니다.

- 단순히 대상 component가 web/frontend인 경우
- 비 UI 프로젝트나 backend Feature
- 장기 디자인 규칙을 바꾸지 않는 단순 버그 수정
- 기존 컴포넌트 한 곳의 국소적인 스타일 수정

애매하면 문서를 만들지 말고 활성 Feature 문서만 사용합니다.

## 권장 구조

활성화 조건을 충족하고 장기 규칙 또는 시각 참조가 실제로 필요할 때만 다음 구조의 필요한 부분을 사용합니다.

```text
docs/designs/
├── README.md
├── design-system.md
├── <feature-visual-brief>.md
└── assets/
    └── <feature-name>/
```

- 모든 파일을 한꺼번에 만들지 않습니다.
- `docs/designs/design-system.md`가 이미 있으면 새 파일을 만들지 않고 기존 문서를 참조하거나 갱신합니다.
- Feature마다 `design.md`를 만드는 방식을 기본값으로 사용하지 않습니다.
- 기존 프로젝트의 문서 구조를 마이그레이션하거나 이 문서를 필수 gate로 만들지 않습니다.

## 문서별 책임

### `docs/designs/design-system.md`

여러 Feature가 공유하는 장기적인 의미와 사용 규칙을 기록합니다.

- semantic color tokens
- typography
- spacing과 layout
- radius, border, shadow
- 공통 component와 variant
- loading, empty, error, processing 같은 상태 표현
- responsive 규칙
- accessibility와 motion 규칙
- content voice
- 디자인 시스템 변경, deprecation, 동기화 정책

이 파일에는 다음 frontmatter를 사용합니다.

```yaml
---
lee-spec-kit:
  kind: design-system
  scope: project
---
```

### `docs/designs/<feature-visual-brief>.md`

특정 Feature의 UX 방향과 시각 참조를 기록합니다.

- Figma 원본 URL과 필요한 repo 내부 snapshot
- 디자인 이미지와 참고 화면
- 화면/flow별 의도와 핵심 상태
- 현재 데이터/API 계약과 시안 사이의 차이
- 적용할 `design-system.md` 규칙과 Feature 전용 해석

내용에 따라 `kind: ux-design` 또는 `kind: visual-reference`, `scope: project` frontmatter를 사용합니다. 이 문서는 Feature의 시각적 참조 정본이지만 요구사항, 구현 계획, 기술 결정의 정본을 대체하지 않습니다.

### Feature `spec.md`

- 사용자 요구사항과 acceptance criteria를 유지합니다.
- 관련 문서의 선택적 `Design Refs`에 design system과 visual brief의 프로젝트 루트 기준 경로를 연결합니다.

### Feature `plan.md`

- token/theme 파일, 공통 component, route/screen, Storybook 또는 동등한 workbench의 변경 범위를 기록합니다.
- 디자인 규칙을 실제 코드와 테스트에 적용하는 방법을 기록합니다.

### Feature `decisions.md`

- 디자인 시스템을 바꾸거나 예외를 두는 이유를 기록합니다.
- 예외의 적용 범위, 영향 받는 규칙, 제거 조건을 함께 기록합니다.

## 실행 가능한 정본과 역할 분리

`design-system.md` 하나만 단독 SSOT로 취급하지 않습니다.

| 대상                              | 책임                              |
| --------------------------------- | --------------------------------- |
| `docs/designs/design-system.md`   | 의미, 의도, 사용 규칙             |
| CSS theme/globals 또는 token 파일 | 실행되는 실제 token 값            |
| 공통 UI 디렉터리                  | 실제 component API와 variant 계약 |
| Storybook 또는 동등한 workbench   | variant와 상태의 실행 가능한 예시 |
| Feature `decisions.md`            | 예외, 변경 이유, 제거 조건        |

문서가 의미를 설명하고 코드와 workbench가 실행 가능한 계약을 증명하도록 유지합니다.

## 동기화 규칙

- `design-system.md`가 바뀌는 Feature에서는 `tasks.md`의 같은 task에 영향 받는 디자인 문서, token/theme, 공통 UI, Storybook/workbench, 관련 검증을 구체적으로 적습니다.
- 실제 영향이 없는 영역을 억지로 변경하지는 않지만, 영향 여부를 task checklist에서 확인합니다.
- 문서와 코드가 달라지면 같은 Feature task 안에서 영향을 받는 문서와 실행 가능한 정본을 함께 동기화합니다.
- 디자인 시스템 예외는 `decisions.md`에 이유와 제거 조건을 남깁니다.
- visual reference 파일은 `docs/designs/assets/<feature-name>/`처럼 repo 내부 경로에 보관하고 개인 컴퓨터의 절대 경로에 의존하지 않습니다.
- 외부 Figma나 원본 URL은 출처로 유지하되, 구현에 필요한 고정 snapshot이 있으면 repo 내부 asset도 함께 참조합니다.

## 하위 호환성

- `design-system.md`, visual brief, `Design Refs`는 모두 선택 사항입니다.
- 기존 Feature 문서에 새 section을 backfill할 필요가 없습니다.
- 이 정책은 spec/plan/tasks 승인 단계나 `workflow-stage` 결과를 변경하지 않습니다.
- UI/UX 감지 조건을 충족하지 않는 요청에는 기존 Feature 문서 흐름만 사용합니다.

# Feature Spec: {기능명}

> 기술 스택은 plan.md에서 다룹니다.

---

## 개요

- **기능 ID**: F{번호}
- **기능명**: {기능명}
- **대상 레포**: {{projectName}}-{component}
- **작성일**: {YYYY-MM-DD}
- **상태**: -
  - 값: Draft | Review | Approved

---

## 목적

{{description}}

(이 기능이 왜 필요한지, 어떤 문제를 해결하는지)

---

## Spec 결정 확인

- **Clarification Status**: Pending
- **Clarification Summary**: -

상태 값은 Pending | Complete이며 필드명과 값은 영문 그대로 유지합니다. Complete 전에는 조사와 기존 답변으로 추가 질문이 불필요한 이유 또는 기록된 결정을 범위·인수 조건에 어떻게 반영했는지 요약합니다. 자리표시자 요약으로 완료하지 않습니다.

질문은 [decisions.md](decisions.md)에 실제 `## SC-01: 제목`으로 기록합니다(`###`도 허용). D001 ADR과 번호를 분리하며 OPEN 질문은 완료를 막습니다. RESOLVED·DELEGATED·DEFERRED 기록마다 구체적인 Answer, Decision, Spec Refs가 필요합니다. 각각 실제 사용자 답변, 명시적 사용자 위임과 에이전트의 선택·범위, 명시적 사용자 보류 합의와 제외 범위·후속 조치를 기록합니다. 침묵이나 시간 초과는 동의가 아닙니다.

먼저 사실을 조사하고 제품·범위·인수 조건·호환성에 관한 독립적인 선택을 한 번에 clarificationPolicy.maxQuestionsPerRound개까지(설정 workflow.specClarification.maxQuestionsPerRound, 기본 3) 선택지·권고안·장단점과 함께 질문합니다. 필요한 답변을 기다린 뒤 종속 질문을 이어가며 기존 답변을 재사용하고 일상적인 구현 세부사항은 묻지 않습니다. 답변과 인수 조건은 같은 턴에 반영합니다. 새 범위·동작의 중대한 변경은 관련 선택을 다시 열고 Pending으로 되돌립니다. 질문 중 HTML 보고서는 초안이며 기존 Spec 승인 전에 갱신합니다. 리뷰 maxRounds로 질문을 자동 완료하지 않습니다.

---

## 변경 전후 비교

- **비교 보고서**: [As-Is / To-Be](artifacts/change-report.html)
- Spec 검토 전에 보고서를 작성하고 함께 제시합니다. 작성 기준은 `npx lee-spec-kit docs get create-feature --json`을 따릅니다.
- 같은 사용자 시나리오를 기준으로 현재 상태와 변경 후 동작을 비교합니다. 신규 기능이면 현재의 부재 또는 수동 대체 절차를 설명합니다.

| 비교 항목 | As-Is: 현재 상태와 근거 | To-Be: 제안 동작 | 관련 요구사항 / 확인 방법 |
| --- | --- | --- | --- |
| {핵심 시나리오} | {현재 코드·화면·관찰 근거 또는 미확인} | {변경 후 기대 동작} | {US/FR/AC 및 검증 방법} |

---

## 사용자 스토리

### US-1: {스토리 제목}

**As a** {사용자 유형}
**I want** {원하는 것}
**So that** {이유/가치}

**Acceptance Criteria:**

- [ ] (검증 조건)

---

## 기능 요구사항

### FR-1: {요구사항 제목}

(상세 설명)

---

## 비기능 요구사항

- **성능**:
- **보안**:

---

## 관련 문서

- PRD: `../../prd/`
- PRD Refs: - (예: `PRD-FR-001`, `PRD-US-002`, `PRD-SCOPE-V1-DESKTOP-EDITOR`)
  - 이미 원문 요구사항 문서에 정의된 ID만 적으세요. `spec.md`나 `tasks.md`에서 임의로 PRD ID를 만들지 않습니다.
  - 레거시 요구사항 문서에 아직 PRD ID가 없다면, 먼저 원문에 ID를 backfill한 뒤 이 필드와 `tasks.md` 태스크 태그를 함께 갱신하세요.
  - 요구사항/스코프 변경 시 PRD 문서 + 이 필드 + `tasks.md` 태스크 태그를 함께 갱신하세요.
  - 구현 중 더 나은 사용자 동작이 발견되어 최종 요구사항이 바뀌었다면, 이를 영구적인 `[NON-PRD]` 예외로 두지 말고 PRD 업데이트로 취급하세요.
- Design Refs: - (선택 사항, 명시적인 UI/UX 디자인 작업에만 프로젝트 루트 기준 경로 사용)
  - Design System: - (예: `docs/designs/design-system.md`)
  - Visual Brief: - (예: `docs/designs/<feature-visual-brief>.md`)

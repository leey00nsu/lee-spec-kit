# Implementation Plan: {기능명}

> 스펙이 승인된 후 작성합니다.
> canonical docs surface 밖의 unmanaged docs 산출물(예: `docs/plans/*`, `docs/superpowers/*`)이 있더라도, 아키텍처/파일/테스트 내용은 이 파일로 흡수하고 최종 SSOT는 여기로 유지합니다.

---

## 개요

- **기능 ID**: F{번호}
- **대상 레포**: {{projectName}}-{component}
- **작성일**: {YYYY-MM-DD}
- **상태**: -
  - 값: Draft | Review | Approved
- **Plan 검수**: Pending
  - 값: Pending | Running | Done
- **Plan 검수 Evidence**: -
  - 예: `docs/features/F001-foo/decisions.md` 또는 docs 루트 아래의 실제 리뷰 산출물
- **Plan 검수 Decision**: -
  - 형식: `결정: approve|changes_requested|blocked ...` 또는 `decision: ...`
- **Plan 검수 Round**: -
  - `workflow-stage --json`이 반환한 양의 정수이며 첫 리뷰는 `1`
- **Plan 검수 Spec Hash**: -
  - `workflow-stage --json`이 반환한 정확한 `specHash`
- **Plan 검수 Plan Hash**: -
  - `workflow-stage --json`이 반환한 정확한 `planHash`

---

## 기술 스택

| 구분 | 선택 | 이유 |
| ---- | ---- | ---- |

---

## 아키텍처

(컴포넌트 구조, 데이터 흐름)

---

## 파일 구조

```
src/
├── ...
```

---

## Curated Documentation Impact

> 모든 결정이 `NONE`이어도 영향 판정을 완료합니다. `NONE`은 사람이 관리하는 상위 문서를 검토했지만 변경할 필요가 없다는 뜻입니다. 생성형 OpenWiki 동기화는 별도로 판정합니다.

- **Schema**: 2
- **Assessment**: Pending
  - 값: Pending | Complete
- **Product requirements**: -
  - 값: NONE | UPDATE | ADD
- **System architecture**: -
  - 값: NONE | UPDATE | ADD
- **Onboarding entrypoint**: -
  - 값: NONE | UPDATE | ADD
- **Operational/runtime contract**: -
  - 값: NONE | UPDATE | ADD
- **Reason**: -
- **Targets**: -
  - UPDATE 또는 ADD가 하나라도 있으면 쉼표로 구분한 `docs:<path>`와 `project:<path>` 대상을 기록합니다.
  - 모든 대상은 task `Docs` 목록에 연결하고 Knowledge 동기화 또는 Feature 리뷰 전에 활성 Feature scope로 커밋합니다.

---

## Additional Curated Impacts

> constitution/custom, 디자인 시스템, API·데이터, 보안, 배포, 관측성처럼 조건부로 존재하는 상위 문서를 판정합니다. 해당 영향이 없으면 `Decision: NONE`을 명시하고 표는 비워 둡니다.

- **Assessment**: Pending
- **Decision**: -
  - 값: NONE | DECLARED

| Kind | Decision | Target | Reason |
| ---- | -------- | ------ | ------ |
| -    | -        | -      | -      |

허용 Kind: `engineering-agent-policy`, `design-system-ux`, `api-data-contract`, `security-privacy`, `release-deployment`, `observability`, `other-curated`

`DECLARED` 행의 Decision은 `UPDATE` 또는 `ADD`이고, Target은 `docs:<path>` 또는 `project:<path>`여야 합니다. 모든 Target은 task `Docs` 목록에 연결합니다.

---

## Verification Contract

### 변경 분류

- **유형**: COPY | REFACTOR | BUG_FIX | NEW_BEHAVIOR | HIGH_RISK
- **위험도**: LOW | MEDIUM | HIGH

### 관찰 가능한 계약

- **지원해야 하는 동작**:
- **전제조건**:
- **성공 후 보장**:
- **중요한 실패 후 보장**:
- **의도적으로 지원하지 않는 사례**:

### 테스트 결정

| 계약 / 요구사항 | 결정                  | 테스트 수준                     | 보호할 현실적인 회귀 | 독립적인 Oracle            |
| --------------- | --------------------- | ------------------------------- | -------------------- | -------------------------- |
| (AC/FR 참조)    | NONE \| UPDATE \| ADD | 단위 \| 통합 \| E2E \| 비테스트 | (방지할 실패)        | (스펙/출시 동작/외부 기준) |

### 의도적으로 제외하는 테스트

- (중복, 구현 세부사항, 비지원 합성 입력, 프레임워크 자체 동작 등)

### 검증 실행

- **구현 중**:
- **태스크 완료 전**:
- **Feature 완료 전**:
- **수동/UI 검증**:
- **전체 테스트 필요 여부**: Yes | No — (이유)

---

## 관련 문서

- Spec: [spec.md](./spec.md)
- Decisions: [decisions.md](./decisions.md)

# Decisions Log

기술 결정과 그 이유를 기록합니다.
canonical docs surface 밖의 unmanaged docs 산출물(예: `docs/plans/*`, `docs/superpowers/*`)이 있더라도, 실제로 채택한 대안과 선택 이유는 이 파일에 다시 남겨 Feature의 결정 이력을 유지합니다.

> ADR(Architecture Decision Record)은 구현 중 내린 중요한 기술/구조 결정을 남기는 기록입니다.
> 나중에 "왜 이렇게 만들었는지"를 추적하고, 팀 합의를 재확인하기 위해 작성합니다.

> 형식: `DNNN: {결정 제목} ({YYYY-MM-DD})`
> 결정 ID는 Feature별로 독립된 번호를 사용하며 Feature ID와 관계없이 `D001`부터 시작합니다.

기록 원칙:

- 새 ADR 생성에는 `npx lee-spec-kit decision add <feature-ref> --title "..." --context "..." --decision "..." --rationale "..." --evidence "..."` 사용을 우선하세요.
- 수동 작성도 마지막 ADR 뒤에 추가해 D001 → D002 순서를 유지하세요. 문서 안내문 앞에 삽입하거나 기존 ID를 재번호화하지 마세요. 같은 결정의 재실행·검증 결과는 해당 ADR의 Trace/Evidence를 갱신하고, 새 선택이나 범위 변경일 때만 새 ADR을 만드세요.
- 모든 ADR은 **Decision(무엇을 선택했는가)** + **Trace(어떻게 고민했고 무엇을 확인했는가)** 를 함께 남깁니다.
- 작성 타이밍을 고정합니다.
  - 태스크 시작(`[TODO] -> [DOING]`): `Context/Constraints`와 `Trace(초기 가설)`를 1~3줄로 먼저 기록
  - 태스크 완료 직전(`[DOING] -> [DONE]`): `Options/Decision/Rationale`를 최종화하고 `Trace`를 보강
  - PR 머지 후: 실제 결과/영향을 `Trace(머지 후 확인)`에 1~2줄 추가
- 모든 ADR에는 최소 1개 이상의 **Evidence 링크**(커밋/PR/테스트 로그 중 하나 이상)를 남깁니다.
- 디자인 시스템 변경이나 예외를 기록할 때는 영향 받는 규칙과 범위, 예외 이유, 제거 조건, 실행 가능한 정본의 동기화 영향을 함께 남깁니다.

---

## Spec 결정 확인

질문은 첫 ADR 추가 시에도 보존되도록 D001 ADR 섹션 앞에 기록합니다. 실제 `## SC-01: 제목`(`###`도 허용)을 사용하고 D001 번호와 독립적으로 SC-02부터 이어갑니다. 아래 fenced 예시는 안내일 뿐 seed의 실제 OPEN 질문이 아닙니다. 실제 질문이 있을 때만 fence 밖으로 복사합니다. 두 언어 모두 필드명과 상태 값은 영문 그대로 유지합니다.

Status 값은 OPEN | RESOLVED | DELEGATED | DEFERRED입니다. OPEN은 Spec 결정 확인 완료를 막습니다. 모든 종결 기록의 Answer, Decision, Spec Refs에는 자리표시자가 아닌 구체적인 내용이 필요합니다. RESOLVED는 실제 사용자 답변과 그에 따른 결정을 기록합니다. DELEGATED는 사용자의 명시적 위임과 에이전트가 내린 선택·적용 범위를 기록합니다. DEFERRED는 사용자의 명시적 보류 합의, 제외 범위와 구체적인 후속 조치를 기록하고 Spec Refs로 해당 범위·인수 조건을 연결합니다. 침묵·기본값·시간 초과·리뷰 maxRounds 소진을 동의로 간주하지 않습니다.

질문 전에 사실을 조사하고 기존 답변을 재사용합니다. 제품·범위·인수 조건·호환성에 관한 독립적인 선택을 한 번에 clarificationPolicy.maxQuestionsPerRound개까지(설정 workflow.specClarification.maxQuestionsPerRound, 기본 3) 선택지·권고안·장단점과 함께 질문하고 필요한 답변을 기다린 뒤 종속 질문을 이어갑니다. 일상적인 구현 세부사항은 묻지 않습니다. 답변과 Spec 범위·인수 조건은 같은 턴에 반영합니다. 새 범위·동작의 중대한 변경은 관련 선택을 다시 열고 이전 답변을 이력으로 보존하며 Spec의 Clarification Status를 Pending으로 되돌립니다. 모든 기록이 유효한 종결 상태이고, 질문이 불필요한 이유나 결정 반영 내용을 실질적으로 설명하는 Spec의 Clarification Summary가 있을 때만 Complete로 바꿉니다.

```markdown
## SC-01: {제품 또는 범위 선택}

- **Status**: OPEN
- **Question**: {사용자 입력이 필요한 선택}
- **Options**: {대안과 각 장단점}
- **Recommendation**: {권고안과 이유}
- **Answer**: -
- **Decision**: -
- **Spec Refs**: -
```

---

## D001: {결정 제목} ({YYYY-MM-DD})

- **Context**: 문제 상황 또는 배경
- **Constraints**: 제약 조건 (시간/기술/운영/호환성)
- **Options**: 고려한 대안들
- **Decision**: 최종 선택
- **Rationale**: 선택 이유
- **Trace**:
  - **DOING 시작 시점**: 초기 판단/가설
  - **DONE 전 확정 시점**: 선택 근거 최종화
  - **머지 후 확인**: 실제 결과/영향
- **Evidence**:
  - **Commit**: 커밋 해시 또는 링크
  - **PR**: PR 링크
  - **Test/Log**: 테스트 결과/로그/스크린샷 경로
- **Consequences**: 결과 및 영향 (선택사항)

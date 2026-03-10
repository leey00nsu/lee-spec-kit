# 태스크 실행 프로세스: CLI 주도형

기능 구현(tasks.md) 단계에서 태스크를 하나씩 실행할 때 따르는 가이드입니다.
에이전트는 자신의 판단을 신뢰하지 않고, 오직 **CLI 도구의 지시**에 따라 행동합니다.

---

## 🔄 The Execution Loop (실행 반복)

모든 태스크가 완료될 때까지(`[DONE]`) 다음 과정을 **계속 반복**하세요.

### 1단계: 할 일 확인

작업을 시작하거나 하나를 마칠 때마다 **반드시** 아래 명령어를 실행합니다.

```bash
npx lee-spec-kit context
```

### 2단계: 태스크 수행 (Action)

CLI가 가리키는 **Active Task** 또는 **`👉 Next Options (Atomic)`의 단일 옵션**을 수행합니다.

- **[DOING] 상태인 태스크가 있다면**: 해당 태스크를 최우선으로 완료하세요.
- 태스크 상태 전환 규칙은 `tasks.md`의 **"태스크 규칙"** 섹션을 SSOT로 따릅니다.
- 승인 대기 여부는 `context --json-compact`의 `approvalRequest.required`를 SSOT로 따릅니다. (`--json`은 상세 디버깅이 필요할 때만 사용) `false`면 라벨 승인 없이 진행하고, `true`면 라벨 규칙(`A`, `A OK`)으로 승인 후 진행합니다.
- 기본 실행 모델은 **메인 에이전트 오케스트레이션 + 서브에이전트 소유 run 상태의 우선 위임 실행**입니다. `context --json-compact`에 `matchedFeature.currentSubstateId/currentSubstateOwner/currentSubstatePhase`가 있으면 그것을 실행 상태 SSOT로 사용합니다.
- 메인 에이전트는 승인 경계, 상태 전이, record/commit 단계, 원격 작업을 담당합니다. `subagent` 소유 command substate(예: `task_run`, `pre_pr_review_run`, `code_review_run`, auto-run handoff command)는 서브 에이전트 실행이 기본입니다.
- `pre_pr_review`는 `pre_pr_review_run`(서브 에이전트 리뷰 실행)과 `pre_pr_review_record`(메인 에이전트의 결과 기록)로 분리됩니다.
- PR 리뷰도 같은 패턴입니다. `code_review_run`은 서브 에이전트 리뷰/수정 실행 상태이고, push/merge/최종 결정은 메인 에이전트 finalize 상태에 남깁니다.
- 위임 판단은 `matchedFeature.currentSubstateOwner`와 `agentOrchestration.subAgentHandoff`를 SSOT로 우선 사용하세요.
- `matchedFeature.currentSubstateOwner="subagent"`이고 `agentOrchestration.subAgentHandoff.required=true`이며 `mode="command"`면 위임이 필수입니다. 먼저 `spawn_agent`를 호출하고, 해당 명령을 메인 에이전트에서 직접 실행하지 않습니다.
- `autoRun.available`만으로 auto 루프 위임을 결정하지 않습니다. `agentOrchestration.subAgentHandoff.required=true`이고 `agentOrchestration.subAgentHandoff.mode="auto_run"`일 때만 auto 루프를 서브 에이전트에 위임합니다.
- `agentOrchestration.subAgentHandoff`를 최소 handoff 계약(`featureRef`, `category`, `cwd`, `cmd`)으로 사용합니다.
- `subAgentHandoff.verify.commands`(`pwd`, `git rev-parse --show-toplevel`)은 `verify.cacheKey` 기준 세션당 1회만 실행합니다. 불일치 시 즉시 중단/보고하고, 상세 로그는 불일치 시에만 수집합니다.
- 메인 에이전트 fallback은 서브 에이전트 실행이 불가능한 경우(예: 도구 미지원, spawn 실패, 명령 실행 전 서브 에이전트 실패)에만 허용합니다. fallback 실행 전에는 사유를 사용자에게 한 줄로 먼저 알립니다.
- `context --json-compact`에 `autoRun.available=true`가 있으면 `autoRun.command`를 사용해 승인 필요 카테고리 전까지 자동 진행할 수 있습니다.
- 장시간 자동 실행이 필요하면 `flow <feature> --auto-... --start-auto --json-compact`으로 run id를 생성하고, 중단/압축 후에는 `autoRun.run.resumeCommand`(`flow --resume <RUN_ID>`)를 우선 사용해 재개합니다. (상세 디버깅 필드가 필요할 때만 `--json`)
- auto 실행이 중단되면 `flow --json-compact`(또는 `flow --json`)의 `autoRun.resume`를 SSOT로 따릅니다. 컨텍스트 압축/리셋 후에는 `autoRun.resume.flowCommand`로 재개하고, 필요 시 `autoRun.resume.contextCommand`로 상태를 먼저 확인합니다.
- `AUTO_MANUAL_REQUIRED`는 실패가 아니라 자동화 경계(현재 instruction-only 구간)입니다. 즉시 오류로 단정하지 말고 현재 `context --json-compact`를 다시 확인한 뒤 승인 필요 여부(`approvalRequest.required`)를 보고합니다.
- CLI가 명령어를 출력하면 **그대로 복사해 실행**합니다. (standalone 환경에서도 레포 경로가 포함될 수 있습니다)
- 사용자 응답 포맷은 `agents.md`의 **"라벨 응답 계약 (SSOT)"** 을 따릅니다. 라벨 문구는 승인 대기 상태에서만 보여주고, CLI가 준 승인 문구를 임의로 바꾸지 않습니다.
- 승인된 command 옵션 실행은 `npx lee-spec-kit flow <slug|F001|F001-slug> --approve <LABEL> --execute`를 기본으로 사용하고, `context --approve`와 `context --execute --ticket` 분리 실행은 지양합니다.

### 3단계: 기록 및 반복 (Record & Loop)

#### 3-1) Decision 기록 (매우 권장, 사실상 필수)

에이전트가 “왜 이렇게 구현했지?” 라는 질문에 답할 수 있도록, **비직관적이거나 선택의 여지가 있었던 구현**이 들어갔다면 `decisions.md`에 반드시 기록합니다.

다음 중 하나라도 해당되면 기록하세요:

- 구현 방식에 대한 **트레이드오프(성능/안정성/보안/유지보수성)** 가 있었다
- **새로운 규칙/휴리스틱/상태 전이**가 추가되었다 (예: context 판단 로직, 예외 처리 기준)
- 사용자가 “왜 이렇게 했나요?” 라고 **이유/근거**를 물었다
- 사용자가 “이렇게 바꿔주세요” 처럼 **직접 변경을 요청**했다 (요구사항/정책/기준 변경 포함)
- 기존 동작을 **호환성/버그 회피** 목적으로 변경했다
- 데이터 구조/파일 구조/CLI 출력 규칙이 바뀌었다
- “나중에 보면 헷갈릴 것 같은” 결정이 있었다

작성 시점 규칙:

- 태스크를 `[DOING]`으로 전환할 때 `Context/Constraints`와 `Trace(초기 가설)`를 1~3줄로 먼저 기록합니다.
- 태스크를 `[DONE]`으로 전환하기 전에 `Options/Decision/Rationale`를 최종화하고 `Trace(확정 근거)`를 보강합니다.
- PR 머지 후 `Trace(머지 후 확인)`에 실제 결과/영향을 1~2줄로 추가합니다.

증거 링크 규칙:

- 모든 ADR에는 최소 1개 이상의 Evidence 링크(커밋/PR/테스트 로그 중 하나 이상)를 남깁니다.
- 가능하면 `Commit`, `PR`, `Test/Log` 3가지를 모두 채우고, 미해당 항목은 `N/A`로 명시합니다.

최종 형식은 Feature의 `decisions.md` 템플릿을 따릅니다. (Context/Constraints/Options/Decision/Rationale/Trace/Evidence/Consequences)

#### 3-2) 태스크/체크리스트 업데이트 + 커밋

1. 작업이 끝나면 결과/검증을 공유하고, 승인 대기(`approvalRequest.required=true`) 상태라면 승인(OK) 후 `[DONE]`으로 변경합니다. 이후 `Acceptance/Checklist` 항목을 `[x]`로 체크합니다.
2. **한 번에 하나의 태스크만** `[DONE]` 처리합니다. (태스크 2개 이상을 한 번에 완료/커밋으로 묶지 않기)
3. `tasks.md`의 테스트 실행 기록은 명령어별 1개 행만 유지하고, 같은 명령어 재실행 시 날짜/결과를 갱신합니다. (중복 누적 금지, 날짜 형식: 로컬 `YYYY-MM-DD`)
4. 커밋을 생성합니다 (코드 커밋 + 문서 커밋). 태스크 단위로 커밋이 남아야 합니다.
   - `context`에 `[확인 필요]`가 보이면, **커밋/푸시 같은 원격 작업은 사용자에게 커밋 메시지/포함 파일을 공유하고 OK를 받은 뒤** 실행합니다.
5. 모든 태스크가 `[DONE]`가 되면, "완료 조건" 체크리스트를 사용자에게 공유하고 **최종 승인(OK)** 을 받은 뒤 체크합니다. (특히 **최종 사용자 승인(OK) 완료** 항목)
   - 참고: `문서 상태(Review→Approved)`는 **진행 승인(OK)** 이고, 완료 조건의 승인은 **최종 승인(OK)** 입니다.
6. **즉시 1단계로 돌아가** 다음 할 일을 CLI에게 물어봅니다.

---

## 🛑 절대 금지 사항 (Strict Rules)

1. **병렬 처리 금지**: 한 번에 하나의 태스크만 `[DOING]`으로 만드세요.
2. **임의 건너뛰기 금지**: CLI가 가리키는 순서대로 진행하세요.
3. **완료된 태스크 수정 금지**: 이미 `[DONE]` 된 태스크는 절대 건드리지 마세요. 수정이 필요하면 새 태스크를 추가하세요.

---

## 참조: 태스크 상태 전환 규칙

> ⚠️ 직접 판단하지 말고 CLI가 시키는 대로 하세요.

태스크 상태 전환/승인 규칙은 `tasks.md`의 **"태스크 규칙"** 섹션을 따르세요.

## 비상시 대처 (Emergency)

만약 CLI가 이상한 태스크를 가리키거나 멈춘다면, 사용자가 직접 `tasks.md`를 수동으로 수정하도록 요청하세요. 에이전트가 임의로 판단하지 마세요.

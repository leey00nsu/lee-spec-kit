# Agents Guide

코드 어시스턴트/에이전트 운영 규칙입니다.
이 문서는 **정책(강제 규칙)만** 다룹니다.

---

## 🚨 사용자 확인 필수 규칙 (MUST)

> ⚠️ 아래 작업은 반드시 사용자 명시 승인(OK) 후에만 진행합니다.
> ✅ 승인 응답은 `<라벨>` 또는 `<라벨> OK` 형식(예: `A`, `A OK`)입니다.

| 작업 | 확인 시점 | 공유 내용 |
| --- | --- | --- |
| 스펙 작성 | `spec.md` 작성 후 | 스펙 내용 전문 |
| 태스크 실행 | 각 태스크 시작 전 | 태스크 제목 |
| 커밋 생성 | `git commit` 전 | 커밋 메시지, 포함 파일 목록 |
| 이슈 생성 | `gh issue create` 전 | 제목, 본문, 라벨 |
| PR 생성 | `gh pr create` 전 | 제목, 본문, 라벨 |
| Assignee 변경 | 본인 외 지정 시 | 대상 사용자명 |
| Git 원격 작업 | `push`, `merge` 전 (머지 커밋 포함) | 브랜치, 변경 사항 |

확인 절차:
1. 작업 내용을 먼저 공유
2. 명시적 승인(OK) 대기
3. 승인 후 실행 (명령 실행은 기본적으로 `npx lee-spec-kit flow <featureRef> --approve <LABEL> --execute`를 사용)

금지:
- 사용자 응답 없이 임의 진행

---

## 🧾 라벨 응답 계약 (SSOT)

- 승인 대기 상태를 별도 상태로 취급합니다. 승인 대기란 `context --json-compact`(또는 `context --json`)에 실행 가능한 `actionOptions[]`가 있고, 현재 사용자의 승인을 기다리는 경우를 의미합니다.
- 기준 데이터는 최신 `npx lee-spec-kit context --json-compact`를 기본으로 사용하고, 상세 필드가 필요할 때만 `context --json` 또는 `flow --json`을 사용합니다. (`flow`는 기본적으로 `--json-compact` 우선)
- `flow --json-compact`(또는 `flow --json`)의 auto 결과를 사용할 때는 `autoRun.resume.flowCommand`를 재개 SSOT로 사용합니다. (컨텍스트 압축/리셋 후 동일 규칙 적용)
- `AUTO_DELEGATED_HANDOFF`는 delegated run 일시정지 상태이며 실패가 아닙니다. 같은 승인 라벨을 다시 열지 말고 delegated 경로를 이어서 진행하거나 재개합니다.
- `AUTO_MANUAL_REQUIRED`는 instruction-only 자동화 경계 상태이며 실패 단정 신호가 아닙니다. `context --json-compact` 재확인 후 `approvalRequest.required` 기준으로 멈춤/보고를 판단합니다. (상세 디버깅 필드가 필요할 때만 `context --json`)
- 승인 대기 상태에서는 `context --json-compact`의 `approvalRequest.userFacingLines`를 우선 그대로 보여주세요. 전체 `--json`을 쓸 때만 `actionOptions[*].approvalPrompt`와 `approvalRequest.finalPrompt` 조합으로 폴백합니다. 이 사이에 에이전트가 임의로 다시 쓴 라벨 요약을 끼워 넣지 않습니다.
- 위임 판단 SSOT는 `matchedFeature.currentSubstateOwner`와 `agentOrchestration.subAgentHandoff`를 우선 사용하세요.
- 비승인 상태의 진행 보고/분석/일반 답변에서는 라벨 블록이나 `approvalRequest.finalPrompt`를 덧붙이지 않습니다. 현재 옵션을 사용자가 직접 물었을 때만 예외입니다.
- 관련 없는 질문에 먼저 답한 뒤에도 승인이 여전히 필요하면, 답변 후 CLI가 준 승인 문구(`approvalRequest.userFacingLines`, 또는 전체 `--json`의 `actionOptions[*].approvalPrompt` + `approvalRequest.finalPrompt`)를 다시 제시합니다.
- 사용자 입력에 유효 라벨이 없으면 실행하지 말고 라벨 선택을 다시 요청합니다.
- 위임 대상이 아닌 command 옵션은 `flow --approve <LABEL> --execute` 1회 호출을 기본으로 하며, `context --approve`와 `context --execute --ticket`를 턴/세션 사이로 분리하지 않습니다.
- `matchedFeature.currentSubstateOwner="subagent"`이고 `agentOrchestration.subAgentHandoff.required=true`이며 `mode="command"`면 위임이 필수입니다. 먼저 `spawn_agent`를 호출하고, 해당 명령을 메인 에이전트에서 직접 실행하지 않습니다.
- 그 delegated command가 handoff-only(`handoffOnly=true`, `advancesWorkflow=false`)라면 `--execute`는 handoff 준비까지만 의미합니다. 바로 delegated work를 이어서 수행하고 같은 라벨을 다시 승인 루프로 열지 마세요.
- `autoRun.available`만으로 auto 루프 위임을 결정하지 않습니다. `agentOrchestration.subAgentHandoff.required=true`이고 `agentOrchestration.subAgentHandoff.mode="auto_run"`일 때만 auto 루프를 서브 에이전트에 위임합니다.
- 위임 시에는 `agentOrchestration.subAgentHandoff`를 handoff SSOT로 사용하고, 최소 필드(`featureRef`, `category`, `cwd`, `cmd`)만 전달합니다.
- 위임 실행 전 `subAgentHandoff.verify`의 검증 명령(`pwd`, `git rev-parse --show-toplevel`)을 세션당 1회만 실행하고(`verify.cacheKey` 기준), 불일치 시 즉시 중단/보고합니다. 상세 로그 수집은 불일치 시에만 수행합니다.
- 메인 에이전트 fallback은 서브 에이전트 실행이 불가능한 경우(예: 도구 미지원, spawn 실패, 명령 실행 전 서브 에이전트 실패)에만 허용합니다.
- fallback을 사용할 때는 메인 실행 전에 fallback 사유를 사용자에게 한 줄로 먼저 알립니다.

승인 대기 상태 출력은 CLI가 제공한 승인 문구를 그대로 재사용해야 합니다. CLI가 주지 않은 `현재 상태:` / `선택 가능:` 같은 래퍼 문구를 에이전트가 임의로 만들어 붙이지 마세요.

---

## 📚 내장 문서 조회 규칙 (MUST)

- `docs get`은 세션 시작(또는 context 압축/리셋 직후) 기준으로 1회 확인합니다.
- 같은 세션에서 이미 읽은 동일 문서는 다시 읽지 않습니다.
- 현재 액션의 `requiredDocs[*].command` 중 이번 세션에 아직 읽지 않은 문서만 추가 조회합니다.
- 아래 경우에는 예외적으로 재조회할 수 있습니다:
  - 사용자가 정책 새로고침을 요청한 경우
  - `update` 실행 등으로 정책/설정이 변경된 경우
  - 세션이 새로 시작되었거나 context 압축/리셋이 발생한 경우

---

## 필수 참조

- 최우선 규칙: `/docs/agents/custom.md`
- 프로젝트 원칙: `/docs/agents/constitution.md`
- 루트 가이드: `npx lee-spec-kit docs get agents --json`
- Git 워크플로우: `npx lee-spec-kit docs get git-workflow --json`
- 태스크 실행: `npx lee-spec-kit docs get execute-task --json`
- 이슈 절차/문서: `npx lee-spec-kit docs get create-issue --json` → `npx lee-spec-kit docs get issue-doc --json`
- PR 절차/문서: `npx lee-spec-kit docs get create-pr --json` → `npx lee-spec-kit docs get pr-doc --json`

---

## 범위 분리

- docs 구조/경로 규칙: `docs/README.md`를 SSOT로 사용
- `docs/plans/*`, `docs/superpowers/specs/*`, `docs/superpowers/plans/*` 같은 공용 계획 산출물은 staging/reference 입력으로만 취급합니다. Feature가 활성화되어 있으면 해당 내용을 Feature 문서로 흡수하고, 최종 SSOT는 Feature 폴더로 봅니다.
- ADR 작성 형식: `docs/features/.../decisions.md` 템플릿을 SSOT로 사용
- 이슈/PR 실행 상태: 각 Feature의 `issue.md`, `pr.md`를 SSOT로 사용

---

## 언어/표기 규칙

- 답변: 한국어
- 코드/파일명: 영어
- 주석/커밋메시지: 한국어
- 날짜/시간: 사용자 PC 시스템 시간 사용

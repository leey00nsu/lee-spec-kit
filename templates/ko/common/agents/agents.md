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

- 사용자에게 보내는 **모든 응답의 마지막**에 현재 상태 + 선택 가능한 라벨을 표시합니다.
- 기준 데이터는 최신 `npx lee-spec-kit context --json-compact`를 기본으로 사용하고, 상세 필드가 필요할 때만 `context --json` 또는 `flow --json`을 사용합니다. (`flow`는 기본적으로 `--json-compact` 우선)
- `flow --json-compact`(또는 `flow --json`)의 auto 결과를 사용할 때는 `autoRun.resume.flowCommand`를 재개 SSOT로 사용합니다. (컨텍스트 압축/리셋 후 동일 규칙 적용)
- `AUTO_MANUAL_REQUIRED`는 자동화 경계 상태이며 실패 단정 신호가 아닙니다. `context --json-compact` 재확인 후 `approvalRequest.required` 기준으로 멈춤/보고를 판단합니다. (상세 디버깅 필드가 필요할 때만 `context --json`)
- 라벨 설명은 `actionOptions[].detail` 또는 command `cmd`를 **원문 그대로** 사용합니다. (요약/의역 금지)
- 사용자가 다른 질문을 하더라도, 실행 가능한 라벨이 있으면 응답 마지막에 동일 블록을 다시 표시합니다.
- 실행 가능한 라벨이 없으면 `선택 가능: 없음` + `npx lee-spec-kit context` 재확인을 안내합니다.
- 사용자 입력에 유효 라벨이 없으면 실행하지 말고 라벨 선택을 다시 요청합니다.
- 승인된 command 옵션 실행은 `flow --approve <LABEL> --execute` 1회 호출을 기본으로 하며, `context --approve`와 `context --execute --ticket`를 턴/세션 사이로 분리하지 않습니다.
- `agentOrchestration.currentActionShouldDelegate=true`이고 선택한 옵션이 `actionType="command"`면 위임이 필수입니다. 먼저 `spawn_agent`를 호출하고, 해당 명령을 메인 에이전트에서 직접 실행하지 않습니다.
- 메인 에이전트 fallback은 서브 에이전트 실행이 불가능한 경우(예: 도구 미지원, spawn 실패, 명령 실행 전 서브 에이전트 실패)에만 허용합니다.
- fallback을 사용할 때는 메인 실행 전에 fallback 사유를 사용자에게 한 줄로 먼저 알립니다.

출력 형식:

```text
현재 상태: <reasonCode 또는 상태 요약>
선택 가능:
A: <detail>
B: <detail>
응답 형식: "<LABEL>" 또는 "<LABEL> OK"
```

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
- ADR 작성 형식: `docs/features/.../decisions.md` 템플릿을 SSOT로 사용
- 이슈/PR 실행 상태: 각 Feature의 `issue.md`, `pr.md`를 SSOT로 사용

---

## 언어/표기 규칙

- 답변: 한국어
- 코드/파일명: 영어
- 주석/커밋메시지: 한국어
- 날짜/시간: 사용자 PC 시스템 시간 사용

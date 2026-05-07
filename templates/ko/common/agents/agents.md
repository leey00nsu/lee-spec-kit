# Agents Guide

코드 어시스턴트/에이전트 운영 규칙입니다.
이 문서는 커스텀 런타임이 아니라 워크플로우 정책만 정의합니다.

---

## 감지 게이트

- 항상 먼저 `npx lee-spec-kit detect --json`를 실행합니다.
- `status === "ok"` 이고 `isLeeSpecKitProject === true`일 때만 lee-spec-kit 규칙을 적용합니다.
- 감지 실패 또는 false면 lee-spec-kit 전용 규칙을 건너뛰고 일반 워크플로우로 진행합니다.

## 기본 실행 경로

- 기본 실행은 workspace-scoped `AGENTS.md`와 Codex 공식 hooks를 우선 사용합니다.
- 사용자가 "규칙에 따라 다음 feature를 진행해라"처럼 일반적으로 말해도 이 워크플로우로 자동 해석합니다.
- fresh 환경에서 최초 `npx lee-spec-kit ...` 호출은 병렬 실행하지 말고, npx cache 설치 경합을 피하도록 첫 명령 하나가 끝난 뒤 이어서 실행합니다.

## 문서가 SSOT

- 세션 시작 시점이나 context 리셋 직후 `npx lee-spec-kit docs get agents --json`를 1회 읽습니다.
- 응답의 `requiredDocs[*].command` 중 아직 읽지 않은 문서를 모두 확인합니다.
- 활성 feature를 정한 뒤에는 해당 feature 폴더를 작업 SSOT로 사용합니다.
- 최소 기준 문서는 `spec.md`, `plan.md`, `tasks.md`, `decisions.md`입니다.
- GitHub 워크플로우가 얽히면 `issue.md`, `pr.md`도 함께 봅니다.
- 활성 feature 문서를 읽은 뒤에는 `npx lee-spec-kit workflow-stage <featureRef> --json`를 실행하고, 그 `nextAction`만 따릅니다.
- `workflow-stage --json`가 `primaryActionLabel`과 `actionOptions`를 같이 반환하면, `primaryActionLabel`은 기본 옵션 라벨로 보고 사용자에게는 `actionOptions[*].reply` 값을 그대로 보여줍니다.

## 실행 규칙

- lee-spec-kit은 문서 구조, workflow 단계, validator를 담당합니다.
- Codex는 실행 루프, 도구 사용, hook lifecycle을 담당합니다.
- `workflow-stage --json`가 `stage === "implementation"`이고 `implementationAllowed === true`를 반환하기 전에는 구현을 시작하지 않습니다.
- spec / plan / tasks 승인, issue 생성, branch 생성은 구현 전 하드 게이트로 취급합니다.
- standalone 모드에서는 `git worktree add`를 직접 만들지 말고 `workflow-stage`의 정확한 `nextAction.command`를 실행해 managed workspace 경로, stale 디렉터리 정리, `.env`/`.env.*` 복사 단계가 일관되게 유지되도록 합니다.
- 동작이나 범위가 바뀌는 코드 변경이 있으면 같은 턴 안에서 feature 문서를 같이 동기화합니다.
- staged된 docs 경로 검사가 필요하면 `git commit` 전에 `npx lee-spec-kit commit-audit --json`를 사용합니다.
- 기본 docs sync 검사는 `npx lee-spec-kit workflow-audit --json`를 사용합니다.

## 승인 규칙

사용자 확인 필수 규칙을 항상 먼저 적용합니다.

| 현재 액션 예시 | 공유 내용 |
| --- | --- |
| 이슈 생성 | `npx lee-spec-kit github issue <featureRef> --create` 전 |
| PR 생성 | `npx lee-spec-kit github pr <featureRef> --create` 전 |

- 문서화된 workflow checkpoint와 원격/파괴적 작업 전에만 사용자 승인을 요청합니다.
- `workflow-stage --json`가 `approvalRequired === true`를 반환하면 그 checkpoint에서 멈추고 사용자 승인을 받습니다.
- `workflow-stage --json`가 승인 경계에서 라벨형 `actionOptions`를 반환하면, 사용자 프롬프트에서도 같은 옵션 라벨과 `reply` 값을 그대로 사용하고 다른 응답 형식을 임의로 만들지 않습니다.
- GitHub 원격 작업 전에는 올릴 artifact나 계획을 먼저 공유합니다.

## 표기 규칙

- 답변: 한국어
- 코드/파일명: 영어
- 날짜/시간: 사용자 로컬 시스템 시간

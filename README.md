<h1 align="center">
  <strong>lee-spec-kit</strong>
</h1>

<div align="center">
<img src="./assets/logo.png" alt="lee-spec-kit logo" width="620" />
</div>

<p align="center">
  <strong>AI 에이전트 개발을 위한 문서 중심 하네스 엔지니어링 툴킷</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/lee-spec-kit"><img src="https://img.shields.io/npm/v/lee-spec-kit.svg" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#왜-만들었나">Why</a> •
  <a href="#주요-명령">Commands</a> •
  <a href="#docs">Docs</a>
</p>

<p align="center">
  <a href="./README.en.md">
    <img src="https://img.shields.io/badge/lang-en-red.svg" alt="English">
  </a>
  <a href="./README.md">
    <img src="https://img.shields.io/badge/lang-ko-blue.svg" alt="한국어">
  </a>
</p>

---

## Quick Start

`lee-spec-kit`은 PRD, idea, feature 문서를 만들고, 에이전트가 그 문서를 기준으로 작업하도록 돕는 도구입니다.

```bash
npx lee-spec-kit init
npx lee-spec-kit integrations codex-hooks
npx lee-spec-kit idea improve-auth-flow
npx lee-spec-kit feature user-auth --issue 123 # GitHub: select an existing Issue
# Local: npx lee-spec-kit feature user-auth
```

`init`은 GitHub/Local 워크플로우와 Task 구현 위임, Plan/Task/Feature 검수,
Local 통합 방식을 대화형으로 설정합니다. 자동화 환경에서는 같은 값을 플래그로
지정할 수 있습니다.

```bash
npx lee-spec-kit init --workflow local --task-agent on --reviews plan,feature --completion-strategy local-squash --non-interactive
```

그 다음부터는 자연어로 요청하면 됩니다.

## 왜 만들었나

이 CLI는 AI 에이전트와 함께 프로젝트를 진행할 때, 문서와 실제 작업 흐름이 따로 놀지 않게 하려고 만들었습니다.

단순히 문서 폴더만 만드는 것이 아니라, 에이전트가 지금 어떤 feature를 보고 있는지, 다음에 무엇을 해야 하는지, 어디서 사용자 확인이 필요한지를 같은 규칙 안에서 다루도록 만드는 쪽에 더 가깝습니다.

작업 구조는 SDD(spec-driven development) 기반의 `PRD → idea → feature` 흐름을 따릅니다. PRD는 `docs/prd/`에서 상위 요구사항을 정리하는 공간이고, idea는 후보나 실험을 적어두는 단계이며, feature는 실제로 실행할 단위를 `spec.md`, `plan.md`, `tasks.md`, `decisions.md`로 내려 관리하는 단계입니다.

구조적으로는 [spec-kit](https://github.com/github/spec-kit)과 [OpenSpec](https://github.com/Fission-AI/OpenSpec)의 접근을 참고했습니다.

## 사람은 보통 이렇게 요청합니다

- "이 요구사항 기준으로 idea 정리해줘."
- "이 idea를 feature로 올려서 진행해줘."
- "현재 feature 기준으로 issue 초안 만들어줘."
- "규칙에 따라 다음 feature 진행해줘."
- "작업 끝났으니 문서랑 같이 점검해줘."

## 주요 명령

- `init`: docs/workflow 구조 초기화
- `idea`: 구현 전 idea 문서 생성
- `feature`: 실제 작업 단위 생성
- `task add`: `tasks.md`에 문서 전용 task block 추가
- `decision add`: `decisions.md`에 문서 전용 ADR block 추가
- `docs`: 내장 agent policy 문서 조회
- `detect`: 현재 워크스페이스가 lee-spec-kit 프로젝트인지 감지
- `github`: issue/pr 본문 생성 및 검증
- `integrations codex-hooks`: 현재 workspace와 configured project root용 Codex hooks 생성/제거
- `integrations codex`: 선택적 전역 `[features].hooks` 설정 설치/제거
- `commit-audit --json`: hooks용 commit-time docs path + canonical commit subject validator
- `workflow-audit --json`: hooks용 docs sync validator
- `knowledge ci`: 독립 OpenWiki 예약/수동 CI scaffold 생성
- `knowledge migrate [--apply] --json`: 기존 Feature의 문서 영향 판정 도입 상태를 dry-run하고, 안전한 대상만 명시적으로 grandfather 처리
- `local verify <feature-ref> --json`: local Feature worktree에서 검사를 실행하고 결과를 정확한 tip/tree에 결속
- `local merge <feature-ref> --json`: 검증된 local Feature를 설정된 fast-forward 또는 squash 전략으로 base branch에 통합
- `local cleanup <feature-ref> --json`: managed worktree 제거 및 설정에 따른 통합 완료 Feature 브랜치 삭제

지원 모드:

- `embedded`: 프로젝트 안에 `docs/`를 함께 둡니다.
- `standalone`: workspace root 아래에서 docs repo와 project repo를 따로 관리합니다.

실험적 OpenWiki Knowledge 계층은 단일 플래그로 활성화합니다.

```bash
npx lee-spec-kit config --openwiki true
npx lee-spec-kit knowledge ci --json
```

`knowledge ci`는 프로젝트 저장소에 OpenWiki용 GitHub Actions 워크플로우를 만듭니다. 모델·GitHub 인증정보, 기본 GitHub 예약 실행, Coolify를 통한 외부 예약 실행은 [OpenWiki Knowledge CI 설정 가이드](./docs/reference/openwiki-ci.md)를 참고하세요. lee-spec-kit은 CI 구성을 제공하며 OpenWiki 생성 과정을 직접 실행하거나 Feature 완료의 조건으로 삼지 않습니다.

## Docs

- [Public CLI Reference](./docs/reference/public-cli.md)
- [Agent CLI Reference](./docs/reference/agent-cli.md)
- [OpenWiki Knowledge CI 설정](./docs/reference/openwiki-ci.md)
- [Internal CLI Reference](./docs/reference/internal-cli.md)
- [Codex Hooks Integration](./docs/reference/codex-hooks.md)
- [Migration Guide](./docs/reference/migration-codex-hooks.md)
- [Reference Index](./docs/reference/README.md)

## License

코드와 일반 패키지 내용은 MIT입니다. 번들된 OpenWiki 기술 글쓰기 스킬은 Toss의 Technical Writing을 각색한 자료로, 해당 스킬 디렉터리에 한해 CC BY-NC-SA 4.0이 적용됩니다. 자세한 범위와 출처는 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)를 참고하세요.

## Feature ID와 협업

새 GitHub Feature는 Issue부터 선택하거나 생성합니다. `feature login --issue 123`은 `123-login` 문서를 만들고, 브랜치는 `feat/123-login`, 커밋 범위는 `#123`을 사용합니다. 새 Issue가 필요하면 제목과 본문을 먼저 공유한 뒤 `feature login --create-issue --desc "문제와 기대 결과" --confirm OK`를 실행합니다. Issue 생성은 구현 승인이 아닙니다. Spec·Plan 승인과 리뷰 절차는 그대로 적용됩니다.

local 모드에서는 `feature login`이 `K7M2Q9RX4DAB-login` 같은 12자리 무작위 ID를 생성합니다. 중앙 순번이나 폴더 정렬 순서는 실행 순서가 아닙니다. 기존 `F001` 문서는 계속 사용할 수 있으며 `--id F001`은 기존 자료를 가져오는 호환 경로로 남습니다. 신규 Feature의 `.feature.json`에는 고정 ID, Issue URL, 브랜치, 담당자를 기록합니다. `--owner`를 생략하면 Git 이메일을 사용합니다.

한 Feature는 한 담당자가 맡고, 다른 Feature는 병렬로 개발할 수 있습니다. 신규 Feature는 코드 worktree를 사용합니다. standalone에서는 Feature 생성 직후 `workflow-stage`가 안내하는 `workspace prepare <id>`를 실행합니다. 이 명령이 해당 Feature seed만 커밋하고, 반환된 `docsDirectory`에서 문서를 작성합니다. 코드 worktree는 기존 승인 절차 후 생성됩니다. 두 저장소를 한 번에 원자적으로 병합하지는 않습니다. local은 코드 통합 검증 → 문서 통합 → 정리 순서로 Feature를 완료합니다. OpenWiki 갱신은 그 통합 revision을 대상으로 독립 실행되며 실패해도 완료된 통합을 되돌리지 않습니다.

상태 변경은 다음 명령을 사용합니다.

```sh
npx lee-spec-kit task claim <id> --json
npx lee-spec-kit task status <id> --json
npx lee-spec-kit task transition <id> <task-id> --from TODO --to DOING --session <발급된-token> --expected-hash <tasks.md-hash> --json
npx lee-spec-kit task release <id> --session <발급된-token> --json
```

세션은 같은 로컬 저장소의 worktree들이 공유합니다. 다른 기기 사이에는 GitHub Issue 담당자와 PR 리뷰를 기준으로 조율합니다. 담당자 변경은 기존 세션을 해제한 뒤 `.feature.json`의 owner 변경을 리뷰합니다. Markdown을 직접 편집하는 도구까지 잠그지는 않으므로, 상태 변경 명령은 읽었던 문서 해시가 달라지면 중단합니다. 토큰을 잃어버린 경우 실행 중인 작업이 없는지 확인한 뒤 Git common directory의 `lee-spec-kit.runtime/locks/session-*.json`을 수동 정리할 수 있습니다.

base가 앞서가면 `local sync <id>` 또는 `workspace sync-docs <id>`로 해당 Feature 작업 공간에 반영하고 충돌을 해결한 뒤 다시 검증합니다. PR 병합 실패 시 자동 rebase·force-push를 하지 않습니다. 로컬 통합은 공통 저장소 잠금으로 직렬화하며, 검증 중 브랜치·파일이 달라지면 변경을 보존하고 중단합니다. 실패한 squash의 작업 내용도 자동 삭제하지 않습니다.

CI에서는 `npx lee-spec-kit feature-audit --base-ref origin/main --enforce --json`을 실행해 중복 ID, 고정 식별자 변경, 문서와 메타데이터 불일치, 한 Feature의 중복 활성 Task를 검사할 수 있습니다. 먼저 대상 base를 fetch해야 합니다. `workflow-stage --json`의 `sharedDocumentationWarnings`는 현재 문서에서 발견한 PRD·아키텍처 수정 대상의 중복을 알려주며, 의미상의 충돌은 최신 base와 함께 리뷰해야 합니다.

새 embedded Feature는 `workspace prepare`가 해당 Feature seed만 커밋하고 managed worktree를 만든 뒤 그 경로를 반환합니다. 다른 staged 파일은 이 제한된 seed 커밋에 포함하지 않습니다. standalone 문서 통합은 내용 변경 없는 기록용 커밋을 남겨, 문서 저장소를 새로 clone하거나 로컬 캐시를 지워도 Git 이력에서 통합 근거를 복원합니다.

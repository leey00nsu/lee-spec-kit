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
npx lee-spec-kit feature user-auth
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
- `knowledge doctor|sync|audit <feature-ref> --json`: 실험적 OpenWiki 온보딩 계층 준비·동기화·검증
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
```

활성화하면 task 커밋 이후 Feature 리뷰 전에 OpenWiki 동기화와 전용 Knowledge 커밋이 필수가 됩니다. 권한은 주장 유형별로 나뉩니다. PRD는 장기 요구사항, 활성 Feature SDD는 현재 변경의 범위와 결정, 사람이 관리하는 상위 문서는 프로젝트 전체 설명과 정책, tracked 코드·스키마·설정은 실행 사실의 기준이며 `openwiki/`는 이를 바탕으로 다시 검증하는 파생 온보딩 자료입니다. 모든 Plan의 Schema 2 `Curated Documentation Impact`는 네 기본 영역과 필요한 추가 유형을 판정하고, 완료 시 실제 Feature diff와 선언 대상을 대조합니다. 현재 계약은 OpenWiki CLI `>=0.5.0 <0.6.0`, OKF 0.2, Node.js 22 이상입니다. 실행 파일은 package manifest로 식별합니다. `knowledge doctor`는 OpenWiki가 소유하는 `~/.openwiki/.env`(또는 `OPENWIKI_CONFIG_DIR/.env`)와 현재 프로세스 환경에서 provider, model, 필수 credential의 존재 여부만 확인하며 값은 출력하지 않습니다. lee-spec-kit은 OpenWiki 실행 파일이나 credential을 자동 설치·복제하지 않습니다. `false` 또는 플래그 누락 시 OpenWiki 관련 stage와 gate는 전혀 추가되지 않습니다.

`knowledge sync`는 lee-spec-kit에 포함된 `lee-spec-kit-technical-writing` 스킬을 OpenWiki의 `skills/` 디렉터리에 설치하고, `openwiki/INSTRUCTIONS.md`의 표시된 관리 블록에서 이 스킬을 사용하도록 지시합니다. 사용자와 프로젝트가 작성한 지침은 관리 블록 밖에 그대로 남습니다. 설치 스킬은 생성 전후에 hash를 확인하며, 설정 디렉터리와 지침이 실행 중 바뀌면 receipt를 기록하지 않습니다. 스킬 내용이나 어댑터 버전이 바뀌면 receipt 검증이 이를 감지하고 다음 동기화에서 Knowledge 전체를 새 글쓰기 정책으로 다시 생성합니다. 별도의 스타일 설정은 추가하지 않으며 기능 제어는 계속 `experimental.openwiki` boolean 하나만 사용합니다.

OpenWiki 도입만으로 기존 문서의 낡은 내용이 자동 복구되지는 않습니다. 기존 프로젝트는 `knowledge migrate`로 workflow 호환 대상을 분류하는 것과 별개로, PRD·아키텍처·온보딩·운영·디자인·에이전트 정책 문서를 현재 코드와 한 번 수동 대조해 기준선을 맞춰야 합니다.

동기화는 OpenWiki의 durable `.run.json`을 보존하고 진행 상태를 관찰합니다. `sync`와 `audit`는 receipt의 source commit을 기준으로 `.claims/`의 `repo-lines-v1` 해시와 Markdown source citation의 줄 범위까지 검증합니다. 증분 갱신이 완료됐더라도 이 근거 검증이 실패하면 `INSTRUCTIONS.md`를 보존한 채 생성물만 비우고 같은 update 경로를 한 번 재실행하며, 그래도 실패하면 receipt를 갱신하지 않습니다. 기본값은 lock 획득 30초, 무진행 10분, 최초 생성 절대 상한 90분, 증분 갱신 절대 상한 30분입니다. 필요할 때 `knowledge sync`의 `--lock-timeout-ms`, `--idle-timeout-ms`, `--absolute-timeout-ms`로 한 번만 덮어쓸 수 있습니다. 설정 파일의 기능 제어는 계속 `experimental.openwiki` boolean 하나뿐입니다.

생성된 Knowledge는 프로젝트 루트에서 `openwiki visualize ./openwiki`로 그래프와 문서 리더를 열어 확인할 수 있습니다. 이 명령은 read-only 시각화이므로 직접 실행해도 되지만, 생성·갱신은 계속 `lee-spec-kit knowledge sync`를 사용합니다. 브라우저 자동 실행을 막으려면 `--no-open`, 포트를 고정하려면 `--port 4400`을 추가합니다. `visualize --export`는 파일을 쓰므로 출력 위치와 커밋 정책을 검토한 뒤 신뢰할 수 있는 터미널에서 별도로 실행합니다.

OpenWiki는 프로젝트 작업 디렉터리와 설정된 provider credential에 접근하는 외부 에이전트입니다. lee-spec-kit은 변경 경로·보호 파일·출력 내 고신뢰 secret 패턴을 검증하지만 OS sandbox는 제공하지 않으므로, 신뢰할 수 있는 저장소와 격리된 실행 환경에서만 활성화하고 로컬·ignored secret 관리는 운영자가 책임져야 합니다.

## Docs

- [Public CLI Reference](./docs/reference/public-cli.md)
- [Agent CLI Reference](./docs/reference/agent-cli.md)
- [Internal CLI Reference](./docs/reference/internal-cli.md)
- [Codex Hooks Integration](./docs/reference/codex-hooks.md)
- [Migration Guide](./docs/reference/migration-codex-hooks.md)
- [Reference Index](./docs/reference/README.md)

## License

코드와 일반 패키지 내용은 MIT입니다. 번들된 OpenWiki 기술 글쓰기 스킬은 Toss의 Technical Writing을 각색한 자료로, 해당 스킬 디렉터리에 한해 CC BY-NC-SA 4.0이 적용됩니다. 자세한 범위와 출처는 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)를 참고하세요.

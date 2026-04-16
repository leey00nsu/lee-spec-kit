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
- `docs`: 내장 agent policy 문서 조회
- `detect`: 현재 워크스페이스가 lee-spec-kit 프로젝트인지 감지
- `github`: issue/pr 본문 생성 및 검증
- `integrations codex-hooks`: 현재 workspace용 Codex hooks 스캐폴드 생성/제거
- `integrations codex`: 전역 Codex hooks flag 설치/제거
- `commit-audit --json`: hooks용 commit-time docs path validator
- `workflow-audit --json`: hooks용 docs sync validator

지원 모드:

- `embedded`: 프로젝트 안에 `docs/`를 함께 둡니다.
- `standalone`: workspace root 아래에서 docs repo와 project repo를 따로 관리합니다.

## Docs

- [Public CLI Reference](./docs/reference/public-cli.md)
- [Agent CLI Reference](./docs/reference/agent-cli.md)
- [Internal CLI Reference](./docs/reference/internal-cli.md)
- [Codex Hooks Integration](./docs/reference/codex-hooks.md)
- [Migration Guide](./docs/reference/migration-codex-hooks.md)
- [Reference Index](./docs/reference/README.md)

## License

MIT

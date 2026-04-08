<h1 align="center">
  <strong>lee-spec-kit</strong>
</h1>

<div align="center">
<img src="./assets/logo.png" alt="lee-spec-kit logo" width="620" />
</div>

<p align="center">
  <strong>AI 에이전트 기반 개발을 위한 오케스트레이션 하네스 CLI</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/lee-spec-kit"><img src="https://img.shields.io/npm/v/lee-spec-kit.svg" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#이-cli가-하는-일">Why</a> •
  <a href="#에이전트가-주로-실행하는-명령">Commands</a> •
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

대부분의 경우 사용자는 자연어로 요청하고, 메인 에이전트가 아래 흐름을 실행합니다.

```bash
npx lee-spec-kit init
npx lee-spec-kit idea improve-auth-flow
npx lee-spec-kit feature user-auth
npx lee-spec-kit context
npx lee-spec-kit flow
```

## 왜 만들었나

이 CLI는 AI 에이전트와 함께 프로젝트를 진행할 때, 문서와 실제 작업 흐름이 따로 놀지 않게 하려고 만들었습니다.

단순히 문서 폴더만 만드는 것이 아니라, 메인 에이전트가 지금 어떤 feature를 보고 있는지, 다음에 무엇을 해야 하는지, 어디서 사용자 확인이 필요한지를 같이 다룰 수 있게 하는 쪽에 더 가깝습니다.

작업 구조는 `PRD → idea → feature` 흐름을 따릅니다. PRD는 `docs/prd/`에서 상위 요구사항을 정리하는 공간이고, idea는 후보나 실험을 적어두는 단계이며, feature는 실제로 실행할 단위를 `spec.md`, `plan.md`, `tasks.md`로 내려 관리하는 단계입니다.

구조적으로는 [spec-kit](https://github.com/github/spec-kit)과 [OpenSpec](https://github.com/Fission-AI/OpenSpec)의 접근을 참고했습니다. 다만 이 프로젝트는 새 표준을 만들려는 쪽보다는, 내가 실제로 쓰는 작업 흐름을 더 잘 굴리기 위해 문서 구조와 실행 흐름을 한 CLI에 묶는 쪽에 가깝습니다.

## 이 CLI가 하는 일

`lee-spec-kit`는 사람이 세부 운영 명령을 외우는 도구라기보다, 메인 에이전트가 현재 상태를 읽고 다음 액션을 고르도록 돕는 개인용 하네스에 가깝습니다.

- 사람은 보통 자연어로 요청합니다.
- 사람용으로는 `init`, `idea`, `feature`, `context`, `flow` 정도의 작은 표면을 제공합니다.
- 실제 에이전트 실행은 `detect`, `context`, `flow` 3개 명령을 기준으로 움직입니다.
- 더 깊은 운영 명령은 여전히 지원되지만 기본 help에는 전면 노출하지 않습니다.

## 어떻게 동작하나

1. `init`으로 docs/workflow 구조를 붙입니다.
2. `docs/prd/`에서 상위 요구사항을 정리합니다.
3. `idea`로 후보/실험을 정리하거나, 바로 `feature`로 실행 단위를 만듭니다.
4. 메인 에이전트가 `detect`와 `context`를 읽고 진행합니다.
5. 사람은 승인, 예외 처리, 방향 수정 시점에 개입합니다.
6. 현재 다음 액션과 승인 대기 상태는 `context`, 기본 workflow 실행/재개는 `flow`로 진행합니다.

## 사람은 보통 이렇게 요청합니다

- "이 문서 읽고 프로젝트 구조 시작하려고 해."
- "이 요구사항 기준으로 idea 정리해줘."
- "이 idea를 feature로 올려서 진행해줘."
- "지금 다음 액션이 뭐야?"
- "전체 상태 한번 점검해줘."

## 에이전트가 주로 실행하는 명령

- 실제 에이전트 실행 기준 명령은 아래 3개입니다.
  - `detect`: 현재 워크스페이스가 lee-spec-kit 프로젝트인지 감지합니다.
  - `context`: 현재 feature 상태와 다음 액션을 읽습니다.
  - `flow`: 기본 workflow auto-run을 진행하고 선택/승인/수동/재개 경계에서 멈춥니다.
- 사람용 public 명령은 아래 다섯 개입니다.
  - `init`: docs/workflow 구조를 초기화합니다.
  - `idea`: 구현 전 아이디어 문서를 생성합니다.
  - `feature`: 실제 작업 단위를 생성합니다.
  - `context`: 현재 feature 상태와 다음 액션을 읽습니다.
  - `flow`: 기본 workflow auto-run을 진행하고 선택/승인/수동/재개 경계에서 멈춥니다.

## 에이전트 킥오프 프롬프트

```text
작업 시작 절차:
1) npx lee-spec-kit detect --json
2) isLeeSpecKitProject === true 이면 npx lee-spec-kit context --json-compact 실행
3) 상태 확인은 context를 read-only probe로 사용하고, 실제 실행/재개는 flow를 기본 엔트리포인트로 사용
4) approvalRequest.required=true 이면 matchedFeature.currentSubstate* 기반 현재 단계 한 줄 요약을 먼저 짧게 말하고 approvalRequest.userFacingLines를 그대로 사용자에게 제시한 뒤 승인 대기
5) 승인 전에는 실행하지 말고, 명령 실행은 기본적으로 npx lee-spec-kit flow <featureRef> --approve <LABEL> --execute 사용
6) isLeeSpecKitProject === false 이면 lee-spec-kit 전용 절차를 건너뛰고 일반 워크플로우로 진행
```

## Docs

- [Public CLI Reference](./docs/reference/public-cli.md)
- [Agent CLI Reference](./docs/reference/agent-cli.md)
- [Internal CLI Reference](./docs/reference/internal-cli.md)
- [Reference Index](./docs/reference/README.md)

## License

MIT

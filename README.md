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

이 CLI는 AI 에이전트와 함께 프로젝트를 진행할 때 spec-driven development 기반의 흐름을 더 일관되게 만들기 위해 만들어졌습니다.
목표는 단순히 문서 폴더를 생성하는 것이 아니라, 프로젝트가 어떤 요구사항에서 출발했고 어떤 아이디어를 거쳐 어떤 구현 단위로 내려왔는지를
에이전트와 사람이 함께 추적할 수 있게 만드는 것입니다.

이를 위해 `lee-spec-kit`는 `PRD → idea → feature` 단계로 작업을 구조화하고, 실제 구현과 협업 흐름에서는 git 기반의 issue/PR 구조를 자연스럽게 연결하도록 설계되었습니다.
즉, 문서 작성 단계와 코드 변경 단계가 따로 놀지 않도록, 에이전트가 읽을 수 있는 상태와 사람이 리뷰할 수 있는 상태를 같은 흐름 안에 두는 데 초점을 둡니다.

여기서 PRD는 `init`이 만들어 주는 `docs/prd/`에서 직접 관리하는 상위 요구사항 공간입니다.
Idea는 그 요구사항에서 나온 후보와 실험을 정리하는 단계이고, Feature는 그중 실제로 실행하기로 한 단위를
`spec.md`, `plan.md`, `tasks.md`로 내려서 관리하는 단계입니다.

구조적으로는 [spec-kit](https://github.com/github/spec-kit)과 [OpenSpec](https://github.com/Fission-AI/OpenSpec)의 접근을 참고했지만,
`lee-spec-kit`는 실제 프로젝트 진행 방식과 에이전트 오케스트레이션에 맞게 더 실무적인 문서 단계, feature 단위, 그리고 git workflow 연결을 강조하도록 재구성되었습니다.

## 이 CLI가 하는 일

`lee-spec-kit`는 사람이 매번 세부 명령을 직접 치는 도구라기보다,
메인 에이전트가 현재 상태를 읽고 다음 액션을 고르도록 돕는 개발 하네스입니다.

- 사람은 보통 자연어로 요청합니다.
- 메인 에이전트는 그 요청을 `detect`, `context`, `flow`, `idea`, `feature` 같은 명령으로 번역해 실행합니다.
- 더 깊은 운영 명령은 여전히 지원되지만 기본 help에는 전면 노출하지 않습니다.

## 어떻게 동작하나

1. `init`으로 docs/workflow 구조를 붙입니다.
2. `docs/prd/`에서 상위 요구사항을 정리합니다.
3. `idea`로 후보/실험을 정리하거나, 바로 `feature`로 실행 단위를 만듭니다.
4. 메인 에이전트가 `detect`와 `context`를 읽고 진행합니다.
5. 사람은 승인, 예외 처리, 방향 수정 시점에 개입합니다.
6. 현재 다음 액션과 승인 대기 상태는 `context`, 전체 상태 요약은 `flow`로 확인합니다.

## 사람은 보통 이렇게 요청합니다

- "이 문서 읽고 프로젝트 구조 시작하려고 해."
- "이 요구사항 기준으로 idea 정리해줘."
- "이 idea를 feature로 올려서 진행해줘."
- "지금 다음 액션이 뭐야?"
- "전체 상태 한번 점검해줘."

## 에이전트가 주로 실행하는 명령

- `init`: docs/workflow 구조를 초기화합니다.
- `idea`: 구현 전 아이디어 문서를 생성합니다.
- `feature`: 실제 작업 단위를 생성합니다.
- `detect`: 현재 워크스페이스가 lee-spec-kit 프로젝트인지 감지합니다.
- `context`: 현재 feature 상태와 다음 액션을 읽습니다.
- `flow`: 전체 워크플로우 상태를 요약합니다.

## 에이전트 킥오프 프롬프트

```text
작업 시작 절차:
1) npx lee-spec-kit detect --json
2) isLeeSpecKitProject === true 이면 npx lee-spec-kit context --json-compact 실행
3) approvalRequest.required=true 이면 approvalRequest.userFacingLines를 그대로 사용자에게 제시하고 승인 대기
4) 승인 전에는 실행하지 말고, requiresUserCheck=true 액션은 승인 후에만 실행
5) isLeeSpecKitProject === false 이면 lee-spec-kit 전용 절차를 건너뛰고 일반 워크플로우로 진행
```

## Docs

- [Public CLI Reference](./docs/reference/public-cli.md)
- [Agent CLI Reference](./docs/reference/agent-cli.md)
- [Internal CLI Reference](./docs/reference/internal-cli.md)
- [Reference Index](./docs/reference/README.md)

## License

MIT

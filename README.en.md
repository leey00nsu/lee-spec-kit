<h1 align="center">
  <strong>lee-spec-kit</strong>
</h1>

<div align="center">
<img src="./assets/logo.png" alt="lee-spec-kit logo" width="620" />
</div>

<p align="center">
  <strong>Orchestration harness CLI for AI agent-driven development</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/lee-spec-kit"><img src="https://img.shields.io/npm/v/lee-spec-kit.svg" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#what-this-cli-does">Why</a> •
  <a href="#commands-the-agent-usually-runs">Commands</a> •
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

In most cases, the human asks in natural language and the main agent runs this flow.

```bash
npx lee-spec-kit init
npx lee-spec-kit idea improve-auth-flow
npx lee-spec-kit feature user-auth
npx lee-spec-kit context
npx lee-spec-kit flow
```

## Why It Exists

This CLI was built to keep documents and actual execution flow together when working with an AI agent.

It is not just a tool that creates a docs folder. The main agent can use it to understand which feature is active, what the next action is, and where user approval is required.

The project structure follows `PRD → idea → feature`. PRD is where top-level requirements are written under `docs/prd/`, idea is for candidate approaches or experiments, and feature is the stage where actual work is managed through `spec.md`, `plan.md`, and `tasks.md`.

The overall approach is influenced by [spec-kit](https://github.com/github/spec-kit) and [OpenSpec](https://github.com/Fission-AI/OpenSpec). The difference is that this project is less about inventing a new standard and more about keeping my own document flow and execution flow in one CLI.

## What This CLI Does

`lee-spec-kit` is less a power-user console and more an opinionated harness that helps the main agent read project state and choose the next action.

- Humans usually ask in natural language.
- The human-facing surface stays small: `init`, `idea`, `feature`, `context`, `flow`.
- In practice, the main agent runs `detect`, `context`, and `flow` first.
- Deeper operational commands still exist, but they are no longer front-loaded in the default help output.

## How It Works

1. Use `init` to attach docs/workflow scaffolding.
2. Define top-level requirements in `docs/prd/`.
3. Create work with `idea` or `feature`.
4. Let the main agent read `detect` and `context`.
5. Humans step in for approvals, exceptions, and direction changes.
6. Use `context` for the current action and `flow` as the default workflow runner.

## Humans Usually Ask Like This

- "Read this doc and help me start the project structure."
- "Organize ideas from these requirements."
- "Promote this idea into a feature and move it forward."
- "What is the next action right now?"
- "Check the overall project state."

## Commands

- The core agent-facing commands are the three commands below.
  - `detect`: detect whether the workspace uses lee-spec-kit
  - `context`: read the current feature state and next actions
  - `flow`: run the default workflow auto-loop and pause at selection/approval/manual/resume boundaries
- The public human-facing commands are the five commands below.
  - `init`: initialize docs/workflow scaffolding
  - `idea`: create a pre-feature idea document
  - `feature`: create a concrete execution unit
  - `context`: show the current state and next action
  - `flow`: run the default workflow auto-loop and pause at selection/approval/manual/resume boundaries

## Agent Kickoff Prompt

```text
Start procedure:
1) Run npx lee-spec-kit detect --json
2) If isLeeSpecKitProject === true, run npx lee-spec-kit context --json-compact
3) Use context as the read-only state probe, and use flow as the default execution/resume entrypoint
4) If approvalRequest.required=true, briefly restate the current stage from matchedFeature.currentSubstate* when available, then show approvalRequest.userFacingLines exactly as provided and wait for user approval
5) Do not execute before approval; for command execution, default to npx lee-spec-kit flow <featureRef> --approve <LABEL> --execute
6) If isLeeSpecKitProject === false, skip lee-spec-kit-specific flow and continue with normal workflow
```

## Docs

- [Public CLI Reference](./docs/reference/public-cli.md)
- [Agent CLI Reference](./docs/reference/agent-cli.md)
- [Internal CLI Reference](./docs/reference/internal-cli.md)
- [Reference Index](./docs/reference/README.md)

## License

MIT

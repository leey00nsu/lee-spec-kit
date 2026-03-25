<h1 align="center">
  <strong>lee-spec-kit</strong>
</h1>

<div align="center">
<img src="./assets/logo.png" alt="lee-spec-kit logo" width="620" />
</div>

<p align="center">
  <strong>Agent-guided development harness CLI for spec-driven projects</strong>
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

This CLI was built to make spec-driven development more consistent when working with AI agents.
The goal is not just to generate a docs folder, but to make it easier for both humans and agents to follow how a project moves from requirements, through ideas, into concrete implementation work.

To do that, `lee-spec-kit` structures work as `PRD → idea → feature`, and then connects that document flow to a git-centered issue/PR workflow.
The focus is to keep planning artifacts and code workflow aligned, so the agent-readable state and the human-reviewable state stay in the same operating model.

In that flow, PRD lives in the top-level `docs/prd/` space created by `init`.
Ideas capture candidates and experiments that come out of those requirements, and Features turn the approved work into executable units with `spec.md`, `plan.md`, and `tasks.md`.

Structurally, it draws inspiration from [spec-kit](https://github.com/github/spec-kit) and [OpenSpec](https://github.com/Fission-AI/OpenSpec),
but it is adapted toward a more practical project workflow with explicit document stages, feature-level execution units, and tighter git workflow integration for agent orchestration.

## What This CLI Does

`lee-spec-kit` is less a power-user operator console and more a development harness that helps the main agent read project state and choose the next action.

- Humans usually ask in natural language.
- The main agent translates those requests into commands like `detect`, `context`, `flow`, `idea`, and `feature`.
- Deeper operational commands still exist, but they are no longer front-loaded in the default help output.

## How It Works

1. Use `init` to attach docs/workflow scaffolding.
2. Define top-level requirements in `docs/prd/`.
3. Create work with `idea` or `feature`.
4. Let the main agent read `detect` and `context`.
5. Humans step in for approvals, exceptions, and direction changes.
6. Use `context` for the current action and `flow` for overall workflow health.

## Humans Usually Ask Like This

- "Read this doc and help me start the project structure."
- "Organize ideas from these requirements."
- "Promote this idea into a feature and move it forward."
- "What is the next action right now?"
- "Check the overall project state."

## Commands The Agent Usually Runs

- `init`: initialize docs/workflow scaffolding
- `idea`: create a pre-feature idea document
- `feature`: create a concrete execution unit
- `detect`: detect whether the workspace uses lee-spec-kit
- `context`: read current feature state and next actions
- `flow`: summarize workflow state

## Agent Kickoff Prompt

```text
Start procedure:
1) Run npx lee-spec-kit detect --json
2) If isLeeSpecKitProject === true, run npx lee-spec-kit context --json-compact
3) If approvalRequest.required=true, show approvalRequest.userFacingLines exactly as provided, then wait for user approval
4) Do not execute before approval; execute requiresUserCheck=true actions only after approval
5) If isLeeSpecKitProject === false, skip lee-spec-kit-specific flow and continue with normal workflow
```

## Docs

- [Public CLI Reference](./docs/reference/public-cli.md)
- [Agent CLI Reference](./docs/reference/agent-cli.md)
- [Internal CLI Reference](./docs/reference/internal-cli.md)
- [Reference Index](./docs/reference/README.md)

## License

MIT

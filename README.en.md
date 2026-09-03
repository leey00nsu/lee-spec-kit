<h1 align="center">
  <strong>lee-spec-kit</strong>
</h1>

<div align="center">
<img src="./assets/logo.png" alt="lee-spec-kit logo" width="620" />
</div>

<p align="center">
  <strong>Document-centered harness engineering toolkit for AI agent development</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/lee-spec-kit"><img src="https://img.shields.io/npm/v/lee-spec-kit.svg" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#why-it-exists">Why</a> •
  <a href="#main-commands">Commands</a> •
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

`lee-spec-kit` creates PRD, idea, and feature docs, then helps agents work from those documents.

```bash
npx lee-spec-kit init
npx lee-spec-kit integrations codex-hooks
npx lee-spec-kit idea improve-auth-flow
npx lee-spec-kit feature user-auth
```

`init` interactively configures the GitHub/Local workflow, task implementation
delegation, Plan/Task/Feature review gates, and Local integration strategy. The
same choices are available as flags for automation.

```bash
npx lee-spec-kit init --workflow local --task-agent on --reviews plan,feature --completion-strategy local-squash --non-interactive
```

After that, the human can keep using normal natural-language requests.

## Why It Exists

This CLI was built to keep documents and actual execution flow together when working with an AI agent.

It is not just a tool that creates a docs folder. It is closer to a harness that helps the agent handle the active feature, the next action, and the points where user approval is required under the same set of rules.

The project structure follows an SDD (spec-driven development) flow: `PRD → idea → feature`. PRD is where top-level requirements are written under `docs/prd/`, idea is for candidate approaches or experiments, and feature is the stage where actual work is managed through `spec.md`, `plan.md`, `tasks.md`, and `decisions.md`.

The overall approach is influenced by [spec-kit](https://github.com/github/spec-kit) and [OpenSpec](https://github.com/Fission-AI/OpenSpec).

## Humans Usually Ask Like This

- "Organize ideas from these requirements."
- "Promote this idea into a feature and move it forward."
- "Draft the issue from the current feature docs."
- "Continue the next feature according to the rules."
- "Check the docs and code together before we finish."

## Main Commands

- `init`
- `idea`
- `feature`
- `task add`
- `decision add`
- `docs`
- `detect`
- `github`
- `integrations codex-hooks`: install/remove hooks in the workspace and configured project roots
- `integrations codex`: install/remove the optional global `[features].hooks` setting
- `commit-audit --json`
- `workflow-audit --json`
- `knowledge doctor|sync|audit <feature-ref> --json`: prepare, synchronize, and verify the experimental OpenWiki onboarding layer
- `knowledge migrate [--apply] --json`: dry-run or explicitly grandfather safe completed Features at the policy cutover
- `local verify <feature-ref> --json`: run checks in the local Feature worktree and bind the result to its exact tip/tree
- `local merge <feature-ref> --json`: integrate a verified local Feature using its configured fast-forward or squash strategy
- `local cleanup <feature-ref> --json`: remove the managed worktree and optionally delete the integrated Feature branch

Supported modes:

- `embedded`: keep `docs/` inside the project repository.
- `standalone`: keep the docs repo and project repo separate under a shared workspace root.

Enable the experimental OpenWiki Knowledge layer with one flag:

```bash
npx lee-spec-kit config --openwiki true
```

When enabled, OpenWiki synchronization and a dedicated Knowledge commit are required after task commits and before Feature review. Authority is claim-specific: PRD owns durable requirements, the active Feature SDD owns the current change scope and decisions, human-maintained project-wide docs own explanations and policy, and tracked code, schemas, and configuration own executable facts. `openwiki/` is derived onboarding evidence that must be checked against those sources. Every Plan's Schema 2 `Curated Documentation Impact` assesses the four core surfaces plus any applicable typed additional surfaces, then reconciles declared targets with the completed Feature diff. Existing projects require one manual baseline reconciliation before relying on per-Feature checks. The current contract is OpenWiki CLI `>=0.5.0 <0.6.0`, OKF 0.2, and Node.js 22+. `knowledge doctor` checks the OpenWiki-owned provider, model, and required credential-field presence from the process environment and `~/.openwiki/.env` (or `OPENWIKI_CONFIG_DIR/.env`) without returning secret values. lee-spec-kit never installs OpenWiki or copies credentials. `false` or an absent flag adds no OpenWiki stage or gate.

Synchronization preserves OpenWiki's durable `.run.json` and observes progress. Defaults are 30 seconds for lock acquisition, 10 minutes without observable progress, 90 minutes absolute for bootstrap, and 30 minutes absolute for updates. A single run can override them with `knowledge sync --lock-timeout-ms`, `--idle-timeout-ms`, and `--absolute-timeout-ms`; the project config remains the single `experimental.openwiki` boolean.

Inspect generated Knowledge as a graph and document reader from the project root with `openwiki visualize ./openwiki`. This is a read-only visualization command and may run directly; generation and updates must still use `lee-spec-kit knowledge sync`. Add `--no-open` to suppress automatic browser launch or `--port 4400` to select a port. Because `visualize --export` writes files, review its destination and commit policy and run it separately from a trusted terminal.

OpenWiki is an external agent with access to the project working directory and configured provider credentials. lee-spec-kit validates changed paths, protected files, and high-confidence secret patterns in output, but it is not an OS sandbox. Enable it only for trusted repositories in an appropriately isolated runtime; operators remain responsible for local and ignored secrets.

## Docs

- [Public CLI Reference](./docs/reference/public-cli.md)
- [Agent CLI Reference](./docs/reference/agent-cli.md)
- [Internal CLI Reference](./docs/reference/internal-cli.md)
- [Codex Hooks Integration](./docs/reference/codex-hooks.md)
- [Migration Guide](./docs/reference/migration-codex-hooks.md)
- [Reference Index](./docs/reference/README.md)

## License

MIT

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
npx lee-spec-kit feature user-auth --issue 123 # GitHub: select an existing Issue
# Local: npx lee-spec-kit feature user-auth
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
- `knowledge doctor|publish|status|ci`: prepare, publish, inspect, and configure post-integration OpenWiki generation
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

When enabled, OpenWiki is published after integration: local workflows run `knowledge publish` after verified merge, while GitHub uses the integration-branch push CI scaffolded by `knowledge ci`. Generated output and receipts are revision-bound artifacts outside Feature commits and reviews. Failure preserves the merge and last good publication for retry. Authority is claim-specific: PRD owns durable requirements, the active Feature SDD owns the current change scope and decisions, human-maintained project-wide docs own explanations and policy, and tracked code, schemas, and configuration own executable facts. `openwiki/` is derived onboarding evidence that must be checked against those sources. Every Plan's Schema 2 `Curated Documentation Impact` assesses the four core surfaces plus any applicable typed additional surfaces, then reconciles declared targets with the completed Feature diff. Existing projects require one manual baseline reconciliation before relying on per-Feature checks. The current contract is OpenWiki CLI `>=0.5.0 <0.6.0`, OKF 0.2, and Node.js 22+. `knowledge doctor` checks the OpenWiki-owned provider, model, and required credential-field presence from the process environment and `~/.openwiki/.env` (or `OPENWIKI_CONFIG_DIR/.env`) without returning secret values. lee-spec-kit never installs the OpenWiki executable or copies credentials. `false` or an absent flag adds no OpenWiki stage or gate.

`knowledge publish` uses the generation adapter to install the bundled `lee-spec-kit-technical-writing` skill in OpenWiki's `skills/` directory and references it from a marked managed block in `openwiki/INSTRUCTIONS.md`. User and project instructions outside that block remain untouched. The installed skill is hash-checked before and after generation; concurrent changes to it or the instructions prevent receipt creation. The receipt records the writing adapter, skill content, and managed instruction hashes; a change to any of them makes Knowledge stale and triggers a full regeneration under the new policy. This does not add another user setting: `experimental.openwiki` remains the only feature control.

Synchronization preserves OpenWiki's durable `.run.json` and observes progress. Defaults are 30 seconds for lock acquisition, 10 minutes without observable progress, 90 minutes absolute for bootstrap, and 30 minutes absolute for updates. A single run can override them with `knowledge publish --lock-timeout-ms`, `--idle-timeout-ms`, and `--absolute-timeout-ms`; the project config remains the single `experimental.openwiki` boolean.

Open the returned `artifactPath` and run `openwiki visualize ./openwiki` to inspect a publication. `knowledge status` reports the last attempt and good publication. Legacy `knowledge sync`/`audit` remain available for in-place output; the Feature workflow does not use them.

OpenWiki is an external agent with access to the project working directory and configured provider credentials. lee-spec-kit validates changed paths, protected files, and high-confidence secret patterns in output, but it is not an OS sandbox. Enable it only for trusted repositories in an appropriately isolated runtime; operators remain responsible for local and ignored secrets.

## Docs

- [Public CLI Reference](./docs/reference/public-cli.md)
- [Agent CLI Reference](./docs/reference/agent-cli.md)
- [Internal CLI Reference](./docs/reference/internal-cli.md)
- [Codex Hooks Integration](./docs/reference/codex-hooks.md)
- [Migration Guide](./docs/reference/migration-codex-hooks.md)
- [Reference Index](./docs/reference/README.md)

## License

Code and general package contents are MIT licensed. The bundled OpenWiki technical-writing skill is adapted from Toss Technical Writing and is separately licensed under CC BY-NC-SA 4.0. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution and scope.

## Feature identity and collaboration

New GitHub Features start with an Issue: `feature login --issue 123` creates `123-login`, uses branch `feat/123-login`, and commit scope `#123`. To create an Issue first, share its title/body, then run `feature login --create-issue --desc "Problem and expected outcome" --confirm OK`. Issue intake does not approve implementation; Spec, Plan, and review gates still apply.

Local Features receive independent 12-character random IDs. Existing F-number Features remain readable; explicit `--id F001` is a legacy import path. New `.feature.json` metadata records identity, Issue URL, branch, and one owner (`--owner`, defaulting to Git email). IDs and folder order do not schedule execution.

New Features use code worktrees. Standalone Features also use isolated docs worktrees: commit the seed docs, follow `workspace prepare <id>`, and continue from its `docsDirectory`. Code integration is verified before `workspace merge-docs`; in local mode OpenWiki publication and cleanup follow. GitHub publication runs independently on code base-branch pushes. Integration across two repositories is recoverable in stages, not an atomic transaction. Use `workspace sync-docs` or `local sync` when the base advances, resolve conflicts in the Feature worktree, and reverify.

Use `task claim <id> --json`, `task status <id> --json`, then `task transition <id> <task-id> --from TODO --to DOING --session <token> --expected-hash <hash> --json`. Release the session with `task release <id> --session <token>`. Sessions coordinate worktrees in the same local repository; GitHub Issue ownership and PR review coordinate separate machines. Direct Markdown editors are not locked. Lost sessions require confirming that work has stopped before removing their `session-*.json` runtime record in the Git common directory.

Run `feature-audit --base-ref origin/main --enforce --json` in CI after fetching the base to reject duplicate IDs, changed immutable identities, inconsistent metadata, or multiple active tasks. `workflow-stage` reports `sharedDocumentationWarnings` for overlapping curated document targets visible in the docs tree. Semantic conflicts still require review against the latest base. Local integration is serialized and preserves concurrent changes detected during checks. PR merge retries no longer rebase or force-push automatically, and failed squash attempts preserve their working changes for inspection.

Before creating an embedded Feature worktree, follow the returned `workspace_checkpoint` action to commit its planning docs without including unrelated staged files. Standalone docs integration records an empty receipt commit; the docs repository can recover integration evidence after a fresh clone or loss of its runtime cache.

GitHub publication requires committing the workflow scaffolded by `knowledge ci` and configuring its provider secret; enabling OpenWiki alone does not install CI. Generation runs on integration-branch pushes, not PR creation. Local completion strategy `none` does not publish automatically. For standalone GitHub projects, this code-repository CI is independent of external docs integration and does not include those docs in its source snapshot.

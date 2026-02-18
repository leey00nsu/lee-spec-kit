<h1 align="center">
  <strong>lee-spec-kit</strong>
</h1>

<div align="center">
<img src="./assets/logo.png" alt="lee-spec-kit logo" width="620" />
</div>

<p align="center">
  <strong>CLI to generate a project docs structure for AI-assisted development</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/lee-spec-kit"><img src="https://img.shields.io/npm/v/lee-spec-kit.svg" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#usage">Usage</a> •
  <a href="#generated-structure">Generated Structure</a>
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

```bash
# 1) Initialize docs structure
npx lee-spec-kit init

# 2) Run initial onboarding checks
npx lee-spec-kit onboard --strict

# 3) Create a feature
npx lee-spec-kit feature user-auth

# 4) Show next steps (for agents)
npx lee-spec-kit context

# 5) Show workflow dashboard
npx lee-spec-kit view

# 6) Show overall status
npx lee-spec-kit status

# 7) Validate docs / feature metadata
npx lee-spec-kit doctor
```

## New Project Start Order

For a brand-new project, scaffold the **codebase first**, then initialize docs.
For most users (default: embedded), running `npx lee-spec-kit init` in project root is enough.

```bash
# 0) Create/init the code project first (example: Next.js)
npx create-next-app@latest my-app
cd my-app

# 1) Initialize docs structure
npx lee-spec-kit init

# 2) Run initial onboarding checks
npx lee-spec-kit onboard --strict

# 3) Detect project (agent entrypoint)
npx lee-spec-kit detect --json

# 4) Create feature and start workflow
npx lee-spec-kit feature user-auth
npx lee-spec-kit context --json-compact
```

- Apply lee-spec-kit workflow only when `detect --json` returns `isLeeSpecKitProject: true`.
- If `isLeeSpecKitProject: false`, continue with normal non-lee-spec-kit workflow.

For teams that keep docs separate from the code repo (standalone), the recommended start point is the **parent workspace folder**.

```bash
# Recommended layout:
# workspace/
#   ├─ docs/      (lee-spec-kit docs)
#   └─ project/   (actual code repo)
#
# Run from workspace root
npx lee-spec-kit init --docs-repo standalone --dir ./docs --project-root ./project
npx lee-spec-kit detect --json
```

## Agent Kickoff Prompt

You can paste the following as an agent session-start instruction.

```text
Start procedure:
1) Run npx lee-spec-kit detect --json
2) If isLeeSpecKitProject === true, run npx lee-spec-kit context --json-compact (use --json only when full detail is needed)
3) If actionOptions exist, show approvalPrompt and finalPrompt exactly as provided, then wait for user approval (<LABEL> or <LABEL> OK)
4) Do not execute before approval; execute requiresUserCheck=true actions only after approval
5) If isLeeSpecKitProject === false, skip lee-spec-kit-specific flow and continue with normal workflow
```

## Features

### 📁 Project initialization

- Interactive init or CLI options
- Default is `multi`; `single` remains supported for simple single-repo and backward-compatibility scenarios (`fullstack` is a backward-compatible alias of `multi`)
- Korean/English templates

### 🚀 Feature creation

- Generates `spec.md`, `plan.md`, `tasks.md`, `decisions.md`
- Multi mode supports flexible component separation (e.g. app/api/worker)
- Integrates Issue/PR templates (docs side)

### 📊 Status management

- View feature progress at a glance
- Print to terminal or write a Markdown report

### 👀 View dashboard

- Show context-style workflow dashboard in one command
- Works for single feature or aggregated feature list

### 🔁 Flow orchestration

- Combine `context + status + doctor` in one command
- Supports approval/execute passthrough for atomic context actions

### 🩺 Doctor

- Checks docs structure and feature metadata (missing status, duplicate IDs, placeholders, etc.)
- `--json` output for automation/agents

### 🔄 Template updates

- Updates docs templates to the latest version

## Usage

### Init

```bash
npx lee-spec-kit init
npx lee-spec-kit init --name my-project --type multi
npx lee-spec-kit init --name my-project --type fullstack  # alias
```

**Options:**

| Option              | Description                                                                                 | Default                         |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| `-n, --name <name>` | Project name                                                                                | current folder                  |
| `-t, --type <type>` | `single` or `multi` (`fullstack` alias supported)                                          | interactive (`multi` with `--yes`/`--non-interactive`) |
| `--components <list>` | multi component list (comma-separated, e.g. `app,api,worker`)                            | `app`                           |
| `-l, --lang <lang>` | `ko` or `en`                                                                                | `en`                            |
| `--workflow <mode>` | Workflow mode: `github` (issue/PR/review) or `local` (local-first)                         | `github`                        |
| `-d, --dir <dir>`   | Install directory                                                                           | `./docs`                        |
| `--docs-repo <mode>` | docs repo mode (`embedded` or `standalone`)                                               | `embedded`                      |
| `--project-root <path>` | standalone(single) project repo path or standalone(multi) JSON map (`{"app":"/path/app","api":"/path/api"}`) | -                               |
| `--component-project-roots <pairs>` | standalone(multi) component roots (`app=/path/app,api=/path/api,worker=/path/worker`) | - |
| `--push-docs` | enable standalone docs push (use with `--docs-remote`)                                   | `false`                         |
| `--docs-remote <url>` | standalone docs remote URL (used with `--push-docs`)                                    | -                               |
| `-y, --yes`         | Skip most interactive inputs (overwrite confirmation still appears if target dir is not empty) | -                               |
| `-f, --force`       | Overwrite non-empty target directory without confirmation                                  | `false`                         |
| `--non-interactive` | Fail immediately instead of prompting for user input                                        | `false`                         |

> After generating docs, `init` automatically attempts Git setup/commit (`git init`, `git add`, `git commit`). Auto-commit may be skipped depending on environment/state.

### Project detection (agent entrypoint)

```bash
# detect from current directory
npx lee-spec-kit detect

# JSON output for agents/automation
npx lee-spec-kit detect --json

# detect against a specific path
npx lee-spec-kit detect --dir /path/to/workspace
```

The `--json` payload includes `isLeeSpecKitProject`, `reasonCode` (`PROJECT_DETECTED` | `PROJECT_NOT_DETECTED`), `docsDir`, `configPath`, and `detectionSource` (`config` | `heuristic`).

### Onboarding checks

Validate initial setup readiness (Constitution/PRD/git remotes, etc.).

```bash
# human-readable output
npx lee-spec-kit onboard

# JSON output for agents/automation
npx lee-spec-kit onboard --json

# exit code 1 when WARN/BLOCK exists
npx lee-spec-kit onboard --strict
```

### Create a feature

```bash
# Single
npx lee-spec-kit feature user-auth

# Multi
npx lee-spec-kit feature --component api user-auth
npx lee-spec-kit feature --component app user-profile
npx lee-spec-kit feature --component worker queue-jobs

# Specify Feature ID/description
npx lee-spec-kit feature payment --id F123 --desc "Improve payment flow"
```

**Options:**

| Option              | Description                                 | Default      |
| ------------------- | ------------------------------------------- | ------------ |
| `--component <id>`  | Multi target component                       | interactive  |
| `--id <id>`         | Feature ID (`F001` format)                  | auto-generate |
| `-d, --desc <desc>` | Default purpose/description text for `spec.md` | empty string |
| `--non-interactive` | Fail immediately instead of prompting for user input | `false` |
| `--json`            | JSON output (`featureId`, `featurePath`, `component`) | `false` |

### Context (agent guide)

For a single matched feature, next steps are always shown as `A/B/C` options.

```bash
# basic check (auto-detect from branch)
npx lee-spec-kit context

# recommended: one feature + labels
npx lee-spec-kit context F001
npx lee-spec-kit context F001 --json
npx lee-spec-kit context F001 --json-compact

# approve + execute (common path)
npx lee-spec-kit context F001 --approve A --execute

# include ticket only when selected action has `requiresUserCheck=true`
npx lee-spec-kit context F001 --approve A --execute --ticket <TICKET>

# strict mode: fail if approved label is instruction-only
npx lee-spec-kit context F001 --approve A --execute --ticket <TICKET> --execute-strict
```

Use advanced selectors (`--component`, `--all`, `--done`) only when you need multi-scope filtering or exceptional fallback behavior.

**Options:**

| Option         | Description                                     |
| -------------- | ----------------------------------------------- |
| `--json`       | JSON output for agents                          |
| `--json-compact` | Compact JSON for agents (implies `--json`, minimizes duplicated fields) |
| `--component <id>` | Select target component in multi mode (e.g. `app`, `api`, `worker`) |
| `--all`        | Include completed features when auto-detecting  |
| `--done`       | Show completed (workflow-done) features only    |
| `--approve <reply>` | Approve one labeled option using any reply that includes a label token (e.g. `A`, `A OK`, `A proceed`) |
| `--ticket <token>` | One-time execution ticket from `--approve` (required when selected option has `requiresUserCheck=true`) |
| `--execute`    | Execute only the approved option when it is a command (`--ticket` required only for check-required options) |
| `--execute-strict` | With `--execute`, fail if the approved option is instruction-only |

**What is a ticket (approval ticket)?**

- A one-time execution token issued by the CLI when you approve a label via `--approve`.
- `--ticket` is required for `--execute` only when the selected action has `requiresUserCheck=true`.
- It is short-lived (5 minutes by default) and cannot be reused after one execution.

`context --json-compact` is the default recommended format, providing a reduced and deduplicated decision state.  
Use `context --json` only when full-detail debugging fields are required.

**Core fields (recommended for normal agent flows)**

- `status` / `reasonCode`: current state and reason code
- `actions[]`: atomic action list
  - `type: "command"`: `scope` (project|docs), `cwd`, `cmd`, `category`, `operationType`, `requiresUserCheck`
  - `type: "instruction"`: `message`, `category`, `operationType`, `requiresUserCheck`
- `actionOptions[]`: `label` (`A`, `B`, `C`...) + target `action` + user-facing `summary` / `detail` / `approvalPrompt`
- `approvalRequest`: ready-to-use approval/execute guidance (`labels`, `approveCommand`, `executeCommand`, `options[]`)
- `requiredDocs`: built-in docs to read before the current action (`id`, `command`)
- `checkPolicy`: approval validation policy (`token`, `acceptedTokens`, `tokenPattern`, `validLabels`, `contextVersion`, ...)
- `agentOrchestration`: main-agent (conversation/approval) + sub-agent (execution) contract (`mode`, `delegationPolicy`, `delegateCommandExecution`, `longRunningCategories`, `fallbackToMainAgentWhenSubAgentUnavailable`, `pauseAndReportWhen`, `resumePriority`)

**Advanced/reference fields (automation edge cases or debugging)**

- `selectionFallback`: fallback used when branch auto-detection does not match (`none` | `open_features` | `all_features` | `done_features`)
- `primaryActionLabel` / `primaryActionType` / `primaryActionCategory` / `primaryActionOperationType`: summary metadata for the first atomic action
- `workflowPolicy`: current completion policy (`mode`, `requireIssue`, `requireBranch`, `requirePr`, `requireReview`)
- `taskCommitGatePolicy`: task commit gate policy (`off` | `warn` | `strict`)
- `prePrReviewPolicy`: pre-PR review policy (`enabled`, `skills`, `fallback`)

Error payloads (`status: "error"`) include `reasonCode` and labeled `suggestions` (`A/B/C`) (e.g. `INVALID_APPROVAL`, `CONTEXT_STALE`, `EXECUTION_FAILED`, `EXECUTION_NOT_COMMAND`).

### Built-in Docs

If you do not restore `agents.md` into project docs, fetch CLI-managed guides directly:
`docs get create-issue|issue-doc|create-pr|pr-doc --json` also returns `contract` (required sections / artifact rules).

```bash
# list built-in docs
npx lee-spec-kit docs list --json

# root agent guide
npx lee-spec-kit docs get agents --json

# issue/PR procedure + templates
npx lee-spec-kit docs get create-issue --json
npx lee-spec-kit docs get issue-doc --json
npx lee-spec-kit docs get create-pr --json
npx lee-spec-kit docs get pr-doc --json
```

### View

```bash
npx lee-spec-kit view
npx lee-spec-kit view F001
npx lee-spec-kit view --all
npx lee-spec-kit view --json
```

**Options:**

| Option         | Description                                     |
| -------------- | ----------------------------------------------- |
| `--json`       | JSON output for agents                          |
| `--component <id>` | Select target component in multi mode (e.g. `app`, `api`, `worker`) |
| `--all`        | Include completed features when auto-detecting  |
| `--done`       | Show completed (workflow-done) features only    |

### Flow

```bash
# workflow summary (context + status + doctor)
npx lee-spec-kit flow

# approve + execute (recommended agent path)
npx lee-spec-kit flow F001 --approve A --execute

# auto-run: stop and wait for approval when one of target categories appears
npx lee-spec-kit flow F004 --auto-until-category pr_create,code_review,pr_status_update

# auto-run using preset
npx lee-spec-kit flow F004 --auto-preset pr-handoff

# auto-run + apply new request first (runs user_request_replan first)
npx lee-spec-kit flow F004 --request "promote issue 004 to F004 and proceed" --auto-until-category pr_create,code_review,pr_status_update

# with default preset configured, request-only auto mode is available
npx lee-spec-kit flow F004 --request "promote issue 004 to F004 and proceed"

# long-running auto: create checkpoint + resume
npx lee-spec-kit flow F004 --auto-until-category pr_create,code_review,pr_status_update --start-auto --json
npx lee-spec-kit flow --resume <RUN_ID> --json

# JSON output for automation
npx lee-spec-kit flow --json

# strict checks (optional)
npx lee-spec-kit flow --strict
```

**Options:**

| Option            | Description |
| ----------------- | ----------- |
| `--json`          | JSON output for agents |
| `--component <id>`| Select target component in multi mode (e.g. `app`, `api`, `worker`) |
| `--all`           | Include completed features when auto-detecting |
| `--done`          | Show completed (workflow-done) features only |
| `--request <text>` | In auto mode, apply a new user request first (auto-selects `user_request_replan`) |
| `--auto-preset <name>` | Use a named auto preset (builtin: `pr-handoff`) |
| `--auto-until-category <categories>` | Auto-execute command actions until one of target categories appears (comma-separated) |
| `--start-auto`     | Persist auto checkpoint (run id) and include resume metadata (`autoRun.run`) in JSON |
| `--resume <run-id>`| Resume stored auto checkpoint by run id |
| `--approve <reply>` | Pass through context label approval (e.g. `A`, `A OK`, `A proceed`) |
| `--execute`       | Execute approved option when it is a command (ticket is required only when `requiresUserCheck=true`) |
| `--execute-strict`| With `--execute`, fail if approved option is instruction-only |
| `--strict`        | Also run `status --strict` and `doctor --strict` |

Auto gate mode rules:
- `<feature-name>` is required with auto mode (`--auto-until-category` / `--auto-preset`) (for example `F004`).
- Auto mode (`--auto-until-category` / `--auto-preset`) cannot be combined with `--approve` or `--execute`.
- `--request` requires auto mode.
  - Exception: if `workflow.auto.defaultPreset` is configured, `--request` alone enables auto mode.
- `--resume <run-id>` cannot be combined with `<feature-name>`, `--component`, `--all`, `--done`, `--auto-*`, or `--request`. (It uses settings from the stored checkpoint.)
- Auto-run stops as `gate_reached` when a target category appears, then prints that step's approval text (`approvalRequest.userFacingLines`).
- If the current action set is instruction-only (no executable command), auto-run may stop with `AUTO_MANUAL_REQUIRED`. This is an automation boundary, not a CLI crash.
- If progress stalls (same context/action repeating), it stops with `AUTO_NO_PROGRESS`.
- In JSON mode, inspect `autoRun.status`, `autoRun.reasonCode`, `autoRun.gate`, `autoRun.executions`, and `autoRun.resume`.
- Inspect JSON `agentOrchestration` for main/sub-agent responsibilities and pause/report boundaries.
  - When `delegateCommandExecution: "long_running_only"`, keep short steps in the main agent and delegate only categories listed in `longRunningCategories`.
- With `--start-auto`, JSON also includes `autoRun.run` (`runId`, `status`, `resumeCommand`).

Agent resume rules (recommended):
- When `flow --json` returns `autoRun.enabled=true`, resume with `autoRun.resume.flowCommand` after interruption/compression.
- If you need a fresh checkpoint before resuming, run `autoRun.resume.contextCommand` first.
- If `context --json` returns `approvalRequest.required=true`, stop immediately and report to the user.
- When `--start-auto` is used, prefer `autoRun.run.resumeCommand` (`flow --resume <runId>`) as the first resume path.

### GitHub helpers

```bash
# Generate issue body from selected feature
npx lee-spec-kit github issue F001

# Generate + create issue
npx lee-spec-kit github issue F001 --create --confirm OK --labels enhancement,frontend

# Generate PR body
npx lee-spec-kit github pr F001

# Generate PR body (force screenshots/Mermaid sections)
npx lee-spec-kit github pr F001 --screenshots on --mermaid on

# Generate + create PR + sync tasks.md metadata + merge with retry
npx lee-spec-kit github pr F001 --create --merge --confirm OK --labels enhancement,frontend
```

Key points:
- Issue/PR helpers validate required body sections and related docs paths.
- `--json` output includes both `body` (inline markdown) and `bodyFile` (file path).
- Labels are validated (at least one required).
- `--create`/`--merge` are remote operations and require `--confirm OK`.
- PR helper can sync `tasks.md` PR URL/PR Status automatically (`--no-sync-tasks` to skip).
- PR artifact sections are controlled by `--screenshots (auto|on|off)` and `--mermaid (auto|on|off)`.
- Merge includes retry and automatic head-branch refresh (fetch/rebase/force-push) on out-of-date failures.

### Status

```bash
npx lee-spec-kit status
npx lee-spec-kit status --json
npx lee-spec-kit status --write
npx lee-spec-kit status --strict
```

**Options:**

| Option         | Description                                          |
| -------------- | ---------------------------------------------------- |
| `--json`       | JSON output for agents                               |
| `-w, --write`  | Write `features/status.md`                           |
| `-s, --strict` | Exit with code 1 when duplicate/missing Feature IDs exist |

Status values distinguish implementation vs workflow completion:
- `DONE`: all tasks are marked done, but workflow requirements are not fully satisfied
- `WORKFLOW_DONE`: implementation + workflow requirements are both satisfied

### Global Option

```bash
npx lee-spec-kit --no-banner --help
```

You can also disable banner output via `LEE_SPEC_KIT_NO_BANNER=1`.
Banner output is also suppressed by default for non-TTY runs (for example, agent/pipeline execution).

### Doctor

```bash
npx lee-spec-kit doctor
npx lee-spec-kit doctor --strict
npx lee-spec-kit doctor --json
npx lee-spec-kit doctor --fix
npx lee-spec-kit doctor --fix --dry-run
npx lee-spec-kit doctor --decisions-placeholders off
npx lee-spec-kit doctor --decisions-placeholders info
npx lee-spec-kit doctor --decisions-placeholders warn
```

- `--decisions-placeholders <mode>`:
  - `off`: ignore `decisions.md` placeholders
  - `info` (default): include as informational findings (non-blocking)
  - `warn`: treat as warnings

### Update templates

By default, `update` runs only when the `docs/` working tree is clean; in that case it overwrites changed files without prompting.  
If you want to update while you have uncommitted changes, use `--force`.
`update` also backfills missing `.lee-spec-kit.json` keys using current defaults (e.g. `workflow.taskCommitGate: "warn"`).

```bash
npx lee-spec-kit update
npx lee-spec-kit update --agents
npx lee-spec-kit update --skills
npx lee-spec-kit update --templates
npx lee-spec-kit update --force
```

> `agents/skills` and `features/feature-base` are now CLI-managed (SSOT).  
> `update --skills` and `update --templates` are used to clean up legacy copied files in existing docs trees.

## Configuration

### `.lee-spec-kit.json`

Running `init` creates `.lee-spec-kit.json` in your docs root (default: `docs/`).

```json
{
  "projectName": "my-project",
  "projectType": "single",
  "lang": "en",
  "createdAt": "YYYY-MM-DD",
  "docsRepo": "embedded",
  "workflow": {
    "mode": "github",
    "codeDirtyScope": "auto",
    "taskCommitGate": "warn",
    "prePrReview": { "skills": ["code-review-excellence"] }
  },
  "pr": { "screenshots": { "upload": false } },
  "approval": { "mode": "builtin" }
}
```

| Field         | Description                                      |
| ------------- | ------------------------------------------------ |
| `projectName` | Project name                                     |
| `projectType` | `single` or `multi` (`fullstack` alias supported) |
| `components`  | (multi only) component list (e.g. `["app","api","worker"]`) |
| `lang`        | `ko` or `en`                                     |
| `createdAt`   | Creation date                                    |
| `docsRepo`    | `embedded` or `standalone`                       |
| `pushDocs`    | (standalone only) whether to manage/push docs repo as a separate git repo |
| `docsRemote`  | (standalone + pushDocs) docs repo remote URL |
| `projectRoot` | (standalone only) project repo path (single: string, multi: `{ [component]: path }`) |
| `workflow`    | (optional) workflow completion policy (`github`/`local`, `codeDirtyScope`, `taskCommitGate`, `prePrReview`) |
| `pr`          | (optional) PR artifacts policy (e.g. screenshot upload) |
| `approval`    | (optional) Override CHECK-required policy in `context` output (for automation/semi-auto) |

> In standalone mode, `init` can add `pushDocs`, `docsRemote`, and `projectRoot` to this config.
> If you run the CLI outside the docs repo in standalone mode, set `LEE_SPEC_KIT_DOCS_DIR` to the docs repo path.

### approval (check policy)

`approval` only affects the following values produced by `context`:

- the `[CHECK required]` tag in text output
- `actionOptions[].requiresUserCheck` in `context --json-compact` (`actions[].requiresUserCheck` in `--json`)
- `checkPolicy.token` (`context --json-compact`/`--json`): approval token format (`<LABEL>`)
- `checkPolicy.acceptedTokens`: accepted reply templates (e.g. `["<LABEL>", "<LABEL> OK", "<LABEL> ...", "... <LABEL> ..."]`)
- `checkPolicy.tokenPattern`: input validation regex for approval replies
- `checkPolicy.validLabels`: currently selectable labels (`A`, `B`, `C`...)
- `checkPolicy.activeCategories`: categories currently present in actions (from `actionOptions[].category`)
- `checkPolicy.knownCategories`: full category list recognized by the CLI
- `checkPolicy.uncategorizedLabels`: labels with missing category (should normally be empty)
- `checkPolicy.categoryPolicyGuidance`: guidance for matching categories in `approval.mode="category"`
- `checkPolicy.requireExplanationBeforeApproval`: require label-by-label explanation before asking approval
- `checkPolicy.requiredExplanationFields`: fields to use for explanation (e.g. `actionOptions[].detail`)
- `checkPolicy.contextVersion`: snapshot hash for stale-context validation
- `actionOptions`: maps `label` (`A`, `B`, `C`...) to each atomic `action`
- `workflowPolicy`: current completion policy (`mode`, `requireIssue`, `requireBranch`, `requirePr`, `requireReview`)
- `taskCommitGatePolicy`: task commit gate policy (`off` | `warn` | `strict`)

> This does not enforce/deny execution by itself; it’s a signal for agents.
> If `approval` is omitted, it behaves as `builtin`. (No migration required)
> When `requiresUserCheck: true`, it’s recommended that agents wait for an explicit `<label>` or `<label> OK` response (e.g. `A`, `A OK`) before proceeding.

### workflow (completion policy)

- `workflow.mode: "github"` (default): issue/branch/PR/review are required in workflow completion
- `workflow.mode: "local"`: local-first workflow; issue/branch/PR/review are not required
  - Feature templates generated in local mode minimize Issue/PR-focused sections by default.
- `workflow.codeDirtyScope`:
  - `repo`: evaluate uncommitted code changes across the whole project repo
  - `component`: evaluate only paths mapped to the current feature component (recommended for multi)
  - `auto`: `single => repo`, `multi => component`
  - `workflow.componentPaths` (optional): explicit per-component paths for component-scoped checks (e.g. `"web": ["apps/web", "packages/web-ui"]`)
  - backward compatibility: if omitted, runtime defaults to `repo`
- `workflow.taskCommitGate`:
  - `strict`: block only when the latest `tasks.md` commit includes 2+ DONE transitions
  - `warn`: show warning but allow progress
  - `off`: disable the check
  - backward compatibility: if omitted, runtime defaults to `warn`
- `workflow.prePrReview`:
  - `enabled` (optional): enforce pre-PR review stage (default: same as `requirePr`)
  - `skills` (optional): preferred skill names in priority order (default: `["code-review-excellence"]`)
  - `fallback` (optional): baseline review policy (default: `"builtin-checklist"`)
    - Use the `Pre-PR Baseline Checklist` section in `docs get create-pr --json` as the single source of truth
  - `evidenceMode` (optional): evidence validation mode (`"path_required"` | `"any"`, default: `"path_required"`)
    - `path_required`: evidence must be a real existing local path
  - `decisionEnum` (optional): allowed decision outcomes (default: `["approve","changes_requested","blocked"]`)
    - Moving to PR step requires final decision `approve`
- `workflow.auto`:
  - `defaultPreset` (optional): default auto preset used by `flow --request "<text>"` (default: `"pr-handoff"`)
  - `defaultUntilCategories` (optional): default gate categories (takes precedence over `defaultPreset`)
  - `presets` (optional): custom preset map
    - Example: `"my-handoff": ["pr_create", "code_review"]`

Example:

```json
{
  "workflow": {
    "mode": "github",
    "codeDirtyScope": "auto",
    "taskCommitGate": "warn",
    "auto": {
      "defaultPreset": "pr-handoff",
      "presets": {
        "my-handoff": ["pr_create", "code_review", "pr_status_update"]
      }
    },
    "prePrReview": {
      "skills": ["code-review-excellence"],
      "fallback": "builtin-checklist",
      "evidenceMode": "path_required",
      "decisionEnum": ["approve", "changes_requested", "blocked"]
    }
  }
}
```

#### Modes

- `builtin` (default): keep built-in `requiresUserCheck` in steps/actions
- `category` (recommended): control CHECK policy by `actionOptions[].category` (`actions[].category` in `--json`)
- `steps`: control by step numbers (not recommended; fragile)

#### Fields

- `default` (`category` only): `keep` | `require` | `skip` (default: `keep`)
- `requireCheckCategories` (`category` only): categories that **always** require CHECK (e.g. `["pr_create"]`, `["*"]`)
- `skipCheckCategories` (`category` only): categories that **never** require CHECK (e.g. `["docs_commit"]`, `["*"]`)
- `requireCheckSteps` (`steps` only): step numbers that require CHECK (e.g. `[3, 5, 12]`)
- `taskExecuteCheck` (optional): `task_execute` approval policy (`both` | `start_only`, default: `both`)
  - `both`: require approval for both TODO→DOING and DOING→DONE transitions
  - `start_only`: require approval only for TODO→DOING, skip default approval for DOING→DONE

#### category examples

```json
{
  "approval": { "mode": "category", "default": "skip" }
}
```

```json
{
  "approval": {
    "mode": "category",
    "default": "keep",
    "skipCheckCategories": ["docs_commit"]
  }
}
```

> Discover category values from `context --json`/`--json-compact` using `checkPolicy.activeCategories` (current), `checkPolicy.knownCategories` (full), and `actionOptions[].category` (per-label).

### pr (PR artifacts policy)

- `pr.screenshots.upload` (default: `false`): When `true`, agents may upload screenshots (e.g. GitHub Release assets) and include URLs in PR body. When `false`, agents should not upload/include URLs and should omit screenshot sections from the PR body.

### View/Update Config

```bash
# show current config
npx lee-spec-kit config

# target a specific docs path when multiple docs directories exist
npx lee-spec-kit config --dir ./docs2

# update projectRoot (single)
npx lee-spec-kit config --project-root /new/path
npx lee-spec-kit config --dir ./docs2 --project-root /new/path

# update projectRoot (multi)
npx lee-spec-kit config --project-root /new/app/path --component app
npx lee-spec-kit config --project-root /new/api/path --component api
npx lee-spec-kit config --project-root /new/worker/path --component worker

# non-interactive mode (fails immediately if required input is missing)
npx lee-spec-kit config --project-root /new/app/path --component app --non-interactive
```

**Options:**

| Option | Description |
| --- | --- |
| `--dir <dir>` | Target docs directory or project path |
| `--project-root <path>` | Set projectRoot path |
| `--component <id>` | Target component in multi mode |
| `--non-interactive` | Fail immediately instead of prompting for user input |

> `--non-interactive` is supported by `init`, `feature`, and `config`.
> For automation, command errors print `[REASON_CODE]` (e.g. `PROMPT_BLOCKED`, `CONFIG_NOT_FOUND`).
> Text-mode errors also print labeled next options under `👉 Next Options (Error)`.

### Error Codes

- This CLI exposes error reason codes for automation:
  - `reasonCode` in JSON responses
  - `[REASON_CODE]` in text error output
- Error responses also provide labeled next-step suggestions (`A/B/C`):
  - `suggestions` in JSON mode
  - `👉 Next Options (Error)` in text mode
- Common examples:
  - `PROMPT_BLOCKED`
  - `CONFIG_NOT_FOUND`
  - `DOCS_NOT_FOUND`
  - `LOCK_WAIT_TIMEOUT` / `LOCK_ACQUIRE_TIMEOUT`
  - `INVALID_APPROVAL`, `CONTEXT_STALE`, `EXECUTION_FAILED`, `EXECUTION_NOT_COMMAND`

For the full code list and meanings, see `errors.en.md` (English) or `errors.md` (Korean).

## Generated Structure

See the Korean README for the full tree examples and workflow details: `README.md`.

Note: generated docs keep project-scoped policy docs (`agents/custom.md`, `agents/constitution.md`) and do not sync CLI-managed docs (`agents.md`, `agents/skills/*`, `git-workflow.md`, `features/feature-base/*`).

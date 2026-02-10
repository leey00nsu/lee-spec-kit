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

# 2) Create a feature
npx lee-spec-kit feature user-auth

# 3) Show next steps (for agents)
npx lee-spec-kit context

# 4) Show workflow dashboard
npx lee-spec-kit view

# 5) Show overall status
npx lee-spec-kit status

# 6) Validate docs / feature metadata
npx lee-spec-kit doctor
```

## Features

### 📁 Project initialization

- Interactive init or CLI options
- Supports `single` and `multi` (`fullstack` remains as a backward-compatible alias)
- Korean/English templates

### 🚀 Feature creation

- Generates `spec.md`, `plan.md`, `tasks.md`, `decisions.md`
- Multi mode supports flexible component separation (e.g. FE/BE/worker)
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
| `-t, --type <type>` | `single` or `multi` (`fullstack` alias supported)                                          | interactive (`single` with `--yes`/`--non-interactive`) |
| `--components <list>` | multi component list (comma-separated, e.g. `fe,be,worker`)                              | `fe,be`                         |
| `-l, --lang <lang>` | `ko` or `en`                                                                                | `en`                            |
| `--workflow <mode>` | Workflow mode: `github` (issue/PR/review) or `local` (local-first)                         | `github`                        |
| `-d, --dir <dir>`   | Install directory                                                                           | `./docs`                        |
| `--docs-repo <mode>` | docs repo mode (`embedded` or `standalone`)                                               | `embedded`                      |
| `--project-root <path>` | standalone(single) project repo path                                                   | -                               |
| `--fe-project-root <path>` | standalone(multi) frontend repo path                                                | -                               |
| `--be-project-root <path>` | standalone(multi) backend repo path                                                 | -                               |
| `--push-docs` | enable standalone docs push (use with `--docs-remote`)                                   | `false`                         |
| `--docs-remote <url>` | standalone docs remote URL (used with `--push-docs`)                                    | -                               |
| `-y, --yes`         | Skip most interactive inputs (overwrite confirmation still appears if target dir is not empty) | -                               |
| `-f, --force`       | Overwrite non-empty target directory without confirmation                                  | `false`                         |
| `--non-interactive` | Fail immediately instead of prompting for user input                                        | `false`                         |

> After generating docs, `init` automatically attempts Git setup/commit (`git init`, `git add`, `git commit`). Auto-commit may be skipped depending on environment/state.

### Create a feature

```bash
# Single
npx lee-spec-kit feature user-auth

# Multi
npx lee-spec-kit feature --repo be user-auth
npx lee-spec-kit feature --repo fe user-profile
npx lee-spec-kit feature --component worker queue-jobs

# Specify Feature ID/description
npx lee-spec-kit feature payment --id F123 --desc "Improve payment flow"
```

**Options:**

| Option              | Description                                 | Default      |
| ------------------- | ------------------------------------------- | ------------ |
| `-r, --repo <repo>` | Multi target component (backward-compatible alias) | interactive  |
| `--component <id>`  | Multi target component                       | interactive  |
| `--id <id>`         | Feature ID (`F001` format)                  | auto-generate |
| `-d, --desc <desc>` | Default purpose/description text for `spec.md` | empty string |
| `--non-interactive` | Fail immediately instead of prompting for user input | `false` |
| `--json`            | JSON output (`featureId`, `featurePath`, `component`) | `false` |

### Context (agent guide)

For a single matched feature, next steps are always shown as `A/B/C` options.

```bash
# Auto-detect (based on git branch)
npx lee-spec-kit context

# Specify a feature
npx lee-spec-kit context user-auth

# Selector: Feature ID / folder name
npx lee-spec-kit context F001
npx lee-spec-kit context F001-user-auth

# multi component selector
npx lee-spec-kit context --repo fe
npx lee-spec-kit context --repo worker

# include all / done features
npx lee-spec-kit context --all
npx lee-spec-kit context --done

# JSON output (for agents)
npx lee-spec-kit context --json

# approve a labeled option (validation only)
npx lee-spec-kit context F001 --approve A

# approve + execute exactly one command option
npx lee-spec-kit context F001 --approve "A OK" --execute

# fail when the approved label is instruction-only
npx lee-spec-kit context F001 --approve A --execute --execute-strict
```

**Options:**

| Option         | Description                                     |
| -------------- | ----------------------------------------------- |
| `--json`       | JSON output for agents                          |
| `--repo <repo>`| Select target component in multi mode (e.g. `fe`, `be`, `worker`) |
| `--all`        | Include completed features when auto-detecting  |
| `--done`       | Show completed (workflow-done) features only    |
| `--approve <reply>` | Approve one labeled option (`A` or `A OK`) |
| `--execute`    | Execute only the approved option when it is a command |
| `--execute-strict` | With `--execute`, fail if the approved option is instruction-only |

`--json` output includes:

- `reasonCode`: status reason code (`SINGLE_MATCHED`, `MULTIPLE_ACTIVE_FEATURES`, etc.)
- `operationType`: action nature (`local` | `remote` | `manual`)
- `actionOptions`: maps labels to atomic actions plus `summary`/`approvalPrompt` for user-facing label explanation
- `primaryActionLabel` / `primaryActionType` / `primaryActionCategory` / `primaryActionOperationType`: metadata for the first atomic action
- `selectionFallback`: fallback used when branch auto-detection does not match (`none` | `open_features` | `all_features` | `done_features`)
- `workflowPolicy`: current completion policy (`mode`, `requireIssue`, `requireBranch`, `requirePr`, `requireReview`)
- `prePrReviewPolicy`: pre-PR review policy (`enabled`, `skills`, `fallback`, `blockOnFindings`)
- `checkPolicy`: approval validation policy (`hint`, `policyOnly`, `token: "<LABEL>"`, `acceptedTokens`, `tokenPattern`, `validLabels`, `requireExplanationBeforeApproval`, `requiredExplanationFields`, `contextVersion`, ...)

Error payloads (`status: "error"`) include `reasonCode` and labeled `suggestions` (`A/B/C`) (e.g. `INVALID_APPROVAL`, `CONTEXT_STALE`, `EXECUTION_FAILED`, `EXECUTION_NOT_COMMAND`).

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
| `--repo <repo>`| Select target component in multi mode (e.g. `fe`, `be`, `worker`) |
| `--all`        | Include completed features when auto-detecting  |
| `--done`       | Show completed (workflow-done) features only    |

### Flow

```bash
npx lee-spec-kit flow
npx lee-spec-kit flow F001 --approve A
npx lee-spec-kit flow F001 --approve "A OK" --execute
npx lee-spec-kit flow --strict
npx lee-spec-kit flow --json
```

**Options:**

| Option            | Description |
| ----------------- | ----------- |
| `--json`          | JSON output for agents |
| `--repo <repo>`   | Select target component in multi mode (e.g. `fe`, `be`, `worker`) |
| `--all`           | Include completed features when auto-detecting |
| `--done`          | Show completed (workflow-done) features only |
| `--approve <reply>` | Pass through context label approval (`A` or `A OK`) |
| `--execute`       | Execute approved option when it is a command |
| `--execute-strict`| With `--execute`, fail if approved option is instruction-only |
| `--strict`        | Also run `status --strict` and `doctor --strict` |

### GitHub helpers

```bash
# Generate issue body from selected feature
npx lee-spec-kit github issue F001

# Generate + create issue
npx lee-spec-kit github issue F001 --create --confirm OK --labels enhancement,frontend

# Generate PR body
npx lee-spec-kit github pr F001

# Generate + create PR + sync tasks.md metadata + merge with retry
npx lee-spec-kit github pr F001 --create --merge --confirm OK --labels enhancement,frontend
```

Key points:
- Issue/PR helpers validate required body sections and related docs paths.
- `--json` output includes both `body` (inline markdown) and `bodyFile` (file path).
- Labels are validated (at least one required).
- `--create`/`--merge` are remote operations and require `--confirm OK`.
- PR helper can sync `tasks.md` PR URL/PR Status automatically (`--no-sync-tasks` to skip).
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
| `components`  | (multi only) component list (e.g. `["fe","be","worker"]`) |
| `lang`        | `ko` or `en`                                     |
| `createdAt`   | Creation date                                    |
| `docsRepo`    | `embedded` or `standalone`                       |
| `pushDocs`    | (standalone only) whether to manage/push docs repo as a separate git repo |
| `docsRemote`  | (standalone + pushDocs) docs repo remote URL |
| `projectRoot` | (standalone only) project repo path (single: string, multi: `{ [component]: path }`) |
| `workflow`    | (optional) workflow completion policy (`github`/`local`, `codeDirtyScope`, `prePrReview`) |
| `pr`          | (optional) PR artifacts policy (e.g. screenshot upload) |
| `approval`    | (optional) Override CHECK-required policy in `context` output (for automation/semi-auto) |

> In standalone mode, `init` can add `pushDocs`, `docsRemote`, and `projectRoot` to this config.
> If you run the CLI outside the docs repo in standalone mode, set `LEE_SPEC_KIT_DOCS_DIR` to the docs repo path.

### approval (check policy)

`approval` only affects the following values produced by `context`:

- the `[CHECK required]` tag in text output
- `actions[].requiresUserCheck` in `context --json`
- `checkPolicy.token` (`context --json`): approval token format (`<LABEL>`)
- `checkPolicy.acceptedTokens`: accepted reply templates (e.g. `["<LABEL>", "<LABEL> OK"]`)
- `checkPolicy.tokenPattern`: input validation regex for approval replies
- `checkPolicy.validLabels`: currently selectable labels (`A`, `B`, `C`...)
- `checkPolicy.requireExplanationBeforeApproval`: require label-by-label explanation before asking approval
- `checkPolicy.requiredExplanationFields`: fields to use for explanation (e.g. `actionOptions[].summary`)
- `checkPolicy.contextVersion`: snapshot hash for stale-context validation
- `actionOptions`: maps `label` (`A`, `B`, `C`...) to each atomic `action`
- `workflowPolicy`: current completion policy (`mode`, `requireIssue`, `requireBranch`, `requirePr`, `requireReview`)

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
- `workflow.prePrReview`:
  - `enabled` (optional): enforce pre-PR review stage (default: same as `requirePr`)
  - `skills` (optional): preferred skill names in priority order (default: `["code-review-excellence"]`)
  - `fallback` (optional): fallback policy when no skill can run (default: `"builtin-checklist"`)
  - `blockOnFindings` (optional): require major findings to be resolved/aligned before PR creation (default: `true`)

Example:

```json
{
  "workflow": {
    "mode": "github",
    "codeDirtyScope": "auto",
    "prePrReview": {
      "skills": ["code-review-excellence"],
      "fallback": "builtin-checklist",
      "blockOnFindings": true
    }
  }
}
```

#### Modes

- `builtin` (default): keep built-in `requiresUserCheck` in steps/actions
- `category` (recommended): control CHECK policy by `actions[].category`
- `steps`: control by step numbers (not recommended; fragile)

#### Fields

- `default` (`category` only): `keep` | `require` | `skip` (default: `keep`)
- `requireCheckCategories` (`category` only): categories that **always** require CHECK (e.g. `["pr_create"]`, `["*"]`)
- `skipCheckCategories` (`category` only): categories that **never** require CHECK (e.g. `["docs_commit"]`, `["*"]`)
- `requireCheckSteps` (`steps` only): step numbers that require CHECK (e.g. `[3, 5, 12]`)

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

> To discover available `category` values, check `actions[].category` in `context --json`.

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
npx lee-spec-kit config --project-root /new/fe/path --repo fe
npx lee-spec-kit config --project-root /new/be/path --repo be
npx lee-spec-kit config --project-root /new/worker/path --component worker

# non-interactive mode (fails immediately if required input is missing)
npx lee-spec-kit config --project-root /new/fe/path --repo fe --non-interactive
```

**Options:**

| Option | Description |
| --- | --- |
| `--dir <dir>` | Target docs directory or project path |
| `--project-root <path>` | Set projectRoot path |
| `--repo <repo>` | Target component in multi mode (backward-compatible alias) |
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

Note: generated docs keep project-scoped policy docs (`agents/custom.md`, `agents/constitution.md`) and do not sync CLI-managed docs (`agents.md`, `agents/skills/*`, `git-workflow.md`, `issue-template.md`, `pr-template.md`, `features/feature-base/*`).

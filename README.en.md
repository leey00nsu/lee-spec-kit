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

# 4) Show overall status
npx lee-spec-kit status

# 5) Validate docs / feature metadata
npx lee-spec-kit doctor
```

## Features

### 📁 Project initialization

- Interactive init or CLI options
- Supports `single` and `fullstack` (FE/BE split)
- Korean/English templates

### 🚀 Feature creation

- Generates `spec.md`, `plan.md`, `tasks.md`, `decisions.md`
- Fullstack mode supports FE/BE separation
- Integrates Issue/PR templates (docs side)

### 📊 Status management

- View feature progress at a glance
- Print to terminal or write a Markdown report

### 🩺 Doctor

- Checks docs structure and feature metadata (missing status, duplicate IDs, placeholders, etc.)
- `--json` output for automation/agents

### 🔄 Template updates

- Updates docs templates to the latest version

## Usage

### Init

```bash
npx lee-spec-kit init
npx lee-spec-kit init --name my-project --type fullstack
```

**Options:**

| Option              | Description                                                                                 | Default                         |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| `-n, --name <name>` | Project name                                                                                | current folder                  |
| `-t, --type <type>` | `single` or `fullstack`                                                                     | interactive (`single` with `--yes`) |
| `-l, --lang <lang>` | `ko` or `en`                                                                                | `en`                            |
| `-d, --dir <dir>`   | Install directory                                                                           | `./docs`                        |
| `-y, --yes`         | Skip most interactive inputs (overwrite confirmation still appears if target dir is not empty) | -                               |

> After generating docs, `init` automatically attempts Git setup/commit (`git init`, `git add`, `git commit`). Auto-commit may be skipped depending on environment/state.

### Create a feature

```bash
# Single
npx lee-spec-kit feature user-auth

# Fullstack
npx lee-spec-kit feature --repo be user-auth
npx lee-spec-kit feature --repo fe user-profile

# Specify Feature ID/description
npx lee-spec-kit feature payment --id F123 --desc "Improve payment flow"
```

**Options:**

| Option              | Description                                 | Default      |
| ------------------- | ------------------------------------------- | ------------ |
| `-r, --repo <repo>` | `fe` or `be` (fullstack only)               | interactive  |
| `--id <id>`         | Feature ID (`F001` format)                  | auto-generate |
| `-d, --desc <desc>` | Default purpose/description text for `spec.md` | empty string |

### Context (agent guide)

```bash
# Auto-detect (based on git branch)
npx lee-spec-kit context

# Specify a feature
npx lee-spec-kit context user-auth

# Selector: Feature ID / folder name
npx lee-spec-kit context F001
npx lee-spec-kit context F001-user-auth

# fullstack repo selector
npx lee-spec-kit context --repo fe

# include all / done features
npx lee-spec-kit context --all
npx lee-spec-kit context --done

# JSON output (for agents)
npx lee-spec-kit context --json
```

**Options:**

| Option         | Description                                     |
| -------------- | ----------------------------------------------- |
| `--json`       | JSON output for agents                          |
| `--repo <repo>`| Select target repo in fullstack (`fe` or `be`) |
| `--all`        | Include completed features when auto-detecting  |
| `--done`       | Show completed (workflow-done) features only    |

### Status

```bash
npx lee-spec-kit status
npx lee-spec-kit status --write
npx lee-spec-kit status --strict
```

**Options:**

| Option         | Description                                          |
| -------------- | ---------------------------------------------------- |
| `-w, --write`  | Write `features/status.md`                           |
| `-s, --strict` | Exit with code 1 when duplicate/missing Feature IDs exist |

### Doctor

```bash
npx lee-spec-kit doctor
npx lee-spec-kit doctor --strict
npx lee-spec-kit doctor --json
```

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
  "pr": { "screenshots": { "upload": false } },
  "approval": { "mode": "builtin" }
}
```

| Field         | Description                                      |
| ------------- | ------------------------------------------------ |
| `projectName` | Project name                                     |
| `projectType` | `single` or `fullstack`                          |
| `lang`        | `ko` or `en`                                     |
| `createdAt`   | Creation date                                    |
| `docsRepo`    | `embedded` or `standalone`                       |
| `pushDocs`    | (standalone only) whether to manage/push docs repo as a separate git repo |
| `docsRemote`  | (standalone + pushDocs) docs repo remote URL |
| `projectRoot` | (standalone only) project repo path (single: string, fullstack: {fe, be}) |
| `pr`          | (optional) PR artifacts policy (e.g. screenshot upload) |
| `approval`    | (optional) Override CHECK-required policy in `context` output (for automation/semi-auto) |

> In standalone mode, `init` can add `pushDocs`, `docsRemote`, and `projectRoot` to this config.
> If you run the CLI outside the docs repo in standalone mode, set `LEE_SPEC_KIT_DOCS_DIR` to the docs repo path.

### approval (check policy)

`approval` only affects the following values produced by `context`:

- the `[CHECK required]` tag in text output
- `actions[].requiresUserCheck` in `context --json`
- `checkPolicy.token` (`context --json`): recommended approval token (`OK`)

> This does not enforce/deny execution by itself; it’s a signal for agents.
> If `approval` is omitted, it behaves as `builtin`. (No migration required)
> When `requiresUserCheck: true`, it’s recommended that agents wait for an explicit `OK` response before proceeding.

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

## Generated Structure

See the Korean README for the full tree examples and workflow details: `README.md`.

Note: generated docs include `agents/custom.md`, `agents/skills/`, and `scripts/` by default.

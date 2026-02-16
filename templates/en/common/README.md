# {{projectName}} Documentation Guide

This documentation is organized by feature to help agents quickly understand the project.

## Agent Session Start Checklist

```bash
# (recommended once at start) run onboarding checks
npx lee-spec-kit onboard --strict

# 1) Detect project
npx lee-spec-kit detect --json

# 2) If detected, read context first
npx lee-spec-kit context --json-compact
```

- Apply lee-spec-kit workflow only when `isLeeSpecKitProject: true`.
- When `actionOptions` exist, show `approvalPrompt`/`finalPrompt` exactly as provided and wait for user approval (`<LABEL>` or `<LABEL> OK`) before execution.
- If `isLeeSpecKitProject: false`, skip lee-spec-kit-specific flow and continue with normal workflow.

## New Project Start Order

- Scaffold the code project first (for example Next.js/NestJS), then run `lee-spec-kit init`.
- After that, verify detection with `detect --json`, then continue with `feature` and `context`.
- In most cases (default: embedded), the steps above are all you need.
- Choose standalone only when docs are managed separately from the code repo. In that case, prefer running init from a parent workspace folder (for example `workspace/docs`, `workspace/project`) and set both docs/project paths together. (e.g. `npx lee-spec-kit init --docs-repo standalone --dir ./docs --project-root ./project`)

## Directory Structure

| Path              | Purpose               | Key Documents |
| ----------------- | --------------------- | ------------- |
| `docs/agents/`    | Agent operating rules | `custom.md`, `constitution.md` (engine-managed guides are fetched via `npx lee-spec-kit docs get <doc-id> --json`) |
| `docs/prd/`       | Product requirements  | Project-specific |
| `docs/designs/`   | Design references     | `README.md` (links/guidelines/references) |
| `docs/ideas/`     | Ideas / to-dos        | `README.md` (Idea → Feature promotion rules) |
| `{{featurePath}}` | Feature documentation | `{feature-id}/spec.md`, `plan.md`, `tasks.md`, `decisions.md` |

---

## CLI Config (`.lee-spec-kit.json`)

When you run `lee-spec-kit init`, it creates `.lee-spec-kit.json` in the docs root (default: `docs/`).

- Used by `lee-spec-kit feature`, `status`, and `update` to detect docs location / project type / language.
- `docsRepo`, `pushDocs`, `docsRemote` are metadata for the CLI-managed **Docs Push policy** (the CLI does not auto-push).

### Fields

- `projectName` (string): Project name
- `projectType` ("single" | "multi"): Project type
- `lang` ("ko" | "en"): Docs language
- `createdAt` (string, YYYY-MM-DD): Creation date
- `docsRepo` ("embedded" | "standalone"): How docs are managed
- `pushDocs` (boolean, optional): Only written when `docsRepo: "standalone"` (whether to push to remote)
- `docsRemote` (string, optional): Only written when `pushDocs: true` (remote repo URL)
- `approval` (object, optional): Override `[CHECK required]` / `requiresUserCheck` policy in `context` output (approval token: `A`, accepted: `A`/`A OK`)

### Examples

```json
{
  "projectName": "{{projectName}}",
  "projectType": "{{projectType}}",
  "lang": "en",
  "createdAt": "{{date}}",
  "docsRepo": "embedded",
  "approval": { "mode": "builtin" }
}
```

```json
{
  "projectName": "{{projectName}}",
  "projectType": "{{projectType}}",
  "lang": "en",
  "createdAt": "{{date}}",
  "docsRepo": "standalone",
  "pushDocs": true,
  "docsRemote": "git@github.com:org/{{projectName}}-docs.git",
  "approval": { "mode": "builtin" }
}
```

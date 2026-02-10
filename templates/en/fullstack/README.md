# {{projectName}} Documentation Guide

This documentation is organized by feature to help agents quickly understand the project.

## Directory Structure

| Path                | Purpose               | Key Documents                                                 |
| ------------------- | --------------------- | ------------------------------------------------------------- |
| `docs/agents/`      | Agent operating rules | `custom.md`, `constitution.md` (engine-managed guides are fetched via `npx lee-spec-kit docs get <doc-id> --json`) |
| `docs/prd/`         | Product requirements  | Project-specific                                              |
| `docs/designs/`     | Design references     | `README.md` (links/guidelines/references)                     |
| `docs/ideas/`       | Ideas / to-dos         | `README.md` (Idea → Feature promotion rules)                  |
| `docs/features/be/` | Backend features      | `{feature-id}/spec.md`, `plan.md`, `tasks.md`, `decisions.md` |
| `docs/features/fe/` | Frontend features     | `{feature-id}/spec.md`, `plan.md`, `tasks.md`, `decisions.md` |

---

## CLI Config (`.lee-spec-kit.json`)

When you run `lee-spec-kit init`, it creates `.lee-spec-kit.json` in the docs root (default: `docs/`).

- Used by `lee-spec-kit feature`, `status`, and `update` to detect docs location / project type / language.
- `docsRepo`, `pushDocs`, `docsRemote` are metadata for the CLI-managed **Docs Push policy** (the CLI does not auto-push).

### Fields

- `projectName` (string): Project name
- `projectType` ("single" | "fullstack"): Project type
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
  "projectType": "fullstack",
  "lang": "en",
  "createdAt": "{{date}}",
  "docsRepo": "embedded",
  "approval": { "mode": "builtin" }
}
```

```json
{
  "projectName": "{{projectName}}",
  "projectType": "fullstack",
  "lang": "en",
  "createdAt": "{{date}}",
  "docsRepo": "standalone",
  "pushDocs": true,
  "docsRemote": "git@github.com:org/{{projectName}}-docs.git",
  "approval": { "mode": "builtin" }
}
```

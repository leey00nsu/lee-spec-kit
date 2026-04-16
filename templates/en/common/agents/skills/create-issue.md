# GitHub Issue Creation Process

Guide for creating GitHub Issues.
Execution-state SSOT is the feature-local `issue.md`.

---

## Prerequisites

- [ ] `spec.md` completed
- [ ] Active feature docs reviewed

---

## Steps

### 1. Prepare `issue.md` Draft

> 📖 **If not read in this session, read procedure/template via `docs get`; do not re-read the same doc in the same session, then generate a draft and treat it as the source of truth.**

```bash
# 1) Read procedure + template policy (only docs not read in this session)
npx lee-spec-kit docs get create-issue --json
npx lee-spec-kit docs get issue-doc --json

# 2) Generate draft body (no remote action)
npx lee-spec-kit github issue F001 --json
```

Use `docs get issue-doc --json` output as document-structure policy,
then refine the feature `issue.md` draft from `github issue --json` `body`.
Use `issue.md` status (`Draft | Ready`) as the actual workflow state.

| Item     | Format                                      |
| -------- | ------------------------------------------- |
| Title    | `{feature-name} ({description})`            |
| Body     | Overview, Goals, Criteria, Related docs     |
| Labels   | `enhancement`, `bug`, `documentation`, etc. |
| Assignee | `@me` (default)                             |

### 2. Move to `Ready`

Share the `issue.md` draft:

- Title
- Full body draft (from `issue.md`)
- Labels

Refine the draft and set `issue.md` status to `Ready` once the document is complete.

### 3. Create Issue (when `issue.md` is `Ready`)

Remote issue creation must use the lee-spec-kit helper.
Do not call `gh issue create` directly or pass raw `issue.md` to `--body-file`.
Remote confirmation is always required:

- share the final title/body/labels with the user
- then run the helper with `--confirm OK`

```bash
npx lee-spec-kit github issue F001 --create --confirm OK --labels enhancement
```

After creation:
- sync created issue number into `tasks.md`
- keep `issue.md` status as `Ready` (creation state is tracked in `tasks.md`)

---

## Reference Documents

- **Draft generator**: `npx lee-spec-kit github issue <feature-name>`
- **Remote creation rule**: must use `npx lee-spec-kit github issue <feature-name> --create --confirm OK --labels ...`
- **Workflow approval rule**: ask the user for approval before remote issue creation
- **Remote confirm rule**: share title/body/labels first, then run `--create --confirm OK`
- **Execution-state SSOT**: `docs/features/.../<feature>/issue.md`

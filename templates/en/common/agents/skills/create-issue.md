> New Features: create/select the GitHub Issue before generating Feature docs. Use `npx lee-spec-kit feature <slug> --issue <number> --owner <email>`, or share the title/body and use `--create-issue --desc <body> --confirm OK`. The legacy `github issue F001` flow below remains for existing F-number Features. Issue creation is intake, not implementation approval.

# GitHub Issue Creation Process

Guide for creating GitHub Issues.
For the legacy flow below, execution-state SSOT is the feature-local `issue.md`. New Features use Issue intake before SDD planning; the following completed-SDD prerequisites do not apply to intake.

---

## Legacy F-number workflow prerequisites

- [ ] `spec.md` completed
- [ ] `plan.md` completed
- [ ] `tasks.md` completed and execution-ready
- [ ] Active feature docs reviewed
- [ ] `npx lee-spec-kit workflow-stage <feature-ref> --json` says the next stage is issue preparation or issue creation

---

## Legacy steps

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
- re-run `npx lee-spec-kit workflow-stage <feature-ref> --json` and continue from the returned next stage instead of jumping straight into implementation

---

## Reference Documents

- **Draft generator**: `npx lee-spec-kit github issue <feature-name>`
- **Remote creation rule**: must use `npx lee-spec-kit github issue <feature-name> --create --confirm OK --labels ...`
- **Workflow approval rule**: ask the user for approval before remote issue creation
- **Remote confirm rule**: share title/body/labels first, then run `--create --confirm OK`
- **Execution-state SSOT**: `docs/features/.../<feature>/issue.md`

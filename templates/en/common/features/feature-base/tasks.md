# Tasks: {feature-name}

## Task Rules

- **Status**: `[TODO]` → `[DOING]` → `[DONE]`
- **Task communication / confirmation**:
  - `[TODO] → [DOING]`: share the task title first, then update the task state in `tasks.md`
  - `[DOING] → [DONE]`: share the result and verification first, then update `Acceptance` and `Checklist` in the same edit
  - Ask for approval before changing task state only when the task crosses a documented review checkpoint or before remote/destructive actions.
  - Do not invent a standalone `OK` approval step when the workflow does not require one.
  - Do not mark `[DONE]` while any item in that task's `Checklist` remains unchecked.
- **PRD mapping (recommended)**: add an existing PRD requirement ID tag like `[PRD-FR-001]` or `[PRD-SCOPE-V1-DESKTOP-EDITOR]` to each task line, or tag non-PRD tasks as `[NON-PRD]`.
  - Do not invent PRD IDs in `tasks.md`. Only reference IDs that already exist in `docs/prd` or the upstream requirements doc.
  - If this is a legacy feature without PRD IDs yet, backfill IDs in the source requirements doc first, then align `spec.md` `PRD Refs` and task tags together.
  - `[NON-PRD]` is for internal implementation work only. If the task changes user-facing behavior, acceptance criteria, or scope, backfill PRD first and tag it as `[PRD-...]`.
- **Design-system synchronization (conditional)**: when a task changes `docs/designs/design-system.md`, track the affected design docs, token/theme files, shared UI, Storybook/workbench examples, and verification in that same task's `Checklist`. Do not edit an unaffected surface; confirm its impact instead.

---

## GitHub Issue

- **Doc Status**: -
  - Values: Draft | Review | Approved
- **Repo**: {{projectName}}-{component}
- **Issue**: #{issue-number}
- **Branch**: `feat/{issue-number}-{feature-name}`
- **Pending Change Request**: -
  - Temporary sync marker for a newly accepted user request during implementation
  - Clear it after reflecting the request in `tasks.md` and related docs
- **PR**: -
  - Example: `#123` or PR URL
- **PR Status**: -
  - Values: Review | Approved
- **Pre-PR Review**: -
  - Values: Pending | Running | Done
  - Mark `Running` when the pre-PR review handoff starts, then `Done` after the review is recorded
- **Pre-PR Evidence**: -
  - Example: `docs/features/F001-foo/decisions.md` (must exist)
- **Pre-PR Decision**: -
  - Format: `decision: approve|changes_requested|blocked ...` (or `결정: ...`)
  - PR creation requires final decision `approve`
  - Follow `agents/skills/create-pr.md` (`Pre-PR Baseline Checklist`) as the default baseline
- **PR Review**: -
  - Values: Pending | Running | Done
  - Mark `Running` when PR review handoff starts; use `Done` only if your team explicitly tracks review completion here
- **PR Review Evidence**: -
  - Example: `summary: ...` (or `요약: ...`), or `docs/features/F001-foo/decisions.md` with `PR Review Log`
- **PR Review Decision**: -
  - Record why/how review comments were addressed as `decision: ...` (or `결정: ...`)

---

## Task Entry Format

```markdown
- [TODO][PRD-FR-001] T-{feature-ref}-01 {Task Title}
  - Date: YYYY-MM-DD
  - Acceptance:
    - (verification condition)
  - Checklist:
    - [ ] (subtask)
```

> `PRD-FR-001` in the example is just one valid `PRD-*` key. If the key is not defined in the PRD source yet, do not add it to tasks first.
> If a task began as exploration/internal work but became a product requirement change, update PRD first, then retag the task from `[NON-PRD]` to `[PRD-...]`.

---

## Task List

> Add tasks below. **At least 1 task is required.**
> Keep tasks as one ordered list. The list order itself is the execution priority.
> Prefer `npx lee-spec-kit task add <feature-ref> --title "..." --ref NON-PRD --acceptance "..." --check "..."` for appending new tasks.
> To add a new task, append a complete task block below the last existing task. Use an existing PRD key such as `PRD-FR-001` or `PRD-SCOPE-V1-DESKTOP-EDITOR`, or `[NON-PRD]` for internal work.
> Do not leave placeholder `Acceptance` / `Checklist` content in place; implementation should not start until those items are concrete.
> If you must edit manually, append it below the last existing task block in `Task List` instead of inserting it near the current task or right before `Completion Criteria`.

---

## Completion Criteria

> ⚠️ This is a **final verification checklist**. Only check after you actually verified.

- [ ] All tasks are `[DONE]`, and each task's `Acceptance` is verified and `Checklist` is checked <!-- lee-spec-kit:completion:all-tasks -->
- [ ] Tests executed and passing (record command/result below) <!-- lee-spec-kit:completion:tests -->
- [ ] Final outcome shared and any required user confirmation recorded at the documented workflow checkpoint <!-- lee-spec-kit:completion:final-outcome -->

### Test Run Log (Latest by Command)

> Keep one row per command. If you rerun the same command, update that row instead of appending.
> Use `YYYY-MM-DD` for `Last Run` (local date).

| Command | Last Run (Local, YYYY-MM-DD) | Result |
| --- | --- | --- |
| `{test command you ran}` | `-` | `{PASS/FAIL summary}` |

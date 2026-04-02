# Tasks: {feature-name}

## Task Rules

- **Status**: `[TODO]` → `[DOING]` → `[DONE]`
- **Approvals**:
  - `[TODO] → [DOING]`: share task title first + user approval (OK)
  - `[DOING] → [DONE]`: share result/verification first + user approval (OK)
- **PRD mapping (recommended)**: add a PRD requirement ID tag like `[PRD-FR-001]` to each task line, or tag non-PRD tasks as `[NON-PRD]`.
  - Do not invent PRD IDs in `tasks.md`. Only reference IDs that already exist in `docs/prd` or the upstream requirements doc.
  - If this is a legacy feature without PRD IDs yet, backfill IDs in the source requirements doc first, then align `spec.md` `PRD Refs` and task tags together.
  - `[NON-PRD]` is for internal implementation work only. If the task changes user-facing behavior, acceptance criteria, or scope, backfill PRD first and tag it as `[PRD-...]`.

---

## GitHub Issue

- **Doc Status**: -
  - Values: Draft | Review | Approved
- **Repo**: {{projectName}}-{component}
- **Issue**: #{issue-number}
- **Branch**: `feat/{issue-number}-{feature-name}`
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

> `PRD-FR-001` in the example means an ID that already exists in the PRD source. If it is not defined yet, do not add it to tasks first.
> If a task began as exploration/internal work but became a product requirement change, update PRD first, then retag the task from `[NON-PRD]` to `[PRD-...]`.

---

## Task List

> Add tasks below. **At least 1 task is required.**
> Keep tasks as one ordered list. The list order itself is the execution priority.
> To add a new task, prefer `npx lee-spec-kit task add <feature-ref> --title "..." --ref NON-PRD|PRD-FR-001`.
> If you must edit manually, append it below the last existing task block in `Task List` instead of inserting it near the current task or right before `Completion Criteria`.

---

## Completion Criteria

> ⚠️ This is a **final verification checklist**. Only check after you actually verified.

- [ ] All tasks are `[DONE]`, and each task's `Acceptance` is verified and `Checklist` is checked
- [ ] Tests executed and passing (record command/result below)
- [ ] Final user approval (OK) received (review the outcome)

### Test Run Log (Latest by Command)

> Keep one row per command. If you rerun the same command, update that row instead of appending.
> Use `YYYY-MM-DD` for `Last Run` (local date).

| Command | Last Run (Local, YYYY-MM-DD) | Result |
| --- | --- | --- |
| `{test command you ran}` | `-` | `{PASS/FAIL summary}` |

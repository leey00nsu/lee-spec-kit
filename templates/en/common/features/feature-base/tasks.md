# Tasks: {feature-name}

## Task Rules

- **Status**: `[TODO]` → `[DOING]` → `[DONE]`
- **Approvals**:
  - `[TODO] → [DOING]`: share task title first + user approval (OK)
  - `[DOING] → [DONE]`: share result/verification first + user approval (OK)
- **Priority**: P0(urgent) > P1(high) > P2(medium) > P3(low)

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
  - Values: Pending | Done
  - Mark `Done` after pre-PR review is completed
- **Pre-PR Evidence**: -
  - Example: review note link, log path, or docs path
- **Pre-PR Decision**: -
  - Record your key review decision as `decision: ...` (or `결정: ...`)
  - Follow `agents/skills/create-pr.md` (`Pre-PR Baseline Checklist`) as the default baseline
- **PR Review Evidence**: -
  - Example: resolved/aligned comment link, verification log, or docs path
- **PR Review Decision**: -
  - Record why/how review comments were addressed as `decision: ...` (or `결정: ...`)

---

## Task List

### Phase 1: {Phase Name}

> Add tasks below. **At least 1 task is required.**
> Copy and use the format below.

```markdown
- [TODO][P1] T-F{number}-01 {Task Title}
  - Date: YYYY-MM-DD
  - Acceptance:
    - (verification condition)
  - Checklist:
    - [ ] (subtask)
```

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

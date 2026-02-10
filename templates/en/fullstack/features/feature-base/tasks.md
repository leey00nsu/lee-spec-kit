# Tasks: {feature-name}

## Task Rules

- **Status**: `[TODO]` → `[DOING]` → `[DONE]`
- **Approvals**:
  - `[TODO] → [DOING]`: share task title first + user approval (OK)
  - `[DOING] → [DONE]`: share result/verification first + user approval (OK)
- **Priority**: P0(urgent) > P1(high) > P2(medium) > P3(low)

---

## GitHub Issue

- **Doc Status**: Review | Approved
- **Repo**: {{projectName}}-{be|fe}
- **Issue**: #{issue-number}
- **Branch**: `feat/{issue-number}-{feature-name}`
- **PR**: -
  - Example: `#123` or PR URL
- **PR Status**: -
  - Values: Review | Approved
- **Pre-PR Review**: Pending | Done
  - Mark `Done` after pre-PR review is completed

---

## Task List

### Phase 1: {Phase Name}

> Add tasks below. **At least 1 task is required.**
> Copy and use the format below.

```markdown
- [TODO][P1] T-F{number}-01 {Task Title}
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

### Test Run Log

- Command: `{test command you ran}`
- Result: `{PASS/FAIL summary}`

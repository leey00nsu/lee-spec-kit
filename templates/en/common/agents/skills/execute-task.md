# Task Execution Process

Guide for executing tasks from tasks.md.

---

## Steps

### 1. Check Task

- Find next task in `tasks.md`
- Select task with `[TODO]` status
- ⚠️ **Verify current branch matches Feature branch** (`feat/{issue-number}-{feature-name}`)

### 2. Share Execution Plan

> 🚨 **User Approval Required**

Share execution plan with user before starting and wait for approval

### 3. Update Status

| Timing              | Status Transition    | Checkbox          |
| ------------------- | -------------------- | ----------------- |
| On start            | `[TODO]` → `[DOING]` | `[ ]` (No change) |
| After user approval | `[DOING]` → `[DONE]` | **`[x]` (Check)** |

> ⚠️ Even after work is complete, **stay in `[DOING]` until user approval**
> ⚠️ When switching to `[DONE]`, **must also check the checkbox**.

Before switching to `[DONE]`, confirm:

- You actually verified the `Acceptance` conditions
- You checked all `Checklist` checkboxes

Record date (YYYY-MM-DD) with each status change

### 4. Commit After Task Completion (Docs Sync)

> 🚨 **User Approval Required**

Before committing, share and wait for approval:

- Commit message (Applicable repositories)
- Files to be included

```bash
# 1. Project Commit (If code changed)
git add .
git commit -m "{type}(#{issue}): {task description}"

# 2. Docs Commit (If docs changed)
# For Standalone mode, move to docs repo
git add .
git commit -m "docs(#{issue}): {task description} update docs"
```

---

## Handling Requests Outside tasks.md

When user requests work not in tasks.md:

1. Ask if it should be added to tasks.md
2. If approved: Add to tasks.md then execute
3. If declined: Proceed as temporary work (still included in commit)

---

## 🚨 Never Modify Completed Tasks

> ⚠️ **Tasks in `[DONE]` status must NEVER be modified.**

### Principle

- Completed tasks are preserved for **history/record purposes**
- If modifications are needed, **add a new task**

### When Modifications Are Needed

1. Keep the existing task as-is
2. Add new task: `T{next-number}: {modification description}`
3. Perform changes in the new task

**Example:**

```markdown
## Tasks

- [DONE] T001: Implement user authentication (2026-01-05)
- [DONE] T002: Create login page (2026-01-06)
- [TODO] T003: Fix T002 - Add password validation ← New task for modifications
```

---

## Reference Documents

- **Git Workflow**: `git-workflow.md`
- **Commit Convention**: `git-workflow.md` > "Commit Convention" section

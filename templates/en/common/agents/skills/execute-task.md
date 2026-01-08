# Task Execution Process

Guide for executing tasks from tasks.md.

---

## Steps

### 1. Check Task

- Find next task in `tasks.md`
- Select task with `[TODO]` status

### 2. Share Execution Plan

> 🚨 **User Approval Required**

Share execution plan with user before starting and wait for approval

### 3. Update Status

| Timing      | Status Transition    |
| ----------- | -------------------- |
| On start    | `[TODO]` → `[DOING]` |
| On complete | `[DOING]` → `[DONE]` |

Record date (YYYY-MM-DD) with each status change

### 4. Commit After Task Completion

> 🚨 **User Approval Required**

Before committing, share and wait for approval:

- Commit message
- Files to be included

```bash
git add .
git commit -m "{type}(#{issue-number}): {task description}"
```

---

## Handling Requests Outside tasks.md

When user requests work not in tasks.md:

1. Ask if it should be added to tasks.md
2. If approved: Add to tasks.md then execute
3. If declined: Proceed as temporary work (still included in commit)

---

## Reference Documents

- **Git Workflow**: `git-workflow.md`
- **Commit Convention**: `git-workflow.md` > "Commit Convention" section

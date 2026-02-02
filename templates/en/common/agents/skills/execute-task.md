# Task Execution Process: CLI-driven

This document defines the **only rule** for executing tasks.
As an agent, follow `npx lee-spec-kit context` as the single source of truth.

---

## 🔄 The Loop (repeat forever)

Repeat this loop until the Feature is complete.

### Step 1: Check context

```bash
npx lee-spec-kit context
```

### Step 2: Do the next action only

Execute the `👉 Next Action` exactly as printed by the CLI.

- If the CLI points to an active task, focus on that task only.
- If there is no active task, pick the next `[TODO]` task, switch it to `[DOING]`, and start.
- If the CLI prints commands, copy/paste them. (In standalone setups commands may include `git -C ...` and scopes like `project`/`docs`.)

### Step 3: Update tasks.md (only what you did)

Keep `tasks.md` aligned with reality.

- Do not mark `[DONE]` without actually completing the work and verifying criteria.
- If you need to change a completed task, add a new task instead of rewriting history.

### Step 4: Repeat

After finishing a meaningful chunk of work, run `context` again.

---

## 🛑 Strict rules

1. **No skipping**: Never “finish” tasks by editing status only.
2. **No jumping ahead**: If the CLI is waiting for approvals, stop and ask the user.
3. **No rewriting history**: Do not modify `[DONE]` tasks; add a new one.

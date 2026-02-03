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
- If there is no active task, **share the task title and get user approval (OK)**, then switch the next `[TODO]` task to `[DOING]` and start.
- If the CLI prints commands, copy/paste them. (In standalone setups commands may include `git -C ...` and scopes like `project`/`docs`.)

### Step 3: Update tasks.md (only what you did)

Keep `tasks.md` aligned with reality.

- Do not mark `[DONE]` without actually completing the work and verifying criteria.
- If you need to change a completed task, add a new task instead of rewriting history.

### Step 3.5: Record decisions (strongly recommended, effectively required)

To avoid “why did we implement it like this?” losing context, **record any non-obvious or tradeoff-heavy implementation choice** in `decisions.md`.

Record a decision if any of these apply:

- There was a tradeoff (performance / reliability / security / maintainability)
- You introduced a new rule/heuristic/state transition (e.g., context detection logic, exception criteria)
- You changed behavior for compatibility or as a workaround
- You changed data shape, file structure, or CLI output rules
- You expect future readers to ask “why this way?”

Use the feature’s `decisions.md` template format. (Context/Options/Decision/Rationale/Consequences)

### Step 4: Repeat

After finishing a meaningful chunk of work, run `context` again.

---

## 🛑 Strict rules

1. **No skipping**: Never “finish” tasks by editing status only.
2. **No jumping ahead**: If the CLI is waiting for approvals, stop and ask the user.
3. **No rewriting history**: Do not modify `[DONE]` tasks; add a new one.

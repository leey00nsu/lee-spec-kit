# Feature Implementation Process: CLI-driven

This document defines the **only rule** for adding a new Feature.
As an agent, do not trust your own judgment—follow the **CLI output** only.

---

## 🔄 The Loop (repeat forever)

Repeat this loop until the Feature is complete (docs committed).

### Step 1: Check context

Run this command whenever you start work or finish a step:

```bash
npx lee-spec-kit context
```

### Step 2: Do exactly what the CLI says

Read the `👉 Next Action` output and execute **only that instruction**.

- If the CLI indicates **Review**, share the document with the user and stop.
- If the CLI asks for writing a file, write that file and follow the format.
- If the CLI prints a command, **copy/paste and run it exactly**. (It may include repo-safe `git -C ...` commands and scopes like `project` vs `docs`.)

### Step 3: Repeat

After completing the action, go back to Step 1 and run `context` again.

---

## 🛑 Strict rules

1. **Do not jump ahead**: Never do “Plan” when the CLI says “Spec”.
2. **Do not skip**: Do not fake issue numbers/statuses to advance steps.
3. **No self-judgment**: If unsure, run `context` again.

---

## Reference: the 10-step workflow (reference only)

> ⚠️ Do NOT execute these from memory. Always follow the CLI.

1. Feature folder created
2. Write `spec.md`
3. Get `spec.md` approved
4. Create GitHub Issue and record `#`
5. Create feature branch
6. Write `plan.md`
7. Get `plan.md` approved
8. Write/execute `tasks.md`
9. Pre-commit verification
10. Commit docs

---

## Getting started

If the Feature folder does not exist yet:

```bash
# 1) Create the folder
npx lee-spec-kit feature <name> -d "<description>"

# 2) Enter the loop
npx lee-spec-kit context
```

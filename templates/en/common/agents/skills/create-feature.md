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

### Step 2: Execute one option only (Next Options)

Read `👉 Next Options (Atomic)`, choose exactly one option (`A/B/C`), and execute **only that option**.
For gated actions, proceed only after the user replies in **`<label>` or `<label> OK` format** (e.g. `A`, `A OK`).

- If the CLI indicates **Review**, share the document with the user and stop.
- If the CLI asks for writing a file, write that file and follow the format.
- If the CLI prints a command, **copy/paste and run it exactly**. (It may include repo-safe `git -C ...` commands and scopes like `project` vs `docs`.)
- When requesting approval, present labels as `A: ...` using the exact CLI detail/cmd text. Do not paraphrase command options.
- For approved command options, default to one-shot execution via `npx lee-spec-kit flow <slug|F001|F001-slug> --approve <LABEL> --execute` to avoid session mismatch.

### Step 3: Repeat

After completing the action, go back to Step 1 and run `context` again.

---

## 🛑 Strict rules

1. **Do not jump ahead**: Never do “Plan” when the CLI says “Spec”.
2. **Do not skip**: Do not fake issue numbers/statuses to advance steps.
3. **No self-judgment**: If unsure, run `context` again.

> Note: the workflow steps may change over time. Do not memorize step numbers.
> Treat `context` output as the SSOT.

---

## Getting started

If the Feature folder does not exist yet:

```bash
# 1) Create the folder
npx lee-spec-kit feature <name> -d "<description>"

# 2) Enter the loop
npx lee-spec-kit context
```

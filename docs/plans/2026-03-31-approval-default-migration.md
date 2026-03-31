# Approval Default Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the default approval policy to spec-first execution with a final implementation review stop, and migrate legacy configs on `update`.

**Architecture:** Keep the existing approval/ticket/runtime flow intact. Move the default config to `approval.mode="category"` with `default="skip"`, add a dedicated category for the task-finalize review stop, and let `update` rewrite legacy generated approval configs to the new default without overriding explicit user customizations.

**Tech Stack:** TypeScript, Commander CLI, Vitest

---

### Task 1: Lock the new policy in tests

**Files:**
- Modify: `tests/cli-context-execute-gates.test.mjs`
- Modify: `tests/cli-context-approval.test.mjs`

- [ ] Add failing tests for the new init/update approval defaults.
- [ ] Add a failing test proving the task-finalize review stop uses its own approval category.
- [ ] Run the targeted Vitest commands and confirm the failures match the expected old behavior.

### Task 2: Implement the new approval defaults

**Files:**
- Modify: `src/commands/init.ts`
- Modify: `src/commands/update.ts`
- Modify: `src/utils/config.ts`

- [ ] Change the generated default approval config to category/skip with the new required categories.
- [ ] Add update-time migration for legacy generated builtin approval configs while preserving explicit custom configs.
- [ ] Keep the approval config contract backwards-compatible for existing callers.

### Task 3: Split the implementation review gate into its own category

**Files:**
- Modify: `src/utils/context/types.ts`
- Modify: `src/utils/context/steps.ts`
- Modify: `src/utils/context-selection.ts`
- Modify: `src/utils/builtin-docs.ts`
- Modify: `src/utils/locales/en/context.ts`
- Modify: `src/utils/locales/ko/context.ts`

- [ ] Add the new action category to the shared context types.
- [ ] Move the task-finalize instruction onto the new category without changing the runtime step structure.
- [ ] Update action-detail/builtin-doc metadata so prompts and docs remain aligned.

### Task 4: Verify and stabilize

**Files:**
- Modify: `tests/cli-context-execute-gates.test.mjs`
- Modify: `tests/cli-context-approval.test.mjs`

- [ ] Run the targeted Vitest commands again until green.
- [ ] Run the broader related test files to catch contract regressions.
- [ ] Review the diff for any docs or wording drift before wrapping up.

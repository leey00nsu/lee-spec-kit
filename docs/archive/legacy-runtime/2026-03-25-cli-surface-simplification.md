# CLI Surface Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the default CLI and README communicate a small human-facing surface while preserving the existing agent and internal command set.

**Architecture:** Add two public facade commands, `next` and `check`, by reusing the existing `context` and `flow` implementations. Hide legacy agent/internal commands from the root help output, then update the README opening sections to match the new public workflow.

**Tech Stack:** TypeScript CLI with Commander, Vitest CLI contract tests, Markdown docs

---

### Task 1: Lock the new public help surface with tests

**Files:**
- Modify: `tests/cli-flow-component-config.test.mjs`

- [ ] **Step 1: Write a failing root help test**

Assert that root `--help` lists `init`, `idea`, `feature`, `next`, and `check`.

- [ ] **Step 2: Run the focused help test to verify it fails**

Run: `pnpm build && npx vitest run tests/cli-flow-component-config.test.mjs -t "root help highlights the simplified public command surface"`
Expected: failure because `next` and `check` do not exist yet

- [ ] **Step 3: Write a failing visible-set expectation**

Assert that the root help core section contains exactly `init`, `idea`, `feature`, `next`, and `check`.

- [ ] **Step 4: Run the focused help test again**

Run: `pnpm build && npx vitest run tests/cli-flow-component-config.test.mjs -t "root help highlights the simplified public command surface"`
Expected: failure because the root help still exposes the old visible command set

- [ ] **Step 5: Write facade smoke tests**

Add focused tests that `next --help` and `check --help` exist and describe the new public commands.

- [ ] **Step 6: Run the facade smoke tests to verify they fail**

Run: `pnpm build && npx vitest run tests/cli-flow-component-config.test.mjs -t "public facade commands expose help"`
Expected: failure because the new commands are not registered yet

- [ ] **Step 7: Write hidden-command direct-call smoke tests**

Add a focused test that `context --help` and `flow --help` still work even after being hidden from root help.

### Task 2: Add public facade commands and hide legacy commands from root help

**Files:**
- Create: `src/commands/next.ts`
- Create: `src/commands/check.ts`
- Modify: `src/commands/context.ts`
- Modify: `src/commands/flow.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Export reusable runners from existing command modules**

Expose the current `context` and `flow` execution functions so the new facades can reuse them without duplicating orchestration logic.

- [ ] **Step 2: Add `next` as a public facade**

Register `next [feature-name]` and route it to the existing context runner with the same option contract needed for compatibility.

- [ ] **Step 3: Add `check` as a public facade**

Register `check [feature-name]` and route it to the existing flow runner with the same option contract needed for compatibility.

- [ ] **Step 4: Hide legacy commands from root help**

Keep agent/internal commands callable, but mark them hidden in the root command listing so the default help stays focused on the public surface.

- [ ] **Step 5: Run the focused help test**

Run: `pnpm build && npx vitest run tests/cli-flow-component-config.test.mjs -t "root help highlights the simplified public command surface"`
Expected: root help test passes

- [ ] **Step 6: Verify facade commands are wired up**

Run: `pnpm build && npx vitest run tests/cli-flow-component-config.test.mjs -t "public facade commands expose help"`
Expected: facade command smoke tests pass

- [ ] **Step 7: Verify hidden commands still work directly**

Run: `pnpm build && npx vitest run tests/cli-flow-component-config.test.mjs -t "hidden legacy commands remain directly callable"`
Expected: hidden command smoke tests pass

### Task 3: Align README with the simplified public surface

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Rewrite hero copy and quick start**

Lead with the agent-guided harness framing and replace the long quick start with the public five-command flow.

- [ ] **Step 2: Add explicit public vs advanced framing**

Introduce a short “What you actually use” section and point advanced readers to the existing detailed reference below.

### Task 4: Verify the change set

**Files:**
- Create: `docs/plans/2026-03-25-cli-surface-simplification-design.md`
- Create: `docs/plans/2026-03-25-cli-surface-simplification.md`

- [ ] **Step 1: Run targeted verification**

Run: `pnpm build && npx vitest run tests/cli-flow-component-config.test.mjs`
Expected: PASS

- [ ] **Step 2: Run full verification**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 3: Review the diff**

Run: `git diff -- src/index.ts src/commands/context.ts src/commands/flow.ts src/commands/next.ts src/commands/check.ts README.md README.en.md tests/cli-flow-component-config.test.mjs docs/plans/2026-03-25-cli-surface-simplification-design.md docs/plans/2026-03-25-cli-surface-simplification.md`
Expected: only CLI surface, help visibility, docs, and tests changed

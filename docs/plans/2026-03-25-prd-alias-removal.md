# PRD Alias Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confusing `prd` alias from the requirements coverage command and make the PRD → idea → feature relationship explicit in the human-facing docs and templates.

**Architecture:** Keep `requirements` as the coverage/reporting command, delete its `prd` alias, and update the docs/templates so PRD is described as the top-level requirements space created by `init`, with ideas feeding features beneath it.

**Tech Stack:** TypeScript Commander CLI, Vitest contract tests, Markdown docs/templates

---

### Task 1: Lock the alias removal with tests

**Files:**
- Modify: `tests/cli-requirements.test.mjs`

- [ ] **Step 1: Write a failing test for the removed alias**

Add a test asserting `npx lee-spec-kit prd --json` no longer behaves like `requirements`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm build && npx vitest run tests/cli-requirements.test.mjs`
Expected: FAIL because `prd` still aliases `requirements`

### Task 2: Remove the alias and align wording

**Files:**
- Modify: `src/commands/requirements.ts`
- Modify: `templates/en/common/README.md`
- Modify: `templates/ko/common/README.md`
- Modify: `templates/en/common/prd/README.md`
- Modify: `templates/ko/common/prd/README.md`
- Modify: `templates/en/common/ideas/README.md`
- Modify: `templates/ko/common/ideas/README.md`
- Modify: `templates/en/common/features/README.md`
- Modify: `templates/ko/common/features/README.md`
- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Remove `.alias('prd')`**

Keep `requirements` as the sole coverage/report command.

- [ ] **Step 2: Clarify PRD → idea → feature in docs**

Update README and template guides so PRD is clearly the top-level requirements source, ideas are pre-feature candidates, and features are executable implementation units.

- [ ] **Step 3: Remove stale alias references**

Delete wording that still tells users to run `npx lee-spec-kit prd` for requirements coverage.

### Task 3: Verify

**Files:**
- Modify: `tests/cli-requirements.test.mjs`

- [ ] **Step 1: Run targeted verification**

Run: `pnpm build && npx vitest run tests/cli-requirements.test.mjs`
Expected: PASS

- [ ] **Step 2: Run full verification**

Run: `pnpm test`
Expected: PASS

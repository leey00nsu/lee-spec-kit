# Test Surface Prune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy runtime-heavy tests and keep only the test coverage that matches the current `lee-spec-kit` product direction: docs schema, Codex hooks integration, validators, GitHub/doc generation, and core utilities.

**Architecture:** Delete whole test suites whose primary purpose is validating the old `context`/`flow` runtime engine. Keep lightweight coverage around docs scaffolding, built-in docs, Codex hook scaffolding, workflow audit, GitHub body generation, schema detection, requirements coverage, and race/core utility behavior. Trim mixed suites so they only validate document mutations that still belong to the docs/policy layer.

**Tech Stack:** Vitest, Node CLI integration tests, TypeScript unit tests

---

### Task 1: Remove legacy runtime-dominant suites

**Files:**
- Delete: `tests/cli-context-approval.test.mjs`
- Delete: `tests/cli-context-execute-gates.test.mjs`
- Delete: `tests/cli-context-scope-split.test.mjs`
- Delete: `tests/cli-flow-component-config.test.mjs`
- Delete: `tests/flow-orchestrator.test.mjs`
- Delete: `src/__tests__/services/PrePrReviewValidator.test.ts`

- [ ] **Step 1: Delete full suites that mainly validate `context`/`flow` orchestration**
- [ ] **Step 2: Confirm no kept suite still depends on deleted fixtures or helpers**

### Task 2: Trim mixed suites down to docs-layer behavior

**Files:**
- Modify: `tests/cli-task-add.test.mjs`

- [ ] **Step 1: Remove `task-run` / `task-complete` expectations from the kept task-doc tests**
- [ ] **Step 2: Keep only task template and task append/update assertions that still belong to docs mutation behavior**

### Task 3: Re-verify the reduced suite

**Files:**
- Verify only

- [ ] **Step 1: Run `pnpm typecheck`**
- [ ] **Step 2: Run `pnpm build`**
- [ ] **Step 3: Run `pnpm vitest run` on the reduced suite**
- [ ] **Step 4: Record any residual risks if remaining legacy commands are intentionally under-tested**

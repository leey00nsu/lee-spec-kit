# Review Running Tracked State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace runtime-only review-running markers with official tracked `Running` states in `tasks.md`, and redesign docs dirty/commit gating so these run-state transitions do not incorrectly force `docs_commit`.

**Architecture:** The parser and step machine will distinguish between “git docs are dirty” and “docs changes require a docs commit before continuing”. `pre-pr-review-run` and `code-review-run` will write tracked `Running` states in `tasks.md`, and the workflow will treat these as state transitions instead of generic docs debt. Runtime review-running storage will be removed.

**Tech Stack:** TypeScript, Vitest, Commander CLI, existing context parser/state-machine

---

### Task 1: Lock the desired tracked-state behavior in tests

**Files:**
- Modify: `tests/cli-context-execute-gates.test.mjs`
- Modify: `tests/cli-context-approval.test.mjs`

**Step 1: Write the failing tests**
- Require `pre-pr-review-run` to write `Pre-PR Review: Running`.
- Require `code-review-run` to write `PR Review: Running`.
- Require subsequent `context` to show `pre_pr_review_running` / `code_review_running`.
- Require those transitions not to divert into `docs_commit`.

**Step 2: Run the focused tests to verify failure**
Run: `npx vitest run tests/cli-context-execute-gates.test.mjs tests/cli-context-approval.test.mjs -t "pre-pr-review-run|code-review-run|review run"`

**Step 3: Commit checkpoint**
- No commit until implementation passes.

### Task 2: Restore tracked-state schema in parser/types/templates

**Files:**
- Modify: `src/utils/context/types.ts`
- Modify: `src/utils/context/parse.ts`
- Modify: `templates/en/common/features/feature-base/tasks.md`
- Modify: `templates/ko/common/features/feature-base/tasks.md`
- Modify: `src/utils/locales/en/messages.ts`
- Modify: `src/utils/locales/ko/messages.ts`
- Modify: `src/utils/locales/en/warnings.ts`
- Modify: `src/utils/locales/ko/warnings.ts`

**Step 1: Add tracked review state types**
- `Pre-PR Review` supports `Pending | Running | Done`
- `PR Review` supports `Pending | Running | Done`

**Step 2: Parse both tracked fields from `tasks.md`**
- `prePrReview.status`
- `prReview.status`

**Step 3: Update templates/messages/warnings**
- Document new tracked values and migration guidance.

### Task 3: Rewrite run commands to persist tracked `Running`

**Files:**
- Modify: `src/commands/pre-pr-review.ts`
- Modify: `src/commands/code-review-run.ts`
- Delete: `src/utils/context/review-run-state.ts`

**Step 1: Write minimal tracked-state update logic**
- `pre-pr-review-run` writes `Pre-PR Review: Running`
- `code-review-run` writes `PR Review: Running`

**Step 2: Keep handoff payload semantics**
- Preserve `handoffOnly`, `advancesWorkflow`, `nextMainState`
- Remove runtime-state path/update payload fields

### Task 4: Redesign docs commit gating

**Files:**
- Modify: `src/utils/context/parse.ts`
- Modify: `src/utils/context/steps.ts`

**Step 1: Introduce a “commit-required docs changes” concept**
- Distinguish plain git dirty docs from docs changes that should block progress.

**Step 2: Encode special-case review-run transitions**
- `Pending -> Running` for pre-PR review and PR review should not require `docs_commit`.
- Evidence/decision edits still require commit.

**Step 3: Update post-task/review step transitions**
- Ensure `pre_pr_review_running` and `code_review_running` remain reachable while tracked `Running` is uncommitted.

### Task 5: Remove runtime-store integration

**Files:**
- Modify: `src/utils/context/parse.ts`
- Modify: `src/commands/pre-pr-review.ts`
- Modify: `src/commands/code-review-run.ts`
- Delete: `src/utils/context/review-run-state.ts`

**Step 1: Remove runtime-state reads/writes**
- No hidden review-running marker should remain.

**Step 2: Update tests that asserted runtime fields**
- Replace with tracked-state assertions.

### Task 6: Verify the full area

**Files:**
- Test: `tests/cli-context-execute-gates.test.mjs`
- Test: `tests/cli-context-approval.test.mjs`

**Step 1: Run focused tests**
Run: `npx vitest run tests/cli-context-execute-gates.test.mjs tests/cli-context-approval.test.mjs`

**Step 2: Run build and typecheck**
Run: `pnpm build`
Run: `pnpm typecheck`

**Step 3: Commit**
```bash
git add src/commands/pre-pr-review.ts src/commands/code-review-run.ts src/utils/context/types.ts src/utils/context/parse.ts src/utils/context/steps.ts src/utils/locales/en/messages.ts src/utils/locales/ko/messages.ts src/utils/locales/en/warnings.ts src/utils/locales/ko/warnings.ts templates/en/common/features/feature-base/tasks.md templates/ko/common/features/feature-base/tasks.md tests/cli-context-execute-gates.test.mjs tests/cli-context-approval.test.mjs docs/plans/2026-03-10-review-running-tracked-state-design.md docs/plans/2026-03-10-review-running-tracked-state.md
git commit -m "refactor: track review running states in tasks"
```

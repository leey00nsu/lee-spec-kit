# Auto Step Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `flow --auto-*` treat delegated subagent steps as part of normal workflow progression and remove handoff metadata fields that have no runtime effect.

**Architecture:** Update the flow orchestrator so delegated handoff results are treated as successful auto progression instead of manual interruption. Simplify delegated payload generation in task and review commands, then align docs and tests with the new orchestration meaning.

**Tech Stack:** TypeScript CLI services, Vitest contract tests, Markdown agent docs

---

### Task 1: Lock the new delegated auto behavior with tests

**Files:**
- Modify: `tests/cli-flow-component-config.test.mjs`
- Modify: `tests/cli-context-execute-gates.test.mjs`

- [ ] **Step 1: Write a failing flow auto test**

Add a test that exercises an auto-run flow hitting a delegated step and asserts the result is not downgraded to `manual_required`.

- [ ] **Step 2: Run the focused flow test to verify it fails**

Run: `npx vitest run tests/cli-flow-component-config.test.mjs`
Expected: failure because delegated auto handoff is still treated as `manual_required`

- [ ] **Step 3: Write a failing delegated payload test**

Update contract tests to assert `suggestedParallelism` and `fallbackToMainAgentWhenQuotaExceeded` are absent from delegated payload output.

- [ ] **Step 4: Run the focused context test to verify it fails**

Run: `npx vitest run tests/cli-context-execute-gates.test.mjs`
Expected: failure because the old payload fields are still emitted

### Task 2: Implement delegated auto progression semantics

**Files:**
- Modify: `src/services/FlowOrchestrator.ts`
- Modify: `src/services/FlowFormatters.ts`
- Modify: `src/services/ActionExecutor.ts`
- Modify: `src/utils/flow-run.ts`

- [ ] **Step 1: Update delegated status handling**

Treat `approved_handoff_prepared` as a successful auto step outcome. Preserve the handoff details in the run record and auto result instead of coercing it to `manual_required`.

- [ ] **Step 2: Make run history describe delegated progress clearly**

Ensure flow summaries and persisted auto-run metadata make it obvious that delegated work was handed off successfully and which main state should resume next.

- [ ] **Step 3: Run focused flow tests**

Run: `npx vitest run tests/cli-flow-component-config.test.mjs`
Expected: delegated auto tests pass

### Task 3: Remove dead delegated metadata fields

**Files:**
- Modify: `src/commands/task-run.ts`
- Modify: `src/commands/pre-pr-review.ts`
- Modify: `src/commands/code-review-run.ts`
- Modify: `src/services/ContextPresenter.ts`

- [ ] **Step 1: Remove unused fields from delegated payload writers**

Delete `suggestedParallelism` and `fallbackToMainAgentWhenQuotaExceeded` from delegated handoff payloads and output contracts.

- [ ] **Step 2: Keep only meaningful contract guidance**

Retain `handoffOnly`, `reuseKey`, `nextMainState`, and review-specific evidence hints where they still describe runtime continuation.

- [ ] **Step 3: Run focused context tests**

Run: `npx vitest run tests/cli-context-execute-gates.test.mjs`
Expected: delegated payload contract tests pass with the reduced payload

### Task 4: Align docs with the new auto meaning

**Files:**
- Modify: `templates/en/common/agents/agents.md`
- Modify: `templates/ko/common/agents/agents.md`
- Modify: `templates/en/common/agents/skills/execute-task.md`
- Modify: `templates/ko/common/agents/skills/execute-task.md`

- [ ] **Step 1: Update auto progression guidance**

Explain that auto progression advances workflow steps across delegated execution and only stops at explicit gates or failures.

- [ ] **Step 2: Remove obsolete parallelism/fallback hints**

Clean up agent guidance so it no longer references metadata that the CLI does not emit or use.

### Task 5: Verify and commit

**Files:**
- Create: `docs/plans/2026-03-19-auto-step-progression-design.md`
- Create: `docs/plans/2026-03-19-auto-step-progression.md`

- [ ] **Step 1: Run verification**

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm build`
Expected: PASS

Run: `npx vitest run tests/cli-flow-component-config.test.mjs tests/cli-context-execute-gates.test.mjs`
Expected: PASS

- [ ] **Step 2: Review diff**

Run: `git diff -- src/services/FlowOrchestrator.ts src/services/FlowFormatters.ts src/services/ActionExecutor.ts src/utils/flow-run.ts src/commands/task-run.ts src/commands/pre-pr-review.ts src/commands/code-review-run.ts src/services/ContextPresenter.ts templates/en/common/agents/agents.md templates/ko/common/agents/agents.md templates/en/common/agents/skills/execute-task.md templates/ko/common/agents/skills/execute-task.md tests/cli-flow-component-config.test.mjs tests/cli-context-execute-gates.test.mjs`
Expected: only delegated auto semantics, payload cleanup, docs, and tests changed

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-03-19-auto-step-progression-design.md docs/plans/2026-03-19-auto-step-progression.md src/services/FlowOrchestrator.ts src/services/FlowFormatters.ts src/services/ActionExecutor.ts src/utils/flow-run.ts src/commands/task-run.ts src/commands/pre-pr-review.ts src/commands/code-review-run.ts src/services/ContextPresenter.ts templates/en/common/agents/agents.md templates/ko/common/agents/agents.md templates/en/common/agents/skills/execute-task.md templates/ko/common/agents/skills/execute-task.md tests/cli-flow-component-config.test.mjs tests/cli-context-execute-gates.test.mjs
git commit -m "feat: continue auto progression across delegated steps"
```

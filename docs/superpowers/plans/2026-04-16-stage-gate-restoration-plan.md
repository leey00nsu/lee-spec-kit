# Stage Gate Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the pre-0.8.0 staged workflow order and approval boundaries for Codex-native lee-spec-kit usage without reviving the legacy orchestration engine.

**Architecture:** Add a stateless `workflow-stage` decision command that derives the current high-level workflow stage from feature docs and repo state. Use that command in AGENTS guidance, hook context, and agent skill docs so generic requests follow the same stage order as the old runtime.

**Tech Stack:** TypeScript, Commander, Vitest, existing feature/doc parsing helpers

---

### Task 1: Add failing workflow-stage contract tests

**Files:**
- Create: `tests/cli-workflow-stage.test.mjs`
- Modify: `tests/helpers/cli-contract-helpers.mjs` (only if shared helpers are needed)

- [ ] **Step 1: Write failing tests for issue-before-implementation gating**

- [ ] **Step 2: Run the new test file and verify it fails**

Run: `pnpm vitest run tests/cli-workflow-stage.test.mjs`
Expected: FAIL because `workflow-stage` does not exist yet.

- [ ] **Step 3: Add failing tests for implementation approval and PR stage transitions**

- [ ] **Step 4: Re-run the test file and verify failures are about missing stage logic**

Run: `pnpm vitest run tests/cli-workflow-stage.test.mjs`
Expected: FAIL with missing command or incorrect JSON shape.

### Task 2: Implement the stateless workflow-stage command

**Files:**
- Create: `src/commands/workflow-stage.ts`
- Create: `src/utils/workflow-stage.ts`
- Modify: `src/index.ts`
- Test: `tests/cli-workflow-stage.test.mjs`

- [ ] **Step 1: Implement feature/doc parsing helpers for high-level stage state**

- [ ] **Step 2: Implement `workflow-stage --json` output for the selected active feature**

- [ ] **Step 3: Register the command in the CLI as an internal/stable command**

- [ ] **Step 4: Run the workflow-stage tests and verify they pass**

Run: `pnpm vitest run tests/cli-workflow-stage.test.mjs`
Expected: PASS

### Task 3: Wire the stage decision into Codex-native guidance

**Files:**
- Modify: `src/utils/agents-md.ts`
- Modify: `src/integrations/codex/hooks.ts`
- Modify: `docs/reference/agent-cli.md`
- Modify: `docs/reference/internal-cli.md`

- [ ] **Step 1: Update AGENTS managed text to require `workflow-stage --json` before implementation**

- [ ] **Step 2: Update hook-injected context strings to mention `workflow-stage`**

- [ ] **Step 3: Update internal/machine-facing docs**

- [ ] **Step 4: Run targeted hook/bootstrap tests**

Run: `pnpm vitest run tests/cli-integrations-codex.test.mjs tests/cli-detect-docs-contract.test.mjs`
Expected: PASS

### Task 4: Align skill docs with restored stage order

**Files:**
- Modify: `templates/en/common/agents/skills/create-issue.md`
- Modify: `templates/en/common/agents/skills/execute-task.md`
- Modify: `templates/en/common/agents/skills/create-pr.md`
- Modify: `templates/ko/common/agents/skills/create-issue.md`
- Modify: `templates/ko/common/agents/skills/execute-task.md`
- Modify: `templates/ko/common/agents/skills/create-pr.md`
- Modify: `templates/en/common/agents/agents.md`
- Modify: `templates/ko/common/agents/agents.md`

- [ ] **Step 1: Update issue/task/PR skill docs to reflect the restored stage gate**

- [ ] **Step 2: Remove language that allows immediate implementation after tasks are written**

- [ ] **Step 3: Run focused tests covering generated AGENTS/bootstrap text**

Run: `pnpm vitest run tests/cli-init-feature-github.test.mjs tests/cli-integrations-codex.test.mjs`
Expected: PASS

### Task 5: Run full verification

**Files:**
- Modify: none unless verification reveals regressions

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Run the full test suite**

Run: `pnpm vitest run`
Expected: PASS

# Codex Hooks Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition `lee-spec-kit` as the docs schema and workflow policy layer, while moving day-to-day execution continuity to Codex-native `AGENTS.md` plus official hooks.

**Architecture:** Keep `detect`, `docs`, docs scaffolding, and docs validation as the durable `lee-spec-kit` surface. Add repo-local Codex hook scaffolding and a small workflow audit validator so Codex can automatically load the workflow, guard dangerous commands, and continue turns when docs/workflow sync is incomplete without relying on `context` or `flow` as the primary engine.

**Tech Stack:** TypeScript CLI, Commander, fs-extra, Vitest, repo-local Codex hooks JSON and Node hook scripts

---

### Task 1: Lock the new public contract

**Files:**
- Modify: `tests/cli-integrations-codex.test.mjs`
- Modify: `tests/cli-context-execute-gates.test.mjs`
- Modify: `tests/cli-init-feature-github.test.mjs`

- [ ] **Step 1: Write failing tests for Codex hook scaffolding**
- [ ] **Step 2: Write failing tests for updated AGENTS.md wording**
- [ ] **Step 3: Write failing tests for new init/help guidance**
- [ ] **Step 4: Run the focused test files and confirm failure**

### Task 2: Add Codex-native repo integration

**Files:**
- Create: `src/integrations/codex/hooks.ts`
- Modify: `src/commands/integrations.ts`
- Modify: `src/integrations/codex/bootstrap.ts`
- Modify: `src/utils/locales/en/cli.ts`
- Modify: `src/utils/locales/ko/cli.ts`

- [ ] **Step 1: Implement repo-local `.codex/hooks.json` scaffolding**
- [ ] **Step 2: Implement managed hook script generation**
- [ ] **Step 3: Extend global Codex bootstrap only where needed for official hooks support**
- [ ] **Step 4: Run focused tests and confirm they pass**

### Task 3: Replace runtime-centric AGENTS guidance

**Files:**
- Modify: `src/utils/agents-md.ts`
- Modify: `templates/en/common/agents/agents.md`
- Modify: `templates/ko/common/agents/agents.md`
- Modify: `src/commands/init.ts`
- Modify: `src/commands/update.ts`

- [ ] **Step 1: Rewrite managed AGENTS block around detect/docs/hooks**
- [ ] **Step 2: Remove `context/flow` as default execution language**
- [ ] **Step 3: Keep generic user requests auto-interpretable**
- [ ] **Step 4: Run AGENTS regeneration tests**

### Task 4: Add a lightweight workflow audit validator

**Files:**
- Create: `src/commands/workflow-audit.ts`
- Modify: `src/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing tests for workflow audit JSON behavior if needed**
- [ ] **Step 2: Implement a stateless audit for docs/code/workflow sync**
- [ ] **Step 3: Keep it hidden from the default help surface**
- [ ] **Step 4: Verify hook scripts can call it successfully**

### Task 5: Rewrite product docs around Codex hooks

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/reference/README.md`
- Modify: `docs/reference/public-cli.md`
- Modify: `docs/reference/agent-cli.md`
- Modify: `docs/reference/internal-cli.md`
- Create: `docs/reference/codex-hooks.md`
- Create: `docs/reference/migration-codex-hooks.md`

- [ ] **Step 1: Rewrite README and reference docs around docs schema + Codex hooks**
- [ ] **Step 2: Add a concrete migration guide for existing users**
- [ ] **Step 3: Link official Codex hooks and AGENTS docs**
- [ ] **Step 4: Run build and focused tests again**

### Task 6: Final verification

**Files:**
- Verify only

- [ ] **Step 1: Run `pnpm build`**
- [ ] **Step 2: Run `pnpm typecheck`**
- [ ] **Step 3: Run focused Vitest suites for integrations and AGENTS regeneration**
- [ ] **Step 4: Check `node dist/index.js --help` and `node dist/index.js integrations --help`**

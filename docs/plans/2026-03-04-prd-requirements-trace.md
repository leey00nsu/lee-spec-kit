# PRD Requirements Traceability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PRD requirement ID tracking (`PRD-FR-001` etc) so users can see which PRD items are implemented via feature `tasks.md`.

**Architecture:** Parse requirement IDs from `docs/prd/**/*.md`, parse references from `docs/features/**/tasks.md` bracket tags (e.g. `- [TODO][P1][PRD-FR-001] ...`), and report aggregated coverage via a new CLI command (`requirements`, alias `prd`). Optionally write a Markdown report under `docs/prd/`.

**Tech Stack:** Node.js CLI (TypeScript), commander, fs-extra, vitest.

---

### Task 1: Add Failing CLI Test For Requirements Report

**Files:**
- Create: `tests/cli-requirements.test.mjs`

**Step 1: Write failing test**

- Initialize docs with `init`
- Create PRD doc containing IDs
- Create a feature and update `tasks.md` to include PRD tags
- Run `lee-spec-kit requirements --json` and assert structured payload

**Step 2: Run test to verify it fails**

Run: `pnpm build && pnpm exec vitest run tests/cli-requirements.test.mjs`
Expected: FAIL (unknown command or missing payload fields)

---

### Task 2: Implement PRD Requirement Scanner + Task Ref Scanner

**Files:**
- Create: `src/utils/requirements.ts`

**Step 1: Implement PRD scanning**

- Walk `{docsDir}/prd/**/*.md` with `walkFiles`
- Extract IDs: `PRD-(FR|US|NFR)-\\d+` (ignore fenced code blocks)
- Extract a best-effort title from the same line

**Step 2: Implement tasks scanning**

- For each feature `tasks.md`, parse task lines (ignore fenced code blocks)
- Extract bracket tags (`[P1]`, `[PRD-FR-001]`, `[NON-PRD]`)
- Aggregate counts per requirement ID and track unmapped tasks

---

### Task 3: Add `requirements` CLI Command (alias `prd`)

**Files:**
- Create: `src/commands/requirements.ts`
- Modify: `src/index.ts`

**Behavior:**
- `--json`: print structured coverage payload
- `--write`: write `docs/prd/status.md` report
- `--strict`: exit code 1 when unknown refs / unmapped tasks / untracked requirements exist

---

### Task 4: Update Templates And README Docs

**Files:**
- Modify: `templates/ko/common/prd/README.md`
- Modify: `templates/en/common/prd/README.md`
- Modify: `templates/ko/common/features/feature-base/tasks.md`
- Modify: `templates/en/common/features/feature-base/tasks.md`
- Modify: `templates/ko/common/features/feature-base/spec.md`
- Modify: `templates/en/common/features/feature-base/spec.md`
- Modify: `README.md`
- Modify: `README.en.md`

**Content:**
- Define PRD ID convention and how to reference from tasks
- Add examples using bracket tags
- Document new command usage

---

### Task 5: Verification

**Step 1: Run full tests**

Run: `pnpm test`
Expected: PASS

**Step 2: Manual smoke**

Run (in a temp dir):
- `npx lee-spec-kit init ...`
- Create PRD + feature tasks with PRD tags
- `npx lee-spec-kit requirements`


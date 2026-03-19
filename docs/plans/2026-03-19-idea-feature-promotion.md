# Idea Indexing And Feature Promotion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add indexed `idea` documents and promotion-aware feature creation so idea-to-feature traceability is maintained automatically.

**Architecture:** Introduce a dedicated `idea` command that mirrors the existing `feature` creation flow for docs generation, then share ID validation and linking helpers so `feature --idea` can resolve and update the source idea file while stamping the feature spec with the idea reference.

**Tech Stack:** TypeScript, Commander CLI, fs-extra, built-in markdown templates, Vitest

---

### Task 1: Lock the desired CLI behavior in tests

**Files:**
- Modify: `tests/cli-init-feature-github.test.mjs`

**Step 1: Write the failing tests**
- Require `idea <name>` to create `docs/ideas/I001-<name>.md`.
- Require generated idea docs to contain the indexed metadata fields.
- Require `feature <name> --idea I001` to update the idea status to `Featureized` and record the created feature.
- Require the destination feature spec to include the originating idea path.

**Step 2: Run focused tests to verify failure**
Run: `npx vitest run tests/cli-init-feature-github.test.mjs -t "idea|feature --idea|promotion"`

### Task 2: Add idea IDs, validation, and command wiring

**Files:**
- Modify: `src/index.ts`
- Modify: `src/utils/validation.ts`
- Add: `src/commands/idea.ts`

**Step 1: Add `I###` validation**
- Mirror feature ID validation with idea-specific messages.

**Step 2: Register the new command**
- Add `ideaCommand(program)` to the CLI entrypoint.

**Step 3: Implement creation flow**
- Reuse config/component resolution patterns from `feature`.
- Auto-generate the next idea ID by scanning `docs/ideas/`.

### Task 3: Add built-in idea templates and docs guidance

**Files:**
- Add: `templates/en/common/ideas/idea.md`
- Add: `templates/ko/common/ideas/idea.md`
- Modify: `templates/en/common/ideas/README.md`
- Modify: `templates/ko/common/ideas/README.md`
- Modify: `src/utils/locales/en/cli.ts`
- Modify: `src/utils/locales/ko/cli.ts`

**Step 1: Create the canonical idea markdown template**
- Include placeholders for ID, name, status, feature ref, PRD refs, component, and description.

**Step 2: Update CLI copy**
- Add success/next-step and validation strings for `idea`.

**Step 3: Update README guidance**
- Document the indexed naming scheme and promotion flow.

### Task 4: Extend feature creation with idea promotion linkage

**Files:**
- Modify: `src/commands/feature.ts`

**Step 1: Add `--idea <ref>` option**
- Resolve indexed idea refs and repo-relative idea paths.

**Step 2: Update the source idea doc after feature creation**
- Stamp `Status: Featureized`
- Stamp `Feature: F###-slug`

**Step 3: Update feature spec content**
- Add the source idea path under related docs when `--idea` is used.

### Task 5: Verify the focused surface

**Files:**
- Test: `tests/cli-init-feature-github.test.mjs`

**Step 1: Run the focused tests**
Run: `npx vitest run tests/cli-init-feature-github.test.mjs -t "idea|feature --idea|promotion"`

**Step 2: Run build and typecheck**
Run: `pnpm build`
Run: `pnpm typecheck`

**Step 3: Commit**
```bash
git add docs/plans/2026-03-19-idea-feature-promotion-design.md docs/plans/2026-03-19-idea-feature-promotion.md src/index.ts src/utils/validation.ts src/commands/idea.ts src/commands/feature.ts src/utils/locales/en/cli.ts src/utils/locales/ko/cli.ts templates/en/common/ideas/idea.md templates/ko/common/ideas/idea.md templates/en/common/ideas/README.md templates/ko/common/ideas/README.md tests/cli-init-feature-github.test.mjs
git commit -m "feat: add indexed ideas and promotion links"
```

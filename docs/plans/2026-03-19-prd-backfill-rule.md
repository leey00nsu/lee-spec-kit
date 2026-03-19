# PRD Backfill Rule For Mid-Feature Requirement Changes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the docs so feature work that changes user-facing behavior explicitly requires PRD backfill instead of being left as `NON-PRD`.

**Architecture:** Keep this change documentation-only and apply it consistently in the shared docs guide, the features guide, and the feature templates so the rule appears both in policy docs and in the files people edit during execution.

**Tech Stack:** Markdown templates, shared documentation guides

---

### Task 1: Update shared SSOT and change-protocol guidance

**Files:**
- Create: `docs/plans/2026-03-19-prd-backfill-rule-design.md`
- Modify: `templates/en/common/README.md`
- Modify: `templates/ko/common/README.md`

**Step 1: Clarify `NON-PRD` meaning**
- Explain that `NON-PRD` is for internal implementation work only.
- State that user-facing behavior or scope changes require PRD backfill.

**Step 2: Update the change protocol checklist**
- Add an explicit backfill sequence for PRD, `spec.md`, `tasks.md`, and optional docs.

### Task 2: Update feature-level guidance and templates

**Files:**
- Modify: `templates/en/common/features/README.md`
- Modify: `templates/ko/common/features/README.md`
- Modify: `templates/en/common/features/feature-base/spec.md`
- Modify: `templates/ko/common/features/feature-base/spec.md`
- Modify: `templates/en/common/features/feature-base/tasks.md`
- Modify: `templates/ko/common/features/feature-base/tasks.md`

**Step 1: Tighten feature guide wording**
- Define when `[NON-PRD]` is acceptable.
- Explain when to retag change tasks from `[NON-PRD]` to `[PRD-...]`.

**Step 2: Update templates where authors edit docs**
- Add warnings in `spec.md` and `tasks.md` so the rule is visible during execution.

### Task 3: Verify and commit

**Files:**
- Create: `docs/plans/2026-03-19-prd-backfill-rule.md`

**Step 1: Review the affected markdown files**
Run: `git diff -- templates/en/common/README.md templates/ko/common/README.md templates/en/common/features/README.md templates/ko/common/features/README.md templates/en/common/features/feature-base/spec.md templates/ko/common/features/feature-base/spec.md templates/en/common/features/feature-base/tasks.md templates/ko/common/features/feature-base/tasks.md`
Expected: wording consistently enforces PRD backfill for user-facing changes

**Step 2: Commit**
```bash
git add docs/plans/2026-03-19-prd-backfill-rule-design.md docs/plans/2026-03-19-prd-backfill-rule.md templates/en/common/README.md templates/ko/common/README.md templates/en/common/features/README.md templates/ko/common/features/README.md templates/en/common/features/feature-base/spec.md templates/ko/common/features/feature-base/spec.md templates/en/common/features/feature-base/tasks.md templates/ko/common/features/feature-base/tasks.md
git commit -m "docs: clarify prd backfill rules for feature changes"
```

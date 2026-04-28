# Features Guide

Folder for managing feature specs, plans, and tasks.

---

## Folder Structure

```text
features/
├── README.md           # This file
├── feature-base/       # Shared template (edit in one place)
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   ├── issue.md
│   ├── pr.md
│   └── decisions.md
├── (single) F00X-{name}/
└── (multi)  {component}/F00X-{name}/
```

---

## Creating New Features

```bash
# Single project
npx lee-spec-kit feature user-auth

# Multi project
npx lee-spec-kit feature --component app user-profile
```

> 💡 CLI copies templates from `feature-base/` and auto-assigns IDs.

Features are the executable units in the PRD → idea → feature flow.
By the time work reaches this folder, the requirement should already be defined in `docs/prd/`, and any pre-feature exploration should already live in `docs/ideas/`.

---

## Feature ID Rules

- `F{number}-{feature-name}` (e.g., F001-user-auth)
- Minimum **3-digit padding** for numbers (001, 002, ...)
- Expands to **4+ digits** beyond 999 (F1000, F1001, ...)
- Feature names in kebab-case
- **Feature = Issue**: Each Feature corresponds to one GitHub Issue.

---

## Workflow Stage Check

```bash
npx lee-spec-kit workflow-stage <feature-ref> --json
```

Use the returned `stage`, `nextAction`, and `implementationAllowed` values as the current workflow state.

---

## PRD Requirement Traceability (Recommended)

- Assign stable `PRD-*` requirement IDs in PRD docs (`docs/prd/*.md`) like `PRD-FR-001` or `PRD-SCOPE-V1-DESKTOP-EDITOR`.
- Link each task line in `tasks.md` with a tag like `[PRD-FR-001]` or `[PRD-SCOPE-V1-DESKTOP-EDITOR]`. For non-PRD tasks, use `[NON-PRD]`.
- Use `[NON-PRD]` only for internal implementation work such as refactors, test-only work, tooling, renames, and cleanup.
- If a change affects user-facing behavior, acceptance criteria, or scope, update PRD first and retag the task as `[PRD-...]`.
- Do not invent PRD IDs inside feature docs. Define them in the PRD source first, and backfill legacy docs before linking tasks.
- Keep traceability reviewable by maintaining `PRD Refs` in `spec.md` and PRD tags on each task line.

---

## Change Protocol (When Requirements/Scope Change Mid-Feature)

When things change mid-work, it must be explicit what was updated.

- Record changes as **new tasks** (do not edit `[DONE]` tasks; create a new task instead).
- During that sync, `tasks.md` may temporarily carry `Pending Change Request` as an internal marker. Clear it after the request is reflected in the new task(s) and related docs.
- Every change task must be tagged as `[PRD-...]` or `[NON-PRD]`. (Recommended: also add `[CHANGE]`.)
- If a change starts as internal exploration but ends up changing user-visible behavior, do not leave it as `[NON-PRD]`.
  - Backfill/update `docs/prd/*.md`
  - Update `spec.md` `PRD Refs`
  - Retag the task as `[PRD-...]` or add a replacement PRD-backed task
- If the change impacts PRD/spec/plan, update these too:
  - `docs/prd/*.md` (add/update/deprecate requirement IDs)
  - `spec.md` (`PRD Refs`, scope/AC)
  - `plan.md` (architecture/testing strategy)
  - `decisions.md` (why it changed + evidence)

---

## Unmanaged Docs Artifacts

External agent workflows may create docs entries outside the canonical lee-spec-kit docs surface.
Common examples include:

- `docs/plans/*.md`
- `docs/superpowers/*`
- another skill-created top-level docs folder

When a feature is already in progress, treat those files as staging/reference artifacts, not the active workflow SSOT.

- If the extra docs entry is intentional, add it to `.lee-spec-kit.json` `allowedDocsEntries`
- If it is a planning/reference artifact, normalize it before continuing active feature execution
- `commit-audit` blocks staged unmanaged or non-canonical feature docs until they are normalized or allowlisted

- Move user-facing scope and acceptance criteria into `spec.md`
- Move architecture/file structure/test strategy into `plan.md`
- Move executable work items into `tasks.md`
- Move trade-offs, rejected options, and rationale into `decisions.md`

Keeping the shared artifact for history is fine, but when it conflicts with feature-local docs, the feature folder wins.

---

## Status Glossary

| Scope | Field | Values |
| --- | --- | --- |
| Document status | `Status` in `spec.md`/`plan.md`, `Doc Status` in `tasks.md` | `Draft` \| `Review` \| `Approved` |
| Issue doc status | `Status` in `issue.md` | `Draft` \| `Ready` |
| PR doc status | `Status` in `pr.md` | `Draft` \| `Ready` |
| PR review status | `PR Status` in `tasks.md` | `Review` \| `Approved` |
| Pre-PR review status | `Pre-PR Review` in `tasks.md` | `Pending` \| `Done` |
| Pre-PR review evidence | `Pre-PR Evidence` in `tasks.md` | evidence link/log/doc path |
| Pre-PR review decision | `Pre-PR Decision` in `tasks.md` | `decision: approve\|changes_requested\|blocked ...` |
| PR review evidence | `PR Review Evidence` in `tasks.md` | evidence link/log/doc path |
| PR review decision | `PR Review Decision` in `tasks.md` | `decision: ...` (or `결정: ...`) |

---

## Pre-PR Fallback Checklist

Use `agents/skills/create-pr.md` (`Pre-PR Baseline Checklist`) as the default baseline for every Pre-PR review. Use review skills additionally for deeper inspection.

---

## File Roles

| File           | Role                      | When to Write       |
| -------------- | ------------------------- | ------------------- |
| `spec.md`      | **What and Why**          | Feature definition  |
| `plan.md`      | **How** (technical)       | After spec approval |
| `tasks.md`     | Specific work items       | After plan approval |
| `issue.md`     | Issue draft + issue state (`Draft/Ready`) | Before/when creating issue |
| `pr.md`        | PR draft + PR state (`Draft/Ready`) | Before/when creating PR |
| `decisions.md` | Technical decisions + reasoning trace + evidence links (ADR) | During development (DOING start / before DONE / post-merge) |

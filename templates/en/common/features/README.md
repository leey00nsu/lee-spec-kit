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

---

## Feature ID Rules

- `F{number}-{feature-name}` (e.g., F001-user-auth)
- Minimum **3-digit padding** for numbers (001, 002, ...)
- Expands to **4+ digits** beyond 999 (F1000, F1001, ...)
- Feature names in kebab-case
- **Feature = Issue**: Each Feature corresponds to one GitHub Issue.

---

## Status Check

```bash
npx lee-spec-kit status
```

Save to file:

```bash
npx lee-spec-kit status --write
```

---

## Status Glossary

| Scope | Field | Values |
| --- | --- | --- |
| Document status | `Status` in `spec.md`/`plan.md`, `Doc Status` in `tasks.md` | `Draft` \| `Review` \| `Approved` |
| Issue doc status | `Status` in `issue.md` | `Draft` \| `Ready` |
| PR doc status | `Status` in `pr.md` | `Draft` \| `Ready` |
| PR review status | `PR Status` in `tasks.md`/`pr.md` | `Review` \| `Approved` |
| Pre-PR review status | `Pre-PR Review` in `tasks.md` | `Pending` \| `Done` |
| Pre-PR review findings | `Pre-PR Findings` in `tasks.md` | `major=<n>, minor=<n>` |
| Pre-PR review evidence | `Pre-PR Evidence` in `tasks.md` | evidence link/log/doc path |
| PR review findings | `PR Review Findings` in `tasks.md` | `major=<n>, minor=<n>` |
| PR review evidence | `PR Review Evidence` in `tasks.md` | required evidence link/log/doc path when total PR review findings > 0 |

---

## Pre-PR Fallback Checklist

When review skills are unavailable and `workflow.prePrReview.fallback` is `builtin-checklist`, use the `Pre-PR Review Fallback` section in `agents/skills/create-pr.md` as the single source of truth.

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

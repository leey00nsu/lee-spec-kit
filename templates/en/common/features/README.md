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

## File Roles

| File           | Role                      | When to Write       |
| -------------- | ------------------------- | ------------------- |
| `spec.md`      | **What and Why**          | Feature definition  |
| `plan.md`      | **How** (technical)       | After spec approval |
| `tasks.md`     | Specific work items       | After plan approval |
| `decisions.md` | Technical decisions (ADR) | During development  |

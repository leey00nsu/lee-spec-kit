# Features Guide

Folder for managing feature specs, plans, and tasks.

---

## Folder Structure

```
features/
├── README.md           # This file
├── feature-base/       # Shared template
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   └── decisions.md
└── F00X-{name}/        # Individual features
```

---

## Creating New Features

```bash
npx lee-spec-kit feature user-auth
```

> 💡 CLI copies templates from `feature-base/` and auto-assigns IDs.

---

## Feature ID Rules

- `F{number}-{feature-name}` (e.g., F001-user-auth)
- Minimum **3-digit padding** for numbers
- Feature names in kebab-case
- **Feature = Issue**: Each Feature corresponds to one GitHub Issue

---

## Status Check

```bash
npx lee-spec-kit status
```

---

## File Roles

| File           | Role                      | When to Write       |
| -------------- | ------------------------- | ------------------- |
| `spec.md`      | **What and Why**          | Feature definition  |
| `plan.md`      | **How** (technical)       | After spec approval |
| `tasks.md`     | Work items                | After plan approval |
| `decisions.md` | Technical decisions (ADR) | During development  |

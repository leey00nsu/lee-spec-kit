# Features Guide

Folder for managing feature specs, plans, and tasks.
**FE/BE repos are separated, so Features are also managed separately.**

---

## Folder Structure

```
features/
├── README.md           # This file
├── feature-base/       # Shared template (edit in one place)
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   └── decisions.md
├── be/                 # Backend Features
│   └── F00X-{name}/
└── fe/                 # Frontend Features
    └── F00X-{name}/
```

---

## Creating New Features

### Using CLI (Recommended)

```bash
# Backend Feature
lee-spec-kit feature --repo be user-auth

# Frontend Feature
lee-spec-kit feature --repo fe user-profile
```

> 💡 CLI copies templates from `feature-base/` and auto-assigns IDs.

---

## Feature ID Rules

- `F{number}-{feature-name}` (e.g., F001-user-auth)
- Minimum **3-digit padding** for numbers (001, 002, ...)
- Expands to **4+ digits** beyond 999 (F1000, F1001, ...)
- Feature names in kebab-case
- **IDs are globally unique** across BE/FE (no duplicates)
- **Feature = Issue**: Each Feature corresponds to one GitHub Issue

---

## Status Check

Check feature progress with CLI:

```bash
lee-spec-kit status
```

Save to file:

```bash
lee-spec-kit status --write
```

---

## File Roles

| File           | Role                      | When to Write       |
| -------------- | ------------------------- | ------------------- |
| `spec.md`      | **What and Why**          | Feature definition  |
| `plan.md`      | **How** (technical)       | After spec approval |
| `tasks.md`     | Specific work items       | After plan approval |
| `decisions.md` | Technical decisions (ADR) | During development  |

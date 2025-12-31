# GitHub Issue Template Guide

Template for AI agents to create GitHub Issues.

---

## Issue Creation Rules

### Title Format

```text
F{number}: {feature-name} ({short description})
```

Example: `F001: user-auth (User authentication feature)`

---

## Issue Body Template

```markdown
## Overview

{Brief description of the feature}

## Goals

- {Goal 1}
- {Goal 2}

## Completion Criteria

- [ ] {Criterion 1}
- [ ] {Criterion 2}

## Related Documents

- Spec: `docs/features/{be|fe}/F{number}-{feature-name}/spec.md`

## Labels

- `enhancement` (New feature)
- `bug` (Bug fix)
- `documentation` (Documentation)
```

---

## Label Rules

| Label           | Usage         |
| --------------- | ------------- |
| `enhancement`   | New feature   |
| `bug`           | Bug fix       |
| `documentation` | Documentation |
| `backend`       | BE related    |
| `frontend`      | FE related    |
| `priority:high` | High priority |

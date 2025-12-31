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

---

## Body Input Rules (Shell Execution Prevention)

- Issue body should use **`--body-file` by default**.
- If the body contains backticks (`) or `$()`and is placed directly in`"..."`, it may be **interpreted by the shell**.
- For multi-line bodies, use **single-quoted heredoc** like `cat <<'EOF'`,
  and handle variables via **placeholder → sed substitution**.

# GitHub PR Template Guide

Template for AI agents to create Pull Requests.

---

## PR Creation Rules

### Title Format

```text
feat(#{issue-number}): {feature-name}
```

Example: `feat(#1): Implement user authentication`

---

## PR Body Template

```markdown
## Overview

{Brief description of changes}

## Changes

- {Change 1}
- {Change 2}
- {Change 3}

## Tests

- [ ] Unit tests passed
- [ ] Integration tests completed

## Screenshots (for UI changes)

{Attach if applicable}

## Related Documents

- Spec: `docs/features/{be|fe}/F{number}-{feature-name}/spec.md`
- Tasks: `docs/features/{be|fe}/F{number}-{feature-name}/tasks.md`

Closes #{issue-number}
```

---

## Merge Rules

| Situation      | Merge Method     |
| -------------- | ---------------- |
| Normal Feature | Squash and Merge |
| Urgent Hotfix  | Merge or Rebase  |
| Documentation  | Squash and Merge |

# GitHub PR Template Guide

Template for AI agents to create Pull Requests.

---

## PR Creation Rules

### Title Format

```text
feat(#{issue-number}): {feature-name}
```

Example: `feat(#1): Implement user authentication`

### Link Format (Important!)

For file links within the repo in PR body, **always use current branch name**:

```markdown
[filename](https://github.com/{owner}/{repo}/blob/{branch-name}/docs/path/to/file.md)
```

> ⚠️ `main` branch links will return 404 until merged!
> Always use the **current feature branch name** (e.g., `feat/5-feature-name`).

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

---

## Label Rules

- Specify appropriate labels when creating PR (`--label`)
- If a label does not exist, create it first:
  ```bash
  gh label create "label-name" --description "description" --color "color-code"
  ```

---

## Assignee Rules

- Default: Self-assign (`--assignee @me`)
- Use `--reviewer` option to specify reviewers
- Examples:
  ```bash
  gh pr create --assignee @me --reviewer reviewer-username ...
  ```

---

## Body Input Rules (Shell Execution Prevention)

- PR body should use **`--body-file` by default**.
- If the body contains backticks (`) or `$()`and is placed directly in`"..."`, it may be **interpreted by the shell**.
- For multi-line bodies, use **single-quoted heredoc** like `cat <<'EOF'`,
  and handle variables via **placeholder → sed substitution**.

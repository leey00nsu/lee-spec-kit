# GitHub Issue Template Guide

A template for AI agents to create GitHub Issues.
This document is a section policy/style guide. Use feature-local `issue.md` as the SSOT for actual workflow state.

---

## Issue Creation Rules

### Title Format

```text
{feature-name} ({short description})
```

Example: `user-auth (User authentication feature)`

> Keep the "short description" concise enough to convey the intent in one line.

### Link Format (Important!)

In GitHub Issues, use different link formats **based on file location**:

1. **Files within project repo**: Use full URL (clickable)
   - **Merged documents/code**: Use `main` branch
     ```markdown
     [filename](https://github.com/{owner}/{repo}/blob/main/path/to/file)
     ```
   - **In-progress documents** (not merged yet): Use **Feature branch**
     ```markdown
     [filename](https://github.com/{owner}/{repo}/blob/{feat-branch}/path/to/file)
     ```

2. **External documents (with public URL)**: Use **absolute URL**

   ```markdown
   [react-i18next](https://react.i18next.com/)
   ```

3. **Files within project repo**: Use full URL (clickable)
   - **Merged documents/code**: Use `main` branch
     ```markdown
     [filename](https://github.com/{owner}/{repo}/blob/main/path/to/file)
     ```
   - **In-progress documents** (not merged yet): Use **Feature branch**
     ```markdown
     [filename](https://github.com/{owner}/{repo}/blob/{feat-branch}/path/to/file)
     ```

4. **External documents (with public URL)**: Use **absolute URL**

   ```markdown
   [react-i18next](https://react.i18next.com/)
   ```

5. **Local documents** (no URL available): **Path from project root**

   > 📁 Local documents use paths **from project root**.
   > Format: `- **{Label}**: \`{path}\``

   ```markdown
   - **Spec**: `docs/features/{component}/F001-feature-name/spec.md`
   - **Tasks**: `docs/features/{component}/F001-feature-name/tasks.md`
   ```

> ⚠️ Local documents are not clickable on GitHub, so use **bold label + code block path** format instead of markdown links.

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

- **Spec**: `docs/features/{component}/F{number}-{feature-name}/spec.md`

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

> ⚠️ If a label does not exist, create it first:
>
> ```bash
> gh label create "label-name" --description "description" --color "color-code"
> ```

---

## Assignee Rules

- Default: Self-assign (`--assignee @me`)
- When assigning others, **confirm with user** first
- Remote creation must use `npx lee-spec-kit github issue <featureRef> --create --confirm OK --labels ...`.

---

## Body Input Rules (Shell Execution Prevention)

- Issue body should use **`--body-file` by default**.
- If the body contains backticks (`) or `$()`and is placed directly in`"..."`, it may be **interpreted by the shell**.
- For multi-line bodies, use **single-quoted heredoc** like `cat <<'EOF'`,
  and handle variables via **placeholder → sed substitution**.

  and handle variables via **placeholder → sed substitution**.

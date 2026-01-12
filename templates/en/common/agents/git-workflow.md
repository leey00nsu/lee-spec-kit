# Git Workflow Guide

Rules for AI agents to automate Git/GitHub operations.

---

## Core Concepts

| Concept          | GitHub Mapping | Description                     |
| ---------------- | -------------- | ------------------------------- |
| Feature          | GitHub Issue   | Feature-level work unit         |
| Task             | Commit         | Individual implementation unit  |
| Feature Complete | Pull Request   | Create PR on feature completion |

---

## Branch Strategy

```
main
 └── feat/123-feature-name    # Branch based on Issue #123
      ├── commit 1: feat(#123): implement feature
      ├── commit 2: test(#123): add tests
      └── commit 3: docs(#123): update docs
```

### Branch Naming

```
{type}/{issue-number}-{feature-name}
```

| Type       | Description   |
| ---------- | ------------- |
| `feat`     | New feature   |
| `fix`      | Bug fix       |
| `refactor` | Refactoring   |
| `docs`     | Documentation |

**Examples:**

- `feat/123-user-auth`
- `fix/456-login-error`

---

## Commit Convention

> 📖 Type and Description follow [Udacity Git Commit Message Style Guide](https://udacity.github.io/git-styleguide/).

### Format

```
{type}(#{issue}): {description}
```

### Type List

| Type       | Description   | Example                               |
| ---------- | ------------- | ------------------------------------- |
| `feat`     | New feature   | `feat(#123): implement user auth`     |
| `fix`      | Bug fix       | `fix(#123): fix login error`          |
| `refactor` | Refactoring   | `refactor(#123): separate auth logic` |
| `test`     | Tests         | `test(#123): add auth unit tests`     |
| `docs`     | Documentation | `docs(#123): clarify spec`            |
| `style`    | Code style    | `style(#123): fix lint errors`        |
| `chore`    | Other         | `chore(#123): update dependencies`    |

---

## Automation Workflow

> 📖 Refer to `skills/` folder for step-by-step guides.

| Workflow       | Guide                      |
| -------------- | -------------------------- |
| Feature Start  | `skills/create-feature.md` |
| Issue Creation | `skills/create-issue.md`   |
| Task Execution | `skills/execute-task.md`   |
| PR Creation    | `skills/create-pr.md`      |

### Branch Creation

```bash
git checkout -b feat/{issue-number}-{feature-name}
```

### Document Commit Timing (docs repo)

| Commit Timing                                     | Included Content                    | Commit Message Example                        |
| ------------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| When planning complete (spec+plan+tasks approved) | `F{number}-{feature-name}/` folder  | `docs(#{issue}): F{number} spec, plan, tasks` |
| When Feature complete (all tasks done)            | `F{number}-{feature-name}/` changes | `docs(#{issue}): F{number} Feature complete`  |

> ⚠️ Do not commit when creating Feature folder.

### Merge Strategy

| Situation      | Merge Method     |
| -------------- | ---------------- |
| Normal Feature | Squash and Merge |
| Urgent Hotfix  | Merge or Rebase  |

---

## GitHub Setup Requirements

### Required

- [ ] GitHub CLI (`gh`) installed and authenticated
- [ ] Branch protection rules (main)
  - Require PR before merging

### Recommended

- [ ] Auto-delete head branches
- [ ] Squash merging only

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

### 1. Feature Start

```bash
# 1. Create GitHub Issue (Feature = Issue)
# 2. Create branch
git checkout -b feat/{issue-number}-{feature-name}
```

### 2. Document Commit (docs repo)

> 📌 The docs folder is managed as a separate git, so a separate commit strategy is used.

| #   | Commit Timing                                            | Included Documents              | Commit Message Example          |
| --- | -------------------------------------------------------- | ------------------------------- | ------------------------------- |
| 1   | **When planning is complete** (spec+plan+tasks approved) | spec.md, plan.md, tasks.md      | `docs(#123): spec, plan, tasks` |
| 2   | **When Feature is complete** (all tasks done)            | tasks.md (status), decisions.md | `docs(#123): Feature complete`  |

> ⚠️ **Do not commit when creating Feature folder.**

### 3. Auto Commit on Task Completion

```bash
git add .
git commit -m "{type}(#{issue}): {task-description}"
```

### 4. Create PR on Feature Completion

```bash
git push origin feat/{issue-number}-{feature-name}
gh pr create --title "feat(#{issue}): {feature-title}" \
  --body "Closes #{issue}" \
  --base main
```

### 5. Merge

```bash
git checkout main
git pull
gh pr merge --squash --delete-branch
git pull
```

---

## GitHub Setup Requirements

### Required

- [ ] GitHub CLI (`gh`) installed and authenticated
- [ ] Branch protection rules (main)
  - Require PR before merging

### Recommended

- [ ] Auto-delete head branches
- [ ] Squash merging only

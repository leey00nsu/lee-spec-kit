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

### 1. Feature Start

```bash
# 1. Create GitHub Issue (Feature = Issue)
# 2. Create branch
git checkout -b feat/{issue-number}-{feature-name}
```

> When creating/modifying issues/PRs with `gh`, share the title/body/labels first and **wait for user confirmation (OK)** before proceeding.

### 2. Document Commit (docs repo)

> 📌 The docs folder is managed as a separate git, so a separate commit strategy is used.

| #   | Commit Timing                                            | Included Documents              | Commit Message Example          |
| --- | -------------------------------------------------------- | ------------------------------- | ------------------------------- |
| 1   | **When planning is complete** (spec+plan+tasks approved) | spec.md, plan.md, tasks.md      | `docs(#123): spec, plan, tasks` |
| 2   | **When Feature is complete** (all tasks done)            | tasks.md (status), decisions.md | `docs(#123): Feature complete`  |

> ⚠️ **Do not commit when creating Feature folder.**

### 3. Auto Commit on Task Completion

When a task is completed:

```bash
git add .
git commit -m "{type}(#{issue}): {task-description}"
```

> Before running `git commit`, share the commit message and file list first and **wait for user confirmation (OK)** before proceeding.

### 4. Create PR on Feature Completion

When all tasks are completed:

```bash
git push origin feat/{issue-number}-{feature-name}
gh pr create --title "feat(#{issue}): {feature-title}" \
  --body "Closes #{issue}" \
  --base main
```

### 5. Merge

When all reviews are resolved:

```bash
# Update main before merge
git checkout main
git pull

# Squash and Merge
gh pr merge --squash --delete-branch

# Update main after merge
git pull
```

---

## Agent Automation Rules

### On Task Completion

```
1. Complete code changes
2. Update tasks.md status [DOING] → [DONE] (docs)
3. git add .
4. git commit -m "{type}(#{issue}): {description}"
5. Proceed to next task
```

### On Feature Completion

```
1. Verify all tasks [DONE]
2. git push origin {branch}
3. gh pr create
4. Wait for review
5. Address review comments
6. gh pr merge --squash
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

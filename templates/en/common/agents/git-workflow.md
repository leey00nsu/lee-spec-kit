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

### Document Commit Rules (Continuous Sync)

> 🔄 **Docs synchronization is mandatory when Project code changes.**

| Situation                 | Rule                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| **Project + Docs Change** | Must commit Docs **together with Project commit** (Maintain Sync)     |
| **Docs Only Change**      | If only docs changed (e.g., `custom.md` update), **commit Docs only** |

#### Standalone Mode Commit Guide

1. **Project Commit** (If code changed)

   ```bash
   git commit -m "feat(#123): implement feature"
   ```

2. **Docs Commit** (If docs changed - **Run in Docs Repo**)
   ```bash
   git commit -m "docs(#123): update feature docs"
   ```

> 💡 **Core Rule**: At task completion, **all changed repositories** must be committed.

---

## Docs Push Rules

> Refer to the `docsRepo` setting in `.lee-spec-kit.json`.

| Setting                                      | Behavior                        |
| -------------------------------------------- | ------------------------------- |
| `docsRepo: "embedded"`                       | docs included with project push |
| `docsRepo: "standalone"` + `pushDocs: false` | docs commit only, no push       |
| `docsRepo: "standalone"` + `pushDocs: true`  | push docs changes separately    |

### Standalone Mode Notes

- If `pushDocs: false`, docs changes are **committed locally only**
- If `pushDocs: true`, **push separately** after docs changes
- Project repo and docs repo are separate, **manage each independently**

---

## GitHub Setup Requirements

### Required

- [ ] GitHub CLI (`gh`) installed and authenticated
- [ ] Branch protection rules (main)
  - Require PR before merging

### Recommended

- [ ] Auto-delete head branches
- [ ] Squash merging only

# Pull Request Creation Process

Guide for creating Pull Requests.

---

## Prerequisites

- [ ] All tasks in `[DONE]` state
- [ ] Changes committed
- [ ] Branch pushed

---

## Steps

### 1. Prepare PR Content

> 📖 **Always refer to `pr-template.md`**

| Item     | Format                             |
| -------- | ---------------------------------- |
| Title    | `feat(#{issue-number}): {feature}` |
| Body     | Overview, Changes, Tests, Docs     |
| Labels   | Appropriate labels                 |
| Assignee | `@me` (default)                    |

### 2. Test Verification

> 🚨 **PR cannot be created if tests fail**

1. Run relevant test commands (e.g., `npm test`, `pnpm test`); if no tests exist, request them from the user
2. Check results (PASS/FAIL)
3. Record **execution results** in the "Tests" section of PR body
4. All checkboxes must be checked

### 3. Request User Approval

> 🚨 **User Approval Required**

Before creating PR, share the following **in a code block** and wait for **explicit approval (OK)**:

- Title
- Full body (`pr-template.md` format)
- Labels

### 4. Create PR

```bash
gh pr create \
  --title "feat(#{issue-number}): {feature}" \
  --body-file /tmp/pr-body.md \
  --assignee @me \
  --base main
```

---

## Important Notes

### Link Format

Use **current branch name** for file links in PR body:

```markdown
[filename](https://github.com/{owner}/{repo}/blob/{branch-name}/path/to/file)
```

> ⚠️ `main` branch links will return 404 until merged!

---

## Code Review Modification Guidelines

> 📋 **Criteria for deciding whether to add a task when modifications are needed from review feedback**

### No task needed (Minor changes)

- Typo/code style fixes
- Variable/function name changes
- Comment additions/modifications
- Lint error fixes

### Task needed (Major changes)

- Logic/algorithm changes
- New file/function additions
- API signature changes
- Test case additions
- Requires changes to spec.md or plan.md

---

## Reference Documents

- **PR Template**: `pr-template.md`
- **Git Workflow**: `git-workflow.md`

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

> 🚨 **Cannot create PR if tests fail**

1. Run related test commands (e.g., `npm test`, `pnpm test`)
2. Check results (PASS/FAIL)
3. Record **execution results** in PR body "Tests" section
4. Check boxes **only for items that actually passed**

### 3. Request User Approval

> 🚨 **User Approval Required**

Before creating PR, share and wait for approval:

- Title
- Body (including test results)
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

## Reference Documents

- **PR Template**: `pr-template.md`
- **Git Workflow**: `git-workflow.md`

# GitHub Issue Creation Process

Guide for creating GitHub Issues.

---

## Prerequisites

- [ ] `spec.md` completed
- [ ] User approval received

---

## Steps

### 1. Prepare Issue Draft

> 📖 **Use the CLI built-in issue template policy. Generate a draft first and treat it as the source of truth.**

```bash
# Generate draft body first (no remote action)
npx lee-spec-kit github issue F001 --json
```

Use the generated `bodyFile` in JSON output as the draft body to review/share.

| Item     | Format                                      |
| -------- | ------------------------------------------- |
| Title    | `{feature-name} ({description})`            |
| Body     | Overview, Goals, Criteria, Related docs     |
| Labels   | `enhancement`, `bug`, `documentation`, etc. |
| Assignee | `@me` (default)                             |

### 2. Request User Approval

> 🚨 **User Approval Required**

Before creating issue, share and wait for explicit approval (OK):

- Title
- Full body draft (from `bodyFile`)
- Labels

### 3. Create Issue

```bash
gh issue create \
  --title "{feature-name} ({description})" \
  --body-file /tmp/issue-body.md \
  --assignee @me \
  --label enhancement

# Or via lee-spec-kit helper (requires explicit confirmation)
npx lee-spec-kit github issue F001 --create --confirm OK --labels enhancement
```

---

## Reference Documents

- **Draft generator (CLI built-in)**: `npx lee-spec-kit github issue <feature-name>`
- **Approval rule**: share title/body/labels first, then run `--create --confirm OK`

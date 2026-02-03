# GitHub Issue Creation Process

Guide for creating GitHub Issues.

---

## Prerequisites

- [ ] `spec.md` completed
- [ ] User approval received

---

## Steps

### 1. Prepare Issue Content

> 📖 **Always refer to `issue-template.md`**

| Item     | Format                                      |
| -------- | ------------------------------------------- |
| Title    | `{feature-name} ({description})`            |
| Body     | Overview, Goals, Criteria, Related docs     |
| Labels   | `enhancement`, `bug`, `documentation`, etc. |
| Assignee | `@me` (default)                             |

### 2. Request User Approval

> 🚨 **User Approval Required**

Before creating issue, share and wait for approval:

- Title
- Body
- Labels

### 3. Create Issue

```bash
gh issue create \
  --title "{feature-name} ({description})" \
  --body-file /tmp/issue-body.md \
  --assignee @me \
  --label enhancement
```

---

## Reference Documents

- **Issue Template**: `issue-template.md`
- **Link Format Rules**: `issue-template.md` > "Link Format" section

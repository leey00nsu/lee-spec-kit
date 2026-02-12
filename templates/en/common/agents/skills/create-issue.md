# GitHub Issue Creation Process

Guide for creating GitHub Issues.

---

## Prerequisites

- [ ] `spec.md` completed
- [ ] User approval received

---

## Steps

### 1. Prepare Issue Draft

> 📖 **If not read in this session, read procedure/template via `docs get`; do not re-read the same doc in the same session, then generate a draft and treat it as the source of truth.**

```bash
# 1) Read procedure + template policy (only docs not read in this session)
npx lee-spec-kit docs get create-issue --json
npx lee-spec-kit docs get issue-template --json

# 2) Generate draft body (no remote action)
npx lee-spec-kit github issue F001 --json
```

Use `docs get issue-template --json` output as the section policy,
and `github issue --json` output `body` as the first draft to review/share.
If needed, use `bodyFile` as the filesystem source.

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
- Full body draft (from `body`)
- Labels

Also refine Goals/Completion Criteria based on spec before creating.

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

- **Draft generator**: `npx lee-spec-kit github issue <feature-name>`
- **Approval rule**: share title/body/labels first, then run `--create --confirm OK`

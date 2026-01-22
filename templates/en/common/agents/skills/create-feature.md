# New Feature Creation Process

Step-by-step guide for adding a new Feature.

---

## Steps

### 1. Create Feature Folder

```bash
npx lee-spec-kit feature <name> -d "<description>"
```

- `<name>`: Feature name (lowercase, hyphens allowed)
- `-d`: Feature description (auto-filled in spec.md)

**Example:**

```bash
npx lee-spec-kit feature user-auth -d "User authentication and session management"
```

### 2. Write spec.md

- **What**: Clearly describe what the feature does
- **Why**: Explain why this feature is needed
- ❌ Do NOT include tech stack (covered in plan.md)

### 3. Request User Approval

> 🚨 **User Approval Required**

Share full spec.md content with user and wait for **explicit approval (OK)**

### 4. Create GitHub Issue

→ See `skills/create-issue.md`

### 5. Create Branch

```bash
git checkout -b feat/{issue-number}-{feature-name}
```

> ⚠️ **Do NOT work on main branch.** Always create a branch after issue creation.

### 6. Pre-Commit Checklist

> ⚠️ **Before committing, verify:**

- [ ] Issue number in spec.md (`- **Issue Number**: #{issue}`)
- [ ] Issue number in tasks.md (`- **Issue**: #{issue}`)
- [ ] Branch name in tasks.md (`feat/{issue-number}-{feature-name}`)

### 7. Commit Documents

> 🚨 **User Approval Required**

After spec/plan/tasks approval, commit the **entire Feature folder**:

```bash
git add docs/features/{be|fe}/F{number}-{feature-name}/
git commit -m "docs(#{issue}): F{number} planning complete"
```

> 📁 **Included files**: spec.md, plan.md, tasks.md, decisions.md (include even if empty)
> ⚠️ **Standalone mode**: Switch to Docs repo before committing.

---

## Reference Documents

- **Feature Template**: `features/feature-base/`
- **Issue Creation Guide**: `skills/create-issue.md`

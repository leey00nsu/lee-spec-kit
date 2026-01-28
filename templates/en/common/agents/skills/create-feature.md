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

### 6. Write plan.md

- **plan.md**: Write the implementation plan (Tech stack, architecture, data model, etc.).

### 7. Request plan.md Approval

> 🚨 **plan.md Approval Required**

Share the plan.md with the user and wait for **explicit approval (OK)**.

### 8. Write tasks.md

- **tasks.md**: Break down the work into tasks based on the approved plan.
- Create a checklist considering order and dependencies.

### 9. Pre-Commit Checklist

> ⚠️ **Before committing, verify:**

- [ ] Issue number in spec.md (`- **Issue Number**: #{issue}`)
- [ ] Issue number in tasks.md (`- **Issue**: #{issue}`)
- [ ] Branch name in tasks.md (`feat/{issue-number}-{feature-name}`)
- [ ] Verify spec.md and plan.md Status is set to **Approved**

### 10. Commit Documents

> 🚨 **User Approval Required**

After final review of spec/plan/tasks, commit the **entire Feature folder**:

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

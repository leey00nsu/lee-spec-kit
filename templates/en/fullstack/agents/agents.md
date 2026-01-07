# Agents Guide

Operating rules for AI code assistants to perform consistent code generation and refactoring.

---

## 🚨 User Approval Required (MUST)

> ⚠️ **The following actions require explicit user approval (OK) before proceeding.**
> **If approval is not given, stop immediately and request confirmation.**

| Action                | When to Confirm          | What to Share             |
| --------------------- | ------------------------ | ------------------------- |
| Spec Writing          | After writing `spec.md`  | Full spec content         |
| Task Execution        | Before each task         | Execution plan            |
| Commit Creation       | Before `git commit`      | Commit message, file list |
| Issue Creation        | Before `gh issue create` | Title, body, labels       |
| PR Creation           | Before `gh pr create`    | Title, body, labels       |
| Assignee Change       | When assigning others    | Target username           |
| Remote Git Operations | Before `push`, `merge`   | Branch, changes           |

### Approval Process

1. **Share** action details with user first
2. **Wait** for explicit user approval (OK)
3. **Execute** only after approval

> 🚫 **Prohibited**: Proceeding without user response

---

## Reference Documents

### Core Documents

> ⚠️ **Rules in `custom.md` take precedence over all other rules.**

- **🔴 Custom Rules (Highest Priority)**: `/docs/agents/custom.md`
- **Project Principles**: `/docs/agents/constitution.md`
- **Git Workflow**: `/docs/agents/git-workflow.md`
- **Issue Template**: `/docs/agents/issue-template.md`
- **PR Template**: `/docs/agents/pr-template.md`

### PRD

- **Product Requirements**: `/docs/prd/`

### Features

- **BE Features**: `/docs/features/be/{feature-id}/`
- **FE Features**: `/docs/features/fe/{feature-id}/`
- **Template (SSOT)**: `/docs/features/feature-base/`

---

## 📁 Standard docs Structure

```
docs/
├── README.md           # Documentation guide
├── agents/             # Agent operating rules
│   ├── agents.md
│   ├── constitution.md
│   ├── git-workflow.md
│   ├── issue-template.md
│   └── pr-template.md
├── prd/                # Product requirements
├── features/           # Feature documentation
│   ├── be/             # Backend Features
│   └── fe/             # Frontend Features
└── scripts/            # Utilities
```

---

## Request Type Processes

### 1. New Feature Request

1. Identify target repo (BE or FE)
2. Create feature folder: `npx lee-spec-kit feature <name>`
3. Write `spec.md` - what and why (no tech stack)
4. Request spec review from user
5. Create GitHub Issue

### 2. Spec to Plan

1. Verify spec is clear
2. Write `plan.md` - tech stack, architecture, file structure
3. **Record key decisions in `decisions.md`** (required)
4. Decompose into tasks after user approval

### 3. Task Execution

1. Write tasks in `tasks.md`
2. Execute after user approval
3. Transition status: `[TODO]` → `[DOING]` → `[DONE]`
4. Commit immediately after task completion

### 4. Handling Requests Outside Tasks

> When user requests **work not in tasks.md**:

1. Ask user if this should be **added to tasks.md**
2. If approved: Add to tasks.md then execute
3. If declined: Proceed as temporary work (still included in commit)

---

## 📋 ADR (Architecture Decision Records)

> `decisions.md` is a **required** document for recording technical decisions.

### Format

```markdown
## D{number}: {Decision Title} ({YYYY-MM-DD})

- **Context**: Problem situation or background
- **Options**: Alternatives considered
- **Decision**: Final choice
- **Rationale**: Reason for choice
- **Consequences**: Results and impact (optional)
```

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

### Features

- **Feature Docs**: `/docs/features/{feature-id}/`
- **Template (SSOT)**: `/docs/features/feature-base/`

---

## 📁 Standard docs Structure

```
docs/
├── README.md           # Documentation guide
├── agents/             # Agent operating rules
│   ├── agents.md       # Main rules (this file)
│   ├── constitution.md # Project principles
│   ├── git-workflow.md # Git automation
│   ├── issue-template.md
│   ├── pr-template.md
│   └── skills/         # Step-by-step guides
│       ├── create-feature.md
│       ├── create-issue.md
│       ├── create-pr.md
│       └── execute-task.md
├── prd/                # Product requirements
├── features/           # Feature documentation
│   ├── feature-base/   # Template
│   └── F00X-{name}/
└── scripts/            # Utilities
```

---

## Request Type Processes

> 📖 Refer to `skills/` folder for detailed process guides.

| Process        | Guide                      |
| -------------- | -------------------------- |
| New Feature    | `skills/create-feature.md` |
| GitHub Issue   | `skills/create-issue.md`   |
| Pull Request   | `skills/create-pr.md`      |
| Task Execution | `skills/execute-task.md`   |

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
```

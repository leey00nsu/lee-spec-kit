# Agents Guide

Operating rules for AI code assistants to perform consistent code generation and refactoring.

---

## 🚨 User Approval Required (MUST)

> ⚠️ **The following actions require explicit user approval (OK) before proceeding.**
> **If approval is not given, stop immediately and request confirmation.**
> ✅ Approval replies must be in **`<label>` or `<label> OK` format** (e.g. `A`, `A OK`).

| Action                | When to Confirm          | What to Share             |
| --------------------- | ------------------------ | ------------------------- |
| Spec Writing          | After writing `spec.md`  | Full spec content         |
| Task Execution        | Before each task         | Task title                |
| Commit Creation       | Before `git commit`      | Commit message, file list |
| Issue Creation        | Before `gh issue create` | Title, body, labels       |
| PR Creation           | Before `gh pr create`    | Title, body, labels       |
| Assignee Change       | When assigning others    | Target username           |
| Remote Git Operations | Before `push`, `merge` (including merge commits) | Branch, changes           |

### Approval Process

1. **Share** action details with user first
2. **Wait** for explicit user approval (OK)
3. **Execute** only after approval

> 🚫 **Prohibited**: Proceeding without user response

---

## Reference Documents

### Core Documents

> 🚨 **You MUST read and understand all core documents before proceeding.**

> ⚠️ **Rules in `custom.md` take precedence over all other rules.**

- **🔴 Custom Rules (Highest Priority)**: `/docs/agents/custom.md`
- **Project Principles**: `/docs/agents/constitution.md`
- **Agent Root Guide**: `npx lee-spec-kit docs get agents --json`
- **Git Workflow**: `npx lee-spec-kit docs get git-workflow --json`
- **Issue Procedure/Template**: `npx lee-spec-kit docs get create-issue --json` → `npx lee-spec-kit docs get issue-template --json`
- **PR Procedure/Template**: `npx lee-spec-kit docs get create-pr --json` → `npx lee-spec-kit docs get pr-template --json`

### PRD

- **Product Requirements**: `/docs/prd/`

### Features

- **BE Features**: `/docs/features/be/{feature-id}/`
- **FE Features**: `/docs/features/fe/{feature-id}/`
- **Template (SSOT)**: docs generated via `npx lee-spec-kit feature <name>`

---

## 📁 Standard docs Structure

```
docs/
├── README.md           # Documentation guide
├── agents/             # Agent operating rules
│   ├── custom.md       # Project-specific custom rules
│   └── constitution.md # Project principles
│
│   # Engine-managed policy guides are not synced into project docs.
│   # - list: npx lee-spec-kit docs list --json
│   # - example: npx lee-spec-kit docs get git-workflow --json
├── prd/                # Product requirements
├── designs/            # Design references
├── ideas/              # Pre-feature ideas / to-dos
├── features/           # Feature documentation
│   ├── be/             # Backend Features
│   └── fe/             # Frontend Features
└── scripts/            # Utilities
```

---

## Request Type Processes

> 📖 Read each process guide first with `docs get`.

| Process        | Guide                                 |
| -------------- | ------------------------------------- |
| New Feature    | `npx lee-spec-kit docs get create-feature --json` |
| GitHub Issue   | `npx lee-spec-kit docs get create-issue --json`   |
| Pull Request   | `npx lee-spec-kit docs get create-pr --json`      |
| Task Execution | `npx lee-spec-kit docs get execute-task --json`   |

### Additional Rules (Fullstack)

- **Identify target repo**: Determine BE or FE before feature creation
- **Write plan.md**: Tech stack and architecture decisions after spec approval
- **Record in decisions.md**: Document all major technical decisions

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

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

## 🧾 Label Response Contract (SSOT)

> This is the single source of truth for user-facing response format in lee-spec-kit projects.

- End **every user-facing reply** with current status and currently available labels.
- Build it from the latest `npx lee-spec-kit context --json` (or `flow --json`) result.
- Use label details from `actionOptions[].detail` or command `cmd` **verbatim**. Do not paraphrase.
- Even when the user asks something else, append the same label block again at the end if executable labels exist.
- If no executable labels exist, state `Available labels: none` and guide to re-check with `npx lee-spec-kit context`.
- If the user reply does not include a valid label, do not execute anything; ask for label selection again.

Output format:

```text
Current status: <reasonCode or brief state>
Available labels:
A: <detail>
B: <detail>
Reply format: "<LABEL>" or "<LABEL> OK"
```

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

- **single**: `/docs/features/{feature-id}/`
- **multi**: `/docs/features/{component}/{feature-id}/`
- **Template (SSOT)**: docs generated via `npx lee-spec-kit feature <name>`

---

## 📁 Standard docs Structure

```text
docs/
├── README.md
├── agents/
│   ├── custom.md
│   └── constitution.md
├── prd/
├── designs/
├── ideas/
├── features/
│   ├── (single) F00X-{name}/
│   └── (multi)  {component}/F00X-{name}/
└── scripts/
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

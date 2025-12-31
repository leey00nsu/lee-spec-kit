# Agents Guide

Operating rules for AI code assistants to perform consistent code generation and refactoring.

---

## Reference Documents

### Core Documents

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
├── README.md
├── agents/
│   ├── agents.md
│   ├── constitution.md
│   ├── git-workflow.md
│   ├── issue-template.md
│   └── pr-template.md
├── prd/
├── features/
│   ├── feature-base/
│   └── F00X-{name}/
└── scripts/
```

---

## Request Type Processes

### 1. New Feature Request

1. Create feature folder: `lee-spec-kit feature <name>`
2. Write `spec.md` - what and why
3. Request spec review
4. Create GitHub Issue

### 2. Task Execution

1. Write tasks in `tasks.md`
2. Execute after approval
3. Status transition: `[TODO]` → `[DOING]` → `[DONE]`
4. Commit on task completion

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

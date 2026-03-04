# PRD (Product Requirements Document)

This folder contains product requirements documents.

> **📌 Document Scope**
>
> - **This folder**: Product requirements, business logic, user stories
> - **Constitution**: Tech stack, architecture principles, code quality, security principles → `agents/constitution.md`

## Writing Guide

1. Define project overview and goals
2. Write main features and user stories
3. Include technical architecture overview

## Requirement ID Conventions (Recommended)

To let the CLI report “which PRD items are implemented”, assign **stable IDs** to PRD requirements.

- Format: `PRD-FR-001`, `PRD-US-002`, `PRD-NFR-003`
- The ID only needs to appear on the same line (heading/bullet).
- Reference it from a Feature `tasks.md` task line as a **bracket tag** like `[PRD-FR-001]`.
- For non-PRD tasks, tag them as `[NON-PRD]`.

Example:

```md
- PRD-FR-001: Login rate limit
### PRD-US-002: Admin can view metrics
```

## Example Files

- `{project-name}-prd.md` - Main PRD document
- `backend-overview.md` - Backend architecture (optional)
- `frontend-overview.md` - Frontend architecture (optional)

# PRD (Product Requirements Document)

This folder contains product requirements documents.

This is the top-level requirements space created by `lee-spec-kit init`.
Write PRD documents here first, then connect downstream idea and feature docs back to these requirements.

> **📌 Document Scope**
>
> - **This folder**: Product requirements, business logic, user stories
> - **Constitution**: Tech stack, architecture principles, code quality, security principles → `agents/constitution.md`

## Writing Guide

1. Define project overview and goals
2. Write main features and user stories
3. Include technical architecture overview

## Relationship To Ideas And Features

- `docs/prd/`: defines the source requirements
- `docs/ideas/`: explores candidate work derived from those requirements
- `docs/features/`: executes approved work as feature units

If work starts from a PRD item, keep the relationship visible through `PRD Refs` and task tags in downstream docs.

## Requirement ID Conventions (Recommended)

To let the CLI report “which PRD items are implemented”, assign **stable IDs** to PRD requirements.

- Use stable `PRD-*` keys. Numeric IDs like `PRD-FR-001`, `PRD-US-002`, `PRD-NFR-003` and semantic keys like `PRD-SCOPE-V1-DESKTOP-EDITOR` are all valid.
- The ID only needs to appear on the same line (heading/bullet).
- Reference it from a Feature `tasks.md` task line as a **bracket tag** like `[PRD-FR-001]` or `[PRD-SCOPE-V1-DESKTOP-EDITOR]`.
- For non-PRD tasks, tag them as `[NON-PRD]`.
- Important: do not invent PRD IDs in `tasks.md` or `spec.md`. Define them in this folder or the upstream requirements source first, then reference them.
- For legacy PRD/requirements docs without IDs yet, backfill IDs in the source first, then align the Feature `PRD Refs` and task tags.

Example:

```md
- PRD-FR-001: Login rate limit
### PRD-US-002: Admin can view metrics
```

## Change Rules (Add/Change/Deprecate Requirements)

When requirements change, it must be obvious what needs updating.

- **Stable IDs**:
  - Do not renumber or reuse IDs.
  - Prefer marking a requirement as `Deprecated` (with reason / replacement IDs) over deleting it.
  - If requirements split/merge, keep the original ID and add new IDs, then document the relationship in PRD.
- **Cascade updates (required)**:
  - If the PRD change affects an in-flight Feature, update the Feature SSOT too: `spec.md` (`PRD Refs`), `tasks.md` (task tags), and `plan.md`/`decisions.md` when applicable.
  - If no Feature exists yet, keep an Idea doc (`docs/ideas/*.md`) with `PRD Refs` so it remains traceable before promotion.

## Example Files

- `{project-name}-prd.md` - Main PRD document
- `backend-overview.md` - Backend architecture (optional)
- `frontend-overview.md` - Frontend architecture (optional)

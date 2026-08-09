# UI/UX Design Documentation Policy

This optional policy separates durable design rules from Feature-specific visual material in UI/UX work.
It does not add a workflow stage or approval gate.

---

## Activation Conditions

Apply this policy **only when the user request explicitly includes** one of these intents:

- a design system
- a UI redesign or visual redesign
- design consistency
- shared UI or component-library consolidation
- branding or theme/token redesign
- implementation from Figma or design images

Do not apply it merely because:

- the target component is web/frontend
- the Feature is backend or otherwise non-UI
- the request is a simple bug fix that does not change durable design rules
- the change is a local style adjustment to one existing component

If the signal is ambiguous, do not create design docs; use only the active Feature docs.

## Recommended Structure

When an activation condition is met and durable rules or visual references are actually needed, use only the necessary parts of this structure:

```text
docs/designs/
├── README.md
├── design-system.md
├── <feature-visual-brief>.md
└── assets/
    └── <feature-name>/
```

- Do not create every file preemptively.
- If `docs/designs/design-system.md` already exists, reference or update it instead of creating a replacement.
- Do not make one `design.md` per Feature the default.
- Do not migrate an existing project's document structure or make these documents a required gate.

## Document Responsibilities

### `docs/designs/design-system.md`

Record durable meaning and usage rules shared by multiple Features:

- semantic color tokens
- typography
- spacing and layout
- radius, border, and shadow
- shared components and variants
- states such as loading, empty, error, and processing
- responsive rules
- accessibility and motion rules
- content voice
- design-system change, deprecation, and synchronization policy

Use this frontmatter:

```yaml
---
lee-spec-kit:
  kind: design-system
  scope: project
---
```

### `docs/designs/<feature-visual-brief>.md`

Record the UX direction and visual references for one Feature:

- original Figma URLs and any necessary repository snapshots
- design images and reference screens
- intent and key states for each screen or flow
- gaps between the current data/API contract and the design
- applicable `design-system.md` rules and Feature-specific interpretation

Use `kind: ux-design` or `kind: visual-reference` with `scope: project`, as appropriate. This document is the Feature's visual reference authority; it does not replace the authorities for requirements, implementation planning, or technical decisions.

### Feature `spec.md`

- Keep user requirements and acceptance criteria here.
- Link the design system and visual brief through optional `Design Refs` using project-root paths.

### Feature `plan.md`

- Record the change surface for token/theme files, shared components, routes/screens, and Storybook or an equivalent workbench.
- Explain how design rules map to executable code and tests.

### Feature `decisions.md`

- Record why the design system changed or why an exception exists.
- Include the exception scope, affected rule, and removal condition.

## Executable Authorities and Responsibility Split

Do not treat `design-system.md` as the only source of truth.

| Surface                           | Responsibility                                       |
| --------------------------------- | ---------------------------------------------------- |
| `docs/designs/design-system.md`   | Meaning, intent, and usage rules                     |
| CSS theme/globals or token files  | Executed token values                                |
| Shared UI directory               | Executed component APIs and variant contracts        |
| Storybook or equivalent workbench | Executable examples of variants and states           |
| Feature `decisions.md`            | Exceptions, change rationale, and removal conditions |

The document explains meaning; code and the workbench prove the executable contract.

## Synchronization Rules

- When a Feature changes `design-system.md`, use the same `tasks.md` task to name the affected design docs, token/theme files, shared UI, Storybook/workbench examples, and relevant verification.
- Do not force edits to an unaffected surface, but confirm its impact explicitly in the task checklist.
- If docs and code diverge, synchronize the affected documents and executable authorities in the same Feature task.
- Record design-system exceptions and their removal conditions in `decisions.md`.
- Store visual-reference files under a repository path such as `docs/designs/assets/<feature-name>/`; never depend on an absolute path from one person's computer.
- Keep the external Figma or source URL for provenance, and also reference a repository asset when implementation depends on a fixed snapshot.

## Backward Compatibility

- `design-system.md`, visual briefs, and `Design Refs` are all optional.
- Existing Feature docs do not need the new section backfilled.
- This policy does not change spec/plan/tasks approvals or `workflow-stage` results.
- For requests that do not match an explicit UI/UX activation condition, use the existing Feature-doc workflow only.

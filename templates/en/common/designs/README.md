# UX / Visual Designs

Store design references used by the project.

(e.g., Figma links, screenshots, design system rules, UI guidelines)

---

## Optional Use

`design-system.md` and Feature visual briefs are not required documents for every project.

- Consider them only for an explicit design-system, UI/visual-redesign, design-consistency, shared-UI/component-library, branding/theme/token, or Figma/design-image implementation request.
- Do not create them for an ordinary web/frontend Feature, a backend Feature, or a bug fix that does not change durable design rules.
- Detailed policy: `npx lee-spec-kit docs get ui-ux-design --json`

---

## What belongs here

- Screen/flow references (Figma, images, links)
- Component/pattern guidelines (buttons, forms, navigation, etc.)
- UI rules (brand, typography, colors/tokens)

## Recommended Structure and Responsibilities

```text
docs/designs/
├── README.md
├── design-system.md
├── <feature-visual-brief>.md
└── assets/
    └── <feature-name>/
```

- `design-system.md`: meaning and usage rules shared across Features
- `<feature-visual-brief>.md`: Feature-specific Figma/images, UX direction, and gaps between the data contract and design
- `assets/<feature-name>/`: repository-owned visual snapshots required by implementation

If `design-system.md` already exists, reference or update it instead of creating a replacement. Do not make one `design.md` per Feature the default.

---

## What does not belong here

- System/backend architecture (`docs/prd/*-overview.md` or the active Feature's `plan.md`)
- Data models and API design (an Idea before promotion, then the active Feature's `plan.md`)
- Open-source candidate research (an Idea or the active Feature's `decisions.md`)
- Technical decisions and alternative comparisons (an Idea before promotion, then the active Feature's `decisions.md`)
- Implementation roadmaps and work plans (the active Feature's `plan.md` and `tasks.md`)

In `designs/`, design means UX, screen, and visual design—not technical design.

---

## Conventions

- For external references, keep the **source URL + a short summary (or a snapshot)**.
- Use kebab-case filenames (e.g., `auth-flow.md`, `design-system.md`).
- Keep images/files in a repository path such as `assets/<feature-name>/`; never depend on an absolute path from one person's computer.
- Use `scope: project` and the appropriate `kind: ux-design`, `kind: design-system`, or `kind: visual-reference` frontmatter.

## Executable Authorities

- `design-system.md`: meaning and usage rules
- CSS theme/globals or token files: executed token values
- Shared UI directory: executed component and variant contracts
- Storybook or equivalent workbench: executable variant and state examples
- Feature `decisions.md`: exceptions, change rationale, and removal conditions

When `design-system.md` changes, use the same Feature task to review and synchronize affected docs, token/theme files, shared UI, Storybook/workbench examples, and verification.

---

## How to reference

Prefer **project-root paths** over relative links in feature docs:

- Example: `docs/designs/auth-flow.md`

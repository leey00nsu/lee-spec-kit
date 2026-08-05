# UX / Visual Designs

Store design references used by the project.

(e.g., Figma links, screenshots, design system rules, UI guidelines)

---

## What belongs here

- Screen/flow references (Figma, images, links)
- Component/pattern guidelines (buttons, forms, navigation, etc.)
- UI rules (brand, typography, colors/tokens)

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
- If you need images/files, create and use an `assets/` folder.

---

## How to reference

Prefer **project-root paths** over relative links in feature docs:

- Example: `docs/designs/auth-flow.md`

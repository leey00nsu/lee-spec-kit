# Ideas

A place for pre-feature ideas / to-dos / experiments.

Core rule: once an idea becomes a Feature, the SSOT moves to `docs/features/`.

---

## Conventions

- 1 idea = 1 file (kebab-case recommended)
  - Example: `login-rate-limit.md`
  - Example: `admin-dashboard-metrics.md`
- Put at least these at the top:
  - Goal / context
  - Rough scope (what’s in/out)
  - PRD Refs (recommended): `PRD-FR-001, PRD-US-002` (use `NON-PRD` when not tied to PRD)
  - Target component (optional): `api` / `app` / `worker` / `all`
  - Status (recommended): `Active | Converted | Dropped`

---

## Promotion / Cleanup (Idea → Feature)

1. Create a Feature folder with `npx lee-spec-kit feature <name>`
2. In the new Feature, record all of the following:
   - Idea doc path in `spec.md` or `tasks.md` (example: `docs/ideas/login-rate-limit.md`)
   - `PRD Refs` in `spec.md` (example: `PRD-FR-001, PRD-US-002`)
   - PRD mapping tags in `tasks.md` task lines like `[PRD-FR-001]` (use `[NON-PRD]` for non-PRD tasks)
3. Remove the idea from the active list (choose one):
   - **Recommended**: move to `docs/ideas/archive/` and add `Status: Converted`, `Feature: F00X-...` on top
   - Or: delete it (only if you don’t need history)

> Tip: archiving is usually better than deleting for traceability (“why this feature exists”).

---

## Change Protocol (When Ideas Change Mid-Work)

- If PRD requirements change: update the idea’s `PRD Refs` first, and update PRD docs (`docs/prd/*.md`) when needed (add/update IDs).
- If the idea is already promoted: update the Feature SSOT instead (`spec.md`/`tasks.md`/`plan.md`/`decisions.md`), not the idea.

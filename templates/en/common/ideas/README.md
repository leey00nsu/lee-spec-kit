# Ideas

A place for pre-feature ideas / to-dos / experiments.

Core rule: once an idea becomes a Feature, the SSOT moves to `docs/features/`.

Typical flow: PRD defines the requirement, Idea explores or scopes the candidate work, and Feature becomes the executable unit.

---

## Conventions

- 1 idea = 1 file
  - CLI-generated ideas use indexed names like `I001-login-rate-limit.md`
  - Legacy free-form names like `login-rate-limit.md` can still exist
- Put at least these at the top:
  - `Idea ID` (`I###` for indexed ideas)
  - Goal / context
  - Rough scope (what’s in/out)
  - PRD Refs (recommended): `PRD-FR-001, PRD-US-002` or `PRD-SCOPE-V1-DESKTOP-EDITOR` (use `NON-PRD` when not tied to PRD)
  - Target component (optional): `api` / `app` / `worker` / `all`
  - Status: `Active | Featureized | Dropped`
  - Feature: `F###-slug` when promoted
- Only list IDs that already exist in the source PRD/requirements doc. If IDs do not exist yet, backfill the source first.

---

## Promotion / Cleanup (Idea → Feature)

1. Create an idea doc with `npx lee-spec-kit idea <name>` when you want traceable intake.
2. Promote it with `npx lee-spec-kit feature <name> --idea I001`
3. In the new Feature, record all of the following:
- The source idea path is stamped into `spec.md` automatically when `--idea` is used.
- `PRD Refs` still need to be completed in `spec.md`.
- `tasks.md` still needs PRD mapping tags like `[PRD-FR-001]` or `[PRD-SCOPE-V1-DESKTOP-EDITOR]`.
4. Keep the idea doc for history and update it to `Status: Featureized`, `Feature: F00X-...`

> Tip: keeping the source idea doc is usually better than deleting it for traceability (“why this feature exists”).

---

## Change Protocol (When Ideas Change Mid-Work)

- If PRD requirements change: update the idea’s `PRD Refs` first, and update PRD docs (`docs/prd/*.md`) when needed (add/update IDs).
- If the idea is already promoted: update the Feature SSOT instead (`spec.md`/`tasks.md`/`plan.md`/`decisions.md`), not the idea.

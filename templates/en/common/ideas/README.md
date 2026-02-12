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
  - Target component (optional): `api` / `app` / `worker` / `all`

---

## Promotion / Cleanup (Idea → Feature)

1. Create a Feature folder with `npx lee-spec-kit feature <name>`
2. Add the idea doc path to the new Feature’s `spec.md` or `tasks.md`
   - Example: `docs/ideas/login-rate-limit.md`
3. Remove the idea from the active list (choose one):
   - **Recommended**: move to `docs/ideas/archive/` and add `Status: Converted`, `Feature: F00X-...` on top
   - Or: delete it (only if you don’t need history)

> Tip: archiving is usually better than deleting for traceability (“why this feature exists”).

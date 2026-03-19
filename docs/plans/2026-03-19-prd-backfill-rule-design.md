# PRD Backfill Rule For Mid-Feature Requirement Changes Design

**Goal:** Clarify that `NON-PRD` is only for internal implementation work, and require PRD backfill when feature execution introduces user-facing behavior or scope changes.

**Approach:** Tighten the wording in the shared docs guide, feature guide, and feature templates so agents treat PRD as the requirements SSOT not only during idea-to-feature promotion, but also when requirements evolve during implementation.

**Key design points**

1. `NON-PRD` is narrowed.
   - Allowed for internal work such as refactors, renames, tooling, and test-only work.
   - Not allowed as the final classification for user-facing behavior changes, new acceptance criteria, or scope changes.

2. Mid-feature requirement changes must backfill PRD.
   - If implementation discovers a better behavior and that changes what the user gets, the team must update PRD first.
   - Then align `spec.md`, `tasks.md`, and optionally `plan.md` / `decisions.md`.

3. The rule stays documentation-only.
   - No CLI validation or doctor enforcement is added.
   - The goal is to reduce ambiguity in how humans and agents keep docs aligned.

4. The update should be visible where work actually happens.
   - Shared SSOT guide
   - Feature guide
   - `spec.md` template
   - `tasks.md` template

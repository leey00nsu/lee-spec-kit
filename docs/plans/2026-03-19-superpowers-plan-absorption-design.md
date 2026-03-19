# Superpowers Plan Absorption Design

**Goal:** Make `superpowers`-generated design and implementation plan documents compatible with `lee-spec-kit` by treating them as staging artifacts and absorbing their content into the active feature's local docs.

**Approach:** Keep `superpowers` upstream untouched. In `lee-spec-kit` documentation rules, define shared planning artifacts such as `docs/plans/*` or `docs/superpowers/{specs,plans}/*` as temporary references only. When a feature is in progress, the feature-local docs remain the final SSOT.

**Key design points**

1. Shared plan/spec artifacts are not the final SSOT.
   - `docs/plans/*`
   - `docs/superpowers/specs/*`
   - `docs/superpowers/plans/*`
   These are treated as staging or reference artifacts.

2. Feature-local docs remain authoritative during active work.
   - `spec.md`: user-facing scope, requirements, acceptance criteria
   - `plan.md`: architecture, file structure, test strategy
   - `tasks.md`: executable work items only
   - `decisions.md`: trade-offs, selected options, rationale, evidence

3. Absorption mapping must be explicit.
   - Design/spec artifact → `spec.md`, `plan.md`, `decisions.md`
   - Implementation plan artifact → `plan.md`, `tasks.md`

4. Retention is allowed without authority.
   - Shared plan/spec artifacts can remain for reference or audit history.
   - They must not outrank feature-local docs once the feature context exists.

5. Agent guidance must mention the rule directly.
   - The docs guide should define the scope split.
   - The features guide should tell authors how to absorb content.
   - The agents guide should tell agents which document wins on conflict.

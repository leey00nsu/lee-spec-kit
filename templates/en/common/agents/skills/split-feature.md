# Feature Scope Split Guide (Issue Unit Preserved)

Use this guide when one Feature/Issue becomes too large to review safely.

---

## Threshold policy

- Split suggestion starts when:
  - `tasks.md` task count is `>= 40`, or
  - `decisions.md` line count is `>= 1200`.
- Strong 4-way split recommendation when:
  - task count is `>= 80`, or
  - decisions line count is `>= 2500`.

Notes:

- Keep one issue only for small, tightly coupled work.
- Preserve "Feature = Issue" by creating multiple linked child issues/features.

---

## How to decide split boundaries

Evaluate each candidate group with these four criteria:

1. Coupling
   - Can this group change without forcing edits in the others?
2. Changed-file overlap
   - Do PRs mostly touch separate files/modules?
3. Test boundary
   - Can tests be run and reviewed per group?
4. Deployment independence
   - Can each group merge safely with flags/compatibility guards?

Prefer boundaries that maximize independence and minimize rebase conflicts.

---

## Required per-issue template

For every split issue/feature, fill all fields below:

```md
## Split Issue: <name>
- Goal:
- Included Scope:
- Excluded Scope:
- Depends On:
- PR Done Criteria:
```

Minimum quality bar:

- `Included Scope` and `Excluded Scope` must be explicit.
- `Depends On` must list predecessor issue(s) or `None`.
- `PR Done Criteria` must be checkable in review.

---

## Recommended split shapes

- 2-way split (typical for medium-large):
  - Base/refactor lane
  - Product behavior lane
- 4-way split (typical for very large):
  - Foundation (types/contracts/data)
  - Core flow
  - Edge cases/integrations
  - Cleanup/docs/final hardening

---

## Merge sequencing

When dependencies exist, use a linear merge order:

1. Merge foundation PR
2. Rebase/merge core flow PR
3. Rebase/merge integration PR
4. Rebase/merge cleanup PR

Keep every PR independently reviewable and releasable.

---

## Split execution checklist

1. Freeze new TODO inflow in the current oversized feature.
2. Define split boundaries with the 4 criteria.
3. Create linked child issues/features.
4. Move TODO tasks to the correct child feature.
5. Record dependencies and merge order.
6. Continue implementation per child feature.


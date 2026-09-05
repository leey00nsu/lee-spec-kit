# Implementation Plan: {feature-name}

> Write after spec is approved.
> If unmanaged docs artifacts exist outside the canonical docs surface (for example `docs/plans/*` or `docs/superpowers/*`), absorb their architecture/file/test content here and treat this file as the final feature-local SSOT.

---

## Overview

- **Feature ID**: F{number}
- **Target Repo**: {{projectName}}-{component}
- **Created**: {YYYY-MM-DD}
- **Status**: -
  - Values: Draft | Review | Approved
- **Plan Review**: Pending
  - Values: Pending | Running | Done
- **Plan Review Evidence**: -
  - Example: `docs/features/F001-foo/decisions.md` or another existing review artifact under the docs root
- **Plan Review Decision**: -
  - Format: `decision: approve|changes_requested|blocked ...`
- **Plan Review Round**: -
  - Positive integer returned by `workflow-stage --json`; the first review is `1`
- **Plan Reviewed Spec Hash**: -
  - Exact `specHash` returned by `workflow-stage --json`
- **Plan Reviewed Plan Hash**: -
  - Exact `planHash` returned by `workflow-stage --json`

---

## Tech Stack

| Category | Choice | Reason |
| -------- | ------ | ------ |

---

## Architecture

(Component structure, data flow)

---

## File Structure

```
src/
├── ...
```

---

## Curated Documentation Impact

Do not close a discovered documentation discrepancy with a decisions.md note alone. For an unambiguous factual error within approved scope, declare UPDATE/ADD and link a task Docs target. If product intent or scope expansion needs confirmation, record the conflicting document paths and evidence, the question to resolve, the deferral reason, and a real follow-up task/Feature/issue reference. Never invent identifiers or approvals. If creating the tracking item needs approval, do not report resolution before user confirmation. Explain in NONE evidence whether no known discrepancy remains or a remaining discrepancy is tracked by that follow-up. Never delete unimplemented PRD requirements merely to match code or OpenWiki.

> Complete this assessment even when every decision is `NONE`. `NONE` means the surface was reviewed and no human-owned project document needs to change. Generated OpenWiki synchronization is evaluated separately.

- **Schema**: 2
- **Assessment**: Pending
  - Values: Pending | Complete
- **Product requirements**: -
  - Values: NONE | UPDATE | ADD
- **System architecture**: -
  - Values: NONE | UPDATE | ADD
- **Onboarding entrypoint**: -
  - Values: NONE | UPDATE | ADD
- **Operational/runtime contract**: -
  - Values: NONE | UPDATE | ADD
- **Reason**: -
- **Targets**: -
  - Use comma-separated `docs:<path>` and `project:<path>` targets when any decision is UPDATE or ADD.
  - Every target must be linked from a task `Docs` list and committed with the active Feature scope before Knowledge sync or Feature review.

---

## Additional Curated Impacts

> Assess conditional project-wide documents such as constitution/custom policy, design systems, API/data contracts, security, release, and observability. When none apply, record `Decision: NONE` and leave the table empty.

- **Assessment**: Pending
- **Decision**: -
  - Values: NONE | DECLARED

| Kind | Decision | Target | Reason |
| ---- | -------- | ------ | ------ |
| -    | -        | -      | -      |

Allowed kinds: `engineering-agent-policy`, `design-system-ux`, `api-data-contract`, `security-privacy`, `release-deployment`, `observability`, `other-curated`

Each `DECLARED` row uses `UPDATE` or `ADD` and a `docs:<path>` or `project:<path>` target. Link every target from a task `Docs` list.

---

## Verification Contract

### Change Classification

- **Type**: COPY | REFACTOR | BUG_FIX | NEW_BEHAVIOR | HIGH_RISK
- **Risk**: LOW | MEDIUM | HIGH

### Observable Contract

- **Supported behavior**:
- **Preconditions**:
- **Success guarantees**:
- **Important failure guarantees**:
- **Intentionally unsupported cases**:

### Test Decisions

| Contract / Requirement | Decision              | Test Level                             | Realistic Regression Protected | Independent Oracle                          |
| ---------------------- | --------------------- | -------------------------------------- | ------------------------------ | ------------------------------------------- |
| (AC/FR reference)      | NONE \| UPDATE \| ADD | Unit \| Integration \| E2E \| Non-test | (failure this prevents)        | (spec/released behavior/external reference) |

### Excluded Tests

- (duplicates, implementation details, unsupported synthetic inputs, or framework behavior intentionally not tested)

### Verification Execution

- **During implementation**:
- **Before task completion**:
- **Before Feature completion**:
- **Manual/UI verification**:
- **Full suite required**: Yes | No — (reason)

---

## Related Documents

- Spec: [spec.md](./spec.md)
- Decisions: [decisions.md](./decisions.md)

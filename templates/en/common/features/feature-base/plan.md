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

| Contract / Requirement | Decision | Test Level | Realistic Regression Protected | Independent Oracle |
| ---------------------- | -------- | ---------- | ------------------------------ | ------------------ |
| (AC/FR reference)      | NONE \| UPDATE \| ADD | Unit \| Integration \| E2E \| Non-test | (failure this prevents) | (spec/released behavior/external reference) |

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

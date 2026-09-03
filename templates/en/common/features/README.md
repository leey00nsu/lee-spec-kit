# Features Guide

Folder for managing feature specs, plans, and tasks.

---

## Folder Structure

```text
features/
├── README.md           # This file
├── feature-base/       # Shared template (edit in one place)
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   ├── issue.md
│   ├── pr.md
│   └── decisions.md
├── (single) F00X-{name}/
└── (multi)  {component}/F00X-{name}/
```

---

## Creating New Features

```bash
# Single project
npx lee-spec-kit feature user-auth

# Multi project
npx lee-spec-kit feature --component app user-profile
```

> 💡 CLI copies templates from `feature-base/` and auto-assigns IDs.

Features are the executable units in the PRD → idea → feature flow.
By the time work reaches this folder, the requirement should already be defined in `docs/prd/`, and any pre-feature exploration should already live in `docs/ideas/`.

---

## Feature ID Rules

- `F{number}-{feature-name}` (e.g., F001-user-auth)
- Minimum **3-digit padding** for numbers (001, 002, ...)
- Expands to **4+ digits** beyond 999 (F1000, F1001, ...)
- Feature names in kebab-case
- **Feature identity is workflow-dependent**: In GitHub workflow, each Feature corresponds to one GitHub Issue. In local workflow, the canonical identity is the stable Feature ID such as `F027`; no Issue is required.

---

## Workflow Stage Check

```bash
npx lee-spec-kit workflow-stage <feature-ref> --json
```

Use the returned `stage`, `nextAction`, and `implementationAllowed` values as the current workflow state.

Before Plan review or approval, complete Schema 2 `Curated Documentation Impact`. Assess all four core surfaces, and use typed `Additional Curated Impacts` only for applicable project-specific surfaces; an explicit additional `NONE` proves that no extra category applies. Every `UPDATE` or `ADD` target must appear under `Docs` in at least one task and in the committed Feature diff. Existing projects require one manual baseline reconciliation before per-Feature checks can keep the curated layer current.

When `experimental.openwiki=true`, all completed task checkpoints advance through required `knowledge_setup`, `knowledge_sync`, and `knowledge_commit` stages before Feature review. The Feature reviewer receives `openwiki/index.md`, the verified receipt, and every Plan-declared curated target; use the claim-specific authority matrix in `docs/README.md` rather than treating generated Knowledge as authoritative. The Knowledge surface includes a final lee-spec-kit protection block in `.openwikiignore`.

With Plan review enabled, planning follows `plan Review → fresh read-only Plan review → plan approval`. The review is bound to the returned `specHash` and `planHash`; changing either document's content invalidates the prior evidence. The reviewer checks the Verification Contract and test decisions without editing docs.

The three final completion checkboxes in `tasks.md` carry `lee-spec-kit:completion:*` HTML markers. You may customize their visible wording, but preserve the marker on each checkbox line; `workflow-stage` uses the marker as the machine-readable identity and falls back to the legacy canonical wording for older projects.

With Feature agent review enabled, local completion is `feature review → implementation_approve → feature_verify → local_merge → local_cleanup → done`. With task review enabled, every task follows `DOING → REVIEW → task review → DONE`. Failed checks enter `feature_remediation` with implementation enabled. `local-ff` moves only the verified Feature SHA; `local-squash` requires the integration tree to match the verified Feature tree. Both require cleanup before `done`. After cleanup, a Feature remains `done` while its recorded integration commit is still an ancestor of the current base, even when later Features advance that base.

When `workflow.agentExecution.task.enabled=true`, each `task_execute` action carries the configured subagent model, reasoning effort, stable task ID, implementation working directory, a machine-readable `workerContract`, and a versioned `delegationContext`. The context includes the exact task block, acceptance criteria, Verification Contract, required Feature documents, and conditional references; pass it unchanged to the worker. The worker executes directly without calling `workflow-stage` or delegating again. It does not add unplanned durable tests, edits project code, and runs task-scoped checks only; the main agent owns docs synchronization, task transitions, commits, approvals, and remote actions. Official hooks block commits until the main agent advances the workflow to `task_commit`.

A remediation commit invalidates verification and the prior local-merge confirmation. Refresh review evidence for the changed diff when Pre-PR review is enabled, verify the new tip, and obtain local-merge approval again.

---

## PRD Requirement Traceability (Recommended)

- Assign stable `PRD-*` requirement IDs in PRD docs (`docs/prd/*.md`) like `PRD-FR-001` or `PRD-SCOPE-V1-DESKTOP-EDITOR`.
- Link each task line in `tasks.md` with a tag like `[PRD-FR-001]` or `[PRD-SCOPE-V1-DESKTOP-EDITOR]`. For non-PRD tasks, use `[NON-PRD]`.
- Use `[NON-PRD]` only for internal implementation work such as refactors, test-only work, tooling, renames, and cleanup.
- If a change affects user-facing behavior, acceptance criteria, or scope, update PRD first and retag the task as `[PRD-...]`.
- Do not invent PRD IDs inside feature docs. Define them in the PRD source first, and backfill legacy docs before linking tasks.
- Keep traceability reviewable by maintaining `PRD Refs` in `spec.md` and PRD tags on each task line.

---

## Change Protocol (When Requirements/Scope Change Mid-Feature)

When things change mid-work, it must be explicit what was updated.

- Record changes as **new tasks** (do not edit `[DONE]` tasks; create a new task instead).
- During that sync, `tasks.md` may temporarily carry `Pending Change Request` as an internal marker. Clear it after the request is reflected in the new task(s) and related docs.
- Every change task must be tagged as `[PRD-...]` or `[NON-PRD]`. (Recommended: also add `[CHANGE]`.)
- If a change starts as internal exploration but ends up changing user-visible behavior, do not leave it as `[NON-PRD]`.
  - Backfill/update `docs/prd/*.md`
  - Update `spec.md` `PRD Refs`
  - Retag the task as `[PRD-...]` or add a replacement PRD-backed task
- If the change impacts PRD/spec/plan, update these too:
  - `docs/prd/*.md` (add/update/deprecate requirement IDs)
  - `spec.md` (`PRD Refs`, scope/AC)
  - `plan.md` (architecture/testing strategy)
  - `decisions.md` (why it changed + evidence)

---

## Unmanaged Docs Artifacts

External agent workflows may create docs entries outside the canonical lee-spec-kit docs surface.
Common examples include:

- `docs/plans/*.md`
- `docs/superpowers/*`
- another skill-created top-level docs folder

When a feature is already in progress, treat those files as staging/reference artifacts, not the active workflow SSOT.

- If the extra docs entry is intentional, add it to `.lee-spec-kit.json` `allowedDocsEntries`
- If it is a planning/reference artifact, normalize it before continuing active feature execution
- `commit-audit` blocks staged unmanaged or non-canonical feature docs until they are normalized or allowlisted

- Move user-facing scope and acceptance criteria into `spec.md`
- Move architecture/file structure/test strategy into `plan.md`
- Move executable work items into `tasks.md`
- Move trade-offs, rejected options, and rationale into `decisions.md`

Keeping the shared artifact for history is fine, but when it conflicts with feature-local docs, the feature folder wins.

---

## Status Glossary

| Scope | Field | Values |
| --- | --- | --- |
| Document status | `Status` in `spec.md`/`plan.md`, `Doc Status` in `tasks.md` | `Draft` \| `Review` \| `Approved` |
| Plan review status | `Plan Review` in `plan.md` | `Pending` \| `Running` \| `Done` |
| Plan review evidence/decision | `Plan Review Evidence` / `Plan Review Decision` | evidence path and `decision: approve\|changes_requested\|blocked ...` |
| Plan review target | `Plan Reviewed Spec Hash` / `Plan Reviewed Plan Hash` | current content hashes returned by `workflow-stage` |
| Issue doc status | `Status` in `issue.md` | `Draft` \| `Ready` |
| PR doc status | `Status` in `pr.md` | `Draft` \| `Ready` |
| PR review status | `PR Status` in `tasks.md` | `Review` \| `Approved` |
| Pre-PR review status | `Pre-PR Review` in `tasks.md` | `Pending` \| `Done` |
| Pre-PR review evidence | `Pre-PR Evidence` in `tasks.md` | evidence link/log/doc path |
| Pre-PR review decision | `Pre-PR Decision` in `tasks.md` | `decision: approve\|changes_requested\|blocked ...` |
| Pre-PR review target | `Pre-PR Reviewed Head` / `Pre-PR Reviewed Tree` | current SHA/tree returned by `workflow-stage` |
| PR review evidence | `PR Review Evidence` in `tasks.md` | evidence link/log/doc path |
| PR review decision | `PR Review Decision` in `tasks.md` | `decision: ...` (or `결정: ...`) |

---

## Agent Review Checklist

Delegate Plan, task, and Feature reviews to fresh, read-only subagents using the model, reasoning effort, and exact target returned by `workflow-stage --json`. Plan review covers current spec/plan content hashes, task review covers its checkpoint range, and Feature review covers the base-to-Feature-tip diff. The subagent returns defect-focused findings without modifying code or docs; the main agent owns remediation and evidence recording. No named review skill is required.

---

## File Roles

| File           | Role                      | When to Write       |
| -------------- | ------------------------- | ------------------- |
| `spec.md`      | **What and Why**          | Feature definition  |
| `plan.md`      | **How** + Verification Contract | After spec approval |
| `tasks.md`     | Specific work items       | After plan approval |
| `issue.md`     | Issue draft + issue state (`Draft/Ready`) | Before/when creating issue |
| `pr.md`        | PR draft + PR state (`Draft/Ready`) | Before/when creating PR |
| `decisions.md` | Technical decisions + reasoning trace + evidence links (ADR) | During development (DOING start / before DONE / post-merge) |

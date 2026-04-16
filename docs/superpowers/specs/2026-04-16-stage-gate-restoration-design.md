# Stage Gate Restoration Design

## Goal

Restore the pre-0.8.0 staged lee-spec-kit workflow for Codex-native usage without reintroducing the legacy `context` / `flow` orchestration engine.

## Problem

The current Codex-native path preserves the docs schema but no longer computes the old "what stage is allowed next?" decision. As a result, after `tasks.md` is populated, an agent can begin implementation immediately instead of stopping at the issue stage first.

## Requirements

- Preserve the existing docs schema.
- Restore the pre-0.8.0 high-level stage order:
  - `spec`
  - `plan`
  - `tasks`
  - `issue`
  - `branch`
  - `implementation`
  - `implementation approval`
  - `pre-pr`
  - `pr`
  - `review/merge`
- Keep Codex hooks as the default runtime path.
- Do not restore the old `context` / `flow` execution loop, approval ticketing, or resumable runtime state.
- Preserve the old approval boundaries at the stage level.

## Design

Add a thin stateless stage decision command, `workflow-stage`, that reads the active feature docs and current repo state and returns:

- current stage
- next allowed action
- whether approval is required
- whether implementation is currently allowed
- blocked reason when the next stage is not implementable

This command acts as a small decision layer, not an orchestrator:

- no auto-run
- no resume state
- no ticketing
- no command execution

Codex-native guidance then changes from:

- "read docs and proceed"

to:

- "read docs, run `workflow-stage --json`, and only take the returned next action"

## Key Restoration Rules

### Before implementation

Implementation is blocked until:

- `spec.md` status is `Approved`
- `plan.md` status is `Approved`
- `tasks.md` exists, has at least one task, and `Doc Status` is `Approved`
- the issue stage is satisfied:
  - `issue.md` exists and is `Ready`
  - issue number exists in `tasks.md`
- branch stage is satisfied when a project repo exists

### After implementation completes

When all tasks are `[DONE]`, the workflow enters `implementation_approve` before `pre_pr_review`.

### Pre-PR and PR stages

The command recognizes:

- pre-PR review not started / pending / approved / changes requested
- PR draft not ready / ready for creation / already created
- PR review and merge readiness

## Integration Points

- Add `workflow-stage` command.
- Update managed `AGENTS.md` text to require `workflow-stage --json` before implementation.
- Update Codex hook guidance text to mention `workflow-stage`.
- Update agent skill docs:
  - `create-issue`
  - `execute-task`
  - `create-pr`
- Add tests that prove issue creation remains a hard gate before implementation starts.

## Non-Goals

- Reintroducing `context`, `flow`, `task-run`, or `task-complete`
- Reintroducing approval tickets or resumable orchestration
- Building a full OpenSpec-style artifact graph engine

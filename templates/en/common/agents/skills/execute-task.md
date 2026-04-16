# Task Execution Process: Docs-first

Use the active feature folder as the execution SSOT.

---

## 1. Pick the current task

- Resolve the active feature first.
- In `tasks.md`, either:
  - continue the single `[DOING]` task, or
  - move the next highest-priority `[TODO]` task to `[DOING]`
- Work one task at a time. Do not batch-complete multiple tasks in one pass.

## 2. Execute and record

- Keep `tasks.md` aligned with reality:
  - do not mark `[DONE]` without real completion and verification
  - update `Acceptance` and `Checklist` in the same edit when closing a task
  - if a completed task needs follow-up, add a new task instead of rewriting history
- If you need to add a new task, prefer `npx lee-spec-kit task add <feature-ref> --title "..." --ref NON-PRD|PRD-*`.
- Do not leave placeholder `Acceptance` or `Checklist` items in newly added tasks.

## 3. Keep docs in sync

- `spec.md`: update when user-visible scope or acceptance criteria change
- `plan.md`: update when architecture, file structure, or test strategy changes
- `decisions.md`: record non-obvious decisions, trade-offs, compatibility behavior, and user-requested behavior changes
- If `Pending Change Request` is present, sync `tasks.md` first, then update supporting docs and clear the field before resuming implementation

## 4. Commit and stop guardrails

- Before `git commit`, use `npx lee-spec-kit commit-audit --json` when docs-path validation matters.
- Before stopping, use `npx lee-spec-kit workflow-audit --json` if code or feature docs changed.
- Keep one row per test command in the `tasks.md` test log and update that row on reruns instead of appending duplicates.

## 5. Approval boundaries

- Ask for approval only at documented review checkpoints and before remote or destructive actions.
- Before issue creation, PR creation, push, merge, or similar remote actions, share the exact artifact or plan first.
- Codex may delegate implementation work, but docs updates, approval handling, and remote actions stay with the main session.

## Strict Rules

1. Do not skip required doc updates.
2. Do not rewrite `[DONE]` tasks.
3. Do not treat unmanaged docs artifacts as active workflow state until they are normalized or allowlisted.

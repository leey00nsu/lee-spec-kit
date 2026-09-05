# Task Execution Process: Docs-first

Use the active feature folder as the execution SSOT.

---

## 1. Pick the current task

- Before touching code, run `npx lee-spec-kit workflow-stage <feature-ref> --json`.
- Only continue if it reports `stage === "implementation"` and `implementationAllowed === true`.
- Resolve the active feature first.
- In `tasks.md`, either:
  - continue the single `[DOING]` task, or
  - move the next highest-priority `[TODO]` task to `[DOING]`
- Work one task at a time. Do not batch-complete multiple tasks in one pass.
- When `nextAction.executor === "subagent"`, delegate that task's implementation and task-scoped verification to a fresh subagent in `nextAction.workingDirectory` using the returned `model`, `reasoningEffort`, `onUnavailable`, exact `workerContract`, and exact `delegationContext`. Do not reconstruct, omit, or broaden that context. If a requested model is unavailable, `inherit` means retry with the current model inherited and `error` means stop and report the failure.
- The implementation worker executes the assigned task directly. It must not run `workflow-stage`, delegate again, edit lee-spec-kit docs, change task state, commit, request approval, or perform remote/destructive actions. It may edit project code and run task-scoped checks only.
- After delegation, the main agent waits for the worker's terminal outcome. While it remains running, use repeated bounded waits, preferably longer waits; a wait with no update, no status message, or no file change is not evidence of failure or stalled work.
- Do not interrupt, replace, or abandon the running worker solely because it has been quiet or has not changed files. Stop only after an explicit user request, a terminal failure/cancellation, or an unrecoverable runtime status.
- The implementation worker follows the approved `plan.md` Verification Contract: `NONE` adds no durable test, `UPDATE` minimally changes the owning existing test, and `ADD` adds only contract-linked tests. If the approved decision is insufficient, report the gap to the main agent instead of expanding test scope.
- Legacy task lines without an explicit ID receive a stable synthetic `taskId` from `workflow-stage`; use that returned ID without rewriting the legacy task solely to add an ID.

## 2. Execute and record

- Keep `tasks.md` aligned with reality:
  - do not mark `[DONE]` without real completion and verification
  - when `workflow.agentReview.task.enabled=true`, move completed implementation to `[REVIEW]` instead of `[DONE]`, create the checkpoint commit, and run the independent review
  - record the returned `reviewRound`, and move `[REVIEW]` to `[DONE]` after the task reviewer approves the current SHA/tree or the exhausted `changes_requested` path below auto-completes the gate
  - `workflow.agentReview.maxRounds` is the maximum number of fresh task reviews; on `changes_requested` at the final allowed round, apply the findings once, preserve remaining findings and the resulting target change as residual risks, mark the task DONE, and continue without another review or a user review-approval token; with `maxRounds=1`, there is no round 2; never auto-complete `blocked`
  - update `Acceptance` and `Checklist` in the same edit when closing a task
  - if a completed task needs follow-up, add a new task instead of rewriting history
- If you need to add a new task, append a complete task block in `tasks.md` with a concrete title, `Acceptance`, `Checklist`, and `NON-PRD` or existing `PRD-*` tag.
- Do not leave placeholder `Acceptance` or `Checklist` items in newly added tasks.

## 3. Keep docs in sync

Do not close a discovered documentation discrepancy with a decisions.md note alone. For an unambiguous factual error within approved scope, declare UPDATE/ADD and link a task Docs target. If product intent or scope expansion needs confirmation, record the conflicting document paths and evidence, the question to resolve, the deferral reason, and a real follow-up task/Feature/issue reference. Never invent identifiers or approvals. If creating the tracking item needs approval, do not report resolution before user confirmation. Explain in NONE evidence whether no known discrepancy remains or a remaining discrepancy is tracked by that follow-up. Never delete unimplemented PRD requirements merely to match code or OpenWiki.

- `spec.md`: update when user-visible scope or acceptance criteria change
- `plan.md`: update when architecture, file structure, or test strategy changes
- `decisions.md`: record non-obvious decisions, trade-offs, compatibility behavior, and user-requested behavior changes
- If `Pending Change Request` is present, sync `tasks.md` first, then update supporting docs and clear the field before resuming implementation

## 4. Commit and stop guardrails

- Before `git commit`, use `npx lee-spec-kit commit-audit --json` when docs-path validation matters.
- The main agent, never the implementation subagent, owns docs/project commits and the task checkpoint.
- Before stopping, use `npx lee-spec-kit workflow-audit --json` if code or feature docs changed.
- Keep one row per test command in the `tasks.md` test log and update that row on reruns instead of appending duplicates.

## 5. Approval boundaries

- Ask for approval only at documented review checkpoints and before remote or destructive actions.
- Before issue creation, PR creation, push, merge, or similar remote actions, share the exact artifact or plan first.
- Delegate Plan/task/Feature review to the fresh read-only subagent and exact hash/SHA/tree target returned by `workflow-stage`; keep docs updates, finding remediation, approval handling, and remote actions in the main session.

## Strict Rules

1. Do not skip required doc updates.
2. Do not rewrite `[DONE]` tasks.
3. Do not treat unmanaged docs artifacts as active workflow state until they are normalized or allowlisted.
4. Do not start implementation while the workflow is still blocked on issue creation, branch creation, or any earlier stage gate.

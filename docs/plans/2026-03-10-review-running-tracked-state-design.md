# Review Running Tracked State Design

**Goal:** Make `pre-pr-review-run` and `code-review-run` persist official `Running` state in `tasks.md` without re-opening the same approval loop, while keeping CLI workflow transitions coherent.

**Approach:** Replace the temporary runtime-only review-running marker with tracked workflow fields in `tasks.md`.
`pre-pr-review-run` will move `Pre-PR Review` from `Pending` to `Running`. `code-review-run` will use a new tracked `PR Review` field with `Pending | Running | Done`. The step machine must treat these handoff-start transitions as workflow state transitions, not as generic docs changes that immediately force `docs_commit`.

**Key design points**

1. `tasks.md` becomes the SSOT again.
   - `Pre-PR Review`: `Pending | Running | Done`
   - `PR Review`: `Pending | Running | Done`
   - Remove the runtime review-running store entirely.

2. Dirty docs and commit-required docs are separated.
   - `docsHasUncommittedChanges` keeps meaning “git sees docs changes”.
   - Introduce a commit-required signal for docs changes that should block progress.
   - Pure run-state transitions (`Pending -> Running` for pre-PR review / PR review) do not require `docs_commit`.
   - Evidence/decision edits and other docs edits still require `docs_commit`.

3. Step-machine behavior
   - `pre-pr-review-run` command writes `Running`.
   - Context after that moves to `pre_pr_review_running` instead of repeating `pre_pr_review_run`.
   - `code-review-run` command writes `PR Review: Running`.
   - Context after that moves to `code_review_running` instead of repeating `code_review_run`.
   - Recording evidence/decision moves the state forward and returns docs changes to normal commit-required behavior.

4. Handoff semantics from the prior patch remain valid.
   - `handoffOnly`, `advancesWorkflow`, `nextMainState`
   - `approved_handoff_prepared`
   These still correctly describe that the run command starts delegated work but does not finish the full review workflow.

5. Backward compatibility
   - Existing tasks without `PR Review` field should still work via migration/blocking guidance.
   - Template and warnings/messages must be updated to document the tracked `Running` states.

**Why this is preferable**

- Keeps workflow state in one tracked document instead of adding a parallel runtime state source.
- Matches the existing `task-run` pattern more closely.
- Prevents approval-loop repetition without introducing invisible state.
- Makes review progress auditable in `tasks.md`.

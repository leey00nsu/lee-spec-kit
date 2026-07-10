# Auto Step Progression Design

**Goal:** Make CLI auto progression advance workflow steps regardless of whether the current step is owned by the main agent or a delegated subagent, while removing dead handoff metadata that no longer affects runtime behavior.

**Approach:** Fix the actual auto boundaries, not just the substate ownership labels. A delegated `handoffOnly` command should be surfaced as a successful delegated handoff status before the auto loop re-enters the next instruction-only or follow-up state. This prevents auto from downgrading the handoff to `manual_required` or from drifting into unrelated follow-up commands such as docs sync. At the same time, shrink the delegated payload to fields that still matter to the runtime and user-facing orchestration contract.

**Key design points**

1. `auto` means workflow step progression, not main-agent-only execution.
   - The main agent continues to own the overall CLI workflow.
   - `main` vs `subagent` only decides who executes the current step.
   - The real runtime boundary today is not `owner` itself; it is the combination of handoff-prepared results and the generic instruction-only/no-command fallback.
   - Auto progression should stop only at explicit approval, gate, delegated handoff pause, manual instruction boundary, or execution failure.

2. Delegated handoff is a successful intermediate result, not a manual stop reason.
   - `approved_handoff_prepared` should remain visible in execution output.
   - `FlowOrchestrator` should not translate that status into `manual_required`.
   - `FlowOrchestrator` should return a distinct delegated-handoff auto status immediately instead of looping into the next instruction-only running substate.
   - Auto progress summaries should describe delegated handoff as an in-progress auto step, not as an interruption.

3. Task execution remains sequential, and `task_run` must be treated like other delegated run states.
   - No parallel task scheduling is introduced.
   - `task_run` still selects one active or next TODO task at a time.
   - `task_run` currently lacks `handoffOnly` execution metadata in the context executor even though its standalone command emits delegated handoff payload. That inconsistency should be removed.
   - The redesign changes orchestration semantics, not task dependency semantics.

4. Delegated payload should be reduced to meaningful contract fields.
   - Remove `suggestedParallelism`.
   - Remove `fallbackToMainAgentWhenQuotaExceeded`.
   - Keep `handoffOnly`, `reuseKey`, and `nextMainState` for now because they still describe how a delegated step should be continued.
   - Keep review-specific evidence and record hints until review flows are redesigned separately.

5. Auto-run guidance and runtime must agree.
   - User-facing and agent-facing docs should no longer imply that delegated handoff automatically creates a manual boundary.
   - If `auto_run` mode is surfaced, its descriptions should match the new “step progression” meaning.
   - The new delegated-handoff pause should be documented as a distinct state from instruction-only `AUTO_MANUAL_REQUIRED`.

6. Existing workflow state names remain stable in this change.
   - This redesign does not rename task or review states.
   - The focus is on orchestration behavior and handoff contract cleanup.

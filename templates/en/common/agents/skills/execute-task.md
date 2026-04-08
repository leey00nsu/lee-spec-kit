# Task Execution Process: CLI-driven

This document defines the **only rule** for executing tasks.
As an agent, follow `npx lee-spec-kit context` as the single source of truth.

---

## 🔄 The Loop (repeat forever)

Repeat this loop until the Feature is complete.

### Step 1: Check context

```bash
npx lee-spec-kit context
```

### Step 2: Do the next action only

Execute exactly one option from `👉 Next Options (Atomic)` as printed by the CLI.

- If the CLI points to an active task, focus on that task only.
- Treat task state transitions in `tasks.md` **"Task Rules"** as SSOT.
- Treat `approvalRequest.required` from `context --json-compact` as SSOT for approval waiting (`--json` only when full-detail debugging fields are required).
  - `false`: continue without label approval.
  - `true`: wait for label-token approval (`A`, `A OK`) before execution.
- Default execution model is **main-agent orchestration + sub-agent-first execution for sub-agent-owned run states**. Use `matchedFeature.currentSubstateId/currentSubstateOwner/currentSubstatePhase` from `context --json-compact` as the execution-state SSOT when present.
- Main agent owns approval boundaries, state transitions, record/commit steps, and remote operations. Sub-agent execution is the default for command substates owned by `subagent` (for example `task_run`, `pre_pr_review_run`, `code_review_run`, and auto-run handoff commands).
- `pre_pr_review` is split into `pre_pr_review_run` (sub-agent review execution) and `pre_pr_review_record` (main-agent recording of evidence/results).
- PR review follows the same pattern: `code_review_run` is the sub-agent review/fix execution state, and the merge/push/final decision stays in the main-agent finalize state.
- Prefer `matchedFeature.currentSubstateOwner` plus `agentOrchestration.subAgentHandoff` as the delegation SSOT.
- When `matchedFeature.currentSubstateOwner="subagent"` and `agentOrchestration.subAgentHandoff.required=true` with `mode="command"`, delegation is mandatory: call `spawn_agent` first and do not execute the command directly from the main agent.
- Do not delegate auto loops from `autoRun.available` alone. Delegate auto loops only when `agentOrchestration.subAgentHandoff.required=true` and `agentOrchestration.subAgentHandoff.mode="auto_run"`.
- Use `agentOrchestration.subAgentHandoff` as the minimal handoff contract (`featureRef`, `category`, `cwd`, `cmd`).
- If an action option exposes `handoffOnly=true` and `advancesWorkflow=false`, do not treat `--execute` success as workflow progress. Finish the delegated work and update the required evidence/state before running `context` again.
- Run `subAgentHandoff.verify.commands` only once per session using `verify.cacheKey` (`pwd`, `git rev-parse --show-toplevel`). Stop/report on mismatch, and gather detailed logs only when mismatch happens.
- Main-agent fallback is allowed only when sub-agent execution is unavailable (for example: tool not available, spawn failed, or sub-agent failed before command execution). Before fallback execution, report a one-line fallback reason to the user.
- Use `autoRun.command` only when `context --json-compact` exposes `autoRun.available=true`.
- If `autoRun.policyEligible=true` but `autoRun.executableNow=false`, handle `autoRun.manualBoundary` first instead of starting an auto loop.
- For long-running auto execution, start with `flow <feature> --auto-... --start-auto --json-compact` and prefer `autoRun.run.resumeCommand` (`flow --resume <RUN_ID>`) after interruption/compression (`--json` only when full-detail debugging fields are required).
- If auto execution stops, treat `autoRun.resume` from `flow --json-compact` (or `flow --json`) as SSOT. After interruption/compression, resume with `autoRun.resume.flowCommand`; if needed, check current state first with `autoRun.resume.contextCommand`.
- Treat `AUTO_DELEGATED_HANDOFF` as a delegated pause, not a crash. Reuse the delegated run path and continue the delegated work before asking for a fresh approval label.
- Treat `AUTO_MANUAL_REQUIRED` as an automation boundary (instruction-only segment), not an immediate crash. Re-check `context --json-compact` and report whether `approvalRequest.required` is now true.
- Treat `AUTO_SELECTION_REQUIRED` as a feature-selection pause, not a crash. Resolve the active feature first, then rerun `context --json-compact` or `flow`.
- If `matchedFeature.currentSubstateId === "change_request_sync"` or `matchedFeature.pendingChangeRequest` is present, sync docs before more code work: update `tasks.md` first, add or retag the affected task, and if shipped behavior or scope changed, sync `decisions.md` plus `spec.md` / PRD refs as needed. Clear `Pending Change Request` after syncing, then rerun `context --json-compact` or `flow`.
- If the CLI prints commands, copy/paste them. (In standalone setups commands may include `git -C ...` and scopes like `project`/`docs`.)
- Follow `agents.md` **"Label Response Contract (SSOT)"**. Show label prompts only in approval-waiting state, and reuse the exact CLI-provided approval lines instead of paraphrasing them.
- For non-delegated command options, default to `npx lee-spec-kit flow <slug|F001|F001-slug> --approve <LABEL> --execute` and avoid split `context --approve` / `context --execute --ticket` runs across turns.
- If the current command is delegated (`matchedFeature.currentSubstateOwner="subagent"` and `agentOrchestration.subAgentHandoff.required=true` with `mode="command"`), call `spawn_agent` first and pass the handoff contract instead of executing that command from the main agent.
- If `flow/context --execute --json` returns `approved_handoff_prepared`, stop re-approving the same label. Complete the delegated work first, then refresh context.

### Step 3: Update tasks.md (only what you did)

Keep `tasks.md` aligned with reality.

- Do not mark `[DONE]` without actually completing the work and verifying criteria.
- If you need to change a completed task, add a new task instead of rewriting history.
- If you need to add a new task, prefer `npx lee-spec-kit task add <feature-ref> --title "..." --ref NON-PRD|PRD-FR-001`. Add `--acceptance` and `--check` inline when you already know the concrete items.
- Do not leave placeholder `Acceptance` / `Checklist` items in a newly added task. `task-run` will block until those fields contain concrete execution/verification items.
- If manual editing is unavoidable, append the new task directly below the last existing task block in the `Task List` section.
- Do not insert it near the current task or right before `Completion Criteria` / the next `##` heading.
- When handling a mid-implementation user change request, treat `Pending Change Request` as a temporary sync marker: reflect the request in `tasks.md`, sync supporting docs if the behavior/scope changed, then clear that field before resuming implementation.

### Step 3.25: Record decisions (strongly recommended, effectively required)

To avoid “why did we implement it like this?” losing context, **record any non-obvious or tradeoff-heavy implementation choice** in `decisions.md`.

Record a decision if any of these apply:

- There was a tradeoff (performance / reliability / security / maintainability)
- You introduced a new rule/heuristic/state transition (e.g., context detection logic, exception criteria)
- The user asked “why did you do it this way?” (requested rationale/justification)
- The user explicitly asked to change behavior (requirements/policy/criteria changes)
- You changed behavior for compatibility or as a workaround
- You changed data shape, file structure, or CLI output rules
- You expect future readers to ask “why this way?”

Timing rules:

- When moving a task to `[DOING]`, first add 1-3 lines for `Context/Constraints` and `Trace (initial hypothesis)`.
- Before moving a task to `[DONE]`, finalize `Options/Decision/Rationale` and strengthen `Trace (final reasoning)`.
- After PR merge, append 1-2 lines in `Trace (post-merge check)` with actual outcome/impact.

Evidence rules:

- Every ADR must include at least one Evidence link (commit, PR, or test/log evidence).
- Prefer filling all three (`Commit`, `PR`, `Test/Log`); if not applicable, mark as `N/A`.

Use the feature’s `decisions.md` template format as final SSOT. (Context/Constraints/Options/Decision/Rationale/Trace/Evidence/Consequences)

### Step 3.5: Commit per task (important)

- Complete **only one task at a time** (do not batch-finish multiple tasks in one commit).
- After you share the outcome/verification, mark the task `[DONE]` and update the task-local checklist items in the same edit. `task-complete` will reject `[DONE]` if unchecked checklist boxes remain. If approval is required (`approvalRequest.required=true`), reuse the exact CLI-provided approval lines and wait for a `<LABEL>` or `<LABEL> OK` reply first. If approval is not required, do not invent a separate approval prompt before marking `[DONE]`.
- In `tasks.md` test logs, keep one entry per test command and update its date/result on reruns (do not keep appending duplicates). Use `YYYY-MM-DD` in local date.
- If `context` shows `[CHECK required]`, for commits/push/merge, **share the commit message + included files and wait for the latest CLI-provided label reply** before running the commands.
- Once all tasks are `[DONE]`, share the "Completion Criteria" checklist with the user. If that point is approval-waiting, get a `<LABEL>` or `<LABEL> OK` reply before checking it; otherwise get a normal confirmation reply. (especially the final outcome/user confirmation item).
  - Note: both progress approval and final approval must follow the current `approvalRequest.required` state. When approval is label-gated, always use label replies instead of standalone `OK` as the approval token.

### Step 4: Repeat

After finishing a meaningful chunk of work, run `context` again.

---

## 🛑 Strict rules

1. **No skipping**: Never “finish” tasks by editing status only.
2. **No jumping ahead**: If the CLI is waiting for approvals, stop and ask the user.
3. **No rewriting history**: Do not modify `[DONE]` tasks; add a new one.

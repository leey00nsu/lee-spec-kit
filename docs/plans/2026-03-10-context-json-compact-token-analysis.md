# `context --json-compact` Token Analysis Report

Date: 2026-03-10

## Goal

Analyze:

1. How often agents end up calling `context --json-compact` while moving one feature through the workflow
2. Which fields are actually needed in that hot path
3. Which fields are being sent repeatedly even though they are static, derivable, compatibility-only, or debug-oriented

This report focuses on the current CLI behavior and agent guidance, not on a proposed new schema yet.

## Scope And Evidence

- Agent loop guidance:
  - `templates/en/common/agents/skills/execute-task.md`
  - `templates/ko/common/agents/skills/execute-task.md`
  - `src/utils/agents-md.ts`
- Workflow orchestration:
  - `src/commands/flow.ts`
  - `src/services/FlowOrchestrator.ts`
- Step/substate model:
  - `src/utils/context/steps.ts`
  - `src/utils/context/progress.ts`
- Compact payload assembly:
  - `src/commands/context.ts`
  - `src/services/ContextPresenter.ts`

## Executive Summary

- `context --json-compact` is in the hottest path of the agent workflow by design.
- The current agent guidance effectively creates a `check context -> do one thing -> check context again` loop, so call count scales with step transitions, not with feature count alone.
- For a realistic default GitHub workflow feature with one task, the agent-facing `context --json-compact` call count is roughly `22-26`, with `24` as the representative midpoint.
- For a local workflow feature with one task, the count is roughly `11-13`, with `12` as the representative midpoint.
- In a measured sample payload, current pretty output was about `8.9 KB`; the same payload minified was about `7.2 KB`.
- Low-risk always-on redundancy inside the payload itself accounts for about `2.2 KB` more per call in the sampled state.
- Combined opportunity in the sampled state is about `4.0 KB` per call, or roughly `45%` versus the current pretty compact output.

## Why Call Count Is High

### 1. Agent instructions make `context` the SSOT loop

The task execution guide says:

- Start by running `context`
- Do exactly one next action
- After a meaningful chunk, run `context` again

That means the default control loop is:

1. `context --json-compact`
2. Execute one atomic action
3. `context --json-compact`
4. Repeat

This is the main reason token pressure accumulates.

### 2. Calls scale with state transitions, especially substates

`src/utils/context/steps.ts` defines 15 top-level steps, but several steps are split into substates:

- Step 10: `task_blocked`, `task_finalize`, `task_complete`, `task_commit_pending`, `task_run`
- Step 11: `post_task_sync_docs`, `review_fix_loop`, `post_task_sync_project`
- Step 12: `pre_pr_review_migrate`, `pre_pr_fix_required`, `pre_pr_review_run`, `pre_pr_review_record`
- Step 13: `pr_create_metadata_missing`, `pr_create_doc_missing`, `pr_create_ready`, `pr_create_prepare`
- Step 14: `code_review_status_missing`, `code_review_sync_approved`, `code_review_need_*`, `code_review_run`, `code_review_finalize`, `code_review_request_review`

So one top-level step can easily consume multiple `context` calls.

### 3. `flow` reduces some manual orchestration, but not the need for state refreshes

`flow` itself resolves context before and after execution in `src/commands/flow.ts`:

- before snapshot: lines 291-296
- after snapshot: lines 372-376

`runAutoUntilCategory()` in `src/services/FlowOrchestrator.ts` also resolves context once per iteration:

- loop resolve: lines 416-430
- extra context call at gate to fetch approval lines: lines 565-595

So even when users move to `flow`, the system still repeatedly pays for context evaluation and often still guides the agent back to `context --json-compact` at manual boundaries.

## Estimated `context --json-compact` Calls Per Feature

### Modeling Rule

For the agent-facing loop, call count is approximately:

`1 initial call + 1 call after each meaningful state transition`

That is equivalent to:

`number of distinct workflow states the agent visits`

### Scenario A: Local Workflow, 1 Task

Representative state sequence:

1. Step 2 `spec_write`
2. Step 3 `spec_approve`
3. Step 4 `plan_write`
4. Step 5 `plan_approve`
5. Step 6 `tasks_write`
6. Step 6 `tasks_approve`
7. Step 7 `docs_commit`
8. Step 10 `task_run`
9. Step 10 `task_complete`
10. Step 11 `post_task_sync_docs`
11. Step 11 `post_task_sync_project`
12. Step 15 `feature_done`

Representative count: `12`

Range:

- `11` if one sync state is skipped
- `13` if finalize/checklist handling adds one more refresh

### Scenario B: Default GitHub Workflow, 1 Task

Representative state sequence:

1. Step 2 `spec_write`
2. Step 3 `spec_approve`
3. Step 4 `plan_write`
4. Step 5 `plan_approve`
5. Step 6 `tasks_write`
6. Step 6 `tasks_approve`
7. Step 7 `docs_commit`
8. Step 8 `issue_create_prepare`
9. Step 8 `issue_create_execute`
10. Step 9 `branch_create`
11. Step 10 `task_run`
12. Step 10 `task_complete`
13. Step 11 `post_task_sync_docs`
14. Step 11 `post_task_sync_project`
15. Step 12 `pre_pr_review_run`
16. Step 12 `pre_pr_review_record`
17. Step 11 `post_task_sync_docs` after review recording
18. Step 13 `pr_create_prepare`
19. Step 13 `pr_create_ready`
20. Step 14 `code_review_status_missing`
21. Step 14 `code_review_run`
22. Step 14 `code_review_finalize`
23. Step 14 `code_review_sync_approved`
24. Step 15 `feature_done`

Representative count: `24`

Range:

- `22` if some preparation/sync states collapse
- `26` if one extra sync/manual status state appears

### Scenario C: Default GitHub Workflow, N Tasks

The fixed overhead is the pre-task and post-task workflow states.

Common per-task loop cost, when each task creates both docs and project dirtiness:

1. `task_run`
2. `task_complete`
3. docs sync / docs commit state
4. project sync / project commit state

That means:

- Additional cost per extra task is about `+4` context calls

Representative formula:

- Local workflow: about `8 + 4N`
- Default GitHub workflow: about `20 + 4N`

Examples:

- GitHub, `1` task: about `24`
- GitHub, `3` tasks: about `32`
- GitHub, `5` tasks: about `40`

These are realistic hot-path numbers, not worst-case numbers. Review-fix loops or blocked substates can push them higher.

## Measured Payload Size In A Sample State

Sample method:

- Create temp single-project repo
- `init`
- `feature alpha --id F001`
- `context F001-alpha --json-compact`

Measured result in that sampled state:

- Current pretty compact payload: about `8,943 bytes`
- Same payload minified: about `7,159 bytes`
- Whitespace-only loss: about `1,788 bytes` per call, about `20%`

Top payload contributors in the sampled state:

- `matchedFeature`: `1,412 bytes`
- `agentOrchestration`: `1,356 bytes`
- `checkPolicy`: `1,010 bytes`
- `actionOptions`: `980 bytes`
- `approvalRequest`: `716 bytes`

Those five alone account for most of the payload.

## What The Agent Actually Needs On The Hot Path

Based on `execute-task.md`, `agents-md`, `flow`, and auto-run orchestration, the agent needs the following on most normal single-feature calls:

### Always Needed In The Single-Matched Loop

- `status`
- `reasonCode`
- `contextVersion`
- `matchedFeature.ref`
- `matchedFeature.currentStep`
- `matchedFeature.currentSubstateId`
- `matchedFeature.currentSubstateOwner`
- `matchedFeature.currentSubstatePhase`
- `actionOptions[]`
  - `label`
  - `detail`
  - `actionType`
  - `category`
  - `operationType`
  - `requiresUserCheck`
  - `taskExecutePhase` when present
  - command actions: `scope`, `cwd`, `cmd`
  - instruction actions: `message`
- `approvalRequest.required`
- `approvalRequest.finalPrompt`
- `approvalRequest.userFacingLines` in approval-waiting states
- `requiredDocs`
- `autoRun.available`
- `autoRun.reasonCode`
- `autoRun.command`
- `autoRun.untilCategories`
- `agentOrchestration.subAgentHandoff`

### Needed Only In Specific States

- `candidateRefs` and selection lists:
  - only for `multiple_active`, `no_match`, or open listing modes
- `suggestionOptions` / `suggestionRequest`:
  - only when there is no actionable feature state
- `warnings`:
  - only when the agent plans to surface warnings or debug odd behavior
- `matchedFeature.git` / `matchedFeature.docs` / `matchedFeature.pr*`:
  - useful for debugging, audits, or special logic
  - not needed for the basic next-action loop if `actionOptions` is already accurate
- `prPolicy.screenshots.upload`:
  - only relevant around PR creation/reporting

## What Is Repeatedly Sent But Usually Not Needed

### 1. Pretty-printed whitespace

Current `--json-compact` still uses pretty JSON output in `src/commands/context.ts`.

Impact in sampled state:

- about `1.8 KB` wasted every call

This is the lowest-risk win because it does not change the information model.

### 2. Static approval metadata in `checkPolicy`

Repeated every call:

- `acceptedTokens`
- `tokenPattern`
- `knownCategories`
- `categoryPolicyGuidance`
- `config`

In the sampled state, pruning this group saved about `661 bytes`.

Most of this is static or changes only when config changes. It does not need to be paid on every loop iteration.

### 3. Compatibility-heavy `agentOrchestration` fields

Current docs already mark some fields as compatibility metadata, not SSOT:

- `delegateCommandExecution`
- `longRunningCategories`
- `currentActionShouldDelegate`

The agent SSOT is explicitly:

- `matchedFeature.currentSubstateOwner`
- `agentOrchestration.subAgentHandoff`

In the sampled state, pruning the compatibility-heavy group saved about `994 bytes`.

### 4. Prompt duplication across `actionOptions` and `approvalRequest`

In the sampled state:

- `summary === detail`
- `approvalPrompt === "${label}: ${detail}"`
- `approvalRequest.labels` is derivable from `actionOptions[].label`
- `approvalRequest.userFacingLines` is derivable from `actionOptions[].approvalPrompt + finalPrompt`

Pruning this duplication in the sample saved about `562 bytes`.

### 5. Oversized `matchedFeature` for the common loop

The common loop usually only needs:

- identity
- current step
- substate owner/phase
- maybe minimal progress/checkpoint fields

But the compact payload currently includes:

- absolute `path`
- full `git` object
- full `docs` object
- `pr`, `prePrReview`, `prReview`
- full `completion`
- `nextAction`

In the sampled state, slimming `matchedFeature` to the minimal loop subset saved about `1,145 bytes`.

This is the largest single semantic reduction target, but also the one that needs the most care because some tests and secondary automation do read these fields.

### 6. Policy mirrors that action options already encode

Top-level fields like:

- `workflowPolicy`
- `prePrReviewPolicy`
- `taskCommitGatePolicy`
- `prPolicy`

are not the primary execution contract for the next-action loop. The real execution contract is already expressed in:

- current step/substate
- action options
- approval requirement
- required docs
- auto-run availability

In the sampled state, pruning the policy-mirror group saved about `627 bytes`.

## Aggregate Savings Model

Measured from the sample payload:

- Minify-only saving: about `1,788 bytes` per call
- Low-risk field reduction inside the payload: about `2,217 bytes` per call
- Combined saving versus current pretty compact output: about `4,005 bytes` per call

That is about `45%` in the sampled state.

## Cumulative Cost By Scenario

Using the representative call counts:

### Local Workflow, 1 Task

- Calls: about `12`
- Current pretty payload total: about `104.8 KB`
- Avoidable with combined reduction: about `46.9 KB`
- Rough token equivalent saved: about `12k` tokens

### Default GitHub Workflow, 1 Task

- Calls: about `24`
- Current pretty payload total: about `209.6 KB`
- Avoidable with combined reduction: about `93.9 KB`
- Rough token equivalent saved: about `24k` tokens

### Default GitHub Workflow, 3 Tasks

- Calls: about `32`
- Current pretty payload total: about `279.5 KB`
- Avoidable with combined reduction: about `125.2 KB`
- Rough token equivalent saved: about `32k` tokens

### Default GitHub Workflow, 5 Tasks

- Calls: about `40`
- Current pretty payload total: about `349.3 KB`
- Avoidable with combined reduction: about `156.4 KB`
- Rough token equivalent saved: about `40k` tokens

These token numbers are rough byte-to-token estimates for prioritization, not tokenizer-exact measurements.

## Conclusion

The current problem is real and structural:

- `context --json-compact` sits in the hottest agent loop
- step/substate design multiplies call count
- the compact payload still contains a large amount of repeated, compatibility, or debug metadata

The strongest conclusions are:

1. `--json-compact` should stop paying pretty-print whitespace cost
2. Static approval metadata should stop being sent on every loop
3. Compatibility-only orchestration fields should not be in the hottest default payload
4. Prompt duplication should be reduced
5. `matchedFeature` should be split into:
   - minimal hot-path state
   - optional debug/detail state

## Recommended Next Step

Before changing code, define a stricter contract for the hot-path `context --json-compact` payload:

- Keep only fields needed for the single-feature next-action loop
- Move debug/static/compatibility-heavy fields behind:
  - conditional emission, or
  - a detail/debug mode, or
  - a separate schema version

The current measurements indicate that optimizing `context --json-compact` directly is justified, even without changing the overall workflow model.

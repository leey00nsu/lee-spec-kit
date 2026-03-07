# Steps Substate State Machine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the existing top-level `steps` workflow visible to users while making the internal execution model a stricter substate-based state machine with explicit main-agent vs sub-agent ownership.

**Architecture:** Extend the current `StepDefinition` model so each top-level step resolves one explicit `substate`, then drive approvals, delegation, and action rendering from that resolved state instead of inferring behavior from broad categories such as `task_execute`. Migrate the workflow incrementally, starting with Step 10-14 because those steps already mix execution, review, commit, and handoff concerns.

**Tech Stack:** TypeScript, Node.js CLI, Vitest, existing `context` / `flow` / `steps` workflow services

---

### Task 1: Introduce generic step substate types

**Files:**
- Modify: `src/utils/context/types.ts`
- Test: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-execute-gates.test.mjs`

**Step 1: Write the failing test expectations for new state metadata**

Add assertions in existing context tests that future payloads can expose:

```js
assert.equal(typeof payload.currentSubstateId, 'string');
assert.equal(typeof payload.currentSubstateOwner, 'string');
assert.equal(typeof payload.currentSubstatePhase, 'string');
```

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: FAIL because the current payload does not expose substate metadata yet.

**Step 3: Add the new shared types**

In `src/utils/context/types.ts`, add:

```ts
export type StepOwner = 'main' | 'subagent';
export type StepMode = 'command' | 'instruction' | 'remote';
export type StepPhase =
  | 'ready'
  | 'run'
  | 'running'
  | 'finalize'
  | 'record'
  | 'commit_pending'
  | 'blocked'
  | 'done';

export interface StepSubstate {
  id: string;
  phase: StepPhase;
  owner: StepOwner;
  mode: StepMode;
  category: ActionCategory;
  when: (feature: FeatureState) => boolean;
  actions: (feature: FeatureState) => NextAction[];
}
```

Then update `StepDefinition` to replace `current` with:

```ts
substates?: StepSubstate[];
```

Also add resolved context fields for:

```ts
currentSubstateId?: string;
currentSubstateOwner?: StepOwner;
currentSubstatePhase?: StepPhase;
```

**Step 4: Run the same tests again**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: still FAIL, but now due to missing resolver/presenter wiring instead of missing types.

**Step 5: Commit**

```bash
git add src/utils/context/types.ts tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
git commit -m "refactor: add step substate types"
```

### Task 2: Teach progress resolution to return an explicit substate

**Files:**
- Modify: `src/utils/context/progress.ts`
- Modify: `src/utils/context/parse.ts`
- Modify: `src/utils/context/index.ts`
- Test: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-execute-gates.test.mjs`

**Step 1: Write the failing resolver expectations**

Add assertions for cases that should map to distinct substates:

```js
assert.equal(payload.currentSubstateId, 'task_run');
assert.equal(payload.currentSubstateOwner, 'subagent');
assert.equal(payload.currentSubstatePhase, 'run');
```

and

```js
assert.equal(payload.currentSubstateId, 'task_commit_pending');
assert.equal(payload.currentSubstateOwner, 'main');
assert.equal(payload.currentSubstatePhase, 'commit_pending');
```

**Step 2: Run tests to confirm failure**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: FAIL because `resolveFeatureProgress()` only returns `currentStep`, `actions`, and `nextAction`.

**Step 3: Refactor the resolver**

Change `resolveFeatureProgress()` in `src/utils/context/progress.ts` to:

- iterate `definition.substates`
- pick the first matching substate
- return the resolved substate metadata along with actions
- keep backward compatibility for `currentStep` and `nextAction`

Target return shape:

```ts
{
  currentStep,
  currentSubstateId,
  currentSubstateOwner,
  currentSubstatePhase,
  actions,
  nextAction,
}
```

Then thread those fields through `src/utils/context/parse.ts` and `src/utils/context/index.ts`.

**Step 4: Run tests to verify pass**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: PASS for new substate metadata assertions that rely on resolver output.

**Step 5: Commit**

```bash
git add src/utils/context/progress.ts src/utils/context/parse.ts src/utils/context/index.ts tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
git commit -m "refactor: resolve explicit step substates"
```

### Task 3: Convert Step 10 task execution into substates

**Files:**
- Modify: `src/utils/context/steps.ts`
- Modify: `src/commands/task-run.ts`
- Modify: `src/utils/locales/en/context.ts`
- Modify: `src/utils/locales/ko/context.ts`
- Test: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-execute-gates.test.mjs`

**Step 1: Write failing tests for Step 10 transitions**

Cover these cases:

```js
assert.equal(payload.currentSubstateId, 'task_run');
assert.equal(payload.currentSubstateId, 'task_running');
assert.equal(payload.currentSubstateId, 'task_finalize');
assert.equal(payload.currentSubstateId, 'task_commit_pending');
assert.equal(payload.currentSubstateId, 'task_blocked');
```

**Step 2: Run tests to confirm failure**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: FAIL because Step 10 is still implemented as a single `current.actions()` branch.

**Step 3: Replace Step 10 `current` with explicit substates**

In `src/utils/context/steps.ts`, model Step 10 with substates:

- `task_blocked`
- `task_run`
- `task_running`
- `task_finalize`
- `task_commit_pending`
- `task_ready_fallback`

Rules:

- `task_run`: next TODO task, clean docs/project, delegate via `task-run`
- `task_running`: active task exists, delegate via `task-run`
- `task_finalize`: all task items done or sub-agent completed execution, main agent checks checklist/status transitions
- `task_commit_pending`: docs/project dirty after task progress
- `task_blocked`: worktree gate, project root missing, strict commit gate failure

Keep top-level step number and step name unchanged.

**Step 4: Keep `task-run` aligned with the new model**

Update `src/commands/task-run.ts` so the command output clearly states:

```txt
substate: task_run
owner: subagent
next main state: task_finalize
```

This can be plain text in human output and explicit fields in JSON output.

**Step 5: Run tests to verify pass**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: PASS for task execution state transition coverage.

**Step 6: Commit**

```bash
git add src/utils/context/steps.ts src/commands/task-run.ts src/utils/locales/en/context.ts src/utils/locales/ko/context.ts tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
git commit -m "refactor: model task execution as substates"
```

### Task 4: Convert Step 11-14 into explicit review and sync substates

**Files:**
- Modify: `src/utils/context/steps.ts`
- Modify: `src/commands/pre-pr-review.ts`
- Modify: `src/utils/context-selection.ts`
- Modify: `src/utils/locales/en/context.ts`
- Modify: `src/utils/locales/ko/context.ts`
- Test: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-execute-gates.test.mjs`

**Step 1: Write failing tests for later-step substates**

Add assertions for:

```js
assert.equal(payload.currentSubstateId, 'post_task_sync_docs');
assert.equal(payload.currentSubstateId, 'post_task_sync_project');
assert.equal(payload.currentSubstateId, 'pre_pr_review_run');
assert.equal(payload.currentSubstateId, 'pre_pr_review_record');
assert.equal(payload.currentSubstateId, 'pre_pr_fix_required');
assert.equal(payload.currentSubstateId, 'code_review_run');
assert.equal(payload.currentSubstateId, 'review_fix_loop');
```

**Step 2: Run tests to verify failure**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: FAIL because Step 11-14 are not yet substate-driven.

**Step 3: Rework Step 11-14 definitions**

In `src/utils/context/steps.ts`:

- Step 11
  - `post_task_sync_docs`
  - `post_task_sync_project`
- Step 12
  - `pre_pr_review_run`
  - `pre_pr_review_record`
  - `pre_pr_fix_required`
  - `pre_pr_done`
- Step 13
  - `pr_doc_prepare`
  - `pr_create_ready`
  - `pr_created`
- Step 14
  - `code_review_run`
  - `review_fix_loop`
  - `merge_ready`

Keep current user-facing step numbering unchanged.

**Step 4: Update UI details to surface substate meaning**

Adjust `src/utils/context-selection.ts` and locale strings so the detail line can show a clearer meaning for the active substate without changing top-level step numbering.

**Step 5: Run tests**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: PASS for pre-PR and later-step state transitions.

**Step 6: Commit**

```bash
git add src/utils/context/steps.ts src/commands/pre-pr-review.ts src/utils/context-selection.ts src/utils/locales/en/context.ts src/utils/locales/ko/context.ts tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
git commit -m "refactor: add explicit review and sync substates"
```

### Task 5: Move delegation rules from category-based to owner-based

**Files:**
- Modify: `src/services/ContextPresenter.ts`
- Modify: `src/services/FlowFormatters.ts`
- Modify: `src/utils/context-selection.ts`
- Test: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-execute-gates.test.mjs`

**Step 1: Write failing delegation assertions**

Add expectations like:

```js
assert.equal(payload.agentOrchestration.currentActionShouldDelegate, true);
assert.equal(payload.currentSubstateOwner, 'subagent');
```

and

```js
assert.equal(payload.agentOrchestration.currentActionShouldDelegate, false);
assert.equal(payload.currentSubstateOwner, 'main');
```

**Step 2: Run tests to verify failure**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: FAIL because delegation is still driven by `LONG_RUNNING_DELEGATION_CATEGORIES`.

**Step 3: Refactor the delegation policy**

In `src/services/ContextPresenter.ts` and `src/services/FlowFormatters.ts`:

- keep categories as reporting data only
- derive delegation from resolved substate owner
- still keep hard exceptions for:
  - remote commands
  - main-only commit/record operations

Target rule:

```ts
shouldDelegate =
  currentSubstateOwner === 'subagent' &&
  primaryAction.type === 'command' &&
  primaryAction.operationType !== 'remote';
```

**Step 4: Run tests**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: PASS for delegation behavior tied to ownership instead of category lists.

**Step 5: Commit**

```bash
git add src/services/ContextPresenter.ts src/services/FlowFormatters.ts src/utils/context-selection.ts tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
git commit -m "refactor: drive delegation from step owner"
```

### Task 6: Make approval and flow logic substate-aware

**Files:**
- Modify: `src/utils/context/progress.ts`
- Modify: `src/services/FlowOrchestrator.ts`
- Modify: `src/commands/context.ts`
- Test: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-execute-gates.test.mjs`

**Step 1: Write failing approval-flow assertions**

Add expectations that `start_only` or category-based approval behavior can distinguish:

```js
assert.equal(payload.currentSubstatePhase, 'run');
assert.equal(primaryActionOption(payload).action.requiresUserCheck, true);
```

and:

```js
assert.equal(payload.currentSubstatePhase, 'finalize');
assert.equal(primaryActionOption(payload).action.requiresUserCheck, false);
```

Adjust the exact expectation only after finalizing the policy, but make the tests describe substate-aware approval behavior rather than `taskExecutePhase` only.

**Step 2: Run tests to verify failure**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: FAIL because approval logic only understands `taskExecutePhase`.

**Step 3: Generalize approval policy**

In `src/utils/context/progress.ts`, replace the special-case `taskExecutePhase` logic with generic substate-aware handling:

- preserve compatibility for older actions during migration
- prefer `currentSubstatePhase`
- allow future config to target substate IDs or phases

In `src/services/FlowOrchestrator.ts` and `src/commands/context.ts`, expose the resolved substate metadata in JSON/compact output.

**Step 4: Run tests**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected: PASS for approval and flow behavior with explicit substates.

**Step 5: Commit**

```bash
git add src/utils/context/progress.ts src/services/FlowOrchestrator.ts src/commands/context.ts tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
git commit -m "refactor: make flow and approvals substate-aware"
```

### Task 7: Add end-to-end regression coverage and clean up compatibility shims

**Files:**
- Modify: `tests/cli-context-approval.test.mjs`
- Modify: `tests/cli-context-execute-gates.test.mjs`
- Modify: `tests/cli-context-scope-split.test.mjs`
- Modify: `src/utils/context/types.ts`
- Modify: `src/utils/context/progress.ts`

**Step 1: Add end-to-end regression cases**

Cover at least:

- clean TODO task enters `task_run`
- DOING task enters `task_running`
- dirty docs enters `task_commit_pending`
- evidence missing enters `pre_pr_review_run`
- evidence present enters `pre_pr_review_record`
- post-review fix loop enters `review_fix_loop`
- no regression to top-level step numbering

**Step 2: Run the focused suite**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs tests/cli-context-scope-split.test.mjs
```

Expected: PASS for the focused context workflow suite.

**Step 3: Remove obsolete compatibility shims**

If all call sites are migrated:

- remove `taskExecutePhase`
- remove category-only delegation fallbacks that are no longer needed

Only do this after tests are green.

**Step 4: Run the full suite**

Run:

```bash
pnpm test -- --runInBand
```

Expected: PASS for the full repository test suite.

**Step 5: Commit**

```bash
git add tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs tests/cli-context-scope-split.test.mjs src/utils/context/types.ts src/utils/context/progress.ts
git commit -m "test: cover substate workflow transitions"
```

### Task 8: Final verification and developer-facing documentation

**Files:**
- Modify: `src/utils/context-selection.ts`
- Modify: `src/services/ContextPresenter.ts`
- Modify: `docs/plans/2026-03-07-steps-substate-state-machine.md`

**Step 1: Verify user-facing output remains stable**

Check that top-level step numbering still reads as before while substate detail is clearer.

Run:

```bash
node dist/index.js context --json-compact
```

Expected: `currentStep` remains the same top-level number, and substate metadata appears as additional detail instead of replacing step numbering.

**Step 2: Verify delegation output**

Run:

```bash
node dist/index.js context --json
```

Expected: `agentOrchestration.currentActionShouldDelegate` aligns with `currentSubstateOwner === 'subagent'`.

**Step 3: Document any follow-up gaps**

If any temporary backward-compatibility fields remain, add a short note to this plan file describing:

- which shims remain
- why they remain
- when they should be removed

Current rollout notes:

- `taskExecutePhase` remains as a compatibility shim for older approval/test paths while substate-aware approval is rolling out.
- `longRunningCategories` remains in orchestration metadata as a legacy reporting field, even though context-side command delegation now prefers `currentSubstateOwner`.
- Flow auto-run handoff is still resume-command based; it has not been redesigned into a full owner-driven state machine yet.

**Step 4: Final commit**

```bash
git add src/utils/context-selection.ts src/services/ContextPresenter.ts docs/plans/2026-03-07-steps-substate-state-machine.md
git commit -m "docs: finalize substate state machine rollout notes"
```

Plan complete and saved to `docs/plans/2026-03-07-steps-substate-state-machine.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**

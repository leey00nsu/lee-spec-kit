# Context Json Compact Hot-Path Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Shrink `context --json-compact` to a hot-path agent payload without changing workflow logic or human-facing CLI behavior.

**Architecture:** Keep `resolveContextSelection()` and the workflow state machine unchanged. Only rewrite the compact payload contract in `src/commands/context.ts` and `src/services/ContextPresenter.ts`, then update compact-specific tests and docs to match the new schema.

**Tech Stack:** TypeScript, Commander CLI, Vitest, existing context/flow services

---

### Task 1: Lock The New Compact Contract In Tests

**Files:**
- Modify: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-approval.test.mjs`

**Step 1: Write the failing test updates**

Update compact JSON assertions so they require only the new hot-path fields and explicitly assert removed fields are absent.

Focus cases:

- compact reply metadata test near `context --json-compact action options include reply metadata`
- compact substate metadata test near `context --json-compact preserves substate metadata for substate-backed steps`

Add assertions such as:

```js
assert.equal(payload.schema, 'context.v3.compact');
assert.equal(typeof payload.matchedFeature.ref, 'string');
assert.equal(payload.actionOptions[0].summary, undefined);
assert.equal(payload.actionOptions[0].approvalPrompt, undefined);
assert.equal(payload.checkPolicy.knownCategories, undefined);
assert.equal(payload.agentOrchestration.currentActionShouldDelegate, undefined);
```

**Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs
```

Expected:

- FAIL on schema and removed-field assertions

**Step 3: Commit the failing test checkpoint**

```bash
git add tests/cli-context-approval.test.mjs
git commit -m "test: redefine compact context payload contract"
```

### Task 2: Minify Compact Output And Bump Compact Schema

**Files:**
- Modify: `src/commands/context.ts`
- Test: `tests/cli-context-approval.test.mjs`

**Step 1: Change compact schema and output mode**

In `src/commands/context.ts`:

- change compact schema from `context.v2.compact` to `context.v3.compact`
- switch compact JSON printing from pretty output to minified output

Minimal target shape:

```ts
console.log(JSON.stringify(compactResult));
```

**Step 2: Run the focused tests**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs
```

Expected:

- schema assertion passes
- some shape assertions still fail

**Step 3: Commit**

```bash
git add src/commands/context.ts tests/cli-context-approval.test.mjs
git commit -m "refactor: minify compact context output"
```

### Task 3: Shrink `matchedFeature` To Hot-Path State

**Files:**
- Modify: `src/services/ContextPresenter.ts`
- Modify: `src/commands/context.ts`
- Test: `tests/cli-context-approval.test.mjs`

**Step 1: Replace `toCompactFeature()` with a hot-path summary**

Keep only:

- `ref`
- `currentStep`
- `currentSubstateId`
- `currentSubstateOwner`
- `currentSubstatePhase`
- `specStatus`
- `planStatus`
- `tasks`
- `completion`
- `warnings`

Remove all path / git / docs / pr detail fields from compact output.

**Step 2: Run focused tests**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs
```

Expected:

- compact `matchedFeature` assertions pass
- action/checkPolicy/orchestration assertions may still fail

**Step 3: Commit**

```bash
git add src/services/ContextPresenter.ts src/commands/context.ts tests/cli-context-approval.test.mjs
git commit -m "refactor: reduce compact feature payload"
```

### Task 4: Remove Prompt Duplication From `actionOptions` And `approvalRequest`

**Files:**
- Modify: `src/services/ContextPresenter.ts`
- Modify: `src/commands/context.ts`
- Test: `tests/cli-context-approval.test.mjs`

**Step 1: Update compact action option formatter**

In `toCompactActionOption()`:

- keep `label`, `detail`, `actionType`, `category`, `operationType`, `requiresUserCheck`
- keep `taskExecutePhase` when present
- keep command payload fields `scope`, `cwd`, `cmd`
- keep instruction payload field `message`
- remove `summary`
- remove `approvalPrompt`
- remove `uiDetailParams`

**Step 2: Shrink compact approval request**

Keep only:

- `required`
- `finalPrompt`
- `userFacingLines`

Remove:

- `labels`
- `approveCommand`
- `executeCommand`
- `executeRequiresTicket`

**Step 3: Run focused tests**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs
```

Expected:

- compact action option assertions pass
- checkPolicy/orchestration assertions may still fail

**Step 4: Commit**

```bash
git add src/services/ContextPresenter.ts src/commands/context.ts tests/cli-context-approval.test.mjs
git commit -m "refactor: remove compact prompt duplication"
```

### Task 5: Reduce `checkPolicy` To Minimal Approval State

**Files:**
- Modify: `src/commands/context.ts`
- Test: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-execute-gates.test.mjs`

**Step 1: Replace compact `checkPolicy` with the minimal contract**

Keep only:

- `token`
- `validLabels`
- `checkRequiredLabels`
- `checkRequiredCategories`
- `approvalRequired`
- `contextVersion`

Remove static / verbose fields from compact:

- `docPath`
- `acceptedTokens`
- `tokenPattern`
- `activeCategories`
- `knownCategories`
- `uncategorizedLabels`
- `categoryPolicyGuidance`
- `oneApprovalPerAction`
- `requireFreshContext`
- `config`

**Step 2: Run focused tests**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected:

- compact approval checks pass with new minimal contract

**Step 3: Commit**

```bash
git add src/commands/context.ts tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
git commit -m "refactor: minimize compact approval policy payload"
```

### Task 6: Collapse `agentOrchestration` To SSOT Handoff Only

**Files:**
- Modify: `src/commands/context.ts`
- Modify: `src/services/ContextPresenter.ts`
- Test: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-execute-gates.test.mjs`

**Step 1: Keep only compact orchestration SSOT**

In compact output, keep:

```ts
agentOrchestration: {
  subAgentHandoff: ...
}
```

Remove compact-only compatibility and descriptive fields:

- delegation mirrors
- long-running categories
- mode / responsibilities / pause rules / resume priority

The compact consumer should instead rely on:

- `matchedFeature.currentSubstateOwner`
- `agentOrchestration.subAgentHandoff`

**Step 2: Run focused tests**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
```

Expected:

- compact orchestration tests pass with reduced shape

**Step 3: Commit**

```bash
git add src/commands/context.ts src/services/ContextPresenter.ts tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs
git commit -m "refactor: reduce compact orchestration payload"
```

### Task 7: Make Selection And Suggestion Fields Conditional

**Files:**
- Modify: `src/commands/context.ts`
- Test: `tests/cli-context-execute-gates.test.mjs`

**Step 1: Emit selection/suggestion helpers only when needed**

Rules:

- for `single_matched`, omit empty candidate/suggestion sections entirely when possible
- for selection states, keep the existing refs / suggestion payloads

Keep hot-path single-feature responses as small as possible.

**Step 2: Run focused tests**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-execute-gates.test.mjs
```

Expected:

- no-feature / multiple-feature scenarios still expose suggestion/select data
- single-feature compact scenarios stay minimal

**Step 3: Commit**

```bash
git add src/commands/context.ts tests/cli-context-execute-gates.test.mjs
git commit -m "refactor: conditionally emit compact selection helpers"
```

### Task 8: Update Docs To Match The New Compact Contract

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `templates/en/common/agents/agents.md`
- Modify: `templates/ko/common/agents/agents.md`
- Modify: `templates/en/common/agents/skills/execute-task.md`
- Modify: `templates/ko/common/agents/skills/execute-task.md`

**Step 1: Rewrite compact JSON docs**

Update docs so they describe compact as:

- hot-path agent payload
- minimal orchestration contract
- `matchedFeature.currentSubstate*` + `subAgentHandoff` as SSOT

Remove doc text that still promises compact exposure of:

- compatibility orchestration fields
- full known category lists
- broad raw policy mirrors

**Step 2: Run targeted tests plus typecheck**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs tests/cli-flow-component-config.test.mjs
pnpm typecheck
```

Expected:

- PASS

**Step 3: Commit**

```bash
git add README.md README.en.md templates/en/common/agents/agents.md templates/ko/common/agents/agents.md templates/en/common/agents/skills/execute-task.md templates/ko/common/agents/skills/execute-task.md
git commit -m "docs: document compact context hot-path contract"
```

### Task 9: Final Verification And Size Check

**Files:**
- Modify: `docs/plans/2026-03-10-context-json-compact-token-analysis.md`
- Test: `tests/cli-context-approval.test.mjs`
- Test: `tests/cli-context-execute-gates.test.mjs`
- Test: `tests/cli-flow-component-config.test.mjs`

**Step 1: Re-measure payload size after implementation**

Use the same temp-project sampling approach as the analysis report and update the measured numbers if they changed materially.

**Step 2: Run final verification**

Run:

```bash
pnpm test -- --runInBand tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs tests/cli-flow-component-config.test.mjs
pnpm typecheck
pnpm lint
```

Expected:

- PASS

**Step 3: Commit**

```bash
git add docs/plans/2026-03-10-context-json-compact-token-analysis.md
git add tests/cli-context-approval.test.mjs tests/cli-context-execute-gates.test.mjs tests/cli-flow-component-config.test.mjs
git add src/commands/context.ts src/services/ContextPresenter.ts README.md README.en.md templates/en/common/agents/agents.md templates/ko/common/agents/agents.md templates/en/common/agents/skills/execute-task.md templates/ko/common/agents/skills/execute-task.md
git commit -m "refactor: optimize compact context payload for agent hot path"
```

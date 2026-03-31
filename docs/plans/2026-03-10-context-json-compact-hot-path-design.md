# `context --json-compact` Hot-Path Design

Date: 2026-03-10

## Goal

Reduce agent token usage for `context --json-compact` without changing:

- human-facing `context` text behavior
- workflow state progression
- approval / execute behavior
- `resolveContextSelection()` decision logic

The target is the JSON surface of `context --json-compact`, not the underlying workflow engine.

## Design Decision

Redefine `context --json-compact` as the default hot-path payload for agent execution loops.

This means:

- keep the data needed to answer "what should I do next?"
- keep the data needed to answer "do I need approval?"
- keep the data needed to answer "should main or sub-agent execute?"
- keep the data needed to answer "can I continue or resume auto-run?"

Everything else should either:

- move to `--json`
- become conditional
- or be removed if it is static, duplicated, or compatibility-only

## Non-Goals

- No change to `context` text output
- No change to `flow` execution semantics
- No change to step / substate resolution
- No attempt to preserve unofficial external JSON consumers

## Contract Direction

## Keep

- `schema`
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
- `checkPolicy`
  - `token`
  - `validLabels`
  - `checkRequiredLabels`
  - `checkRequiredCategories`
  - `approvalRequired`
  - `contextVersion`
- `approvalRequest`
  - `required`
  - `finalPrompt`
  - `userFacingLines`
- `requiredDocs`
- `autoRun`
  - `available`
  - `reasonCode`
  - `command`
  - `untilCategories`
- `agentOrchestration.subAgentHandoff`

## Conditional

Emit only when the status requires them or when there is no single matched hot-path state:

- `candidateRefs`
- `completedCandidateRefs`
- `openCandidateRefs`
- `inProgressCandidateRefs`
- `readyToCloseCandidateRefs`
- `suggestionOptions`
- `suggestionRequest`
- `warnings`
- `recommendation`

Emit minimal progress data only when useful to the agent loop:

- `matchedFeature.tasks`
- `matchedFeature.completion`
- `matchedFeature.specStatus`
- `matchedFeature.planStatus`
- `matchedFeature.warnings`

## Remove

## Top-level

- `branches`
- `workflowPolicy`
- `taskCommitGatePolicy`
- `prePrReviewPolicy`
- `prPolicy`

## `checkPolicy`

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

## `agentOrchestration`

- `mode`
- `delegateCommandExecution`
- `delegateAutoRunExecution`
- `fallbackToMainAgentWhenSubAgentUnavailable`
- `longRunningCategories`
- `currentActionShouldDelegate`
- `autoRunDelegationAvailable`
- `autoRunShouldDelegate`
- `currentActionCategory`
- `mainAgentResponsibilities`
- `subAgentResponsibilities`
- `pauseAndReportWhen`
- `resumePriority`

Keep only:

- `subAgentHandoff`

because that is the documented SSOT with `matchedFeature.currentSubstateOwner`.

## `approvalRequest`

- `labels`
- `approveCommand`
- `executeCommand`
- `executeRequiresTicket`

These are derivable, non-essential, or better handled by higher-level agent behavior.

## `actionOptions`

- `summary`
- `approvalPrompt`
- `uiDetailParams`

The hot-path payload should normalize on `detail`. Label prompts can be reconstructed as needed from `label + detail`, while `approvalRequest.userFacingLines` remains the exact user-facing text source.

## `matchedFeature`

Remove the broad detail payload:

- `id`
- `slug`
- `folderName`
- `type`
- `path`
- `nextAction`
- full `git`
- full `docs`
- full `pr`
- full `prePrReview`
- full `prReview`

Keep only the hot-path execution summary and minimal progress markers.

## Output Rules

### `single_matched`

Default to the smallest payload.

This is the dominant agent loop state and should optimize for token cost above everything else.

### non-`single_matched`

Allow broader selection / recommendation data when needed so the payload still explains:

- which feature to choose
- whether no work exists
- what fallback or suggestion should be shown

### approval-waiting

Keep:

- `approvalRequest.required`
- `approvalRequest.finalPrompt`
- `approvalRequest.userFacingLines`

Do not keep duplicate label arrays or command mirrors.

## Expected Effect

Using the measured sample from the token analysis report:

- current pretty compact payload: about `8.9 KB`
- proposed hot-path payload: about `2.2 KB`
- expected saving: about `75%` vs current pretty output

This reduction is large because the current payload still pays for:

- pretty-print whitespace
- duplicated prompts
- static approval metadata
- compatibility orchestration metadata
- oversized `matchedFeature` detail

## Risks

- Existing tests for compact JSON shape will need to be rewritten to match the new contract.
- Any unofficial external automation reading removed fields from `--json-compact` will break.
- `flow --json-compact` may still retain broader fields; this design does not automatically apply to flow output unless changed deliberately.

## Guardrails

- Do not change `resolveContextSelection()` or the step engine.
- Do not change `context --json`.
- Do not change human text output.
- Limit implementation to compact payload construction, compact formatting helpers, tests, and docs.

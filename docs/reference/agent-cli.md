# Agent CLI Reference

These commands are meant for the main agent and automation in this project.
They are the most stable machine-facing interface inside this CLI.

The point of this interface is to let the agent decide the next action, approval boundaries, and resumable progress without re-parsing the whole docs tree every time.

## Agent Kickoff Prompt

```text
Start procedure:
1) Run npx lee-spec-kit detect --json
2) If isLeeSpecKitProject === true, run npx lee-spec-kit context --json-compact
3) Use context as the read-only state probe, and use flow as the default execution/resume entrypoint
4) If approvalRequest.required=true, briefly restate the current stage from matchedFeature.currentSubstate* when available, then show approvalRequest.userFacingLines exactly as provided and wait for user approval
5) Do not execute before approval; for command execution, default to npx lee-spec-kit flow <featureRef> --approve <LABEL> --execute
6) If isLeeSpecKitProject === false, skip lee-spec-kit-specific flow and continue with normal workflow
```

## Commands

### `detect`

Detect whether the current workspace uses lee-spec-kit.

```bash
npx lee-spec-kit detect --json
```

### `context`

Read the current feature context and next actions in a machine-readable form.

```bash
npx lee-spec-kit context --json-compact
npx lee-spec-kit context F001-alpha --json
```

### `flow`

Run the default workflow auto-loop used for orchestration, pausing at selection, approval, manual, and resume boundaries.

```bash
npx lee-spec-kit flow --json-compact
npx lee-spec-kit flow F001-alpha --approve A --execute
```

## Notes

- JSON output should be treated as the stable interface for agents.
- `context --json-compact` remains the read-only state probe; `flow --json-compact` is the default execution/resume entrypoint.
- Approval-waiting is determined strictly by the latest `approvalRequest.required=true`; do not infer it from action type or conversation tone.
- If approval is still pending after answering an unrelated question, answer first, then briefly restate `matchedFeature.currentSubstateId/currentSubstateOwner/currentSubstatePhase` and re-show the exact CLI approval lines before waiting again.
- If `flow` pauses with `AUTO_MANUAL_REQUIRED`, inspect `matchedFeature.currentSubstateId` / `pendingChangeRequest` first. `change_request_sync` is an internal docs-sync boundary: update docs and continue, rather than treating it as an immediate user-facing stop.
- `AUTO_SELECTION_REQUIRED` is a pause state, not an execution failure; resolve feature selection, then continue with `context` or `flow`.
- Human-facing command names can change, but these machine-facing contracts should stay compatible.

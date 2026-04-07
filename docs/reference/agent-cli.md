# Agent CLI Reference

These commands are meant for the main agent and automation in this project.
They are the most stable machine-facing interface inside this CLI.

The point of this interface is to let the agent decide the next action, approval boundaries, and resumable progress without re-parsing the whole docs tree every time.

## Agent Kickoff Prompt

```text
Start procedure:
1) Run npx lee-spec-kit detect --json
2) If isLeeSpecKitProject === true, run npx lee-spec-kit context --json-compact
3) If approvalRequest.required=true, show approvalRequest.userFacingLines exactly as provided, then wait for user approval
4) Do not execute before approval; execute requiresUserCheck=true actions only after approval
5) If isLeeSpecKitProject === false, skip lee-spec-kit-specific flow and continue with normal workflow
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
npx lee-spec-kit context F001-alpha --approve A --execute
```

### `flow`

Read the combined workflow status used for orchestration, including approval and resume flow.

```bash
npx lee-spec-kit flow --json-compact
npx lee-spec-kit flow F001-alpha --approve A --execute
```

## Notes

- JSON output should be treated as the stable interface for agents.
- Human-facing command names can change, but these machine-facing contracts should stay compatible.

# Agent CLI Reference

These commands are primarily for the main agent and automation.

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

Machine-readable current feature context and next actions.

```bash
npx lee-spec-kit context --json-compact
npx lee-spec-kit context F001-alpha --json
npx lee-spec-kit context F001-alpha --approve A --execute
```

### `flow`

Combined workflow orchestration over context, status, and doctor.

```bash
npx lee-spec-kit flow --json-compact
npx lee-spec-kit flow F001-alpha --approve A --execute
```

## Notes

- JSON contracts should be treated as the stable interface for agents.

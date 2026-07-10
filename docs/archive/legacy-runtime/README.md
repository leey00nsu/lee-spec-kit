# Legacy Runtime Design Archive

These documents describe the removed `context` / `flow` execution engine, including `FlowOrchestrator`, `ActionExecutor`, subagent ownership, step-number approvals, and automatic progression.

They are retained only as historical design records. They do not describe the current CLI or runtime contract.

Use the following sources for current behavior:

- `docs/reference/` for the supported CLI and Codex hooks contract
- workspace `AGENTS.md` for the active agent workflow
- `workflow-stage --json` for the current feature gate
- `workflow-audit --json` and `commit-audit --json` for hook validation

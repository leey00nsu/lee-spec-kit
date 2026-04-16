# Codex Hooks Integration

`lee-spec-kit` now assumes this default runtime shape:

- `lee-spec-kit`: docs schema, workflow policy, validators
- Codex `AGENTS.md`: workspace-scoped instructions
- Codex official hooks: guardrails, context injection, end-of-turn continuation
- `workflow-stage --json`: high-level stage gate before implementation

## Install

```bash
npx lee-spec-kit integrations codex-hooks
```

This scaffolds workspace-local files under `.codex/`:

- `.codex/hooks.json`
- `.codex/hooks/_lee_spec_kit_hook_utils.mjs`
- `.codex/hooks/session_start_lee_spec_kit.mjs`
- `.codex/hooks/user_prompt_submit_lee_spec_kit.mjs`
- `.codex/hooks/pre_tool_use_policy.mjs`
- `.codex/hooks/stop_workflow_audit.mjs`

Install location depends on your repo mode:

- `embedded`: run from the project repo root
- `standalone`: run from the shared `workspaceRoot` above `docs/` and `project/`

For `standalone`, both `workspaceRoot` and `projectRoot` are required topology pointers in `.lee-spec-kit.json`. `projectRoot` alone is not enough, and `workspaceRoot` is rejected if it cannot be validated against the configured project root. The command installs hooks at the configured shared workspace root even when you invoke it from the docs repo, and `AGENTS.md` is managed at that workspace root instead of the docs repo. If either value is missing or invalid, migrate first:

```bash
npx lee-spec-kit update --agents-md
```

If you run `integrations codex-hooks` from an unrelated project repo where `lee-spec-kit` docs are not detected, the command fails instead of writing `.codex/` there.

## What Each Hook Does

### `SessionStart`

- Detects whether the workspace is a lee-spec-kit project
- Injects workflow context into Codex developer instructions
- Tells Codex to resolve the next allowed stage through `workflow-stage --json`

### `UserPromptSubmit`

- Re-applies workflow context when the user gives generic rule-following requests

### `PreToolUse`

- Adds Bash-level guardrails before remote or destructive commands
- Uses `commit-audit --json` before allowing `git commit`
- Uses `workflow-audit --json` before allowing risky remote or destructive commands
- In `standalone`, commit-time docs validation follows the actual `git -C <repo>` target while workflow sync checks `projectRoot` against the active feature docs and only writes/install files through the configured `workspaceRoot`

### `Stop`

- Runs `workflow-audit --json`
- `workflow-audit` now expects an explicit marker such as `<!-- lee-spec-kit:workflow-sync 2026-04-16T12:34:56.789Z -->` in the active feature docs after code/doc sync
- If docs are not synced with code changes, it continues Codex for one more pass instead of letting the turn stop early

## Optional Global Bootstrap

```bash
npx lee-spec-kit integrations codex
```

This updates `~/.codex/config.toml` so Codex keeps reloading repo instructions after compaction and enables the official hooks feature flag.

## Removal

```bash
npx lee-spec-kit integrations codex-hooks --remove
npx lee-spec-kit integrations codex --remove
```

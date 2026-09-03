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

This scaffolds project-local files under `.codex/`:

- `.codex/hooks.json`
- `.codex/hooks/_lee_spec_kit_hook_utils.mjs`
- `.codex/hooks/session_start_lee_spec_kit.mjs`
- `.codex/hooks/subagent_start_lee_spec_kit.mjs`
- `.codex/hooks/user_prompt_submit_lee_spec_kit.mjs`
- `.codex/hooks/pre_tool_use_policy.mjs`
- `.codex/hooks/stop_workflow_audit.mjs`

Install location depends on your repo mode:

- `embedded`: run from the project repo root
- `standalone`: run from the shared `workspaceRoot` above `docs/` and `project/`; the command installs the hooks in the workspace root and every configured `projectRoot`

For `standalone`, both `workspaceRoot` and `projectRoot` are required topology pointers in `.lee-spec-kit.json`. `projectRoot` alone is not enough, and `workspaceRoot` is rejected if it cannot be validated against the configured project root. Codex discovers project hooks from trusted `.codex/` layers below each Git project root, so the command mirrors the managed hook files into every configured project repository while keeping workflow evaluation anchored at `workspaceRoot`. `AGENTS.md` remains managed at the workspace root. If either topology value is missing or invalid, migrate first:

```bash
npx lee-spec-kit update --agents-md
```

If you run `integrations codex-hooks` from an unrelated project repo where `lee-spec-kit` docs are not detected, the command fails instead of writing `.codex/` there.

After installation, run `/hooks` in Codex and review and trust each generated project hook. Codex records trust against the hook definition, so rerun `/hooks` after lee-spec-kit updates regenerate or change the hooks. Project-local hooks are skipped when the project or hook definition is not trusted.

## What Each Hook Does

### `SessionStart`

- Detects whether the workspace is a lee-spec-kit project
- Injects primary-agent workflow context into Codex developer instructions
- Tells primary agents to resolve the next allowed stage through `workflow-stage --json`
- Re-runs on `startup`, `resume`, `clear`, and post-compaction session starts

### `SubagentStart`

- Uses Codex's native subagent lifecycle event and exposes the reported `agent_type`
- Tells delegated subagents to skip primary-agent detection, built-in-doc startup, and `workflow-stage`
- Directs them to follow the exact `delegationContext` and `workerContract` supplied by the primary agent
- Allows role-specific `requiredDocuments` and conditional `referenceDocuments`, while excluding built-in policy docs, unrelated Features, and unlisted Feature docs
- Directs the subagent to ask the parent agent before expanding a missing or insufficient contract

Install current agent instructions before refreshing hooks in an existing project:

```bash
npx lee-spec-kit update --agents-md
npx lee-spec-kit integrations codex-hooks
```

The hook installer warns when a target `AGENTS.md` does not contain the current delegation-context contract marker.

### `UserPromptSubmit`

- Re-applies workflow context when the user gives generic rule-following requests

### `PreToolUse`

- Adds Bash-level guardrails before remote or destructive commands
- Uses `commit-audit --json` before allowing `git commit`, and passes `git commit -m/--message` subjects for canonical Feature-scope validation (`#123` for linked Issues, `F027` for issue-less local Features)
- Uses `workflow-audit --json` before allowing risky remote or destructive commands
- In `standalone`, commit-time docs validation follows the actual `git -C <repo>` target while workflow sync checks `projectRoot` against the active feature docs and only writes/install files through the configured `workspaceRoot`
- In `standalone`, docs-repo `checkout/switch/branch/worktree` commands are blocked so docs stay on the docs branch, while the exact branch-stage `nextAction.command` is allowed and points at the shared workspace `.worktrees/` root instead of the main project checkout
- When `experimental.openwiki=true`, direct repository-generating OpenWiki commands are blocked so they cannot bypass `knowledge sync` scope, receipt, and freshness validation. Exact simple `--help` and connector `auth` forms remain available for runtime setup. Shell substitution, wrappers, unknown execution forms, `--init`, `code`, and other repository-mutating surfaces fail closed. OpenWiki 0.5.x couples ChatGPT provider login to `code --init`, so that one-time upstream setup must be run manually in a trusted terminal and followed by `knowledge sync`; `/provider` alone does not log in. Missing or `false` adds no OpenWiki-specific hook behavior.

`PreToolUse` is a workflow guardrail, not a complete security boundary. Current Codex releases do not intercept every `unified_exec` shell path, web tool, or equivalent side-effect path. For Git-native commit-message enforcement, a `commit-msg` hook can call `npx lee-spec-kit commit-audit --message-file "$1" --enforce --json`; keep irreversible policy enforcement in Git hooks, CI, repository permissions, or managed Codex policy.

### `Stop`

- Runs `workflow-audit --json`
- `workflow-audit` now expects exactly one explicit marker such as `<!-- lee-spec-kit:workflow-sync 2026-04-16T12:34:56.789Z -->` in the active feature docs after code/doc sync; replace the marker timestamp or remove duplicates instead of appending another marker
- If docs are not synced with code changes, it continues Codex for one more pass instead of letting the turn stop early
- When OpenWiki is enabled, it also continues while `knowledge_setup`, `knowledge_sync`, or `knowledge_commit` is still pending

## Optional Global Bootstrap

```bash
npx lee-spec-kit integrations codex
```

Hooks are enabled by default in current Codex releases. This optional command writes the canonical `[features].hooks = true` setting to `~/.codex/config.toml` and migrates the old lee-spec-kit-managed `codex_hooks` alias. Existing explicit `hooks = false` settings are treated as conflicts instead of being overwritten.

## Removal

```bash
npx lee-spec-kit integrations codex-hooks --remove
npx lee-spec-kit integrations codex --remove
```

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
- Uses `commit-audit --json` before allowing `git commit`, and passes `git commit -m/--message` subjects for canonical Feature-scope validation (`#123` for linked Issues, `K7M2Q9RX4DAB` for issue-less local Features)
- Uses `workflow-audit --json` before allowing risky remote or destructive commands
- In `standalone`, commit-time docs validation follows the actual `git -C <repo>` target while workflow sync checks `projectRoot` against the active feature docs and only writes/install files through the configured `workspaceRoot`
- In `standalone`, docs-repo `checkout/switch/branch/worktree` commands are blocked so the primary docs checkout stays on its base branch; new Feature docs worktrees are managed through `workspace prepare`, while the exact branch-stage `nextAction.command` is allowed and points at the shared workspace `.worktrees/` root instead of the main project checkout
- For a prepared standalone Feature, `workflow-stage` returns `workspace_enter` with the registered docs worktree's `docsDirectory` and `workingDirectory`. The pre-tool hook follows this read-only handoff once and checks the exact command against that Feature's current planning documents. It does not execute the handoff command or waive approval, registration, branch, or command-equality checks. This also works when the shell request originates in the shared workspace or the main project checkout.
- OpenWiki commands are not classified or blocked by lee-spec-kit hooks. OpenWiki runs independently in the project-owned workflow scaffolded by `knowledge ci`; its own CLI and repository policy govern generation and visualization.

`PreToolUse` is a workflow guardrail, not a complete security boundary. Current Codex releases do not intercept every `unified_exec` shell path, web tool, or equivalent side-effect path. For Git-native commit-message enforcement, a `commit-msg` hook can call `npx lee-spec-kit commit-audit --message-file "$1" --enforce --json`; keep irreversible policy enforcement in Git hooks, CI, repository permissions, or managed Codex policy.

### `Stop`

- Runs `workflow-audit --json`
- `workflow-audit` returns an exact `expectedWorkflowSyncMarker` bound to the current code-content fingerprint. After code/doc sync, copy it into one active Feature doc and replace any prior marker; duplicate, legacy timestamp, or stale fingerprints fail the audit.
- If docs are not synced with code changes, it continues Codex for one more pass instead of letting the turn stop early
- OpenWiki freshness does not participate in the Stop decision. Knowledge publication is independent repository maintenance, so a failed or stale publication cannot reopen or block a completed Feature.

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

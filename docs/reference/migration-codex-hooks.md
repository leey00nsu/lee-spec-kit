# Migration Guide: Codex Hooks Runtime

This migration keeps the current `lee-spec-kit` docs structure intact.

## What Stays

- `docs/` layout
- feature-local docs such as `spec.md`, `plan.md`, `tasks.md`, `decisions.md`
- issue/PR linkage rules
- config in `.lee-spec-kit.json`
- workspace-scoped `AGENTS.md`

## What Changes

- Codex native `AGENTS.md` + official hooks become the default execution path
- `commit-audit --json` is the default commit-time docs path validator
- `workflow-audit --json` is the default docs-sync validator

## Existing Project Steps

1. Keep your existing `docs/` tree as-is.
2. Run `npx lee-spec-kit update --agents-md` from the shared workspace root. This refreshes the managed `AGENTS.md` block and backfills `workspaceRoot` for standalone projects.
3. Run `npx lee-spec-kit integrations codex-hooks`.
4. Run `/hooks` in Codex and review and trust the generated project hook definitions.
5. Optionally run `npx lee-spec-kit integrations codex` to write the canonical `[features].hooks = true` setting and migrate an old lee-spec-kit-managed `codex_hooks` alias.
6. Keep using `idea`, `feature`, `github`, `docs`, and `detect`.

For `standalone`, run those commands from the shared workspace root above `docs/` and `project/`. The migration uses that location to backfill `workspaceRoot` and write the managed `AGENTS.md`, then mirrors `.codex/hooks.json` and managed hook scripts into each configured project root because Codex only discovers trusted project hooks inside active project config layers. If `workspaceRoot` is missing or points at the wrong place, hooks and audits fail closed instead of guessing.

`PreToolUse` remains a workflow guardrail rather than a complete security boundary. Keep irreversible enforcement in Git hooks, CI, repository permissions, or managed Codex policy because current Codex versions do not intercept every `unified_exec` or equivalent tool path.

## How Humans Should Work

After migration, a normal request such as:

- “Continue the next feature according to the rules”
- “Move this feature forward based on the docs”
- “Prepare the issue and PR from the current feature docs”

should be enough for the agent to follow the workflow automatically.

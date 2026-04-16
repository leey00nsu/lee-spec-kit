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
4. Optionally run `npx lee-spec-kit integrations codex`.
5. Keep using `idea`, `feature`, `github`, `docs`, and `detect`.

For `standalone`, run those commands from the shared workspace root above `docs/` and `project/`. The migration now treats that location as the only safe place to backfill `workspaceRoot`, write the managed `AGENTS.md`, and install `.codex/` without leaving traces in the project repo. If `workspaceRoot` is missing or points at the wrong place, hooks and audits now fail closed instead of guessing.

## How Humans Should Work

After migration, a normal request such as:

- “Continue the next feature according to the rules”
- “Move this feature forward based on the docs”
- “Prepare the issue and PR from the current feature docs”

should be enough for the agent to follow the workflow automatically.

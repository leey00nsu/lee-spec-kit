# Internal CLI Reference

These commands are the maintained non-interactive surface for docs policy, GitHub helpers, and Codex hook guardrails.

## Core Commands

- `update`
- `config`
- `detect`
- `docs`
- `task add`
- `task status|claim|transition|release`
- `feature-audit`
- `workspace prepare|sync-docs|merge-docs|cleanup-docs`
- `decision add`
- `workflow-stage`
- `knowledge doctor`
- `knowledge migrate` (dry-run by default; explicit `--apply` for eligible legacy Plans)
- `knowledge publish` (post-integration artifact)
- `knowledge status`
- `knowledge ci` (explicit CI scaffold)
- `knowledge sync` (legacy in-place compatibility)
- `knowledge audit` (legacy in-place compatibility)
- `workflow-audit`
- `commit-audit`
- `integrations`
- `local sync`
- `local verify`
- `local merge`
- `local cleanup`

## GitHub Helpers

- `github issue`
- `github pr`

## Guidance

- For the normal Codex-native path, prefer `detect`, `docs get`, `workflow-stage`, `workflow-audit`, `commit-audit`, workspace-scoped `AGENTS.md`, and official hooks.

# Workflow Core

This directory marks the intended long-term boundary for orchestration logic that should not depend on:

- a specific docs layout such as the current `lee-spec-kit` folder structure
- a specific agent integration such as Codex bootstrap
- CLI presentation details

Phase 1 only introduces shared workflow-facing types and preset resolution helpers.
Later phases should continue moving state/policy logic here while leaving:

- schema-specific docs loading in `src/adapters/schema/*`
- tool integrations in `src/integrations/*`
- user-facing command wiring in `src/commands/*`

# Legacy Configuration and Runtime Cleanup Design

## Goal

Remove obsolete runtime configuration and compatibility scaffolding left after the Codex hooks migration without changing supported workflow behavior for existing projects.

## Scope

This cleanup covers four concerns:

1. Canonicalize workflow mode migration so a preset-only local project remains local and the historical `strict` preset keeps its worktree requirement.
2. Make the Pre-PR evidence gate honor `workflow.prePrReview.evidenceMode`, while removing Pre-PR and auto-progression settings that no current runtime consumes.
3. Migrate legacy step-based approval settings to category settings during `update`, while retaining read compatibility for projects that have not run the migration yet.
4. Remove unreferenced wrappers, helpers, placeholders, package-ignore rules, and obsolete runtime documentation; align integration test and locale naming with the current CLI.

Large-file decomposition of `workflow-stage.ts` and `GithubWorkflowService.ts` is intentionally excluded. Those files need a dedicated behavior-preserving refactor, but their size is not itself evidence of a legacy or unused feature and combining that work with configuration migration would increase review risk.

Remote cleanup of GitHub PR #1 and its branch is also excluded from local commits because it changes external repository state.

## Configuration Migration

`workflow.mode` is the canonical field.

- A valid existing `mode` wins over any `preset`.
- If `mode` is absent, `preset=local` becomes `mode=local`.
- If `mode` is absent, `preset=github` becomes `mode=github`.
- If `mode` is absent, `preset=strict` becomes `mode=github`; `requireWorktree` becomes `true` only when the user did not explicitly configure it.
- `update` removes `preset` after migration, and `init` no longer writes it.
- Runtime fallback reading remains temporarily available so projects work before they run `update`.

The removed runtime fields are:

- `workflow.auto`
- `workflow.prePrReview.skills`
- `workflow.prePrReview.fallback`
- `workflow.prePrReview.decisionEnum`
- `workflow.prePrReview.enforceExecutionEvidence`
- `workflow.prePrReview.executionCommandPrefixes`
- `approval.taskExecuteCheck`

Existing config files are cleaned by `update`; unknown fields continue to be harmless before migration.

## Pre-PR Evidence Contract

`workflow.prePrReview.enabled` and `evidenceMode` remain supported.

- `any`: any non-empty evidence value satisfies the evidence portion of the gate.
- `path_required` or omitted: evidence must resolve to an existing file inside the docs directory.
- Relative evidence is resolved from the docs directory and active feature directory. A path beginning with `docs/` is also resolved relative to the parent of an embedded `docs` directory.
- Absolute or traversing paths outside the docs directory do not satisfy the gate.

Review status must still be `Done`, the decision must still be present, and its parsed outcome must still be `approve`.

## Approval Compatibility

`approval.mode=steps` and `requireCheckSteps` remain readable by `workflow-stage` for projects that have not run `update`.

During `update`, step policies are converted to category policies:

- Categories mapped to a required legacy step enter `requireCheckCategories`.
- Categories mapped to a non-required legacy step enter `skipCheckCategories`.
- `default=keep` preserves built-in behavior for categories that did not exist in the legacy step model.

`approval.mode=builtin` remains a supported runtime compatibility mode. The updater may canonicalize generated, override-free builtin configuration to the current category default.

## Repository Cleanup

Delete unreferenced source compatibility files and helpers:

- `src/commands/setup.ts`
- `src/utils/codex-bootstrap.ts`
- `applyLocalWorkflowTemplateToFeatureBase`
- `src/adapters/schema/openspec/README.md`
- `.npmignore`

Retain the public `integrations codex` alias `codex-bootstrap` and persisted marker names because installed user configuration depends on them.

Rename the integration test file and internal locale keys from `setup.*` to `integrations.*`. Move pre-pivot `context`/`flow` design documents under `docs/archive/legacy-runtime/` with an index that identifies `docs/reference/` as the current contract.

## Verification

Behavior is locked with CLI regression tests for:

- all legacy preset migration cases, including conflicts and `strict`;
- legacy step approval migration;
- Pre-PR `path_required` missing/existing paths and `any` mode;
- local feature template behavior after dead-helper removal;
- package contents after `.npmignore` removal.

The final gate is the full lint, typecheck, build, and Vitest suite, followed by independent subagent review of configuration behavior, compatibility/cleanup, and the complete branch diff.

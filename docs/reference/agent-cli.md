# Agent CLI Reference

This is the machine-facing contract for Codex-native usage.

## Default Agent Startup

```text
1. Run npx lee-spec-kit detect --json
2. If detected, read npx lee-spec-kit docs get agents --json
3. Read every unread requiredDocs[*].command
4. Resolve the active feature and use that feature folder as the SSOT
5. Run `npx lee-spec-kit workflow-stage <featureRef> --json` and follow only the returned `nextAction`
6. Prefer Codex native execution with workspace-scoped `AGENTS.md` plus official hooks
7. Use workflow-audit --json as the default docs-sync validator before stopping
8. Use commit-audit --json before git commit when hooks need commit-time docs path enforcement
```

## Stable Commands

### `detect`

Machine-readable project detection.

```bash
npx lee-spec-kit detect --json
```

### `docs get`

Machine-readable built-in policy docs.

```bash
npx lee-spec-kit docs get agents --json
npx lee-spec-kit docs get create-pr --json
npx lee-spec-kit docs get ui-ux-design --json
```

`ui-ux-design` is optional. Read it only when the request explicitly concerns a design system, UI/visual redesign, design consistency, shared UI/component-library consolidation, branding/theme/token redesign, or implementation from Figma/design images. It is deliberately absent from the startup `requiredDocs` list and does not add a workflow gate.

### `workflow-audit`

Docs sync validator for Codex hooks and end-of-turn checks.

```bash
npx lee-spec-kit workflow-audit --json
```

### `workflow-stage`

Machine-readable high-level stage resolver.

```bash
npx lee-spec-kit workflow-stage <featureRef> --json
```

For `workflow.mode: "local"` with `completionStrategy: "local-ff"` or `"local-squash"`, a completed Feature advances through `local_merge`, `local_verify`, and `local_cleanup`. Run only the exact command returned in `nextAction.command`. Under `local-ff`, `done` requires the base branch to contain the Feature tip. Under `local-squash`, it requires a verified squash commit with the same tree as the preserved source Feature tip. Both strategies also require passing post-merge checks, the base branch checked out, and cleanup complete.

Under the default approval policy, `implementation_approve` approves the completed implementation and `local_merge` is a separate user checkpoint immediately before the configured fast-forward or squash integration. That second approval covers post-merge checks and configured local cleanup, including local Feature-branch deletion. Remove `local_merge` from `approval.requireCheckCategories` only when the implementation approval should authorize the remaining local completion flow without another checkpoint.

### `local merge` / `local cleanup`

```bash
npx lee-spec-kit local merge <featureRef> --json
npx lee-spec-kit local cleanup <featureRef> --json
```

The helpers are intentionally separate: a failed post-merge check leaves durable integration evidence and keeps the workflow at `local_verify`, where `local merge` reruns verification without creating a merge commit. Cleanup never deletes remote branches.

### `task add`

Machine-readable docs-only task appender.

```bash
npx lee-spec-kit task add <featureRef> --title "..." --ref NON-PRD --acceptance "..." --check "..." --json
```

### `decision add`

Machine-readable docs-only ADR appender.

```bash
npx lee-spec-kit decision add <featureRef> --title "..." --context "..." --decision "..." --rationale "..." --evidence "..." --json
```

Approval note:

- When `workflow-stage --json` returns `primaryActionLabel` together with `actionOptions`, treat `primaryActionLabel` as the default option label and present the exact `actionOptions[*].reply` tokens to the user.
- Local approval checkpoints typically use reply tokens like `A` and `B`.
- Remote execution checkpoints typically use reply tokens like `A OK` and `B`.

### `commit-audit`

Commit-time docs-path and canonical commit-subject validator. Feature-scoped subjects use `#123` when a GitHub Issue is linked and the stable Feature ID such as `F027` for issue-less local workflows.

```bash
npx lee-spec-kit commit-audit --json
npx lee-spec-kit commit-audit --message "feat(F027): implement notification settings" --json
npx lee-spec-kit commit-audit --message-file "$1" --enforce --json
```

`--message-file` is intended for Git `commit-msg` hooks and reads the first non-empty, non-comment subject line. Add `--enforce` in Git hooks or CI so a blocked audit exits non-zero. Do not use full refs such as `F027-notification-settings` as commit scopes.

## Runtime Policy

- Default runtime: Codex + workspace-scoped `AGENTS.md` + official hooks
- Docs SSOT: active feature docs and linked issue/PR docs
- Stage gate: obey `workflow-stage --json` before implementation and only implement when it explicitly allows implementation
- Approval: ask only at documented workflow checkpoints or before remote/destructive actions
- Commit guard: block `git commit` when staged docs paths fall outside the canonical docs surface or feature-local file set, or when a supplied commit subject does not use the canonical Feature scope
- Standalone workspace mode: when `docsRepo === "standalone"`, both `workspaceRoot` and `projectRoot` are required; `workspaceRoot` is the shared root above `docs/` and the code repo(s), and `.codex/` plus managed `AGENTS.md` stay on the workspace/docs side instead of the project repo
- Standalone branch policy: keep the docs repo on its docs branch and never create feature branches or worktrees there
- Standalone execution policy: use the project repo through its managed feature worktree under the shared workspace `.worktrees/` root instead of checking the feature branch out in the main project root
- Standalone branch command policy: run the exact `workflow-stage --json` `nextAction.command`; it creates/reuses the managed worktree path, clears stale managed directories that are no longer registered Git worktrees, and copies existing project-root `.env`/`.env.*` files into a new worktree when absent
- Local completion policy: the default for newly initialized local workflows is `local-ff`; `local-squash` is an explicit opt-in that creates one integration commit while retaining the source Feature tip as an internal Git ref. Existing local projects updated without an explicit strategy receive `none` for compatibility. `none` is the explicit exception that may finish on the Feature branch.
- Docs sync proof: after syncing code back into the active feature docs, keep exactly one marker like `<!-- lee-spec-kit:workflow-sync 2026-04-16T12:34:56.789Z -->` in `tasks.md`, `decisions.md`, or another active-feature canonical doc; replace its timestamp or remove duplicates instead of appending another marker so `workflow-audit` can verify the sync happened after the latest code change

## Important Rule

If the user gives a generic request such as continuing the next feature according to the rules, interpret that request through the detected lee-spec-kit workflow automatically.

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
```

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

Commit-time docs path validator for Codex hooks.

```bash
npx lee-spec-kit commit-audit --json
```

## Runtime Policy

- Default runtime: Codex + workspace-scoped `AGENTS.md` + official hooks
- Docs SSOT: active feature docs and linked issue/PR docs
- Stage gate: obey `workflow-stage --json` before implementation and only implement when it explicitly allows implementation
- Approval: ask only at documented workflow checkpoints or before remote/destructive actions
- Commit guard: block `git commit` when staged docs paths fall outside the canonical docs surface or feature-local file set
- Standalone workspace mode: when `docsRepo === "standalone"`, both `workspaceRoot` and `projectRoot` are required; `workspaceRoot` is the shared root above `docs/` and the code repo(s), and `.codex/` plus managed `AGENTS.md` stay on the workspace/docs side instead of the project repo
- Standalone branch policy: keep the docs repo on its docs branch and never create feature branches or worktrees there
- Standalone execution policy: use the project repo through its managed feature worktree under the shared workspace `.worktrees/` root instead of checking the feature branch out in the main project root
- Standalone branch command policy: run the exact `workflow-stage --json` `nextAction.command`; it creates/reuses the managed worktree path, clears stale managed directories that are no longer registered Git worktrees, and copies existing project-root `.env`/`.env.*` files into a new worktree when absent
- Docs sync proof: after syncing code back into the active feature docs, refresh a marker like `<!-- lee-spec-kit:workflow-sync 2026-04-16T12:34:56.789Z -->` in `tasks.md`, `decisions.md`, or another active-feature canonical doc so `workflow-audit` can verify the sync happened after the latest code change

## Important Rule

If the user gives a generic request such as continuing the next feature according to the rules, interpret that request through the detected lee-spec-kit workflow automatically.

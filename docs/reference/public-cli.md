# Public CLI Reference

These are the commands humans should care about first.

## Docs Schema Commands

### `init`

Initialize the current docs schema and seed the workspace-scoped `AGENTS.md` entrypoint.

```bash
npx lee-spec-kit init
npx lee-spec-kit init --name my-project --type multi
npx lee-spec-kit init --workflow local --task-agent off --reviews plan,task,feature --max-review-rounds 2 --completion-strategy local-squash
```

Interactive init offers recommended defaults or custom workflow automation. Use
`--task-agent on|off`, `--reviews plan,task,feature|none`,
`--max-review-rounds <positive-integer>`, and (for Local mode)
`--completion-strategy local-ff|local-squash|none` for reproducible
non-interactive setup. Recommended defaults enable the task implementation
subagent plus Plan and Feature review, while Task review remains disabled. The
shared finding-remediation limit defaults to `1`. This means the first review's
findings are applied once and reviewed again; another `changes_requested`
decision then escalates to the user instead of starting a second automatic fix.

### `idea`

Create an indexed idea document before promoting work into a feature.

```bash
npx lee-spec-kit idea improve-auth-flow
```

### `feature`

Create a concrete feature folder that becomes the working SSOT.

```bash
npx lee-spec-kit feature user-auth
npx lee-spec-kit feature payment --id F123
```

### `task add`

Append a complete docs-only task block to the selected feature's `tasks.md`.

```bash
npx lee-spec-kit task add F001-alpha --title "implement alpha shell" --ref NON-PRD --acceptance "command renders output" --check "add command handler"
```

### `decision add`

Append a docs-only ADR block to the selected feature's `decisions.md`.

```bash
npx lee-spec-kit decision add F001-alpha --title "Use docs-only mutation commands" --context "Agents need stable helpers" --decision "Patch markdown docs only" --rationale "Keeps formatting consistent" --evidence "Test: pnpm vitest"
```

### `docs`

Read built-in policy docs that the agent uses at session start.

```bash
npx lee-spec-kit docs list
npx lee-spec-kit docs get agents --json
npx lee-spec-kit docs get ui-ux-design --json
```

`ui-ux-design` is optional and should be read only for explicit UI/UX design-system or visual-redesign work; it is not part of startup `requiredDocs` and adds no workflow gate.

### `detect`

Check whether the current workspace should use lee-spec-kit rules.

```bash
npx lee-spec-kit detect --json
```

### `github`

Generate or validate issue/PR artifacts from the current feature docs.

```bash
npx lee-spec-kit github issue F001-alpha
npx lee-spec-kit github pr F001-alpha
```

### `local`

Complete a local workflow by integrating the Feature before it can return `done`.

```bash
npx lee-spec-kit local verify F001-alpha --json
npx lee-spec-kit local merge F001-alpha --json
npx lee-spec-kit local cleanup F001-alpha --json
```

`local verify` runs `workflow.featureChecks` in the Feature worktree and records diagnostics against its exact commit and tree. A failure enters `feature_remediation`. `local merge` then uses `workflow.completionStrategy`: `local-ff` moves the base to the verified SHA, while `local-squash` creates one commit whose tree matches the verified source and preserves that source under `refs/lee-spec-kit/integrations/*`. Optional `workflow.postMergeChecks` run only after integration; a failure rolls the base back before remediation. `local cleanup` removes a clean managed worktree and deletes the local Feature branch only when configured.

## Integration Commands

### `integrations codex-hooks`

Scaffold official Codex hooks for the current workspace.

```bash
npx lee-spec-kit integrations codex-hooks
npx lee-spec-kit integrations codex-hooks --remove
```

For `embedded`, install from the project repo root. For `standalone`, run from the shared workspace root; managed hooks are installed in both the workspace root and every configured project root so Codex can discover them from each Git repository.
If a standalone project predates `workspaceRoot`, run `npx lee-spec-kit update --agents-md` from the shared workspace root first.
After installation or hook updates, run `/hooks` in Codex and review and trust the generated definitions.

### `integrations codex`

Install the optional canonical `[features].hooks = true` setting in `~/.codex/config.toml`. Hooks are enabled by default in current Codex releases.

```bash
npx lee-spec-kit integrations codex
npx lee-spec-kit integrations codex --remove
```

## Recommended Human Flow

```bash
npx lee-spec-kit init
npx lee-spec-kit integrations codex-hooks
npx lee-spec-kit idea improve-auth-flow
npx lee-spec-kit feature user-auth
```

After setup, the human can keep using normal requests such as “continue the next feature according to the rules”.

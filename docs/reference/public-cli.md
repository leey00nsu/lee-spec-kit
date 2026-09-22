# Public CLI Reference

These are the commands humans should care about first.

## Docs Schema Commands

### `init`

Initialize the current docs schema and seed the workspace-scoped `AGENTS.md` entrypoint.

```bash
npx lee-spec-kit init
npx lee-spec-kit init --name my-project --type multi
npx lee-spec-kit init --workflow local --task-agent off --reviews plan,task,feature --max-review-rounds 2 --completion-strategy local-squash
npx lee-spec-kit init --openwiki true --non-interactive
```

Interactive init offers recommended defaults or custom workflow automation. Use
`--task-agent on|off`, `--reviews plan,task,feature|none`,
`--max-review-rounds <positive-integer>`, and (for Local mode)
`--completion-strategy local-ff|local-squash|none` for reproducible
non-interactive setup. Recommended defaults enable the task implementation
subagent plus Plan and Feature review, while Task review remains disabled. The
shared fresh-review limit defaults to `1`. This means the first review's
findings are applied once, then remaining findings and the resulting target
change are preserved as residual risks and the review gate completes
automatically without round 2 or a user approval request.

### `config`

View the current configuration, or deliberately change workflow automation for
an existing project.

```bash
npx lee-spec-kit config
npx lee-spec-kit config --interactive
npx lee-spec-kit config --task-agent on --reviews plan,feature --max-review-rounds 1
npx lee-spec-kit config --completion-strategy local-squash
npx lee-spec-kit config --openwiki true
```

`experimental.openwiki` is deliberately one boolean. Missing or `false` disables Knowledge behavior. `true` enables generation and validation, while freshness remains observational and never becomes a Feature stage or completion gate.

Projects created before task delegation and Plan/Task review settings existed
keep those newly introduced policies disabled during runtime and `update` unless
the project had explicitly configured them. Older projects carrying the exact
generated defaults backfilled by v0.9.4-v0.9.6 are restored to the safe disabled
state, while customized agent settings are preserved. Legacy Feature review
behavior is preserved. This prevents a CLI upgrade from silently changing who
implements or reviews work; use `config` to opt in deliberately.

### `idea`

Create an indexed idea document before promoting work into a feature.

```bash
npx lee-spec-kit idea improve-auth-flow
```

### `feature`

Create a concrete feature folder that becomes the working SSOT.

```bash
# GitHub: select an existing Issue before planning
npx lee-spec-kit feature user-auth --issue 123
# Local: generate an independent 12-character ID
npx lee-spec-kit feature payment
# Legacy import only
npx lee-spec-kit feature imported-payment --id F123
```

GitHub creation can also use `--create-issue --desc "<approved issue body>" --confirm OK` after sharing the title/body. Issue intake does not approve implementation. New Feature metadata lives in `.feature.json`; `--owner` defaults to Git email. Folder order does not determine execution order.

### `task status|claim|transition|release`

One owner session and one active task per Feature. Read `task status <id> --json` for the current tasks hash, claim with `task claim <id> --json`, then use:

```bash
npx lee-spec-kit task transition <id> <task-id> --from TODO --to DOING --session <token> --expected-hash <hash> --json
npx lee-spec-kit task release <id> --session <token> --json
```

The main agent owns transitions. Update acceptance/checklist evidence first, reread the hash, then transition. REVIEW is used only when task review is enabled. Sessions coordinate a local repository's worktrees; use Issue assignment and PR review between machines. Legacy task lines without explicit IDs retain the existing document-edit workflow.

### `workspace`

For new standalone Features, run the returned `workspace prepare <id>` action; it commits only that Feature seed before creating the docs worktree. Continue from its `docsDirectory`. After code integration is verified, follow `workspace merge-docs <id>` and `workspace cleanup-docs <id>`. Use `workspace sync-docs <id>` to merge an advanced docs base into the Feature worktree and resolve conflicts there. A Git receipt preserves docs integration evidence across docs clones; it does not replace project verification records.

New embedded Features receive `workspace_prepare`; run its exact `workspace prepare` command to commit only that Feature seed and create the managed worktree. `workspace_enter` then requires switching to the returned workingDirectory. A prepared standalone Feature reports `workspace_enter` with its docs worktree `docsDirectory`; run subsequent Feature commands from there.

### `feature-audit`

```bash
npx lee-spec-kit feature-audit --base-ref origin/main --enforce --json
```

Fetch the correct docs repository base first. Checks identity uniqueness/immutability, metadata consistency, and multiple active tasks. Does not lock remote users or resolve semantic document conflicts. `workflow-stage` reports visible shared document targets in `sharedDocumentationWarnings`.

### `local sync`

Run `local sync <id>` in the local workflow to merge the current base into the clean Feature worktree. Resolve conflicts there, then reverify/review. This does not authorize remote pushes.

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

`local verify` runs `workflow.featureChecks` in the Feature worktree and records diagnostics against its exact commit and tree. A failure enters `feature_remediation`. `local merge` then uses `workflow.completionStrategy`: `local-ff` moves the base to the verified SHA, while `local-squash` creates one commit whose tree matches the verified source and preserves that source under `refs/lee-spec-kit/integrations/*`. Optional `workflow.postMergeChecks` run only after integration. A failure rolls back only when the expected repository state is intact; concurrent changes are preserved and require inspection before retry. `local cleanup` removes a clean managed worktree and deletes the local Feature branch only when configured.

### `knowledge`

Scaffold an independent scheduled/manual OpenWiki workflow. This command writes configuration only; it does not invoke OpenWiki or inspect generated output.

```bash
npx lee-spec-kit knowledge ci --json
npx lee-spec-kit knowledge migrate --json
npx lee-spec-kit knowledge migrate --apply --json
```

`knowledge ci` requires `experimental.openwiki=true` and writes `.github/workflows/lee-spec-kit-knowledge.yml` in exactly one selected project repository. It replaces only the exact legacy generated workflow that called the removed lee-spec-kit execution adapter and blocked repeat schedules. Other differing workflows are preserved for manual reconciliation.

The generated workflow installs pinned OpenWiki 0.5.2, restores `openwiki/` from the last successful Knowledge PR branch when present, invokes `openwiki code --update --print`, checks that the command changed only OpenWiki's documented output surface, and opens or updates a reviewable PR. It never auto-merges. Generation, output-scope, and source-freshness failures happen before a push. A pull-request API failure after push triggers an exact-lease rollback to the previous branch. A remote rollback failure remains visible in the Actions log and requires repository-level inspection. A prior failure for the same source revision does not block the next scheduled run.

OpenWiki owns incremental planning, local `.run.json`, page retries, validation, and exit status. GitHub Actions owns scheduling, concurrency, secrets, logs, and PR creation. A failed command preserves completed pages in a draft PR, then reports workflow failure. The next scheduled run restores those pages as its input baseline and OpenWiki decides what to update. The workflow deletes `.run.json` before staging because it can contain raw execution context. A successful result against the current source revision becomes review-ready. lee-spec-kit supplies the scaffold and an optional static technical-writing skill. It does not parse OpenWiki run files, issue repair prompts, reset output, maintain receipts, or impose a generation timeout.

GitHub cannot guarantee post-steps after a workflow is explicitly cancelled or its runner is terminated. In that case, progress produced only on the ephemeral runner is lost and the next schedule starts from the last pushed draft or merged Knowledge baseline. `cancel-in-progress: false` prevents a newer scheduled run from cancelling an active one.

The workflow uses `OPENAI_API_KEY` by default. Change provider and model environment variables in the repository-owned workflow when using another OpenAI-compatible service. Provider credentials exist only in the generation step. `OPENWIKI_PR_TOKEN` is a fine-grained token or GitHub App token limited to Contents and Pull requests read/write access for the target repository; checkout uses it as well so pushes to an existing Knowledge PR can trigger repository checks. OpenWiki diagnostics remain in the Actions log and its allowed repository output; raw prompts, credentials, and provider output are not uploaded as artifacts.

Existing `openwiki/` output is not deleted during migration. The former `knowledge publish`, `update`, `sync`, `apply`, `status`, `doctor`, and `audit` execution adapters are no longer part of the CLI.

`knowledge migrate` remains a docs-policy migration command. It never invokes OpenWiki. Dry-run is the default; `--apply` adds only a provenance-bound cutover marker to eligible terminal Features.

Authority is claim-specific: PRD owns durable requirements; the active Feature SDD owns the current change scope and decisions; human-owned curated docs own project-wide explanations and policy; tracked code/schema/config own executable runtime facts; OpenWiki is derived onboarding evidence. Every curated target declared by the Plan is included in the Feature review contract, including absolute cross-repository paths in standalone mode. Generated Knowledge is published separately after integration; it is not a Feature commit or required review input.

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

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

`experimental.openwiki` is deliberately one boolean. Missing or `false` means no OpenWiki stages or gates. `true` enables the complete required Knowledge flow; there are no warn-only or partial modes.

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

### `knowledge`

Manage the optional OpenWiki onboarding layer for one active Feature.

```bash
npx lee-spec-kit knowledge doctor F001-alpha --json
npx lee-spec-kit knowledge sync F001-alpha --json
npx lee-spec-kit knowledge audit F001-alpha --enforce --json
npx lee-spec-kit knowledge migrate --json
npx lee-spec-kit knowledge migrate --apply --json
```

When `experimental.openwiki` is `true`, `workflow-stage` inserts `knowledge_setup`, `knowledge_sync`, and `knowledge_commit` after completed task checkpoints and before Feature review. The adapter requires Node.js 22+, OpenWiki `>=0.5.0 <0.6.0`, and generated OKF 0.2. It resolves one executable and verifies its adjacent `openwiki` package manifest; `LEE_SPEC_KIT_OPENWIKI_BIN` is an optional process-level executable override. The same absolute executable is used for generation. lee-spec-kit runs the code-mode update path without implicitly creating a scheduled CI workflow, validates virtual repository-root links, symlinks, high-confidence secret patterns, exact lee-owned `AGENTS.md`/`CLAUDE.md` blocks, source/base freshness, `.claims/` `repo-lines-v1` hashes, and Markdown source-citation line ranges before writing a project-level `.lee-spec-kit/openwiki-sync.json` receipt. Receipt schema 3 also binds the output to the bundled writing adapter, skill content hash, and managed instruction hash. The triggering Feature is informational and does not make project-wide Knowledge Feature-owned.

Before generation, `knowledge sync` installs the bundled `lee-spec-kit-technical-writing` skill under `~/.openwiki/skills/` or `OPENWIKI_CONFIG_DIR/skills/`. A relative config path is resolved once from the lee-spec-kit invocation directory and passed to OpenWiki as the same absolute path. A config directory inside the project must be ignored by Git; otherwise sync rejects it before installation. A same-name directory without lee-spec-kit ownership metadata is never overwritten. The installed skill is hash-checked immediately before and after generation, and a concurrent change prevents receipt creation. The sync also creates or updates only the marked writing-policy block in `openwiki/INSTRUCTIONS.md`; project-specific content outside the block is preserved and a concurrent edit aborts the managed update. An older receipt or a changed adapter, skill, or managed instruction marks Knowledge stale and causes the generated surface to be rebuilt under the current writing policy. For current OKF 0.2 output, every manifest-backed reader page must contain at least one descriptive Markdown link to tracked source using `repo://path` or `repo://path#Lx-Ly`; Knowledge verification resolves those links against the receipt source snapshot and rejects missing, unsafe, excluded, or stale targets. Reader-link parsing follows balanced Markdown path parentheses, and a range may end at the empty EOF boundary immediately after a final newline; hashed claim evidence remains exact. `repo://` is reserved for source included in the repository fingerprint, while Knowledge cross-links use the exact planned `/openwiki/...md` path with literal forward slashes and no backslashes. Claim sidecars and inline code citations do not satisfy this reader-navigation requirement. This behavior is part of the single OpenWiki feature flag rather than a separate style setting.

`knowledge sync` uses an asynchronous child process and OpenWiki's durable `.run.json`. Human output reports sanitized page progress on stderr; `--json` keeps stdout as one final JSON object. A successful result normalizes its final progress to `phase: "complete"`, sets completed pages equal to total pages, clears the current page, and records zero skipped pages. If a completed incremental update leaves stale claim hashes or out-of-range source citations, lee-spec-kit preserves `openwiki/INSTRUCTIONS.md`, clears only generated OpenWiki output, and retries the same update path once with the bootstrap timeout. When OpenWiki stamps a broken internal link, lee-spec-kit may also run one in-place update so OpenWiki can repair the marked link against its existing page plan; lee-spec-kit does not rewrite generated Markdown or provenance itself. The clean evidence retry and in-place link repair are independently limited to one pass, and a remaining failure stops without advancing the receipt. When OpenWiki has no active page queue and a complete update failed only post-generation validation, a later writing-policy version may replace that terminal owner and regenerate if the Feature, component, language, source fingerprint, and base snapshot still match. Other owner mismatches remain blocked for explicit inspection. Defaults are 30 seconds for lock acquisition, 10 minutes without observable progress, 90 minutes absolute for bootstrap, and 30 minutes absolute for updates. Override one run with `--lock-timeout-ms`, `--idle-timeout-ms`, or `--absolute-timeout-ms`; these are deliberately not additional project config fields. Timeout, interruption, and provider failure preserve partial state and return structured elapsed time, last progress, changed paths, timeout values, and the resume command without forwarding raw provider output. Resume is allowed only for the same Feature, component, language, source fingerprint, base snapshot, and writing-policy instruction hash.

An incomplete run returns structured `interruption` evidence: whether an active page queue remains, the last-update status, observed skipped-page count and paths, the owner run ID, and the last observed progress. OpenWiki 0.5.x collapses finish-time source drift and skipped pages into `status: "interrupted"` and then removes `.run.json`. When lee-spec-kit did not observe a skipped page before that removal, it therefore reports `OPENWIKI_SOURCE_DRIFT_OR_SKIPPED_PAGES` instead of inventing an exact cause; `limitation` explains the upstream ambiguity.

Generated Knowledge can be inspected without changing it:

```bash
openwiki visualize ./openwiki
openwiki visualize ./openwiki --port 4400 --no-open
```

Read-only visualization is allowed directly and does not replace `knowledge sync`. The Codex hook limits this exception to `./openwiki`, an optional numeric `--port`, and `--no-open`. `visualize --export` writes a static site and remains blocked in the automated path; run it manually only after reviewing its destination and commit policy.

`knowledge doctor` is read-only and can run without selecting a Feature when only runtime setup is being checked. It verifies Node, executable identity/version, OKF capability, selected provider/model, required credential-field presence, and—when a Feature is selected—the current Knowledge state. OpenWiki remains the configuration owner: values come from the current process and `~/.openwiki/.env` (or `OPENWIKI_CONFIG_DIR/.env`), and lee-spec-kit returns only status, required key names, and a setup command—never secret values. API-key providers can be configured by running `openwiki` in a trusted terminal and using `/provider`, `/api-key`, and `/model`. Connector OAuth uses `openwiki auth <provider>`.

OpenWiki 0.5.x does not expose a provider-auth-only command for the `openai-chatgpt` model provider. Its supported login entrypoint is `OPENWIKI_PROVIDER=openai-chatgpt openwiki code --init`, which also starts an initial generation. Run that command manually in a trusted terminal, then run `lee-spec-kit knowledge sync` to revalidate the managed surface and establish the authoritative receipt. The Codex guardrail continues to block `--init` from agent-issued shell commands because it cannot distinguish login from repository generation; simple help and connector-auth commands remain allowed. `/provider` only changes the provider/model selection and does not itself complete ChatGPT OAuth.

`knowledge migrate` defaults to a zero-write dry-run. `--apply` adds only a provenance-bound policy-cutover marker to approved, terminal, fully committed legacy Plans whose impact assessment is either absent or a complete pre-Schema-2 assessment. The marker is bound to the canonical Feature-document content and becomes invalid if the Feature is reopened or those documents change. Migration never invents `NONE` decisions, never runs OpenWiki, and leaves active, dirty, malformed, or partially assessed Features for manual review.

Migration handles workflow-policy compatibility, not stale prose. When adopting this policy in an existing project, perform one manual baseline reconciliation of PRD, architecture, onboarding, operations, design, and agent-policy documents against the current repository before relying on per-Feature impact checks.

The adapter also maintains a final lee-spec-kit block in `.openwikiignore` for its mutable run-owner ledger plus common environment, key, certificate, credential, and secret paths. Excluding only `.lee-spec-kit/openwiki-run.json` prevents lee-spec-kit's durable `runId` updates from being misclassified as repository source drift; user-authored ignore rules before the block are preserved. lee-spec-kit never installs OpenWiki or provider credentials.

This validation is a workflow integrity boundary, not an OS sandbox. OpenWiki runs as an external agent in the project working directory with its configured provider credentials. Use a trusted repository and an isolated runtime appropriate to the project's secret model; local and ignored secret exposure remains an operator responsibility.

Authority is claim-specific: PRD owns durable requirements; the active Feature SDD owns the current change scope and decisions; human-owned curated docs own project-wide explanations and policy; tracked code/schema/config own executable runtime facts; OpenWiki is derived onboarding evidence. Every curated target declared by the Plan is included in the Feature review contract, including absolute cross-repository paths in standalone mode. The generated Knowledge surface must be committed separately with the exact subject returned by `workflow-stage`.

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

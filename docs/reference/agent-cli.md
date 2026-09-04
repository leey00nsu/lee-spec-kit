# Agent CLI Reference

This is the machine-facing contract for Codex-native usage.

## Default Primary-Agent Startup

Delegated subagents do not run this startup sequence. The Codex `SubagentStart`
hook injects lifecycle context, while the primary agent passes the exact
`delegationContext` and `workerContract` returned by `workflow-stage`. The
subagent reads `requiredDocuments`, uses `referenceDocuments` only under their
stated conditions, and asks the parent before expanding an insufficient scope.

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

When `workflow.agentReview.plan.enabled=true`, a Plan in Review returns `nextAction.category: "plan_review"` with a fresh read-only subagent configuration plus exact `specHash` and `planHash` targets. Record Plan review status, evidence, decision, reviewer metadata, and both hashes in `plan.md`. Only an `approve` decision for the current hashes unlocks `plan_approve`; later spec/plan content changes invalidate the evidence. Existing Features whose tasks were already approved before Plan-review metadata existed are grandfathered unless they already carry that metadata.

Plan, task, and Feature review actions also return `reviewRound` and `maxReviewRounds`. Record `reviewRound` in the matching review metadata. `workflow.agentReview.maxRounds` is the maximum number of fresh reviews and defaults to `1`. With `1`, findings from review round 1 are remediated once, then the remaining findings and resulting target change are preserved as residual risks and the gate auto-completes without round 2 or a user review-approval token. With `2`, round 2 may review the first remediation, but its findings are applied without a round 3. `blocked` decisions never auto-complete.

For `workflow.mode: "local"` with `completionStrategy: "local-ff"` or `"local-squash"`, a completed Feature advances through `feature_verify`, `local_merge`, and `local_cleanup`. Failed Feature or post-integration checks enter `feature_remediation` with implementation enabled. Under `local-ff`, the base must equal the verified Feature tip during integration. Under `local-squash`, the integration commit must have the same tree as the verified, preserved source Feature tip. After cleanup, the Feature remains `done` when its recorded integration commit is still an ancestor of the current base, so later Features do not reopen historical completion stages.

Every Plan must complete Schema 2 `Curated Documentation Impact` before review or approval. Its four core axes cover requirements, system architecture, onboarding, and operational/runtime contracts; typed `Additional Curated Impacts` cover only conditional project-specific surfaces. Explicit `NONE` values prove that a surface was considered. Every `UPDATE` or `ADD` target must appear in at least one task `Docs` list and in the committed Feature diff under the active scope. Before Knowledge sync or Feature review, deterministic reconciliation also reports recognized curated files changed by the Feature but omitted from the declaration.

When `experimental.openwiki=true`, completed task checkpoints advance through `knowledge_setup`, `knowledge_sync`, and `knowledge_commit` before Feature review. Run repository generation through the returned `lee-spec-kit knowledge sync` command; simple OpenWiki help, connector auth setup, and read-only `openwiki visualize ./openwiki` may run directly. `visualize` accepts an optional numeric `--port` and `--no-open` in the automated path, while `--export` remains a manual file-writing operation. `knowledge doctor` checks OpenWiki-owned provider/model settings and credential presence without returning secret values. OpenWiki 0.5.x ChatGPT login is coupled to `code --init`; that command must be run manually in a trusted terminal and followed by `knowledge sync`, because the Codex hook keeps agent-issued `--init` blocked. The generated `openwiki/index.md`, project-level `.lee-spec-kit/openwiki-sync.json` receipt, and every Plan-declared curated target become required Feature-review documents, so enabling the flag also makes Feature review effective even when its standalone review flag was off. The sync installs the bundled `lee-spec-kit-technical-writing` skill in OpenWiki's config directory and manages only its marked block in `openwiki/INSTRUCTIONS.md`; same-name user skills and instructions outside the block are not overwritten. The managed block separates the repository planner contract from the page-worker contract and requires the planner to copy the latter into each page job. The default adapter organizes pages around reader purposes and validates Korean reader prose as consistent `해요체`/`-하세요` after generation. The receipt binds generated output to the writing adapter, skill, and instruction hashes, so a writing-policy upgrade requires regeneration. The dedicated Knowledge commit also includes the lee-spec-kit protection block in `.openwikiignore`; that exact block excludes the mutable `.lee-spec-kit/openwiki-run.json` ledger so observed `runId` persistence cannot create false OpenWiki source drift. An interrupted run may resume only from its recorded Feature/source/writing-policy owner; inspect its structured `interruption` evidence before retrying and do not delete `.run.json` or `.lee-spec-kit/openwiki-run.json` without checking why the run stopped.

Under the default approval policy, `implementation_approve` approves the completed implementation and `local_merge` is a separate user checkpoint immediately before the configured fast-forward or squash integration. That second approval covers post-merge checks and configured local cleanup, including local Feature-branch deletion. Remove `local_merge` from `approval.requireCheckCategories` only when the implementation approval should authorize the remaining local completion flow without another checkpoint.

Subagent actions return a versioned `delegationContext`. It contains the role,
Feature and working directories, role-specific `requiredDocuments`, conditional
`referenceDocuments`, embedded task instructions and acceptance criteria when
applicable, the approved Verification Contract for task work, and exact hash or
SHA/tree review targets. The primary agent passes this object without rebuilding,
omitting, or broadening it.

### `local verify` / `local merge` / `local cleanup`

```bash
npx lee-spec-kit local verify <featureRef> --json
npx lee-spec-kit local merge <featureRef> --json
npx lee-spec-kit local cleanup <featureRef> --json
```

The helpers are intentionally separate. Feature checks run before integration and their logs record the cwd, target SHA, timing, exit code, and stdout/stderr. A failed optional post-integration check rolls back the local integration before remediation. Cleanup never deletes remote branches.

Any Feature-tip change invalidates the recorded Feature verification and the prior `local_merge` confirmation. Re-run review for the changed diff when Pre-PR review is enabled, then verify the new tip and obtain the normal `local_merge` approval again.

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
- Docs sync proof: after syncing code back into the active Feature docs, run `workflow-audit --json` and copy its exact `expectedWorkflowSyncMarker` into `tasks.md`, `decisions.md`, or another canonical Feature doc. Keep exactly one marker; it binds the sync claim to the current code-content fingerprint and detects later committed or uncommitted code drift.
- Knowledge authority: PRD owns durable requirements; the active Feature SDD owns the current change scope and decisions; curated project-wide docs own explanations and policy; tracked code/schema/config own executable facts; OpenWiki is derived onboarding evidence. With `experimental.openwiki=true`, the full sync/receipt/commit/review gate is required, while missing or `false` adds no OpenWiki behavior.

## Important Rule

If the user gives a generic request such as continuing the next feature according to the rules, interpret that request through the detected lee-spec-kit workflow automatically.

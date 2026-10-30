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
npx lee-spec-kit docs get performance-evidence --json
```

`ui-ux-design` is optional. Read it only when the request explicitly concerns a design system, UI/visual redesign, design consistency, shared UI/component-library consolidation, branding/theme/token redesign, or implementation from Figma/design images. It is deliberately absent from the startup `requiredDocs` list and does not add a workflow gate.

Read `performance-evidence` when performance improvement is a goal or claimed result. It exposes the performance-evidence section of the built-in Decisions template, so existing Features can use the same guidance without replacing their documents. It is conditional and absent from startup `requiredDocs`. Define metrics/targets in the Spec and a baseline/measurement procedure in the Plan Verification Contract; measure before implementation and repeat under comparable conditions afterward. The primary agent records detailed results in the relevant ADR's `Performance Evidence`, retaining code/tool revisions, timestamps, reproducible commands, environment/data/load/cache, samples/variability, unit/direction, absolute and relative changes, regressions, and raw-evidence links under the active Feature's `artifacts/performance/`. Preserve original baselines and dated reruns. Use stable metric keys for future trends; distinguish targets, measurements, incomparable results, and production verification. Comparison HTML summarizes the same values and links the ADR. `decision add` creates the base ADR; the agent then enriches applicable ADRs using this guidance. Workers retain their existing write contract and return measurement evidence to the primary agent. Reviewers assess support for performance claims within the existing review policy. This adds no automatic benchmark execution, numerical threshold validator, or approval gate, and does not require benchmarks for unrelated changes.

### `workflow-audit`

Docs sync validator for Codex hooks and end-of-turn checks.

It also reports `FEATURE_REFERENCE_IN_SHARED_DOC` with `sharedDocViolations`
containing the path, line, column, and matched reference. Curated shared docs must
describe durable requirements, behavior, and policy without concrete Feature/task
identifiers or links into Feature folders. Protected README discrepancies remain
deferrable; staged README edits are still checked by `commit-audit`.

```bash
npx lee-spec-kit workflow-audit --json
```

### `workflow-stage`

Machine-readable high-level stage resolver.

```bash
npx lee-spec-kit workflow-stage <featureRef> --json
```

When `workflow.agentReview.plan.enabled=true`, a Plan in Review returns `nextAction.category: "plan_review"` with a fresh read-only subagent configuration plus exact `specHash` and `planHash` targets. Record Plan review status, evidence, decision, reviewer metadata, and both hashes in `plan.md`. Only an `approve` decision for the current hashes unlocks `plan_approve`; later spec/plan content changes invalidate the evidence. Existing Features whose tasks were already approved before Plan-review metadata existed are grandfathered unless they already carry that metadata.

Spec authoring includes a visual As-Is / To-Be HTML report at `artifacts/change-report.html` inside the resolved Feature docs workspace. `spec_write` and `spec_approve` point the primary agent to this file and the `create-feature` authoring policy. UI changes use paired screens or mockups; behavior changes use paired flows and concrete input/output examples. The report opens locally, labels proposals and unverified evidence, and links to Spec acceptance criteria. Link it from `spec.md` and `tasks.md` or `decisions.md`, present it at the existing Spec approval boundary, and refresh it when scope or intended behavior changes. This is an agent authoring requirement, not a new approval category or an HTML-existence/content validation gate. Unchanged approved/completed Features do not need backfilling, and generating the report does not activate the optional UI/UX design-system policy.

**Spec clarification contract**

Spec clarification is internal to `stage: "spec"`. `nextAction.category: "spec_clarify"` directs inquiry when questions remain or recorded completion is invalid. It does not introduce an approval category or approval token. Resolve clarification before the existing `spec_approve` checkpoint.

Spec-stage JSON includes `specClarification` with its assessment status, summary, question records, `openQuestionIds`, validation `errors`, and `ready` result. A new Draft with a valid Pending assessment starts at `spec_write`. Recorded OPEN questions or invalid records return `spec_clarify`; Review or Approved Specs also return that action until the assessment is Complete and valid. The blocking reason is `SPEC_CLARIFICATION_REQUIRED`, with both `implementationAllowed` and `approvalRequired` false. Skipping approval checkpoints does not bypass this gate. Metadata-free legacy documents retain their existing flow.

Configure the inquiry batch size in `.lee-spec-kit.json` as `workflow.specClarification.maxQuestionsPerRound`, a positive safe integer. New projects write `3`; missing policy or field also resolves to `3`. `update` fills missing values and preserves explicit limits. `npx lee-spec-kit config --max-clarification-questions 1` changes the limit without editing JSON manually. Spec-stage JSON exposes the effective value as `clarificationPolicy.maxQuestionsPerRound`, and `spec_clarify` uses it in its instructions. This limits the agent's question batch, not the total number of questions or rounds; it does not automatically count questions in chat messages.

Every new `spec.md` has a `## Spec Clarification` section (`## Spec 결정 확인` in Korean) with the same literal English machine fields in either language:

```markdown
- **Clarification Status**: Pending
- **Clarification Summary**: -
```

Allowed status is Pending | Complete. Complete requires a substantive summary explaining why no questions were needed after investigation/prior answers, or how decisions were incorporated into the Spec. A placeholder summary is not valid completion. Existing approved/completed Features without clarification metadata remain compatible; adopt it when revising scope or behavior.

Record actual questions in `decisions.md` as real `## SC-01: title` headings (`###` also accepted), followed by SC-02 and onward independently of D001 ADR numbering. Keep the section and records before D001 to preserve them when the first ADR placeholder is replaced. Keep seed examples fenced so they are not parsed as actual OPEN questions. Both languages use literal English field names:

| Field | Recorded content |
| --- | --- |
| Status | OPEN, RESOLVED, DELEGATED, or DEFERRED |
| Question | Product, scope, acceptance, or compatibility choice requiring clarification |
| Options | Alternatives and tradeoffs |
| Recommendation | Recommended option and rationale |
| Answer | Actual user answer, explicit delegation, or explicit agreement to defer |
| Decision | Resulting choice and scope; agent choice/scope for delegation, excluded scope and concrete followup for deferral |
| Spec Refs | Affected Spec scope, requirement, or acceptance-criteria references |

OPEN blocks clarification completion. All terminal records require non-placeholder Answer, Decision, and Spec Refs. RESOLVED captures an actual user answer. DELEGATED captures explicit user delegation and the agent's choice/scope. DEFERRED captures explicit user agreement, excluded scope, and followup. Silence, defaults, or elapsed time do not supply consent. Review `maxRounds` exhaustion never auto-completes questions.

The primary agent investigates facts first, reuses prior answers, and asks only choices affecting product behavior, scope, acceptance criteria, or compatibility. Ask independent questions up to clarificationPolicy.maxQuestionsPerRound at once (from workflow.specClarification.maxQuestionsPerRound; default 3) with choices, a recommendation, and tradeoffs, then wait for needed answers before dependent rounds. Do not ask routine implementation details. Record answers and update Spec acceptance criteria in the same turn. New material scope/behavior changes reopen affected choices and reset status to Pending. The HTML report remains a draft during inquiry and is refreshed before existing Spec approval.

The CLI validates recorded completion and unresolved questions; it does not assess question quality or actual user provenance, bind clarification to a content hash, or prove completeness of the choices identified. Investigation and faithful recording remain agent responsibilities. See `docs get create-feature --json` for authoring guidance.

Plan, task, and Feature review actions also return `reviewRound` and `maxReviewRounds`. Record `reviewRound` in the matching review metadata. `workflow.agentReview.maxRounds` is the maximum number of fresh reviews and defaults to `1`. With `1`, findings from review round 1 are remediated once, then the remaining findings and resulting target change are preserved as residual risks and the gate auto-completes without round 2 or a user review-approval token. With `2`, round 2 may review the first remediation, but its findings are applied without a round 3. `blocked` decisions never auto-complete.

For `workflow.mode: "local"` with `completionStrategy: "local-ff"` or `"local-squash"`, a completed Feature advances through `feature_verify`, `local_merge`, and `local_cleanup`. Failed Feature or post-integration checks enter `feature_remediation` with implementation enabled. Under `local-ff`, the base must equal the verified Feature tip during integration. Under `local-squash`, the integration commit must have the same tree as the verified, preserved source Feature tip. After cleanup, the Feature remains `done` when its recorded integration commit is still an ancestor of the current base, so later Features do not reopen historical completion stages.

Every Plan must complete Schema 2 `Curated Documentation Impact` before review or approval. Its four core axes cover requirements, system architecture, onboarding, and operational/runtime contracts; typed `Additional Curated Impacts` cover only conditional project-specific surfaces. Explicit `NONE` values prove that a surface was considered. Every `UPDATE` or `ADD` target must appear in at least one task `Docs` list and in the committed Feature diff under the active scope. Before Feature review, deterministic reconciliation also reports recognized curated files changed by the Feature but omitted from the declaration.

With OpenWiki enabled, keep Feature review focused on code and curated docs. Knowledge update is an independent repository maintenance action and never blocks Feature integration or cleanup. GitHub uses `knowledge ci` to scaffold scheduled and manually dispatched publication. Generated pages and OpenWiki run metadata belong to the independent Knowledge workflow, not Feature review.

Under the default approval policy, `implementation_approve` approves the completed implementation and `local_merge` is a separate user checkpoint immediately before the configured fast-forward or squash integration. That second approval covers post-merge checks and configured local cleanup, including local Feature-branch deletion. Remove `local_merge` from `approval.requireCheckCategories` only when the implementation approval should authorize the remaining local completion flow without another checkpoint.

Subagent actions return a versioned `delegationContext`. It contains the role,
Feature and working directories, role-specific `requiredDocuments`, conditional
`referenceDocuments`, embedded task instructions and acceptance criteria when
applicable, the approved Verification Contract for task work, and exact hash or
SHA/tree review targets. The primary agent passes this object without rebuilding,
omitting, or broadening it.

Curated discrepancy disposition is part of existing Plan, task execution, and Feature review policy, not a new config flag or schema. Correct in-scope factual errors through declared targets and tasks. If product intent or scope needs confirmation, record the document paths, evidence, unresolved question, deferral reason, and a real follow-up task/Feature/issue. A decisions-only residual note is insufficient. Reviewers inspect NONE evidence and report untracked discrepancies as findings under the existing review-round policy. This does not add an automatic semantic-staleness detector or authorize rewriting product intent from generated Knowledge.

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

- `primaryActionLabel` and `actionOptions` are canonical payload-level siblings of `nextAction` and are mirrored inside `nextAction` for single-object consumers. Treat `primaryActionLabel` as the default option label and present the exact `actionOptions[*].reply` tokens to the user.
- Local approval checkpoints typically use reply tokens like `A` and `B`.
- Remote execution checkpoints typically use reply tokens like `A OK` and `B`.

### `docs-audit`

```bash
npx lee-spec-kit docs-audit --json --enforce
```

Document-location findings remain warnings. Concrete Feature/task references in
shared documents return `status: "blocked"`,
`reasonCode: "FEATURE_REFERENCE_IN_SHARED_DOC"`, and exact file/line/column
diagnostics; `--enforce` also exits non-zero. The reference check includes PRD,
architecture, designs, constitution/custom, and other shared text documents,
including allowlisted paths. It recognizes legacy/local IDs, labelled numeric
Feature/task references, task IDs, and Feature-folder links. Stable requirement
IDs, dates, versions, and ordinary issue references are allowed. Feature folders,
Idea promotion records, built-in workflow guides, scripts, assets, and OpenWiki
output are separate tracking or derived surfaces and are excluded. Only the
generated lee-spec-kit block in `AGENTS.md` is masked; user-authored rules around
it are checked. Do not hide real project change tracking in workflow examples.

### `commit-audit`

Commit-time docs-path and canonical commit-subject validator. Feature-scoped subjects use `#123` when a GitHub Issue is linked and the stable Feature ID such as `K7M2Q9RX4DAB` for issue-less local workflows.

```bash
npx lee-spec-kit commit-audit --json
npx lee-spec-kit commit-audit --message "feat(K7M2Q9RX4DAB): implement notification settings" --json
npx lee-spec-kit commit-audit --message-file "$1" --enforce --json
```

`--message-file` is intended for Git `commit-msg` hooks and reads the first non-empty, non-comment subject line. Add `--enforce` in Git hooks or CI so a blocked audit exits non-zero. Do not use full refs such as `K7M2Q9RX4DAB-notification-settings` as commit scopes.

The shared-document content check reads the Git index, including rename targets,
so unstaged cleanup cannot make forbidden staged references pass. Findings use
`kind: "shared_doc_feature_reference"` and carry `path`, `line`, `column`, and
`reference`. Path allowlists do not waive this content rule. Deleted files and
rename sources have no new content to check.

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
- Docs sync proof: after syncing code back into the active Feature docs, run `workflow-audit --json` and copy its exact `expectedWorkflowSyncMarker` into `tasks.md`, `decisions.md`, or another canonical Feature doc. Keep exactly one marker; it binds the sync claim to the current code-content fingerprint and detects later committed or uncommitted code drift. Once all tasks are `DONE`, `workflow-stage` enforces this as the `workflow_sync` hard gate before Feature review or completion.
- Knowledge authority: PRD owns durable requirements; the active Feature SDD owns the current change scope and decisions; curated project-wide docs own explanations and policy; tracked code/schema/config own executable facts; OpenWiki is derived onboarding evidence. With `experimental.openwiki=true`, repository Knowledge is updated by scheduled/manual GitHub CI, while freshness remains observational and never gates Feature completion. Missing or `false` adds no OpenWiki behavior.

## Important Rule

If the user gives a generic request such as continuing the next feature according to the rules, interpret that request through the detected lee-spec-kit workflow automatically.

## Feature collaboration actions

GitHub Feature creation starts with `feature <slug> --issue <number>`; local creation generates a 12-character ID. Existing F-number references remain compatible. Claim one session with `task claim`; use `tasksHash` from workflow-stage or task status as `--expected-hash` for task transition. Record evidence before rereading the hash. Release at handoff. Legacy task lines without explicit IDs use existing document transitions.

Run `workspace prepare` for a new embedded Feature; it commits only the selected Feature seed and creates the managed worktree. `workspace_enter` requires running from the returned workingDirectory. New standalone Features use workspace prepare and the returned docsDirectory; merge-docs and cleanup-docs are required after project integration. Docs inherit local code completion strategy by default, including older configs without the new `workflow.docsCompletionStrategy` setting. Squash records the receipt in one canonical commit and preserves the source under internal evidence refs and portable evidence tags. Strict task checkpoints remain required. Clones need the evidence tag to restore the original squash source; code verification records remain separate. See [Standalone documentation integration](docs-integration.md) for overrides, allowed scope, compatibility, transport, and retry behavior.

Run feature-audit in CI against the fetched docs base. Inspect sharedDocumentationWarnings and coordinate shared PRD/architecture changes. Local sessions do not provide cross-machine locks. Sync advanced bases explicitly and rerun verification/review; merge retries do not rebase or force-push.

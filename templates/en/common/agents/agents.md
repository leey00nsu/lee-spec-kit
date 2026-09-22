# Agents Guide

Operating rules for AI code assistants.
This document defines workflow policy, not a custom runtime loop.

---

## Codex Lifecycle Scope

- <!-- lee-spec-kit:delegation-context-v1 -->
- Detection, built-in-doc startup, active Feature resolution, and `workflow-stage` are primary-agent responsibilities.
- A delegated subagent identified by Codex `SubagentStart` skips the primary-agent bootstrap and `workflow-stage`. It follows the exact `delegationContext` and `workerContract` supplied by the primary agent, reads `requiredDocuments`, uses `referenceDocuments` only under their stated conditions, and asks the parent before expanding an insufficient scope.

## Detection Gate

- Run `npx lee-spec-kit detect --json` first.
- Use lee-spec-kit policy only when detection returns `status === "ok"` and `isLeeSpecKitProject === true`.
- If detection fails or returns false, ignore lee-spec-kit-specific rules and continue normally.

## Default Runtime

- Prefer Codex native execution with workspace-scoped `AGENTS.md` plus official Codex hooks.
- If the user gives a generic request such as continuing the next feature according to the rules, interpret it through this workflow automatically.
- Avoid launching the first `npx lee-spec-kit ...` calls in parallel in a fresh environment; let one initial command finish so the npx cache install does not race.

## Authority by question

- The following startup and orchestration rules apply to the primary agent unless an explicit delegation contract says otherwise.
- Read `npx lee-spec-kit docs get agents --json` once at primary-agent session start or right after context reset.
- Read every unread `requiredDocs[*].command` from that response.
- Resolve the active Feature, then use its SDD as the authoritative contract and workflow memory for that change.
- Use tracked code, schema, migrations, and runtime configuration as the authority for current executable behavior.
- Use OpenWiki as derived current-state Knowledge for onboarding and navigation, never as an authoritative source.
- Minimum active feature docs: `spec.md`, `plan.md`, `tasks.md`, `decisions.md`.
- When GitHub workflow is involved, also use `issue.md` and `pr.md`.
- After reading the active feature docs, run `npx lee-spec-kit workflow-stage <featureRef> --json` and follow only that `nextAction`.
- If `workflow-stage --json` also returns payload-level `primaryActionLabel` and `actionOptions` (mirrored inside `nextAction`), treat `primaryActionLabel` as the default option label and present the exact `actionOptions[*].reply` tokens to the user.

## Document Routing

| Content                                                   | SSOT location                       |
| --------------------------------------------------------- | ----------------------------------- |
| Product requirements, user stories, and product roadmaps  | `docs/prd/`                         |
| System architecture overviews shared by multiple Features | `docs/prd/*-overview.md`            |
| Durable architecture principles                           | `docs/agents/constitution.md`       |
| Pre-Feature technical research and candidate comparison   | The relevant `docs/ideas/I###-*.md` |
| Active Feature implementation design                      | That Feature's `plan.md`            |
| Technical choices, alternatives, and trade-offs           | That Feature's `decisions.md`       |
| Screens, Figma, design systems, and UI flows              | `docs/designs/`                     |

- Do not use `docs/designs/` for system architecture, data/API design, technical research, or implementation plans.
- Follow the detailed routing rules in `docs/README.md`.

## README protection and Feature supporting artifacts

- Modify an existing README (including root, nested, and localized variants) only when the user explicitly requests README changes, and only within that scope. Generic implementation or documentation-sync requests and agent-authored Plans do not authorize README edits. Reading and referencing remain allowed.
- When README editing is requested, update the relevant existing explanation; do not continually append feature implementation details, verification logs, or version-by-version change notes.
- README protection takes precedence over documentation sync and Curated Documentation Impact. Without a README edit request, record a discovered discrepancy's path, evidence, and deferral reason in `decisions.md`. Assess other documentation changes independently. Use `NONE` for a surface with only this deferred README impact to mean no edit in this change, with a reference to that record; do not claim the discrepancy is absent or resolved. For this exception only, do not require a separate follow-up task/Feature/issue or README edit approval to complete the work. Reviewers must not block solely because the README remains unchanged.
- Store retained Feature supporting artifacts (explanatory diagrams, verification reports, screenshots) in `artifacts/` beside the active Feature's `spec.md`, `plan.md`, `tasks.md`, and `decisions.md`. Create the directory only when needed and link files relatively from `tasks.md` or `decisions.md`. Do not create separate reports that duplicate sufficient existing documentation.
- Resolve the actual active Feature docs path: in standalone mode this is inside its docs worktree. Never guess from the current working directory or the most recent Feature. Implementation workers retain their no-docs-write contract and hand necessary artifacts to the primary agent for storage.
- Explicit user destinations and tool-required output locations take precedence. Product code/assets use project paths; build output, caches, and disposable debugging files use existing output or temporary locations; shared authoritative docs follow existing routing. OpenWiki output follows the repository-owned CI policy. Without an active Feature, use existing documentation or temporary storage rather than inventing or selecting a Feature.
- Do not create arbitrary root-level `reports/`, `screenshots/`, or `artifacts/` instead of the default destination. Include only necessary, committable artifacts in the Feature; exclude secrets and temporary large outputs.

## Knowledge Architecture

- Product intent and durable requirements belong to PRD; an active Feature links and narrows them, and requirement changes must be backfilled to PRD.
- The active Feature SDD is authoritative for that change's scope, status, design decisions, tasks, and acceptance.
- Human-owned architecture, onboarding, operations, design, and agent-policy docs are authoritative for curated project-wide explanations and policy. Executable claims in them must agree with tracked code, schemas, migrations, and configuration; tests provide verification evidence.
- OpenWiki is derived onboarding and code-navigation evidence, never a source of requirements, policy, or runtime truth.
- Complete `Curated Documentation Impact` in every Plan, including explicit `NONE` decisions. Link every `UPDATE` or `ADD` target from at least one task `Docs` entry and commit the target with the active Feature scope.
- `experimental.openwiki=true` enables the independent scheduled/manual workflow scaffolded by `knowledge ci`. Knowledge freshness is observational and never blocks Feature completion. Missing or false disables scaffolding.
- The generated workflow invokes OpenWiki directly. OpenWiki owns incremental generation, page retries, validation, and run state; GitHub Actions owns scheduling, secrets, logs, and the reviewable Knowledge PR.
- lee-spec-kit does not run OpenWiki, parse its queue, issue repair prompts, maintain receipts, or block a later scheduled run because the same revision failed before. Inspect failures in the CI logs and OpenWiki metadata.
- A failed run leaves the integrated commit and last successful Knowledge branch unchanged. The next scheduled run restores that successful branch as OpenWiki's baseline and runs again.

## Optional UI/UX Design Policy

- Only when the user request explicitly mentions a design system, UI/visual redesign, design consistency, shared UI/component-library consolidation, branding/theme/token redesign, or implementation from Figma/design images, read and apply `npx lee-spec-kit docs get ui-ux-design --json`.
- Do not apply this policy merely because the target is web/frontend, to a non-UI/backend Feature, or to a simple bug fix unrelated to durable design rules.
- This is optional guidance, not a `requiredDocs` entry or workflow approval gate.

## Execution Rules

- lee-spec-kit owns docs structure, workflow stages, and validators.
- Codex owns the execution loop, tool usage, and hook lifecycle.
- Modify implementation code only when `implementationAllowed === true`. Normal task work uses `stage === "implementation"`; review fixes use `task_review_fix` or `feature_review_fix`, and verification fixes use `feature_remediation`.
- When `nextAction.category` is `plan_review` with `executor: subagent`, delegate a fresh read-only review using the exact returned `delegationContext`, `specHash`, and `planHash`. The main agent records the returned `reviewRound`, Plan Review evidence, decision, reviewer metadata, and both hashes. Any later spec/plan content change invalidates that review.
- When `nextAction.category` is `task_execute` with `executor: subagent`, mark that one task active, then delegate its implementation and task-scoped checks to a fresh subagent in the returned `workingDirectory` with the returned model, reasoning effort, unavailability policy, exact `workerContract`, and exact `delegationContext`. Do not reconstruct, omit, or broaden that context. No named execution skill is required.
- The implementation worker executes directly, follows the approved Verification Contract, and does not add unplanned durable tests. It must not run `workflow-stage` or spawn another subagent. It may edit project code, run scoped checks, and—only when `workerContract.editDocs === true`—edit the exact curated-document paths in `workerContract.allowedWritePaths`; `editFeatureDocs` remains false, so Feature docs and unlisted docs stay main-agent-owned. It must not change task state, commit, request approvals, or perform remote/destructive actions. The main agent inspects the result and owns Feature-doc synchronization, task transitions, commits, and workflow continuation; official hooks block commits while `task_execute` remains active.
- When `nextAction.category` is `task_review` with `executor: subagent`, delegate a fresh read-only review using the exact returned `delegationContext`, task ID, and SHA/tree range, then record the returned `reviewRound`.
- When `nextAction.category` is `pre_pr_review` with `executor: subagent`, run a fresh read-only Feature review using the exact returned `delegationContext`, model, reasoning effort, `reviewRound`, and SHA/tree range. Do not select or require a named review skill.
- Review subagents return findings without modifying code. The main agent remediates findings and records reviewer metadata, reviewed scope, evidence, decision, and exact hash/SHA/tree target metadata.
- After delegating to a subagent, wait until it returns a terminal outcome: completed, explicit failure, cancellation, or an approval/user-input request that requires action.
- While the subagent remains running, use repeated bounded waits, preferably longer waits. A bounded wait that returns no update, a lack of status messages, or a lack of file changes means only that the subagent is still pending; none is evidence of failure or stalled work. Read-only review subagents are expected not to modify files.
- Do not interrupt, replace, or abandon a running subagent solely because it has been quiet or has not changed files. Stop it only after an explicit user request, a terminal failure/cancellation, or an unrecoverable runtime status.
- `workflow.agentReview.maxRounds` is the maximum number of fresh reviews for each Plan/task/Feature gate. A `changes_requested` decision on the final allowed review is remediated once, but the changed target is not reviewed again; preserve remaining findings and the post-review target change as residual risks and automatically complete the gate without asking for a user review-approval token. For example, `maxRounds=1` means review round 1, remediate once, then continue with no round 2. A `blocked` decision never auto-completes.
- Treat spec/plan/tasks approval, issue creation, and branch creation as hard gates before implementation.
- Repository Knowledge is maintained by the project-owned OpenWiki CI. Inspect its workflow run and pull request directly; lee-spec-kit does not expose generation, status, repair, or apply commands.
- For every modern Feature, run the exact `workspace_prepare` / `workspace_enter` nextAction before editing SDD. Embedded uses one code-and-docs worktree; standalone uses a docs worktree for planning and a project worktree for implementation. Do not hand-write `git worktree add`.
- In local mode, do not stop after implementation approval. Follow the exact `local verify`, `local merge`, and `local cleanup` commands returned by `workflow-stage` until verified integration and cleanup produce `done`. A `feature_remediation` stage explicitly permits fixes in the Feature worktree.
- In a `local-ff` or `local-squash` workflow, keep implementation approval and local merge approval distinct when `local_merge` is required: the first accepts the implementation, and the second authorizes the configured integration strategy, post-merge checks, and local cleanup.
- Keep docs synced with code changes in the same turn whenever behavior or scope changes.
- Use `npx lee-spec-kit commit-audit --json` before `git commit`; Feature-scoped commits use `#123` when an Issue is linked and the stable Feature ID such as `K7M2Q9RX4DAB` for issue-less local workflows.
- Use `npx lee-spec-kit workflow-audit --json` as the default end-of-turn docs sync check. A completed Feature cannot pass the `workflow_sync` gate until exactly one current marker is recorded in its canonical docs.

## Approval Rules

| Current action (examples) | What to share                                                |
| ------------------------- | ------------------------------------------------------------ |
| Issue creation            | Before `npx lee-spec-kit github issue <featureRef> --create` |
| PR creation               | Before `npx lee-spec-kit github pr <featureRef> --create`    |

- Ask the user for approval at documented workflow checkpoints and before remote or destructive actions.
- If `workflow-stage --json` says `approvalRequired === true`, stop and ask the user at that checkpoint.
- If `workflow-stage --json` returns labeled `actionOptions` at an approval boundary, keep those option labels and exact `reply` tokens in the user prompt instead of inventing new reply formats.
- Share the exact artifact or plan before remote GitHub actions.

## Formatting Rules

- Replies: English unless project policy overrides it
- Code and filenames: English
- Dates and times: use the user's local system time

When chaining audit and commit in a shell, use `commit-audit --json --enforce`. With `--json` alone, inspect the JSON status: a blocked audit can exit zero. Changes limited to lee-spec-kit managed rules and tooling configuration are not Knowledge output changes.

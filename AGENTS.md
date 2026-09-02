<!-- lee-spec-kit:begin -->
Use lee-spec-kit docs and workflow policy only when explicitly detected.

Codex lifecycle scope:

- <!-- lee-spec-kit:delegation-context-v1 -->
- The detection, built-in-doc startup, active Feature resolution, and workflow-stage steps below belong to the primary agent.
- A delegated subagent identified by the Codex SubagentStart hook skips the primary-agent startup and workflow-stage calls. It follows the exact delegationContext and workerContract supplied by the primary agent, reads requiredDocuments, uses referenceDocuments only under their stated conditions, and asks the parent before expanding an insufficient scope.

Detection gate:

1. Run `npx lee-spec-kit detect --json`
2. Apply lee-spec-kit rules only when `status === "ok"` and `isLeeSpecKitProject === true`
3. If detection fails or returns false, skip these instructions and continue with the normal non-lee-spec-kit workflow

Default runtime path:

- Prefer Codex native execution with workspace-scoped AGENTS.md plus official hooks for the default runtime path.
- Treat lee-spec-kit as the docs schema, workflow policy, and validation toolkit.
- If the user gives a generic request such as continuing the next feature according to the rules, interpret it through this workflow automatically.
- Infer the workflow automatically even for generic rule-following requests.
- Avoid launching the first `npx lee-spec-kit ...` calls in parallel in a fresh environment; let one initial command finish so the npx cache install does not race.

On primary-agent session start or after context compression/reset:

1. Run `npx lee-spec-kit detect --json`
2. If detected, run `npx lee-spec-kit docs get agents --json` once
3. Read any unread `requiredDocs[*].command` from that output
4. Cache built-in docs per session and only re-read them when the user explicitly asks for a policy refresh, `npx lee-spec-kit update` changed the policy, or the session restarted

Before taking the next workflow step:

These orchestration steps belong to the primary agent unless an explicit delegation contract says otherwise.

1. Confirm the active feature from the request, docs tree, issue/PR context, or the most recently active feature folder
2. Read the active feature docs as the SSOT: `spec.md`, `plan.md`, `tasks.md`, and `decisions.md`
3. When relevant, also read `issue.md` and `pr.md`
4. Run `npx lee-spec-kit workflow-stage <feature-ref> --json` and follow only the returned `nextAction`
5. If `workflow-stage --json` returns `primaryActionLabel` and `actionOptions`, treat `primaryActionLabel` as the default option label and present the exact `actionOptions[*].reply` tokens to the user before continuing
6. Do not modify implementation code unless `implementationAllowed === true`; normal task work uses `stage === "implementation"`, while `task_review_fix`, `feature_review_fix`, and `feature_remediation` are the only review/remediation exceptions
7. Treat stages before implementation as hard gates:
   - spec approval plus plan / tasks readiness
   - issue preparation / issue creation
   - branch creation
   - task commit checkpoints after each completed task
8. In standalone mode, keep the docs repo on its docs branch and do not create feature branches or worktrees there
9. In standalone mode, use the project repo through its managed feature worktree under the shared workspace `.worktrees/` root instead of checking the feature branch out in the main project repo
10. In standalone mode, do not hand-write `git worktree add`; run the exact `nextAction.command` from `workflow-stage` so the managed workspace path, stale directory cleanup, and `.env` / `.env.*` copy step stay consistent
11. Keep docs and code synchronized; if code changes materially, update the active feature docs in the same turn before stopping
12. When docs are synced to code, keep exactly one explicit marker like `<!-- lee-spec-kit:workflow-sync 2026-04-16T12:34:56.789Z -->` in a single active feature doc (prefer `tasks.md` or `decisions.md`): replace an existing marker timestamp or remove duplicates instead of appending another marker, so `workflow-audit` can prove the sync happened after the latest code change
13. When `workflow-stage --json` returns `nextAction.category === "plan_review"` with `executor === "subagent"`, delegate a fresh read-only review using the returned model settings, exact `specHash` / `planHash`, and exact `delegationContext`; the main agent records the returned `reviewRound`, evidence, decision, reviewer metadata, and both hashes, and any later spec/plan content change requires a fresh review
14. When `workflow-stage --json` returns `nextAction.category === "task_execute"` with `executor === "subagent"`, mark exactly the returned `taskId` as active and delegate its implementation plus task-scoped verification to a fresh subagent in the returned `workingDirectory`, using the returned `model`, `reasoningEffort`, `onUnavailable`, exact `workerContract`, and exact `delegationContext`; do not reconstruct, omit, or broaden the returned context, and no named execution skill is required
15. The task implementation worker executes directly: it must follow the approved Verification Contract, must not add unplanned durable tests, and must not run `workflow-stage`, spawn another subagent, edit lee-spec-kit docs, change task state, commit, request approvals, or perform remote/destructive actions. It may modify project code and run task-scoped checks only. The main agent inspects the result, synchronizes docs and task state, and owns every commit and workflow transition; official hooks block commits while `task_execute` is still active
16. When `workflow-stage --json` returns `nextAction.category === "task_review"` with `executor === "subagent"`, delegate a fresh read-only review using the exact returned `delegationContext`, `taskId`, `baseSha`, `targetSha`, and `targetTree`; the main agent records the returned `reviewRound` and evidence and moves the task from `REVIEW` to `DONE` only after an approve decision
17. When `workflow-stage --json` returns `nextAction.category === "pre_pr_review"` and `nextAction.executor === "subagent"`, delegate a fresh read-only Feature review using the returned `model`, `reasoningEffort`, `onUnavailable`, `reviewRound`, review target metadata, and exact `delegationContext`; do not select or require a named review skill
18. Review subagents return findings without modifying code; the main agent remediates findings and records the actual reviewer metadata, reviewed scope, evidence, decision, and exact hash/SHA/tree target metadata
19. `workflow.agentReview.maxRounds` counts automatic finding-remediation passes, not the initial review. After those passes are exhausted, keep the latest `changes_requested` findings as residual risks and automatically complete that Plan/task/Feature review gate without asking the user for a review-approval token; `blocked` decisions never auto-complete
20. For a local workflow, do not report completion directly after implementation approval; follow the exact returned `local verify` / `local merge` / `local cleanup` commands until `workflow-stage` proves verification, integration, and cleanup and returns `done`; review-fix and `feature_remediation` stages explicitly permit scoped fixes
21. In a `local-ff` or `local-squash` workflow, keep implementation approval and local merge approval distinct when `local_merge` is required: the first accepts the implementation, and the second authorizes the configured integration strategy, post-merge checks, and local cleanup

Approval and remote actions:

- Ask the user for approval only at documented workflow approval boundaries or before remote/destructive actions
- If `workflow-stage --json` reports `approvalRequired === true`, stop at that boundary and ask the user before proceeding
- If `workflow-stage --json` returns labeled `actionOptions` at any approval boundary, keep the same option labels and exact `reply` tokens in the user prompt and do not improvise different reply formats
- If `workflow-stage --json` reports `nextAction.category === "task_commit"`, make the docs commit and project commit for the just-finished task before starting the next task or moving to the next stage
- Before `git commit`, prefer `npx lee-spec-kit commit-audit --json`; Feature-scoped commits use `#123` when an Issue is linked and the stable Feature ID such as `F027` for issue-less local workflows
- Before remote GitHub actions, share the plan or artifact being sent
- Respect repo policy from docs and config first; hooks only enforce guardrails and continuation checks

Validation:

- Prefer `npx lee-spec-kit commit-audit --json` for commit-time staged docs path validation and canonical commit-subject validation
- Prefer `npx lee-spec-kit workflow-audit --json` as the default docs-sync validator for Codex hooks and end-of-turn checks; it expects the active feature docs to carry one fresh `lee-spec-kit:workflow-sync` marker after meaningful code/doc sync

Optional UI/UX design policy:

- Only when the user request explicitly mentions a design system, UI/visual redesign, design consistency, shared UI/component-library consolidation, branding/theme/token redesign, or implementation from Figma/design images, read and apply `npx lee-spec-kit docs get ui-ux-design --json`
- Do not apply that policy merely because the target is web/frontend, to a non-UI/backend Feature, or to a simple bug fix unrelated to durable design rules
- Treat it as optional guidance, not a `requiredDocs` entry or workflow approval gate

<!-- lee-spec-kit:end -->

# Feature Implementation Process: Docs-first

This guide defines how to start or continue a feature in the Codex-native lee-spec-kit path.

---

## Start

1. Run `npx lee-spec-kit detect --json`.
2. If detected, read `npx lee-spec-kit docs get agents --json` and any unread follow-up docs.
3. If the Feature folder does not exist, use `feature <name> --issue <number>` in GitHub mode. Create an Issue first only after sharing its title/body and receiving authorization (`--create-issue --desc "<summary>" --confirm OK`). In local mode, use `feature <name> -d "<description>"`; a random ID is generated. Add `--idea <ref>` only when the user explicitly named that Idea. Never allocate a new F-number.
4. Resolve the active feature and read its docs: `spec.md`, `plan.md`, `tasks.md`, `decisions.md`.
5. Run `npx lee-spec-kit workflow-stage <feature-ref> --json` before taking the next workflow action.

## Working Rules

- The active Feature SDD is the authoritative contract for this change. Follow it directly while keeping executable claims aligned with tracked code.
- Progress through the documented stages directly:
  - `spec.md` defines scope and review state
  - `plan.md` defines the implementation approach and Verification Contract
  - `tasks.md` drives execution order
  - `issue.md` / `pr.md` are part of the stage gate once the feature reaches GitHub workflow stages
- Do not begin implementation just because `tasks.md` exists. Implementation starts only when `workflow-stage --json` allows it.
- When Plan review is enabled, move `plan.md` to Review, delegate the returned fresh read-only `plan_review`, and record its `reviewRound`, evidence, decision, reviewer metadata, `specHash`, and `planHash`. An approved review must match the current hashes; exhausted `changes_requested` follows the automatic residual-risk path below. The reviewer challenges NONE/UPDATE/ADD decisions, requirement coverage, independent oracles, stable observation boundaries, realistic failure/rollback cases, exclusions, and focused/full verification scope without editing docs.
- `workflow.agentReview.maxRounds` is the maximum number of fresh Plan reviews. On `changes_requested` at the final allowed round, apply the findings once, preserve remaining findings and the resulting hash changes as residual risks, promote the Plan automatically, and do not request another review or a user review-approval token. With `maxRounds=1`, there is no round 2. Never auto-complete `blocked`.
- When scope or behavior changes, update the active feature docs in the same turn before continuing.
- Ask for approval at documented review checkpoints and before remote or destructive actions.
- Use `npx lee-spec-kit commit-audit --json` before `git commit` when docs-path validation matters.
- Use `npx lee-spec-kit workflow-audit --json` before stopping when code or feature docs changed.

## Strict Rules

1. Do not invent issue/PR numbers or status transitions.
2. Do not skip required doc updates when scope, behavior, or evidence changed.
3. Do not treat unmanaged docs artifacts as the active workflow SSOT until they are normalized into the feature folder or allowlisted.

## Single-owner collaboration

- Select the Feature by ID or an unambiguous branch; never choose by recency or numeric order.
- New Features use code worktrees. For standalone docs, commit the seed and follow `workspace prepare`; work from the returned docsDirectory. Follow returned docs integration/cleanup steps after code integration.
- Claim one owner session with `task claim`; use `task status` or workflow-stage's tasksHash and `task transition --session <token> --expected-hash <hash>`. Release the session at handoff. Never run two DOING/REVIEW tasks in one Feature.
- Run `feature-audit --enforce --json` alongside workflow-audit; use `--base-ref <fetched-base>` in CI to check immutable identity. Resolve sharedDocumentationWarnings against the latest base.
- If the base advances, sync it explicitly in the Feature worktree and reverify/review. Never automatically rebase and force-push during merge retries.

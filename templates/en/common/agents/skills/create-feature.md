# Feature Implementation Process: Docs-first

This guide defines how to start or continue a feature in the Codex-native lee-spec-kit path.

---

## Start

1. Run `npx lee-spec-kit detect --json`.
2. If detected, read `npx lee-spec-kit docs get agents --json` and any unread follow-up docs.
3. Resolve the existing Feature first, retaining the session-selected ID or using an explicit ID/unambiguous branch. Read its `spec.md`, `plan.md`, `tasks.md`, and `decisions.md`. `FEATURE_SELECTION_REQUIRED` means select an existing Feature, not create another one.
4. If a Feature is in progress, follow `workspace_prepare` / `workspace_enter` before editing its docs, then record additional implementation/correction requests with `task add <feature-ref>` and synchronize its SDD. Questions and analysis alone do not create work items. All tasks DONE does not finish a Feature; require workflow `done`.
5. Create the first Feature only for requested implementation when none exists. After workflow `done`, newly requested implementation may start a new Feature. During an active Feature, use `--separate` only when the user explicitly requests another Feature or selects a proposed split. GitHub mode requires `feature <name> --issue <number>`; share the title/body and obtain authorization before `--create-issue --desc "<summary>" --confirm OK`. Local mode uses `feature <name> -d "<description>"` with a generated ID. Add `--idea <ref>` only for an explicitly named Idea. Never allocate a new F-number.
6. Run `npx lee-spec-kit workflow-stage <feature-ref> --json` before taking the next workflow action, including after scope or plan changes.

## Spec clarification

Clarification is part of `stage: spec`. When questions remain or recorded completion is invalid, follow `nextAction.category: spec_clarify`. This is an inquiry action, not a new approval category or approval token; finish it before the existing Spec approval.

1. Inspect the request, current code, authoritative docs, compatibility constraints, and prior answers before asking. Separate discoverable facts from choices affecting product behavior, scope, acceptance criteria, or compatibility. Resolve routine implementation details through investigation and judgment.
2. Add `## Spec Clarification` to every new Spec with literal fields `- **Clarification Status**: Pending` and `- **Clarification Summary**: -`. Allowed status is Pending | Complete. These English field names and values are identical in Korean templates. Unchanged approved/completed Features without metadata remain compatible; adopt the section when revising their scope or behavior.
3. Record each actual question in `decisions.md` under a real `## SC-01: title` heading (`###` also accepted), using SC-02 and onward independently of D001 ADRs. Keep the clarification section and records before D001 so replacing the first ADR placeholder preserves them. Fenced template examples are not actual questions. Use the literal English fields Status, Question, Options, Recommendation, Answer, Decision, and Spec Refs in both languages.
4. Ask the current independent frontier: independent questions up to clarificationPolicy.maxQuestionsPerRound per round (from workflow.specClarification.maxQuestionsPerRound; default 3), each with choices, a recommendation, and tradeoffs. Wait for the answers needed to decide them; ask dependent questions in the next round. Reuse prior answers rather than asking again unless material new scope or behavior changes an affected choice. Do not present clarification choices as workflow approval tokens.
5. OPEN blocks completion. For terminal status, fill Answer, Decision, and Spec Refs with substantive content, not placeholders. RESOLVED captures the actual user answer and resulting decision. DELEGATED requires explicit user delegation and records the agent's choice and scope. DEFERRED requires explicit user agreement and records excluded scope and concrete followup, with Spec Refs linking the corresponding scope/acceptance criteria. Never infer delegation, deferral, or agreement from silence, defaults, elapsed time, or review limits. `workflow.agentReview.maxRounds` does not auto-complete questions.
6. Record answers and update Spec scope and acceptance criteria in the same turn. Keep the HTML change report a draft during inquiry; refresh it to reflect the decisions before presenting it at the existing Spec approval boundary. A new material scope/behavior change reopens affected choices, preserves prior answers as history, and resets Clarification Status to Pending.
7. Mark Complete only when no OPEN questions remain and all terminal records are valid. Replace the placeholder Clarification Summary with a substantive explanation of why investigation/prior answers left no questions, or how the decisions were incorporated into the Spec. Rerun `workflow-stage` and follow the existing Spec approval action when returned.

The CLI validates recorded completion and unresolved questions. It does not assess question quality or verify actual user provenance, bind clarification to a content hash, or prove that every product choice was identified. The primary agent remains responsible for investigation, meaningful questions, and faithful records.

## Spec change report

Before presenting a new or revised Spec for approval, the primary agent writes `artifacts/change-report.html` beside the active Feature's `spec.md`. Resolve the managed workspace first, including the docs worktree in standalone mode. Create `artifacts/` at this stage, rather than shipping an empty report with the registration seed. This report is required for Spec review and is an explicit exception to the rule against redundant supporting reports.

1. Inspect the current code, documentation, and available UI before describing As-Is. Cite source paths and relevant observations. Mark unavailable evidence and open questions explicitly. For new capabilities, show the existing absence or manual workaround.
2. Lead with the problem, intended outcome, and a compact side-by-side As-Is / To-Be comparison of the same scenario. Include the trigger/input, visible result/output, and meaningful error or empty states. Use paired screen sketches or screenshots for UI changes, paired flows and concrete input/output examples for behavior changes, and both for mixed changes. Text-only cards are insufficient when the change concerns screen layout or interaction.
3. Label To-Be as a proposal until implementation is verified. Label sketches as mockups, distinguish observed facts from assumptions, and identify expected metrics as targets. Never present a fabricated screenshot, measurement, or passing test as evidence.
4. Link comparison items to the Spec's US/FR/acceptance criteria. Show scope exclusions, unresolved questions, and how the intended difference will be checked. Keep requirements and approval state authoritative in `spec.md`; the report explains them visually rather than introducing a second contract.
5. Produce a readable HTML file that opens locally without a build, server, CDN, external fonts, or network requests. Use inline CSS and SVG where useful, relative paths for retained local assets, semantic headings, legible contrast, and a responsive layout that stacks paired panels on narrow screens. Keep the key comparison visible first; avoid a prose dump of the Spec. Check the report in a browser when available and disclose any unverified rendering. Exclude secrets and escape code, paths, and user-provided strings when placing them in HTML.
6. Link the report relatively from `spec.md` and from `tasks.md` or `decisions.md`. Present a clickable report link with the existing Spec approval request; there is no separate report approval token. Refresh it when scope or intended behavior changes and include it in the Spec review again. After implementation, retain the original As-Is and distinguish any verified result from the proposal using actual evidence. The primary agent owns this artifact; implementation workers return evidence under their existing write contract.

Existing approved or completed Features do not need reports backfilled merely to continue. Apply this policy when writing or revising their Spec for a new scope or behavior change. The report applies to backend, CLI, policy, and documentation changes as well as UI work; it does not by itself activate the optional UI/UX design-system policy.

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

# Agents Guide

Operating rules for AI code assistants.
This document defines workflow policy, not a custom runtime loop.

---

## Detection Gate

- Run `npx lee-spec-kit detect --json` first.
- Use lee-spec-kit policy only when detection returns `status === "ok"` and `isLeeSpecKitProject === true`.
- If detection fails or returns false, ignore lee-spec-kit-specific rules and continue normally.

## Default Runtime

- Prefer Codex native execution with workspace-scoped `AGENTS.md` plus official Codex hooks.
- If the user gives a generic request such as continuing the next feature according to the rules, interpret it through this workflow automatically.
- Avoid launching the first `npx lee-spec-kit ...` calls in parallel in a fresh environment; let one initial command finish so the npx cache install does not race.

## Docs Are SSOT

- Read `npx lee-spec-kit docs get agents --json` once at session start or right after context reset.
- Read every unread `requiredDocs[*].command` from that response.
- Resolve the active feature, then use that feature folder as the working SSOT.
- Minimum active feature docs: `spec.md`, `plan.md`, `tasks.md`, `decisions.md`.
- When GitHub workflow is involved, also use `issue.md` and `pr.md`.
- After reading the active feature docs, run `npx lee-spec-kit workflow-stage <featureRef> --json` and follow only that `nextAction`.
- If `workflow-stage --json` also returns `primaryActionLabel` and `actionOptions`, treat `primaryActionLabel` as the default option label and present the exact `actionOptions[*].reply` tokens to the user.

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

## Optional UI/UX Design Policy

- Only when the user request explicitly mentions a design system, UI/visual redesign, design consistency, shared UI/component-library consolidation, branding/theme/token redesign, or implementation from Figma/design images, read and apply `npx lee-spec-kit docs get ui-ux-design --json`.
- Do not apply this policy merely because the target is web/frontend, to a non-UI/backend Feature, or to a simple bug fix unrelated to durable design rules.
- This is optional guidance, not a `requiredDocs` entry or workflow approval gate.

## Execution Rules

- lee-spec-kit owns docs structure, workflow stages, and validators.
- Codex owns the execution loop, tool usage, and hook lifecycle.
- Do not start implementation unless `workflow-stage --json` reports `stage === "implementation"` and `implementationAllowed === true`.
- When `workflow-stage --json` returns `nextAction.category: pre_pr_review` with `executor: subagent`, run a fresh, read-only subagent review using the returned `model`, `reasoningEffort`, and `onUnavailable` policy. Do not select or require a named review skill.
- The Pre-PR review subagent returns findings without modifying code. The main agent remediates findings and records reviewer metadata and the final decision as evidence.
- Treat spec/plan/tasks approval, issue creation, and branch creation as hard gates before implementation.
- In standalone mode, do not hand-write `git worktree add`; run the exact `nextAction.command` from `workflow-stage` so the managed workspace path, stale directory cleanup, and `.env`/`.env.*` copy step stay consistent.
- In local mode, do not stop after implementation approval. Follow the exact `local verify`, `local merge`, and `local cleanup` commands returned by `workflow-stage` until verified integration and cleanup produce `done`. A `feature_remediation` stage explicitly permits fixes in the Feature worktree.
- In a `local-ff` or `local-squash` workflow, keep implementation approval and local merge approval distinct when `local_merge` is required: the first accepts the implementation, and the second authorizes the configured integration strategy, post-merge checks, and local cleanup.
- Keep docs synced with code changes in the same turn whenever behavior or scope changes.
- Use `npx lee-spec-kit commit-audit --json` before `git commit`; Feature-scoped commits use `#123` when an Issue is linked and the stable Feature ID such as `F027` for issue-less local workflows.
- Use `npx lee-spec-kit workflow-audit --json` as the default end-of-turn docs sync check.

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

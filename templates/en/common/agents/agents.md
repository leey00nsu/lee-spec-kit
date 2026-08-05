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

## Execution Rules

- lee-spec-kit owns docs structure, workflow stages, and validators.
- Codex owns the execution loop, tool usage, and hook lifecycle.
- Do not start implementation unless `workflow-stage --json` reports `stage === "implementation"` and `implementationAllowed === true`.
- Treat spec/plan/tasks approval, issue creation, and branch creation as hard gates before implementation.
- In standalone mode, do not hand-write `git worktree add`; run the exact `nextAction.command` from `workflow-stage` so the managed workspace path, stale directory cleanup, and `.env`/`.env.*` copy step stay consistent.
- Keep docs synced with code changes in the same turn whenever behavior or scope changes.
- Use `npx lee-spec-kit commit-audit --json` before `git commit` when staged docs paths need validation.
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

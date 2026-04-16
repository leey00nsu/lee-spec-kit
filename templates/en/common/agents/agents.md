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

## Docs Are SSOT

- Read `npx lee-spec-kit docs get agents --json` once at session start or right after context reset.
- Read every unread `requiredDocs[*].command` from that response.
- Resolve the active feature, then use that feature folder as the working SSOT.
- Minimum active feature docs: `spec.md`, `plan.md`, `tasks.md`, `decisions.md`.
- When GitHub workflow is involved, also use `issue.md` and `pr.md`.

## Execution Rules

- lee-spec-kit owns docs structure, workflow stages, and validators.
- Codex owns the execution loop, tool usage, and hook lifecycle.
- Keep docs synced with code changes in the same turn whenever behavior or scope changes.
- Use `npx lee-spec-kit commit-audit --json` before `git commit` when staged docs paths need validation.
- Use `npx lee-spec-kit workflow-audit --json` as the default end-of-turn docs sync check.

## Approval Rules

| Current action (examples) | What to share |
| --- | --- |
| Issue creation | Before `npx lee-spec-kit github issue <featureRef> --create` |
| PR creation | Before `npx lee-spec-kit github pr <featureRef> --create` |

- Ask the user for approval at documented workflow checkpoints and before remote or destructive actions.
- Share the exact artifact or plan before remote GitHub actions.

## Formatting Rules

- Replies: English unless project policy overrides it
- Code and filenames: English
- Dates and times: use the user's local system time

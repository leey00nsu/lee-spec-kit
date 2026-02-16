# Agents Guide

Operating rules for AI code assistants.
This document covers **policy only**.

---

## 🚨 User Approval Required (MUST)

> ⚠️ The actions below require explicit user approval (OK) before execution.
> ✅ Approval replies must be in `<label>` or `<label> OK` format (e.g. `A`, `A OK`).

| Action | When to confirm | What to share |
| --- | --- | --- |
| Spec writing | After writing `spec.md` | Full spec content |
| Task execution | Before each task | Task title |
| Commit creation | Before `git commit` | Commit message, included files |
| Issue creation | Before `gh issue create` | Title, body, labels |
| PR creation | Before `gh pr create` | Title, body, labels |
| Assignee change | When assigning someone else | Target username |
| Remote Git operations | Before `push`, `merge` (including merge commits) | Branch, changes |

Approval flow:
1. Share details first
2. Wait for explicit approval (OK)
3. Execute after approval (for command execution, default to `npx lee-spec-kit flow <featureRef> --approve <LABEL> --execute`)

Prohibited:
- Proceeding without user response

---

## 🧾 Label Response Contract (SSOT)

- End **every user-facing reply** with current status + available labels.
- Use the latest `npx lee-spec-kit context --json-compact` as the default source (fallback: `context --json` or `flow --json` when full detail is required).
- Use `actionOptions[].detail` or command `cmd` **verbatim**. Do not paraphrase.
- Even when the user asks something else, append the same label block at the end if executable labels exist.
- If no executable labels exist, print `Available labels: none` and guide re-check with `npx lee-spec-kit context`.
- If user input does not contain a valid label, do not execute; request label selection again.
- For approved command options, prefer one-shot `flow --approve <LABEL> --execute`; do not split `context --approve` and `context --execute --ticket` across turns/sessions.

Output format:

```text
Current status: <reasonCode or brief state>
Available labels:
A: <detail>
B: <detail>
Reply format: "<LABEL>" or "<LABEL> OK"
```

---

## 📚 Built-in Docs Read Policy (MUST)

- Use `docs get` once per session start (or right after context compression/reset).
- Do not re-read the same doc again in the same session.
- From `requiredDocs[*].command`, fetch only docs not yet read in this session.
- You may re-read only when:
  - user explicitly asks for policy refresh
  - policy/config changed (for example after `update`)
  - session restarted or context was compressed/reset

---

## Required References

- Highest-priority custom rules: `/docs/agents/custom.md`
- Project principles: `/docs/agents/constitution.md`
- Root guide: `npx lee-spec-kit docs get agents --json`
- Git workflow: `npx lee-spec-kit docs get git-workflow --json`
- Task execution: `npx lee-spec-kit docs get execute-task --json`
- Issue procedure/doc: `npx lee-spec-kit docs get create-issue --json` → `npx lee-spec-kit docs get issue-doc --json`
- PR procedure/doc: `npx lee-spec-kit docs get create-pr --json` → `npx lee-spec-kit docs get pr-doc --json`

---

## Scope Split

- Docs structure/path rules: use `docs/README.md` as SSOT
- ADR format: use feature `decisions.md` template as SSOT
- Issue/PR execution state: use each feature's `issue.md` and `pr.md` as SSOT

---

## Language / Formatting Rules

- Replies: English (or project language policy in `custom.md`)
- Code/file names: English
- Date/time: use user's local system time

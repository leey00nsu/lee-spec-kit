# Feature Implementation Process: Docs-first

This guide defines how to start or continue a feature in the Codex-native lee-spec-kit path.

---

## Start

1. Run `npx lee-spec-kit detect --json`.
2. If detected, read `npx lee-spec-kit docs get agents --json` and any unread follow-up docs.
3. If the feature folder does not exist yet:
   - preserve an explicit Idea ref only when the user actually named one (`I001`, `I001-slug`, or `docs/ideas/...`)
   - create the feature with `npx lee-spec-kit feature <name> --idea <ref>` only for that explicit ref
   - otherwise create it with `npx lee-spec-kit feature <name> -d "<description>"`
4. Resolve the active feature and read its docs: `spec.md`, `plan.md`, `tasks.md`, `decisions.md`.
5. Run `npx lee-spec-kit workflow-stage <feature-ref> --json` before taking the next workflow action.

## Working Rules

- Docs are the SSOT. Follow the active feature docs directly.
- Progress through the documented stages directly:
  - `spec.md` defines scope and review state
  - `plan.md` defines the implementation approach
  - `tasks.md` drives execution order
  - `issue.md` / `pr.md` are part of the stage gate once the feature reaches GitHub workflow stages
- Do not begin implementation just because `tasks.md` exists. Implementation starts only when `workflow-stage --json` allows it.
- When scope or behavior changes, update the active feature docs in the same turn before continuing.
- Ask for approval at documented review checkpoints and before remote or destructive actions.
- Use `npx lee-spec-kit commit-audit --json` before `git commit` when docs-path validation matters.
- Use `npx lee-spec-kit workflow-audit --json` before stopping when code or feature docs changed.

## Strict Rules

1. Do not invent issue/PR numbers or status transitions.
2. Do not skip required doc updates when scope, behavior, or evidence changed.
3. Do not treat unmanaged docs artifacts as the active workflow SSOT until they are normalized into the feature folder or allowlisted.

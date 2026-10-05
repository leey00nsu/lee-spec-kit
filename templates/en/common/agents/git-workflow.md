# Git Workflow Guide

Rules for AI agents to automate Git/GitHub operations.

---

## Core Concepts

| Concept          | GitHub Workflow | Local Workflow | Description                     |
| ---------------- | --------------- | -------------- | ------------------------------- |
| Feature          | GitHub Issue    | Feature ID     | Feature-level work unit         |
| Task             | Commit          | Commit         | Individual implementation unit  |
| Feature Complete | Pull Request    | Local merge    | Feature completion integration  |

---

## Branch Strategy

```
main
 └── feat/123-feature-name    # Branch based on Issue #123
      ├── commit 1: feat(#123): implement feature
      ├── commit 2: test(#123): add tests
      └── commit 3: docs(#123): update docs
```

### Branch Naming

```
{type}/{issue-number}-{feature-name}
```

| Type       | Description   |
| ---------- | ------------- |
| `feat`     | New feature   |
| `fix`      | Bug fix       |
| `refactor` | Refactoring   |
| `docs`     | Documentation |

**Examples:**

- `feat/123-user-auth`
- `fix/456-login-error`

---

## Commit Convention

> 📖 Type and Description follow [Udacity Git Commit Message Style Guide](https://udacity.github.io/git-styleguide/).

### Format

Use exactly one canonical Feature scope. Do not invent alternate scope forms.

```text
# Feature linked to a GitHub Issue
{type}(#{issue}): {description}

# Issue-less local Feature
{type}({featureId}): {description}
```

Examples:

```text
feat(#123): implement user auth
docs(#123): clarify auth spec
feat(K7M2Q9RX4DAB): implement notification settings
docs(K7M2Q9RX4DAB): update notification docs
```

For local Features, the scope is the stable Feature ID (`K7M2Q9RX4DAB`), not the full folder ref (`K7M2Q9RX4DAB-notification-settings`). Feature-scoped commits without a scope, such as `docs: K7M2Q9RX4DAB ...`, are not canonical.

### Type List

| Type       | Description   | Example                               |
| ---------- | ------------- | ------------------------------------- |
| `feat`     | New feature   | `feat(#123): implement user auth`     |
| `fix`      | Bug fix       | `fix(#123): fix login error`          |
| `refactor` | Refactoring   | `refactor(#123): separate auth logic` |
| `test`     | Tests         | `test(#123): add auth unit tests`     |
| `docs`     | Documentation | `docs(#123): clarify spec`            |
| `style`    | Code style    | `style(#123): fix lint errors`        |
| `chore`    | Other         | `chore(#123): update dependencies`    |

---

## Automation Workflow

> 📖 Read step guides via `docs get`, but do not re-read the same doc in the same session. (Re-read only after session/compression reset, policy/config changes, or explicit user refresh request.)

| Workflow       | Guide                                              |
| -------------- | -------------------------------------------------- |
| Feature Start  | `npx lee-spec-kit docs get create-feature --json` |
| Issue Creation | `npx lee-spec-kit docs get create-issue --json`   |
| Task Execution | `npx lee-spec-kit docs get execute-task --json`   |
| PR Creation    | `npx lee-spec-kit docs get create-pr --json`      |

### Branch Creation

The canonical branch/worktree command comes from `workflow-stage`:

```bash
npx lee-spec-kit workflow-stage <featureRef> --json
```

Run the returned `nextAction.command` instead of hand-writing the worktree path. In
`standalone` mode that command creates the worktree under the shared
`workspaceRoot/.worktrees/{project-name}/` root, removes stale managed directories
that are no longer registered Git worktrees, and copies existing `.env`/`.env.*` files
from the project root into the new worktree when the target file is absent.

For new embedded Features, run the returned `workspace prepare` command. It commits only that Feature seed, creates the managed branch/worktree, and returns its workingDirectory. Do not hand-write the worktree command.

> Continue implementation from the worktree path returned by `workflow-stage`.

### Document Commit Rules (Continuous Sync)

> 🔄 **Docs synchronization is mandatory when Project code changes.**

| Situation                 | Rule                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| **Project + Docs Change** | Must commit Docs **together with Project commit** (Maintain Sync)     |
| **Docs Only Change**      | If only docs changed (e.g., `custom.md` update), **commit Docs only** |

#### Standalone Mode Commit Guide

Use the scope selected by the workflow: `#123` when an Issue is linked, otherwise the local Feature ID such as `K7M2Q9RX4DAB`.

1. **Project Commit** (If code changed)

   ```bash
   git commit -m "feat(K7M2Q9RX4DAB): implement feature"
   ```

2. **Docs Commit** (If docs changed - **Run in Docs Repo**)
   ```bash
   git commit -m "docs(K7M2Q9RX4DAB): update feature docs"
   ```

> 💡 **Core Rule**: At task completion, **all changed repositories** must be committed.

---

## Docs Push Rules

> Refer to the `docsRepo` setting in `.lee-spec-kit.json`.

| Setting                                      | Behavior                        |
| -------------------------------------------- | ------------------------------- |
| `docsRepo: "embedded"`                       | docs included with project push |
| `docsRepo: "standalone"` + `pushDocs: false` | docs commit only, no push       |
| `docsRepo: "standalone"` + `pushDocs: true`  | push docs changes separately    |

### Standalone Mode Notes

- If `pushDocs: false`, docs changes are **committed locally only**
- If `pushDocs: true`, **push separately** after docs changes
- Project repo and docs repo are separate, **manage each independently**

---

## GitHub Setup Requirements

### Required

- [ ] GitHub CLI (`gh`) installed and authenticated
- [ ] Branch protection rules (main)
  - Require PR before merging

### Recommended

- [ ] Auto-delete head branches
- [ ] Squash merging only

## Feature isolation and integration

New GitHub Feature IDs come from Issues selected before SDD planning; new local IDs are 12-character random values. Existing F-number documents remain compatible. One Feature has one owner and one active task; different Features can proceed independently.

New standalone Features keep the primary docs checkout on its base branch and use `workspace prepare` for their docs worktree. The command commits only the Feature seed; work from the returned docsDirectory. Project and docs integration are separate. In local mode, verify code integration, verify docs integration, clean up docs and code, then confirm `done`. Knowledge and GitHub publication run independently. Failed integration never implies completion.

The new optional `workflow.docsCompletionStrategy` defaults to `inherit`, even when absent in older configs. Local docs follow code `completionStrategy`: `local-squash` creates one canonical Feature scope commit on the latest docs base with the receipt in its body; `local-ff` retains the empty ff receipt path. Explicit overrides require standalone managed local integration. GitHub mode retains ff and rejects a squash override; embedded docs integrate with code. Code strategy `none` does not authorize managed docs integration.

Keep all task checkpoints and strict commit gates on the source branch. Use `workspace sync-docs` when docs base advances, resolve conflicts there, and revalidate; internal sync merges do not enter the squash base history. Merge only the selected Feature SDD/artifacts/metadata and approved curated targets linked from task Docs lists. Measure net changes from the synchronized base to avoid attributing other Features' base changes to this Feature.

Squash preserves the original source tip in an internal evidence ref and an immutable `lee-spec-kit/docs-evidence/` tag. Receipts bind original/current base, source tip/tree, task checkpoint, integrated tree, strategy, approved scope and code verification. Publish the returned portableEvidenceRef with base only when remote publication is authorized; clones need that tag to restore internal evidence. Cleanup verifies receipt/tree/evidence rather than source ancestry. Valid completed squash receipts use the original task checkpoints, while later task edits and live multi-DONE commits still face the strict gate. Legacy ff receipts remain readable. Never rewrite existing history or force-push without a separate explicit request and backup/verification.

Use task claim/status/transition/release for explicit task IDs, with the current tasks hash and session token. Legacy task lines without IDs retain document transitions. Run feature-audit in CI; review sharedDocumentationWarnings for shared curated targets. PR merge retries do not automatically rebase or force-push.

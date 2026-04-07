# Public CLI Reference

These are the commands I expect people to reach for first in the normal workflow.
The surface is intentionally small so users do not need to remember every internal workflow command.
Lower-level agent commands are documented separately.

## Commands

### `init`

Initialize docs and workflow scaffolding for a project.

Common examples:

```bash
npx lee-spec-kit init
npx lee-spec-kit init --name my-project --type multi
npx lee-spec-kit init --name my-project --type fullstack
```

### `idea`

Capture an idea before implementation.

```bash
npx lee-spec-kit idea improve-auth-flow
```

### `feature`

Create a concrete work item.

```bash
npx lee-spec-kit feature user-auth
npx lee-spec-kit feature --component api user-auth
npx lee-spec-kit feature payment --id F123 --desc "Improve payment flow"
```

### `context`

Show the current feature state, the next recommended action, and whether user approval is needed.

```bash
npx lee-spec-kit context
npx lee-spec-kit context F001-alpha
```

### `flow`

Summarize the overall workflow state.

```bash
npx lee-spec-kit flow
npx lee-spec-kit flow F001-alpha
```

## Typical Agent-Executed Flow

```bash
npx lee-spec-kit init
npx lee-spec-kit idea improve-auth-flow
npx lee-spec-kit feature user-auth
npx lee-spec-kit context
npx lee-spec-kit flow
```

## Notes

- `context` reads the current feature state and next actions.
- `flow` combines context, status, and doctor into one workflow summary.
- These wrappers intentionally hide some approval and orchestration detail that still exists in `context` and `flow`.
- Detailed agent and internal commands are documented separately.

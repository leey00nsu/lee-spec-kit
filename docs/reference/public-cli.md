# Public CLI Reference

These are the public commands the main agent will most often run on behalf of the human.
Humans will often request work in natural language, and the agent will translate that request into these commands.

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

### `next`

Show the next recommended action for the current or selected feature.

```bash
npx lee-spec-kit next
npx lee-spec-kit next F001-alpha
```

### `check`

Summarize overall workflow status and health.

```bash
npx lee-spec-kit check
npx lee-spec-kit check F001-alpha
```

## Typical Agent-Executed Flow

```bash
npx lee-spec-kit init
npx lee-spec-kit idea improve-auth-flow
npx lee-spec-kit feature user-auth
npx lee-spec-kit next
npx lee-spec-kit check
```

## Notes

- `next` and `check` are public facades over the agent-oriented `context` and `flow` runners.
- Detailed agent and internal commands are documented separately.

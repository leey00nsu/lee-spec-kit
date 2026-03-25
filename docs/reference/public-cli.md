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

### `context`

Show the current feature state, next recommended action, and approval/execution guidance.

```bash
npx lee-spec-kit context
npx lee-spec-kit context F001-alpha
```

### `flow`

Summarize overall workflow status and health across context, status, and doctor checks.

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

- Detailed agent and internal commands are documented separately.

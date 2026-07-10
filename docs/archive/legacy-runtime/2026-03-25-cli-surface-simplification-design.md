# CLI Surface Simplification Design

**Goal:** Reposition `lee-spec-kit` as an agent-guided development harness by shrinking the public CLI surface, adding human-friendly facade commands, and making the README lead with the small set of commands humans actually use.

**Approach:** Keep the existing orchestration and internal commands for compatibility, but stop advertising them in the default help output. Add `next` and `check` as public facades over the existing `context` and `flow` behaviors, then rewrite the README opening sections around the new public surface.

**Key design points**

1. Public commands should stay small and human-oriented.
   - Public help should highlight `init`, `idea`, `feature`, `next`, and `check`.
   - The public mental model is “set up docs, create work, ask what is next, check overall health”.

2. Agent and internal commands remain supported but are no longer primary UX.
   - `detect`, `context`, and `flow` are still the agent contract.
   - `status`, `view`, `doctor`, `onboard`, `github`, `docs`, `requirements`, `setup`, `config`, `update`, and task/review run commands remain available for advanced or internal use.
   - Compatibility matters more than renaming every legacy command in one change.

3. `next` and `check` should be thin facades in the first iteration.
   - `next` reuses `context` behavior and messaging.
   - `check` reuses `flow` behavior and messaging.
   - This keeps implementation risk low while immediately improving discoverability.

4. Default help output should become intentionally opinionated.
   - The root help should list only the public commands.
   - Commander’s built-in `help [command]` entry may remain visible.
   - Hidden commands remain callable directly and still have their own `--help`.
   - The goal is smaller surface area, not feature removal.

5. README should match the public surface.
   - The opening copy should describe the CLI as an agent-guided harness rather than a large multi-command operator console.
   - Quick start should use `init`, `idea`/`feature`, `next`, and `check`.
   - The agent kickoff prompt remains, but detailed advanced command reference moves below the public workflow framing.

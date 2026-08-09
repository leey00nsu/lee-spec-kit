# Decisions Log

Record technical decisions and their rationale.
If unmanaged docs artifacts exist outside the canonical docs surface (for example `docs/plans/*` or `docs/superpowers/*`), capture the accepted trade-offs and rationale here so the active feature keeps its own decision trail.

> ADR (Architecture Decision Record) captures important technical or architectural choices made during implementation.
> Write ADRs so the team can trace why a choice was made and revisit trade-offs later.

> Format: `D{number}: {Decision Title} ({YYYY-MM-DD})`

Recording principles:

- Prefer `npx lee-spec-kit decision add <feature-ref> --title "..." --context "..." --decision "..." --rationale "..." --evidence "..."` when creating a new ADR.
- Every ADR must capture both **Decision (what was chosen)** and **Trace (how it was evaluated and validated)**.
- Use fixed timing checkpoints:
  - Task start (`[TODO] -> [DOING]`): add 1-3 lines for `Context/Constraints` and `Trace (initial hypothesis)`
  - Right before task done (`[DOING] -> [DONE]`): finalize `Options/Decision/Rationale` and enrich `Trace`
  - After PR merge: append 1-2 lines in `Trace (post-merge check)` with actual outcome/impact
- Every ADR must include at least one **Evidence link** (commit, PR, or test/log evidence).
- For a design-system change or exception, also record the affected rule and scope, rationale, removal condition, and synchronization impact on executable authorities.

---

## D001: {Decision Title} ({YYYY-MM-DD})

- **Context**: Problem situation or background
- **Constraints**: Constraints (time/technical/operations/compatibility)
- **Options**: Alternatives considered
- **Decision**: Final choice
- **Rationale**: Reason for choice
- **Trace**:
  - **At DOING start**: Initial reasoning/hypothesis
  - **Before DONE**: Finalized reasoning behind the selected option
  - **Post-merge check**: Actual outcome/impact observed
- **Evidence**:
  - **Commit**: Commit hash or link
  - **PR**: PR link
  - **Test/Log**: Test output/log/screenshot path
- **Consequences**: Results and impact (optional)

# Decisions Log

Record technical decisions and their rationale.
If unmanaged docs artifacts exist outside the canonical docs surface (for example `docs/plans/*` or `docs/superpowers/*`), capture the accepted trade-offs and rationale here so the active feature keeps its own decision trail.

> ADR (Architecture Decision Record) captures important technical or architectural choices made during implementation.
> Write ADRs so the team can trace why a choice was made and revisit trade-offs later.

> Format: `DNNN: {Decision Title} ({YYYY-MM-DD})`
> Decision IDs are scoped to this Feature and start at `D001`, independently of the Feature ID.

Recording principles:

- Prefer `npx lee-spec-kit decision add <feature-ref> --title "..." --context "..." --decision "..." --rationale "..." --evidence "..."` when creating a new ADR.
- Append manual entries after the last ADR in D001 → D002 order, never before the document guidance, and preserve existing IDs. Update the same ADR's Trace/Evidence for reruns and verification results; create a new ADR only for a new choice or scope change.
- Every ADR must capture both **Decision (what was chosen)** and **Trace (how it was evaluated and validated)**.
- Use fixed timing checkpoints:
  - Task start (`[TODO] -> [DOING]`): add 1-3 lines for `Context/Constraints` and `Trace (initial hypothesis)`
  - Right before task done (`[DOING] -> [DONE]`): finalize `Options/Decision/Rationale` and enrich `Trace`
  - After PR merge: append 1-2 lines in `Trace (post-merge check)` with actual outcome/impact
- Every ADR must include at least one **Evidence link** (commit, PR, or test/log evidence).
- For a design-system change or exception, also record the affected rule and scope, rationale, removal condition, and synchronization impact on executable authorities.

---

## Spec Clarification

Keep clarification questions here, before the D001 ADR section, so adding the first ADR preserves them. Use real `## SC-01: title` headings (`###` also accepted), then SC-02, independently of D001 numbering. The fenced example below is documentation only, not an OPEN question in this seed; copy it outside the fence only for an actual question. Keep field names and status values literally in English in both languages.

Allowed Status: OPEN | RESOLVED | DELEGATED | DEFERRED. OPEN blocks Spec clarification completion. Every terminal record requires non-placeholder Answer, Decision, and Spec Refs. RESOLVED records the actual user answer and resulting decision. DELEGATED records the user's explicit delegation plus the agent's choice and its scope. DEFERRED records the user's explicit agreement plus excluded scope and a concrete followup; Spec Refs points to the corresponding scope/acceptance criteria. Never infer consent from silence, a default, timeout, or exhausted review maxRounds.

Investigate facts and reuse previous answers before asking. Ask independent product/scope/acceptance/compatibility choices up to clarificationPolicy.maxQuestionsPerRound per round (from workflow.specClarification.maxQuestionsPerRound; default 3) with options, recommendation, and tradeoffs; wait for needed answers before dependent rounds. Do not ask routine implementation details. Record answers and update Spec scope/acceptance criteria in the same turn. Reopen affected choices on new material scope/behavior changes and reset Spec Clarification Status to Pending, preserving prior answers as history. Mark Complete only after all records are terminal and valid, with a substantive Spec Clarification Summary explaining why no questions were needed or how decisions were incorporated.

```markdown
## SC-01: {Product or scope choice}

- **Status**: OPEN
- **Question**: {Choice requiring user input}
- **Options**: {Alternatives and their tradeoffs}
- **Recommendation**: {Recommended choice and rationale}
- **Answer**: -
- **Decision**: -
- **Spec Refs**: -
```

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

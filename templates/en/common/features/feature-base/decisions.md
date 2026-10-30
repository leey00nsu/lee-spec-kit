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

## Performance improvement evidence

When performance improvement is a goal or a claimed outcome, add `### Performance Evidence` inside the relevant ADR. Do not add empty performance tables for unrelated changes. Copy the format below into applicable ADRs and fill it with actual measurements. Add dated remeasurements to the same decision with their conditions and source evidence; preserve the original As-Is and previous results instead of overwriting them with the newest values.

1. **Before implementation**: identify metrics, units, improvement direction, targets, and acceptable side effects linked to Spec requirements. Define the measurement procedure in the Plan Verification Contract and capture the baseline before changing the implementation within the authorized scope. If the original environment is unavailable, record why and identify any historical logs used. Never infer a historical baseline from the new implementation.
2. **Measurement conditions**: record each run's date/time/timezone, code commit SHA and uncommitted diff identifier when applicable, benchmark tool/script revision, reproducible command, cwd, and non-secret configuration. Include hardware, CPU/memory, OS, runtime, dependencies, deployment settings, dataset identity/size/seed, request pattern, concurrency/load, duration, cold/warm cache, warmup, repetitions, sample count, and aggregation method. Disclose condition differences that could affect performance.
3. **After implementation**: repeat the same scenario, metric definition, environment, load, and tooling. Separate scenarios and cold/warm results. Report appropriate distribution/variability statistics such as median/p95/p99, min/max, standard deviation, or confidence intervals only when actually calculated, with sample counts. Check relevant error rate, correctness, CPU, peak memory, cost, and other side effects alongside speed.
4. **Calculation and assessment**: absolute delta is `After - Before`; relative change is `(After - Before) / Before × 100`. Improvement is `(Before - After) / Before × 100` for lower-is-better metrics, and `(After - Before) / Before × 100` for higher-is-better metrics; positive improvement means better and negative means regression. Use `N/A` with a reason for a zero or missing baseline. Distinguish relative `%` from percentage-point (`pp`) changes for percentage metrics. Report noise-level differences, incomparable conditions, regressions, and missed targets honestly; do not attribute every observed difference to the code change.
5. **Evidence and handoff**: retain necessary non-secret raw logs, per-run values, profiles, and temporary measurement scripts/configuration under the actual active Feature's `artifacts/performance/`, with relative ADR links. Reference existing project benchmark code by path and revision; add durable benchmarks/tests only within the approved Verification Contract. Summarize the same values and link the ADR from `artifacts/change-report.html`, distinguishing targets, measurements, and unmeasured claims. The primary agent stores ADRs and supporting artifacts; workers measure within their existing write contract and return commands, conditions, results, and evidence file locations.

For future trends, use stable metric keys such as `api.search.latency.p95`, independent of Feature IDs, with scenario/statistic definitions. Separate series when definitions, environments, or data change; do not sum improvement percentages across changes. `decision add` creates the base ADR; enrich that ADR with the performance section below afterward.

**Hypothetical calculation, not measurements of this repository:** p95 latency 420 → 250 ms means -170 ms absolute delta, -40.48% relative change, and +40.48% improvement. Throughput 120 → 180 req/s means +60 req/s and +50% improvement; if peak memory also rises from 220 → 250 MiB, record that +30 MiB memory regression too.

The placeholders below describe a format, not execution evidence. Mark unavailable results as unmeasured or incomparable, explain missing conditions and how to address them, and record real follow-up work where needed. Keep deployment measurements separate from development results and make production claims only after actual production verification. This is an authoring/review policy, not a new automatic benchmark runner or workflow approval gate.

```markdown
### Performance Evidence

- **Requirement / Scenario**: {Performance requirement, user scenario, observation boundary}
- **Goal / Guardrails**: {Target and acceptable error, correctness, resource, and cost limits}
- **Status**: {Measured / Unmeasured / Incomparable, with reason}
- **Before Run**: {Timestamp/timezone, code SHA/diff, tool/script revision}
- **After Run**: {Timestamp/timezone, code SHA/diff, tool/script revision}
- **Environment / Workload**: {Both environments, dataset, load, cache, and differences}
- **Reproduce**: {Cwd, before/after commands, non-secret configuration}
- **Sampling / Statistics**: {Warmup, repetitions, samples, aggregation, variability, excluded runs/reasons}

| Metric / scenario / statistic | Unit | Better direction | Before (measured) | After (measured) | Absolute delta | Relative change (%) | Improvement (%) | Target / assessment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {Metric} | {Unit} | {Lower / Higher} | {Value} | {Value} | {After-Before} | {Value or N/A} | {Value or N/A} | {Met / Regressed / Uncertain} |

- **Side Effects / Limitations**: {Errors, correctness, resources, cost, noise, differing conditions, attribution limits}
- **Evidence**: [Before raw data](artifacts/performance/before.json), [After raw data](artifacts/performance/after.json) — replace with actual retained files
- **Conclusion / Follow-up**: {Verified effect, unverified scope, further checks needed}
```

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

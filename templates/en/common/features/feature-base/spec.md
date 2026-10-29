# Feature Spec: {feature-name}

> Tech stack is covered in plan.md.

---

## Overview

- **Feature ID**: F{number}
- **Feature Name**: {feature-name}
- **Target Repo**: {{projectName}}-{component}
- **Created**: {YYYY-MM-DD}
- **Status**: -
  - Values: Draft | Review | Approved

---

## Purpose

{{description}}

(Why is this feature needed? What problem does it solve?)

---

## Spec Clarification

- **Clarification Status**: Pending
- **Clarification Summary**: -

Allowed status: Pending | Complete. Before Complete, explain in the summary why investigation and prior answers left no questions, or how the recorded decisions were incorporated into scope and acceptance criteria. A placeholder summary is not completion.

Record questions as real `## SC-01: title` headings (`###` also accepted) in [decisions.md](decisions.md), independently of D001 ADRs. OPEN questions block completion. Each RESOLVED, DELEGATED, or DEFERRED record needs substantive Answer, Decision, and Spec Refs: respectively an actual user answer, explicit user delegation with the agent's choice/scope, or explicit user agreement to defer with excluded scope/followup. Silence or timeout is not consent.

Investigate facts first; ask independent product/scope/acceptance/compatibility choices up to clarificationPolicy.maxQuestionsPerRound per round (from workflow.specClarification.maxQuestionsPerRound; default 3) with options, a recommendation, and tradeoffs. Wait for needed answers before dependent questions; reuse prior answers and do not ask routine implementation details. Record answers and update acceptance criteria in the same turn. Reopen affected choices and reset Pending for new material scope/behavior changes. Keep the HTML report a draft during inquiry and update it before existing Spec approval. Review maxRounds never auto-completes questions.

---

## Before / After Comparison

- **Change report**: [As-Is / To-Be](artifacts/change-report.html)
- Write and present the report before Spec review. Follow `npx lee-spec-kit docs get create-feature --json` for authoring guidance.
- Compare the same user scenario before and after the change. For a new capability, describe its current absence or manual workaround.

| Comparison | As-Is: current state and evidence | To-Be: proposed behavior | Requirement / verification |
| --- | --- | --- | --- |
| {Key scenario} | {Code, screen, observation, or explicitly unknown} | {Expected behavior after the change} | {US/FR/AC and verification method} |

---

## User Stories

### US-1: {Story Title}

**As a** {user type}
**I want** {desired action}
**So that** {reason/value}

**Acceptance Criteria:**

- [ ] (verification condition)

---

## Functional Requirements

### FR-1: {Requirement Title}

(Detailed description)

---

## Non-Functional Requirements

- **Performance**:
- **Security**:

---

## Related Documents

- PRD: `../../prd/`
- PRD Refs: - (e.g. `PRD-FR-001`, `PRD-US-002`, `PRD-SCOPE-V1-DESKTOP-EDITOR`)
  - Only list IDs that already exist in the source requirements doc. Do not invent PRD IDs in `spec.md` or `tasks.md`.
  - If this is a legacy requirements doc without PRD IDs yet, backfill IDs in the source first, then update this field and the `tasks.md` task tags together.
  - When requirements/scope change, update PRD docs + this field + `tasks.md` task tags together.
  - If implementation discovers a better user-facing behavior and the shipped requirement changes, treat that as a PRD update, not a permanent `[NON-PRD]` exception.
- Design Refs: - (optional; use project-root paths only for explicit UI/UX design work)
  - Design System: - (e.g. `docs/designs/design-system.md`)
  - Visual Brief: - (e.g. `docs/designs/<feature-visual-brief>.md`)

# Legacy Configuration and Runtime Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canonicalize active workflow configuration, enforce the documented Pre-PR evidence policy, migrate approval compatibility settings, and remove confirmed legacy repository artifacts.

**Architecture:** Keep runtime read compatibility at the `workflow-stage` boundary, but make `init` and `update` emit only the current canonical configuration. Put migration behavior behind focused pure helpers in `update.ts`, and make Pre-PR evidence satisfaction depend on the active config and docs topology. Repository-only cleanup remains behavior preserving and is committed separately.

**Tech Stack:** TypeScript 5.9, Commander, fs-extra, Vitest 4, Node.js CLI integration tests, pnpm

## Global Constraints

- `workflow.mode` is canonical; valid `mode` always wins over legacy `preset`.
- `preset=strict` migrates to `mode=github` and defaults `requireWorktree` to `true` without overriding an explicit value.
- Projects that have not run `update` retain runtime support for `preset`, `approval.mode=steps`, and `approval.mode=builtin`.
- `path_required` evidence must be an existing file inside `config.docsDir`; `any` requires only a non-empty value.
- Do not remove the `integrations codex` alias `codex-bootstrap` or persisted Codex marker strings.
- Every behavior change follows RED → GREEN → refactor and is covered by a focused test before implementation.
- Commits use the repository's Conventional Commit style and are grouped by behavior, cleanup, and documentation.

---

### Task 1: Canonical workflow and approval migration

**Files:**
- Create: `tests/cli-config-migration.test.mjs`
- Modify: `src/commands/update.ts`
- Modify: `src/commands/init.ts`
- Modify: `src/config/types.ts`

**Interfaces:**
- Consumes: existing `.lee-spec-kit.json` objects loaded by `backfillMissingConfigDefaults(cwd, docsDir)`.
- Produces: canonical `workflow.mode`, migrated category approval configuration, and config files without removed legacy runtime fields.

- [ ] **Step 1: Write failing CLI migration tests**

Add table-driven cases that run `update --agents-md --force` against configs containing:

```js
[
  { workflow: { preset: 'local' }, expected: { mode: 'local' } },
  { workflow: { preset: 'github' }, expected: { mode: 'github' } },
  { workflow: { preset: 'strict' }, expected: { mode: 'github', requireWorktree: true } },
  { workflow: { preset: 'strict', requireWorktree: false }, expected: { mode: 'github', requireWorktree: false } },
  { workflow: { preset: 'local', mode: 'github' }, expected: { mode: 'github' } },
  { workflow: { mode: 'local' }, expected: { mode: 'local' } },
]
```

Assert `preset` is absent after update. Add a legacy approval case:

```js
approval: { mode: 'steps', requireCheckSteps: [3, 10] }
```

Expected category policy:

```js
{
  mode: 'category',
  default: 'keep',
  requireCheckCategories: ['spec_approve', 'task_execute', 'implementation_approve'],
  skipCheckCategories: [
    'spec_write', 'plan_write', 'plan_approve', 'tasks_write', 'tasks_approve',
    'issue_prepare', 'issue_create', 'branch_create', 'pre_pr_review',
    'pr_prepare', 'pr_create', 'code_review', 'pr_merge'
  ]
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/cli-config-migration.test.mjs`

Expected: preset-only local becomes GitHub, strict loses its historical worktree requirement, or the new test cannot observe canonical migration.

- [ ] **Step 3: Implement canonical migration and remove generated dead settings**

In `update.ts`, add constants for the legacy step/category mapping and pure normalization helpers. Migration order:

```ts
const mode = workflow.mode === 'local' || workflow.mode === 'github'
  ? workflow.mode
  : workflow.preset === 'local'
    ? 'local'
    : 'github';

workflow.mode = mode;
if (workflow.mode was absent && workflow.preset === 'strict' && workflow.requireWorktree === undefined) {
  workflow.requireWorktree = true;
}
delete workflow.preset;
delete workflow.auto;
```

Delete the obsolete Pre-PR keys and `approval.taskExecuteCheck` during update. Convert `mode=steps` using the exact mapping currently encoded by `LEGACY_STEP_BY_ACTION`. Stop writing `preset`, `workflow.auto`, and obsolete Pre-PR fields in `init.ts`. Remove obsolete fields from the public config type while retaining deprecated `preset`, `steps`, and `requireCheckSteps` read compatibility.

- [ ] **Step 4: Run focused tests and typecheck for GREEN**

Run:

```bash
pnpm vitest run tests/cli-config-migration.test.mjs tests/cli-init-feature-github.test.mjs
pnpm typecheck
```

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the behavior and tests**

```bash
git add src/commands/update.ts src/commands/init.ts src/config/types.ts tests/cli-config-migration.test.mjs
git commit -m "fix: migrate legacy workflow configuration"
```

---

### Task 2: Enforce Pre-PR evidence policy

**Files:**
- Modify: `src/utils/workflow-stage.ts`
- Modify: `tests/cli-workflow-stage.test.mjs`

**Interfaces:**
- Consumes: `ProjectConfig`, the resolved active feature path, and parsed `Pre-PR Evidence` text.
- Produces: a boolean evidence result used by `prePrSatisfied`.

- [ ] **Step 1: Write failing evidence-policy tests**

Add tests proving:

1. default/path-required mode stays in `pre_pr_review` when evidence names a missing file;
2. path-required mode advances when evidence names the existing feature `decisions.md`;
3. `evidenceMode=any` advances with a non-path evidence note;
4. `../outside.md` and an absolute file outside `docsDir` do not satisfy path-required mode.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run tests/cli-workflow-stage.test.mjs -t "Pre-PR evidence"`

Expected: the missing and outside paths currently advance because only non-empty evidence is checked.

- [ ] **Step 3: Implement evidence resolution**

Change `prePrSatisfied` to accept `config` and the resolved feature. For `any`, retain the non-empty check. For `path_required`, build candidates from `config.docsDir`, `feature.path`, and the embedded docs parent when the value starts with `docs/`; accept only existing regular files whose resolved path is equal to or contained by `config.docsDir`.

- [ ] **Step 4: Run focused and full workflow-stage tests for GREEN**

Run:

```bash
pnpm vitest run tests/cli-workflow-stage.test.mjs
pnpm typecheck
```

Expected: all workflow-stage tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the evidence gate**

```bash
git add src/utils/workflow-stage.ts tests/cli-workflow-stage.test.mjs
git commit -m "fix: enforce pre-pr evidence policy"
```

---

### Task 3: Remove confirmed dead compatibility artifacts

**Files:**
- Delete: `src/commands/setup.ts`
- Delete: `src/utils/codex-bootstrap.ts`
- Delete: `src/adapters/schema/openspec/README.md`
- Delete: `.npmignore`
- Modify: `src/utils/local-workflow-template.ts`
- Modify: `tests/cli-init-feature-github.test.mjs`

**Interfaces:**
- Consumes: current `integrationsCommand`, Codex integration modules, and the two used local-template entry points.
- Produces: the same CLI/package behavior with no unreachable wrappers or helper export.

- [ ] **Step 1: Add local workflow characterization assertions**

Extend the local init/feature test to create `F001-alpha` and assert:

```js
assert.equal(await pathExists(path.join(featureDir, 'issue.md')), false);
assert.equal(await pathExists(path.join(featureDir, 'pr.md')), false);
assert.doesNotMatch(tasks, /Pre-PR Review|PR 전 리뷰/);
assert.match(tasks, /Local Tracking|로컬 추적 정보/);
```

- [ ] **Step 2: Run characterization tests before cleanup**

Run: `pnpm vitest run tests/cli-init-feature-github.test.mjs -t "non-interactive"`

Expected: PASS, establishing behavior before deletion.

- [ ] **Step 3: Delete dead artifacts and the unused helper**

Delete the two source wrappers, the OpenSpec placeholder, `.npmignore`, and only `applyLocalWorkflowTemplateToFeatureBase`. Keep `applyLocalWorkflowTemplateToContent` and `applyLocalWorkflowTemplateToFeatureDir`.

- [ ] **Step 4: Verify build, typecheck, characterization, and package contents**

Run:

```bash
pnpm typecheck
pnpm build
pnpm vitest run tests/cli-init-feature-github.test.mjs -t "non-interactive"
npm pack --dry-run --json
```

Expected: all commands exit 0 and the package contains only `dist`, `templates`, `assets`, package metadata, README files, and LICENSE.

- [ ] **Step 5: Commit dead artifact removal**

```bash
git add -A src/commands/setup.ts src/utils/codex-bootstrap.ts src/adapters/schema/openspec/README.md src/utils/local-workflow-template.ts tests/cli-init-feature-github.test.mjs .npmignore
git commit -m "refactor: remove legacy compatibility artifacts"
```

---

### Task 4: Align integration naming and archive obsolete runtime plans

**Files:**
- Rename: `tests/cli-setup-codex-bootstrap.test.mjs` → `tests/cli-integrations-codex.test.mjs`
- Modify: `src/commands/integrations.ts`
- Modify: `src/utils/locales/en/cli.ts`
- Modify: `src/utils/locales/ko/cli.ts`
- Modify: references to the renamed test under `docs/`
- Create: `docs/archive/legacy-runtime/README.md`
- Move: `docs/plans/2026-03-07-steps-substate-state-machine.md`
- Move: `docs/plans/2026-03-10-context-json-compact-hot-path-design.md`
- Move: `docs/plans/2026-03-10-context-json-compact-hot-path.md`
- Move: `docs/plans/2026-03-10-context-json-compact-token-analysis.md`
- Move: `docs/plans/2026-03-10-review-running-tracked-state-design.md`
- Move: `docs/plans/2026-03-10-review-running-tracked-state.md`
- Move: `docs/plans/2026-03-19-auto-step-progression-design.md`
- Move: `docs/plans/2026-03-19-auto-step-progression.md`
- Move: `docs/plans/2026-03-25-cli-surface-simplification-design.md`
- Move: `docs/plans/2026-03-25-cli-surface-simplification.md`
- Move: `docs/plans/2026-03-31-approval-default-migration.md`

**Interfaces:**
- Consumes: locale lookup keys internal to the CLI and dated historical plan documents.
- Produces: unchanged user-facing text and a clear separation between current reference docs and removed runtime history.

- [ ] **Step 1: Rename internal integration locale keys**

Replace `setup.codexBootstrap*` and `setup.codexHooks*` keys with `integrations.codexBootstrap*` and `integrations.codexHooks*` in command and locale files. Do not rename marker constants or the `codex-bootstrap` command alias.

- [ ] **Step 2: Rename the integration test file and references**

Rename the test file and update plan references that invoke it. Test bodies may retain marker-related wording where it describes persisted compatibility behavior.

- [ ] **Step 3: Archive obsolete runtime plans**

Move plans whose primary implementation targets were deleted `context`, `flow`, `FlowOrchestrator`, `ActionExecutor`, or PrePrReviewValidator runtime files. Add an archive README stating that these are historical records and that `docs/reference/` is the current product contract.

- [ ] **Step 4: Verify names and focused integration tests**

Run:

```bash
rg "setup\.codex|cli-setup-codex-bootstrap" src tests docs
pnpm vitest run tests/cli-integrations-codex.test.mjs
pnpm lint
pnpm lint:test
```

Expected: `rg` returns no matches; tests and linters exit 0.

- [ ] **Step 5: Commit naming and documentation cleanup**

```bash
git add src/commands/integrations.ts src/utils/locales/en/cli.ts src/utils/locales/ko/cli.ts tests/cli-integrations-codex.test.mjs docs
git commit -m "docs: archive removed runtime plans"
```

---

### Task 5: Final verification and independent review

**Files:**
- Verify only

**Interfaces:**
- Consumes: the complete branch diff from the design commit through cleanup commits.
- Produces: verification evidence and independent review findings; any fixes are committed with the behavior they correct.

- [ ] **Step 1: Run the complete local gate**

```bash
pnpm lint
pnpm lint:test
pnpm typecheck
pnpm typecheck:test
pnpm build
pnpm vitest run
npm pack --dry-run --json
```

- [ ] **Step 2: Run the TypeScript no-excuse audit and file-size review**

Run the programming skill's TypeScript checker for changed TypeScript files, then measure pure LOC for every changed source file. Fix new violations; record pre-existing oversized modules without expanding scope.

- [ ] **Step 3: Dispatch independent subagent reviews**

Run three read-only reviews in parallel:

1. workflow/config migration and compatibility;
2. Pre-PR evidence and test correctness;
3. complete branch diff for regressions, dead references, and packaging/docs consistency.

- [ ] **Step 4: Fix all Critical and Important findings and re-review**

Apply fixes with focused tests and create a `fix:` commit when a finding spans an already committed task. Repeat review until no blocking findings remain.

- [ ] **Step 5: Re-run the complete gate and inspect final history**

Run the complete Step 1 gate again, then inspect `git status --short` and `git log --oneline main..HEAD`. The worktree must be clean and commits must remain atomic.

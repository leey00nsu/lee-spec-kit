export const enWarnings = {
  projectBranchUnavailable:
    'Cannot determine project branch. (In standalone mode, projectRoot is required.)',
  projectExpectedBranchOnMainWorkspace:
    'Feature branch is checked out in the main workspace. Prefer working from a `.worktrees/*` path.',
  workflowWorktreeRequired:
    'With `workflow.requireWorktree=true`, task execution is allowed only from `.worktrees/*` paths.',
  docsGitUnavailable:
    'Cannot read git status for the docs repo. (Check repo location / git init.)',
  docsPathIgnored:
    'Current feature docs path is ignored by git: {path} (docs commit detection may be limited).',
  docsUncommittedChanges:
    'Docs changes are not committed. (Additional docs commit needed.) Check commit message rules against the git-workflow guide.',
  projectUncommittedChanges:
    'Project code changes are not committed. (Additional code commit needed.)',
  featureScopeSplitSuggested:
    'Feature scope may be too large for one issue (tasks: {taskCount}, decisions lines: {decisionsLineCount}; suggest split at {taskThreshold} tasks or {decisionsThreshold} decision lines). Current recommendation: split into {recommendedIssues} issue units (hard 4-way rule: tasks >= {recommendFourTaskThreshold} or decisions lines >= {recommendFourDecisionsThreshold}).',
  legacyTasksDocStatusField:
    'Legacy tasks.md format detected. Add a `Doc Status` field (Draft/Review/Approved) to enable tasks approval.',
  legacyTasksPrFields:
    'Legacy tasks.md format detected. Add `PR` and `PR Status` fields before PR steps.',
  legacyTasksPrePrReviewField:
    'Legacy tasks.md format detected. Add `Pre-PR Review` before PR steps. (`- **Pre-PR Review**: Pending | Done`)',
  legacyTasksPrePrEvidenceField:
    'Legacy tasks.md format detected. Add `Pre-PR Evidence` before PR steps.',
  legacyTasksPrePrDecisionField:
    'Legacy tasks.md format detected. Add `Pre-PR Decision` before PR steps. (`- **Pre-PR Decision**: decision: ...`)',
  legacyTasksPrReviewEvidenceField:
    'Legacy tasks.md format detected. Add `PR Review Evidence` before review iteration.',
  legacyTasksPrReviewDecisionField:
    'Legacy tasks.md format detected. Add `PR Review Decision` before review iteration. (`- **PR Review Decision**: decision: ...`)',
  workflowSpecNotApproved:
    'Implementation is done but spec.md Status is not Approved. (Update spec.md Status to Approved.)',
  workflowPlanNotApproved:
    'Implementation is done but plan.md Status is not Approved. (Update plan.md Status to Approved.)',
  workflowIssueMissing:
    'Implementation is done but Issue Number is missing. (Fill Issue Number in tasks.md.)',
  workflowProjectUncommittedChanges:
    'Commit project code changes before completing workflow. (Project worktree has uncommitted changes.)',
  workflowPrLinkMissing:
    'Implementation is done but PR link is missing. (Fill the PR field in tasks.md.)',
  workflowPrStatusMissing:
    'Implementation is done but PR Status is missing. (Set PR Status to Review during PR creation/review stages.)',
  workflowPrStatusNotApproved:
    'Implementation is done but PR Status is not Approved. (Keep PR Status as Review before merge and sync to Approved only after successful merge.)',
  workflowPrReviewEvidenceMissing:
    'In review stage, `PR Review Evidence` is empty/invalid. (Use `summary: ...`/`요약: ...`, or point to a `PR Review Log` section with `Summary` and `Decision`.)',
  workflowPrReviewDecisionMissing:
    'In review stage, `PR Review Decision` is empty/placeholder or missing decision format. (Use `decision: ...` or `결정: ...`.)',
  workflowPrRemoteChangesRequested:
    'Remote PR shows changes requested or additional review required. Address comments, push, then re-check.',
  workflowPrRemoteChecksFailing:
    'Remote PR has {count} failing check(s). Fix failures, then re-check.',
  workflowPrRemoteChecksPending:
    'Remote PR has {count} pending check(s). Wait for checks to complete, then re-check.',
  workflowPrePrReviewMissing:
    'Implementation is done but `Pre-PR Review` is missing. (Add `- **Pre-PR Review**: Pending | Done` in tasks.md.)',
  workflowPrePrReviewNotDone:
    'Implementation is done but `Pre-PR Review` is not Done. (Run pre-PR review, then update it to Done.)',
  workflowPrePrEvidenceMissing:
    'Implementation is done but `Pre-PR Evidence` is empty/invalid. (Point to an existing file and include `Pre-PR Review Log` with non-placeholder `Summary`, `Feature Intent Summary`, `Implementation Fit`, `Missing Cases`, `Spec Alignment Checked`, `Finding Count`, `Blocking Findings`, `Decision`, `Findings` (or explicit `0 findings`), and `Residual Risks`.)',
  workflowPrePrDecisionMissing:
    'Implementation is done but `Pre-PR Decision` is empty/invalid. (Use `decision: approve|changes_requested|blocked ...`.)',
  workflowPrePrDecisionNotApproved:
    'Implementation is done but `Pre-PR Decision` is `{outcome}`. Resolve review risks and re-run pre-PR review until decision becomes `approve`.',
} as const;

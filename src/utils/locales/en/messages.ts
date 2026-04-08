export const enMessages = {
  specCreate:
    'Write spec.md and change Status to Review. (Follow the agents guide baseline.)',
  specImprove: 'Improve spec.md and change Status to Review.',
  specApproval:
    'Share spec.md with the user and get explicit progress approval (provide a label response).',
  planCreate:
    'Write plan.md and change Status to Review. (Follow the agents guide baseline.)',
  planImprove: 'Improve plan.md and change Status to Review.',
  planApproval:
    'Share plan.md with the user and get explicit progress approval (provide a label response).',
  tasksCreate:
    'Write tasks.md and change Doc Status to Review. (Follow the agents/execute-task guide baseline.)',
  tasksNeedAtLeastOne: 'Write at least 1 task in tasks.md.',
  tasksImprove: 'Improve tasks.md and change Doc Status to Review.',
  tasksApproval:
    'Share tasks.md with the user and get progress approval (provide a label response). (Then set Doc Status to Approved)',
  docsCommitPlanning:
    'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(planning): {folderName} planning docs"',
  issueCreateAndWrite:
    'Generate the issue body template, refine goals/completion criteria, get explicit label approval, create the issue, then update issue number in tasks.md and prepare a docs commit.',
  issuePrepareFromDoc:
    'Use `issue.md` to refine issue title/body/labels draft, get explicit label approval, then set status to `Ready`.',
  issueCreateFromDoc:
    'When `issue.md` status is `Ready`, create the GitHub Issue and sync the created issue number into `tasks.md`.',
  docsCommitIssueUpdate:
    'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(#{issueNumber}): {folderName} docs update"',
  docsCommitUpdate:
    'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs: {folderName} docs update"',
  projectCommitIssueUpdate:
    'cd "{projectGitCwd}" && (git diff --cached --quiet && echo "No staged files. Stage only files changed in this task with git add [files], then run again." && exit 1 || git commit -m "feat(#{issueNumber}): {commitTopic}")',
  projectCommitUpdate:
    'cd "{projectGitCwd}" && (git diff --cached --quiet && echo "No staged files. Stage only files changed in this task with git add [files], then run again." && exit 1 || git commit -m "feat({folderName}): {commitTopic}")',
  reviewFixCommitIssueGuidance:
    'Commit PR review fixes. Stage only review-fix files, then commit with `fix(#{issueNumber}): <review-fix-summary>`. `<review-fix-summary>` must describe review comments resolved in this commit (do not reuse task titles).',
  reviewFixCommitGuidance:
    'Commit PR review fixes. Stage only review-fix files, then commit with `fix(review): <review-fix-summary>`. `<review-fix-summary>` must describe review comments resolved in this commit (do not reuse task titles).',
  prePrFixCommitIssueGuidance:
    'Commit fixes requested by pre-PR review. Stage only pre-PR fix files, then commit with `fix(#{issueNumber}): <pre-pr-fix-summary>`. `<pre-pr-fix-summary>` must describe findings resolved from pre-PR review.',
  prePrFixCommitGuidance:
    'Commit fixes requested by pre-PR review. Stage only pre-PR fix files, then commit with `fix(pre-pr): <pre-pr-fix-summary>`. `<pre-pr-fix-summary>` must describe findings resolved from pre-PR review.',
  standaloneNeedsProjectRoot:
    'Standalone mode requires projectRoot. (npx lee-spec-kit config --project-root ...)',
  createBranch:
    'cd "{projectGitCwd}" && mkdir -p .worktrees && (git worktree add ".worktrees/feat-{issueNumber}-{slug}" "feat/{issueNumber}-{slug}" || git worktree add -b "feat/{issueNumber}-{slug}" ".worktrees/feat-{issueNumber}-{slug}") && WT="{projectGitCwd}/.worktrees/feat-{issueNumber}-{slug}" && for f in .env .env.local .env.development .env.development.local .env.test .env.test.local .env.production .env.production.local; do [ -f "{projectGitCwd}/$f" ] && [ ! -e "$WT/$f" ] && cp "{projectGitCwd}/$f" "$WT/$f" || true; done && echo "worktree: {projectGitCwd}/.worktrees/feat-{issueNumber}-{slug}"',
  moveToExistingWorktree:
    'A matching feature worktree already exists. Move first: `cd "{worktreePath}"`, then re-run context.',
  worktreeRequiredFromMainBranch:
    '`workflow.requireWorktree` is enabled, but this feature branch is checked out in the main workspace. Switch the main workspace to a base branch first, then create/reuse `.worktrees/feat-{issueNumber}-{slug}` and continue from that worktree.',
  worktreeCleanupCommand:
    'cd "{projectGitCwd}" && WT="{worktreePath}" && ROOT="$(pwd)" && case "$WT" in "$ROOT"/.worktrees/*) if git worktree list --porcelain | grep -Fxq "worktree $WT"; then git worktree remove --force "$WT" || true; fi; [ -d "$WT" ] && rm -rf "$WT" || true ;; *) echo "skip unsafe worktree path: $WT" ;; esac && git worktree prune && CURRENT_BRANCH=$(git branch --show-current) && DEFAULT_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | cut -d/ -f2-) && TARGET_BRANCH="${DEFAULT_BRANCH:-$CURRENT_BRANCH}" && if [ -n "$TARGET_BRANCH" ]; then git checkout "$TARGET_BRANCH" >/dev/null 2>&1 || true; fi && if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1 && [ -z "$(git status --porcelain)" ]; then git pull --ff-only || true; fi',
  tasksAllDoneButNoChecklist:
    'Create the completion checklist. Add verification items to the tasks.md "Completion Criteria" section, then mark satisfied items as [x] after user confirmation. Record explicit final approval as well.',
  tasksAllDoneButChecklist:
    'Proceed with remaining completion checklist items. Current progress: ({checked}/{total}) Mark items as [x] only after user confirmation and real verification. Record explicit final approval as well.',
  finishDoingTask:
    'Continue working on the current DOING/REVIEW task: "{title}" ({done}/{total}) After it is complete, share outcome/verification and mark it DONE',
  startNextTodoTask:
    'Start the next TODO task: "{title}" ({done}/{total}) Mark it DOING when you begin work',
  checkTaskStatuses: 'Check task statuses. ({done}/{total})',
  taskCommitGateStrictBlock:
    'Before moving to the next TODO task, you must satisfy the `1 task = 1 commit` rule. Check result: {reason}. Re-align task commit boundaries, then continue.',
  taskCommitGateWarnProceed:
    '⚠️ Task commit boundary warning: {reason}. You may continue, but `1 task = 1 commit` is recommended.',
  taskCommitGateReasonNoTasksCommit: 'No recent project code commit was found',
  taskCommitGateReasonTasksFileUnavailable:
    'Cannot read recent project code commit history',
  taskCommitGateReasonDoneCount:
    'DONE transitions detected in the latest tasks.md commit ({count})',
  taskCommitGateReasonMismatchLastDone:
    'The latest project code commit does not match the last completed task',
  prLegacyAsk:
    'tasks.md is missing PR/PR Status fields. Update to the latest template format? (CHECK required)',
  prePrReviewFieldMissing:
    'tasks.md is missing the `Pre-PR Review` field. Add `- **Pre-PR Review**: Pending | Running | Done` and run context again. (CHECK required)',
  prePrReviewRun:
    'Prepare the pre-PR review handoff, then continue the real review before recording anything. Generate structured `review-trace.json` evidence with `baseSha`, `headSha`, `changedFiles`, `reviewedFiles`, `riskSummaries`, `Approval Rationale`, per-file findings, and `Residual Risks`, then record the outcome with `pre-pr-review`. `pre-pr-review-run` itself does not complete the review or advance state. (CHECK required)',
  prePrReviewRunning:
    'A pre-PR review is already in progress. Reuse or resume the delegated review, generate structured `review-trace.json` evidence, then record the result with `pre-pr-review`. Do not re-approve the same label. (CHECK required)',
  prePrReviewEvidenceMissing:
    'tasks.md `Pre-PR Evidence` is empty/invalid. Point it to a real JSON file that uses repo-relative paths and includes `baseSha`, `headSha`, `changedFiles`, `reviewedFiles`, `riskSummaries`, `Approval Rationale`, per-file findings, and `Residual Risks`. (CHECK required)',
  prePrReviewDecisionMissing:
    'tasks.md `Pre-PR Decision` is empty/placeholder or missing decision format. Record it as `decision: ...` (or `결정: ...`). (CHECK required)',
  prePrReviewFixRequired:
    'Current `Pre-PR Decision` is `{decision}`. Apply the requested fixes from pre-PR findings before moving to PR creation. (CHECK required)',
  prePrReviewDecisionReconfirm:
    'Current `Pre-PR Decision` is `{decision}`. After fixing findings, rerun pre-PR review with an explicit decision to avoid replaying the prior state: `{command}` (CHECK required)',
  prReviewEvidenceFieldMissing:
    'tasks.md is missing the `PR Review Evidence` field. Add `- **PR Review Evidence**: -` and continue. (CHECK required)',
  prReviewEvidenceMissing:
    'tasks.md `PR Review Evidence` is empty/invalid. Use `summary: ...` (or `요약: ...`), or point to a file containing `PR Review Log` with non-placeholder `Summary` and `Decision`. (CHECK required)',
  prReviewDecisionFieldMissing:
    'tasks.md is missing the `PR Review Decision` field. Add `- **PR Review Decision**: -` and continue. (CHECK required)',
  prReviewDecisionMissing:
    'tasks.md `PR Review Decision` is empty/placeholder or missing decision format. Record it as `decision: ...` (or `결정: ...`). (CHECK required)',
  prReviewRunning:
    'PR review handoff is already in progress. Complete the delegated review/fix work, then update `PR Review Evidence` and `PR Review Decision`. (CHECK required)',
  prCreate:
    'Generate the PR body template, refine changes/tests sections, get explicit progress approval (label), create the PR, then record the PR link in tasks.md.',
  prCreatePrepareFromDoc:
    'Use `pr.md` to refine PR title/body/labels draft, get explicit progress approval, then set status to `Ready`.',
  prCreateExecuteFromDoc:
    'When `pr.md` status is `Ready`, create the PR and record the PR link/status in `tasks.md`. (Keep only `pr.md` status as `Ready`.)',
  prCreatePrepare:
    'Generate the PR body template, refine changes/tests sections, and get explicit progress approval before PR creation.',
  prCreateExecute:
    'Create the PR with the finalized body, then record the created PR link in tasks.md.',
  prCreateRequiredSequence:
    'PR creation is a required 2-step sequence: (1) generate/refine PR body template + explicit progress approval, (2) create PR + record PR link in tasks.md. Complete both in order.',
  prFillStatus:
    'Set PR Status in tasks.md to Review. (Keep Review during PR creation/review stages.)',
  prReviewMergedSyncStatus:
    'The remote PR is already merged. Update PR Status in tasks.md to Approved. (Also verify PR review Evidence/Decision fields are up to date.)',
  prResolveReview:
    'Address review comments while keeping PR Status as Review. For review-fix commits, summarize resolved feedback in the commit message (do not reuse task titles). Once ready to merge, get explicit approval (label) and run the merge option. (On success, PR Status is synced to Approved.)',
  prReviewPush: 'cd "{projectGitCwd}" && git push',
  prReviewRemoteBlocked:
    'Remote PR checks indicate this PR is not ready to merge yet: {reasons}. Resolve review comments/check statuses, then re-check.',
  prReviewRemoteReasonChangesRequested:
    'review decision is changes requested or additional review required',
  prReviewRemoteReasonClosed:
    'PR is closed without merge (reopen or create a new PR)',
  prReviewRemoteReasonChecksFailing: '{count} failing check(s) detected',
  prReviewRemoteReasonChecksPending: '{count} pending check(s) detected',
  prReviewRemoteReasonMergeBlocked: 'merge state is blocked (`{status}`)',
  prReviewRemoteReasonUnavailable:
    'remote PR status could not be verified (check gh auth/network/permissions)',
  prReviewMerge:
    'When ready to merge, get explicit approval (label) and run the merge option. (On success, PR Status is synced to Approved.)',
  prReviewMergeCommand:
    'npx lee-spec-kit github pr {featureRef} --merge --confirm OK',
  prRequestReview: 'Request review and set/keep PR Status as Review.',
  featureScopeSplitKeep:
    'Feature scope is large (tasks: {taskCount}, decisions lines: {decisionsLineCount}; split suggestion threshold: {taskThreshold}/{decisionsThreshold}). Current recommendation is {recommendedIssues} issues. Before deciding, read `{guideCommand}` and evaluate coupling, changed-file overlap, test boundary, and deployment independence. If you keep one issue, tighten scope in tasks.md and move low-priority TODO items out of the active batch.',
  featureScopeSplitTwo:
    'Feature scope is large (tasks: {taskCount}, decisions lines: {decisionsLineCount}). Recommendation rule: 40~79 tasks and below the hard threshold usually maps to 2 issues. Follow `{guideCommand}` and split by coupling/file-overlap/test/deploy criteria. For each new issue, document this template: Goal, Included Scope, Excluded Scope, Depends On, PR Done Criteria.',
  featureScopeSplitFour:
    'Feature scope is large (tasks: {taskCount}, decisions lines: {decisionsLineCount}). Hard recommendation is 4 issues when tasks >= {recommendFourTaskThreshold} or decisions lines >= {recommendFourDecisionsThreshold}. Follow `{guideCommand}` and split into 4 linked issues with explicit dependency order and sequential PR merges. Use the per-issue template: Goal, Included Scope, Excluded Scope, Depends On, PR Done Criteria.',
  userRequestReplan:
    'You can pause this step and handle a newly requested user requirement first. Summarize it, add it to tasks.md or split it into a separate Feature, then align document statuses and rerun context.',
  changeRequestSync:
    'A pending user request is recorded in tasks.md: "{request}". Before more implementation, update tasks.md first. Add or retag the affected task, and if this changes shipped behavior or scope, sync decisions.md plus spec/PRD references as needed. Clear `Pending Change Request` after syncing, then rerun context/flow.',
  docsUnmanagedNormalize:
    'Unmanaged docs entries were found outside the lee-spec-kit docs surface: {paths}. Before continuing feature `{featureRef}`, treat them as reference inputs only. Normalize user-facing scope and acceptance into `spec.md`, architecture/file/test details into `plan.md`, executable work into `tasks.md`, and rationale/trade-offs into `decisions.md`, then rerun `npx lee-spec-kit context {featureRef}`.',
  featureDone:
    'All workflow requirements and local cleanup are complete. This feature is fully finished.',
  fallbackRerunContext:
    'Cannot determine status. Check the docs and run context again.',
} as const;

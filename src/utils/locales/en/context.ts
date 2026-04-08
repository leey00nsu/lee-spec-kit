export const enContext = {
  'context.noActiveFeatures': '⚠️  No active features found.',
  'context.header': '📍 Current Context Check',
  'context.envWarnings': '⚠️  Environment warnings:',
  'context.openFallbackSummary':
    '(Could not detect a feature from the branch, so showing only open features. In Progress: {inProgress} / Ready To Close: {readyToClose} / Done: {done})',
  'context.sectionInProgress': 'In Progress',
  'context.sectionReadyToClose': 'Ready To Close',
  'context.tipDetails': 'Tip: To view details for a feature:',
  'context.tipShowAll': 'Show all',
  'context.tipShowDone': 'Show done only',
  'context.checkRequired': '[CHECK required] ',
  'context.checkPolicyHint':
    'ℹ️  Check user-approval policy once at session start (or right after context compression/reset); re-check only when policy/config changes or the user explicitly requests refresh. (includes git push/merge and merge commits). If you see [CHECK required], wait for a reply that follows label-token rules (`A`, `A OK`, `A proceed`) before proceeding (config: approval can override)',
  'context.actionOptionHint':
    'Label reply rules: answer as `A`, `A OK`, or `A proceed`',
  'context.actionExplainHint':
    'Use the exact approval lines from the CLI first. Add extra explanation only if the user asks, and do not paraphrase the approval prompts.',
  'context.finalLabelPrompt':
    'Available labels now: {labels}. Reply using label-token rules (`A`, `A OK`, `A proceed`). (e.g. `{example}`)',
  'context.finalLabelPromptWithRequest':
    'Available labels now: {labels}. Reply using label-token rules (`A`, `A OK`, `A proceed`). (e.g. `{example}`) Labels that require a request must be replied as: {requestExamples}',
  'context.suggestionHeader': 'Suggested Next Options',
  'context.suggestionCommandHint': 'Reference command: {command}',
  'context.suggestionFinalPrompt':
    'Recommended labels now: {labels}. Please reply with a format that includes a label token. (e.g. {example}, `A proceed`)',
  'context.autoRunUnavailable':
    'Auto-run is not available in the current context.',
  'context.autoRunSummary':
    'Auto-run can execute now by config until approval-required categories appear: {categories}',
  'context.autoRunManualBoundary':
    'Auto-run is configured, but the current step must be handled manually first: {detail}',
  'context.autoRunCommandHint':
    'Auto-run command (config-based gate): {command}',
  'context.subAgentOrchestrationHint':
    'The main agent manages overall flow and approvals. If the current state owner is `subagent`, hand execution to a helper agent; if it is `main`, keep it in the main agent.',
  'context.commandDetail.branchCreateWithWorktree':
    '({scope}) create or reuse worktree {worktree} for branch {branch}',
  'context.commandDetail.branchCreateWithBranch':
    '({scope}) create or reuse worktree for branch {branch}',
  'context.commandDetail.branchCreateGeneric':
    '({scope}) create or reuse feature branch worktree',
  'context.commandDetail.codeReviewMergeAfterOk':
    '({scope}) merge PR after explicit OK',
  'context.commandDetail.codeReviewPushFix':
    '({scope}) push review-fix commits',
  'context.commandDetail.prePrReviewRun':
    '({scope}) prepare a helper agent/sub-agent pre-PR review handoff; record evidence separately to advance state',
  'context.commandDetail.prePrReviewRecord':
    '({scope}) record pre-PR review evidence into decisions.md + tasks.md',
  'context.commandDetail.codeReviewRun':
    '({scope}) prepare a helper agent/sub-agent review-fix handoff only; update PR Review Evidence/Decision after the delegated work',
  'context.actionSummary.runDocsCommand': 'Run docs command',
  'context.actionSummary.runProjectCommand': 'Run project command',
  'context.actionDetail.featureFolder':
    'Prepare feature folder and baseline docs',
  'context.actionDetail.specWrite': 'Write or refine spec.md and set status',
  'context.actionDetail.specApprove': 'Approve spec.md',
  'context.actionDetail.planWrite': 'Write or refine plan.md and set status',
  'context.actionDetail.planApprove': 'Approve plan.md',
  'context.actionDetail.tasksWrite':
    'Write or refine tasks.md and align document status',
  'context.actionDetail.tasksWriteCreate':
    'Create tasks.md and set Doc Status to Review',
  'context.actionDetail.tasksWriteNeedAtLeastOne':
    'Add at least one task to tasks.md',
  'context.actionDetail.tasksWriteImprove':
    'Refine tasks.md and align Doc Status',
  'context.actionDetail.tasksWriteChangeSync':
    'Sync the new user request into tasks.md before more implementation',
  'context.actionDetail.tasksApprove': 'Approve tasks.md',
  'context.actionDetail.issueCreate':
    'Create the issue and sync issue fields in tasks.md',
  'context.actionDetail.issueCreateAndWrite':
    'Draft issue content, get explicit OK, then create and sync Issue',
  'context.actionDetail.issueCreatePrepareFromDoc':
    'Refine issue.md draft and set Status to Ready',
  'context.actionDetail.issueCreateFromDoc':
    'Create GitHub Issue from ready issue.md and sync Issue',
  'context.actionDetail.taskExecute': 'Proceed with the current task',
  'context.actionDetail.implementationApprove':
    'Review the completed implementation before post-task handoff',
  'context.actionDetail.taskExecuteRun':
    'Prepare helper agent/sub-agent task handoff and start the task: {task}. (TODO becomes DOING)',
  'context.actionDetail.taskExecuteContinue':
    'Prepare helper agent/sub-agent handoff and wrap up the in-progress task: {task}. (Share outcome/verification, then mark it DONE)',
  'context.actionDetail.taskExecuteComplete':
    'Mark the current task as complete: {task}. (Change DOING to DONE)',
  'context.actionDetail.reviewFixCommit':
    'Create a review-fix commit with resolved feedback summary',
  'context.actionDetail.prePrReviewRun':
    'Prepare a helper agent/sub-agent pre-PR review handoff; record evidence separately to advance state',
  'context.actionDetail.prePrReviewRecord':
    'Record pre-PR review evidence into decisions.md and tasks.md',
  'context.actionDetail.codeReviewRun':
    'Prepare a helper agent/sub-agent review-fix handoff only; update PR Review Evidence/Decision after the delegated work',
  'context.actionDetail.prCreate': 'Create PR and sync PR fields in tasks.md',
  'context.actionDetail.prCreateRequiredSequence':
    'Complete PR 2-step flow: prepare draft + OK, then create and sync',
  'context.actionDetail.prCreatePrepareFromDoc':
    'Refine pr.md draft and set Status to Ready',
  'context.actionDetail.prCreateExecuteFromDoc':
    'Create PR from ready pr.md and sync PR link/status',
  'context.actionDetail.prStatusUpdate':
    'Sync PR status in tasks.md with remote status',
  'context.actionDetail.prStatusUpdateSetReview': 'Set PR Status to Review',
  'context.actionDetail.prStatusUpdateSyncApproved':
    'PR merged remotely; sync PR Status to Approved',
  'context.actionDetail.codeReview':
    'Address review feedback and update PR review fields',
  'context.actionDetail.codeReviewNeedEvidenceField':
    'Add PR Review Evidence field in tasks.md',
  'context.actionDetail.codeReviewNeedEvidence':
    'Record PR Review Evidence (`summary: ...`) or PR Review Log path in decisions.md',
  'context.actionDetail.codeReviewNeedDecisionField':
    'Add PR Review Decision field in tasks.md',
  'context.actionDetail.codeReviewNeedDecision': 'Record PR Review Decision',
  'context.actionDetail.codeReviewResolve':
    'Address review feedback and keep PR review docs updated',
  'context.actionDetail.codeReviewNeedProjectRoot':
    'Set projectRoot to continue review actions',
  'context.actionDetail.codeReviewRemoteBlocked':
    'Resolve remote PR blockers before merge',
  'context.actionDetail.codeReviewMergeAfterOk': 'Merge PR after explicit OK',
  'context.actionDetail.codeReviewRequestReview':
    'Request review and keep PR Status as Review',
  'context.actionDetail.featureScopeSplit':
    'Review whether this feature should be split into smaller issue units',
  'context.actionDetail.featureScopeSplitKeep':
    'Keep current issue scope and continue (after split-guide check)',
  'context.actionDetail.featureScopeSplitTwo':
    'Split into 2 linked issues using coupling/file-overlap/test/deploy criteria',
  'context.actionDetail.featureScopeSplitFour':
    'Split into 4 linked issues (criteria-based) and merge PRs in dependency order',
  'context.actionDetail.worktreeCleanup':
    'Clean up the feature worktree to finish this feature',
  'context.actionDetail.prMetadataMigrate':
    'Update tasks.md PR fields to the latest template format',
  'context.actionDetail.prMetadataMigratePrFields':
    'Update tasks.md with PR/PR Status fields',
  'context.actionDetail.prMetadataMigratePrePrReviewField':
    'Add Pre-PR Review field in tasks.md',
  'context.actionDetail.userRequestReplan':
    'Handle the new user request first and re-run context',
  'context.actionDetail.featureDone':
    'This feature is fully complete',
  'context.actionDetail.fallback': 'Verify current status and re-run context',
  'context.suggestion.createFeature': 'Create a new feature',
  'context.suggestion.runOnboard': 'Run onboarding checks',
  'context.suggestion.showDone': 'Show completed features',
  'context.suggestion.showAll': 'Show all features',
  'context.suggestion.selectFeature':
    'Select a feature and open detailed context',
  'context.suggestion.showOpen': 'Show open features',
  'context.finalLabelCommandHint':
    'When a label is provided, run approval selection: {command}',
  'context.finalTicketCommandHint':
    'Execute commands using the ticket from approval result: {command}',
  'context.readBuiltinDocFirst':
    'Read required built-in docs only if not read in this session yet or likely changed: {command}',
  'context.tipDocsCommitRules':
    'Check commit message rules against the git-workflow guide.',
  'context.list.docsCommitNeeded': 'Commit docs changes',
  'context.list.projectCommitNeeded': 'Commit project code changes',
  'context.list.cleanupPending': 'Clean up the feature worktree to finish',
  'context.list.issueNumberNeeded': 'Fill issue number in docs',
  'context.list.addPrMetadata': 'Add PR metadata (PR/PR Status)',
  'context.list.recordPrLink': 'Record PR link',
  'context.list.addPrePrReviewField': 'Add Pre-PR Review field',
  'context.list.completePrePrReview': 'Complete Pre-PR review',
  'context.list.addPrePrEvidence': 'Add Pre-PR Evidence',
  'context.list.addPrePrDecision': 'Add Pre-PR Decision',
  'context.list.resolvePrePrDecision': 'Resolve Pre-PR decision to approve',
  'context.list.addPrReviewEvidence': 'Add PR Review Evidence summary',
  'context.list.addPrReviewDecision': 'Add PR Review Decision',
  'context.list.setPrStatus': 'Set PR Status',
  'context.list.prStatusToApproved':
    'PR merge required (PR Status: {status} → Approved)',
  'context.list.approveSpec': 'Approve spec',
  'context.list.approvePlan': 'Approve plan',

  'context.git.standaloneProjectRootMissing':
    'Standalone mode is enabled, but projectRoot is missing. Cannot resolve project branch. (npx lee-spec-kit config --project-root ...)',
  'context.git.multiProjectRootShapeInvalid':
    'Multi standalone mode requires projectRoot as an object. (Example: { "app": "...", "api": "...", "worker": "..." })',
  'context.git.multiProjectRootRepoMissing':
    'projectRoot.{repo} is empty. (npx lee-spec-kit config --project-root ... --component {repo})',
  'context.git.singleProjectRootShapeInvalid':
    'Single standalone mode requires projectRoot as a string path. (Example: "/path/to/project")',
} as const;

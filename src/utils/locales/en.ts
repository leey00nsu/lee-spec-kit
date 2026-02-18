const en = {
    cli: {
      'common.errorLabel': 'Error:',
      'common.canceled': 'Operation canceled.',
      'common.configNotFound': 'Config file not found. Run `init` first.',
      'common.docsNotFound': 'docs folder not found. Run `init` first.',

      'status.noFeatures': 'No features found.',
      'status.duplicateIds': 'Duplicate Feature IDs found:',
      'status.missingIds': 'Entries missing Feature ID:',
      'status.wrote': '✅ Wrote {path}',

      'feature.selectRepo': 'Select a repository:',
      'feature.folderExists': 'Folder already exists: {path}',
      'feature.baseNotFound': 'Built-in feature template not found.',
      'feature.created': '✅ Feature folder created: {path}',
      'feature.nextStepsTitle': 'Next steps:',
      'feature.nextSteps1': '  1. Write {path}/spec.md',
      'feature.nextSteps2': '  2. Ask for review',
      'feature.nextSteps3': '  3. After approval, write plan.md',

      'config.currentTitle': '📋 Current config:',
      'config.pathLabel': 'Path',
      'config.projectRootStandaloneOnly':
        '⚠️  projectRoot can only be set in standalone mode.',
      'config.selectRepoToUpdate': 'Select a repository to update:',
      'config.fullstackRepoRequired':
        'For multi projects, specify a target component via `--component`.',
      'config.projectRootSet': '✅ {repo} projectRoot set: {path}',
      'config.projectRootSetSingle': '✅ projectRoot set: {path}',

      'update.start': '📦 Starting template update...',
      'update.langLabel': 'Lang',
      'update.typeLabel': 'Type',
      'update.updatingAgents': '📁 Updating agents/ folder...',
      'update.updatingSkills': '📁 Updating agents/skills folder...',
      'update.agentsUpdated': 'agents/ updated',
      'update.skillsUpdated': 'agents/skills updated',
      'update.updatingFeatureBase': '📁 Updating features/feature-base/ folder...',
      'update.engineManagedSkillsBuiltin':
        'agents/skills is CLI-managed and is not synced into docs.',
      'update.engineManagedFeatureBaseBuiltin':
        'features/feature-base is CLI-managed and is not synced into docs.',
      'update.engineManagedPruned':
        'Removed {count} CLI-managed docs entries from this docs tree.',
      'update.filesUpdated': '{count} files updated',
      'update.updatedTotal': 'Updated {count} files!',
      'update.changeDetected': 'changes detected (use --force to overwrite)',
      'update.fileUpdated': '{file} updated',
      'update.gitStatusUnavailable':
        'Cannot determine git status (not a git repo or git unavailable). Use --force to overwrite.',
      'update.docsWorktreeDirty':
        'Docs working tree has changes. Commit/stash your changes, or run with --force to overwrite.',

      'doctor.title': '🔎 Docs Doctor',
      'doctor.envWarnings': '⚠️  Environment warnings:',
      'doctor.noIssues': '✅ No issues found.',
      'doctor.errorsTitle': 'Errors',
      'doctor.warningsTitle': 'Warnings',
      'doctor.tipJson': 'Tip: Agent JSON output: npx lee-spec-kit doctor --json{strictFlag}',
      'doctor.issue.missingRequiredDir': 'Missing required directory: {dir}',
      'doctor.issue.missingConfig':
        'Missing .lee-spec-kit.json. Some commands may rely on folder-structure heuristics.',
      'doctor.issue.noFeatures':
        'No feature folders found. (Only feature-base exists, or no features created yet.)',
      'doctor.issue.placeholdersLeft': 'Leftover placeholders detected: {placeholders}',
      'doctor.issue.missingSpec': 'Missing spec.md.',
      'doctor.issue.specStatusUnset': 'spec.md Status is not set. (May still be a template)',
      'doctor.issue.planStatusUnset': 'plan.md Status is not set. (May still be a template)',
      'doctor.issue.tasksEmpty': 'tasks.md has no tasks.',
      'doctor.issue.tasksDocStatusUnset':
        'tasks.md Doc Status is not set. (Set it to Draft, Review, or Approved.)',
      'doctor.issue.tasksDocStatusMissing':
        'tasks.md is missing the Doc Status field. Add `- **Doc Status**: -` and `Values: Draft | Review | Approved`.',
      'doctor.issue.duplicateFeatureId': 'Duplicate Feature ID detected: {id} ({count})',
      'doctor.issue.missingFeatureId':
        'Feature folder name is not in F001-... format. (Cannot extract ID)',

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
        'Before requesting approval, explain what each label will run/change with a one-line summary.',
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
        'Run continuously by config until approval-required categories appear: {categories}',
      'context.autoRunCommandHint':
        'Auto-run command (config-based gate): {command}',
      'context.subAgentOrchestrationHint':
        'Main-agent orchestration: keep short steps in the main agent, and delegate only long-running loops (task_execute/code_review/review_fix_commit/pre_pr_review or auto mode) to a sub-agent.',
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
        '({scope}) run pre-PR review and sync decisions.md + tasks.md',
      'context.actionSummary.runDocsCommand': 'Run docs command',
      'context.actionSummary.runProjectCommand': 'Run project command',
      'context.actionDetail.featureFolder': 'Prepare feature folder and baseline docs',
      'context.actionDetail.specWrite': 'Write or refine spec.md and set status',
      'context.actionDetail.specApprove': 'Approve spec.md',
      'context.actionDetail.planWrite': 'Write or refine plan.md and set status',
      'context.actionDetail.planApprove': 'Approve plan.md',
      'context.actionDetail.tasksWrite': 'Write or refine tasks.md and align document status',
      'context.actionDetail.tasksWriteCreate':
        'Create tasks.md and set Doc Status to Review',
      'context.actionDetail.tasksWriteNeedAtLeastOne':
        'Add at least one task to tasks.md',
      'context.actionDetail.tasksWriteImprove':
        'Refine tasks.md and align Doc Status',
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
      'context.actionDetail.reviewFixCommit':
        'Create a review-fix commit with resolved feedback summary',
      'context.actionDetail.prePrReview':
        'Run pre-PR review and record results',
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
      'context.actionDetail.codeReviewNeedDecision':
        'Record PR Review Decision',
      'context.actionDetail.codeReviewResolve':
        'Address review feedback and keep PR review docs updated',
      'context.actionDetail.codeReviewNeedProjectRoot':
        'Set projectRoot to continue review actions',
      'context.actionDetail.codeReviewRemoteBlocked':
        'Resolve remote PR blockers before merge',
      'context.actionDetail.codeReviewMergeAfterOk':
        'Merge PR after explicit OK',
      'context.actionDetail.codeReviewRequestReview':
        'Request review and keep PR Status as Review',
      'context.actionDetail.worktreeCleanup':
        'Clean up the completed feature worktree',
      'context.actionDetail.prMetadataMigrate':
        'Update tasks.md PR fields to the latest template format',
      'context.actionDetail.prMetadataMigratePrFields':
        'Update tasks.md with PR/PR Status fields',
      'context.actionDetail.prMetadataMigratePrePrReviewField':
        'Add Pre-PR Review field in tasks.md',
      'context.actionDetail.userRequestReplan':
        'Handle the new user request first and re-run context',
      'context.actionDetail.featureDone':
        'All completion checks are satisfied for this feature',
      'context.actionDetail.fallback':
        'Verify current status and re-run context',
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
      'context.list.prStatusToApproved': 'PR merge required (PR Status: {status} → Approved)',
      'context.list.approveSpec': 'Approve spec',
      'context.list.approvePlan': 'Approve plan',

      'init.selectLangPrompt': 'Select docs language:',
      'init.currentDirectoryLabel': '📍 Current directory',
      'init.gitDetected': '✅ Git repository detected',
      'init.insideProjectRoot': 'You are running inside your project root.',
      'init.modeEmbeddedDesc':
        '• embedded: creates ./docs here and manages it with the project.',
      'init.modeStandaloneDesc': '• standalone: to manage docs as a separate repo,',
      'init.modeStandaloneMove': '  move to that folder and run again.',
      'init.gitNotDetected': '⚠️  Git repository not detected.',
      'init.gitNotDetectedDetail': 'A new Git repo will be initialized.',
      'init.prompt.projectName': 'Enter project name:',
      'init.prompt.projectType': 'Select project type:',
      'init.choice.projectType.single.title': 'Single - single repo project',
      'init.choice.projectType.single.desc': 'Manage with a single features/ folder',
      'init.choice.projectType.fullstack.title': 'Multi - multi-component project',
      'init.choice.projectType.fullstack.desc': 'Default structure uses features/{component}/',
      'init.prompt.docsMode': 'Select docs mode:',
      'init.choice.docsRepo.embedded.title': 'embedded - inside the project (./docs)',
      'init.choice.docsRepo.embedded.desc': 'Pushed together with the project',
      'init.choice.docsRepo.standalone.title': 'standalone - separate docs repo',
      'init.choice.docsRepo.standalone.desc': 'Configure push settings separately',
      'init.prompt.componentRepoPath': 'Enter repository path for component "{component}":',
      'init.prompt.projectRepoPath': 'Enter project repository path:',
      'init.validation.enterPath': 'Please enter a path',
      'init.prompt.pushMode': 'Select docs push mode:',
      'init.choice.push.local': 'local - manage locally (no push)',
      'init.choice.push.remote': 'remote - push to remote',
      'init.prompt.remoteUrl': 'Enter remote repository URL:',
      'init.validation.enterUrl': 'Please enter a URL',
      'init.prompt.overwrite': '{dir} already exists. Overwrite?',
      'init.log.creatingDocs': '📁 Creating docs structure...',
      'init.log.projectLabel': 'Project',
      'init.log.typeLabel': 'Type',
      'init.log.langLabel': 'Lang',
      'init.log.pathLabel': 'Path',
      'init.log.docsCreated': '✅ Docs structure created!',
      'init.log.nextStepsTitle': 'Next steps:',
      'init.log.nextSteps1': '  1. Write {docsDir}/prd/README.md',
      'init.log.nextSteps2': '  2. Add a feature with: npx lee-spec-kit feature <name>',
      'init.log.nextSteps3': '  3. Run setup checks: npx lee-spec-kit onboard --strict',
      'init.log.gitRepoDetectedCommit': '📦 Git repo detected, committing docs...',
      'init.log.gitInit': '📦 Initializing Git...',
      'init.warn.stagedChangesSkip':
        '⚠️  There are already staged changes in the Git index. (With --dir ".", commit scope cannot be safely restricted, so auto-commit is skipped.)',
      'init.warn.docsPathIgnoredSkipCommit':
        '⚠️  Docs path is matched by .gitignore, so auto-commit is skipped: {path}',
      'init.warn.docsPathIgnoredHint':
        '    To keep tracking docs, use `git add -f {path}` then commit, or move docs via `--dir` to a non-ignored path.',
      'init.warn.commitManually': '    Review the changes and commit manually.',
      'init.log.gitRemoteSet': '✅ Git remote set: {remote}',
      'init.warn.gitRemoteExists': '⚠️  Git remote already exists.',
      'init.log.gitInitialCommitDone': '✅ Initial Git commit created!',
      'init.warn.skipGitInit': '⚠️  Skipping Git initialization (please commit manually)',
      'init.error.templateNotFound': 'Template not found: {path}',

      'github.cmdGithubDescription':
        'GitHub workflow helpers (issue/pr templates, validation, merge retry)',
      'github.cmdIssueDescription':
        'Generate/create GitHub issue body from feature docs with validation',
      'github.cmdPrDescription':
        'Generate/create GitHub PR body with validation, tasks PR sync, and merge retry',
      'github.optJson': 'Output in JSON format for agents',
      'github.optComponent': 'Component name for multi projects',
      'github.optIssueTitle': 'Issue title',
      'github.optLabels': 'Comma-separated labels (default: enhancement)',
      'github.optIssueBodyFile':
        'Issue body file output path (default: project/component-scoped file in OS temp dir)',
      'github.optIssueAssignee': 'Issue assignee (default: @me)',
      'github.optIssueCreate': 'Create issue via gh CLI',
      'github.optIssueConfirm':
        'Explicit user approval token for remote operations (--create). Use: OK',
      'github.optPrTitle': 'PR title',
      'github.optPrBodyFile':
        'PR body file output path (default: project/component-scoped file in OS temp dir)',
      'github.optPrAssignee': 'PR assignee (default: @me)',
      'github.optPrBase': 'PR base branch (default: main)',
      'github.optPrCreate': 'Create PR via gh CLI',
      'github.optPrRef': 'Existing PR URL/number (used by --merge)',
      'github.optPrMerge': 'Merge PR with retry and head-branch refresh',
      'github.optPrConfirm':
        'Explicit user approval token for remote operations (--create/--merge). Use: OK',
      'github.optPrRetry': 'Retry count for merge (default: 3)',
      'github.optPrScreenshots': 'PR screenshots section mode (auto|on|off, default: auto)',
      'github.optPrMermaid': 'PR Mermaid section mode (auto|on|off, default: auto)',
      'github.optPrNoSyncTasks': 'Do not sync PR URL/PR status into tasks.md',
      'github.optPrCommitSync': 'Commit and push tasks.md metadata sync automatically',
      'github.labelsRequired': 'At least one label is required. Use `--labels enhancement`.',
      'github.approvalRequired':
        '{operation} requires explicit user approval. Re-run with `--confirm OK` after sharing the plan with the user.',
      'github.ghCommandFailed': 'GitHub CLI command failed',
      'github.ghEmptyJson': 'GitHub CLI returned empty JSON output.',
      'github.ghInvalidJson': 'GitHub CLI returned invalid JSON: {snippet}',
      'github.sectionsMissing': '{kind} body is missing required sections: {sections}',
      'github.todoPlaceholdersRemain':
        '{kind} body still contains TODO placeholders. Fill goals/completion criteria before creating remotely.',
      'github.artifactModeInvalid':
        'Invalid value for `--{kind}`: {value}. Allowed: auto,on,off',
      'github.prScreenshotsSectionMissing':
        'PR body is missing required section: {section}',
      'github.prScreenshotImageMissing':
        'Add image markdown (`![](...)`) to the `{section}` section in PR body.',
      'github.prMermaidSectionMissing':
        'PR body is missing required section: {section}',
      'github.prMermaidBlockMissing':
        'Add a ```mermaid code block to the `{section}` section in PR body.',
      'github.docsMissing': 'Related document paths do not exist: {paths}',
      'github.noFeatures': 'No features found.',
      'github.multipleFeaturesMatched':
        'Multiple features matched. Specify feature name (slug | F001 | F001-slug).',
      'github.featureSelectFailed':
        'Failed to auto-select a feature. Specify feature name explicitly.',
      'github.tasksNotFound': 'tasks.md not found: {path}',
      'github.detectBranchFailed': 'Failed to detect current git branch',
      'github.inspectWorktreeFailed': 'Failed to inspect git worktree',
      'github.worktreeNotClean':
        'Git worktree is not clean. Commit or stash changes before merge retry sync.',
      'github.inspectFileStatusFailed': 'Failed to inspect git file status',
      'github.stageFileFailed': 'Failed to stage file',
      'github.commitSyncFailed': 'Failed to commit synced metadata',
      'github.pushSyncFailed': 'Failed to push synced metadata commit',
      'github.fetchPrBranchesFailed': 'Failed to fetch PR branches',
      'github.checkoutHeadFailed': 'Failed to checkout PR head branch',
      'github.createLocalHeadFailed': 'Failed to create local PR head branch',
      'github.rebaseHeadFailed': 'Failed to rebase PR head branch',
      'github.pushRebasedHeadFailed': 'Failed to push rebased PR head branch',
      'github.restoreBranchFailed': 'Failed to restore previous branch after PR refresh',
      'github.mergeRetryFailed': 'Failed to merge PR after retry attempts.{lastError}',
      'github.retryInvalid': '`--retry` must be a positive integer.',
      'github.operationIssueCreate': 'GitHub issue creation',
      'github.operationPrCreate': 'GitHub PR creation',
      'github.operationPrMerge': 'GitHub PR merge',
      'github.createIssueFailed': 'Failed to create GitHub issue',
      'github.createPrFailed': 'Failed to create GitHub PR',
      'github.mergeRequiresPr':
        '`--merge` requires `--create`, `--pr <url|number>`, or a PR link in tasks.md.',
      'github.checkoutBaseAfterMergeFailed': 'Failed to checkout {base} after merge',
      'github.pullBaseAfterMergeFailed': 'Failed to update {base} after merge',
      'github.postMergeCheckoutWarning':
        'PR merged, but checkout to `{base}` failed (non-fatal): {detail}',
      'github.postMergePullWarning':
        'PR merged, but pull for `{base}` failed (non-fatal): {detail}',
      'github.issueDefaultTitle': '{slug} ({summary})',
      'github.prDefaultTitleWithIssue': 'feat(#{issue}): {slug} ({featureRef} implementation)',
      'github.prDefaultTitleNoIssue': 'feat: {slug} ({featureRef} implementation)',
      'github.issueHeader': '🧾 GitHub Issue Helper',
      'github.prHeader': '🔀 GitHub PR Helper',
      'github.labelFeature': 'Feature',
      'github.labelBodyFile': 'Body file',
      'github.labelLabels': 'Labels',
      'github.labelPr': 'PR',
      'github.issueCreated': '✅ Created: {url}',
      'github.issueTemplateGenerated':
        'Template generated. Add --create to open the issue automatically.',
      'github.prTasksSynced': '✅ tasks.md PR metadata synced.',
      'github.prMerged': '✅ PR merged (attempts: {attempts}).',
      'github.prAlreadyMergedNotice':
        'ℹ️  PR was already merged remotely. Continuing with local/docs sync only.',
      'github.prTemplateGenerated': 'Template generated. Add --create to open the PR automatically.',
      'github.syncCommitWithIssue': 'docs(#{issue}): sync PR metadata for {folder}',
      'github.syncCommitNoIssue': 'docs: sync PR metadata for {folder}',
      'github.kindIssue': 'Issue',
      'github.kindPr': 'PR',
      'docs.cmdDocsDescription': 'Read CLI-managed built-in agent docs',
      'docs.cmdListDescription': 'List available built-in docs',
      'docs.cmdGetDescription': 'Read one built-in doc',
      'docs.optJson': 'Output in JSON format for agents',
      'docs.invalidDocId': 'Unknown doc id: {docId}. Available: {available}',
      'docs.listHeader': '📚 Built-in Docs',
      'docs.nextDocs': 'Next docs',
      'docs.sourceLabel': 'source',
      'docs.hashLabel': 'hash',
      'detect.cmdDescription': 'Detect whether the current workspace is a lee-spec-kit project',
      'detect.optDir': 'Target directory to probe (default: current directory)',
      'detect.optJson': 'Output in JSON format for agents',
      'detect.header': '🔎 Project Detection',
      'detect.labelTarget': 'Target',
      'detect.resultDetected': 'Detected a lee-spec-kit project',
      'detect.resultNotDetected': 'No lee-spec-kit project detected',
      'detect.notDetectedHint':
        'Run `npx lee-spec-kit init` or pass `--dir` to the correct path.',
      'detect.labelDocsDir': 'Docs',
      'detect.labelConfigPath': 'Config',
      'detect.labelSource': 'Source',
      'detect.labelProjectType': 'Project Type',
      'detect.labelLang': 'Lang',
      'detect.labelProjectName': 'Project',
      'detect.sourceConfig': 'config (.lee-spec-kit.json)',
      'detect.sourceHeuristic': 'heuristic (agents/features folder)',

      'cliError.headerNextOptionsError': '👉 Next Options (Error):',
      'cliError.promptBlocked.retryWithoutNonInteractive':
        'Run the same command without --non-interactive.',
      'cliError.promptBlocked.passRequiredFlags':
        'Pass all required flags (including `--force` when needed), then run again.',
      'cliError.promptBlocked.checkRequiredOptions': 'Check required options first.',
      'cliError.configOrDocs.initializeDocs':
        'Initialize docs in the current workspace.',
      'cliError.configOrDocs.verifyDocsLocation':
        'Verify docs location and configuration.',
      'cliError.configOrDocs.runFromDocsDir':
        'Run command from the directory that contains docs/.',
      'cliError.lock.retryLater': 'Wait briefly, then retry the same command.',
      'cliError.lock.checkOtherProcess':
        'Check whether another lee-spec-kit process is still running.',
      'cliError.lock.inspectLockFiles':
        'Inspect runtime lock files (project `.git/lee-spec-kit.runtime/locks` or OS temp).',
      'cliError.invalidArg.reviewUsage': 'Review command usage and valid flags.',
      'cliError.invalidArg.fixValues': 'Fix invalid value(s) and retry.',
      'cliError.invalidArg.validateBeforeAutomation':
        'If using automation, validate arguments before invoking CLI.',
      'cliError.precondition.satisfyPreconditions':
        'Satisfy the command preconditions first (environment/worktree).',
      'cliError.precondition.runDoctor':
        'Run workspace diagnostics to inspect current state.',
      'cliError.precondition.considerForce':
        'If overwrite is intentional, consider the force flag.',
      'cliError.duplicateId.resolveDuplicates':
        'Resolve duplicate Feature IDs, then run again.',
      'cliError.duplicateId.ensureUniqueFormat':
        'Ensure each feature folder has a unique `F###-slug` name.',
      'cliError.duplicateId.inspectJson':
        'Inspect duplicates via JSON diagnostics.',
      'cliError.missingId.renameFolders':
        'Rename feature folders without IDs to `F###-slug` format.',
      'cliError.missingId.alignDocs':
        'Align Feature IDs in spec/tasks docs after renaming.',
      'cliError.missingId.inspectJson':
        'Inspect missing IDs via JSON diagnostics.',
      'cliError.invalidApproval.fetchLatestOptions': 'Fetch latest options first.',
      'cliError.invalidApproval.replyWithValidLabel':
        'Reply with a valid label only (or "<label> OK"), e.g. A.',
      'cliError.invalidApproval.oneLabelOnly': 'Use one label at a time.',
      'cliError.invalidApproval.userRequestRequired':
        'Label "{label}" requires a user request. Use `{example}`.',
      'cliError.approvalRequired.reRunWithApprove':
        'For context approval flow, re-run with --approve <label>.',
      'cliError.approvalRequired.githubConfirmOk':
        'For github remote create/merge, pass --confirm OK.',
      'cliError.approvalRequired.shareAndGetApproval':
        'Share title/body/labels (or merge plan) and get explicit user approval first.',
      'cliError.contextSelection.specifySelector':
        'Specify one feature selector explicitly.',
      'cliError.contextSelection.narrowByComponent':
        'Narrow by component in multi mode.',
      'cliError.contextSelection.inspectAllCandidates':
        'Inspect all candidates first.',
      'cliError.noActionOptions.refreshContext':
        'Refresh context to see current state.',
      'cliError.noActionOptions.completeChecklist':
        'Open feature docs and complete the missing checklist item.',
      'cliError.noActionOptions.listAllFeatures':
        'List all features to find one with actionable options.',
      'cliError.contextStale.refreshBeforeApprove':
        'Get fresh context before approving.',
      'cliError.contextStale.reapproveWithFreshLabel':
        'Approve again using a label from the latest output.',
      'cliError.contextStale.executeAfterFreshApproval':
        'Execute only after re-approval of the fresh label.',
      'cliError.execution.notCommand':
        'Check whether the approved label points to a command action.',
      'cliError.execution.failed':
        'Review the failed command output and fix prerequisites.',
      'cliError.execution.rerunContextAndExecute':
        'Re-run context and execute one fresh label.',
      'cliError.execution.runManually':
        'Run the command manually to isolate environment issues.',
      'cliError.unknown.rerunAndCaptureLogs':
        'Re-run with the same input and capture full error logs.',
      'cliError.unknown.runDoctor': 'Run diagnostics for workspace state.',
      'cliError.unknown.reportReasonCode':
        'Report the reasonCode and logs to maintainers.',

      'context.git.standaloneProjectRootMissing':
        'Standalone mode is enabled, but projectRoot is missing. Cannot resolve project branch. (npx lee-spec-kit config --project-root ...)',
      'context.git.multiProjectRootShapeInvalid':
        'Multi standalone mode requires projectRoot as an object. (Example: { "app": "...", "api": "...", "worker": "..." })',
      'context.git.multiProjectRootRepoMissing':
        'projectRoot.{repo} is empty. (npx lee-spec-kit config --project-root ... --component {repo})',
      'context.git.singleProjectRootShapeInvalid':
        'Single standalone mode requires projectRoot as a string path. (Example: "/path/to/project")',

      'validation.nameEmpty': 'Name cannot be empty.',
      'validation.nameTooLong': 'Name cannot exceed 100 characters.',
      'validation.nameTraversal': "Name cannot contain '..' or path separators.",
      'validation.nameNullByte': 'Name cannot contain null bytes.',
      'validation.nameInvalidChars':
        'Name can only include letters, numbers, hyphens, underscores, and Korean characters.',
      'validation.nameReserved': 'Reserved name is not allowed.',
      'validation.projectTypeInvalid': 'Project type must be one of: {values}.',
      'validation.languageInvalid': 'Language must be one of: {values}.',
      'validation.workflowModeInvalid': 'Workflow mode must be one of: {values}.',
      'validation.featureIdEmpty': 'Feature ID cannot be empty.',
      'validation.featureIdFormat': "Feature ID must be 'F' + digits (e.g., F001).",
      'validation.pathEmpty': 'Path cannot be empty.',
      'validation.pathNullByte': 'Path cannot contain null bytes.',
      'validation.genericFailed': 'Validation failed',
      'validation.context.featureName': 'Feature name',
      'validation.context.featureId': 'Feature ID',
      'validation.context.projectName': 'Project name',
      'validation.context.projectType': 'Project type',
      'validation.context.language': 'Language',
      'validation.context.workflowMode': 'Workflow mode',

      'versionCheck.noticeAvailable':
        '📦 lee-spec-kit v{latest} is available (current: v{current})',
      'versionCheck.updateCommand': '   Update: npm update -g lee-spec-kit',
    },
    steps: {
      featureFolder: 'Create feature folder',
      specWrite: 'Write spec.md',
      specApprove: 'Approve spec.md',
      planWrite: 'Write plan.md',
      planApprove: 'Approve plan.md',
      tasksWrite: 'Write/approve tasks.md',
      docsInitialCommit: 'Initial docs commit',
      docsCommitPlanning: 'Commit docs (sync)',
      issueCreate: 'Create GitHub Issue',
      branchCreate: 'Create branch',
      tasksExecute: 'Execute tasks',
      docsCommitSync: 'Commit docs (sync)',
      prePrReview: 'Pre-PR review',
      prCreate: 'Create PR',
      codeReview: 'Code review',
      featureDone: 'Feature done',
    },
    messages: {
      specCreate:
        'Write spec.md and change Status to Review. (Follow the agents guide baseline.)',
      specImprove: 'Improve spec.md and change Status to Review.',
      specApproval:
        'Share spec.md with the user and get approval (`A` or `A OK` format).',
      planCreate:
        'Write plan.md and change Status to Review. (Follow the agents guide baseline.)',
      planImprove: 'Improve plan.md and change Status to Review.',
      planApproval:
        'Share plan.md with the user and get approval (`A` or `A OK` format).',
      tasksCreate:
        'Write tasks.md and change Doc Status to Review. (Follow the agents/execute-task guide baseline.)',
      tasksNeedAtLeastOne: 'Write at least 1 task in tasks.md.',
      tasksImprove: 'Improve tasks.md and change Doc Status to Review.',
      tasksApproval:
        'Share tasks.md with the user and get progress approval (`A` or `A OK` format). (Then set Doc Status to Approved)',
      docsCommitPlanning:
        'cd "{docsGitCwd}" && git add "{featurePath}" && git commit -m "docs(planning): {folderName} planning docs"',
      issueCreateAndWrite:
        'Generate the issue body template, refine goals/completion criteria, get explicit user OK, create the issue, then update issue number in tasks.md and prepare a docs commit.',
      issuePrepareFromDoc:
        'Use `issue.md` to refine issue title/body/labels draft, get explicit user OK, then set status to `Ready`.',
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
      standaloneNeedsProjectRoot:
        'Standalone mode requires projectRoot. (npx lee-spec-kit config --project-root ...)',
      createBranch:
        'cd "{projectGitCwd}" && mkdir -p .worktrees && (git worktree add ".worktrees/feat-{issueNumber}-{slug}" "feat/{issueNumber}-{slug}" || git worktree add -b "feat/{issueNumber}-{slug}" ".worktrees/feat-{issueNumber}-{slug}") && echo "worktree: {projectGitCwd}/.worktrees/feat-{issueNumber}-{slug}"',
      worktreeCleanupCommand:
        'cd "{projectGitCwd}" && git worktree remove "{worktreePath}" && git worktree prune && CURRENT_BRANCH=$(git branch --show-current) && DEFAULT_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | cut -d/ -f2-) && TARGET_BRANCH="${DEFAULT_BRANCH:-$CURRENT_BRANCH}" && if [ -n "$TARGET_BRANCH" ]; then git checkout "$TARGET_BRANCH" >/dev/null 2>&1 || true; fi && if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1 && [ -z "$(git status --porcelain)" ]; then git pull --ff-only || true; fi',
      tasksAllDoneButNoChecklist:
        'Create the completion checklist. Add verification items to the tasks.md "Completion Criteria" section, then mark satisfied items as [x] after user confirmation. Record final approval (OK) as well.',
      tasksAllDoneButChecklist:
        'Proceed with remaining completion checklist items. Current progress: ({checked}/{total}) Mark items as [x] only after user confirmation and real verification. Record final approval (OK) as well.',
      finishDoingTask:
        'Continue working on the current DOING/REVIEW task: "{title}" ({done}/{total}) After it is complete, share outcome/verification and mark it DONE',
      startNextTodoTask:
        'Start the next TODO task: "{title}" ({done}/{total}) Mark it DOING when you begin work',
      checkTaskStatuses:
        'Check task statuses. ({done}/{total})',
      taskCommitGateStrictBlock:
        'Before moving to the next TODO task, you must satisfy the `1 task = 1 commit` rule. Check result: {reason}. Re-align task commit boundaries, then continue.',
      taskCommitGateWarnProceed:
        '⚠️ Task commit boundary warning: {reason}. You may continue, but `1 task = 1 commit` is recommended.',
      taskCommitGateReasonNoTasksCommit:
        'No recent project code commit was found',
      taskCommitGateReasonTasksFileUnavailable:
        'Cannot read recent project code commit history',
      taskCommitGateReasonDoneCount:
        'DONE transitions detected in the latest tasks.md commit ({count})',
      taskCommitGateReasonMismatchLastDone:
        'The latest project code commit does not match the last completed task',
      prLegacyAsk:
        'tasks.md is missing PR/PR Status fields. Update to the latest template format? (CHECK required)',
      prePrReviewFieldMissing:
        'tasks.md is missing the `Pre-PR Review` field. Add `- **Pre-PR Review**: Pending | Done` and run context again. (CHECK required)',
      prePrReviewEvidenceMissing:
        'tasks.md `Pre-PR Evidence` is empty/invalid. Point to a real file and include a `Pre-PR Review Log` section with non-placeholder `Summary` and `Decision`. (CHECK required)',
      prePrReviewDecisionMissing:
        'tasks.md `Pre-PR Decision` is empty/placeholder or missing decision format. Record it as `decision: ...` (or `결정: ...`). (CHECK required)',
      prePrReviewRun:
        'Run a pre-PR code review before creating the PR. Always execute the `{fallback}` baseline by following the `Pre-PR Baseline Checklist` section in the `create-pr` doc. Then use preferred skills ({skills}) for deeper review (if a better installed skill fits this change, propose it first). After completing it, set `Pre-PR Review` to Done in tasks.md.',
      prReviewEvidenceFieldMissing:
        'tasks.md is missing the `PR Review Evidence` field. Add `- **PR Review Evidence**: -` and continue. (CHECK required)',
      prReviewEvidenceMissing:
        'tasks.md `PR Review Evidence` is empty/invalid. Use `summary: ...` (or `요약: ...`), or point to a file containing `PR Review Log` with non-placeholder `Summary` and `Decision`. (CHECK required)',
      prReviewDecisionFieldMissing:
        'tasks.md is missing the `PR Review Decision` field. Add `- **PR Review Decision**: -` and continue. (CHECK required)',
      prReviewDecisionMissing:
        'tasks.md `PR Review Decision` is empty/placeholder or missing decision format. Record it as `decision: ...` (or `결정: ...`). (CHECK required)',
      prCreate:
        'Generate the PR body template, refine changes/tests sections, get explicit user OK, create the PR, then record the PR link in tasks.md.',
      prCreatePrepareFromDoc:
        'Use `pr.md` to refine PR title/body/labels draft, get explicit user OK, then set status to `Ready`.',
      prCreateExecuteFromDoc:
        'When `pr.md` status is `Ready`, create the PR and record the PR link/status in `tasks.md`. (Keep only `pr.md` status as `Ready`.)',
      prCreatePrepare:
        'Generate the PR body template, refine changes/tests sections, and get explicit user OK before PR creation.',
      prCreateExecute:
        'Create the PR with the finalized body, then record the created PR link in tasks.md.',
      prCreateRequiredSequence:
        'PR creation is a required 2-step sequence: (1) generate/refine PR body template + explicit user OK, (2) create PR + record PR link in tasks.md. Complete both in order.',
      prFillStatus:
        'Set PR Status in tasks.md to Review. (Keep Review during PR creation/review stages.)',
      prReviewMergedSyncStatus:
        'The remote PR is already merged. Update PR Status in tasks.md to Approved. (Also verify PR review Evidence/Decision fields are up to date.)',
      prResolveReview:
        'Address review comments while keeping PR Status as Review. For review-fix commits, summarize resolved feedback in the commit message (do not reuse task titles). Once ready to merge, get explicit user OK and run the merge option. (On success, PR Status is synced to Approved.)',
      prReviewResolve:
        'Review/analyze PR comments first, then apply required fixes while addressing comments. Keep PR Status as Review and keep `PR Review Evidence/Decision` updated. Run push only after explicit user OK and only when local branch is ahead of upstream.',
      prReviewPush:
        'cd "{projectGitCwd}" && git push',
      prReviewRemoteBlocked:
        'Remote PR checks indicate this PR is not ready to merge yet: {reasons}. Resolve review comments/check statuses, then re-check.',
      prReviewRemoteReasonChangesRequested:
        'review decision is changes requested or additional review required',
      prReviewRemoteReasonClosed:
        'PR is closed without merge (reopen or create a new PR)',
      prReviewRemoteReasonChecksFailing:
        '{count} failing check(s) detected',
      prReviewRemoteReasonChecksPending:
        '{count} pending check(s) detected',
      prReviewRemoteReasonMergeBlocked:
        'merge state is blocked (`{status}`)',
      prReviewRemoteReasonUnavailable:
        'remote PR status could not be verified (check gh auth/network/permissions)',
      prReviewMerge:
        'When ready to merge, get explicit user OK and run the merge option. (On success, PR Status is synced to Approved.)',
      prReviewMergeCommand:
        'npx lee-spec-kit github pr {featureRef} --merge --confirm OK',
      prRequestReview: 'Request review and set/keep PR Status as Review.',
      userRequestReplan:
        'You can pause this step and handle a newly requested user requirement first. Summarize it, add it to tasks.md or split it into a separate Feature, then align document statuses and rerun context.',
      featureDone:
        'Workflow requirements and all tasks/completion criteria are satisfied. This feature is done.',
      fallbackRerunContext:
        'Cannot determine status. Check the docs and run context again.',
    },
    warnings: {
      projectBranchUnavailable:
        'Cannot determine project branch. (In standalone mode, projectRoot is required.)',
      docsGitUnavailable:
        'Cannot read git status for the docs repo. (Check repo location / git init.)',
      docsPathIgnored:
        'Current feature docs path is ignored by git: {path} (docs commit detection may be limited).',
      docsUncommittedChanges:
        'Docs changes are not committed. (Additional docs commit needed.) Check commit message rules against the git-workflow guide.',
      projectUncommittedChanges:
        'Project code changes are not committed. (Additional code commit needed.)',
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
        'Implementation is done but `Pre-PR Evidence` is empty/invalid. (Point to an existing file and include `Pre-PR Review Log` with non-placeholder `Summary` and `Decision`.)',
      workflowPrePrDecisionMissing:
        'Implementation is done but `Pre-PR Decision` is empty/invalid. (Use `decision: approve|changes_requested|blocked ...`.)',
      workflowPrePrDecisionNotApproved:
        'Implementation is done but `Pre-PR Decision` is `{outcome}`. Resolve review risks and re-run pre-PR review until decision becomes `approve`.',
    },
  } as const;

export default en;

export const enCli = {
  'common.errorLabel': 'Error:',
  'common.canceled': 'Operation canceled.',
  'common.configNotFound': 'Config file not found. Run `init` first.',
  'common.docsNotFound': 'docs folder not found. Run `init` first.',

  'feature.selectRepo': 'Select a repository:',
  'feature.folderExists': 'Folder already exists: {path}',
  'feature.baseNotFound': 'Built-in feature template not found.',
  'feature.created': '✅ Feature folder created: {path}',
  'feature.nextStepsTitle': 'Next steps:',
  'feature.nextSteps1': '  1. Write {path}/spec.md',
  'feature.nextSteps2': '  2. Ask for review',
  'feature.nextSteps3': '  3. After approval, write plan.md',
  'feature.ideaNotFound': 'Idea document not found: {ref}',
  'feature.ideaAmbiguous':
    'Multiple idea documents matched {ref}. Use an exact path or full indexed name.',

  'config.currentTitle': '📋 Current config:',
  'config.pathLabel': 'Path',
  'config.projectRootStandaloneOnly':
    '⚠️  projectRoot can only be set in standalone mode.',
  'config.selectRepoToUpdate': 'Select a repository to update:',
  'config.fullstackRepoRequired':
    'For multi projects, specify a target component via `--component`.',
  'config.projectRootSet': '✅ {repo} projectRoot set: {path}',
  'config.projectRootSetSingle': '✅ projectRoot set: {path}',
  'config.workflowUpdated': '✅ Workflow configuration updated.',

  'update.start': '📦 Starting template update...',
  'update.langLabel': 'Lang',
  'update.typeLabel': 'Type',
  'update.updatingAgents': '📁 Updating agents/ folder...',
  'update.agentsUpdated': 'agents/ updated',
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
  'update.legacyAutomationSafe':
    'Existing projects keep newly introduced task delegation and Plan/Task review disabled unless they had explicitly opted in. Configure them with `npx lee-spec-kit config --interactive` or the config flags.',

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
  'init.choice.projectType.single.desc':
    'Manage with a single features/ folder',
  'init.choice.projectType.fullstack.title': 'Multi - multi-component project',
  'init.choice.projectType.fullstack.desc':
    'Default structure uses features/{component}/',
  'init.prompt.docsMode': 'Select docs mode:',
  'init.choice.docsRepo.embedded.title':
    'embedded - inside the project (./docs)',
  'init.choice.docsRepo.embedded.desc': 'Pushed together with the project',
  'init.choice.docsRepo.standalone.title': 'standalone - separate docs repo',
  'init.choice.docsRepo.standalone.desc': 'Configure push settings separately',
  'init.prompt.workflowMode': 'Select workflow mode:',
  'init.choice.workflow.github.title':
    'GitHub - Issue and pull request workflow',
  'init.choice.workflow.github.desc':
    'Use remote Issue, branch, pull request, review, and merge gates',
  'init.choice.workflow.local.title': 'Local - local integration workflow',
  'init.choice.workflow.local.desc':
    'Use managed worktrees and local verification without requiring GitHub',
  'init.prompt.workflowSetup': 'Configure workflow automation:',
  'init.choice.workflowSetup.recommended.title':
    'Recommended - use balanced defaults',
  'init.choice.workflowSetup.recommended.desc':
    'Delegate task implementation and review Plan plus Feature',
  'init.choice.workflowSetup.custom.title': 'Custom - choose workflow options',
  'init.choice.workflowSetup.custom.desc':
    'Select task delegation, review gates, and local integration',
  'init.prompt.taskAgent': 'Delegate task implementation to a subagent?',
  'init.choice.taskAgent.on': 'On - delegate each task implementation',
  'init.choice.taskAgent.off': 'Off - implement tasks in the main agent',
  'init.prompt.reviews': 'Select independent review gates:',
  'init.prompt.maxReviewRounds':
    'Maximum fresh review rounds before continuing with residual risks:',
  'init.choice.review.plan': 'Plan',
  'init.choice.review.task': 'Task',
  'init.choice.review.feature': 'Feature',
  'init.prompt.completionStrategy': 'Select local integration strategy:',
  'init.choice.completionStrategy.localFf':
    'local-ff - fast-forward the verified Feature branch',
  'init.choice.completionStrategy.localSquash':
    'local-squash - integrate as one verified commit',
  'init.choice.completionStrategy.none':
    'none - finish without integrating the Feature branch',
  'init.prompt.componentRepoPath':
    'Enter repository path for component "{component}":',
  'init.prompt.projectRepoPath': 'Enter project repository path:',
  'init.validation.enterPath': 'Please enter a path',
  'init.prompt.pushMode': 'Select docs push mode:',
  'init.choice.push.local': 'local - manage locally (no push)',
  'init.choice.push.remote': 'remote - push to remote',
  'init.prompt.remoteUrl': 'Enter remote repository URL:',
  'init.validation.enterUrl': 'Please enter a URL',
  'init.prompt.overwrite': '{dir} already exists. Overwrite?',
  'init.log.configSummaryTitle': '⚙️  Configuration summary',
  'init.log.creatingDocs': '📁 Creating docs structure...',
  'init.log.projectLabel': 'Project',
  'init.log.typeLabel': 'Type',
  'init.log.langLabel': 'Lang',
  'init.log.pathLabel': 'Path',
  'init.log.workflowLabel': 'Workflow',
  'init.log.taskAgentLabel': 'Task implementation',
  'init.log.reviewsLabel': 'Reviews',
  'init.log.maxReviewRoundsLabel': 'Maximum fresh review rounds',
  'init.log.completionStrategyLabel': 'Local integration',
  'init.summary.taskAgent.on': 'subagent',
  'init.summary.taskAgent.off': 'main agent',
  'init.summary.reviews.none': 'none',
  'init.log.docsCreated': '✅ Docs structure created!',
  'init.log.nextStepsTitle': 'Next steps:',
  'init.log.nextSteps1': '  1. Write {docsDir}/prd/README.md',
  'init.log.nextSteps2':
    '  2. Add a feature with: npx lee-spec-kit feature <name>',
  'init.log.nextSteps3':
    '  3. Install workspace-local Codex hooks for the lee-spec-kit workflow: npx lee-spec-kit integrations codex-hooks',
  'init.log.nextSteps4':
    '  4. If you need the optional global Codex hooks bootstrap flag too: npx lee-spec-kit integrations codex',
  'init.log.nextSteps5':
    '',
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
  'init.warn.skipGitInit':
    '⚠️  Skipping Git initialization (please commit manually)',
  'init.error.templateNotFound': 'Template not found: {path}',

  'idea.fileExists': 'Idea document already exists: {path}',
  'idea.templateNotFound': 'Built-in idea template not found.',
  'idea.created': '✅ Idea document created: {path}',
  'idea.nextStepsTitle': 'Next steps:',
  'idea.nextSteps1': '  1. Fill scope, PRD refs, and promotion notes',
  'idea.nextSteps2': '  2. Promote it with: npx lee-spec-kit feature <name> --idea {ideaId}',
  'idea.nextSteps3': '  3. Mark it dropped if it should not become a feature',

  'integrations.codexBootstrapInstalled':
    '✅ Optional Codex bootstrap installed: {path}',
  'integrations.codexBootstrapAlreadyInstalled':
    '✅ Optional Codex bootstrap already installed: {path}',
  'integrations.codexBootstrapRemoved':
    '✅ Optional Codex bootstrap removed: {path}',
  'integrations.codexBootstrapAlreadyAbsent':
    '✅ Optional Codex bootstrap is already absent: {path}',
  'integrations.codexHooksInstalled':
    '✅ Repo-local Codex hooks installed: {path}',
  'integrations.codexHooksAlreadyInstalled':
    '✅ Repo-local Codex hooks already installed: {path}',
  'integrations.codexHooksRemoved':
    '✅ Repo-local Codex hooks removed: {path}',
  'integrations.codexHooksAlreadyAbsent':
    '✅ Repo-local Codex hooks are already absent: {path}',
  'integrations.codexHooksTrustRequired':
    'Review and trust the installed project hooks with /hooks in Codex. Changed hook definitions require review again.',

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
  'github.optPrScreenshots':
    'PR screenshots section mode (auto|on|off, default: auto)',
  'github.optPrMermaid': 'PR Mermaid section mode (auto|on|off, default: auto)',
  'github.optPrNoSyncTasks': 'Do not sync PR URL/PR status into tasks.md',
  'github.optPrCommitSync':
    'Commit and push tasks.md metadata sync automatically',
  'github.labelsRequired':
    'At least one label is required. Use `--labels enhancement`.',
  'github.approvalRequired':
    '{operation} requires explicit user approval. Re-run with `--confirm OK` after sharing the plan with the user.',
  'github.ghCommandFailed': 'GitHub CLI command failed',
  'github.issueLookupFailed': 'Failed to verify GitHub issue',
  'github.ghEmptyJson': 'GitHub CLI returned empty JSON output.',
  'github.ghInvalidJson': 'GitHub CLI returned invalid JSON: {snippet}',
  'github.invalidIssueReference':
    'Issue field is not a valid GitHub issue reference: {value}. Use a real issue number such as `#123`.',
  'github.issueNotFound':
    'GitHub issue {issue} was not found or is not accessible from the current repository context.',
  'github.sectionsMissing':
    '{kind} body is missing required sections: {sections}',
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
  'github.restoreBranchFailed':
    'Failed to restore previous branch after PR refresh',
  'github.mergeRetryFailed':
    'Failed to merge PR after retry attempts.{lastError}',
  'github.retryInvalid': '`--retry` must be a positive integer.',
  'github.operationIssueCreate': 'GitHub issue creation',
  'github.operationPrCreate': 'GitHub PR creation',
  'github.operationPrMerge': 'GitHub PR merge',
  'github.createIssueFailed': 'Failed to create GitHub issue',
  'github.createPrFailed': 'Failed to create GitHub PR',
  'github.mergeRequiresPr':
    '`--merge` requires `--create`, `--pr <url|number>`, or a PR link in tasks.md.',
  'github.checkoutBaseAfterMergeFailed':
    'Failed to checkout {base} after merge',
  'github.pullBaseAfterMergeFailed': 'Failed to update {base} after merge',
  'github.postMergeCheckoutWarning':
    'PR merged, but checkout to `{base}` failed (non-fatal): {detail}',
  'github.postMergePullWarning':
    'PR merged, but pull for `{base}` failed (non-fatal): {detail}',
  'github.issueDefaultTitle': '{slug} ({summary})',
  'github.prDefaultTitleWithIssue':
    'feat(#{issue}): {slug} ({featureRef} implementation)',
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
  'github.prTemplateGenerated':
    'Template generated. Add --create to open the PR automatically.',
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

  'detect.cmdDescription':
    'Detect whether the current workspace is a lee-spec-kit project',
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
  'cliError.promptBlocked.checkRequiredOptions':
    'Check required options first.',
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
  'cliError.precondition.inspectDocsAndConfig':
    'Inspect docs policy and current configuration before retrying.',
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
  'cliError.missingId.inspectJson': 'Inspect missing IDs via JSON diagnostics.',
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
  'cliError.execution.failed':
    'Review the failed command output and fix prerequisites.',
  'cliError.execution.retryAfterFixingInputs':
    'Fix the failing prerequisite or input, then retry the command.',
  'cliError.execution.runManually':
    'Run the command manually to isolate environment issues.',
  'cliError.unknown.rerunAndCaptureLogs':
    'Re-run with the same input and capture full error logs.',
  'cliError.unknown.inspectWorkspaceState':
    'Inspect workspace detection and configuration state.',
  'cliError.unknown.reportReasonCode':
    'Report the reasonCode and logs to maintainers.',

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
  'validation.ideaIdEmpty': 'Idea ID cannot be empty.',
  'validation.ideaIdFormat': "Idea ID must be 'I' + digits (e.g., I001).",
  'validation.pathEmpty': 'Path cannot be empty.',
  'validation.pathNullByte': 'Path cannot contain null bytes.',
  'validation.genericFailed': 'Validation failed',
  'validation.context.featureName': 'Feature name',
  'validation.context.featureId': 'Feature ID',
  'validation.context.ideaName': 'Idea name',
  'validation.context.ideaId': 'Idea ID',
  'validation.context.projectName': 'Project name',
  'validation.context.projectType': 'Project type',
  'validation.context.language': 'Language',
  'validation.context.workflowMode': 'Workflow mode',

  'versionCheck.noticeAvailable':
    '📦 lee-spec-kit v{latest} is available (current: v{current})',
  'versionCheck.updateCommand': '   Update: npm update -g lee-spec-kit',
} as const;

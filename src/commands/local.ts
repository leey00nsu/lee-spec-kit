import { Command } from 'commander';
import { toCliError } from '../utils/cli-error.js';
import { getConfig } from '../utils/config.js';
import { resolveFeatureSelection } from '../utils/feature-resolver.js';
import { collectWorkflowStage } from '../utils/workflow-stage.js';
import {
  currentGitBranch,
  gitRun,
  isAncestor,
  resolveLocalIntegrationContext,
  resolveRef,
  runPostMergeChecks,
  writeLocalIntegrationState,
  type LocalIntegrationState,
} from '../utils/local-integration.js';

interface LocalActionOptions {
  component?: string;
  confirm?: string;
  json?: boolean;
}

interface LocalActionPayload {
  status: 'ok' | 'blocked' | 'error';
  reasonCode: string;
  featureRef: string | null;
  baseBranch?: string;
  featureBranch?: string;
  featureTip?: string | null;
  baseTip?: string | null;
  verification?: LocalIntegrationState['verification'];
  error?: string;
}

export function localCommand(program: Command): void {
  const local = program
    .command('local')
    .description('Integrate and clean up local workflow feature branches');

  local
    .command('merge [feature-name]')
    .description('Fast-forward a completed local feature and verify the result')
    .option('--component <component>', 'Component name for multi projects')
    .option(
      '--confirm <token>',
      'Approval token when local_merge requires approval'
    )
    .option('--json', 'Output JSON for agents and hooks')
    .action(
      async (featureName: string | undefined, options: LocalActionOptions) => {
        await runLocalAction(options, () =>
          runLocalMerge(featureName, options)
        );
      }
    );

  local
    .command('cleanup [feature-name]')
    .description('Remove the verified local feature worktree and branch')
    .option('--component <component>', 'Component name for multi projects')
    .option('--json', 'Output JSON for agents and hooks')
    .action(
      async (featureName: string | undefined, options: LocalActionOptions) => {
        await runLocalAction(options, () =>
          runLocalCleanup(featureName, options)
        );
      }
    );
}

async function runLocalAction(
  options: LocalActionOptions,
  action: () => Promise<LocalActionPayload>
): Promise<void> {
  try {
    const payload = await action();
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`${payload.status}: ${payload.reasonCode}`);
    }
    if (payload.status !== 'ok') process.exitCode = 1;
  } catch (error) {
    const cliError = toCliError(error);
    const payload: LocalActionPayload = {
      status: 'error',
      reasonCode: cliError.code,
      featureRef: null,
      error: cliError.message,
    };
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      process.stderr.write(`[${cliError.code}] ${cliError.message}\n`);
    }
    process.exitCode = 1;
  }
}

async function runLocalMerge(
  featureName: string | undefined,
  options: LocalActionOptions
): Promise<LocalActionPayload> {
  const cwd = process.cwd();
  const stage = await collectWorkflowStage(cwd, featureName, options.component);
  if (
    stage.status !== 'ok' ||
    !stage.nextAction ||
    !['local_merge', 'local_verify'].includes(stage.nextAction.category)
  ) {
    return blocked(
      'LOCAL_MERGE_STAGE_REQUIRED',
      stage.featureRef,
      'The active workflow is not at local_merge or local_verify.'
    );
  }
  if (stage.approvalRequired && options.confirm !== 'OK') {
    return blocked(
      'APPROVAL_REQUIRED',
      stage.featureRef,
      'Re-run with --confirm OK after the configured local_merge approval.'
    );
  }

  const selection = await resolveFeatureSelection(
    cwd,
    featureName,
    options.component
  );
  if (selection.status !== 'selected' || !selection.matchedFeature) {
    return blocked(
      'FEATURE_SELECTION_REQUIRED',
      null,
      'Select exactly one Feature.'
    );
  }
  const config = await getConfig(cwd);
  if (!config || config.workflow?.mode !== 'local') {
    return blocked(
      'LOCAL_WORKFLOW_REQUIRED',
      selection.matchedFeature.folderName
    );
  }

  const feature = selection.matchedFeature;
  let context = await resolveLocalIntegrationContext(config, feature);
  if (!context.featureTip || !context.baseTip) {
    return blocked(
      'LOCAL_MERGE_REF_NOT_FOUND',
      feature.folderName,
      'Both the configured base branch and Feature tip must exist.'
    );
  }
  if (
    !context.featureWorktreeClean ||
    !context.projectRootClean ||
    !context.docsClean
  ) {
    return blocked(
      'LOCAL_MERGE_DIRTY_WORKTREE',
      feature.folderName,
      'Feature worktree, base worktree, and docs repo must be clean.'
    );
  }

  const now = new Date().toISOString();
  let state: LocalIntegrationState = context.state || {
    version: 1,
    featureRef: feature.folderName,
    component: feature.type,
    baseBranch: context.baseBranch,
    featureBranch: context.featureBranch,
    featureTip: context.featureTip,
    mergedBaseTip: context.baseTip,
    status: 'merged',
    mergedAt: now,
    verifiedAt: null,
    cleanedAt: null,
    verification: [],
  };

  if (!context.baseContainsFeature) {
    if (
      !isAncestor(
        context.projectRoot,
        `refs/heads/${context.baseBranch}`,
        context.featureTip
      )
    ) {
      return blocked(
        'LOCAL_MERGE_NOT_FAST_FORWARD',
        feature.folderName,
        `${context.baseBranch} is not an ancestor of ${context.featureBranch}.`
      );
    }
    if (currentGitBranch(context.projectRoot) !== context.baseBranch) {
      const checkout = gitRun(context.projectRoot, [
        'checkout',
        context.baseBranch,
      ]);
      if (checkout.code !== 0) {
        return blocked(
          'LOCAL_BASE_CHECKOUT_FAILED',
          feature.folderName,
          checkout.stderr
        );
      }
    }
    const merge = gitRun(context.projectRoot, [
      'merge',
      '--ff-only',
      context.featureBranch,
    ]);
    if (merge.code !== 0) {
      return blocked(
        'LOCAL_MERGE_NOT_FAST_FORWARD',
        feature.folderName,
        merge.stderr
      );
    }
    const mergedBaseTip = resolveRef(
      context.projectRoot,
      `refs/heads/${context.baseBranch}`
    );
    state = {
      ...state,
      featureTip: context.featureTip,
      mergedBaseTip: mergedBaseTip || context.featureTip,
      status: 'merged',
      mergedAt: now,
      verifiedAt: null,
      cleanedAt: null,
      verification: [],
    };
    await writeLocalIntegrationState(context.projectRoot, feature, state);
    context = await resolveLocalIntegrationContext(config, feature);
  }

  if (!context.baseContainsFeature) {
    return blocked('LOCAL_MERGE_VERIFICATION_FAILED', feature.folderName);
  }

  const verification = runPostMergeChecks(
    context.projectRoot,
    context.postMergeChecks
  );
  const failedCheck = verification.find((entry) => entry.exitCode !== 0);
  if (failedCheck) {
    await writeLocalIntegrationState(context.projectRoot, feature, {
      ...state,
      status: 'merged',
      verification,
      verifiedAt: null,
    });
    return {
      ...blocked('LOCAL_POST_MERGE_CHECK_FAILED', feature.folderName),
      baseBranch: context.baseBranch,
      featureBranch: context.featureBranch,
      featureTip: context.featureTip,
      baseTip: resolveRef(
        context.projectRoot,
        `refs/heads/${context.baseBranch}`
      ),
      verification,
    };
  }

  const baseTip = resolveRef(
    context.projectRoot,
    `refs/heads/${context.baseBranch}`
  );
  const verifiedFeatureTip = context.featureTip || state.featureTip;
  const verifiedState: LocalIntegrationState = {
    ...state,
    featureTip: verifiedFeatureTip,
    mergedBaseTip: baseTip || verifiedFeatureTip,
    status: 'verified',
    verifiedAt: new Date().toISOString(),
    verification,
  };
  await writeLocalIntegrationState(context.projectRoot, feature, verifiedState);

  return {
    status: 'ok',
    reasonCode: 'LOCAL_MERGE_VERIFIED',
    featureRef: feature.folderName,
    baseBranch: context.baseBranch,
    featureBranch: context.featureBranch,
    featureTip: context.featureTip,
    baseTip,
    verification,
  };
}

async function runLocalCleanup(
  featureName: string | undefined,
  options: LocalActionOptions
): Promise<LocalActionPayload> {
  const cwd = process.cwd();
  const stage = await collectWorkflowStage(cwd, featureName, options.component);
  if (stage.status !== 'ok' || stage.nextAction?.category !== 'local_cleanup') {
    return blocked(
      'LOCAL_CLEANUP_STAGE_REQUIRED',
      stage.featureRef,
      'The active workflow is not at local_cleanup.'
    );
  }
  const selection = await resolveFeatureSelection(
    cwd,
    featureName,
    options.component
  );
  if (selection.status !== 'selected' || !selection.matchedFeature) {
    return blocked('FEATURE_SELECTION_REQUIRED', null);
  }
  const config = await getConfig(cwd);
  if (!config || config.workflow?.mode !== 'local') {
    return blocked(
      'LOCAL_WORKFLOW_REQUIRED',
      selection.matchedFeature.folderName
    );
  }

  const feature = selection.matchedFeature;
  let context = await resolveLocalIntegrationContext(config, feature);
  if (
    !context.baseContainsFeature ||
    !context.state ||
    !['verified', 'cleaned'].includes(context.state.status) ||
    context.state.featureTip !== context.featureTip ||
    context.state.mergedBaseTip !== context.baseTip
  ) {
    return blocked('LOCAL_MERGE_NOT_VERIFIED', feature.folderName);
  }
  if (
    !context.featureWorktreeClean ||
    !context.projectRootClean ||
    !context.docsClean
  ) {
    return blocked('LOCAL_CLEANUP_DIRTY_WORKTREE', feature.folderName);
  }
  if (currentGitBranch(context.projectRoot) !== context.baseBranch) {
    return blocked('LOCAL_BASE_NOT_CHECKED_OUT', feature.folderName);
  }

  if (context.managedFeatureWorktree) {
    const remove = gitRun(context.projectRoot, [
      'worktree',
      'remove',
      context.featureWorktree,
    ]);
    if (remove.code !== 0) {
      return blocked(
        'LOCAL_WORKTREE_REMOVE_FAILED',
        feature.folderName,
        remove.stderr
      );
    }
  }
  if (context.deleteFeatureBranchAfterMerge && context.featureBranchExists) {
    const removeBranch = gitRun(context.projectRoot, [
      'branch',
      '-d',
      context.featureBranch,
    ]);
    if (removeBranch.code !== 0) {
      return blocked(
        'LOCAL_BRANCH_DELETE_FAILED',
        feature.folderName,
        removeBranch.stderr
      );
    }
  }

  await writeLocalIntegrationState(context.projectRoot, feature, {
    ...context.state,
    status: 'cleaned',
    cleanedAt: new Date().toISOString(),
  });
  context = await resolveLocalIntegrationContext(config, feature);

  return {
    status: 'ok',
    reasonCode: 'LOCAL_CLEANUP_COMPLETE',
    featureRef: feature.folderName,
    baseBranch: context.baseBranch,
    featureBranch: context.featureBranch,
    featureTip: context.featureTip,
    baseTip: context.baseTip,
  };
}

function blocked(
  reasonCode: string,
  featureRef: string | null,
  error?: string
): LocalActionPayload {
  return {
    status: 'blocked',
    reasonCode,
    featureRef,
    ...(error ? { error } : {}),
  };
}

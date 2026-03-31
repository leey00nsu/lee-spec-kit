import { tr } from '../i18n.js';
import {
  FeatureState,
  Lang,
  NextAction,
  StepDefinition,
  StepOwner,
  StepPhase,
} from './types.js';
import { createDefaultApprovalConfig, ProjectConfig } from '../config.js';

function normalizeApprovalToken(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function applyApprovalPolicy(
  step: number,
  actions: NextAction[],
  approval?: ProjectConfig['approval'],
  currentSubstatePhase?: StepPhase
): NextAction[] {
  const effectiveApproval = approval ?? createDefaultApprovalConfig();
  const taskExecuteCheckPolicy = effectiveApproval.taskExecuteCheck === 'start_only'
    ? 'start_only'
    : 'both';
  const mode = effectiveApproval.mode ?? 'category';

  if (mode === 'steps') {
    const required = new Set(
      (effectiveApproval.requireCheckSteps ?? [])
        .map((n) => (typeof n === 'number' ? n : Number(n)))
        .filter((n) => Number.isFinite(n))
    );
    const requiresUserCheck = required.has(step);
    return actions.map((action) => ({
      ...action,
      requiresUserCheck: applyTaskExecutePhaseCheck(
        action,
        requiresUserCheck,
        taskExecuteCheckPolicy,
        false,
        currentSubstatePhase
      ),
    }));
  }

  const requiredCategories = new Set(
    (effectiveApproval.requireCheckCategories ?? [])
      .map((c) => normalizeApprovalToken(c))
      .filter(Boolean)
  );
  const skippedCategories = new Set(
    (effectiveApproval.skipCheckCategories ?? [])
      .map((c) => normalizeApprovalToken(c))
      .filter(Boolean)
  );
  const defaultPolicy = effectiveApproval.default ?? 'keep';

  return actions.map((a) => {
    const builtin = Boolean(a.requiresUserCheck);
    const category = normalizeApprovalToken(a.category ?? 'uncategorized');
    const explicitlyRequired =
      requiredCategories.has('*') || requiredCategories.has(category);

    let requiresUserCheck = builtin;
    if (explicitlyRequired) {
      requiresUserCheck = true;
    } else if (skippedCategories.has('*') || skippedCategories.has(category)) {
      requiresUserCheck = false;
    } else if (defaultPolicy === 'require') {
      requiresUserCheck = true;
    } else if (defaultPolicy === 'skip') {
      requiresUserCheck = false;
    }

    return {
      ...a,
      requiresUserCheck: applyTaskExecutePhaseCheck(
        a,
        requiresUserCheck,
        taskExecuteCheckPolicy,
        explicitlyRequired,
        currentSubstatePhase
      ),
    };
  });
}

function applyTaskExecutePhaseCheck(
  action: NextAction,
  requiresUserCheck: boolean,
  policy: 'both' | 'start_only',
  explicitlyRequired = false,
  currentSubstatePhase?: StepPhase
): boolean {
  if (policy !== 'start_only') return requiresUserCheck;
  if (action.category !== 'task_execute') return requiresUserCheck;
  const isCompletionPhase =
    currentSubstatePhase === 'running' ||
    currentSubstatePhase === 'finalize' ||
    (!currentSubstatePhase && action.taskExecutePhase === 'complete');
  if (!isCompletionPhase) return requiresUserCheck;
  if (explicitlyRequired) return requiresUserCheck;
  return false;
}

function withFeatureScopeSplitOptions(
  actions: NextAction[],
  feature: FeatureState,
  lang: Lang
): NextAction[] {
  if (!feature.scopeSplit.suggested) return actions;
  if (feature.tasks.total === 0 || feature.tasks.done >= feature.tasks.total) {
    return actions;
  }
  if (actions.some((action) => action.category === 'feature_scope_split')) {
    return actions;
  }

  const recommendedIssues = feature.scopeSplit.recommendation === 'split_4' ? 4 : 2;
  const recommendationLabel =
    feature.scopeSplit.recommendation === 'split_4'
      ? 'split_4'
      : feature.scopeSplit.recommendation === 'split_2'
        ? 'split_2'
        : 'none';
  const vars = {
    taskCount: feature.scopeSplit.taskCount,
    decisionsLineCount: feature.scopeSplit.decisionsLineCount,
    taskThreshold: feature.scopeSplit.suggestTaskCountThreshold,
    decisionsThreshold:
      feature.scopeSplit.suggestDecisionsLineCountThreshold,
    recommendFourTaskThreshold:
      feature.scopeSplit.recommendSplitFourTaskCountThreshold,
    recommendFourDecisionsThreshold:
      feature.scopeSplit.recommendSplitFourDecisionsLineCountThreshold,
    recommendedIssues,
    recommendationLabel,
    guideCommand: 'npx lee-spec-kit docs get split-feature --json',
  };

  return [
    ...actions,
    {
      type: 'instruction',
      category: 'feature_scope_split',
      requiresUserCheck: true,
      uiDetailKey: 'context.actionDetail.featureScopeSplitKeep',
      message: tr(lang, 'messages', 'featureScopeSplitKeep', vars),
    },
    {
      type: 'instruction',
      category: 'feature_scope_split',
      requiresUserCheck: true,
      uiDetailKey: 'context.actionDetail.featureScopeSplitTwo',
      message: tr(lang, 'messages', 'featureScopeSplitTwo', vars),
    },
    {
      type: 'instruction',
      category: 'feature_scope_split',
      requiresUserCheck: true,
      uiDetailKey: 'context.actionDetail.featureScopeSplitFour',
      message: tr(lang, 'messages', 'featureScopeSplitFour', vars),
    },
  ];
}

function withExistingWorktreeMoveOption(
  actions: NextAction[],
  feature: FeatureState,
  lang: Lang
): NextAction[] {
  if (feature.tasks.total === 0 || feature.tasks.done >= feature.tasks.total) {
    return actions;
  }
  if (feature.git.projectInManagedWorktree) return actions;
  if (!feature.git.onExpectedBranch) return actions;
  if (!feature.git.expectedWorktreePath) return actions;
  if (
    actions.some(
      (action) =>
        action.category === 'branch_create' &&
        action.type === 'instruction' &&
        action.message.includes(feature.git.expectedWorktreePath || '')
    )
  ) {
    return actions;
  }
  return [
    ...actions,
    {
      type: 'instruction',
      category: 'branch_create',
      requiresUserCheck: true,
      uiDetailKey: 'context.actionDetail.branchCreate',
      message: tr(lang, 'messages', 'moveToExistingWorktree', {
        worktreePath: feature.git.expectedWorktreePath,
      }),
    },
  ];
}

function withUserRequestReplanOption(
  actions: NextAction[],
  lang: Lang
): NextAction[] {
  if (actions.some((action) => action.category === 'user_request_replan')) {
    return actions;
  }
  return [
    ...actions,
    {
      type: 'instruction',
      category: 'user_request_replan',
      requiresUserCheck: true,
      message: tr(lang, 'messages', 'userRequestReplan'),
    },
  ];
}

export function resolveFeatureProgress(
  feature: FeatureState,
  stepDefinitions: StepDefinition[],
  lang: Lang,
  approval?: ProjectConfig['approval']
): {
  currentStep: number;
  currentSubstateId?: string;
  currentSubstateOwner?: StepOwner;
  currentSubstatePhase?: StepPhase;
  actions: NextAction[];
  nextAction: string;
} {
  const ordered = [...stepDefinitions].sort((a, b) => a.step - b.step);
  for (const definition of ordered) {
    if (definition.substates && definition.substates.length > 0) {
      const matchedSubstate = definition.substates.find((substate) =>
        substate.when(feature)
      );
      if (matchedSubstate) {
        const actionsWithScopeSplit = withFeatureScopeSplitOptions(
          matchedSubstate.actions(feature),
          feature,
          lang
        );
        const actionsWithWorktreeMove = withExistingWorktreeMoveOption(
          actionsWithScopeSplit,
          feature,
          lang
        );
        const currentActions = withUserRequestReplanOption(
          actionsWithWorktreeMove,
          lang
        );
        const actions = applyApprovalPolicy(
          definition.step,
          currentActions,
          approval,
          matchedSubstate.phase
        );
        return {
          currentStep: definition.step,
          currentSubstateId: matchedSubstate.id,
          currentSubstateOwner: matchedSubstate.owner,
          currentSubstatePhase: matchedSubstate.phase,
          actions,
          nextAction: actions
            .map((a) => (a.type === 'command' ? a.cmd : a.message))
            .join('\n'),
        };
      }
    }
    if (!definition.current) continue;
    if (definition.current.when(feature)) {
      const actionsWithScopeSplit = withFeatureScopeSplitOptions(
        definition.current.actions(feature),
        feature,
        lang
      );
      const actionsWithWorktreeMove = withExistingWorktreeMoveOption(
        actionsWithScopeSplit,
        feature,
        lang
      );
      const currentActions = withUserRequestReplanOption(
        actionsWithWorktreeMove,
        lang
      );
      const actions = applyApprovalPolicy(
        definition.step,
        currentActions,
        approval
      );
      return {
        currentStep: definition.step,
        actions,
        nextAction: actions
          .map((a) => (a.type === 'command' ? a.cmd : a.message))
          .join('\n'),
      };
    }
  }

  const lastStep = ordered[ordered.length - 1];
  return {
    currentStep: lastStep?.step ?? 10,
    actions: [
      {
        type: 'instruction',
        category: 'fallback',
        message: tr(lang, 'messages', 'fallbackRerunContext'),
      },
    ],
    nextAction: tr(lang, 'messages', 'fallbackRerunContext'),
  };
}

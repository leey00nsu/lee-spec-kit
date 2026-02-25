import { tr } from '../i18n.js';
import { FeatureState, Lang, NextAction, StepDefinition } from './types.js';
import { ProjectConfig } from '../config.js';

function normalizeApprovalToken(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function applyApprovalPolicy(
  step: number,
  actions: NextAction[],
  approval?: ProjectConfig['approval']
): NextAction[] {
  const taskExecuteCheckPolicy = approval?.taskExecuteCheck === 'start_only'
    ? 'start_only'
    : 'both';
  if (!approval) {
    return actions.map((action) => ({
      ...action,
      requiresUserCheck: applyTaskExecutePhaseCheck(
        action,
        Boolean(action.requiresUserCheck),
        taskExecuteCheckPolicy
      ),
    }));
  }
  const mode = approval.mode ?? 'builtin';
  if (mode === 'builtin') {
    return actions.map((action) => ({
      ...action,
      requiresUserCheck: applyTaskExecutePhaseCheck(
        action,
        Boolean(action.requiresUserCheck),
        taskExecuteCheckPolicy
      ),
    }));
  }

  if (mode === 'steps') {
    const required = new Set(
      (approval.requireCheckSteps ?? approval.requireOkSteps ?? [])
        .map((n) => (typeof n === 'number' ? n : Number(n)))
        .filter((n) => Number.isFinite(n))
    );
    const requiresUserCheck = required.has(step);
    return actions.map((a) => ({ ...a, requiresUserCheck }));
  }

  const requiredCategories = new Set(
    (approval.requireCheckCategories ?? approval.requireOkCategories ?? [])
      .map((c) => normalizeApprovalToken(c))
      .filter(Boolean)
  );
  const skippedCategories = new Set(
    (approval.skipCheckCategories ?? approval.skipOkCategories ?? [])
      .map((c) => normalizeApprovalToken(c))
      .filter(Boolean)
  );
  const defaultPolicy = approval.default ?? 'keep';

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
        explicitlyRequired
      ),
    };
  });
}

function applyTaskExecutePhaseCheck(
  action: NextAction,
  requiresUserCheck: boolean,
  policy: 'both' | 'start_only',
  explicitlyRequired = false
): boolean {
  if (policy !== 'start_only') return requiresUserCheck;
  if (action.category !== 'task_execute') return requiresUserCheck;
  if (action.taskExecutePhase !== 'complete') return requiresUserCheck;
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
  actions: NextAction[];
  nextAction: string;
} {
  const ordered = [...stepDefinitions].sort((a, b) => a.step - b.step);
  for (const definition of ordered) {
    if (!definition.current) continue;
    if (definition.current.when(feature)) {
      const actionsWithScopeSplit = withFeatureScopeSplitOptions(
        definition.current.actions(feature),
        feature,
        lang
      );
      const currentActions = withUserRequestReplanOption(
        actionsWithScopeSplit,
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

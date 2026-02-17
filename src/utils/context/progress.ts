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
  if (!approval) return actions;
  const mode = approval.mode ?? 'builtin';
  if (mode === 'builtin') return actions;

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

    let requiresUserCheck = builtin;
    if (requiredCategories.has('*') || requiredCategories.has(category)) {
      requiresUserCheck = true;
    } else if (skippedCategories.has('*') || skippedCategories.has(category)) {
      requiresUserCheck = false;
    } else if (defaultPolicy === 'require') {
      requiresUserCheck = true;
    } else if (defaultPolicy === 'skip') {
      requiresUserCheck = false;
    }

    return { ...a, requiresUserCheck };
  });
}

function withUserRequestReplanOption(
  actions: NextAction[],
  lang: Lang,
  feature: FeatureState,
  step: number
): NextAction[] {
  // While a task is actively in progress, keep options focused on execution.
  // Showing "handle new requirement first" at this point confuses users and
  // often causes accidental detours.
  if (step === 10 && feature.activeTask) {
    return actions;
  }

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
      const currentActions = withUserRequestReplanOption(
        definition.current.actions(feature),
        lang,
        feature,
        definition.step
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

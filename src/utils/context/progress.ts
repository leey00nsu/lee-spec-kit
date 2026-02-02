import { tr } from './i18n.js';
import { FeatureState, Lang, NextAction, StepDefinition } from './types.js';

export function resolveFeatureProgress(
  feature: FeatureState,
  stepDefinitions: StepDefinition[],
  lang: Lang
): {
  currentStep: number;
  actions: NextAction[];
  nextAction: string;
} {
  const ordered = [...stepDefinitions].sort((a, b) => a.step - b.step);
  for (const definition of ordered) {
    if (!definition.current) continue;
    if (definition.current.when(feature)) {
      const actions = definition.current.actions(feature);
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
        message: tr(lang, 'messages', 'fallbackRerunContext'),
      },
    ],
    nextAction: tr(lang, 'messages', 'fallbackRerunContext'),
  };
}


export type {
  ActionScope,
  CompletionChecklistSummary,
  FeatureContext,
  FeatureState,
  NextAction,
  StepDefinition,
  TaskRef,
} from './types.js';

export { getStepDefinitions, getStepsMap, STEP_DEFINITIONS, STEPS } from './steps.js';
export { resolveFeatureProgress } from './progress.js';
export { getCurrentBranch } from './git.js';
export { parseFeature } from './parse.js';
export { scanFeatures } from './scan.js';


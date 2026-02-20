import fs from 'fs';

const file = 'src/commands/context.ts';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const extract1 = lines.slice(64, 600); // Lines 65-600 inclusive is index 64..599 (slice ends at 600)
const extract2 = lines.slice(699, 926); // Lines 700-926 inclusive is index 699..925 (slice ends at 926)

// Modify extract1 and extract2 to add `export` to functions and interfaces.
const exportedExtract1 = extract1.map((line) => {
  if (line.match(/^(function|interface|type|const) /)) {
    return 'export ' + line;
  }
  return line;
});

const exportedExtract2 = extract2.map((line) => {
  if (line.match(/^(function|interface|type|const) /)) {
    return 'export ' + line;
  }
  return line;
});

const newPresenterContent =
  `import chalk from 'chalk';
import { createHash } from 'crypto';
import {
  FeatureContext,
  ACTION_CATEGORIES,
  getStepDefinitions,
  getStepsMap,
  StepDefinition,
} from '../utils/context.js';
import {
  ActionOption,
  ContextSelectionOptions,
  ContextSelectionState,
  resolveContextSelection,
  toReasonCode,
} from '../utils/context-selection.js';
import {
    BuiltinDocId,
    getRecommendedDocIdsForCategories,
    toBuiltinDocCommand,
} from '../utils/builtin-docs.js';
import { getConfig } from '../utils/config.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { createCliContext } from '../utils/cli-context.js';
import { createCliError } from '../utils/cli-error.js';
import { resolvePrePrReviewPolicy, resolveTaskCommitGatePolicy, resolveWorkflowPolicy } from '../utils/workflow.js';

type ResolvedContextState = ContextSelectionState;
` +
  exportedExtract1.join('\n') +
  '\n\n' +
  exportedExtract2.join('\n');

fs.mkdirSync('src/services', { recursive: true });
fs.writeFileSync('src/services/ContextPresenter.ts', newPresenterContent);

// Remove extracted lines from context.ts
const newContextContentLines = [
  ...lines.slice(0, 64),
  "import * as presenter from '../services/ContextPresenter.js';",
  ...lines.slice(600, 699),
  ...lines.slice(926),
];

// In newContextContentLines, replace all function calls that have been exported.
let newContextContent = newContextContentLines.join('\n');
const toReplace = [
  'RequiredDocHint',
  'SuggestionOption',
  'ApprovalConfig',
  'AutoRunReasonCode',
  'AutoRunPlan',
  'AgentOrchestrationPolicy',
  'LONG_RUNNING_DELEGATION_CATEGORIES',
  'isTaskExecuteProjectCommitCommand',
  'shouldDelegateCurrentAction',
  'buildAgentOrchestrationPolicy',
  'resolveContextState',
  'listLabels',
  'listSuggestionLabels',
  'listActiveCategories',
  'listUncategorizedLabels',
  'resolveFeatureRefForApproval',
  'buildApprovalCommand',
  'buildFinalApprovalPrompt',
  'buildSuggestionFinalPrompt',
  'normalizeCategoryToken',
  'resolveAutoRunCategories',
  'buildAutoRunCommand',
  'resolveAutoRunPlan',
  'toSuggestionLabel',
  'buildSuggestionOptions',
  'printSuggestionOptions',
  'buildRequiredDocHints',
  'getListLabel',
  'getMultipleFeaturesRecommendation',
  'getFeatureRef',
  'toCompactFeature',
  'toCompactActionOption',
  'toCompactSuggestionOption',
  'resolveContextRecommendation',
];

toReplace.forEach((name) => {
  // using regex boundary and negative lookbehind
  const regex = new RegExp(
    '(?<!function |interface |type |const |export |class |namespace |\\.)\\b' +
      name +
      '\\b',
    'g'
  );
  newContextContent = newContextContent.replace(regex, 'presenter.' + name);
});

// Since the replacements might have broken some imports if the name matched, let's fix the imports.
// wait, the imports at the top didn't contain these words, but some types like `ApprovalConfig` might.
fs.writeFileSync('src/commands/context.ts', newContextContent);

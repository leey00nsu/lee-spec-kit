import fs from 'fs';

const file = 'src/commands/context.ts';
let content = fs.readFileSync(file, 'utf8');

// The first block
const start1 = 'interface RequiredDocHint {';
const end1Text = '  }));\n}\n';
const pos1Start = content.indexOf(start1);
if (pos1Start === -1) throw new Error('start1 not found');
const pos1End = content.indexOf(end1Text, pos1Start) + end1Text.length;

const block1 = content.substring(pos1Start, pos1End);

// The second block
const start2 = 'function getListLabel(';
const end2Text = "  return 'No matched feature.';\n}\n";
const pos2Start = content.indexOf(start2);
if (pos2Start === -1) throw new Error('start2 not found');
const pos2End = content.indexOf(end2Text, pos2Start) + end2Text.length;

const block2 = content.substring(pos2Start, pos2End);

// Modify to add `export`
const reExport = /^(function|interface|type|const)\s/gm;
const exportedBlock1 = block1.replace(reExport, 'export $1 ');
const exportedBlock2 = block2.replace(reExport, 'export $1 ');

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
import { resolvePrePrReviewPolicy, resolveTaskCommitGatePolicy, resolveWorkflowPolicy } from '../utils/workflow.js';

export type ResolvedContextState = ContextSelectionState;
` +
  exportedBlock1 +
  '\n\n' +
  exportedBlock2;

fs.mkdirSync('src/services', { recursive: true });
fs.writeFileSync('src/services/ContextPresenter.ts', newPresenterContent);

// Remove blocks from context.ts
let newContent =
  content.substring(0, pos1Start) +
  content.substring(pos1End, pos2Start) +
  content.substring(pos2End);

// Insert import at top (after imports)
const lastImport = newContent.lastIndexOf('import ');
const importEnd = newContent.indexOf('\\n', lastImport);
// Actually, it's safer to just put it at the top
newContent =
  `import * as presenter from '../services/ContextPresenter.js';\n` +
  newContent;

// Replace function calls
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
  const regex = new RegExp(
    '(?<!function |interface |type |const |export |class |namespace |\\.|[\'\"])\\b' +
      name +
      '\\b',
    'g'
  );
  newContent = newContent.replace(regex, 'presenter.' + name);
});

fs.writeFileSync('src/commands/context.ts', newContent);
console.log('Refactoring complete');

import fs from 'fs';

const file = 'src/commands/github.ts';
let content = fs.readFileSync(file, 'utf8');

// We want to extract from `interface GithubBaseOptions {` down to right before `export function githubCommand(`

const startStr = 'interface GithubBaseOptions {';
const endStr = 'export function githubCommand(';

const posStart = content.indexOf(startStr);
const posEnd = content.indexOf(endStr);

if (posStart === -1 || posEnd === -1) {
  throw new Error('Could not find start or end bounds');
}

const block = content.substring(posStart, posEnd);

// Prefix functions, interfaces, types with export
const reExport = /^(?:async\s+)?(function|interface|type|const)\s+/gm;
let exportedBlock = block.replace(reExport, 'export $&');

// But wait, there might be some functions that are ALREADY exported or some constants.
// Also `const TODO_PLACEHOLDER_PATTERN = ...` will become `export const TODO_PLACEHOLDER_PATTERN` which is correct.

const newServiceContent =
  `import { createHash } from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { DEFAULT_LANG, I18nKey, Lang, tr } from '../utils/i18n.js';
import { getConfig } from '../utils/config.js';
import {
  ContextSelectionOptions,
  resolveContextSelection,
} from '../utils/context-selection.js';
import { CliContext } from '../utils/cli-context.js';
import { createCliContext } from '../utils/cli-context.js';
import { FeatureContext } from '../utils/context/index.js';
import {
  createCliError,
  getCliErrorSuggestions,
  printCliErrorSuggestions,
  toCliError,
} from '../utils/cli-error.js';
import { assertValid, validatePathWithLang } from '../utils/validation.js';
import {
  getGithubDraftArtifactHeading,
  getGithubDraftRequiredSections,
} from '../utils/github-draft-contract.js';
import {
  runGhJson as runGhJsonProcess,
  runProcess,
  runProcessOrThrow,
} from './github/process.js';

` + exportedBlock;

fs.mkdirSync('src/services', { recursive: true });
fs.writeFileSync('src/services/GithubWorkflowService.ts', newServiceContent);

// Remove block from original
let newContent = content.substring(0, posStart) + content.substring(posEnd);

// Instead of putting import * as ghService at the top blindly, place it after imports
const lastImport = newContent.lastIndexOf('import ');
const importEnd = newContent.indexOf(';', lastImport) + 1;
newContent =
  newContent.substring(0, importEnd) +
  `\nimport * as ghService from '../services/GithubWorkflowService.js';\n` +
  newContent.substring(importEnd);

// Get all the extracted names to replace them with ghService.name
// Find all `export function X(`, `export interface X`, `export type X`, `export const X`, or `export async function X(`
const namesToReplace = [];
const extractRegex =
  /^export\s+(?:async\s+)?(?:function|interface|type|const)\s+([a-zA-Z0-9_]+)/gm;
let match;
while ((match = extractRegex.exec(exportedBlock)) !== null) {
  namesToReplace.push(match[1]);
}

// Split content to avoid replacing inside imports
let importsPart = newContent.substring(0, importEnd);
let bodyPart = newContent.substring(importEnd);

// Replace in the body content
namesToReplace.forEach((name) => {
  // Only replace it as a whole word, if it's not prefixed by a dot, by "function " (though we extracted all), etc.
  const regex = new RegExp(
    '(?<!function |interface |type |const |export |class |namespace |\\.|[\'\"])\\b' +
      name +
      '\\b',
    'g'
  );
  bodyPart = bodyPart.replace(regex, 'ghService.' + name);
});

newContent =
  importsPart +
  `\nimport * as ghService from '../services/GithubWorkflowService.js';\n` +
  bodyPart;

fs.writeFileSync('src/commands/github.ts', newContent);
console.log(
  'Extraction complete, writing new files. Extracted ' +
    namesToReplace.length +
    ' symbols.'
);

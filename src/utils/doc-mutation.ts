import path from 'node:path';
import fs from 'fs-extra';
import { createCliError } from './cli-error.js';
import { getLocalDateString } from './date.js';
import {
  resolveFeatureSelection,
  type ResolvedFeature,
} from './feature-resolver.js';
import { parseTaskLine } from './task-lines.js';
import { resolveDocsWorkspace } from './feature-workspace.js';
import { getConfig } from './config.js';
import { isRegisteredGitWorktree } from './standalone-workspace.js';
import { runGitCapture } from './git-run.js';

export interface FeatureDocMutationTarget {
  feature: ResolvedFeature;
  path: string;
}

export function collectRepeatableOption(
  value: string,
  previous: string[] = []
): string[] {
  return [...previous, value];
}

export function normalizeRequiredText(value: string | undefined, label: string): string {
  const normalized = (value || '').trim();
  if (!normalized || normalized === '-' || /^todo$/i.test(normalized)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `${label} must contain concrete text.`
    );
  }
  return normalized;
}

export function normalizeRequiredItems(
  values: string[] | undefined,
  label: string
): string[] {
  const normalized = (values || [])
    .map((value) => value.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `${label} must be provided at least once.`
    );
  }

  for (const value of normalized) {
    normalizeRequiredText(value, label);
  }

  return normalized;
}

export async function resolveFeatureDocTarget(input: {
  cwd: string;
  selector?: string;
  component?: string;
  fileName: 'tasks.md' | 'decisions.md';
}): Promise<FeatureDocMutationTarget> {
  const state = await resolveFeatureSelection(
    input.cwd,
    input.selector,
    input.component
  );

  if (state.status !== 'selected' || !state.matchedFeature) {
    throw createCliError(
      'CONTEXT_SELECTION_REQUIRED',
      `A single feature is required. Pass <feature-name> explicitly.`
    );
  }

  let feature = state.matchedFeature;
  const docsWorkspace = await resolveDocsWorkspace(state.config, feature);
  if (
    state.config.docsRepo === 'standalone' &&
    !/^F\d{3,}$/.test(feature.id) &&
    !docsWorkspace
  ) {
    throw createCliError(
      'PRECONDITION_FAILED',
      'The selected Feature requires registered docs workspace metadata.'
    );
  }
  let workspaceCwd: string | null = null;
  if (docsWorkspace && (docsWorkspace.current || !docsWorkspace.integrated)) {
    if (!isRegisteredGitWorktree(docsWorkspace.root, docsWorkspace.directory)) {
      throw createCliError(
        'PRECONDITION_FAILED',
        'Prepare the registered Feature docs workspace before editing its documents.'
      );
    }
    const branch = runGitCapture(
      ['branch', '--show-current'],
      docsWorkspace.directory
    );
    if (branch !== docsWorkspace.branch) {
      throw createCliError(
        'PRECONDITION_FAILED',
        `Docs workspace branch mismatch: expected ${docsWorkspace.branch}, received ${branch || '(detached)'}.`
      );
    }
    const registration = await fs.readJson(
      path.join(
        docsWorkspace.docsDirectory,
        feature.docs.featurePathFromDocs,
        '.feature.json'
      )
    ).catch(() => null);
    if (registration?.id !== feature.id) {
      throw createCliError(
        'PRECONDITION_FAILED',
        'The docs workspace does not contain the selected Feature registration.'
      );
    }
    if (!docsWorkspace.current) workspaceCwd = docsWorkspace.docsDirectory;
  } else if (state.config.docsRepo !== 'standalone' && feature.git.managedWorktree) {
    workspaceCwd = feature.git.projectGitCwd;
  }
  if (workspaceCwd) {
    const workspaceConfig = await getConfig(workspaceCwd);
    if (workspaceConfig && workspaceConfig.docsDir !== state.config.docsDir) {
      const workspaceSelection = await resolveFeatureSelection(
        workspaceCwd,
        feature.folderName,
        feature.type === 'single' ? undefined : feature.type
      );
      if (!workspaceSelection.matchedFeature) {
        throw createCliError(
          'FEATURE_SELECTION_REQUIRED',
          'The managed workspace no longer contains the selected Feature.'
        );
      }
      feature = workspaceSelection.matchedFeature;
    }
  }
  const targetPath = path.join(feature.path, input.fileName);
  if (!(await fs.pathExists(targetPath))) {
    throw createCliError(
      'PRECONDITION_FAILED',
      `${input.fileName} not found for feature: ${state.matchedFeature.folderName}`
    );
  }

  return {
    feature,
    path: targetPath,
  };
}

export function findSecondLevelHeadingIndex(lines: string[], names: string[]): number {
  const alternatives = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`^\\s*##\\s+(${alternatives.join('|')})\\s*$`);
  return lines.findIndex((line) => pattern.test(line));
}

export function findNextSecondLevelHeadingIndex(lines: string[], start: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*##\s+/.test(lines[index] || '')) return index;
  }
  return lines.length;
}

export function normalizeMarkdownEnd(content: string): string {
  return content.replace(/\s+$/g, '') + '\n';
}

export function localDate(): string {
  return getLocalDateString();
}

export function nextTaskSequence(content: string, featureFolderName: string): number {
  const escaped = featureFolderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const taskIdPattern = new RegExp(`\\bT-${escaped}-(\\d+)\\b`, 'g');
  let max = 0;
  for (const match of content.matchAll(taskIdPattern)) {
    const parsed = Number(match[1] || '0');
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return max + 1;
}

export function findTaskInsertIndex(
  lines: string[],
  sectionStart: number,
  sectionEnd: number
): number {
  let lastTaskIndex = -1;
  for (let index = sectionStart; index < sectionEnd; index += 1) {
    if (parseTaskLine(lines[index] || '', index)) lastTaskIndex = index;
  }

  if (lastTaskIndex < 0) return sectionEnd;

  let insertIndex = lastTaskIndex + 1;
  while (insertIndex < sectionEnd) {
    const line = lines[insertIndex] || '';
    if (parseTaskLine(line, insertIndex)) break;
    if (/^\s{2,}\S/.test(line) || /^\s*$/.test(line)) {
      insertIndex += 1;
      continue;
    }
    break;
  }
  return insertIndex;
}

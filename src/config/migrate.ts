import { LEGACY_APPROVAL_CATEGORY_STEPS } from './legacy-approval.js';

const OBSOLETE_PRE_PR_REVIEW_KEYS = [
  'skills',
  'fallback',
  'decisionEnum',
  'enforceExecutionEvidence',
  'executionCommandPrefixes',
] as const;

interface ApprovalMigrationResult {
  approval: Record<string, unknown>;
  changedPaths: string[];
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function migrateLegacyWorkflowSettings(
  workflow: Record<string, unknown>
): string[] {
  const changedPaths: string[] = [];
  const hasCanonicalMode =
    workflow.mode === 'github' || workflow.mode === 'local';
  const legacyPreset = workflow.preset;
  const canonicalMode = hasCanonicalMode
    ? workflow.mode
    : legacyPreset === 'local'
      ? 'local'
      : 'github';

  if (workflow.mode !== canonicalMode) {
    workflow.mode = canonicalMode;
    changedPaths.push('workflow.mode');
  }
  if (
    !hasCanonicalMode &&
    legacyPreset === 'strict' &&
    workflow.requireWorktree === undefined
  ) {
    workflow.requireWorktree = true;
    changedPaths.push('workflow.requireWorktree');
  }
  if (hasOwnKey(workflow, 'preset')) {
    delete workflow.preset;
    changedPaths.push('workflow.preset');
  }
  if (hasOwnKey(workflow, 'auto')) {
    delete workflow.auto;
    changedPaths.push('workflow.auto');
  }

  if (isPlainRecord(workflow.prePrReview)) {
    const prePrReview = workflow.prePrReview;
    for (const key of OBSOLETE_PRE_PR_REVIEW_KEYS) {
      if (!hasOwnKey(prePrReview, key)) continue;
      delete prePrReview[key];
      changedPaths.push(`workflow.prePrReview.${key}`);
    }
  }

  return changedPaths;
}

export function migrateLegacyApprovalSettings(
  approval: Record<string, unknown>
): ApprovalMigrationResult {
  if (approval.mode === 'steps') {
    const requiredSteps = new Set(
      (Array.isArray(approval.requireCheckSteps)
        ? approval.requireCheckSteps
        : []
      )
        .map((value) =>
          typeof value === 'number' ? value : Number(value)
        )
        .filter((value) => Number.isFinite(value))
    );
    const requireCheckCategories: string[] = [];
    const skipCheckCategories: string[] = [];

    for (const [category, step] of LEGACY_APPROVAL_CATEGORY_STEPS) {
      if (requiredSteps.has(step)) {
        requireCheckCategories.push(category);
      } else {
        skipCheckCategories.push(category);
      }
    }

    const migratedApproval = { ...approval };
    delete migratedApproval.requireCheckSteps;
    delete migratedApproval.taskExecuteCheck;

    return {
      approval: {
        ...migratedApproval,
        mode: 'category',
        default: 'keep',
        requireCheckCategories,
        skipCheckCategories,
      },
      changedPaths: ['approval'],
    };
  }

  const changedPaths: string[] = [];
  if (hasOwnKey(approval, 'requireCheckSteps')) {
    delete approval.requireCheckSteps;
    changedPaths.push('approval.requireCheckSteps');
  }
  if (hasOwnKey(approval, 'taskExecuteCheck')) {
    delete approval.taskExecuteCheck;
    changedPaths.push('approval.taskExecuteCheck');
  }
  return { approval, changedPaths };
}

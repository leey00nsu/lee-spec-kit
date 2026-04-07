import type { WorkflowPolicy } from './policies.js';

export type WorkflowPreset = 'github' | 'local' | 'strict';

export function resolveWorkflowPreset(
  preset: WorkflowPreset | undefined,
  mode: 'github' | 'local' | undefined
): WorkflowPolicy {
  const normalizedPreset =
    preset === 'local' || preset === 'strict' || preset === 'github'
      ? preset
      : undefined;

  if (normalizedPreset === 'local' || mode === 'local') {
    return {
      mode: 'local',
      requireIssue: false,
      requireBranch: false,
      requireWorktree: false,
      requirePr: false,
      requireReview: false,
      requireMerge: false,
    };
  }

  if (normalizedPreset === 'strict') {
    return {
      mode: 'github',
      requireIssue: true,
      requireBranch: true,
      requireWorktree: true,
      requirePr: true,
      requireReview: true,
      requireMerge: true,
    };
  }

  return {
    mode: 'github',
    requireIssue: true,
    requireBranch: true,
    requireWorktree: false,
    requirePr: true,
    requireReview: true,
    requireMerge: true,
  };
}

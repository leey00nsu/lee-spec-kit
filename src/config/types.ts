import { ProjectType } from '../utils/project-type.js';
import { AllowedDocsEntriesConfig } from '../utils/unmanaged-docs.js';

export const DEFAULT_APPROVAL_REQUIRE_CHECK_CATEGORIES = [
  'spec_approve',
  'implementation_approve',
] as const;

export const PRE_PR_REVIEW_REASONING_EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;

export type PrePrReviewReasoningEffort =
  (typeof PRE_PR_REVIEW_REASONING_EFFORTS)[number];

export interface PrePrReviewerConfig {
  type: 'subagent';
  model: string;
  reasoningEffort: PrePrReviewReasoningEffort;
  onUnavailable: 'inherit' | 'error';
}

export interface LocalPostMergeCheck {
  command: string;
  args?: string[];
}

export interface ProjectConfig {
  schemaId?: string;
  docsDir: string;
  projectName?: string;
  projectType: ProjectType;
  components?: string[];
  lang: 'ko' | 'en';
  docsRepo?: 'embedded' | 'standalone';
  workspaceRoot?: string;
  pushDocs?: boolean;
  docsRemote?: string;
  projectRoot?: string | Record<string, string>;
  allowedDocsEntries?: AllowedDocsEntriesConfig;
  pr?: {
    screenshots?: {
      upload?: boolean;
    };
  };
  workflow?: {
    /** @deprecated Read compatibility for projects created before workflow.mode. */
    preset?: 'github' | 'local' | 'strict';
    mode?: 'github' | 'local';
    requireIssue?: boolean;
    requireBranch?: boolean;
    requireWorktree?: boolean;
    requirePr?: boolean;
    requireReview?: boolean;
    requireMerge?: boolean;
    baseBranch?: string;
    completionStrategy?: 'local-ff' | 'none';
    deleteFeatureBranchAfterMerge?: boolean;
    postMergeChecks?: LocalPostMergeCheck[];
    codeDirtyScope?: 'repo' | 'component' | 'auto';
    componentPaths?: Record<string, string[]>;
    taskCommitGate?: 'off' | 'warn' | 'strict';
    prePrReview?: {
      enabled?: boolean;
      evidenceMode?: 'any' | 'path_required';
      reviewer?: Partial<PrePrReviewerConfig>;
    };
  };
  approval?: {
    mode?: 'steps' | 'category' | 'builtin';
    /** @deprecated Migrated to requireCheckCategories by update. */
    requireCheckSteps?: number[];
    default?: 'keep' | 'require' | 'skip';
    requireCheckCategories?: string[];
    skipCheckCategories?: string[];
  };
}

export function createDefaultApprovalConfig(): NonNullable<ProjectConfig['approval']> {
  return {
    mode: 'category',
    default: 'skip',
    requireCheckCategories: [...DEFAULT_APPROVAL_REQUIRE_CHECK_CATEGORIES],
  };
}

export function createDefaultPrePrReviewerConfig(): PrePrReviewerConfig {
  return {
    type: 'subagent',
    model: 'inherit',
    reasoningEffort: 'high',
    onUnavailable: 'inherit',
  };
}

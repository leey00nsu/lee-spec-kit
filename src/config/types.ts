import { ProjectType } from '../utils/project-type.js';
import { AllowedDocsEntriesConfig } from '../utils/unmanaged-docs.js';

export const DEFAULT_APPROVAL_REQUIRE_CHECK_CATEGORIES = [
  'spec_approve',
  'implementation_approve',
  'local_merge',
] as const;

export const AGENT_REVIEW_REASONING_EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;

export type AgentReviewReasoningEffort =
  (typeof AGENT_REVIEW_REASONING_EFFORTS)[number];

export interface AgentRuntimeConfig {
  type: 'subagent';
  model: string;
  reasoningEffort: AgentReviewReasoningEffort;
  onUnavailable: 'inherit' | 'error';
}

export type AgentReviewerConfig = AgentRuntimeConfig;
export type AgentExecutorConfig = AgentRuntimeConfig;

export interface AgentExecutionTaskConfig extends AgentExecutorConfig {
  enabled: boolean;
}

export interface AgentReviewPhaseConfig {
  enabled?: boolean;
  evidenceMode?: 'any' | 'path_required';
  reviewer?: Partial<AgentReviewerConfig>;
}

/** @deprecated Use AGENT_REVIEW_REASONING_EFFORTS. */
export const PRE_PR_REVIEW_REASONING_EFFORTS = AGENT_REVIEW_REASONING_EFFORTS;
/** @deprecated Use AgentReviewReasoningEffort. */
export type PrePrReviewReasoningEffort = AgentReviewReasoningEffort;
/** @deprecated Use AgentReviewerConfig. */
export type PrePrReviewerConfig = AgentReviewerConfig;

export interface LocalWorkflowCheck {
  command: string;
  args?: string[];
}

export type LocalPostMergeCheck = LocalWorkflowCheck;

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
    completionStrategy?: 'local-ff' | 'local-squash' | 'none';
    deleteFeatureBranchAfterMerge?: boolean;
    featureChecks?: LocalWorkflowCheck[];
    postMergeChecks?: LocalPostMergeCheck[];
    codeDirtyScope?: 'repo' | 'component' | 'auto';
    componentPaths?: Record<string, string[]>;
    taskCommitGate?: 'off' | 'warn' | 'strict';
    agentExecution?: {
      task?: Partial<AgentExecutionTaskConfig>;
    };
    agentReview?: {
      maxRounds?: number;
      plan?: AgentReviewPhaseConfig;
      task?: AgentReviewPhaseConfig;
      feature?: AgentReviewPhaseConfig;
    };
    /** @deprecated Migrated to agentReview.feature by update. */
    prePrReview?: AgentReviewPhaseConfig;
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

export function createDefaultAgentReviewerConfig(): AgentReviewerConfig {
  return {
    type: 'subagent',
    model: 'inherit',
    reasoningEffort: 'high',
    onUnavailable: 'inherit',
  };
}

export function createDefaultAgentExecutionTaskConfig(): AgentExecutionTaskConfig {
  return {
    enabled: true,
    type: 'subagent',
    model: 'inherit',
    reasoningEffort: 'high',
    onUnavailable: 'inherit',
  };
}

/** @deprecated Use createDefaultAgentReviewerConfig. */
export function createDefaultPrePrReviewerConfig(): PrePrReviewerConfig {
  return createDefaultAgentReviewerConfig();
}

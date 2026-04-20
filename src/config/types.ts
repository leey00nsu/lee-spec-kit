import { ProjectType } from '../utils/project-type.js';
import { AllowedDocsEntriesConfig } from '../utils/unmanaged-docs.js';

export const DEFAULT_APPROVAL_REQUIRE_CHECK_CATEGORIES = [
  'spec_approve',
  'implementation_approve',
] as const;

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
    preset?: 'github' | 'local' | 'strict';
    mode?: 'github' | 'local';
    requireIssue?: boolean;
    requireBranch?: boolean;
    requireWorktree?: boolean;
    requirePr?: boolean;
    requireReview?: boolean;
    requireMerge?: boolean;
    codeDirtyScope?: 'repo' | 'component' | 'auto';
    componentPaths?: Record<string, string[]>;
    taskCommitGate?: 'off' | 'warn' | 'strict';
    prePrReview?: {
      enabled?: boolean;
      skills?: string[];
      fallback?: 'builtin-checklist';
      evidenceMode?: 'any' | 'path_required';
      decisionEnum?: Array<'approve' | 'changes_requested' | 'blocked'>;
      enforceExecutionEvidence?: boolean;
      executionCommandPrefixes?: string[];
    };
    auto?: {
      defaultPreset?: string;
      defaultUntilCategories?: string[];
      presets?: Record<string, string[]>;
    };
  };
  approval?: {
    mode?: 'steps' | 'category' | 'builtin';
    requireCheckSteps?: number[];
    default?: 'keep' | 'require' | 'skip';
    requireCheckCategories?: string[];
    skipCheckCategories?: string[];
    taskExecuteCheck?: 'both' | 'start_only';
  };
}

export function createDefaultApprovalConfig(): NonNullable<ProjectConfig['approval']> {
  return {
    mode: 'category',
    default: 'skip',
    requireCheckCategories: [...DEFAULT_APPROVAL_REQUIRE_CHECK_CATEGORIES],
  };
}

import { ProjectConfig } from './config.js';

export interface WorkflowPolicy {
  mode: 'github' | 'local';
  requireIssue: boolean;
  requireBranch: boolean;
  requirePr: boolean;
  requireReview: boolean;
  requireMerge: boolean;
}

export type CodeDirtyScopePolicy = 'repo' | 'component';
export type TaskCommitGatePolicy = 'off' | 'warn' | 'strict';
export type PrePrReviewFallbackPolicy = 'builtin-checklist';
export type PrePrEvidenceMode = 'any' | 'path_required';
export type PrePrDecisionOutcome =
  | 'approve'
  | 'changes_requested'
  | 'blocked';

export interface PrePrReviewPolicy {
  enabled: boolean;
  skills: string[];
  fallback: PrePrReviewFallbackPolicy;
  evidenceMode: PrePrEvidenceMode;
  decisionEnum: PrePrDecisionOutcome[];
}

const DEFAULT_PRE_PR_REVIEW_SKILLS = ['code-review-excellence'];
const DEFAULT_PRE_PR_DECISION_ENUM: PrePrDecisionOutcome[] = [
  'approve',
  'changes_requested',
  'blocked',
];

export function resolveWorkflowPolicy(
  workflow?: ProjectConfig['workflow']
): WorkflowPolicy {
  const mode = workflow?.mode === 'local' ? 'local' : 'github';

  const policy: WorkflowPolicy =
    mode === 'local'
      ? {
          mode,
          requireIssue: false,
          requireBranch: false,
          requirePr: false,
          requireReview: false,
          requireMerge: false,
        }
      : {
          mode,
          requireIssue: true,
          requireBranch: true,
          requirePr: true,
          requireReview: true,
          requireMerge: true,
        };

  if (typeof workflow?.requireIssue === 'boolean') {
    policy.requireIssue = workflow.requireIssue;
  }
  if (typeof workflow?.requireBranch === 'boolean') {
    policy.requireBranch = workflow.requireBranch;
  }
  if (typeof workflow?.requirePr === 'boolean') {
    policy.requirePr = workflow.requirePr;
  }
  if (typeof workflow?.requireReview === 'boolean') {
    policy.requireReview = workflow.requireReview;
  }
  if (typeof workflow?.requireMerge === 'boolean') {
    policy.requireMerge = workflow.requireMerge;
  }

  // Branch naming currently depends on issue number: feat/<issue>-<slug>
  if (!policy.requireIssue) {
    policy.requireBranch = false;
  }

  if (!policy.requirePr) {
    policy.requireReview = false;
    policy.requireMerge = false;
  } else if (policy.requireReview) {
    policy.requirePr = true;
    policy.requireMerge = true;
  } else if (policy.requireMerge) {
    policy.requirePr = true;
  }

  return policy;
}

export function resolveCodeDirtyScopePolicy(
  workflow: ProjectConfig['workflow'] | undefined,
  projectType: 'single' | 'multi'
): CodeDirtyScopePolicy {
  const raw = workflow?.codeDirtyScope;

  // Backward compatibility for existing configs that do not define scope.
  if (!raw) return 'repo';

  if (raw === 'repo') return 'repo';
  if (raw === 'component') {
    return projectType === 'multi' ? 'component' : 'repo';
  }
  // auto
  return projectType === 'multi' ? 'component' : 'repo';
}

export function resolveTaskCommitGatePolicy(
  workflow?: ProjectConfig['workflow']
): TaskCommitGatePolicy {
  const raw = workflow?.taskCommitGate;
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  // Backward compatibility for existing configs that do not define this policy.
  return 'warn';
}

function normalizeSkillList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const deduped = new Set<string>();
  for (const raw of input) {
    const value = String(raw || '').trim();
    if (!value) continue;
    deduped.add(value);
  }
  return [...deduped];
}

function normalizeDecisionEnumList(input: unknown): PrePrDecisionOutcome[] {
  if (!Array.isArray(input)) return [];
  const deduped = new Set<PrePrDecisionOutcome>();
  for (const raw of input) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) continue;
    if (value === 'approve') {
      deduped.add('approve');
      continue;
    }
    if (value === 'changes_requested') {
      deduped.add('changes_requested');
      continue;
    }
    if (value === 'blocked') {
      deduped.add('blocked');
      continue;
    }
  }
  return [...deduped];
}

export function resolvePrePrReviewPolicy(
  workflow?: ProjectConfig['workflow']
): PrePrReviewPolicy {
  const workflowPolicy = resolveWorkflowPolicy(workflow);
  const configured = workflow?.prePrReview;
  const configuredSkills = normalizeSkillList(configured?.skills);
  const configuredDecisionEnum = normalizeDecisionEnumList(
    configured?.decisionEnum
  );
  const configuredEnabled =
    typeof configured?.enabled === 'boolean'
      ? configured.enabled
      : workflowPolicy.requirePr;

  return {
    enabled: workflowPolicy.requirePr ? configuredEnabled : false,
    skills:
      configuredSkills.length > 0
        ? configuredSkills
        : DEFAULT_PRE_PR_REVIEW_SKILLS,
    fallback:
      configured?.fallback === 'builtin-checklist'
        ? configured.fallback
        : 'builtin-checklist',
    evidenceMode:
      configured?.evidenceMode === 'any' ? 'any' : 'path_required',
    decisionEnum:
      configuredDecisionEnum.length > 0
        ? configuredDecisionEnum
        : DEFAULT_PRE_PR_DECISION_ENUM,
  };
}

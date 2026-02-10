import { ProjectConfig } from './config.js';

export interface WorkflowPolicy {
  mode: 'github' | 'local';
  requireIssue: boolean;
  requireBranch: boolean;
  requirePr: boolean;
  requireReview: boolean;
}

export type CodeDirtyScopePolicy = 'repo' | 'component';
export type PrePrReviewFallbackPolicy = 'builtin-checklist';

export interface PrePrReviewPolicy {
  enabled: boolean;
  skills: string[];
  fallback: PrePrReviewFallbackPolicy;
  blockOnFindings: boolean;
}

const DEFAULT_PRE_PR_REVIEW_SKILLS = ['code-review-excellence'];

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
        }
      : {
          mode,
          requireIssue: true,
          requireBranch: true,
          requirePr: true,
          requireReview: true,
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

  // Branch naming currently depends on issue number: feat/<issue>-<slug>
  if (!policy.requireIssue) {
    policy.requireBranch = false;
  }

  if (!policy.requirePr) {
    policy.requireReview = false;
  } else if (policy.requireReview) {
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

export function resolvePrePrReviewPolicy(
  workflow?: ProjectConfig['workflow']
): PrePrReviewPolicy {
  const workflowPolicy = resolveWorkflowPolicy(workflow);
  const configured = workflow?.prePrReview;
  const configuredSkills = normalizeSkillList(configured?.skills);
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
    blockOnFindings:
      typeof configured?.blockOnFindings === 'boolean'
        ? configured.blockOnFindings
        : true,
  };
}

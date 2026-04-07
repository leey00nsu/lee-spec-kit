import type { ProjectConfig } from '../../config/types.js';
import {
  resolvePrePrReviewPolicy,
  resolveTaskCommitGatePolicy,
  resolveWorkflowPolicy,
  type PrePrReviewPolicy,
  type TaskCommitGatePolicy,
  type WorkflowPolicy,
} from './policies.js';

export interface WorkflowRuntime {
  workflowPolicy: WorkflowPolicy;
  prePrReviewPolicy: PrePrReviewPolicy;
  taskCommitGatePolicy: TaskCommitGatePolicy;
}

export function resolveWorkflowRuntime(
  workflow?: ProjectConfig['workflow']
): WorkflowRuntime {
  return {
    workflowPolicy: resolveWorkflowPolicy(workflow),
    prePrReviewPolicy: resolvePrePrReviewPolicy(workflow),
    taskCommitGatePolicy: resolveTaskCommitGatePolicy(workflow),
  };
}

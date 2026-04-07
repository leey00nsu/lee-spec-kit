import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  resolvePrePrReviewPolicy,
  resolveWorkflowPolicy,
} from '../src/core/workflow/policies.ts';
import { resolveWorkflowRuntime } from '../src/core/workflow/engine.ts';

test('resolveWorkflowPolicy keeps github defaults when no preset is provided', () => {
  const policy = resolveWorkflowPolicy(undefined);
  assert.equal(policy.mode, 'github');
  assert.equal(policy.requireIssue, true);
  assert.equal(policy.requireBranch, true);
  assert.equal(policy.requireWorktree, false);
  assert.equal(policy.requirePr, true);
  assert.equal(policy.requireReview, true);
  assert.equal(policy.requireMerge, true);
});

test('resolveWorkflowPolicy honors local preset as the base policy', () => {
  const policy = resolveWorkflowPolicy({ preset: 'local' });
  assert.equal(policy.mode, 'local');
  assert.equal(policy.requireIssue, false);
  assert.equal(policy.requireBranch, false);
  assert.equal(policy.requireWorktree, false);
  assert.equal(policy.requirePr, false);
  assert.equal(policy.requireReview, false);
  assert.equal(policy.requireMerge, false);
});

test('resolveWorkflowPolicy honors strict preset as github plus managed worktree requirement', () => {
  const policy = resolveWorkflowPolicy({ preset: 'strict' });
  assert.equal(policy.mode, 'github');
  assert.equal(policy.requireIssue, true);
  assert.equal(policy.requireBranch, true);
  assert.equal(policy.requireWorktree, true);
  assert.equal(policy.requirePr, true);
  assert.equal(policy.requireReview, true);
  assert.equal(policy.requireMerge, true);
});

test('resolveWorkflowPolicy allows explicit overrides on top of preset defaults', () => {
  const policy = resolveWorkflowPolicy({
    preset: 'strict',
    requireIssue: false,
    requireReview: false,
  });
  assert.equal(policy.mode, 'github');
  assert.equal(policy.requireIssue, false);
  assert.equal(policy.requireBranch, false);
  assert.equal(policy.requireWorktree, false);
  assert.equal(policy.requirePr, true);
  assert.equal(policy.requireReview, false);
  assert.equal(policy.requireMerge, true);
});

test('resolvePrePrReviewPolicy disables pre-PR review when PR workflow is disabled', () => {
  const policy = resolvePrePrReviewPolicy({ preset: 'local' });
  assert.equal(policy.enabled, false);
});

test('resolvePrePrReviewPolicy honors configured skills and evidence mode', () => {
  const policy = resolvePrePrReviewPolicy({
    preset: 'github',
    prePrReview: {
      enabled: true,
      skills: ['code-review-excellence', 'frontend-code-review'],
      evidenceMode: 'any',
      enforceExecutionEvidence: true,
      executionCommandPrefixes: ['pnpm test'],
    },
  });

  assert.equal(policy.enabled, true);
  assert.deepEqual(policy.skills, [
    'code-review-excellence',
    'frontend-code-review',
  ]);
  assert.equal(policy.evidenceMode, 'any');
  assert.equal(policy.enforceExecutionEvidence, true);
  assert.deepEqual(policy.executionCommandPrefixes, ['pnpm test']);
});

test('resolveWorkflowRuntime bundles workflow, pre-PR, and task gate policies together', () => {
  const runtime = resolveWorkflowRuntime({
    preset: 'strict',
    taskCommitGate: 'strict',
    prePrReview: {
      enabled: true,
      evidenceMode: 'any',
    },
  });

  assert.equal(runtime.workflowPolicy.requireWorktree, true);
  assert.equal(runtime.prePrReviewPolicy.enabled, true);
  assert.equal(runtime.prePrReviewPolicy.evidenceMode, 'any');
  assert.equal(runtime.taskCommitGatePolicy, 'strict');
});

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  shouldExecuteApprovedFlowOption,
  toInstructionOnlyFlowApprovalResult,
} from '../src/services/FlowOrchestrator.ts';

test('shouldExecuteApprovedFlowOption returns false for instruction-only approvals', () => {
  assert.equal(
    shouldExecuteApprovedFlowOption({
      status: 'approved_selected',
      executable: false,
      action: { type: 'instruction' },
    }),
    false
  );
});

test('shouldExecuteApprovedFlowOption returns true for command approvals', () => {
  assert.equal(
    shouldExecuteApprovedFlowOption({
      status: 'approved_selected',
      executable: true,
      action: { type: 'command' },
    }),
    true
  );
});

test('toInstructionOnlyFlowApprovalResult preserves approval payload while marking no-op execution', () => {
  const result = toInstructionOnlyFlowApprovalResult({
    status: 'approved_selected',
    reasonCode: 'APPROVED_SELECTED',
    feature: 'F018-caption-regeneration-and-transcript-recovery',
    label: 'B',
    action: { type: 'instruction', category: 'user_request_replan' },
    userRequest: 'transcript recovery first',
    contextVersion: 'ctx-1',
    executable: false,
  });

  assert.equal(result.status, 'approved_instruction');
  assert.equal(result.reasonCode, 'INSTRUCTION_ONLY');
  assert.equal(result.label, 'B');
  assert.equal(result.userRequest, 'transcript recovery first');
  assert.equal(result.executed, false);
  assert.equal(result.reason, 'instruction_only');
});

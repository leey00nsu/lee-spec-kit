import type { ProjectConfig } from './types.js';
import { createCliError } from '../utils/cli-error.js';

export const DEFAULT_MAX_CLARIFICATION_QUESTIONS = 3;

export function resolveMaxClarificationQuestions(
  config: ProjectConfig
): number {
  const policy = config.workflow?.specClarification;
  if (policy === undefined) return DEFAULT_MAX_CLARIFICATION_QUESTIONS;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw createCliError(
      'INVALID_CONFIG',
      '`workflow.specClarification` must be an object.'
    );
  }
  const limit = policy.maxQuestionsPerRound;
  if (limit === undefined) return DEFAULT_MAX_CLARIFICATION_QUESTIONS;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw createCliError(
      'INVALID_CONFIG',
      '`workflow.specClarification.maxQuestionsPerRound` must be a positive safe integer.'
    );
  }
  return limit;
}

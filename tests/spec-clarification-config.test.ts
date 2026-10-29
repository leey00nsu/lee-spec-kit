import { describe, expect, test } from 'vitest';
import { resolveMaxClarificationQuestions } from '../src/config/spec-clarification.js';
import type { ProjectConfig } from '../src/config/types.js';

const config = (workflow?: unknown) =>
  ({
    docsDir: '/tmp/docs',
    projectType: 'single',
    lang: 'en',
    workflow,
  }) as ProjectConfig;

describe('Spec clarification question limit', () => {
  test('missing policy and missing field retain the default', () => {
    for (const workflow of [undefined, {}, { specClarification: {} }]) {
      expect(resolveMaxClarificationQuestions(config(workflow))).toBe(3);
    }
  });
  test('uses the configured positive safe integer', () => {
    for (const maxQuestionsPerRound of [1, 2, 5, 25]) {
      expect(
        resolveMaxClarificationQuestions(
          config({ specClarification: { maxQuestionsPerRound } })
        )
      ).toBe(maxQuestionsPerRound);
    }
  });
  test('rejects malformed policy containers and limits', () => {
    for (const specClarification of [
      null,
      [],
      '3',
      3,
      { maxQuestionsPerRound: 0 },
      { maxQuestionsPerRound: -1 },
      { maxQuestionsPerRound: 2.5 },
      { maxQuestionsPerRound: '2' },
      { maxQuestionsPerRound: null },
      { maxQuestionsPerRound: Infinity },
      { maxQuestionsPerRound: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(() =>
        resolveMaxClarificationQuestions(config({ specClarification }))
      ).toThrow();
    }
  });
});

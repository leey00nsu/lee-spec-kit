import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { matchesKnowledgeLineEvidence } from '../src/utils/knowledge-line-evidence.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function version(lines: string[], start: number, end: number) {
  const metadata = {
    selectedLineCount: end - start,
    firstSelectedLineHash: sha(lines[start]),
    lastSelectedLineHash: sha(lines[end - 1]),
    precedingContextLineCount: Math.min(start, 3),
    precedingContextHash: sha(
      lines.slice(Math.max(0, start - 3), start).join('')
    ),
    followingContextLineCount: Math.min(lines.length - end, 3),
    followingContextHash: sha(lines.slice(end, end + 3).join('')),
  };
  const hash = sha(lines.slice(start, end).join(''));
  return {
    hash,
    value: `repo-lines-v1:sha256:${hash}:${Buffer.from(JSON.stringify(metadata)).toString('base64url')}`,
  };
}

test('line hints relocate only exact versioned content after inserted lines', () => {
  const original = ['before\n', 'A\n', 'B\n', 'after\n'];
  const v = version(original, 1, 3);
  expect(
    matchesKnowledgeLineEvidence(
      ['inserted\n', ...original],
      2,
      3,
      v.hash,
      v.value
    )
  ).toBe(true);
  expect(
    matchesKnowledgeLineEvidence(
      ['inserted\n', 'before\n', 'A\n', 'changed\n', 'after\n'],
      2,
      3,
      v.hash,
      v.value
    )
  ).toBe(false);
});

test('resized current evidence uses metadata length instead of obsolete URI length', () => {
  const current = ['before\n', 'A\n', 'added\n', 'B\n', 'after\n'];
  const v = version(current, 1, 4);
  expect(matchesKnowledgeLineEvidence(current, 2, 3, v.hash, v.value)).toBe(
    true
  );
  expect(
    matchesKnowledgeLineEvidence(current, 2, 3, sha('different'), v.value)
  ).toBe(false);
});

test('out-of-bounds old hints can relocate but legacy hashes cannot search the file', () => {
  const current = ['A\r\n', 'B'];
  const v = version(current, 0, 2);
  expect(matchesKnowledgeLineEvidence(current, 20, 21, v.hash, v.value)).toBe(
    true
  );
  expect(
    matchesKnowledgeLineEvidence(
      current,
      20,
      21,
      v.hash,
      `repo-lines-v1:sha256:${v.hash}:fixture`
    )
  ).toBe(false);
  expect(
    matchesKnowledgeLineEvidence(
      current,
      1,
      2,
      v.hash,
      `repo-lines-v1:sha256:${v.hash}:fixture`
    )
  ).toBe(true);
});

test('ambiguous duplicate matches require a unique unchanged context', () => {
  const original = ['L\n', 'A\n', 'R\n'];
  const v = version(original, 1, 2);
  expect(
    matchesKnowledgeLineEvidence(
      ['X\n', 'A\n', 'Y\n', 'L\n', 'A\n', 'R\n'],
      50,
      50,
      v.hash,
      v.value
    )
  ).toBe(true);
  expect(
    matchesKnowledgeLineEvidence(
      [...original, ...original],
      50,
      50,
      v.hash,
      v.value
    )
  ).toBe(false);
});

test('malformed or oversized metadata cannot authorize relocation', () => {
  const lines = ['A\n', 'B\n'];
  const v = version(lines, 0, 1);
  for (const metadata of [
    { selectedLineCount: 1 },
    { selectedLineCount: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const value = `repo-lines-v1:sha256:${v.hash}:${Buffer.from(JSON.stringify(metadata)).toString('base64url')}`;
    expect(
      matchesKnowledgeLineEvidence(
        ['inserted\n', ...lines],
        1,
        1,
        v.hash,
        value
      )
    ).toBe(false);
  }
});

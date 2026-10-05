import { expect, test } from 'vitest';
import {
  findDocsFeatureReferences,
  isSharedProjectDoc,
} from '../src/utils/docs-feature-references.js';

test.each([
  'Implemented in F001.',
  'Follow k7m2q9rx4dab.',
  'K7M2Q9RX4DAB owns the change.',
  'T-F001-login-01 is DONE.',
  'T-123-login-02 is DONE.',
  'T-K7M2Q9RX4DAB-login-03 is DONE.',
  'Task #1 is complete.',
  '**Feature**: 123',
  'Feature ID: `ABCDEFGHJKLM`',
  'Feature 번호: 123',
  '태스크 3에서 검증한다.',
  '기능 번호 123의 규칙이다.',
  '3번 태스크 완료.',
  '[Change](../features/123-login/spec.md)',
  '[Change](../features/api/F001-login/plan.md)',
  '[Change](../features/api/K7M2Q9RX4DAB-login/decisions.md)',
  '```text\nF001\n```',
  '<!-- F001 -->',
])('finds concrete change references: %s', (content) => {
  const violations = findDocsFeatureReferences(content, 'docs/prd/auth.md', [
    'K7M2Q9RX4DAB',
  ]);
  expect(violations.length).toBeGreaterThan(0);
  expect(violations[0].violationCode).toBe('FEATURE_REFERENCE_IN_SHARED_DOC');
});

test('keeps durable identifiers and ordinary numbers usable', () => {
  expect(
    findDocsFeatureReferences(
      [
        'PRD-FR-001, PRD-NFR-002, FR-001, ADR-003',
        'Requirements: PRD-F001; max 123 users.',
        'Version 1.2.3, date 2026-10-05, HTTP 123.',
        'Issue #123, PR #456, https://github.com/org/repo/issues/123',
    'ENHANCEMENTS; ABCDEFGHJKLM is a product constant.',
    'MyFeature123, microtasks12, microtask 123, featureFlag123 are code identifiers.',
        'Feature <feature-ref> and T-{feature-ref}-01 are placeholders.',
        'docs/features/ contains change contracts.',
      ].join('\n'),
      'docs/prd/auth.md'
    )
  ).toEqual([]);
});

test('finds registered all-letter local IDs without mistaking ordinary words', () => {
  expect(
    findDocsFeatureReferences('ABCDEFGHJKLM ENHANCEMENTS', 'docs/prd/auth.md', [
      'ABCDEFGHJKLM',
    ]).map((item) => item.reference)
  ).toEqual(['ABCDEFGHJKLM']);
});

test('registered numeric Feature IDs do not turn ordinary numbers into violations', () => {
  expect(
    findDocsFeatureReferences(
      'issue #123, PRD-FR-123, max 123 users; Feature 123',
      'docs/prd/auth.md',
      ['123']
    ).map((item) => item.reference)
  ).toEqual(['Feature 123']);
});

test('reports accurate positions and does not duplicate an overlapping task ID', () => {
  const findings = findDocsFeatureReferences(
    '\n\r\n  T-F001-login-01 then F002\n',
    'docs/agents/custom.md'
  );
  expect(
    findings.map(({ line, column, reference }) => ({ line, column, reference }))
  ).toEqual([
    { line: 3, column: 3, reference: 'T-F001-login-01' },
    { line: 3, column: 24, reference: 'F002' },
  ]);
});

test('checks user rules around the generated AGENTS block without shifting line numbers', () => {
  const text = [
    'F001',
    '<!-- lee-spec-kit:begin -->',
    'F002',
    '<!-- lee-spec-kit:end -->',
    'F003',
  ].join('\n');
  expect(
    findDocsFeatureReferences(text, 'docs/AGENTS.md').map((item) => item.line)
  ).toEqual([1, 5]);
  expect(
    findDocsFeatureReferences(text, 'docs/agents/custom.md').map(
      (item) => item.line
    )
  ).toEqual([1, 3, 5]);
});

test('audits durable project docs, including custom allowlisted surfaces', () => {
  for (const value of [
    'prd/auth.md',
    'designs/design system.md',
    'agents/constitution.md',
    'agents/custom.md',
    'architecture/system-architecture.mdx',
    'operations/policy.txt',
    'prd/README.md',
  ]) {
    expect(isSharedProjectDoc(value), value).toBe(true);
  }
  for (const value of [
    'features/F001-auth/spec.md',
    'features/api/123-auth/artifacts/report.md',
    'ideas/I001-auth.md',
    'agents/agents.md',
    'agents/git-workflow.md',
    'agents/skills/create-feature.md',
    'designs/assets/report.md',
    'openwiki/architecture.md',
    'scripts/check.md',
    '../project/README.md',
  ]) {
    expect(isSharedProjectDoc(value), value).toBe(false);
  }
});

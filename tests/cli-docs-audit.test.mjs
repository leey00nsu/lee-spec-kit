import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fs,
  path,
  runCli,
  withTempDir,
} from './helpers/cli-contract-helpers.mjs';

async function initDocs(dir, lang = 'en') {
  const result = await runCli(dir, [
    'init',
    '--non-interactive',
    '--name',
    'demo',
    '--type',
    'single',
    '--lang',
    lang,
    '--workflow',
    'local',
    '--dir',
    './docs',
  ]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
}

async function runDocsAudit(dir) {
  const result = await runCli(dir, ['docs-audit', '--json']);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test('docs-audit accepts explicitly classified UX design documents', async () => {
  await withTempDir('lsk-docs-audit-ux-', async (dir) => {
    await initDocs(dir);
    await fs.writeFile(
      path.join(dir, 'docs', 'designs', 'recording-flow.md'),
      `---
lee-spec-kit:
  kind: ux-design
  scope: project
---

# Recording Flow
`,
      'utf-8'
    );

    const payload = await runDocsAudit(dir);
    assert.equal(payload.status, 'ok');
    assert.equal(payload.reasonCode, 'DOCS_TAXONOMY_OK');
    assert.deepEqual(payload.violations, []);
  });
});

test('docs-audit warns about high-confidence technical documents in designs', async () => {
  await withTempDir('lsk-docs-audit-misplaced-', async (dir) => {
    await initDocs(dir);
    const designsDir = path.join(dir, 'docs', 'designs');
    await fs.writeFile(
      path.join(designsDir, 'system-architecture.md'),
      '# System Architecture\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(designsDir, 'data-model.md'),
      '# Data Model\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(designsDir, 'open-source-research.md'),
      '# Open-source Research\n',
      'utf-8'
    );

    const payload = await runDocsAudit(dir);
    assert.equal(payload.status, 'warning');
    assert.equal(payload.reasonCode, 'DOCS_TAXONOMY_WARNING');
    assert.equal(payload.mode, 'warn');
    assert.equal(payload.violations.length, 3);

    const byPath = new Map(
      payload.violations.map((entry) => [entry.path, entry])
    );
    assert.equal(
      byPath.get('docs/designs/system-architecture.md').detectedKind,
      'architecture-overview'
    );
    assert.deepEqual(
      byPath.get('docs/designs/system-architecture.md').suggestedLocations,
      ['docs/prd/*-overview.md']
    );
    assert.equal(
      byPath.get('docs/designs/data-model.md').detectedKind,
      'feature-plan'
    );
    assert.equal(
      byPath.get('docs/designs/open-source-research.md').detectedKind,
      'idea'
    );
    assert.ok(payload.violations.every((entry) => entry.confidence === 'high'));
  });
});

test('docs-audit uses frontmatter as the authoritative kind and ignores assets', async () => {
  await withTempDir('lsk-docs-audit-frontmatter-', async (dir) => {
    await initDocs(dir);
    const designsDir = path.join(dir, 'docs', 'designs');
    await fs.writeFile(
      path.join(designsDir, 'technical-looking-name.md'),
      `---
lee-spec-kit:
  kind: feature-plan
  scope: project
---

# Draft
`,
      'utf-8'
    );
    await fs.mkdir(path.join(designsDir, 'assets'), { recursive: true });
    await fs.writeFile(
      path.join(designsDir, 'assets', 'system-architecture.md'),
      '# Screenshot notes\n',
      'utf-8'
    );

    const payload = await runDocsAudit(dir);
    assert.equal(payload.status, 'warning');
    assert.equal(payload.violations.length, 1);
    assert.equal(payload.violations[0].violationCode, 'MISPLACED_MANAGED_DOC');
    assert.equal(payload.violations[0].declaredKind, 'feature-plan');
    assert.equal(payload.violations[0].detectedBy, 'frontmatter');
  });
});

test('idea templates expose research, design draft, and promotion mapping in both languages', async () => {
  await withTempDir('lsk-idea-template-en-', async (dir) => {
    await initDocs(dir, 'en');
    const result = await runCli(dir, [
      'idea',
      'candidate',
      '--non-interactive',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const content = await fs.readFile(
      path.join(dir, 'docs', 'ideas', 'I001-candidate.md'),
      'utf-8'
    );
    assert.match(content, /## Research and Candidate Comparison/);
    assert.match(content, /## Design Draft/);
    assert.match(content, /## Feature Promotion Mapping/);
  });

  await withTempDir('lsk-idea-template-ko-', async (dir) => {
    await initDocs(dir, 'ko');
    const result = await runCli(dir, [
      'idea',
      'candidate',
      '--non-interactive',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const content = await fs.readFile(
      path.join(dir, 'docs', 'ideas', 'I001-candidate.md'),
      'utf-8'
    );
    assert.match(content, /## 조사 및 후보 비교/);
    assert.match(content, /## 설계 초안/);
    assert.match(content, /## Feature 승격 매핑/);
  });
});

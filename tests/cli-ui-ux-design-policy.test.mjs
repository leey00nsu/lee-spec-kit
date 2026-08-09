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

test('ui-ux-design is discoverable but stays out of startup required docs', async () => {
  await withTempDir('lsk-ui-ux-policy-', async (dir) => {
    await initDocs(dir);

    const listResult = await runCli(dir, ['docs', 'list', '--json']);
    assert.equal(listResult.code, 0, listResult.stderr || listResult.stdout);
    const listPayload = JSON.parse(listResult.stdout);
    assert.equal(
      listPayload.docs.some(
        (entry) =>
          entry.id === 'ui-ux-design' &&
          entry.command === 'npx lee-spec-kit docs get ui-ux-design --json'
      ),
      true
    );

    const agentsResult = await runCli(dir, ['docs', 'get', 'agents', '--json']);
    assert.equal(
      agentsResult.code,
      0,
      agentsResult.stderr || agentsResult.stdout
    );
    const agentsPayload = JSON.parse(agentsResult.stdout);
    assert.equal(
      agentsPayload.requiredDocs.some((entry) => entry.id === 'ui-ux-design'),
      false
    );
    assert.match(
      agentsPayload.doc.content,
      /Only when the user request explicitly mentions a design system/
    );

    const policyResult = await runCli(dir, [
      'docs',
      'get',
      'ui-ux-design',
      '--json',
    ]);
    assert.equal(
      policyResult.code,
      0,
      policyResult.stderr || policyResult.stdout
    );
    const policyPayload = JSON.parse(policyResult.stdout);
    assert.equal(policyPayload.doc.id, 'ui-ux-design');
    assert.deepEqual(policyPayload.requiredDocs, []);
    assert.match(
      policyPayload.doc.content,
      /Do not create every file preemptively/
    );
    assert.match(
      policyPayload.doc.content,
      /If `docs\/designs\/design-system\.md` already exists, reference or update it/
    );
    assert.match(policyPayload.doc.content, /same `tasks\.md` task/);
    assert.match(
      policyPayload.doc.content,
      /does not change spec\/plan\/tasks approvals/
    );
  });
});

test('new projects expose optional design refs without creating design-system docs', async () => {
  await withTempDir('lsk-ui-ux-template-', async (dir) => {
    await initDocs(dir);

    await assert.rejects(
      fs.access(path.join(dir, 'docs', 'designs', 'design-system.md'))
    );
    await assert.rejects(
      fs.access(path.join(dir, 'docs', 'agents', 'ui-ux-design.md'))
    );

    await fs.writeFile(
      path.join(dir, 'docs', 'designs', 'design-system.md'),
      `---
lee-spec-kit:
  kind: design-system
  scope: project
---

# Design System
`,
      'utf-8'
    );
    const auditResult = await runCli(dir, ['docs-audit', '--json']);
    assert.equal(auditResult.code, 0, auditResult.stderr || auditResult.stdout);
    const auditPayload = JSON.parse(auditResult.stdout);
    assert.equal(auditPayload.reasonCode, 'DOCS_TAXONOMY_OK');

    const featureResult = await runCli(dir, [
      'feature',
      'visual-refresh',
      '--id',
      'F001',
    ]);
    assert.equal(
      featureResult.code,
      0,
      featureResult.stderr || featureResult.stdout
    );

    const featureDir = path.join(
      dir,
      'docs',
      'features',
      'F001-visual-refresh'
    );
    const spec = await fs.readFile(path.join(featureDir, 'spec.md'), 'utf-8');
    const tasks = await fs.readFile(path.join(featureDir, 'tasks.md'), 'utf-8');
    const decisions = await fs.readFile(
      path.join(featureDir, 'decisions.md'),
      'utf-8'
    );

    assert.match(spec, /Design Refs: - \(optional;/);
    assert.match(spec, /docs\/designs\/design-system\.md/);
    assert.match(tasks, /Design-system synchronization \(conditional\)/);
    assert.match(decisions, /removal condition/);
  });
});

test('the optional UI/UX policy is localized for Korean projects', async () => {
  await withTempDir('lsk-ui-ux-policy-ko-', async (dir) => {
    await initDocs(dir, 'ko');
    const result = await runCli(dir, ['docs', 'get', 'ui-ux-design', '--json']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.match(payload.doc.content, /명시적으로 포함된 경우에만/);
    assert.match(payload.doc.content, /모든 파일을 한꺼번에 만들지 않습니다/);
    assert.match(
      payload.doc.content,
      /승인 단계나 `workflow-stage` 결과를 변경하지 않습니다/
    );
  });
});

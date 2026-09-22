import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  buildKnowledgeBranchScopeGuardScript,
  buildKnowledgeScopeGuardScript,
  buildKnowledgeWorkflow,
} from '../src/utils/knowledge-ci.js';

describe('OpenWiki CI scaffold', () => {
  test('delegates generation and incremental state to OpenWiki', () => {
    const workflow = buildKnowledgeWorkflow('main', 'ko', '1.2.3');

    expect(workflow).toContain('openwiki@0.5.2');
    expect(workflow).toContain('openwiki code --update --print --language ko');
    expect(workflow).toContain('Restore the OpenWiki working checkpoint');
    expect(workflow).toContain('refs/remotes/origin/$KNOWLEDGE_BRANCH');
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('gh pr create');
    expect(workflow).toContain('cancel-in-progress: false');

    expect(workflow).not.toMatch(
      /lee-spec-kit knowledge (?:publish|update|sync|apply|status|doctor|audit)/u
    );
    expect(workflow).not.toContain(
      'Avoid repeating a failed scheduled revision'
    );
    expect(workflow).not.toContain('workflow_dispatch to retry');
    expect(workflow).not.toContain('timeout-minutes:');
    expect(workflow).toContain('continue-on-error: true');
    expect(workflow).toContain('steps.openwiki.outcome');
    expect(workflow).toContain('--draft');
    expect(workflow).toContain('gh pr ready --undo');
    expect(workflow).toContain('Propagate an incomplete OpenWiki result');
    expect(workflow).toContain('Remove transient OpenWiki run context');
    expect(workflow).toContain('rm -- openwiki/.run.json');
    expect(workflow).toContain(
      'Could not make the existing Knowledge pull request safe before publication'
    );
    expect(workflow).toContain('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}');
    expect(workflow).toContain('token: ${{ secrets.OPENWIKI_PR_TOKEN }}');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.OPENWIKI_PR_TOKEN }}');
    expect(workflow.indexOf('OPENAI_API_KEY:')).toBeGreaterThan(
      workflow.indexOf('- name: Generate Knowledge with OpenWiki')
    );
    expect(workflow).toContain('Check whether the source branch advanced');
    expect(workflow).toContain('echo \'current=false\' >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain(
      'git diff --cached --quiet "$baseline" -- openwiki AGENTS.md CLAUDE.md'
    );
    expect(workflow).toContain(
      'Pull-request publication failed; restoring the previous Knowledge branch and PR state.'
    );
    expect(workflow).toContain('restore_publication "$api_code"');
    expect(workflow.indexOf('gh pr list')).toBeLessThan(
      workflow.indexOf('if [ "$changed" = true ]')
    );
    const updatePush = workflow.indexOf(
      'git push --force-with-lease',
      workflow.indexOf('git switch -C "$KNOWLEDGE_BRANCH"')
    );
    expect(workflow.indexOf('gh pr ready --undo')).toBeLessThan(updatePush);
    expect(workflow).toContain(
      'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5'
    );
    expect(workflow).toContain(
      'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'
    );
  });

  test('uses lee-spec-kit only as a static writing-policy package', () => {
    const workflow = buildKnowledgeWorkflow(
      'release/docs',
      'en',
      '1.2.3-beta.1'
    );

    expect(workflow).toContain('lee-spec-kit@1.2.3-beta.1');
    expect(workflow).toContain(
      'resources/openwiki-skills/lee-spec-kit-technical-writing'
    );
    expect(workflow).toContain(
      'KNOWLEDGE_BRANCH: lee-spec-kit/knowledge-release-docs'
    );
    expect(workflow).toContain('--language en');
  });

  test('rejects unsafe interpolated values', () => {
    expect(() =>
      buildKnowledgeWorkflow('main\nrun: bad', 'en', '1.2.3')
    ).toThrow(/Unsupported workflow/u);
    expect(() => buildKnowledgeWorkflow('main', 'fr', '1.2.3')).toThrow(
      /Unsupported workflow/u
    );
  });

  test('scope guard accepts quoted OpenWiki paths and rejects source writes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lsk-openwiki-scope-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: root,
      });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
      writeFileSync(path.join(root, 'README.md'), '# demo\n');
      execFileSync('git', ['add', 'README.md'], { cwd: root });
      execFileSync('git', ['commit', '-qm', 'init'], { cwd: root });
      mkdirSync(path.join(root, 'openwiki'), { recursive: true });
      writeFileSync(path.join(root, 'openwiki', '구조 설명.md'), '# ok\n');

      expect(() =>
        execFileSync('bash', ['-c', buildKnowledgeScopeGuardScript()], {
          cwd: root,
          stdio: 'pipe',
        })
      ).not.toThrow();

      mkdirSync(path.join(root, 'src'), { recursive: true });
      writeFileSync(path.join(root, 'src', 'unexpected file.ts'), 'bad\n');
      expect(() =>
        execFileSync('bash', ['-c', buildKnowledgeScopeGuardScript()], {
          cwd: root,
          stdio: 'pipe',
        })
      ).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('branch guard rejects changes outside the complete Knowledge PR surface', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lsk-openwiki-branch-scope-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: root,
      });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
      writeFileSync(path.join(root, 'README.md'), '# demo\n');
      execFileSync('git', ['add', '.'], { cwd: root });
      execFileSync('git', ['commit', '-qm', 'base'], { cwd: root });
      execFileSync('git', ['branch', '-M', 'main'], { cwd: root });
      execFileSync('git', ['switch', '-qc', 'knowledge'], { cwd: root });
      mkdirSync(path.join(root, 'openwiki'), { recursive: true });
      writeFileSync(path.join(root, 'openwiki', 'index.md'), '# wiki\n');
      writeFileSync(path.join(root, 'source.ts'), 'unexpected\n');
      execFileSync('git', ['add', '.'], { cwd: root });
      execFileSync('git', ['commit', '-qm', 'knowledge'], { cwd: root });

      expect(() =>
        execFileSync('bash', ['-c', buildKnowledgeBranchScopeGuardScript()], {
          cwd: root,
          env: { ...process.env, KNOWLEDGE_DIFF_SPEC: 'main...knowledge' },
          stdio: 'pipe',
        })
      ).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

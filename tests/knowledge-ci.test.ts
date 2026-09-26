import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  buildKnowledgeBranchScopeGuardScript,
  buildKnowledgeNoopPublicationScript,
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
    expect(workflow).toContain('publication_noop');
    expect(workflow).toContain(
      'git diff --quiet "$previous" "$SOURCE_SHA" -- openwiki AGENTS.md CLAUDE.md'
    );
    expect(workflow).toContain("git config user.name 'github-actions[bot]'");
    expect(workflow).toContain(
      "git config user.email '41898282+github-actions[bot]@users.noreply.github.com'"
    );
    expect(workflow).not.toContain('openwiki@users.noreply.github.com');
    expect(workflow).not.toContain('gh pr merge --auto');
    expect(workflow).toContain('cancel-in-progress: false');
    const jobEnv = workflow.match(
      /jobs:\n  knowledge:\n    runs-on: ubuntu-latest\n    env:\n([\s\S]*?)    steps:/u
    )?.[1];
    expect(jobEnv).toBeDefined();
    expect(jobEnv).not.toMatch(/\$\{\{\s*runner\./u);
    expect(workflow).toContain(
      'echo "OPENWIKI_CONFIG_DIR=$RUNNER_TEMP/openwiki-config" >> "$GITHUB_ENV"'
    );

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
    expect(workflow).toContain('steps.completion.outputs.complete');
    expect(workflow).toContain('[ "$OPENWIKI_COMPLETE" = true ]');
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

  test('auto-merge is opt-in and follows the completed publication gate', () => {
    const workflow = buildKnowledgeWorkflow('main', 'ko', '1.2.3', {
      autoMerge: true,
    });
    expect(workflow).toContain(
      'gh pr merge --auto --squash --match-head-commit "$PR_HEAD_SHA" "$PR_NUMBER"'
    );
    expect(workflow).toContain("steps.publish.outputs.healthy == 'true'");
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('name: Knowledge PR safety');
    expect(workflow).toContain("github.event_name != 'pull_request'");
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow.indexOf('gh pr merge --auto')).toBeGreaterThan(
      workflow.indexOf('echo "pr_number=$pr_number"')
    );
  });

  test('auto-merge PR check rejects interrupted or out-of-scope content', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lsk-knowledge-pr-check-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const workflow = buildKnowledgeWorkflow('main', 'ko', '1.2.3', {
      autoMerge: true,
    });
    const marker =
      '      - name: Validate the completed Knowledge pull request\n';
    const stepStart = workflow.indexOf(marker);
    const scriptStart = workflow.indexOf('        run: |\n', stepStart);
    const script = workflow
      .slice(scriptStart + '        run: |\n'.length)
      .split('\n')
      .map((line) => line.replace(/^ {10}/u, ''))
      .join('\n');
    try {
      git('init', '-q');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      writeFileSync(path.join(root, 'source.ts'), 'const value = 1;\n');
      git('add', '.');
      git('commit', '-qm', 'source');
      const base = git('rev-parse', 'HEAD');
      mkdirSync(path.join(root, 'openwiki'));
      writeFileSync(path.join(root, 'openwiki', 'index.md'), '# Wiki\n');
      writeFileSync(
        path.join(root, 'openwiki', '.last-update.json'),
        JSON.stringify({ status: 'complete', gitHead: base })
      );
      git('add', '.');
      git('commit', '-qm', 'knowledge');
      const head = git('rev-parse', 'HEAD');
      const verify = (baseSha: string, headSha: string) =>
        execFileSync('bash', ['-e', '-c', script], {
          cwd: root,
          env: {
            ...process.env,
            PR_BASE_SHA: baseSha,
            PR_HEAD_SHA: headSha,
          },
          stdio: 'pipe',
        });
      expect(() => verify(base, head)).not.toThrow();

      writeFileSync(
        path.join(root, 'openwiki', '.last-update.json'),
        JSON.stringify({ status: 'interrupted', gitHead: base })
      );
      git('add', '.');
      git('commit', '-qm', 'interrupted');
      expect(() => verify(base, git('rev-parse', 'HEAD'))).toThrow();

      writeFileSync(path.join(root, 'source.ts'), 'const value = 2;\n');
      git('add', '.');
      git('commit', '-qm', 'out of scope');
      expect(() => verify(base, git('rev-parse', 'HEAD'))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('publishes source changes but skips a completed metadata-only check', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lsk-openwiki-noop-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const writeMetadata = (gitHead: string, updatedAt: string) =>
      writeFileSync(
        path.join(root, 'openwiki', '.last-update.json'),
        JSON.stringify({ status: 'complete', gitHead, updatedAt }) + '\n'
      );
    const decide = (source: string, outcome = 'success'): string =>
      execFileSync('bash', ['-c', buildKnowledgeNoopPublicationScript()], {
        cwd: root,
        env: {
          ...process.env,
          SOURCE_SHA: source,
          OPENWIKI_OUTCOME: outcome,
          OPENWIKI_COMPLETE: 'true',
          SOURCE_CURRENT: 'true',
        },
        encoding: 'utf8',
      }).trim();
    try {
      git('init', '-q');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      writeFileSync(path.join(root, 'source.ts'), 'export const value = 1;\n');
      writeFileSync(path.join(root, 'AGENTS.md'), 'Human rule\n');
      git('add', '.');
      git('commit', '-qm', 'source');
      const sourceBaseline = git('rev-parse', 'HEAD');
      mkdirSync(path.join(root, 'openwiki'));
      writeFileSync(path.join(root, 'openwiki', 'index.md'), '# Wiki\n');
      writeMetadata(sourceBaseline, '2026-09-24T00:00:00Z');
      writeFileSync(
        path.join(root, 'AGENTS.md'),
        'Human rule\n<!-- OPENWIKI:START -->old<!-- OPENWIKI:END -->\n'
      );
      git('add', '.');
      git('commit', '-qm', 'published wiki');
      const current = git('rev-parse', 'HEAD');

      writeMetadata(current, '2026-09-25T00:00:00Z');
      git('add', 'openwiki/.last-update.json');
      expect(decide(current)).toBe('true');
      expect(decide(current, 'failure')).toBe('false');

      const workflow = buildKnowledgeWorkflow('main', 'ko', '1.2.3');
      const marker =
        '      - name: Publish the OpenWiki checkpoint pull request\n';
      const stepStart = workflow.indexOf(marker);
      const scriptStart = workflow.indexOf('        run: |\n', stepStart);
      const scriptEnd = workflow.indexOf('      - name: ', scriptStart + 1);
      const publish = workflow
        .slice(scriptStart + '        run: |\n'.length, scriptEnd)
        .split('\n')
        .map((line) => line.replace(/^ {10}/u, ''))
        .join('\n');
      const outputPath = path.join(root, 'output');
      const branchBefore = git('branch', '--show-current');
      writeFileSync(outputPath, '');
      execFileSync('bash', ['-e', '-c', `gh() { :; }\n${publish}`], {
        cwd: root,
        env: {
          ...process.env,
          SOURCE_SHA: current,
          OPENWIKI_OUTCOME: 'success',
          OPENWIKI_COMPLETE: 'true',
          SOURCE_CURRENT: 'true',
          KNOWLEDGE_BRANCH: 'knowledge',
          GITHUB_OUTPUT: outputPath,
        },
        stdio: 'pipe',
      });
      expect(readFileSync(outputPath, 'utf8')).toContain('changed=false');
      expect(readFileSync(outputPath, 'utf8')).toContain('pr_number=');
      expect(git('branch', '--show-current')).toBe(branchBefore);

      writeFileSync(path.join(root, 'openwiki', '.run.json'), '{}');
      expect(decide(current)).toBe('false');
      rmSync(path.join(root, 'openwiki', '.run.json'));

      writeFileSync(path.join(root, 'openwiki', 'index.md'), '# Changed\n');
      git('add', 'openwiki/index.md');
      expect(decide(current)).toBe('false');
      git('restore', '--staged', 'openwiki/index.md');
      git('restore', 'openwiki/index.md');

      git('commit', '-qm', 'record check');
      writeFileSync(path.join(root, 'source.ts'), 'export const value = 2;\n');
      git('add', 'source.ts');
      git('commit', '-qm', 'source change');
      const changedSource = git('rev-parse', 'HEAD');
      writeMetadata(changedSource, '2026-09-26T00:00:00Z');
      git('add', 'openwiki/.last-update.json');
      expect(decide(changedSource)).toBe('false');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('skips metadata after a squash merge but detects an unpublished checkpoint', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lsk-openwiki-squash-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const workflow = buildKnowledgeWorkflow('main', 'ko', '1.2.3');
    const marker =
      '      - name: Publish the OpenWiki checkpoint pull request\n';
    const stepStart = workflow.indexOf(marker);
    const scriptStart = workflow.indexOf('        run: |\n', stepStart);
    const scriptEnd = workflow.indexOf('      - name: ', scriptStart + 1);
    const publish = workflow
      .slice(scriptStart + '        run: |\n'.length, scriptEnd)
      .split('\n')
      .map((line) => line.replace(/^ {10}/u, ''))
      .join('\n');
    try {
      git('init', '-q');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      const mainBranch = git('branch', '--show-current');
      writeFileSync(path.join(root, 'source.ts'), 'export const value = 1;\n');
      git('add', '.');
      git('commit', '-qm', 'source');
      const source = git('rev-parse', 'HEAD');

      mkdirSync(path.join(root, 'openwiki'));
      writeFileSync(path.join(root, 'openwiki', 'index.md'), '# Wiki\n');
      writeFileSync(
        path.join(root, 'openwiki', '.last-update.json'),
        JSON.stringify({ status: 'complete', gitHead: source }) + '\n'
      );
      git('add', '.');
      git('commit', '-qm', 'Knowledge branch commit');
      const knowledge = git('rev-parse', 'HEAD');
      git(
        'update-ref',
        'refs/remotes/origin/lee-spec-kit/knowledge-main',
        knowledge
      );

      git('reset', '--hard', source);
      git(
        'restore',
        '--source',
        knowledge,
        '--staged',
        '--worktree',
        '--',
        'openwiki'
      );
      git('commit', '-qm', 'squash Knowledge into main');
      const squashed = git('rev-parse', 'HEAD');
      git('update-ref', 'refs/remotes/origin/main', squashed);
      expect(() =>
        git('merge-base', '--is-ancestor', knowledge, squashed)
      ).toThrow();
      expect(() =>
        git(
          'diff',
          '--quiet',
          knowledge,
          squashed,
          '--',
          'openwiki',
          'AGENTS.md',
          'CLAUDE.md'
        )
      ).not.toThrow();

      writeFileSync(
        path.join(root, 'openwiki', '.last-update.json'),
        JSON.stringify({ status: 'complete', gitHead: squashed }) + '\n'
      );
      git('add', 'openwiki/.last-update.json');
      const output = path.join(root, 'output');
      writeFileSync(output, '');
      execFileSync('bash', ['-e', '-c', `gh() { :; }\n${publish}`], {
        cwd: root,
        env: {
          ...process.env,
          SOURCE_SHA: squashed,
          OPENWIKI_OUTCOME: 'success',
          OPENWIKI_COMPLETE: 'true',
          SOURCE_CURRENT: 'true',
          KNOWLEDGE_BRANCH: 'lee-spec-kit/knowledge-main',
          GITHUB_OUTPUT: output,
        },
        stdio: 'pipe',
      });
      expect(readFileSync(output, 'utf8')).toContain('changed=false');
      expect(git('rev-parse', 'HEAD')).toBe(squashed);

      git(
        'restore',
        '--staged',
        '--worktree',
        '--',
        'openwiki/.last-update.json'
      );
      git('switch', '-q', '-c', 'unpublished', knowledge);
      writeFileSync(path.join(root, 'openwiki', 'index.md'), '# Unpublished\n');
      git('add', 'openwiki/index.md');
      git('commit', '-qm', 'unpublished checkpoint');
      const unpublished = git('rev-parse', 'HEAD');
      git('switch', '-q', mainBranch);
      expect(() =>
        git(
          'diff',
          '--quiet',
          unpublished,
          squashed,
          '--',
          'openwiki',
          'AGENTS.md',
          'CLAUDE.md'
        )
      ).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps an exit-zero but interrupted OpenWiki run incomplete', () => {
    const workflow = buildKnowledgeWorkflow('main', 'ko', '1.2.3');
    const marker = '      - name: Check OpenWiki completion metadata\n';
    const stepStart = workflow.indexOf(marker);
    const scriptStart = workflow.indexOf('        run: |\n', stepStart);
    const scriptEnd = workflow.indexOf('      - name: ', scriptStart + 1);
    expect(stepStart).toBeGreaterThan(-1);
    expect(scriptStart).toBeGreaterThan(stepStart);
    expect(scriptEnd).toBeGreaterThan(scriptStart);
    const script = workflow
      .slice(scriptStart + '        run: |\n'.length, scriptEnd)
      .split('\n')
      .map((line) => line.replace(/^ {10}/u, ''))
      .join('\n');
    const root = mkdtempSync(path.join(tmpdir(), 'lsk-openwiki-completion-'));

    try {
      mkdirSync(path.join(root, 'openwiki'));
      const metadataPath = path.join(root, 'openwiki', '.last-update.json');
      const runPath = path.join(root, 'openwiki', '.run.json');
      const outputPath = path.join(root, 'output');
      const check = (metadata?: object, hasRun = false): string => {
        if (hasRun) writeFileSync(runPath, '{}');
        else rmSync(runPath, { force: true });
        if (metadata) writeFileSync(metadataPath, JSON.stringify(metadata));
        else rmSync(metadataPath, { force: true });
        writeFileSync(outputPath, '');
        execFileSync('bash', ['-e', '-c', script], {
          cwd: root,
          env: {
            ...process.env,
            SOURCE_SHA: 'source-revision',
            GITHUB_OUTPUT: outputPath,
          },
          stdio: 'pipe',
        });
        return readFileSync(outputPath, 'utf8').trim();
      };

      expect(check({ status: 'complete', gitHead: 'source-revision' })).toBe(
        'complete=true'
      );
      expect(check({ status: 'interrupted', gitHead: 'source-revision' })).toBe(
        'complete=false'
      );
      expect(check({ status: 'complete', gitHead: 'older-revision' })).toBe(
        'complete=false'
      );
      expect(check()).toBe('complete=false');
      expect(
        check({ status: 'complete', gitHead: 'source-revision' }, true)
      ).toBe('complete=false');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

  test('scope guard permits only OpenWiki-managed agent-file edits', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lsk-openwiki-agents-'));
    const check = () =>
      execFileSync('bash', ['-c', buildKnowledgeScopeGuardScript()], {
        cwd: root,
        stdio: 'pipe',
      });
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: root,
      });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
      writeFileSync(path.join(root, 'AGENTS.md'), 'Human rule\n');
      execFileSync('git', ['add', '.'], { cwd: root });
      execFileSync('git', ['commit', '-qm', 'base'], { cwd: root });
      writeFileSync(
        path.join(root, 'AGENTS.md'),
        'Human rule\n\n<!-- OPENWIKI:START -->managed<!-- OPENWIKI:END -->\n'
      );
      expect(check).not.toThrow();
      writeFileSync(
        path.join(root, 'AGENTS.md'),
        'Changed human rule\n\n<!-- OPENWIKI:START -->managed<!-- OPENWIKI:END -->\n'
      );
      expect(check).toThrow();
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

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { buildKnowledgeWorkflow } from '../src/utils/knowledge-ci.js';

const require = createRequire(import.meta.url);
const observer = require('../resources/openwiki/ci-observe.cjs');
const sourceSha = 'a'.repeat(40);
const script = path.resolve('resources/openwiki/ci-observe.cjs');
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'lsk-observer-'));
  const directory = path.join(root, 'ci');
  mkdirSync(path.join(root, 'openwiki', '.claims'), { recursive: true });
  const write = (relative: string, value: unknown) => {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(
      path.join(root, relative),
      typeof value === 'string' ? value : JSON.stringify(value)
    );
  };
  return {
    root,
    directory,
    write,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('OpenWiki official-state CI observation without API calls', () => {
  test.each([
    ['complete', 'success', 'complete', false, 'true'],
    ['exit-zero incomplete', 'success', 'interrupted', false, 'false'],
    ['failed', 'failure', 'interrupted', false, 'false'],
    ['cancelled', 'failure', 'interrupted', true, 'false'],
    ['cancelled after completion', 'success', 'complete', true, 'false'],
  ])(
    'publishes %s safely using a local remote and fake PR API',
    (_label, outcome, status, cancelled, healthy) => {
      const storage = mkdtempSync(
        path.join(tmpdir(), 'lsk-openwiki-lifecycle-')
      );
      const root = path.join(storage, 'repo');
      const remote = path.join(storage, 'remote.git');
      const output = path.join(storage, 'output');
      const trace = path.join(storage, 'api-trace');
      const workflow = buildKnowledgeWorkflow('main', 'en', '0.9.22');
      const extract = (name: string) =>
        workflow
          .split(`      - name: ${name}\n`)[1]
          .split('        run: |\n')[1]
          .split('      - name: ')[0]
          .split('\n')
          .map((line) => line.replace(/^ {10}/u, ''))
          .join('\n');
      const git = (...args: string[]) =>
        execFileSync('git', args, {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
      try {
        mkdirSync(root);
        git('init', '-q', '-b', 'main');
        git('config', 'user.name', 'Test');
        git('config', 'user.email', 'test@example.com');
        writeFileSync(
          path.join(root, 'source.ts'),
          'export const source = true;\n'
        );
        git('add', '.');
        git('commit', '-qm', 'source');
        const source = git('rev-parse', 'HEAD');
        git('init', '--bare', '-q', remote);
        git('remote', 'add', 'origin', remote);
        git('push', '-q', 'origin', 'main');
        mkdirSync(path.join(root, 'openwiki'));
        writeFileSync(
          path.join(root, 'openwiki', 'page.md'),
          '# Completed page\n'
        );
        writeFileSync(
          path.join(root, 'openwiki', '.last-update.json'),
          JSON.stringify({ status, gitHead: source })
        );
        if (status !== 'complete')
          writeFileSync(
            path.join(root, 'openwiki', '.run.json'),
            JSON.stringify({ planningContext: 'RAW_PROMPT_SENTINEL' })
          );
        writeFileSync(output, '');
        const env = {
          ...process.env,
          SOURCE_SHA: source,
          GITHUB_OUTPUT: output,
          KNOWLEDGE_BRANCH: 'lee-spec-kit/knowledge-main',
          OPENWIKI_OUTCOME: String(outcome),
          SOURCE_CURRENT: 'true',
          OPENWIKI_CANCELLED: String(cancelled),
          GITHUB_REPOSITORY: 'fixture/repo',
          TRACE: trace,
        };
        const execute = (command: string) =>
          execFileSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
            cwd: root,
            env,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        execute(extract('Check OpenWiki completion metadata'));
        env['OPENWIKI_COMPLETE'] = readFileSync(output, 'utf8').includes(
          'complete=true'
        )
          ? 'true'
          : 'false';
        execute(extract('Remove transient OpenWiki run context'));
        execute(
          extract('Ensure OpenWiki changed only its documented output surface')
        );
        execute(extract('Check whether the source branch advanced'));
        const fakeApi = `gh() {
        printf '%s\\n' "$*" >> "$TRACE"
        case "$1 $2" in
          'pr list') return 0 ;;
          'pr create') echo 'https://example.test/pull/1' ;;
          'pr view') echo '{"number":1,"isDraft":true,"url":"https://example.test/pull/1"}' ;;
          'api --method'|'pr ready') return 0 ;;
          *) return 88 ;;
        esac
      }\n`;
        execute(
          fakeApi + extract('Publish the OpenWiki checkpoint pull request')
        );
        expect(readFileSync(output, 'utf8')).toContain(`healthy=${healthy}`);
        expect(readFileSync(trace, 'utf8')).not.toContain('pr ready 1');
        if (healthy === 'true') {
          const outputs = Object.fromEntries(
            readFileSync(output, 'utf8')
              .trim()
              .split('\n')
              .map((line) => line.split('='))
          );
          env['PR_NUMBER'] = outputs.pr_number;
          env['PR_HEAD_SHA'] = outputs.head_sha;
          env['PREVIOUS_SHA'] = outputs.previous_sha;
          env['PUSHED'] = outputs.pushed;
          env['WAS_READY'] = outputs.was_ready;
          execute(
            fakeApi +
              extract('Mark only a current uncancelled Knowledge PR ready')
          );
        }
        expect(
          git(
            'show',
            'refs/remotes/origin/lee-spec-kit/knowledge-main:openwiki/page.md'
          )
        ).toBe('# Completed page');
        expect(() =>
          git(
            'show',
            'refs/remotes/origin/lee-spec-kit/knowledge-main:openwiki/.run.json'
          )
        ).toThrow();
        const calls = readFileSync(trace, 'utf8');
        expect(calls).toContain('--draft');
        if (healthy === 'true') expect(calls).toContain('pr ready 1');
        else {
          expect(calls).toContain('checkpoint incomplete OpenWiki Knowledge');
          expect(calls).not.toContain('pr ready 1');
          expect(() =>
            execute(extract('Propagate an incomplete OpenWiki result'))
          ).toThrow();
        }
      } finally {
        rmSync(storage, { recursive: true, force: true });
      }
    }
  );

  test('distinguishes complete, interrupted, malformed, missing and active-run metadata', () => {
    const f = fixture();
    try {
      expect(observer.observe(f.root, sourceSha).complete).toBe(false);
      f.write('openwiki/.last-update.json', {
        status: 'complete',
        gitHead: sourceSha,
      });
      expect(observer.observe(f.root, sourceSha).complete).toBe(true);
      f.write('openwiki/.run.json', {
        schemaVersion: 1,
        phase: 'generating',
        plan: {
          pages: [
            { status: 'complete' },
            { status: 'pending' },
            { status: 'skipped' },
          ],
        },
        planningContext: 'RAW_PROMPT_SENTINEL',
        wikiGoal: 'RAW_PROMPT_SENTINEL',
      });
      const state = observer.observe(f.root, sourceSha);
      expect(state.complete).toBe(false);
      expect(state.queue).toEqual({
        total: 3,
        complete: 1,
        pending: 1,
        skipped: 1,
      });
      expect(JSON.stringify(state)).not.toContain('RAW_PROMPT_SENTINEL');
      f.write('openwiki/.run.json', '{');
      expect(observer.observe(f.root, sourceSha).runState).toBe('invalid');
      rmSync(path.join(f.root, 'openwiki/.run.json'));
      f.write('openwiki/.last-update.json', {
        status: 'interrupted',
        gitHead: sourceSha,
      });
      expect(observer.observe(f.root, sourceSha).complete).toBe(false);
      f.write('openwiki/.last-update.json', {
        status: 'complete',
        gitHead: 'b'.repeat(40),
      });
      expect(observer.observe(f.root, sourceSha).sourceMatches).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  test('exports only durable pages, excludes secrets and links, and retains previously captured pages', () => {
    const f = fixture();
    const previous = process.env.OPENWIKI_TEST_SECRET;
    process.env.OPENWIKI_TEST_SECRET = 'SECRET_ENV_SENTINEL';
    try {
      const pages: Record<string, object> = {};
      const page = (name: string, body: string) => {
        const pageVersion = `sha256:${createHash('sha256').update(body).digest('hex')}`;
        f.write(`openwiki/${name}.md`, body);
        f.write(`openwiki/.claims/${name}.json`, {
          schemaVersion: 1,
          pageVersion,
          claims: [],
          verification: { by: 'openwiki', at: '2026-11-01T00:00:00Z' },
          rawPrompt: 'RAW_PROMPT_SENTINEL',
        });
        pages[`/openwiki/${name}.md`] = { pageVersion, gitHead: sourceSha };
      };
      page('complete', '# Completed page');
      page('secret', 'SECRET_ENV_SENTINEL');
      page('pending', '# Written but not verified');
      f.write('openwiki/pending.md', '# Partial edit');
      page('link', '# Link');
      rmSync(path.join(f.root, 'openwiki/link.md'));
      f.write('private.txt', 'PRIVATE_FILE_SENTINEL');
      symlinkSync(
        path.join(f.root, 'private.txt'),
        path.join(f.root, 'openwiki/link.md')
      );
      f.write('openwiki/.page-manifest.json', {
        schemaVersion: 1,
        pages,
        rawPrompt: 'RAW_PROMPT_SENTINEL',
      });
      f.write('openwiki/.env', 'SECRET_ENV_SENTINEL');
      f.write('openwiki/.run.json', { planningContext: 'RAW_PROMPT_SENTINEL' });
      f.write('openwiki/INSTRUCTIONS.md', 'PRIVATE_INSTRUCTION_SENTINEL');
      expect(observer.checkpoint(f.root, f.directory).retainedPages).toBe(1);
      const target = path.join(f.directory, 'checkpoint', 'openwiki');
      expect(readFileSync(path.join(target, 'complete.md'), 'utf8')).toBe(
        '# Completed page'
      );
      expect(
        readFileSync(path.join(target, '.claims/complete.json'), 'utf8')
      ).not.toContain('RAW_PROMPT_SENTINEL');
      expect(
        readFileSync(path.join(target, '.page-manifest.json'), 'utf8')
      ).not.toContain('RAW_PROMPT_SENTINEL');
      for (const file of [
        '.run.json',
        '.env',
        'secret.md',
        'pending.md',
        'link.md',
        'INSTRUCTIONS.md',
      ])
        expect(existsSync(path.join(target, file))).toBe(false);
      f.write('openwiki/complete.md', '# Mid-write later change');
      observer.checkpoint(f.root, f.directory);
      expect(readFileSync(path.join(target, 'complete.md'), 'utf8')).toBe(
        '# Completed page'
      );
    } finally {
      if (previous === undefined) delete process.env.OPENWIKI_TEST_SECRET;
      else process.env.OPENWIKI_TEST_SECRET = previous;
      f.cleanup();
    }
  });

  test('uses only closed telemetry fields and handles telemetry opt-out', () => {
    const f = fixture();
    try {
      mkdirSync(f.directory);
      f.write('ci/telemetry.json', {
        event: {
          properties: {
            outcome: 'failure',
            error_class: 'provider_error',
            error_detail: 'auth',
            error_stage: 'run',
            error_owner: 'environment',
            http_status: 401,
            prompt: 'RAW_PROMPT_SENTINEL',
            key: 'SECRET_SENTINEL',
          },
        },
      });
      expect(observer.telemetry(f.directory)).toMatchObject({
        outcome: 'failure',
        errorClass: 'provider_error',
        errorDetail: 'auth',
        httpStatus: 401,
      });
      expect(JSON.stringify(observer.telemetry(f.directory))).not.toContain(
        'SENTINEL'
      );
      f.write('ci/telemetry.json', { disabled: true, sent: false });
      expect(observer.telemetry(f.directory).disabled).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  test('budgets serialized Claims before exporting either file', () => {
    const f = fixture();
    try {
      const body = '# Completed';
      const pageVersion = `sha256:${createHash('sha256').update(body).digest('hex')}`;
      const claims = JSON.stringify({
        schemaVersion: 1,
        pageVersion,
        claims: [],
        verification: { by: 'openwiki', at: '2026-11-01' },
      });
      f.write('openwiki/page.md', body);
      f.write('openwiki/.claims/page.json', claims);
      f.write('openwiki/.page-manifest.json', {
        schemaVersion: 1,
        pages: { '/openwiki/page.md': { pageVersion } },
      });
      const result = observer.checkpoint(
        f.root,
        f.directory,
        Buffer.byteLength(body + claims) + 1
      );
      expect(result).toEqual({ retainedPages: 0, excludedFilesOrPages: 1 });
      expect(
        existsSync(path.join(f.directory, 'checkpoint/openwiki/page.md'))
      ).toBe(false);
      expect(
        existsSync(
          path.join(f.directory, 'checkpoint/openwiki/.claims/page.json')
        )
      ).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  test.each(['write', 'rename'])(
    'preserves the prior export after a %s failure',
    (mode) => {
      const f = fixture();
      let failure;
      try {
        const install = (body: string) => {
          const pageVersion = `sha256:${createHash('sha256').update(body).digest('hex')}`;
          f.write('openwiki/page.md', body);
          f.write('openwiki/.claims/page.json', {
            schemaVersion: 1,
            pageVersion,
            claims: [],
            verification: { by: 'openwiki', at: '2026-11-01' },
          });
          f.write('openwiki/.page-manifest.json', {
            schemaVersion: 1,
            pages: { '/openwiki/page.md': { pageVersion } },
          });
        };
        install('# Original');
        observer.checkpoint(f.root, f.directory);
        const retained = [
          'page.md',
          '.claims/page.json',
          '.page-manifest.json',
        ].map((file) => path.join(f.directory, 'checkpoint/openwiki', file));
        const before = retained.map((file) => readFileSync(file, 'utf8'));
        install('# Updated');
        const filesystem = require('node:fs');
        const method = mode === 'write' ? 'writeFileSync' : 'renameSync';
        const actual = filesystem[method];
        let failed = false;
        failure = vi.spyOn(filesystem, method).mockImplementation((...args) => {
          const destination = mode === 'write' ? args[0] : args[1];
          if (
            !failed &&
            String(destination).endsWith(
              mode === 'write' ? '/1.new' : '/.claims/page.json'
            )
          ) {
            failed = true;
            throw new Error('ENOSPC');
          }
          return actual(...args);
        });
        expect(() => observer.checkpoint(f.root, f.directory)).toThrow(
          'ENOSPC'
        );
        failure.mockRestore();
        expect(retained.map((file) => readFileSync(file, 'utf8'))).toEqual(
          before
        );
      } finally {
        failure?.mockRestore();
        f.cleanup();
      }
    }
  );

  test.each(['api failure', 'source advanced', 'cannot confirm draft'])(
    'keeps readiness safe after %s',
    (mode) => {
      const storage = mkdtempSync(path.join(tmpdir(), 'lsk-openwiki-ready-'));
      const root = path.join(storage, 'repo');
      const remote = path.join(storage, 'remote.git');
      const output = path.join(storage, 'output');
      const git = (...args: string[]) =>
        execFileSync('git', args, {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
      try {
        mkdirSync(root);
        git('init', '-q', '-b', 'main');
        git('config', 'user.name', 'Test');
        git('config', 'user.email', 'test@example.com');
        writeFileSync(path.join(root, 'source.ts'), 'source');
        git('add', '.');
        git('commit', '-qm', 'base');
        const source = git('rev-parse', 'HEAD');
        git('switch', '-q', '-c', 'knowledge');
        mkdirSync(path.join(root, 'openwiki'));
        writeFileSync(path.join(root, 'openwiki/page.md'), '# Earlier');
        git('add', '.');
        git('commit', '-qm', 'previous');
        const previous = git('rev-parse', 'HEAD');
        writeFileSync(path.join(root, 'openwiki/page.md'), '# New');
        git('add', '.');
        git('commit', '-qm', 'new');
        const head = git('rev-parse', 'HEAD');
        git('init', '--bare', '-q', remote);
        git('remote', 'add', 'origin', remote);
        git('push', '-q', 'origin', 'main', 'knowledge');
        writeFileSync(output, '');
        const step = buildKnowledgeWorkflow('main', 'en', '0.9.22')
          .split(
            '      - name: Mark only a current uncancelled Knowledge PR ready\n'
          )[1]
          .split('        run: |\n')[1]
          .split('      - name: ')[0]
          .split('\n')
          .map((line) => line.replace(/^ {10}/u, ''))
          .join('\n');
        const execute = () =>
          execFileSync(
            'bash',
            [
              '-e',
              '-c',
              `gh() {
                if [ "$1 $2 $3" = 'pr ready 1' ]; then return 23; fi
                if [ "$1 $2 $3" = 'pr ready --undo' ] && [ "$FAIL_DEMOTION" = true ]; then return 24; fi
                if [ "$1 $2" = 'pr view' ]; then echo true; fi
              }\n${step}`,
            ],
            {
              cwd: root,
              env: {
                ...process.env,
                GITHUB_OUTPUT: output,
                PR_NUMBER: '1',
                PR_HEAD_SHA: head,
                PREVIOUS_SHA: previous,
                KNOWLEDGE_BRANCH: 'knowledge',
                PUSHED: 'true',
                WAS_READY: 'false',
                FAIL_DEMOTION:
                  mode === 'cannot confirm draft' ? 'true' : 'false',
                SOURCE_SHA: mode === 'source advanced' ? previous : source,
              },
              stdio: 'pipe',
            }
          );
        if (mode === 'api failure' || mode === 'cannot confirm draft') {
          expect(execute).toThrow();
          expect(git('ls-remote', 'origin', 'refs/heads/knowledge')).toContain(
            mode === 'cannot confirm draft' ? head : previous
          );
        } else {
          expect(execute).not.toThrow();
          expect(readFileSync(output, 'utf8')).toContain('healthy=false');
          expect(git('ls-remote', 'origin', 'refs/heads/knowledge')).toContain(
            head
          );
        }
      } finally {
        rmSync(storage, { recursive: true, force: true });
      }
    }
  );

  test.each([0, 17])(
    'runs one child, preserves its exit code %i and suppresses raw output',
    async (exitCode) => {
      const f = fixture();
      try {
        const code = await observer.run(
          [
            process.execPath,
            '-e',
            `console.log('RAW_PROMPT_SENTINEL'); console.error('SECRET_SENTINEL'); process.exit(${exitCode})`,
          ],
          {
            root: f.root,
            directory: f.directory,
            sourceSha,
            intervalMs: 10,
          }
        );
        expect(code).toBe(exitCode);
        const status = readFileSync(
          path.join(f.directory, 'diagnostics/status.json'),
          'utf8'
        );
        expect(JSON.parse(status).exitCode).toBe(exitCode);
        expect(status).not.toContain('SENTINEL');
      } finally {
        f.cleanup();
      }
    }
  );

  test.each(['SIGTERM', 'SIGINT'] as const)(
    '%s forwards cancellation and preserves a final safe diagnostic',
    async (signal) => {
      const f = fixture();
      try {
        const child = spawn(
          process.execPath,
          [
            script,
            'run',
            '--',
            process.execPath,
            '-e',
            'setInterval(() => {}, 1000)',
          ],
          {
            cwd: f.root,
            env: {
              ...process.env,
              OPENWIKI_CI_DIR: f.directory,
              SOURCE_SHA: sourceSha,
            },
            stdio: 'pipe',
          }
        );
        let output = '';
        let cancelled = false;
        child.stdout.on('data', (chunk) => {
          output += chunk;
          if (!cancelled && output.includes('[OpenWiki]')) {
            cancelled = true;
            child.kill(signal);
          }
        });
        const code = await new Promise((resolve, reject) => {
          child.on('close', resolve);
          child.on('error', reject);
        });
        expect(code).toBe(signal === 'SIGTERM' ? 143 : 130);
        expect(
          JSON.parse(
            readFileSync(
              path.join(f.directory, 'diagnostics/status.json'),
              'utf8'
            )
          ).signal
        ).toBe(signal);
      } finally {
        f.cleanup();
      }
    }
  );

  test('workflow cancellation cleanup keeps strict completion, draft publication and failure propagation', () => {
    const workflow = buildKnowledgeWorkflow('main', 'en', '0.9.22');
    for (const step of [
      'Check OpenWiki completion metadata',
      'Collect safe OpenWiki diagnostics before removing run context',
      'Retain safe OpenWiki observation and completed-page export',
      'Remove transient OpenWiki run context',
      'Ensure OpenWiki changed only its documented output surface',
      'Check whether the source branch advanced',
      'Publish the OpenWiki checkpoint pull request',
    ]) {
      const body = workflow
        .split(`      - name: ${step}\n`)[1]
        ?.split('      - name: ')[0];
      expect(body).toContain('always()');
    }
    expect(workflow).toContain('[ "${OPENWIKI_CANCELLED:-false}" != true ]');
    const publish = workflow
      .split('      - name: Publish the OpenWiki checkpoint pull request\n')[1]
      .split('      - name: ')[0];
    expect(
      publish.slice(publish.indexOf('trap on_publication_error ERR'))
    ).not.toContain('gh pr ready "$pr_number"');
    const ready = workflow
      .split(
        '      - name: Mark only a current uncancelled Knowledge PR ready\n'
      )[1]
      .split('      - name: ')[0];
    expect(ready).toContain('success() && !cancelled()');
    expect(ready).not.toContain('always()');
    expect(workflow).toContain(
      "steps.openwiki.outcome != 'success' || steps.publish.outputs.healthy != 'true'"
    );
    expect(workflow.indexOf('Collect safe OpenWiki')).toBeLessThan(
      workflow.indexOf('rm -- openwiki/.run.json')
    );
    expect(workflow).toContain(
      'Transient run context is deliberately excluded'
    );
    // Execute final propagation: an exit-zero incomplete run still fails the job.
    const propagation = workflow
      .split('      - name: Propagate an incomplete OpenWiki result\n')[1]
      .split('        run: |\n')[1]
      .split('\n')
      .map((line) => line.replace(/^ {10}/u, ''))
      .join('\n');
    expect(() =>
      execFileSync('bash', ['-e', '-c', propagation], { stdio: 'pipe' })
    ).toThrow();
  });
});

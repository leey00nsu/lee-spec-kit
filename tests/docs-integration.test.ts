import { test, expect, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { ProjectConfig } from '../src/config/types.js';
import type { ResolvedFeature } from '../src/utils/feature-resolver.js';
import type { DocsWorkspace } from '../src/utils/feature-workspace.js';
import {
  integrateDocsWorkspace,
  cleanupDocsWorkspace,
} from '../src/utils/docs-integration.js';
import {
  readDocsIntegrationReceipt,
  docsIntegrationMarker,
  serializeDocsReceipt,
} from '../src/utils/docs-integration-receipt.js';
import {
  resolveDocsCompletionStrategy,
  assertValidDocsCompletionConfig,
} from '../src/config/docs-completion.js';
import * as gitRun from '../src/utils/git-run.js';

async function fixture(
  run: (f: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
  docsRelative = ''
) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lsk-docs-proof-'));
  try {
    await run(await createFixture(directory, docsRelative));
  } finally {
    await fs.remove(directory);
  }
}

async function createFixture(directory: string, docsRelative = '') {
  const root = path.join(directory, 'docs');
  const source = path.join(directory, 'source');
  const docsRoot = path.join(root, docsRelative);
  const sourceDocs = path.join(source, docsRelative);
  await fs.ensureDir(docsRoot);
  const git = (args: string[], cwd = root) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Docs test']);
  git(['config', 'user.email', 'docs@example.test']);
  const relative = 'features/K7M2Q9RX4DAB-alpha';
  await fs.ensureDir(path.join(docsRoot, relative));
  await fs.writeFile(
    path.join(docsRoot, relative, 'plan.md'),
    `- **Status**: Approved
## Curated Documentation Impact
- **Schema**: 2
- **Assessment**: Complete
- **Product requirements**: NONE
- **System architecture**: UPDATE
- **Onboarding entrypoint**: NONE
- **Operational/runtime contract**: NONE
- **Targets**: docs:guide.md
- **Reason**: Shared explanation changes.
## Additional Curated Impacts
- **Assessment**: Complete
- **Decision**: NONE
- **Reason**: No other impact.
`
  );
  await fs.writeFile(
    path.join(docsRoot, relative, 'tasks.md'),
    `- [TODO][NON-PRD] T-K7M2Q9RX4DAB-alpha-01 explain change
  - Docs:
    - docs:guide.md
  - Checklist:
    - [ ] explain
`
  );
  await fs.writeFile(
    path.join(docsRoot, relative, 'spec.md'),
    'Approved scope\n'
  );
  await fs.writeFile(
    path.join(docsRoot, relative, 'decisions.md'),
    'Decision\n'
  );
  await fs.writeFile(
    path.join(docsRoot, 'guide.md'),
    'base start\n\n\n\n\nbase end\n'
  );
  git(['add', '.']);
  git(['commit', '-m', 'baseline']);
  const originalBase = git(['rev-parse', 'HEAD']);
  git(['worktree', 'add', '-b', 'docs/single-K7M2Q9RX4DAB', source, 'main']);
  const feature: ResolvedFeature = {
    id: 'K7M2Q9RX4DAB',
    slug: 'alpha',
    folderName: 'K7M2Q9RX4DAB-alpha',
    type: 'single',
    path: path.join(sourceDocs, relative),
    docs: { featurePathFromDocs: relative },
    git: { docsGitCwd: source, projectGitCwd: source },
  };
  const config: ProjectConfig = {
    docsDir: sourceDocs,
    docsRepo: 'standalone',
    projectType: 'single',
    lang: 'en',
    workflow: {
      mode: 'local',
      completionStrategy: 'local-squash',
      taskCommitGate: 'strict',
    },
  };
  const state: DocsWorkspace = {
    root,
    baseBranch: 'main',
    branch: 'docs/single-K7M2Q9RX4DAB',
    directory: source,
    docsDirectory: sourceDocs,
    statePath: path.join(root, '.git', 'state.json'),
    current: true,
    branchExists: true,
    integrated: false,
    strategy: 'local-squash',
    originalBaseTip: originalBase,
    sourceTip: originalBase,
  };
  await fs.writeFile(
    path.join(sourceDocs, relative, 'tasks.md'),
    (await fs.readFile(path.join(sourceDocs, relative, 'tasks.md'), 'utf8'))
      .replace('[TODO]', '[DONE]')
      .replace('[ ]', '[x]')
  );
  await fs.writeFile(
    path.join(sourceDocs, 'guide.md'),
    'Feature start\n\n\n\n\nbase end\n'
  );
  await fs.ensureDir(path.join(sourceDocs, relative, 'artifacts'));
  await fs.writeFile(
    path.join(sourceDocs, relative, 'artifacts', 'proof.txt'),
    'test evidence\n'
  );
  git(['add', '.'], source);
  git(['commit', '-m', 'docs(K7M2Q9RX4DAB): explain change'], source);
  const code = {
    strategy: 'local-squash',
    sourceTip: git(['rev-parse', 'HEAD'], source),
    sourceTree: git(['rev-parse', 'HEAD^{tree}'], source),
    integratedCommit: originalBase,
    integratedTree: git(['rev-parse', 'main^{tree}']),
    checksHash: 'fixture-verified',
  };
  const read = (strategy = state.strategy) =>
    readDocsIntegrationReceipt(
      root,
      feature,
      'main',
      strategy,
      git(['rev-parse', `refs/heads/${state.branch}`]),
      docsRelative,
      'local'
    );
  const merge = () => integrateDocsWorkspace(config, feature, state, code);
  return {
    directory,
    root,
    source,
    relative,
    feature,
    config,
    state,
    git,
    originalBase,
    read,
    merge,
  };
}

test('missing docs strategy inherits local code policy; overrides are validated', () => {
  const config: ProjectConfig = {
    docsDir: '.',
    docsRepo: 'standalone',
    projectType: 'single',
    lang: 'en',
    workflow: { mode: 'local', completionStrategy: 'local-squash' },
  };
  expect(resolveDocsCompletionStrategy(config)).toBe('local-squash');
  config.workflow!.completionStrategy = 'local-ff';
  expect(resolveDocsCompletionStrategy(config)).toBe('local-ff');
  config.workflow!.docsCompletionStrategy = 'local-squash';
  expect(() => assertValidDocsCompletionConfig(config)).not.toThrow();
  config.docsRepo = 'embedded';
  expect(() => assertValidDocsCompletionConfig(config)).toThrow(/standalone/);
  config.docsRepo = 'standalone';
  config.workflow!.mode = 'github';
  expect(() => assertValidDocsCompletionConfig(config)).toThrow(/GitHub/);
  config.workflow!.docsCompletionStrategy = 'inherit';
  expect(resolveDocsCompletionStrategy(config)).toBe('local-ff');
});

test('squash uses latest base, one parent, approved net paths and retained source evidence', async () => {
  await fixture(async (f) => {
    await fs.writeFile(
      path.join(f.root, 'guide.md'),
      'base start\n\n\n\n\nother Feature end\n'
    );
    await fs.ensureDir(path.join(f.root, 'features', 'OTHER-beta'));
    await fs.writeFile(
      path.join(f.root, 'features', 'OTHER-beta', 'tasks.md'),
      'Other Feature progress\n'
    );
    f.git(['add', '.']);
    f.git(['commit', '-m', 'docs: independent Feature']);
    const base = f.git(['rev-parse', 'HEAD']);
    await expect(f.merge()).rejects.toMatchObject({
      code: 'DOCS_BASE_ADVANCED',
    });
    f.git(['merge', '--no-edit', 'main'], f.source);
    const source = f.git(['rev-parse', 'HEAD'], f.source);
    const tree = f.git(['rev-parse', 'HEAD^{tree}'], f.source);
    const result = await f.merge();
    expect(f.git(['show', '-s', '--format=%P', 'main'])).toBe(base);
    expect(f.git(['rev-parse', 'main^{tree}'])).toBe(tree);
    expect(f.git(['rev-list', '--count', `${base}..main`])).toBe('1');
    expect(await fs.readFile(path.join(f.root, 'guide.md'), 'utf8')).toContain(
      'Feature start'
    );
    expect(await fs.readFile(path.join(f.root, 'guide.md'), 'utf8')).toContain(
      'other Feature end'
    );
    expect(f.git(['rev-parse', String(result.evidenceRef)])).toBe(source);
    expect(f.git(['rev-parse', String(result.portableEvidenceRef)])).toBe(
      source
    );
    expect(f.git(['rev-list', '--all', '--count'])).not.toBe(
      f.git(['rev-list', 'main', '--count'])
    );
    const proof = f.read();
    expect(proof.integrated).toBe(true);
    expect(proof.receipt?.originalBaseTip).toBe(f.originalBase);
    const ready = { ...f.state, ...proof };
    await cleanupDocsWorkspace(ready, f.feature);
    expect(await fs.pathExists(f.source)).toBe(false);
    expect(f.git(['show', 'main:features/OTHER-beta/tasks.md'])).toBe(
      'Other Feature progress'
    );
    expect(f.git(['rev-parse', String(result.evidenceRef)])).toBe(source);
    await expect(cleanupDocsWorkspace(ready, f.feature)).resolves.toMatchObject(
      { alreadyCleaned: true }
    );
    await expect(
      integrateDocsWorkspace(f.config, f.feature, ready)
    ).resolves.toMatchObject({ alreadyIntegrated: true });
    const clone = path.join(f.directory, 'clone');
    f.git(['clone', '--no-local', f.root, clone]);
    const cloned = readDocsIntegrationReceipt(
      clone,
      f.feature,
      'main',
      'local-squash',
      undefined,
      '',
      'local'
    );
    expect(cloned.integrated).toBe(true);
    expect(f.git(['rev-parse', String(result.evidenceRef)], clone)).toBe(
      source
    );
  });
});

for (const scenario of [
  'dirty-source',
  'dirty-base',
  'outside-scope',
  'scope-not-approved',
  'other-feature-path',
]) {
  test(`docs squash preserves data and rejects ${scenario}`, async () => {
    await fixture(async (f) => {
      const base = f.git(['rev-parse', 'main']);
      if (scenario === 'dirty-source')
        await fs.writeFile(path.join(f.source, 'untracked.txt'), 'preserve');
      if (scenario === 'dirty-base')
        await fs.writeFile(path.join(f.root, 'untracked.txt'), 'preserve');
      if (scenario === 'outside-scope')
        await fs.writeFile(path.join(f.source, 'rogue.md'), 'preserve');
      if (scenario === 'other-feature-path') {
        await fs.ensureDir(path.join(f.source, 'features', 'OTHER-beta'));
        await fs.writeFile(
          path.join(f.source, 'features', 'OTHER-beta', 'tasks.md'),
          'preserve'
        );
      }
      if (scenario === 'scope-not-approved')
        await fs.writeFile(
          path.join(f.source, f.relative, 'plan.md'),
          (
            await fs.readFile(
              path.join(f.source, f.relative, 'plan.md'),
              'utf8'
            )
          ).replace('Approved', 'Draft')
        );
      if (!scenario.startsWith('dirty')) {
        f.git(['add', '.'], f.source);
        f.git(['commit', '-m', 'docs(K7M2Q9RX4DAB): invalid source'], f.source);
      }
      await expect(f.merge()).rejects.toMatchObject({
        code: scenario.startsWith('dirty')
          ? 'DOCS_WORKTREE_DIRTY'
          : scenario === 'scope-not-approved'
            ? 'DOCS_SCOPE_NOT_APPROVED'
            : 'DOCS_SCOPE_VIOLATION',
      });
      expect(f.git(['rev-parse', 'main'])).toBe(base);
      expect(await fs.pathExists(f.source)).toBe(true);
    });
  });
}

for (const scenario of [
  'source-changed',
  'dirty',
  'evidence-changed',
  'evidence-missing',
  'strategy-changed',
  'wrong-tree',
  'wrong-checkpoint',
  'malformed-receipt',
]) {
  test(`cleanup rejects ${scenario} and retains the original workspace`, async () => {
    await fixture(async (f) => {
      const result = await f.merge();
      const good = f.read();
      if (scenario === 'source-changed')
        f.git(['commit', '--allow-empty', '-m', 'new source'], f.source);
      if (scenario === 'dirty')
        await fs.writeFile(path.join(f.source, 'local.txt'), 'preserve');
      if (scenario === 'evidence-changed')
        f.git(['update-ref', String(result.evidenceRef), f.originalBase]);
      if (scenario === 'evidence-missing') {
        f.git(['update-ref', '-d', String(result.evidenceRef)]);
        f.git(['update-ref', '-d', String(result.portableEvidenceRef)]);
      }
      if (
        ['wrong-tree', 'wrong-checkpoint', 'malformed-receipt'].includes(
          scenario
        )
      ) {
        const receipt = { ...good.receipt! };
        if (scenario === 'wrong-tree')
          receipt.sourceTree = f.git(['rev-parse', 'main^1^{tree}']);
        if (scenario === 'wrong-checkpoint')
          receipt.sourceTasksCommit = f.originalBase;
        const body =
          scenario === 'malformed-receipt'
            ? `${docsIntegrationMarker(f.feature)}\nLee-Spec-Docs-Receipt-v2: {broken`
            : serializeDocsReceipt(f.feature, receipt);
        f.git([
          'commit',
          '--amend',
          '-m',
          `docs(K7M2Q9RX4DAB): integrate alpha documentation\n\n${body}`,
        ]);
      }
      const changed = f.read(
        scenario === 'strategy-changed' ? 'local-ff' : 'local-squash'
      );
      await expect(
        cleanupDocsWorkspace(
          {
            ...f.state,
            ...changed,
            integrated: changed.integrated,
            validationError: changed.error,
          },
          f.feature
        )
      ).rejects.toBeTruthy();
      expect(await fs.pathExists(f.source)).toBe(true);
      expect(f.git(['rev-parse', `refs/heads/${f.state.branch}`])).toBeTruthy();
    });
  });
}

test('legacy empty ff receipts survive policy upgrades and cleanup', async () => {
  await fixture(async (f) => {
    f.git(
      [
        'commit',
        '--allow-empty',
        '-m',
        `docs(K7M2Q9RX4DAB): old integration\n\n${docsIntegrationMarker(f.feature)}`,
      ],
      f.source
    );
    f.git(['merge', '--ff-only', f.state.branch]);
    const proof = f.read();
    expect(proof).toMatchObject({ integrated: true, legacy: true });
    await cleanupDocsWorkspace({ ...f.state, ...proof }, f.feature);
    expect(await fs.pathExists(f.source)).toBe(false);
  });
});

test('a concurrent base advance at CAS is preserved without moving the source', async () => {
  await fixture(async (f) => {
    const original = gitRun.runGitOrThrow;
    let advanced = '';
    const spy = vi
      .spyOn(gitRun, 'runGitOrThrow')
      .mockImplementation((args, cwd, options) => {
        if (
          args[0] === 'update-ref' &&
          args[1] === 'refs/heads/main' &&
          !advanced
        ) {
          advanced = execFileSync(
            'git',
            [
              'commit-tree',
              f.git(['rev-parse', 'main^{tree}']),
              '-p',
              f.originalBase,
            ],
            {
              cwd: f.root,
              encoding: 'utf8',
              input: 'external concurrent commit\n',
            }
          ).trim();
          f.git(['update-ref', 'refs/heads/main', advanced, f.originalBase]);
        }
        return original(args, cwd, options);
      });
    const sourceTip = f.git(['rev-parse', 'HEAD'], f.source);
    try {
      await expect(f.merge()).rejects.toMatchObject({
        code: 'DOCS_BASE_ADVANCED',
      });
    } finally {
      spy.mockRestore();
    }
    expect(advanced).toBeTruthy();
    expect(f.git(['rev-parse', 'main'])).toBe(advanced);
    expect(f.git(['rev-parse', 'HEAD'], f.source)).toBe(sourceTip);
    expect(f.git(['status', '--porcelain'])).toBe('');
    expect(await fs.pathExists(f.source)).toBe(true);
    f.git(['merge', '--no-edit', 'main'], f.source);
    await expect(f.merge()).resolves.toMatchObject({
      docsCompletionStrategy: 'local-squash',
    });
  });
});

test('conflicting shared docs require resolution and revalidation without changing base', async () => {
  await fixture(async (f) => {
    await fs.writeFile(
      path.join(f.root, 'guide.md'),
      'Other Feature start\n\n\n\n\nbase end\n'
    );
    f.git(['add', '.']);
    f.git(['commit', '-m', 'other shared document edit']);
    const base = f.git(['rev-parse', 'main']);
    expect(() => f.git(['merge', '--no-edit', 'main'], f.source)).toThrow();
    await expect(f.merge()).rejects.toMatchObject({
      code: 'DOCS_WORKTREE_DIRTY',
    });
    expect(f.git(['rev-parse', 'main'])).toBe(base);
    expect(
      await fs.readFile(path.join(f.source, 'guide.md'), 'utf8')
    ).toContain('<<<<<<<');
    await fs.writeFile(
      path.join(f.source, 'guide.md'),
      'Resolved Feature and other Feature start\n\n\n\n\nbase end\n'
    );
    f.git(['add', '.'], f.source);
    f.git(['commit', '--no-edit'], f.source);
    await expect(f.merge()).resolves.toMatchObject({
      docsCompletionStrategy: 'local-squash',
    });
    expect(f.git(['show', '-s', '--format=%P', 'main'])).toBe(base);
  });
});

test('cleanup compare-and-delete retains a concurrent new source tip', async () => {
  await fixture(async (f) => {
    await f.merge();
    const proof = f.read();
    const original = gitRun.runGitOrThrow;
    let newTip = '';
    const spy = vi
      .spyOn(gitRun, 'runGitOrThrow')
      .mockImplementation((args, cwd, options) => {
        if (args[0] === 'worktree' && args[1] === 'remove') {
          f.git(
            ['commit', '--allow-empty', '-m', 'concurrent source checkpoint'],
            f.source
          );
          newTip = f.git(['rev-parse', 'HEAD'], f.source);
        }
        return original(args, cwd, options);
      });
    try {
      await expect(
        cleanupDocsWorkspace({ ...f.state, ...proof }, f.feature)
      ).rejects.toMatchObject({ code: 'DOCS_SOURCE_CHANGED' });
    } finally {
      spy.mockRestore();
    }
    expect(f.git(['rev-parse', `refs/heads/${f.state.branch}`])).toBe(newTip);
    expect(f.read()).toMatchObject({
      integrated: false,
      error: { code: 'DOCS_SOURCE_CHANGED' },
    });
    expect(f.git(['rev-parse', proof.receipt!.evidenceRef])).toBe(
      proof.receipt!.sourceTip
    );
  });
});

test('cleanup recovers safely when the worktree was removed before branch deletion', async () => {
  await fixture(async (f) => {
    await f.merge();
    const proof = f.read();
    f.git(['worktree', 'remove', f.source]);
    await expect(
      cleanupDocsWorkspace({ ...f.state, ...proof }, f.feature)
    ).resolves.toMatchObject({ cleaned: true });
    expect(() =>
      f.git(['rev-parse', `refs/heads/${f.state.branch}`])
    ).toThrow();
    expect(f.git(['rev-parse', proof.receipt!.evidenceRef])).toBe(
      proof.receipt!.sourceTip
    );
  });
});

test('nested docs paths keep receipt scope and task checkpoints rooted in the Git repository', async () => {
  await fixture(async (f) => {
    const result = await f.merge();
    const proof = f.read();
    expect(proof.integrated).toBe(true);
    expect(proof.receipt!.allowedPaths).toContain('nested/guide.md');
    expect(proof.receipt!.allowedPaths).toContain(
      `nested/${f.relative}/tasks.md`
    );
    expect(
      f.git([
        'rev-list',
        '-n',
        '1',
        String(result.verifiedSourceTip),
        '--',
        `nested/${f.relative}/tasks.md`,
      ])
    ).toBe(proof.receipt!.sourceTasksCommit);
    await cleanupDocsWorkspace({ ...f.state, ...proof }, f.feature);
    expect(await fs.pathExists(f.source)).toBe(false);
  }, 'nested');
});

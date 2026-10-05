import fs from 'fs-extra';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { ProjectConfig } from '../config/types.js';
import type { ResolvedFeature } from './feature-resolver.js';
import type { DocsWorkspace } from './feature-workspace.js';
import { resolveFeatureCommitScope } from './commit-conventions.js';
import { createCliError } from './cli-error.js';
import { runGitCapture, runGitOrThrow } from './git-run.js';
import {
  approvedDocsIntegrationPaths,
  docsEvidenceRef,
  docsPortableEvidenceRef,
  isDocsAncestor,
  serializeDocsReceipt,
  readDocsIntegrationReceipt,
  type DocsCodeIntegrationEvidence,
  type DocsIntegrationReceipt,
} from './docs-integration-receipt.js';

export function assertCleanDocsWorktree(directory: string): void {
  const status = runGitOrThrow(
    ['status', '--porcelain', '--untracked-files=all'],
    directory,
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  if (status)
    throw createCliError(
      'DOCS_WORKTREE_DIRTY',
      `Commit or resolve docs changes first: ${directory}\n${status}. Existing files were preserved.`
    );
}

export async function cleanupDocsWorkspace(
  state: DocsWorkspace,
  feature: ResolvedFeature
): Promise<Record<string, unknown>> {
  if (state.validationError)
    throw createCliError(
      state.validationError.code,
      state.validationError.detail
    );
  if (!state.integrated)
    throw createCliError(
      'DOCS_INTEGRATION_NOT_VERIFIED',
      'Verified docs integration is required before cleanup; source data was preserved.'
    );
  assertCleanDocsWorktree(state.root);
  if (
    runGitCapture(['branch', '--show-current'], state.root) !== state.baseBranch
  )
    throw createCliError(
      'DOCS_BRANCH_CHANGED',
      'Check out the recorded docs base before cleanup.'
    );
  const exists = await fs.pathExists(state.directory);
  const branchTip = runGitCapture(
    ['rev-parse', '--verify', `refs/heads/${state.branch}`],
    state.root
  );
  if (exists) {
    assertCleanDocsWorktree(state.directory);
    if (
      runGitCapture(['branch', '--show-current'], state.directory) !==
      state.branch
    )
      throw createCliError(
        'DOCS_BRANCH_CHANGED',
        'Docs source worktree branch changed; cleanup was not attempted.'
      );
  }
  const docsRelative = path
    .relative(state.directory, state.docsDirectory)
    .replace(/\\/gu, '/');
  const verified = readDocsIntegrationReceipt(
    state.root,
    feature,
    state.baseBranch,
    state.strategy,
    branchTip,
    docsRelative
  );
  if (!verified.integrated)
    throw createCliError(
      verified.error?.code || 'DOCS_INTEGRATION_NOT_VERIFIED',
      verified.error?.detail ||
        'Docs integration receipt is not valid; cleanup was not attempted.'
    );
  if (
    exists &&
    (runGitCapture(['branch', '--show-current'], state.directory) !==
      state.branch ||
      runGitCapture(['rev-parse', 'HEAD'], state.directory) !== branchTip)
  )
    throw createCliError(
      'DOCS_SOURCE_CHANGED',
      'Docs source changed during cleanup validation. Its workspace and branch were preserved.'
    );
  if (exists)
    runGitOrThrow(['worktree', 'remove', state.directory], state.root, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  if (branchTip) {
    // A squash source is deliberately not an ancestor of base. Exact verified
    // receipt/source/tree/evidence checks above authorize this one branch only.
    // Compare-and-delete also preserves a concurrent source commit made after
    // worktree removal. No ancestry-based force deletion can discard that tip.
    try {
      runGitOrThrow(
        ['update-ref', '-d', `refs/heads/${state.branch}`, branchTip],
        state.root
      );
    } catch (error) {
      throw createCliError(
        'DOCS_SOURCE_CHANGED',
        `Docs branch changed during cleanup and was preserved. ${(error as Error).message}`
      );
    }
  }
  await writeDocsWorkspaceState(state, {
    ...(verified.receipt ?? {}),
    status: 'cleaned',
    integratedCommit: verified.integratedCommit,
    tip: verified.integratedCommit,
    cleanedAt: new Date().toISOString(),
  });
  return {
    ...docsIntegrationResult({
      ...state,
      ...verified,
      receipt: verified.receipt,
    }),
    cleaned: true,
    alreadyCleaned: !exists && !branchTip,
    docsDirectory: state.root,
  };
}

export async function writeDocsWorkspaceState(
  state: DocsWorkspace,
  values: Record<string, unknown>
): Promise<void> {
  const temporary = `${state.statePath}.${crypto.randomUUID()}.tmp`;
  await fs.ensureDir(path.dirname(state.statePath));
  try {
    await fs.writeJson(
      temporary,
      { version: 2, baseBranch: state.baseBranch, ...values },
      { spaces: 2 }
    );
    await fs.rename(temporary, state.statePath);
  } finally {
    await fs.remove(temporary);
  }
}

export function docsIntegrationResult(
  state: DocsWorkspace
): Record<string, unknown> {
  return {
    docsCompletionStrategy: state.strategy,
    integratedTip: state.integratedCommit,
    integratedTree: state.receipt?.integratedTree,
    originalBaseTip: state.receipt?.originalBaseTip,
    verifiedSourceTip: state.receipt?.sourceTip,
    verifiedSourceTree: state.receipt?.sourceTree,
    evidenceRef: state.receipt?.evidenceRef,
    portableEvidenceRef: state.receipt?.portableEvidenceRef,
  };
}

export async function integrateDocsWorkspace(
  config: ProjectConfig,
  feature: ResolvedFeature,
  state: DocsWorkspace,
  code?: DocsCodeIntegrationEvidence
): Promise<Record<string, unknown>> {
  if (state.validationError)
    throw createCliError(
      state.validationError.code,
      state.validationError.detail
    );
  if (state.integrated)
    return { ...docsIntegrationResult(state), alreadyIntegrated: true };
  if (state.strategy === 'none')
    throw createCliError(
      'INVALID_CONFIG',
      'Managed standalone docs integration requires code completionStrategy=local-ff or local-squash. Inherit with code strategy none does not authorize integration.'
    );
  assertCleanDocsWorktree(state.directory);
  assertCleanDocsWorktree(state.root);
  if (
    runGitCapture(['branch', '--show-current'], state.root) !==
      state.baseBranch ||
    runGitCapture(['branch', '--show-current'], state.directory) !==
      state.branch
  ) {
    throw createCliError(
      'DOCS_BRANCH_CHANGED',
      'Expected docs base/source branches are not checked out. Existing files were preserved.'
    );
  }
  const baseTip = runGitOrThrow(
    ['rev-parse', `refs/heads/${state.baseBranch}`],
    state.root,
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const sourceTip = runGitOrThrow(['rev-parse', 'HEAD'], state.directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!isDocsAncestor(state.root, baseTip, sourceTip)) {
    throw createCliError(
      'DOCS_BASE_ADVANCED',
      `Docs base advanced or diverged. Run workspace sync-docs ${feature.id}, resolve conflicts in the Feature worktree, and revalidate before integration.`
    );
  }
  const sourceTree = runGitOrThrow(
    ['rev-parse', `${sourceTip}^{tree}`],
    state.root,
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const docsRelative = path
    .relative(state.directory, state.docsDirectory)
    .replace(/\\/gu, '/');
  let allowedPaths: string[];
  try {
    allowedPaths = approvedDocsIntegrationPaths(
      state.root,
      feature,
      sourceTip,
      docsRelative
    );
  } catch (error) {
    throw createCliError('DOCS_SCOPE_NOT_APPROVED', (error as Error).message);
  }
  const changed = (
    runGitCapture(
      ['diff', '--name-only', '-z', baseTip, sourceTip],
      state.root
    ) ?? ''
  )
    .split('\0')
    .filter(Boolean);
  const forbidden = changed.filter(
    (file) =>
      !allowedPaths.some(
        (allowed) =>
          file === allowed ||
          (allowed.endsWith('/') && file.startsWith(allowed))
      )
  );
  if (forbidden.length > 0)
    throw createCliError(
      'DOCS_SCOPE_VIOLATION',
      `Docs integration contains unapproved paths: ${forbidden.join(', ')}. Other Feature/base changes were preserved.`
    );
  const originalBaseTip = state.originalBaseTip || baseTip;
  if (!isDocsAncestor(state.root, originalBaseTip, baseTip))
    throw createCliError(
      'DOCS_ORIGINAL_BASE_CHANGED',
      'Recorded original docs base is no longer an ancestor of the current base. Explicit reconciliation is required.'
    );
  const taskPath = path.posix.join(
    docsRelative,
    feature.docs.featurePathFromDocs,
    'tasks.md'
  );
  const sourceTasksCommit = runGitCapture(
    ['rev-list', '-n', '1', sourceTip, '--', taskPath],
    state.root
  );
  if (!sourceTasksCommit)
    throw createCliError(
      'DOCS_TASK_CHECKPOINT_MISSING',
      'The source task checkpoint could not be resolved.'
    );
  const evidenceRef = docsEvidenceRef(feature, sourceTip);
  const portableEvidenceRef =
    state.strategy === 'local-squash'
      ? docsPortableEvidenceRef(feature, sourceTip)
      : undefined;
  const existingEvidence = runGitCapture(
    ['rev-parse', '--verify', evidenceRef],
    state.root
  );
  if (existingEvidence && existingEvidence !== sourceTip)
    throw createCliError(
      'DOCS_EVIDENCE_CHANGED',
      'A different source is already preserved for this Feature. Reconcile it explicitly before integrating.'
    );
  if (portableEvidenceRef) {
    const existingTag = runGitCapture(
      ['rev-parse', '--verify', portableEvidenceRef],
      state.root
    );
    if (existingTag && existingTag !== sourceTip)
      throw createCliError(
        'DOCS_EVIDENCE_CHANGED',
        'The immutable docs evidence transport ref points to another source.'
      );
  }
  const receipt: DocsIntegrationReceipt = {
    version: 2,
    workflowMode: config.workflow?.mode === 'local' ? 'local' : 'github',
    featureRef: feature.folderName,
    component: feature.type,
    baseBranch: state.baseBranch,
    originalBaseTip,
    baseTip,
    strategy: state.strategy,
    sourceTip,
    sourceTree,
    integratedTree: sourceTree,
    evidenceRef,
    ...(portableEvidenceRef ? { portableEvidenceRef } : {}),
    sourceTasksCommit,
    allowedPaths,
    taskCommitGate: config.workflow?.taskCommitGate ?? 'warn',
    ...(code ? { code } : {}),
  };
  const scope = resolveFeatureCommitScope({
    issueNumber: feature.issueNumber,
    featureId: feature.id,
    workflowMode: config.workflow?.mode,
  });
  if (!scope)
    throw createCliError(
      'DOCS_SCOPE_NOT_APPROVED',
      'A canonical Feature commit scope is required.'
    );
  const message = `docs(${scope}): integrate ${feature.slug} documentation\n\n${serializeDocsReceipt(feature, receipt)}\n`;
  if (!existingEvidence)
    runGitOrThrow(['update-ref', evidenceRef, sourceTip, ''], state.root);
  if (
    portableEvidenceRef &&
    !runGitCapture(['rev-parse', '--verify', portableEvidenceRef], state.root)
  )
    runGitOrThrow(
      ['update-ref', portableEvidenceRef, sourceTip, ''],
      state.root
    );
  let integratedCommit: string;
  if (state.strategy === 'local-squash') {
    integratedCommit = execFileSync(
      'git',
      ['commit-tree', sourceTree, '-p', baseTip],
      {
        cwd: state.root,
        encoding: 'utf-8',
        input: message,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    ).trim();
  } else {
    runGitOrThrow(['commit', '--allow-empty', '-m', message], state.directory, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    integratedCommit = runGitOrThrow(['rev-parse', 'HEAD'], state.directory, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  // Check again immediately before the CAS. Never reset an external advance.
  assertCleanDocsWorktree(state.root);
  assertCleanDocsWorktree(state.directory);
  if (
    runGitCapture(['rev-parse', 'HEAD'], state.root) !== baseTip ||
    runGitCapture(['branch', '--show-current'], state.root) !==
      state.baseBranch ||
    runGitCapture(['rev-parse', 'HEAD'], state.directory) !==
      (state.strategy === 'local-ff' ? integratedCommit : sourceTip)
  ) {
    throw createCliError(
      'DOCS_INTEGRATION_CHANGED',
      'Docs base/source changed while preparing integration. Source and evidence were preserved; revalidate before retrying.'
    );
  }
  // read-tree -u changes only paths whose entries differ between these trees,
  // retaining unrelated ignored local files and refusing overwritten files.
  runGitOrThrow(
    ['read-tree', '-m', '-u', baseTip, integratedCommit],
    state.root,
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  try {
    runGitOrThrow(
      [
        'update-ref',
        `refs/heads/${state.baseBranch}`,
        integratedCommit,
        baseTip,
      ],
      state.root
    );
  } catch (error) {
    // CAS failure must not rewind HEAD. Restore just the checkout/index to the
    // externally selected current HEAD; leave all branches/evidence untouched.
    runGitOrThrow(
      ['read-tree', '-m', '-u', integratedCommit, 'HEAD'],
      state.root,
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    throw createCliError(
      'DOCS_BASE_ADVANCED',
      `Docs base changed during integration; its new commits were preserved. ${(error as Error).message}`
    );
  }
  if (runGitCapture(['rev-parse', 'HEAD^{tree}'], state.root) !== sourceTree)
    throw createCliError(
      'DOCS_INTEGRATION_TREE_MISMATCH',
      'Integrated docs tree does not match the verified source. Preserve evidence and inspect before cleanup.'
    );
  await writeDocsWorkspaceState(state, {
    ...receipt,
    status: 'integrated',
    integratedCommit,
    tip: integratedCommit,
  });
  return {
    docsCompletionStrategy: state.strategy,
    integratedTip: integratedCommit,
    integratedTree: sourceTree,
    originalBaseTip,
    verifiedSourceTip: sourceTip,
    verifiedSourceTree: sourceTree,
    evidenceRef,
    portableEvidenceRef,
  };
}

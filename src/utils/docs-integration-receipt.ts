import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ResolvedFeature } from './feature-resolver.js';
import type { EffectiveDocsCompletionStrategy } from '../config/docs-completion.js';
import { resolveFeatureCommitScope } from './commit-conventions.js';
import { runGitCapture, runGitOrThrow } from './git-run.js';
import type { CliReasonCode } from './cli-error.js';
import {
  parseCuratedDocumentationImpact,
  parseTaskDocumentationTargets,
  isValidDocumentationTarget,
} from './documentation-impact.js';

export interface DocsCodeIntegrationEvidence {
  strategy: string;
  sourceTip: string;
  sourceTree: string;
  integratedCommit: string;
  integratedTree: string;
  checksHash: string;
}

export interface DocsIntegrationReceipt {
  version: 2;
  workflowMode: 'local' | 'github';
  featureRef: string;
  component: string;
  baseBranch: string;
  originalBaseTip: string;
  baseTip: string;
  strategy: 'local-ff' | 'local-squash';
  sourceTip: string;
  sourceTree: string;
  integratedTree: string;
  evidenceRef: string;
  portableEvidenceRef?: string;
  sourceTasksCommit: string;
  allowedPaths: string[];
  taskCommitGate: 'off' | 'warn' | 'strict';
  code?: DocsCodeIntegrationEvidence;
}

export interface DocsReceiptResolution {
  integrated: boolean;
  integratedCommit?: string;
  receipt?: DocsIntegrationReceipt;
  legacy?: boolean;
  error?: { code: CliReasonCode; detail: string };
}

const RECEIPT_PREFIX = 'Lee-Spec-Docs-Receipt-v2: ';
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

export function docsIntegrationMarker(feature: ResolvedFeature): string {
  return `Lee-Spec-Docs-Integration: ${feature.type}/${feature.folderName}`;
}

export function docsEvidenceRef(
  feature: ResolvedFeature,
  sourceTip: string
): string {
  const key = createHash('sha256')
    .update(`${feature.type}:${feature.folderName}`)
    .digest('hex')
    .slice(0, 24);
  return `refs/lee-spec-kit/docs-integrations/${key}/${sourceTip}`;
}

export function docsPortableEvidenceRef(
  feature: ResolvedFeature,
  sourceTip: string
): string {
  // Standard clones transfer tags; arbitrary refs/lee-spec-kit refs are not
  // fetched by default. Keep this immutable transport ref alongside the cache ref.
  return `refs/tags/lee-spec-kit/docs-evidence/${feature.type}-${feature.id}/${sourceTip}`;
}

export function serializeDocsReceipt(
  feature: ResolvedFeature,
  receipt: DocsIntegrationReceipt
): string {
  return `${docsIntegrationMarker(feature)}\n${RECEIPT_PREFIX}${JSON.stringify(receipt)}`;
}

export function readDocsIntegrationReceipt(
  root: string,
  feature: ResolvedFeature,
  baseBranch: string,
  strategy: EffectiveDocsCompletionStrategy,
  pendingTip?: string,
  docsRelative = '',
  workflowMode?: 'local' | 'github'
): DocsReceiptResolution {
  const marker = docsIntegrationMarker(feature);
  const commit = runGitCapture(
    [
      'log',
      `refs/heads/${baseBranch}`,
      '--format=%H',
      '--fixed-strings',
      `--grep=${marker}`,
      '-1',
    ],
    root
  );
  if (!commit) return { integrated: false };
  const message =
    runGitCapture(['show', '-s', '--format=%B', commit], root) ?? '';
  const lines = message.split('\n');
  const fail = (
    code: CliReasonCode,
    detail: string
  ): DocsReceiptResolution => ({
    integrated: false,
    integratedCommit: commit,
    error: { code, detail },
  });
  if (lines.filter((line) => line === marker).length !== 1)
    return fail(
      'DOCS_RECEIPT_INVALID',
      'Docs integration marker is missing or duplicated.'
    );
  const receiptLines = lines.filter((line) => line.startsWith(RECEIPT_PREFIX));
  if (receiptLines.length === 0) {
    // Previous empty ff receipts remain readable regardless of a later policy
    // upgrade. Their source is already reachable in the base's history.
    const parents = (
      runGitCapture(['show', '-s', '--format=%P', commit], root) ?? ''
    )
      .split(' ')
      .filter(Boolean);
    const tree = runGitCapture(['rev-parse', `${commit}^{tree}`], root);
    if (
      parents.length !== 1 ||
      tree !== runGitCapture(['rev-parse', `${parents[0]}^{tree}`], root)
    ) {
      return fail(
        'DOCS_RECEIPT_INVALID',
        'Legacy docs receipts must be empty single-parent commits.'
      );
    }
    if (
      pendingTip &&
      !isDocsAncestor(root, pendingTip, `refs/heads/${baseBranch}`)
    ) {
      return fail(
        'DOCS_SOURCE_CHANGED',
        'The docs workspace changed after its legacy integration. Preserve and inspect it before cleanup.'
      );
    }
    return { integrated: true, integratedCommit: commit, legacy: true };
  }
  if (receiptLines.length !== 1)
    return fail(
      'DOCS_RECEIPT_INVALID',
      'Docs integration receipt is duplicated.'
    );
  let receipt: DocsIntegrationReceipt;
  try {
    receipt = JSON.parse(receiptLines[0].slice(RECEIPT_PREFIX.length));
  } catch {
    return fail(
      'DOCS_RECEIPT_INVALID',
      'Docs integration receipt is malformed JSON.'
    );
  }
  if (
    !receipt ||
    receipt.version !== 2 ||
    !['local', 'github'].includes(receipt.workflowMode) ||
    receipt.featureRef !== feature.folderName ||
    receipt.component !== feature.type ||
    receipt.baseBranch !== baseBranch ||
    !['local-ff', 'local-squash'].includes(receipt.strategy) ||
    ![
      receipt.originalBaseTip,
      receipt.baseTip,
      receipt.sourceTip,
      receipt.sourceTree,
      receipt.integratedTree,
      receipt.sourceTasksCommit,
    ].every((value) => typeof value === 'string' && SHA.test(value)) ||
    receipt.evidenceRef !== docsEvidenceRef(feature, receipt.sourceTip) ||
    !Array.isArray(receipt.allowedPaths) ||
    !receipt.allowedPaths.every(isSafeDocsIntegrationPath) ||
    !['off', 'warn', 'strict'].includes(receipt.taskCommitGate) ||
    (receipt.code &&
      (!['local-ff', 'local-squash'].includes(receipt.code.strategy) ||
        ![
          receipt.code.sourceTip,
          receipt.code.sourceTree,
          receipt.code.integratedCommit,
          receipt.code.integratedTree,
        ].every((value) => typeof value === 'string' && SHA.test(value)) ||
        typeof receipt.code.checksHash !== 'string'))
  ) {
    return fail(
      'DOCS_RECEIPT_INVALID',
      'Docs receipt identity, strategy, source metadata, or allowed paths are invalid.'
    );
  }
  const scope = resolveFeatureCommitScope({
    issueNumber: feature.issueNumber,
    featureId: feature.id,
    workflowMode: receipt.workflowMode,
  });
  if (lines[0] !== `docs(${scope}): integrate ${feature.slug} documentation`)
    return fail(
      'DOCS_RECEIPT_INVALID',
      'Docs receipt does not use the canonical Feature commit scope.'
    );
  if (receipt.strategy !== strategy)
    return fail(
      'DOCS_STRATEGY_CHANGED',
      `Recorded docs strategy ${receipt.strategy} differs from current effective strategy ${strategy}. Restore the recorded policy or explicitly reconcile the integration; history was preserved.`
    );
  if (
    (workflowMode && receipt.workflowMode !== workflowMode) ||
    (receipt.workflowMode === 'local' && !receipt.code)
  )
    return fail(
      'DOCS_STRATEGY_CHANGED',
      'Recorded docs workflow mode/code verification differs from the current configuration. Restore the recorded policy before cleanup.'
    );
  const parents = (
    runGitCapture(['show', '-s', '--format=%P', commit], root) ?? ''
  )
    .split(' ')
    .filter(Boolean);
  const expectedParent =
    receipt.strategy === 'local-squash' ? receipt.baseTip : receipt.sourceTip;
  if (
    parents.length !== 1 ||
    parents[0] !== expectedParent ||
    runGitCapture(['rev-parse', `${commit}^{tree}`], root) !==
      receipt.integratedTree ||
    receipt.integratedTree !== receipt.sourceTree ||
    !isDocsAncestor(root, receipt.originalBaseTip, receipt.baseTip)
  ) {
    return fail(
      'DOCS_RECEIPT_TREE_MISMATCH',
      'Docs receipt parent, original base, or integrated tree does not match the integration commit.'
    );
  }
  const portable =
    receipt.strategy === 'local-squash'
      ? docsPortableEvidenceRef(feature, receipt.sourceTip)
      : undefined;
  if (receipt.portableEvidenceRef !== portable)
    return fail(
      'DOCS_RECEIPT_INVALID',
      'Docs portable evidence ref does not match the verified source tip.'
    );
  let evidence = runGitCapture(
    ['rev-parse', '--verify', `${receipt.evidenceRef}^{commit}`],
    root
  );
  if (!evidence) {
    // Restore only from local, immutable transport evidence (or ff ancestry).
    // Stage inspection never fetches or pushes a remote repository.
    const localSource = portable
      ? runGitCapture(['rev-parse', '--verify', `${portable}^{commit}`], root)
      : isDocsAncestor(root, receipt.sourceTip, commit)
        ? receipt.sourceTip
        : undefined;
    if (localSource === receipt.sourceTip) {
      try {
        runGitOrThrow(
          ['update-ref', receipt.evidenceRef, receipt.sourceTip, ''],
          root
        );
      } catch {
        // Another reader can restore the same immutable ref concurrently.
        // Inspect its value; never overwrite a different source.
      }
      evidence = runGitCapture(
        ['rev-parse', '--verify', `${receipt.evidenceRef}^{commit}`],
        root
      );
    }
  }
  if (evidence !== receipt.sourceTip)
    return fail(
      'DOCS_EVIDENCE_MISSING',
      `Original docs source evidence is missing or differs from the receipt. Restore ${receipt.evidenceRef} and ${portable || 'the reachable ff source'} at ${receipt.sourceTip} before cleanup; no remote fetch was performed.`
    );
  if (
    portable &&
    runGitCapture(['rev-parse', '--verify', `${portable}^{commit}`], root) !==
      receipt.sourceTip
  )
    return fail(
      'DOCS_EVIDENCE_MISSING',
      `Portable docs source evidence is missing or changed. Restore ${portable} at ${receipt.sourceTip} before cleanup.`
    );
  if (
    runGitCapture(['rev-parse', `${receipt.sourceTip}^{tree}`], root) !==
      receipt.sourceTree ||
    !isDocsAncestor(root, receipt.baseTip, receipt.sourceTip)
  ) {
    return fail(
      'DOCS_SOURCE_TREE_MISMATCH',
      'Original docs source tree or base ancestry differs from the receipt.'
    );
  }
  // Resolve against the primary repo, rather than assuming docs is its root.
  const taskPath = path.posix.join(
    docsRelative,
    feature.docs.featurePathFromDocs.replace(/\\/gu, '/'),
    'tasks.md'
  );
  const tasksCommit = runGitCapture(
    ['rev-list', '-n', '1', receipt.sourceTip, '--', taskPath],
    root
  );
  if (tasksCommit !== receipt.sourceTasksCommit)
    return fail(
      'DOCS_TASK_CHECKPOINT_MISMATCH',
      'The recorded task checkpoint does not match the preserved source history.'
    );
  try {
    const approved = approvedDocsIntegrationPaths(
      root,
      feature,
      receipt.sourceTip,
      docsRelative
    );
    if (
      JSON.stringify([...receipt.allowedPaths].sort()) !==
      JSON.stringify(approved)
    ) {
      return fail(
        'DOCS_RECEIPT_SCOPE_MISMATCH',
        'Recorded docs scope differs from the preserved approved Plan and task Docs entries.'
      );
    }
  } catch {
    return fail(
      'DOCS_RECEIPT_SCOPE_MISMATCH',
      'Preserved docs scope cannot be validated against its Plan and tasks.'
    );
  }
  const changed = (
    runGitCapture(
      ['diff', '--name-only', '-z', receipt.baseTip, receipt.sourceTip],
      root
    ) ?? ''
  )
    .split('\0')
    .filter(Boolean);
  if (
    changed.some(
      (file) =>
        !receipt.allowedPaths.some(
          (allowed) =>
            file === allowed ||
            (allowed.endsWith('/') && file.startsWith(allowed))
        )
    )
  ) {
    return fail(
      'DOCS_RECEIPT_SCOPE_MISMATCH',
      'Docs integration changes paths outside its recorded approved scope.'
    );
  }
  if (
    pendingTip &&
    pendingTip !== receipt.sourceTip &&
    !(receipt.strategy === 'local-ff' && pendingTip === commit)
  ) {
    return fail(
      'DOCS_SOURCE_CHANGED',
      'The docs workspace tip changed after integration. Existing changes were preserved; inspect them before cleanup.'
    );
  }
  return { integrated: true, integratedCommit: commit, receipt };
}

export function approvedDocsIntegrationPaths(
  root: string,
  feature: ResolvedFeature,
  sourceTip: string,
  docsRelative: string
): string[] {
  const prefix = path.posix.join(
    docsRelative,
    feature.docs.featurePathFromDocs.replace(/\\/gu, '/')
  );
  const paths = [
    'spec.md',
    'plan.md',
    'tasks.md',
    'decisions.md',
    'issue.md',
    'pr.md',
    '.feature.json',
  ].map((file) => `${prefix}/${file}`);
  paths.push(`${prefix}/artifacts/`);
  const plan =
    runGitCapture(['show', `${sourceTip}:${prefix}/plan.md`], root) ?? '';
  const tasks =
    runGitCapture(['show', `${sourceTip}:${prefix}/tasks.md`], root) ?? '';
  const impact = parseCuratedDocumentationImpact(plan);
  const lines = tasks.split('\n');
  const linked = new Set(
    lines.flatMap((line, index) =>
      /^\s*-\s*\[(?:TODO|DOING|DONE|REVIEW)\]/iu.test(line)
        ? parseTaskDocumentationTargets(lines, index)
        : []
    )
  );
  if (
    impact.targets.length > 0 &&
    (!impact.valid ||
      !impact.complete ||
      !/^\s*-\s*\*\*(?:Status|상태)\*\*:\s*Approved\s*$/im.test(plan))
  ) {
    throw new Error(
      'Docs targets require an approved, complete Curated Documentation Impact assessment.'
    );
  }
  for (const target of impact.targets) {
    if (!target.startsWith('docs:')) continue;
    if (!isValidDocumentationTarget(target) || !linked.has(target))
      throw new Error(`Docs target is invalid or unlinked: ${target}`);
    const relative = target.slice('docs:'.length);
    if (/^(?:features|ideas|scripts|openwiki)(?:\/|$)/iu.test(relative))
      throw new Error(`Target is outside curated shared docs: ${target}`);
    const repoPath = path.posix.join(docsRelative, relative);
    if (!isSafeDocsIntegrationPath(repoPath))
      throw new Error(`Unsafe docs target: ${target}`);
    const directory = runGitCapture(
      ['ls-tree', sourceTip, '--', repoPath],
      root
    )?.startsWith('040000 ');
    paths.push(`${repoPath}${directory ? '/' : ''}`);
  }
  return [...new Set(paths)].sort();
}

export function isSafeDocsIntegrationPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.split('/').some((segment) => segment === '..' || segment === '.')
  );
}

export function isDocsAncestor(
  root: string,
  ancestor: string,
  descendant: string
): boolean {
  return (
    runGitCapture(
      ['merge-base', '--is-ancestor', ancestor, descendant],
      root
    ) !== undefined
  );
}

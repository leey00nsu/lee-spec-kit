export const PROJECT_COMMIT_TYPES = [
  'feat',
  'fix',
  'refactor',
  'test',
  'style',
  'chore',
] as const;

export type CommitWorkflowMode = 'github' | 'local' | undefined;

export function resolveFeatureCommitScope(input: {
  issueNumber?: number | null;
  featureId?: string | null;
  workflowMode?: CommitWorkflowMode;
}): string | null {
  const issueNumber = Number(input.issueNumber || 0);
  if (Number.isInteger(issueNumber) && issueNumber > 0) {
    return `#${issueNumber}`;
  }

  if (input.workflowMode !== 'local') {
    return null;
  }

  const featureId = String(input.featureId || '').trim().toUpperCase();
  return /^F\d{3,}$/.test(featureId) ? featureId : null;
}

export function matchesProjectCommitConvention(
  message: string | undefined,
  scope: string
): boolean {
  return matchesCommitConvention(message, scope, PROJECT_COMMIT_TYPES);
}

export function matchesDocsCommitConvention(
  message: string | undefined,
  scope: string
): boolean {
  return matchesCommitConvention(message, scope, ['docs']);
}

function matchesCommitConvention(
  message: string | undefined,
  scope: string,
  types: readonly string[]
): boolean {
  const normalized = String(message || '').trim();
  const normalizedScope = String(scope || '').trim();
  if (!normalized || !normalizedScope) return false;

  const typePattern = types.join('|');
  const match = normalized.match(
    new RegExp(`^(${typePattern})\\((#[0-9]+|F[0-9]{3,})\\):\\s+\\S.+$`, 'i')
  );
  if (!match) return false;
  return match[2].toLowerCase() === normalizedScope.toLowerCase();
}

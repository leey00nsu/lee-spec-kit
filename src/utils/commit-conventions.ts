const PROJECT_COMMIT_PREFIX_PATTERN =
  /^(feat|fix|refactor|test|chore)\(#(\d+)\):\s+\S.+$/i;
const DOCS_COMMIT_PREFIX_PATTERN = /^docs\(#(\d+)\):\s+\S.+$/i;

export function matchesProjectCommitConvention(
  message: string | undefined,
  issueNumber: number
): boolean {
  const normalized = String(message || '').trim();
  if (!normalized) return false;
  const match = normalized.match(PROJECT_COMMIT_PREFIX_PATTERN);
  if (!match) return false;
  return Number(match[2]) === issueNumber;
}

export function matchesDocsCommitConvention(
  message: string | undefined,
  issueNumber: number
): boolean {
  const normalized = String(message || '').trim();
  if (!normalized) return false;
  const match = normalized.match(DOCS_COMMIT_PREFIX_PATTERN);
  if (!match) return false;
  return Number(match[1]) === issueNumber;
}

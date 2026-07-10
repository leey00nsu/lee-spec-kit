import fs from 'node:fs';
import path from 'node:path';

interface PrePrEvidenceCheck {
  readonly docsDir: string;
  readonly featureDir: string;
  readonly evidence: string | null;
  readonly evidenceMode: 'any' | 'path_required' | undefined;
}

function isSameOrWithin(parentDir: string, candidatePath: string): boolean {
  const relative = path.relative(parentDir, candidatePath);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

export function isPrePrEvidenceSatisfied(
  check: PrePrEvidenceCheck
): boolean {
  const evidence = check.evidence?.trim();
  if (!evidence) return false;
  if (check.evidenceMode === 'any') return true;

  const docsDir = path.resolve(check.docsDir);
  const candidates = new Set<string>();
  if (path.isAbsolute(evidence)) {
    candidates.add(path.resolve(evidence));
  } else {
    candidates.add(path.resolve(docsDir, evidence));
    candidates.add(path.resolve(check.featureDir, evidence));
    if (path.basename(docsDir) === 'docs' && evidence.startsWith('docs/')) {
      candidates.add(path.resolve(path.dirname(docsDir), evidence));
    }
  }

  const realDocsDir = fs.realpathSync(docsDir);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const realCandidate = fs.realpathSync(candidate);
    if (!isSameOrWithin(realDocsDir, realCandidate)) continue;
    if (fs.statSync(realCandidate).isFile()) return true;
  }
  return false;
}

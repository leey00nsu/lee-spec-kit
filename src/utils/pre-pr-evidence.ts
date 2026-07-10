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

  const normalizedEvidence = evidence.replaceAll('\\', '/');
  const docsDir = path.resolve(check.docsDir);
  const candidates = new Set<string>();
  if (path.isAbsolute(normalizedEvidence)) {
    candidates.add(path.resolve(normalizedEvidence));
  } else {
    candidates.add(path.resolve(docsDir, normalizedEvidence));
    candidates.add(path.resolve(check.featureDir, normalizedEvidence));

    const [evidenceRoot, ...evidenceParts] = normalizedEvidence.split('/');
    if (
      evidenceRoot?.toLowerCase() === path.basename(docsDir).toLowerCase() &&
      evidenceParts.length > 0
    ) {
      candidates.add(path.resolve(docsDir, ...evidenceParts));
    }
  }

  let realDocsDir: string;
  try {
    realDocsDir = fs.realpathSync(docsDir);
  } catch {
    return false;
  }

  for (const candidate of candidates) {
    try {
      const realCandidate = fs.realpathSync(candidate);
      if (!isSameOrWithin(realDocsDir, realCandidate)) continue;
      if (fs.statSync(realCandidate).isFile()) return true;
    } catch {
      continue;
    }
  }
  return false;
}

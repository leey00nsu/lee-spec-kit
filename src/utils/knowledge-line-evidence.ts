import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/u;

/** OpenWiki 0.5 repo-lines-v1 uses URI lines as hints, not fixed coordinates.
 * Accept relocation only when exact versioned bytes have one unambiguous match.
 * Changed content between matching anchors is NOT sufficient for validation.
 */
export function matchesKnowledgeLineEvidence(
  lines: string[],
  start: number,
  end: number,
  expectedHash: string,
  version: string
): boolean {
  let metadata: Record<string, unknown> | undefined;
  try {
    const raw = version.split(':')[3];
    const parsed = JSON.parse(
      Buffer.from(raw || '', 'base64url').toString('utf8')
    );
    const hashes = [
      'firstSelectedLineHash',
      'lastSelectedLineHash',
      'precedingContextHash',
      'followingContextHash',
    ];
    if (
      parsed &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 7 &&
      Number.isSafeInteger(parsed.selectedLineCount) &&
      parsed.selectedLineCount > 0 &&
      ['precedingContextLineCount', 'followingContextLineCount'].every(
        (key) =>
          Number.isSafeInteger(parsed[key]) &&
          parsed[key] >= 0 &&
          parsed[key] <= 3
      ) &&
      hashes.every(
        (key) =>
          typeof parsed[key] === 'string' && hashPattern.test(parsed[key])
      )
    )
      metadata = parsed;
  } catch {
    /* Legacy opaque suffixes do not authorize relocation. */
  }
  const size = metadata ? Number(metadata.selectedLineCount) : end - start + 1;
  if (
    end <= lines.length &&
    end - start + 1 === size &&
    digest(lines.slice(start - 1, end).join('')) === expectedHash
  )
    return true;
  if (!metadata || size > lines.length) return false;
  const candidates: number[] = [];
  const hashes = lines.map(digest);
  for (let offset = 0; offset + size <= lines.length; offset++) {
    if (
      hashes[offset] === metadata.firstSelectedLineHash &&
      hashes[offset + size - 1] === metadata.lastSelectedLineHash &&
      digest(lines.slice(offset, offset + size).join('')) === expectedHash
    )
      candidates.push(offset);
  }
  if (candidates.length === 1) return true;
  const before = Number(metadata.precedingContextLineCount);
  const after = Number(metadata.followingContextLineCount);
  return (
    candidates.filter((offset) => {
      const finish = offset + size;
      const left =
        before === 0
          ? offset === 0
          : offset >= before &&
            digest(lines.slice(offset - before, offset).join('')) ===
              metadata.precedingContextHash;
      const right =
        after === 0
          ? finish === lines.length
          : finish + after <= lines.length &&
            digest(lines.slice(finish, finish + after).join('')) ===
              metadata.followingContextHash;
      return left && right;
    }).length === 1
  );
}

function isAffirmativeApprovalReply(input: string): boolean {
  const raw = input.trim();
  if (!raw) return false;

  if (
    /\b(?:no|don'?t|do not|stop|cancel|hold|wait|아니|취소|중지|보류)\b/i.test(raw)
  ) {
    return false;
  }

  return /(?:^|[\s`"'([{<])(?:ok|okay|yes|y|go|proceed|continue|run|execute|approve(?:d)?|진행(?:해|하세요)?|수행(?:해|하세요)?|실행(?:해|하세요)?|승인(?:해|하세요)?|해줘|해주세요|오케이)(?:$|[\s`"')\]}>.!?,])/i.test(
    raw
  );
}

export function parseApprovalLabel(input: string, validLabels: string[]): string | null {
  const normalized = input.trim().toUpperCase();
  if (!normalized) return null;

  const normalizedLabels = validLabels
    .map((label) => label.trim().toUpperCase())
    .filter(Boolean);
  const validSet = new Set(normalizedLabels);
  if (validSet.size === 0) return null;

  // Prefer label-first replies: "A", "A OK", "A proceed", "A 진행해"
  const leading = normalized.match(/^[`"'([{<\s]*([A-Z]+)\b/);
  if (leading && validSet.has(leading[1])) return leading[1];

  // Fallback: allow natural sentences that include a valid label token.
  const tokens = normalized.match(/[A-Z]+/g) || [];
  for (const token of tokens) {
    if (validSet.has(token)) return token;
  }

  // UX fallback:
  // When there is only one available label, accept plain affirmative replies
  // like "진행해", "수행하세요", "proceed" without requiring "A" token.
  if (normalizedLabels.length === 1 && isAffirmativeApprovalReply(input)) {
    return normalizedLabels[0];
  }
  return null;
}

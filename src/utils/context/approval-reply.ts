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

export interface ParsedApprovalReply {
  label: string;
  requestText?: string;
}

function normalizeRequestText(raw: string): string {
  return raw.replace(/^[\s,;:]+/, '').trim();
}

export function parseApprovalReply(
  input: string,
  validLabels: string[]
): ParsedApprovalReply | null {
  const raw = input.trim();
  if (!raw) return null;
  const normalized = raw.toUpperCase();

  const normalizedLabels = validLabels
    .map((label) => label.trim().toUpperCase())
    .filter(Boolean);
  const validSet = new Set(normalizedLabels);
  if (validSet.size === 0) return null;

  // Prefer label-first replies: "A", "A OK", "A proceed", "A 진행해"
  const leading = raw.match(/^[`"'([{<\s]*([A-Za-z]+)\b/);
  if (leading) {
    const label = leading[1].toUpperCase();
    if (validSet.has(label)) {
      const requestText = normalizeRequestText(raw.slice(leading[0].length));
      return requestText ? { label, requestText } : { label };
    }
  }

  // Fallback: allow natural sentences that include a valid label token.
  const tokens = normalized.match(/[A-Z]+/g) || [];
  for (const token of tokens) {
    if (validSet.has(token)) return { label: token };
  }

  // UX fallback:
  // When there is only one available label, accept plain affirmative replies
  // like "진행해", "수행하세요", "proceed" without requiring "A" token.
  if (normalizedLabels.length === 1 && isAffirmativeApprovalReply(input)) {
    return { label: normalizedLabels[0] };
  }
  return null;
}

export function parseApprovalLabel(input: string, validLabels: string[]): string | null {
  return parseApprovalReply(input, validLabels)?.label ?? null;
}

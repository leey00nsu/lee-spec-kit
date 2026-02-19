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

  return null;
}

export function parseApprovalLabel(input: string, validLabels: string[]): string | null {
  return parseApprovalReply(input, validLabels)?.label ?? null;
}

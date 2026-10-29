export interface SpecClarificationQuestion {
  id: string;
  title: string;
  status: 'OPEN' | 'RESOLVED' | 'DELEGATED' | 'DEFERRED' | null;
  question: string | null;
  options: string | null;
  recommendation: string | null;
  answer: string | null;
  decision: string | null;
  specRefs: string | null;
}

export interface SpecClarification {
  enabled: boolean;
  status: 'pending' | 'complete' | 'legacy' | 'invalid';
  summary: string | null;
  questions: SpecClarificationQuestion[];
  openQuestionIds: string[];
  errors: string[];
  ready: boolean;
}

// Examples in templates are not workflow state. Support both Markdown fence
// styles, including longer fences containing shorter ones, and HTML comments.
function proseOnly(content: string): string {
  let fence: { character: string; length: number } | undefined;
  let inComment = false;
  return content
    .split(/\r?\n/)
    .map((line) => {
      const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (
          match &&
          match[1][0] === fence.character &&
          match[1].length >= fence.length &&
          !match[2].trim()
        )
          fence = undefined;
        return '';
      }
      if (match && !inComment) {
        fence = { character: match[1][0], length: match[1].length };
        return '';
      }
      let visible = '';
      let offset = 0;
      while (offset < line.length) {
        const marker = line.indexOf(inComment ? '-->' : '<!--', offset);
        if (marker === -1) {
          if (!inComment) visible += line.slice(offset);
          break;
        }
        if (!inComment) visible += line.slice(offset, marker);
        offset = marker + (inComment ? 3 : 4);
        inComment = !inComment;
      }
      return visible;
    })
    .join('\n');
}

function field(
  content: string,
  labels: string[],
  errors: string[],
  context: string
): string | null {
  const escaped = labels.map((label) =>
    label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const matches = [
    ...content.matchAll(
      new RegExp(
        `^[ \\t]*-[ \\t]+\\*\\*(?:${escaped.join('|')})\\*\\*:[ \\t]*(.*)$`,
        'gmi'
      )
    ),
  ];
  if (matches.length > 1)
    errors.push(`${context}: duplicate ${labels[0]} fields.`);
  return matches[0]?.[1].trim() ?? null;
}

function hasValue(value: string | null): value is string {
  return (
    value !== null &&
    value.length > 0 &&
    !/^(?:[-–—]|\.{3}|…|tbd|todo|pending|n\/a|none|미정|미확인|없음)$/i.test(
      value
    ) &&
    !/^\{[\p{L}\p{N}\s_/-]+\}$/u.test(value) &&
    !/^<[^>]+>$/.test(value)
  );
}

/** Validate recorded decisions, not whether an interview was exhaustive or its
 * claimed user answers were actually authorized. Those remain agent duties. */
export function parseSpecClarification(
  spec: string,
  decisions: string
): SpecClarification {
  const errors: string[] = [];
  const specProse = proseOnly(spec);
  const statusRaw = field(
    specProse,
    ['Clarification Status', '결정 점검 상태'],
    errors,
    'Spec'
  );
  const summary = field(
    specProse,
    ['Clarification Summary', '결정 점검 요약'],
    errors,
    'Spec'
  );
  const decisionsProse = proseOnly(decisions);
  const headings = [...decisionsProse.matchAll(/^#{1,6}[ \t]+(.*)$/gm)];
  const questions: SpecClarificationQuestion[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (!/^SC-/i.test(heading[1])) continue;
    const match = /^(SC-(\d+)):[ \t]*(.*)$/i.exec(heading[1]);
    if (!match || !match[3].trim()) {
      errors.push(
        `Invalid clarification heading: ${heading[1]}. Use SC-01: title.`
      );
      continue;
    }
    const id = `SC-${match[2].replace(/^0+(?=\d)/, '').padStart(2, '0')}`;
    if (ids.has(id)) errors.push(`Duplicate clarification ID: ${id}.`);
    ids.add(id);
    const block = decisionsProse.slice(
      (heading.index ?? 0) + heading[0].length,
      headings[index + 1]?.index ?? decisionsProse.length
    );
    const read = (labels: string[]) => field(block, labels, errors, id);
    const raw = read(['Status', '상태'])?.toUpperCase();
    const status =
      raw === 'OPEN' ||
      raw === 'RESOLVED' ||
      raw === 'DELEGATED' ||
      raw === 'DEFERRED'
        ? raw
        : null;
    if (!status)
      errors.push(
        `${id}: Status must be OPEN, RESOLVED, DELEGATED, or DEFERRED.`
      );
    const question: SpecClarificationQuestion = {
      id,
      title: match[3].trim(),
      status,
      question: read(['Question', '질문']),
      options: read(['Options', '선택지']),
      recommendation: read(['Recommendation', '추천']),
      answer: read(['Answer', '답변']),
      decision: read(['Decision', '결정']),
      specRefs: read(['Spec Refs', 'Spec 반영']),
    };
    for (const [label, value] of [
      ['Question', question.question],
      ['Options', question.options],
      ['Recommendation', question.recommendation],
      ...(status && status !== 'OPEN'
        ? [
            ['Answer', question.answer],
            ['Decision', question.decision],
            ['Spec Refs', question.specRefs],
          ]
        : []),
    ]) {
      if (!hasValue(value))
        errors.push(`${id}: ${label} requires a non-placeholder value.`);
    }
    questions.push(question);
  }
  const enabled =
    statusRaw !== null ||
    summary !== null ||
    questions.length > 0 ||
    errors.length > 0;
  if (!enabled)
    return {
      enabled: false,
      status: 'legacy',
      summary: null,
      questions: [],
      openQuestionIds: [],
      errors: [],
      ready: true,
    };
  const normalized = statusRaw?.toLowerCase();
  const status =
    normalized === 'pending' || normalized === 'complete'
      ? normalized
      : 'invalid';
  if (status === 'invalid')
    errors.push('Spec: Clarification Status must be Pending or Complete.');
  if (status === 'complete' && !hasValue(summary)) {
    errors.push(
      'Spec: Complete clarification requires a non-placeholder Clarification Summary.'
    );
  }
  const openQuestionIds = questions
    .filter((question) => question.status === 'OPEN')
    .map((question) => question.id);
  return {
    enabled,
    status,
    summary,
    questions,
    openQuestionIds,
    errors,
    ready:
      status === 'complete' &&
      openQuestionIds.length === 0 &&
      errors.length === 0,
  };
}

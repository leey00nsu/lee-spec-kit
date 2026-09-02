import path from 'node:path';

export const CURATED_IMPACT_HEADING = 'Curated Documentation Impact';

export type DocumentationImpactDecision = 'NONE' | 'UPDATE' | 'ADD';

export interface CuratedDocumentationImpact {
  present: boolean;
  complete: boolean;
  decisions: {
    productRequirements: DocumentationImpactDecision | null;
    systemArchitecture: DocumentationImpactDecision | null;
    onboardingEntrypoint: DocumentationImpactDecision | null;
    operationalRuntimeContract: DocumentationImpactDecision | null;
  };
  reason: string | null;
  targets: string[];
  valid: boolean;
  errors: string[];
}

export function parseCuratedDocumentationImpact(
  content: string
): CuratedDocumentationImpact {
  const section = extractSecondLevelSection(content, CURATED_IMPACT_HEADING);
  if (!section) {
    return {
      present: false,
      complete: false,
      decisions: emptyDecisions(),
      reason: null,
      targets: [],
      valid: false,
      errors: [`Missing \`## ${CURATED_IMPACT_HEADING}\` section.`],
    };
  }

  const assessment = field(section, 'Assessment')?.toLowerCase() || '';
  const decisions = {
    productRequirements: decision(field(section, 'Product requirements')),
    systemArchitecture: decision(field(section, 'System architecture')),
    onboardingEntrypoint: decision(field(section, 'Onboarding entrypoint')),
    operationalRuntimeContract: decision(
      field(section, 'Operational/runtime contract')
    ),
  };
  const reason = cleanValue(field(section, 'Reason'));
  const rawTargets = cleanValue(field(section, 'Targets'));
  const targets = rawTargets
    ? [...new Set(rawTargets.split(',').map(normalizeDocumentationTarget).filter(Boolean))]
    : [];
  const errors: string[] = [];
  if (assessment !== 'complete') {
    errors.push('Assessment must be Complete.');
  }
  for (const [surface, value] of Object.entries(decisions)) {
    if (!value) errors.push(`${surface} must be NONE, UPDATE, or ADD.`);
  }
  if (!reason || isPlaceholder(reason)) {
    errors.push('Reason must explain the project-wide documentation decision.');
  }
  const invalidTargets = targets.filter((target) => !isValidDocumentationTarget(target));
  if (invalidTargets.length > 0) {
    errors.push(`Invalid documentation targets: ${invalidTargets.join(', ')}`);
  }
  const requiresTargets = Object.values(decisions).some(
    (value) => value === 'UPDATE' || value === 'ADD'
  );
  if (requiresTargets && targets.length === 0) {
    errors.push('UPDATE or ADD decisions require at least one namespaced target.');
  }
  if (!requiresTargets && targets.length > 0) {
    errors.push('Targets must be empty when every documentation decision is NONE.');
  }

  return {
    present: true,
    complete: assessment === 'complete',
    decisions,
    reason,
    targets,
    valid: errors.length === 0,
    errors,
  };
}

export function parseTaskDocumentationTargets(
  lines: string[],
  taskLineIndex: number
): string[] {
  let endIndex = lines.length;
  for (let index = taskLineIndex + 1; index < lines.length; index += 1) {
    if (/^\s*-\s*\[(?:TODO|DOING|DONE|REVIEW)\]/i.test(lines[index]) || /^\s*##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }

  let docsIndex = -1;
  let docsIndent = 0;
  for (let index = taskLineIndex + 1; index < endIndex; index += 1) {
    if (/^\s*-\s+(?:\*\*)?Docs(?:\*\*)?:\s*$/i.test(lines[index])) {
      docsIndex = index;
      docsIndent = leadingSpaces(lines[index]);
      break;
    }
  }
  if (docsIndex < 0) return [];

  const targets: string[] = [];
  for (let index = docsIndex + 1; index < endIndex; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (leadingSpaces(line) <= docsIndent && /^\s*-\s+/.test(line)) break;
    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (!match) continue;
    const target = normalizeDocumentationTarget(match[1]);
    if (target) targets.push(target);
  }
  return [...new Set(targets)];
}

export function normalizeDocumentationTarget(value: string): string {
  return value
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

export function isValidDocumentationTarget(value: string): boolean {
  const normalized = normalizeDocumentationTarget(value);
  const match = normalized.match(/^(docs|project):(.+)$/);
  if (!match) return false;
  const relativePath = match[2].trim();
  if (!relativePath || path.posix.isAbsolute(relativePath)) return false;
  const normalizedPath = path.posix.normalize(relativePath);
  if (
    match[1] === 'docs' &&
    (normalizedPath === 'features' || normalizedPath.startsWith('features/'))
  ) {
    return false;
  }
  if (
    match[1] === 'project' &&
    (normalizedPath === 'openwiki' ||
      normalizedPath.startsWith('openwiki/') ||
      normalizedPath === '.lee-spec-kit' ||
      normalizedPath.startsWith('.lee-spec-kit/'))
  ) {
    return false;
  }
  return (
    normalizedPath !== '..' &&
    !normalizedPath.startsWith('../') &&
    normalizedPath !== '.'
  );
}

function extractSecondLevelSection(content: string, heading: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const expected = `## ${heading}`.toLowerCase();
  const start = lines.findIndex((line) => line.trim().toLowerCase() === expected);
  if (start < 0) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function field(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(
    new RegExp(`^\\s*-\\s*\\*\\*${escaped}\\*\\*:\\s*(.*?)\\s*$`, 'mi')
  );
  return match?.[1]?.trim() || null;
}

function decision(value: string | null): DocumentationImpactDecision | null {
  const normalized = cleanValue(value)?.toUpperCase();
  return normalized === 'NONE' || normalized === 'UPDATE' || normalized === 'ADD'
    ? normalized
    : null;
}

function cleanValue(value: string | null): string | null {
  const normalized = (value || '').trim().replace(/^`|`$/g, '');
  return !normalized || normalized === '-' ? null : normalized;
}

function isPlaceholder(value: string): boolean {
  return /^(todo|tbd|pending|reason|이유)$/i.test(value.trim()) || /^\(.+\)$/.test(value.trim());
}

function emptyDecisions(): CuratedDocumentationImpact['decisions'] {
  return {
    productRequirements: null,
    systemArchitecture: null,
    onboardingEntrypoint: null,
    operationalRuntimeContract: null,
  };
}

function leadingSpaces(value: string): number {
  return value.match(/^(\s*)/)?.[1]?.length || 0;
}

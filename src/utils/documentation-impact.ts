import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';

export const CURATED_IMPACT_HEADING = 'Curated Documentation Impact';
export const ADDITIONAL_CURATED_IMPACT_HEADING = 'Additional Curated Impacts';
export const CURATED_IMPACT_SCHEMA_VERSION = 2;
export const CURATED_IMPACT_GRANDFATHER_MARKER =
  '<!-- lee-spec-kit:curated-impact-grandfathered v0.9.10 -->';
export const CURATED_IMPACT_GRANDFATHER_PATTERN =
  /<!--\s*lee-spec-kit:curated-impact-grandfathered\s+v2\s+feature-docs=(sha256:[a-f0-9]{64})\s*-->/iu;

const CURATED_IMPACT_GRANDFATHER_ALL_PATTERN =
  /<!--\s*lee-spec-kit:curated-impact-grandfathered\s+v2\s+feature-docs=(sha256:[a-f0-9]{64})\s*-->/giu;

const ANY_CURATED_IMPACT_GRANDFATHER_PATTERN =
  /<!--\s*lee-spec-kit:curated-impact-grandfathered\b[^>]*-->/giu;
const FEATURE_FINGERPRINT_FILES = [
  'spec.md',
  'plan.md',
  'tasks.md',
  'decisions.md',
] as const;

export type DocumentationImpactDecision = 'NONE' | 'UPDATE' | 'ADD';
export type AdditionalDocumentationImpactDecision = 'NONE' | 'DECLARED';
export type AdditionalCuratedImpactKind =
  | 'engineering-agent-policy'
  | 'design-system-ux'
  | 'api-data-contract'
  | 'security-privacy'
  | 'release-deployment'
  | 'observability'
  | 'other-curated';
export type CuratedImpactSchemaStatus =
  | 'current-v2'
  | 'legacy-v1-complete'
  | 'partial'
  | 'missing'
  | 'grandfathered';

export interface AdditionalCuratedImpact {
  kind: AdditionalCuratedImpactKind;
  decision: 'UPDATE' | 'ADD';
  target: string;
  reason: string;
}

export interface CuratedDocumentationImpact {
  present: boolean;
  grandfathered: boolean;
  grandfatheredFingerprint: string | null;
  schemaVersion: number | null;
  schemaStatus: CuratedImpactSchemaStatus;
  complete: boolean;
  decisions: {
    productRequirements: DocumentationImpactDecision | null;
    systemArchitecture: DocumentationImpactDecision | null;
    onboardingEntrypoint: DocumentationImpactDecision | null;
    operationalRuntimeContract: DocumentationImpactDecision | null;
  };
  additional: {
    present: boolean;
    complete: boolean;
    decision: AdditionalDocumentationImpactDecision | null;
    impacts: AdditionalCuratedImpact[];
  };
  reason: string | null;
  targets: string[];
  valid: boolean;
  errors: string[];
}

const ADDITIONAL_KINDS = new Set<AdditionalCuratedImpactKind>([
  'engineering-agent-policy',
  'design-system-ux',
  'api-data-contract',
  'security-privacy',
  'release-deployment',
  'observability',
  'other-curated',
]);

export function parseCuratedDocumentationImpact(
  content: string
): CuratedDocumentationImpact {
  const section = extractSecondLevelSection(content, CURATED_IMPACT_HEADING);
  const grandfatherMarkers =
    content.match(ANY_CURATED_IMPACT_GRANDFATHER_PATTERN) || [];
  const currentGrandfathers = [
    ...content.matchAll(CURATED_IMPACT_GRANDFATHER_ALL_PATTERN),
  ];
  const currentGrandfather = currentGrandfathers[0] || null;
  const hasAnyGrandfatherMarker = grandfatherMarkers.length > 0;
  const hasExactlyOneCurrentGrandfather =
    grandfatherMarkers.length === 1 && currentGrandfathers.length === 1;

  if (!section) {
    const grandfathered = hasExactlyOneCurrentGrandfather;
    return {
      present: false,
      grandfathered,
      grandfatheredFingerprint: currentGrandfather?.[1] || null,
      schemaVersion: null,
      schemaStatus: grandfathered ? 'grandfathered' : 'missing',
      complete: grandfathered,
      decisions: emptyDecisions(),
      additional: emptyAdditional(),
      reason: null,
      targets: [],
      valid: grandfathered,
      errors: grandfathered
        ? []
        : grandfatherMarkers.length > 1
          ? [
              'Exactly one provenance-bound v2 curated impact grandfather marker is required.',
            ]
          : [
              content.includes(CURATED_IMPACT_GRANDFATHER_MARKER)
                ? 'The legacy grandfather marker must be revalidated and replaced with a provenance-bound v2 marker.'
                : `Missing \`## ${CURATED_IMPACT_HEADING}\` section.`,
            ],
    };
  }

  const schemaVersion = parseSchemaVersion(field(section, 'Schema'));
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
  const coreTargets = parseTargetList(cleanValue(field(section, 'Targets')));
  const coreErrors = validateCoreImpact({
    assessment,
    decisions,
    reason,
    targets: coreTargets,
  });
  const legacyComplete = schemaVersion === null && coreErrors.length === 0;

  const additionalSection = extractSecondLevelSection(
    content,
    ADDITIONAL_CURATED_IMPACT_HEADING
  );
  const additional = parseAdditionalCuratedImpact(additionalSection);
  const errors: string[] = [];

  const provenanceGrandfatheredLegacy =
    hasExactlyOneCurrentGrandfather &&
    schemaVersion === null &&
    (legacyComplete || !section);
  if (grandfatherMarkers.length > 1) {
    errors.push(
      'Exactly one provenance-bound v2 curated impact grandfather marker is required.'
    );
  }
  if (hasAnyGrandfatherMarker && !provenanceGrandfatheredLegacy) {
    errors.push(
      'A Plan with an explicit impact assessment must not also carry a grandfather marker.'
    );
  }
  if (
    schemaVersion !== CURATED_IMPACT_SCHEMA_VERSION &&
    !provenanceGrandfatheredLegacy
  ) {
    errors.push(
      legacyComplete
        ? 'Legacy v1 impact assessment requires explicit v2 reassessment or terminal grandfathering.'
        : `Schema must be ${CURATED_IMPACT_SCHEMA_VERSION}.`
    );
  }
  errors.push(...coreErrors);
  if (schemaVersion === CURATED_IMPACT_SCHEMA_VERSION) {
    errors.push(...additional.errors);
  }

  const targets = [
    ...new Set([
      ...coreTargets,
      ...additional.impacts.map((impact) => impact.target),
    ]),
  ];
  const schemaStatus: CuratedImpactSchemaStatus = provenanceGrandfatheredLegacy
    ? 'grandfathered'
    : schemaVersion === CURATED_IMPACT_SCHEMA_VERSION &&
        coreErrors.length === 0 &&
        additional.errors.length === 0 &&
        !hasAnyGrandfatherMarker
      ? 'current-v2'
      : legacyComplete && !additional.present
        ? 'legacy-v1-complete'
        : 'partial';

  return {
    present: true,
    grandfathered: provenanceGrandfatheredLegacy,
    grandfatheredFingerprint: currentGrandfather?.[1] || null,
    schemaVersion,
    schemaStatus,
    complete:
      schemaStatus === 'grandfathered' ||
      (assessment === 'complete' &&
        additional.complete &&
        schemaStatus === 'current-v2'),
    decisions,
    additional: {
      present: additional.present,
      complete: additional.complete,
      decision: additional.decision,
      impacts: additional.impacts,
    },
    reason,
    targets,
    valid:
      errors.length === 0 &&
      (schemaStatus === 'current-v2' || schemaStatus === 'grandfathered'),
    errors,
  };
}

export function buildCuratedImpactGrandfatherMarker(
  featureDocsFingerprint: string
): string {
  if (!/^sha256:[a-f0-9]{64}$/u.test(featureDocsFingerprint)) {
    throw new Error('A valid feature documentation fingerprint is required.');
  }
  return `<!-- lee-spec-kit:curated-impact-grandfathered v2 feature-docs=${featureDocsFingerprint} -->`;
}

export async function computeFeatureDocumentationFingerprint(
  featurePath: string
): Promise<string> {
  const hash = createHash('sha256');
  for (const fileName of FEATURE_FINGERPRINT_FILES) {
    const absolutePath = path.join(featurePath, fileName);
    const content = (await fs.pathExists(absolutePath))
      ? await fs.readFile(absolutePath, 'utf-8')
      : '';
    hash.update(fileName);
    hash.update('\0');
    hash.update(removeCuratedImpactGrandfatherMarkers(content));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export function removeCuratedImpactGrandfatherMarkers(content: string): string {
  return content
    .replace(ANY_CURATED_IMPACT_GRANDFATHER_PATTERN, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trimEnd();
}

export function isTerminalFeatureForCuratedImpact(input: {
  spec: string;
  plan: string;
  tasks: string;
}): { terminal: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (metadataValue(input.spec, ['Status', '상태']) !== 'approved') {
    reasons.push('spec is not Approved');
  }
  if (metadataValue(input.plan, ['Status', '상태']) !== 'approved') {
    reasons.push('plan is not Approved');
  }
  if (metadataValue(input.tasks, ['Doc Status', '문서 상태']) !== 'approved') {
    reasons.push('tasks document is not Approved');
  }
  const taskList = withoutFencedCodeBlocks(input.tasks);
  if (!/^\s*-\s*\[DONE\]/imu.test(taskList)) {
    reasons.push('no DONE task exists');
  }
  if (/^\s*-\s*\[(?:TODO|DOING|REVIEW)\]/imu.test(taskList)) {
    reasons.push('an open task remains');
  }
  const completionChecks = [
    {
      marker: 'lee-spec-kit:completion:all-tasks',
      legacy: /(All tasks are|모든 태스크가)/iu,
    },
    {
      marker: 'lee-spec-kit:completion:tests',
      legacy: /(Tests executed and passing|테스트 실행 및 통과)/iu,
    },
    {
      marker: 'lee-spec-kit:completion:final-outcome',
      legacy:
        /(Final outcome shared and any required user confirmation recorded|Final user approval|최종 결과를 공유했고, 필요한 사용자 확인을 문서화된 workflow checkpoint 기준으로 기록함)/iu,
    },
  ];
  const taskLines = taskList.split('\n');
  for (const completion of completionChecks) {
    if (
      !hasCheckedCompletionLine(taskLines, completion.marker, completion.legacy)
    ) {
      reasons.push(`completion marker ${completion.marker} is not checked`);
    }
  }
  return { terminal: reasons.length === 0, reasons };
}

export function parseTaskDocumentationTargets(
  lines: string[],
  taskLineIndex: number
): string[] {
  let endIndex = lines.length;
  for (let index = taskLineIndex + 1; index < lines.length; index += 1) {
    if (
      /^\s*-\s*\[(?:TODO|DOING|DONE|REVIEW)\]/i.test(lines[index]) ||
      /^\s*##\s+/.test(lines[index])
    ) {
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
  const cleaned = value
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  const match = cleaned.match(/^(docs|project):(.*)$/u);
  if (!match) return cleaned;
  const relativePath = match[2].trim().replace(/^\.\//u, '');
  return `${match[1]}:${path.posix.normalize(relativePath)}`;
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

function validateCoreImpact(input: {
  assessment: string;
  decisions: CuratedDocumentationImpact['decisions'];
  reason: string | null;
  targets: string[];
}): string[] {
  const errors: string[] = [];
  if (input.assessment !== 'complete') {
    errors.push('Assessment must be Complete.');
  }
  for (const [surface, value] of Object.entries(input.decisions)) {
    if (!value) errors.push(`${surface} must be NONE, UPDATE, or ADD.`);
  }
  if (!input.reason || isPlaceholder(input.reason)) {
    errors.push('Reason must explain the project-wide documentation decision.');
  }
  const invalidTargets = input.targets.filter(
    (target) => !isValidDocumentationTarget(target)
  );
  if (invalidTargets.length > 0) {
    errors.push(`Invalid documentation targets: ${invalidTargets.join(', ')}`);
  }
  const requiresTargets = Object.values(input.decisions).some(
    (value) => value === 'UPDATE' || value === 'ADD'
  );
  if (requiresTargets && input.targets.length === 0) {
    errors.push(
      'UPDATE or ADD decisions require at least one namespaced target.'
    );
  }
  if (!requiresTargets && input.targets.length > 0) {
    errors.push(
      'Targets must be empty when every core documentation decision is NONE.'
    );
  }
  return errors;
}

function parseAdditionalCuratedImpact(content: string): {
  present: boolean;
  complete: boolean;
  decision: AdditionalDocumentationImpactDecision | null;
  impacts: AdditionalCuratedImpact[];
  errors: string[];
} {
  if (!content) {
    return {
      ...emptyAdditional(),
      errors: [`Missing \`## ${ADDITIONAL_CURATED_IMPACT_HEADING}\` section.`],
    };
  }
  const assessment = field(content, 'Assessment')?.toLowerCase() || '';
  const rawDecision = cleanValue(field(content, 'Decision'))?.toUpperCase();
  const additionalDecision =
    rawDecision === 'NONE' || rawDecision === 'DECLARED' ? rawDecision : null;
  const parsedTable = parseAdditionalImpactTable(content);
  const impacts = parsedTable.impacts;
  const errors: string[] = [...parsedTable.errors];
  if (assessment !== 'complete') {
    errors.push('Additional Curated Impacts Assessment must be Complete.');
  }
  if (!additionalDecision) {
    errors.push(
      'Additional Curated Impacts Decision must be NONE or DECLARED.'
    );
  }
  if (additionalDecision === 'NONE' && impacts.length > 0) {
    errors.push('Additional impact rows require Decision DECLARED.');
  }
  if (additionalDecision === 'DECLARED' && impacts.length === 0) {
    errors.push(
      'Decision DECLARED requires at least one additional impact row.'
    );
  }
  const duplicateTargets = impacts
    .map((impact) => impact.target)
    .filter((target, index, all) => all.indexOf(target) !== index);
  if (duplicateTargets.length > 0) {
    errors.push(
      `Additional impact targets must be unique: ${[
        ...new Set(duplicateTargets),
      ].join(', ')}`
    );
  }
  return {
    present: true,
    complete: assessment === 'complete',
    decision: additionalDecision,
    impacts,
    errors,
  };
}

function parseAdditionalImpactTable(content: string): {
  impacts: AdditionalCuratedImpact[];
  errors: string[];
} {
  const impacts: AdditionalCuratedImpact[] = [];
  const errors: string[] = [];
  for (const line of content.split('\n')) {
    if (!/^\s*\|/u.test(line)) continue;
    const cells = line
      .trim()
      .replace(/^\||\|$/gu, '')
      .split('|')
      .map((cell) => cell.trim().replace(/^`|`$/gu, ''));
    if (cells.length < 4) {
      errors.push(`Malformed additional impact row: ${line.trim()}`);
      continue;
    }
    const [rawKind, rawDecision, rawTarget, ...rawReason] = cells;
    if (/^kind$/iu.test(rawKind) || /^-+$/u.test(rawKind) || rawKind === '-') {
      continue;
    }
    const kind = rawKind.toLowerCase() as AdditionalCuratedImpactKind;
    const parsedDecision = rawDecision.toUpperCase();
    const target = normalizeDocumentationTarget(rawTarget);
    const reason = rawReason.join('|').trim();
    const rowErrors: string[] = [];
    if (!ADDITIONAL_KINDS.has(kind)) {
      rowErrors.push(`unsupported Kind ${rawKind || '-'}`);
    }
    if (parsedDecision !== 'UPDATE' && parsedDecision !== 'ADD') {
      rowErrors.push('Decision must be UPDATE or ADD');
    }
    if (!isValidDocumentationTarget(target)) {
      rowErrors.push(`invalid target ${rawTarget || '-'}`);
    }
    if (!reason || isPlaceholder(reason)) {
      rowErrors.push('Reason is required');
    }
    if (rowErrors.length > 0) {
      errors.push(`Invalid additional impact row (${rowErrors.join('; ')}).`);
      continue;
    }
    impacts.push({
      kind,
      decision: parsedDecision === 'UPDATE' ? 'UPDATE' : 'ADD',
      target,
      reason,
    });
  }
  return { impacts, errors };
}

function parseTargetList(value: string | null): string[] {
  return value
    ? [
        ...new Set(
          value.split(',').map(normalizeDocumentationTarget).filter(Boolean)
        ),
      ]
    : [];
}

function extractSecondLevelSection(content: string, heading: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const expected = `## ${heading}`.toLowerCase();
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === expected
  );
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
  return normalized === 'NONE' ||
    normalized === 'UPDATE' ||
    normalized === 'ADD'
    ? normalized
    : null;
}

function parseSchemaVersion(value: string | null): number | null {
  const parsed = Number(cleanValue(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanValue(value: string | null): string | null {
  const normalized = (value || '').trim().replace(/^`|`$/g, '');
  return !normalized || normalized === '-' ? null : normalized;
}

function isPlaceholder(value: string): boolean {
  return (
    /^(todo|tbd|pending|reason|이유)$/i.test(value.trim()) ||
    /^\(.+\)$/.test(value.trim())
  );
}

function emptyDecisions(): CuratedDocumentationImpact['decisions'] {
  return {
    productRequirements: null,
    systemArchitecture: null,
    onboardingEntrypoint: null,
    operationalRuntimeContract: null,
  };
}

function emptyAdditional(): CuratedDocumentationImpact['additional'] {
  return {
    present: false,
    complete: false,
    decision: null,
    impacts: [],
  };
}

function metadataValue(content: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const value = content.match(
      new RegExp(`^\\s*-\\s*\\*\\*${escaped}\\*\\*:\\s*(.*?)\\s*$`, 'imu')
    )?.[1];
    if (value) return value.trim().replace(/^`|`$/gu, '').toLowerCase();
  }
  return '';
}

function withoutFencedCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/gu, '');
}

function hasCheckedCompletionLine(
  lines: string[],
  marker: string,
  legacyPattern: RegExp
): boolean {
  const markedLines = lines.filter((line) => line.includes(marker));
  if (markedLines.length > 0) {
    return markedLines.length === 1 && /^\s*-\s*\[[xX]\]/u.test(markedLines[0]);
  }
  return lines.some(
    (line) => legacyPattern.test(line) && /^\s*-\s*\[[xX]\]/u.test(line)
  );
}

function leadingSpaces(value: string): number {
  return value.match(/^(\s*)/)?.[1]?.length || 0;
}

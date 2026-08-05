import fs from 'fs-extra';
import path from 'node:path';

export const DESIGN_DOC_KINDS = [
  'ux-design',
  'design-system',
  'visual-reference',
] as const;

type DetectionSource = 'frontmatter' | 'filename';

export type DocsTaxonomyViolationCode =
  | 'DOC_KIND_MISSING'
  | 'INVALID_DOC_FRONTMATTER'
  | 'INVALID_DOC_KIND'
  | 'INVALID_DOC_SCOPE'
  | 'MISPLACED_MANAGED_DOC';

export interface DocsTaxonomyViolation {
  path: string;
  violationCode: DocsTaxonomyViolationCode;
  declaredKind: string | null;
  detectedKind: string | null;
  detectedBy: DetectionSource | null;
  confidence: 'high' | null;
  message: string;
  suggestedLocations: string[];
}

interface FrontmatterResult {
  present: boolean;
  valid: boolean;
  kind: string | null;
  scope: string | null;
}

interface FilenameClassification {
  kind: 'architecture-overview' | 'feature-plan' | 'idea' | 'feature-decisions';
  suggestedLocations: string[];
}

const ALLOWED_DESIGN_KINDS = new Set<string>(DESIGN_DOC_KINDS);

const FILENAME_RULES: Array<{
  pattern: RegExp;
  classification: FilenameClassification;
}> = [
  {
    pattern:
      /(?:^|-)(?:system|backend|frontend)-architecture(?:-|$)|(?:^|-)architecture-overview(?:-|$)/i,
    classification: {
      kind: 'architecture-overview',
      suggestedLocations: ['docs/prd/*-overview.md'],
    },
  },
  {
    pattern:
      /(?:^|-)(?:data-model|api-design|database-schema|implementation-plan|implementation-roadmap)(?:-|$)/i,
    classification: {
      kind: 'feature-plan',
      suggestedLocations: [
        'docs/ideas/I###-*.md (before Feature promotion)',
        'the active Feature plan.md',
      ],
    },
  },
  {
    pattern:
      /(?:^|-)(?:open-source-research|candidate-comparison|technology-comparison)(?:-|$)/i,
    classification: {
      kind: 'idea',
      suggestedLocations: [
        'docs/ideas/I###-*.md (before Feature promotion)',
        'the active Feature decisions.md',
      ],
    },
  },
  {
    pattern:
      /(?:^|-)(?:technical-decision|architecture-decision|tradeoff|adr)(?:-|$)/i,
    classification: {
      kind: 'feature-decisions',
      suggestedLocations: [
        'docs/ideas/I###-*.md (before Feature promotion)',
        'the active Feature decisions.md',
      ],
    },
  },
];

export async function collectDocsTaxonomyViolations(
  docsDir: string
): Promise<DocsTaxonomyViolation[]> {
  const designsDir = path.join(docsDir, 'designs');
  if (!(await fs.pathExists(designsDir))) return [];

  const markdownFiles = await collectMarkdownFiles(designsDir);
  const violations: DocsTaxonomyViolation[] = [];

  for (const filePath of markdownFiles) {
    if (path.basename(filePath).toLowerCase() === 'readme.md') continue;
    const content = await fs.readFile(filePath, 'utf-8');
    const displayPath = `docs/${normalizeSlashes(path.relative(docsDir, filePath))}`;
    const frontmatter = parseLeeSpecKitFrontmatter(content);

    if (frontmatter.present && !frontmatter.valid) {
      violations.push(
        createViolation(
          displayPath,
          'INVALID_DOC_FRONTMATTER',
          frontmatter.kind,
          null,
          'frontmatter',
          'lee-spec-kit frontmatter must contain a well-formed kind entry.',
          []
        )
      );
      continue;
    }

    if (frontmatter.kind) {
      if (!isKnownDocKind(frontmatter.kind)) {
        violations.push(
          createViolation(
            displayPath,
            'INVALID_DOC_KIND',
            frontmatter.kind,
            null,
            'frontmatter',
            `Unknown lee-spec-kit document kind: ${frontmatter.kind}`,
            []
          )
        );
        continue;
      }
      if (!ALLOWED_DESIGN_KINDS.has(frontmatter.kind)) {
        violations.push(
          createViolation(
            displayPath,
            'MISPLACED_MANAGED_DOC',
            frontmatter.kind,
            frontmatter.kind,
            'frontmatter',
            `Document kind "${frontmatter.kind}" does not belong in docs/designs/.`,
            suggestedLocationsForKind(frontmatter.kind)
          )
        );
        continue;
      }
      if (frontmatter.scope && frontmatter.scope !== 'project') {
        violations.push(
          createViolation(
            displayPath,
            'INVALID_DOC_SCOPE',
            frontmatter.kind,
            frontmatter.kind,
            'frontmatter',
            'Documents in docs/designs/ must use lee-spec-kit scope: project.',
            []
          )
        );
      }
      continue;
    }

    const inferred = classifyFilename(
      path.basename(filePath, path.extname(filePath))
    );
    if (inferred) {
      violations.push(
        createViolation(
          displayPath,
          'MISPLACED_MANAGED_DOC',
          null,
          inferred.kind,
          'filename',
          `The filename strongly suggests a ${inferred.kind} document, which does not belong in docs/designs/.`,
          inferred.suggestedLocations
        )
      );
      continue;
    }

    violations.push(
      createViolation(
        displayPath,
        'DOC_KIND_MISSING',
        null,
        null,
        null,
        'Add lee-spec-kit frontmatter with kind: ux-design, design-system, or visual-reference.',
        []
      )
    );
  }

  return violations.sort((a, b) => a.path.localeCompare(b.path));
}

function createViolation(
  displayPath: string,
  violationCode: DocsTaxonomyViolationCode,
  declaredKind: string | null,
  detectedKind: string | null,
  detectedBy: DetectionSource | null,
  message: string,
  suggestedLocations: string[]
): DocsTaxonomyViolation {
  return {
    path: displayPath,
    violationCode,
    declaredKind,
    detectedKind,
    detectedBy,
    confidence: detectedBy ? 'high' : null,
    message,
    suggestedLocations,
  };
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === 'assets') continue;
      files.push(...(await collectMarkdownFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
      files.push(absolutePath);
    }
  }
  return files;
}

function parseLeeSpecKitFrontmatter(content: string): FrontmatterResult {
  const normalized = content.replace(/^\uFEFF/, '');
  if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
    return { present: false, valid: true, kind: null, scope: null };
  }

  const lines = normalized.split(/\r?\n/);
  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---'
  );
  if (closingIndex < 0) {
    return { present: true, valid: false, kind: null, scope: null };
  }

  const frontmatterLines = lines.slice(1, closingIndex);
  const rootIndex = frontmatterLines.findIndex((line) =>
    /^lee-spec-kit:\s*$/.test(line.trim())
  );
  if (rootIndex < 0) {
    return { present: true, valid: false, kind: null, scope: null };
  }

  let kind: string | null = null;
  let scope: string | null = null;
  for (const line of frontmatterLines.slice(rootIndex + 1)) {
    if (/^\S/.test(line)) break;
    const match = line.match(/^\s+(kind|scope):\s*(.*?)\s*$/);
    if (!match) continue;
    const value = stripYamlScalarQuotes(match[2]);
    if (match[1] === 'kind') kind = value || null;
    if (match[1] === 'scope') scope = value || null;
  }

  return { present: true, valid: !!kind, kind, scope };
}

function stripYamlScalarQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function classifyFilename(stem: string): FilenameClassification | null {
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(stem)) return rule.classification;
  }
  return null;
}

function isKnownDocKind(kind: string): boolean {
  return new Set([
    ...DESIGN_DOC_KINDS,
    'product-requirements',
    'architecture-overview',
    'idea',
    'feature-spec',
    'feature-plan',
    'feature-decisions',
  ]).has(kind);
}

function suggestedLocationsForKind(kind: string): string[] {
  if (kind === 'architecture-overview') return ['docs/prd/*-overview.md'];
  if (kind === 'idea') return ['docs/ideas/I###-*.md'];
  if (kind === 'product-requirements') return ['docs/prd/'];
  if (kind === 'feature-spec') return ['the active Feature spec.md'];
  if (kind === 'feature-plan') return ['the active Feature plan.md'];
  if (kind === 'feature-decisions') return ['the active Feature decisions.md'];
  return [];
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FEATURE_FOLDER_PATTERN,
  FEATURE_ID_SOURCE,
  isFeatureId,
} from './feature-identity.js';

export interface DocsFeatureReferenceViolation {
  path: string;
  violationCode: 'FEATURE_REFERENCE_IN_SHARED_DOC';
  line: number;
  column: number;
  reference: string;
  message: string;
}

// Workflow instructions and promotion records necessarily explain/track IDs.
// Project-specific policies (constitution/custom) remain audited.
const WORKFLOW_GUIDES = new Set([
  'agents/agents.md',
  'agents/git-workflow.md',
  'agents/issue-template.md',
  'agents/pr-template.md',
  'agents/skills/create-feature.md',
  'agents/skills/split-feature.md',
  'agents/skills/execute-task.md',
  'agents/skills/create-issue.md',
  'agents/skills/create-pr.md',
]);
const DOC_EXTENSION = /\.(?:md|mdx|txt|rst|adoc)$/iu;
// Unlabelled modern IDs need a digit, or a match with a registered Feature,
// so ordinary uppercase words such as ENHANCEMENTS are not mistaken for IDs.
const CONCRETE_ID =
  '(?=[A-HJ-NP-Z2-9]{0,11}[2-9])[A-HJ-NP-Z][A-HJ-NP-Z2-9]{11}';
const LABEL = '(?:features?|tasks?|피처|태스크|기능\\s*번호|작업\\s*번호)';
const MARKUP = '[*_`]*';
const REFERENCE_PATTERNS = [
  new RegExp(
    `(?<![A-Za-z0-9_-])T-${FEATURE_ID_SOURCE}(?:-[A-Za-z0-9]+)*-[0-9]+(?![A-Za-z0-9_-])`,
    'giu'
  ),
  /(?<![A-Za-z0-9_-])T-?[0-9]{2,}(?![A-Za-z0-9_-])/gu,
  /(?<![A-Za-z0-9_-])F[0-9]{3,}(?![A-Za-z0-9_])/giu,
  new RegExp(`(?<![A-Za-z0-9_-])${CONCRETE_ID}(?![A-Za-z0-9_])`, 'gu'),
  new RegExp(
    `(?:^|[/\\\\])features[/\\\\](?:[^/\\\\\\s<>()[\\]\x60]+[/\\\\])?${FEATURE_ID_SOURCE}-[^/\\\\\\s<>()[\\]\x60]+`,
    'giu'
  ),
  new RegExp(
    `(?<![A-Za-z0-9_-])${LABEL}${MARKUP}\\s*(?:(?:id|번호)${MARKUP}\\s*)?[:：#-]?\\s*${MARKUP}#?${FEATURE_ID_SOURCE}(?![A-Za-z0-9_])`,
    'giu'
  ),
  new RegExp(`(?<![A-Za-z0-9_-])[0-9]+\\s*번\\s*${LABEL}`, 'giu'),
];

export function isSharedProjectDoc(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/gu, '/').replace(/^\.\//u, '');
  if (normalized.startsWith('../') || path.isAbsolute(normalized)) return false;
  const lower = normalized.toLowerCase();
  if (!DOC_EXTENSION.test(lower)) return false;
  if (/^(?:features|ideas|scripts|openwiki)\//u.test(lower)) return false;
  if (WORKFLOW_GUIDES.has(lower)) return false;
  if (/(?:^|\/)(?:assets|node_modules|\.git|\.worktrees)(?:\/|$)/u.test(lower))
    return false;
  return true;
}

export function findDocsFeatureReferences(
  content: string,
  displayPath: string,
  registeredIds: string[] = []
): DocsFeatureReferenceViolation[] {
  // The generated agent entrypoint contains CLI examples, not project claims.
  // Mask it without shifting the locations of user-authored text around it.
  const text =
    path.basename(displayPath).toLowerCase() === 'agents.md'
      ? content.replace(
          /<!-- lee-spec-kit:begin -->[\s\S]*?<!-- lee-spec-kit:end -->/gu,
          (block) => block.replace(/[^\r\n]/gu, ' ')
        )
      : content;
  const patterns = [...REFERENCE_PATTERNS];
  const namedIds = registeredIds.filter(
    (id) => isFeatureId(id) && !/^[0-9]+$/u.test(id)
  );
  if (namedIds.length > 0) {
    patterns.push(
      new RegExp(
        `(?<![A-Za-z0-9_-])(?:${namedIds.join('|')})(?![A-Za-z0-9_])`,
        'giu'
      )
    );
  }
  const violations: DocsFeatureReferenceViolation[] = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    const matches = patterns
      .flatMap((pattern) =>
        [...line.matchAll(pattern)].map((match) => ({
          column: match.index + 1,
          reference: match[0],
        }))
      )
      .sort(
        (a, b) => a.column - b.column || b.reference.length - a.reference.length
      );
    let end = 0;
    for (const match of matches) {
      if (match.column <= end) continue;
      end = match.column + match.reference.length - 1;
      violations.push({
        path: displayPath,
        violationCode: 'FEATURE_REFERENCE_IN_SHARED_DOC',
        line: index + 1,
        ...match,
        message:
          'Shared project docs must describe durable requirements, behavior, or policy without concrete Feature/task IDs or Feature-local links. Keep change tracking in the Feature docs and link from there to the shared document.',
      });
    }
  }
  return violations;
}

export async function collectDocsFeatureReferences(
  docsDir: string,
  options: { includeReadmes?: boolean } = {}
): Promise<DocsFeatureReferenceViolation[]> {
  const violations: DocsFeatureReferenceViolation[] = [];
  const registeredIds = await collectFeatureIds(docsDir);
  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(docsDir, absolute).replace(/\\/gu, '/');
      if (entry.isDirectory()) {
        if (
          /^(?:features|ideas|scripts|openwiki)$/iu.test(relative) ||
          /^(?:assets|node_modules|\.git|\.worktrees)$/iu.test(entry.name)
        )
          continue;
        await visit(absolute);
      } else if (entry.isFile() && isSharedProjectDoc(relative)) {
        if (
          options.includeReadmes === false &&
          /^readme(?:\.[^.]+)?\.md$/iu.test(entry.name)
        )
          continue;
        violations.push(
          ...findDocsFeatureReferences(
            await fs.readFile(absolute, 'utf-8'),
            `docs/${relative}`,
            registeredIds
          )
        );
      }
    }
  }
  await visit(docsDir);
  return violations.sort(
    (a, b) =>
      a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column
  );
}

export function featureIdsFromPaths(paths: string[]): string[] {
  const ids = new Set<string>();
  for (const relative of paths) {
    const segments = relative.replace(/\\/gu, '/').split('/');
    if (segments[0] !== 'features') continue;
    for (const segment of segments.slice(1, 3)) {
      const match = segment.match(FEATURE_FOLDER_PATTERN);
      if (match) {
        ids.add(match[1]);
        break;
      }
    }
  }
  return [...ids];
}

async function collectFeatureIds(docsDir: string): Promise<string[]> {
  const directories: string[] = [];
  async function visit(directory: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const absolute = path.join(directory, entry.name);
      directories.push(path.relative(docsDir, absolute));
      if (depth > 0 && !FEATURE_FOLDER_PATTERN.test(entry.name))
        await visit(absolute, depth - 1);
    }
  }
  await visit(path.join(docsDir, 'features'), 1);
  return featureIdsFromPaths(directories);
}

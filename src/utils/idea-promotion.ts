import path from 'path';
import fs from 'fs-extra';
import type { Lang } from './i18n.js';
import { tr } from './i18n.js';
import { createCliError } from './cli-error.js';

const IDEA_REF_PATTERN = /\b(I\d{3,}(?:-[A-Za-z0-9._-]+)?)\b/;
const IDEA_PATH_PATTERN = /\b(?:\.\/)?docs\/ideas\/[^\s]+\.md\b/;

export function extractExplicitIdeaRef(requestText: string): string | null {
  const pathMatch = requestText.match(IDEA_PATH_PATTERN);
  if (pathMatch) return pathMatch[0];

  const refMatch = requestText.match(IDEA_REF_PATTERN);
  if (refMatch) return refMatch[1];

  return null;
}

export async function resolveIdeaReference(
  docsDir: string,
  ref: string,
  lang: Lang
): Promise<{ path: string }> {
  const ideasDir = path.join(docsDir, 'ideas');
  const trimmedRef = ref.trim();
  if (!trimmedRef) {
    throw createCliError(
      'INVALID_ARGUMENT',
      tr(lang, 'cli', 'feature.ideaNotFound', { ref })
    );
  }

  if (trimmedRef.includes('/') || trimmedRef.endsWith('.md')) {
    const candidate = path.resolve(process.cwd(), trimmedRef);
    if (await fs.pathExists(candidate)) {
      return { path: candidate };
    }
    throw createCliError(
      'INVALID_ARGUMENT',
      tr(lang, 'cli', 'feature.ideaNotFound', { ref: trimmedRef })
    );
  }

  if (!(await fs.pathExists(ideasDir))) {
    throw createCliError(
      'INVALID_ARGUMENT',
      tr(lang, 'cli', 'feature.ideaNotFound', { ref: trimmedRef })
    );
  }

  const entries = await fs.readdir(ideasDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name);

  const exactName = `${trimmedRef}.md`;
  if (files.includes(exactName)) {
    return { path: path.join(ideasDir, exactName) };
  }

  const byId = /^I\d{3,}$/.test(trimmedRef)
    ? files.filter((name) => name.startsWith(`${trimmedRef}-`))
    : [];
  if (byId.length === 1) {
    return { path: path.join(ideasDir, byId[0]) };
  }
  if (byId.length > 1) {
    throw createCliError(
      'INVALID_ARGUMENT',
      tr(lang, 'cli', 'feature.ideaAmbiguous', { ref: trimmedRef })
    );
  }

  throw createCliError(
    'INVALID_ARGUMENT',
    tr(lang, 'cli', 'feature.ideaNotFound', { ref: trimmedRef })
  );
}

export async function readIdeaMetadataValue(
  ideaPath: string,
  label: string
): Promise<string | null> {
  const content = await fs.readFile(ideaPath, 'utf-8');
  const pattern = new RegExp(`^- \\*\\*${escapeRegExp(label)}\\*\\*:\\s*(.+)$`, 'm');
  const match = content.match(pattern);
  if (!match) return null;
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

export async function deriveFeatureNameFromIdea(ideaPath: string): Promise<string> {
  const ideaName = await readIdeaMetadataValue(ideaPath, 'Idea Name');
  if (ideaName && ideaName !== '-') return ideaName;

  const basename = path.basename(ideaPath, '.md');
  return basename.replace(/^I\d{3,}-/, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

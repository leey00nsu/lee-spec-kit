import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

export const LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN =
  '# lee-spec-kit:codex-bootstrap:begin';
export const LEE_SPEC_KIT_CODEX_BOOTSTRAP_END =
  '# lee-spec-kit:codex-bootstrap:end';

const REQUIRED_FALLBACK = 'docs/AGENTS.md';
const REQUIRED_COMPACT_LINES = [
  'Preserve any instructions loaded from ./docs/AGENTS.md in the compacted summary.',
  'After context compression/reset, read ./docs/AGENTS.md again before resuming project-specific work.',
];

function renderManagedSegment(): string {
  return [
    LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN,
    `project_doc_fallback_filenames = ["${REQUIRED_FALLBACK}"]`,
    'compact_prompt = """',
    ...REQUIRED_COMPACT_LINES,
    '"""',
    LEE_SPEC_KIT_CODEX_BOOTSTRAP_END,
  ].join('\n');
}

function renderManagedBlock(): string {
  return `${renderManagedSegment()}\n\n`;
}

export function getCodexHome(): string {
  const explicit = String(process.env.CODEX_HOME || '').trim();
  if (explicit) return explicit;
  return path.join(os.homedir(), '.codex');
}

export function getCodexConfigPath(): string {
  return path.join(getCodexHome(), 'config.toml');
}

function contentIncludesRequiredBootstrap(content: string): boolean {
  return (
    content.includes(REQUIRED_FALLBACK) &&
    REQUIRED_COMPACT_LINES.every((line) => content.includes(line))
  );
}

function hasConflictingTopLevelKey(content: string, key: string): boolean {
  const keyPattern = new RegExp(`^\\s*${key}\\s*=`, 'm');
  return keyPattern.test(content);
}

export async function hasLeeSpecKitCodexBootstrap(
  filePath = getCodexConfigPath()
): Promise<boolean> {
  if (!(await fs.pathExists(filePath))) return false;
  const content = await fs.readFile(filePath, 'utf-8');
  return (
    (content.includes(LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN) &&
      content.includes(LEE_SPEC_KIT_CODEX_BOOTSTRAP_END)) ||
    contentIncludesRequiredBootstrap(content)
  );
}

export async function upsertLeeSpecKitCodexBootstrap(
  filePath = getCodexConfigPath()
): Promise<{
  changed: boolean;
  action: 'created' | 'appended' | 'updated' | 'noop';
  filePath: string;
}> {
  const block = renderManagedBlock();
  const segment = renderManagedSegment();
  await fs.ensureDir(path.dirname(filePath));

  const exists = await fs.pathExists(filePath);
  if (!exists) {
    await fs.writeFile(filePath, block, 'utf-8');
    return { changed: true, action: 'created', filePath };
  }

  const current = await fs.readFile(filePath, 'utf-8');
  const beginIndex = current.indexOf(LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN);
  const endIndex = current.indexOf(LEE_SPEC_KIT_CODEX_BOOTSTRAP_END);

  if (beginIndex !== -1 && endIndex !== -1 && beginIndex <= endIndex) {
    const replaceEnd = endIndex + LEE_SPEC_KIT_CODEX_BOOTSTRAP_END.length;
    const next = `${current.slice(0, beginIndex)}${segment}${current.slice(replaceEnd)}`;
    if (next === current) {
      return { changed: false, action: 'noop', filePath };
    }
    await fs.writeFile(filePath, next, 'utf-8');
    return { changed: true, action: 'updated', filePath };
  }

  if (
    hasConflictingTopLevelKey(current, 'project_doc_fallback_filenames') ||
    hasConflictingTopLevelKey(current, 'compact_prompt')
  ) {
    if (contentIncludesRequiredBootstrap(current)) {
      return { changed: false, action: 'noop', filePath };
    }
    throw new Error(
      `Codex config already defines project_doc_fallback_filenames or compact_prompt outside lee-spec-kit managed block: ${filePath}`
    );
  }

  let next = current;
  if (next.length > 0 && !next.endsWith('\n')) next += '\n';
  if (next.trim().length > 0 && !next.endsWith('\n\n')) next += '\n';
  next += block;

  await fs.writeFile(filePath, next, 'utf-8');
  return { changed: true, action: 'appended', filePath };
}

export async function removeLeeSpecKitCodexBootstrap(
  filePath = getCodexConfigPath()
): Promise<{ changed: boolean; filePath: string }> {
  if (!(await fs.pathExists(filePath))) {
    return { changed: false, filePath };
  }

  const current = await fs.readFile(filePath, 'utf-8');
  const beginIndex = current.indexOf(LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN);
  const endIndex = current.indexOf(LEE_SPEC_KIT_CODEX_BOOTSTRAP_END);
  if (beginIndex === -1 || endIndex === -1 || beginIndex > endIndex) {
    return { changed: false, filePath };
  }

  const replaceEnd = endIndex + LEE_SPEC_KIT_CODEX_BOOTSTRAP_END.length;
  let next = `${current.slice(0, beginIndex)}${current.slice(replaceEnd)}`;
  next = next.replace(/\n{3,}/g, '\n\n').trimEnd();
  if (next.length > 0) next += '\n';
  await fs.writeFile(filePath, next, 'utf-8');
  return { changed: true, filePath };
}

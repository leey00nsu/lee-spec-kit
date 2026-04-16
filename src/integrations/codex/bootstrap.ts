import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

export const LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN =
  '# lee-spec-kit:codex-bootstrap:begin';
export const LEE_SPEC_KIT_CODEX_BOOTSTRAP_END =
  '# lee-spec-kit:codex-bootstrap:end';

const REQUIRED_HOOKS_FLAG_LINE = 'features.codex_hooks = true';

function renderManagedSegment(): string {
  return [
    LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN,
    REQUIRED_HOOKS_FLAG_LINE,
    LEE_SPEC_KIT_CODEX_BOOTSTRAP_END,
  ].join('\n');
}

function renderManagedBlock(): string {
  return `${renderManagedSegment()}\n\n`;
}

function sanitizeTomlScanContent(content: string): string {
  let result = '';
  let index = 0;
  let state: 'normal' | 'basic' | 'literal' | 'multibasic' | 'multiliteral' = 'normal';

  while (index < content.length) {
    const nextThree = content.slice(index, index + 3);
    const char = content[index] || '';

    if (state === 'normal') {
      if (nextThree === '"""') {
        result += '   ';
        index += 3;
        state = 'multibasic';
        continue;
      }
      if (nextThree === "'''") {
        result += '   ';
        index += 3;
        state = 'multiliteral';
        continue;
      }
      if (char === '"') {
        result += ' ';
        index += 1;
        state = 'basic';
        continue;
      }
      if (char === "'") {
        result += ' ';
        index += 1;
        state = 'literal';
        continue;
      }
      result += char;
      index += 1;
      continue;
    }

    if (state === 'basic') {
      if (char === '\\') {
        result += '  ';
        index += 2;
        continue;
      }
      result += char === '\n' ? '\n' : ' ';
      index += 1;
      if (char === '"') state = 'normal';
      continue;
    }

    if (state === 'literal') {
      result += char === '\n' ? '\n' : ' ';
      index += 1;
      if (char === "'") state = 'normal';
      continue;
    }

    if (state === 'multibasic') {
      if (nextThree === '"""') {
        result += '   ';
        index += 3;
        state = 'normal';
        continue;
      }
      result += char === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }

    if (nextThree === "'''") {
      result += '   ';
      index += 3;
      state = 'normal';
      continue;
    }
    result += char === '\n' ? '\n' : ' ';
    index += 1;
  }

  return result;
}

function stripManagedBlock(content: string): string {
  const beginIndex = content.indexOf(LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN);
  const endIndex = content.indexOf(LEE_SPEC_KIT_CODEX_BOOTSTRAP_END);
  if (beginIndex === -1 || endIndex === -1 || beginIndex > endIndex) {
    return content;
  }
  const replaceEnd = endIndex + LEE_SPEC_KIT_CODEX_BOOTSTRAP_END.length;
  return `${content.slice(0, beginIndex)}${content.slice(replaceEnd)}`;
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
    hasEnabledTopLevelCodexHooksKey(content) ||
    hasEnabledFeaturesTableCodexHooksKey(content) ||
    hasEnabledFeaturesInlineTableCodexHooksKey(content)
  );
}

function hasConflictingTopLevelKey(content: string, key: string): boolean {
  const sanitized = sanitizeTomlScanContent(content);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyPattern = new RegExp(`^\\s*${escaped}\\s*=`, 'm');
  return keyPattern.test(sanitized);
}

function hasEnabledTopLevelCodexHooksKey(content: string): boolean {
  return /^\s*features\.codex_hooks\s*=\s*true\b/m.test(
    sanitizeTomlScanContent(content)
  );
}

function hasConflictingFeaturesTableKey(content: string, key: string): boolean {
  const lines = sanitizeTomlScanContent(content).split('\n');
  let inFeaturesTable = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const tableMatch = line.match(/^\[([^\]]+)\](?:\s*#.*)?$/);
    if (tableMatch) {
      inFeaturesTable = tableMatch[1]?.trim() === 'features';
      continue;
    }

    if (!inFeaturesTable) continue;
    if (new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`).test(line)) {
      return true;
    }
  }

  return false;
}

function hasEnabledFeaturesTableCodexHooksKey(content: string): boolean {
  const lines = sanitizeTomlScanContent(content).split('\n');
  let inFeaturesTable = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const tableMatch = line.match(/^\[([^\]]+)\](?:\s*#.*)?$/);
    if (tableMatch) {
      inFeaturesTable = tableMatch[1]?.trim() === 'features';
      continue;
    }

    if (!inFeaturesTable) continue;
    if (/^codex_hooks\s*=\s*true\b/.test(line)) {
      return true;
    }
  }

  return false;
}

function hasConflictingFeaturesInlineTableKey(content: string, key: string): boolean {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = sanitizeTomlScanContent(content).split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (!/^features\s*=\s*\{/.test(line)) continue;
    if (new RegExp(`\\b${escapedKey}\\s*=`).test(line)) {
      return true;
    }
  }

  return false;
}

function hasEnabledFeaturesInlineTableCodexHooksKey(content: string): boolean {
  const lines = sanitizeTomlScanContent(content).split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (!/^features\s*=\s*\{/.test(line)) continue;
    if (/\bcodex_hooks\s*=\s*true\b/.test(line)) {
      return true;
    }
  }

  return false;
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
  const externalContent = stripManagedBlock(current);
  const beginIndex = current.indexOf(LEE_SPEC_KIT_CODEX_BOOTSTRAP_BEGIN);
  const endIndex = current.indexOf(LEE_SPEC_KIT_CODEX_BOOTSTRAP_END);

  if (
    hasConflictingTopLevelKey(externalContent, 'features.codex_hooks') ||
    hasConflictingFeaturesTableKey(externalContent, 'codex_hooks') ||
    hasConflictingFeaturesInlineTableKey(externalContent, 'codex_hooks')
  ) {
    throw new Error(
      `Codex config already defines codex_hooks outside lee-spec-kit managed block: ${filePath}`
    );
  }

  if (beginIndex !== -1 && endIndex !== -1 && beginIndex <= endIndex) {
    const replaceEnd = endIndex + LEE_SPEC_KIT_CODEX_BOOTSTRAP_END.length;
    const next = `${current.slice(0, beginIndex)}${segment}${current.slice(replaceEnd)}`;
    if (next === current) {
      return { changed: false, action: 'noop', filePath };
    }
    await fs.writeFile(filePath, next, 'utf-8');
    return { changed: true, action: 'updated', filePath };
  }

  if (contentIncludesRequiredBootstrap(current)) {
    return { changed: false, action: 'noop', filePath };
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

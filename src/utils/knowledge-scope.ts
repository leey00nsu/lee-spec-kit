import fs from 'node:fs';
import path from 'node:path';
import { runGitCapture } from './git-run.js';

const TOOL_BEGIN = '<!-- lee-spec-kit:begin -->';
const TOOL_END = '<!-- lee-spec-kit:end -->';
const WIKI_BEGIN = '<!-- OPENWIKI:START -->';
const WIKI_END = '<!-- OPENWIKI:END -->';

/** Keep malformed blocks visible rather than silently excluding user content. */
function block(content: string, begin: string, end: string): string | null {
  const start = content.indexOf(begin);
  const finish = content.indexOf(end);
  if (start < 0 && finish < 0) return '';
  if (
    start < 0 ||
    finish < start ||
    start !== content.lastIndexOf(begin) ||
    finish !== content.lastIndexOf(end)
  )
    return null;
  return content.slice(start, finish + end.length);
}

/** Source projection only. Never use this to relax generator write protection. */
export function knowledgeEntrypointSource(content: string): string {
  for (const [begin, end] of [
    [TOOL_BEGIN, TOOL_END],
    [WIKI_BEGIN, WIKI_END],
  ]) {
    const managed = block(content, begin, end);
    if (managed) content = content.replace(managed, '');
  }
  return content.trim();
}

export function readKnowledgeVersion(
  root: string,
  file: string,
  version: 'HEAD' | 'index' | 'worktree'
): string {
  if (version === 'worktree') {
    try {
      return fs.readFileSync(path.join(root, file), 'utf8');
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return '';
      throw error;
    }
  }
  return (
    runGitCapture(
      ['show', version === 'index' ? `:${file}` : `HEAD:${file}`],
      root
    ) || ''
  );
}

export function isKnowledgeChange(
  root: string,
  file: string,
  before: 'HEAD' | 'index' = 'HEAD',
  after: 'index' | 'worktree' = 'index'
): boolean {
  if (file !== 'AGENTS.md' && file !== 'CLAUDE.md') {
    return (
      file === 'openwiki' ||
      file.startsWith('openwiki/') ||
      file === '.openwikiignore' ||
      file === '.lee-spec-kit/openwiki-sync.json' ||
      file === '.lee-spec-kit/openwiki-run.json'
    );
  }
  const oldBlock = block(
    readKnowledgeVersion(root, file, before),
    WIKI_BEGIN,
    WIKI_END
  );
  const newBlock = block(
    readKnowledgeVersion(root, file, after),
    WIKI_BEGIN,
    WIKI_END
  );
  return oldBlock === null || newBlock === null || oldBlock !== newBlock;
}

/** Unlike source projection, retain the OpenWiki block when checking reuse policy. */
export function withoutToolingBlock(content: string): string {
  const managed = block(content, TOOL_BEGIN, TOOL_END);
  return (managed ? content.replace(managed, '') : content).trim();
}

export function isToolingOnlyRevisionChange(
  root: string,
  before: string,
  after: string,
  includePublishedKnowledge = false
): boolean {
  const changed = runGitCapture(
    ['diff', '--name-only', '--no-renames', '-z', before, after],
    root
  );
  if (typeof changed !== 'string') return false;
  return changed
    .split('\0')
    .filter(Boolean)
    .every((file) => {
      if (includePublishedKnowledge && (file.startsWith('openwiki/') || file === '.lee-spec-kit/openwiki-sync.json')) return true;
      if (
        path.posix.basename(file) === '.lee-spec-kit.json' ||
        file.startsWith('.codex/')
      )
        return true;
      if (file !== 'AGENTS.md' && file !== 'CLAUDE.md') return false;
      const oldContent =
        runGitCapture(['show', `${before}:${file}`], root) || '';
      const newContent =
        runGitCapture(['show', `${after}:${file}`], root) || '';
      return (
        withoutToolingBlock(oldContent) === withoutToolingBlock(newContent)
      );
    });
}

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ProjectConfig } from '../config/types.js';

export const OPENWIKI_VERSION = '0.5.2';
export const OPENWIKI_DIR = 'openwiki';

export function isOpenWikiEnabled(config: ProjectConfig): boolean {
  return config.experimental?.openwiki === true;
}

export function isOpenWikiDerivedPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/gu, '/').replace(/^\.\//u, '');
  return (
    normalized === OPENWIKI_DIR || normalized.startsWith(`${OPENWIKI_DIR}/`)
  );
}

export function areChangesOpenWikiOnly(projectRoot: string): boolean {
  let porcelain = '';
  try {
    porcelain = String(
      execFileSync(
        'git',
        ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
        {
          cwd: projectRoot,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      ) || ''
    );
  } catch {
    return false;
  }
  const paths = new Set<string>();
  const records = porcelain.split('\0');
  for (let index = 0; index < records.length; index += 1) {
    const rawLine = records[index];
    if (!rawLine) continue;
    const status = rawLine.slice(0, 2);
    const value = rawLine.length > 3 ? rawLine.slice(3) : '';
    if (value) paths.add(value.replace(/\\/gu, '/'));
    if (/[RC]/u.test(status) && records[index + 1]) {
      index += 1;
      paths.add(records[index].replace(/\\/gu, '/'));
    }
  }
  return (
    paths.size > 0 &&
    [...paths].every(
      (changedPath) =>
        isOpenWikiDerivedPath(changedPath) ||
        isOpenWikiManagedAgentFileChange(projectRoot, changedPath)
    )
  );
}

function isOpenWikiManagedAgentFileChange(
  projectRoot: string,
  relativePath: string
): boolean {
  if (!['AGENTS.md', 'CLAUDE.md'].includes(relativePath)) return false;
  const marker = /<!-- OPENWIKI:START -->[\s\S]*?<!-- OPENWIKI:END -->/gu;
  try {
    const current = fs.readFileSync(
      path.join(projectRoot, relativePath),
      'utf8'
    );
    let baseline = '';
    let baselineExists = true;
    try {
      baseline = String(
        execFileSync('git', ['show', `HEAD:${relativePath}`], {
          cwd: projectRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      );
    } catch {
      baselineExists = false;
    }
    const containsManagedBlock = marker.test(current) || marker.test(baseline);
    marker.lastIndex = 0;
    const currentWithoutManagedBlock = current.replace(marker, '');
    marker.lastIndex = 0;
    const baselineWithoutManagedBlock = baseline.replace(marker, '');
    return (
      containsManagedBlock &&
      (baselineExists
        ? currentWithoutManagedBlock === baselineWithoutManagedBlock
        : currentWithoutManagedBlock.trim() === '')
    );
  } catch {
    return false;
  }
}

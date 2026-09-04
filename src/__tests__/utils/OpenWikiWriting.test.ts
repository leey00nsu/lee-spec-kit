import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  ensureOpenWikiWritingInstructions,
  OPENWIKI_WRITING_POLICY_BEGIN,
  OPENWIKI_WRITING_POLICY_END,
  resolveOpenWikiConfigDir,
  type ResolvedOpenWikiWritingPolicy,
} from '../../utils/openwiki-writing.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenWiki writing config path resolution', () => {
  it('expands slash and backslash home-relative paths', () => {
    expect(resolveOpenWikiConfigDir('/workspace', '~/openwiki-test')).toBe(
      path.join(os.homedir(), 'openwiki-test')
    );
    expect(resolveOpenWikiConfigDir('/workspace', '~\\openwiki-test')).toBe(
      path.join(os.homedir(), 'openwiki-test')
    );
  });

  it('resolves relative paths once from the caller directory', () => {
    expect(resolveOpenWikiConfigDir('/workspace/docs', '../config')).toBe(
      path.resolve('/workspace/docs', '../config')
    );
  });

  it('preserves an instruction edit made while a managed update is prepared', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'lsk-openwiki-instructions-race-')
    );
    const instructionsPath = path.join(directory, 'INSTRUCTIONS.md');
    const original = '# Project instructions\n';
    const concurrent = '# Concurrent project edit\n';
    await fs.writeFile(instructionsPath, original, 'utf-8');
    const managedBlock = `${OPENWIKI_WRITING_POLICY_BEGIN}\nUse the managed skill.\n${OPENWIKI_WRITING_POLICY_END}`;
    const policy: ResolvedOpenWikiWritingPolicy = {
      bundlePath: '/unused',
      managedBlock,
      policyHash: 'sha256:policy',
      receipt: {
        adapterId: 'test',
        adapterVersion: '1',
        skillName: 'test-writing',
        skillHash: 'sha256:skill',
        instructionHash: 'sha256:instructions',
      },
    };
    const originalWriteFile = fs.writeFile.bind(fs) as (
      ...args: unknown[]
    ) => Promise<void>;
    let injected = false;
    vi.spyOn(fs, 'writeFile').mockImplementation((async (
      ...args: unknown[]
    ) => {
      await originalWriteFile(...args);
      const target = String(args[0]);
      if (
        !injected &&
        path.basename(target).startsWith('.INSTRUCTIONS.md.') &&
        target.endsWith('.tmp')
      ) {
        injected = true;
        await originalWriteFile(instructionsPath, concurrent, 'utf-8');
      }
    }) as typeof fs.writeFile);

    try {
      await expect(
        ensureOpenWikiWritingInstructions(
          instructionsPath,
          '# Default\n',
          policy
        )
      ).rejects.toMatchObject({
        code: 'OPENWIKI_PROTECTED_CONTENT_CHANGED',
      });
      expect(await fs.readFile(instructionsPath, 'utf-8')).toBe(concurrent);
    } finally {
      await fs.remove(directory);
    }
  });
});

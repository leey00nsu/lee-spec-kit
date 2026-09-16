import { isFeatureVerificationCurrent, type LocalIntegrationContext } from '../src/utils/local-integration.js';
import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  detectFeatureChecks,
  resolveFeatureCheckPolicy,
} from '../src/utils/feature-checks.js';
import type { ProjectConfig } from '../src/config/types.js';

const config = (workflow: ProjectConfig['workflow']) =>
  ({ workflow }) as ProjectConfig;
describe('Feature verification policy', () => {
  it('retains legacy checks and rejects malformed commands instead of dropping them', () => {
    const check = { command: 'pnpm', args: ['test'] };
    expect(
      resolveFeatureCheckPolicy(config({ postMergeChecks: [check] }), 'web')
        .checks
    ).toEqual([check]);
    expect(() =>
      resolveFeatureCheckPolicy(
        config({ featureChecks: [{ command: '' }] }),
        'web'
      )
    ).toThrow();
    expect(() =>
      resolveFeatureCheckPolicy(
        config({ featureChecks: null } as unknown as ProjectConfig['workflow']),
        'web'
      )
    ).toThrow();
  });
  it('binds verification to commands, ordering, component and explicit skips', () => {
    const a = { command: 'pnpm', args: ['test'] };
    const b = { command: 'pnpm', args: ['build'] };
    const hash = (workflow: ProjectConfig['workflow'], component = 'web') =>
      resolveFeatureCheckPolicy(config(workflow), component).hash;
    expect(hash({ featureChecks: [a] })).not.toBe(
      hash({ featureChecks: [a, b] })
    );
    expect(hash({ featureChecks: [a, b] })).not.toBe(
      hash({ featureChecks: [b, a] })
    );
    expect(hash({ featureChecks: [a] })).not.toBe(
      hash({ featureChecks: [a] }, 'data')
    );
    expect(hash({ featureChecks: [] })).not.toBe(
      hash({ featureChecks: [], featureChecksSkipReason: 'Documentation only' })
    );
    expect(() =>
      hash({ featureChecks: [a], featureChecksSkipReason: 'Skip' })
    ).toThrow();
    expect(
      resolveFeatureCheckPolicy(
        config({
          featureChecks: [a],
          featureChecksByComponent: { data: { checks: [b] } },
        }),
        'data'
      ).checks
    ).toEqual([b]);
  });
  it('discovers scripts without executing them and leaves build coverage to review', async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'lsk-check-discovery-')
    );
    try {
      await fs.writeJson(path.join(dir, 'package.json'), {
        packageManager: 'pnpm@10.0.0',
        scripts: {
          test: 'pnpm build && touch executed',
          build: 'touch executed',
          lint: 'eslint .',
        },
      });
      expect(await detectFeatureChecks(dir)).toEqual(
        ['lint', 'test', 'build'].map((name) => ({
          command: 'pnpm',
          args: ['run', name],
        }))
      );
      expect(await fs.pathExists(path.join(dir, 'executed'))).toBe(false);
    } finally {
      await fs.remove(dir);
    }
  });
  it('falls back to npm scripts when packageManager and lockfiles are absent', async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'lsk-check-discovery-npm-fallback-')
    );
    try {
      await fs.writeJson(path.join(dir, 'package.json'), {
        scripts: { test: 'node --test' },
      });
      expect(await detectFeatureChecks(dir)).toEqual([
        { command: 'npm', args: ['run', 'test'] },
      ]);
    } finally {
      await fs.remove(dir);
    }
  });
});

it('invalidates evidence when only the check policy changes on an identical commit and tree', () => {
  const context = {
    featureTip: 'same-sha', featureTree: 'same-tree', featureChecksHash: 'new-policy',
    state: { status: 'feature_verified', verifiedFeatureTip: 'same-sha', verifiedFeatureTree: 'same-tree', verifiedChecksHash: 'old-policy' },
  } as LocalIntegrationContext;
  expect(isFeatureVerificationCurrent(context)).toBe(false);
  context.state!.verifiedChecksHash = 'new-policy';
  expect(isFeatureVerificationCurrent(context)).toBe(true);
  delete context.state!.verifiedChecksHash;
  expect(isFeatureVerificationCurrent(context)).toBe(false);
});

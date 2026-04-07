import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  leeSpecSchemaAdapter,
  detectLeeSpecProject,
  getNextLeeSpecFeatureId,
  listLeeSpecFeatures,
  resolveLeeSpecFeaturePaths,
} from '../src/adapters/schema/lee-spec-kit/index.ts';
import {
  detectSchemaProject,
  getSchemaAdapterById,
} from '../src/adapters/schema/index.ts';
import { getConfig } from '../src/utils/config.ts';
import { withTempDir } from './helpers/cli-contract-helpers.mjs';

test('detectLeeSpecProject returns config-based detection when .lee-spec-kit.json exists', async () => {
  await withTempDir('lsk-schema-adapter-config-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(path.join(docsDir, 'features'), { recursive: true });
    await fs.mkdir(path.join(docsDir, 'agents'), { recursive: true });
    await fs.writeFile(
      path.join(docsDir, '.lee-spec-kit.json'),
      JSON.stringify(
        {
          projectName: 'demo',
          projectType: 'single',
          lang: 'en',
          createdAt: '2026-04-07',
        },
        null,
        2
      ),
      'utf-8'
    );

    const detected = await detectLeeSpecProject(dir);
    assert.equal(detected.detected, true);
    assert.equal(detected.schemaId, 'lee-spec');
    assert.equal(detected.detectionSource, 'config');
    assert.equal(detected.config?.projectName, 'demo');
    assert.equal(detected.config?.projectType, 'single');
    assert.equal(detected.configPath?.endsWith('.lee-spec-kit.json'), true);
  });
});

test('detectLeeSpecProject falls back to heuristic docs layout detection', async () => {
  await withTempDir('lsk-schema-adapter-heuristic-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(path.join(docsDir, 'features'), { recursive: true });
    await fs.mkdir(path.join(docsDir, 'agents'), { recursive: true });
    await fs.writeFile(
      path.join(docsDir, 'agents', 'custom.md'),
      '한국어 규칙\n',
      'utf-8'
    );

    const detected = await detectLeeSpecProject(dir);
    assert.equal(detected.detected, true);
    assert.equal(detected.detectionSource, 'heuristic');
    assert.equal(detected.config?.projectType, 'single');
    assert.equal(detected.config?.lang, 'ko');
  });
});

test('getNextLeeSpecFeatureId scans multi component roots', async () => {
  await withTempDir('lsk-schema-adapter-next-id-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(path.join(docsDir, 'features', 'app', 'F003-alpha'), {
      recursive: true,
    });
    await fs.mkdir(path.join(docsDir, 'features', 'api', 'F010-beta'), {
      recursive: true,
    });

    const nextId = await getNextLeeSpecFeatureId(docsDir, 'multi', [
      'app',
      'api',
    ]);
    assert.equal(nextId, 'F011');
  });
});

test('resolveLeeSpecFeaturePaths returns schema-aware paths for single and multi projects', () => {
  const single = resolveLeeSpecFeaturePaths({
    docsDir: '/repo/docs',
    projectType: 'single',
    featureId: 'F001',
    featureName: 'alpha',
  });
  assert.equal(single.featuresDir, '/repo/docs/features');
  assert.equal(single.featureDir, '/repo/docs/features/F001-alpha');
  assert.equal(single.featurePathFromDocs, 'features/F001-alpha');

  const multi = resolveLeeSpecFeaturePaths({
    docsDir: '/repo/docs',
    projectType: 'multi',
    component: 'api',
    featureId: 'F002',
    featureName: 'beta',
  });
  assert.equal(multi.featuresDir, '/repo/docs/features/api');
  assert.equal(multi.featureDir, '/repo/docs/features/api/F002-beta');
  assert.equal(multi.featurePathFromDocs, 'features/api/F002-beta');
});

test('listLeeSpecFeatures returns normalized feature refs across single and multi projects', async () => {
  await withTempDir('lsk-schema-adapter-list-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(path.join(docsDir, 'features', 'F001-alpha'), {
      recursive: true,
    });
    await fs.mkdir(path.join(docsDir, 'features', 'api', 'F002-beta'), {
      recursive: true,
    });
    await fs.mkdir(path.join(docsDir, 'features', 'app', 'F010-gamma'), {
      recursive: true,
    });
    await fs.mkdir(path.join(docsDir, 'agents'), { recursive: true });

    const features = await listLeeSpecFeatures(dir);

    assert.deepEqual(features, [
      {
        id: 'F001',
        slug: 'alpha',
        folderName: 'F001-alpha',
      },
      {
        id: 'F002',
        slug: 'beta',
        folderName: 'F002-beta',
        component: 'api',
      },
      {
        id: 'F010',
        slug: 'gamma',
        folderName: 'F010-gamma',
        component: 'app',
      },
    ]);
  });
});

test('schema registry resolves lee-spec detection and config through the generic adapter boundary', async () => {
  await withTempDir('lsk-schema-registry-', async (dir) => {
    const docsDir = path.join(dir, 'docs');
    await fs.mkdir(path.join(docsDir, 'features', 'F001-alpha'), {
      recursive: true,
    });
    await fs.mkdir(path.join(docsDir, 'agents'), { recursive: true });
    await fs.writeFile(
      path.join(docsDir, '.lee-spec-kit.json'),
      JSON.stringify(
        {
          projectName: 'demo',
          projectType: 'single',
          lang: 'en',
          createdAt: '2026-04-07',
        },
        null,
        2
      ),
      'utf-8'
    );

    const detected = await detectSchemaProject(dir);
    assert.equal(detected.detected, true);
    assert.equal(detected.schemaId, 'lee-spec');
    assert.equal(detected.adapter?.schemaId, 'lee-spec');
    assert.equal(detected.config?.schemaId, 'lee-spec');

    const adapter = getSchemaAdapterById('lee-spec');
    assert.equal(adapter, leeSpecSchemaAdapter);
    assert.equal(typeof adapter?.getNextFeatureId, 'function');
    assert.equal(typeof adapter?.resolveFeaturePaths, 'function');

    const config = await getConfig(dir);
    assert.equal(config?.schemaId, 'lee-spec');
  });
});

import { fs, path, ignoreGitArtifacts } from './cli-contract-helpers.mjs';

export async function setupFakeOpenWiki(dir) {
  const binDir = path.join(dir, 'fake-openwiki-bin');
  const packageRoot = path.join(dir, 'fake-openwiki-package');
  const invocationLog = path.join(dir, 'openwiki-invocations.log');
  await ignoreGitArtifacts(dir, [
    '/fake-openwiki-bin/',
    '/fake-openwiki-package/',
    '/fake-openwiki-config/',
    '/openwiki-invocations.log',
  ]);
  await fs.mkdir(binDir, { recursive: true });
  const scriptPath = path.join(packageRoot, 'dist', 'cli', 'cli.js');
  await fs.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.writeFile(
    path.join(packageRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'openwiki',
        version: '0.5.2',
        engines: { node: '>=22' },
        bin: { openwiki: './dist/cli/cli.js' },
      },
      null,
      2
    ),
    'utf-8'
  );
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(invocationLog)}, args.join(' ') + '\\n');
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('OpenWiki v0.5.2\\n');
  process.exit(0);
}
if (args.length === 1 && args[0] === '--version') {
  process.stderr.write('Unknown option: --version\\n');
  process.exit(1);
}
const language = process.env.FAKE_OPENWIKI_LANGUAGE || 'en';
const expectedUpdateCommand = 'code --update --print --language ' + language;
const repairMessage = args[5];
const isRepair = args.length === 6 && repairMessage.startsWith('lee-spec-kit validation repair');
if (args.slice(0, 5).join(' ') !== expectedUpdateCommand || (args.length !== 5 && !isRepair)) {
  process.stderr.write('unexpected OpenWiki arguments: ' + args.join(' '));
  process.exit(2);
}
const root = process.cwd();
const wiki = path.join(root, 'openwiki');
if (process.env.FAKE_OPENWIKI_EXPECT_CONFIG_DIR && process.env.OPENWIKI_CONFIG_DIR !== process.env.FAKE_OPENWIKI_EXPECT_CONFIG_DIR) {
  process.stderr.write('OPENWIKI_CONFIG_DIR was not normalized for the child process');
  process.exit(10);
}
const updateInvocationCount = fs.readFileSync(${JSON.stringify(invocationLog)}, 'utf8')
  .split(/\\r?\\n/u)
  .filter((entry) => entry === expectedUpdateCommand).length;
fs.mkdirSync(wiki, { recursive: true });
if (!fs.existsSync(path.join(wiki, 'INSTRUCTIONS.md'))) {
  process.stderr.write('missing protected instructions');
  process.exit(3);
}
if ((process.env.FAKE_OPENWIKI_REQUIRE_EXISTING_PAGE === '1' || (isRepair && process.env.FAKE_OPENWIKI_REPAIR_REQUIRE_EXISTING_PAGE === '1')) && !fs.existsSync(path.join(wiki, 'architecture map.md'))) {
  process.stderr.write('existing terminal page was reset before retry');
  process.exit(11);
}
const savedRun = fs.existsSync(path.join(wiki, '.run.json')) ? JSON.parse(fs.readFileSync(path.join(wiki, '.run.json'), 'utf8')) : null;
if (process.env.FAKE_OPENWIKI_EXPECT_BASELINE_HEAD) {
  const manifest = JSON.parse(fs.readFileSync(path.join(wiki, '.page-manifest.json'), 'utf8'));
  if (manifest.pages['/openwiki/architecture map.md'].gitHead !== process.env.FAKE_OPENWIKI_EXPECT_BASELINE_HEAD) process.exit(31);
}
if (process.env.FAKE_OPENWIKI_EXPECT_RESUME === '1') {
  if (!savedRun || savedRun.plan.pages[0].status !== 'complete') process.exit(32);
  const last = JSON.parse(fs.readFileSync(path.join(wiki, '.last-update.json'), 'utf8'));
  last.status = 'complete';
  fs.writeFileSync(path.join(wiki, '.last-update.json'), JSON.stringify(last));
  fs.unlinkSync(path.join(wiki, '.run.json'));
  finalizeEntrypoints();
  process.exit(0);
}
const runId = (isRepair ? process.env.FAKE_OPENWIKI_REPAIR_RUN_ID : savedRun?.runId || process.env.FAKE_OPENWIKI_RUN_ID) || 'fake-run';
const interruptedMode = process.env.FAKE_OPENWIKI_INTERRUPTED || '';
const pageStatus = interruptedMode === 'skipped' ? 'skipped' : (!isRepair && (process.env.FAKE_OPENWIKI_FAIL === '1' || process.env.FAKE_OPENWIKI_SLEEP_MS) ? 'pending' : 'complete');
const initialPages = fs.existsSync(path.join(wiki, 'architecture map.md')) ? ['/openwiki/architecture map.md'] : [];
const baseGitHead = fs.existsSync(path.join(wiki, '.last-update.json')) ? JSON.parse(fs.readFileSync(path.join(wiki, '.last-update.json'), 'utf8')).gitHead : undefined;
fs.writeFileSync(path.join(wiki, '.run.json'), JSON.stringify({ schemaVersion: 1, runId, mode: 'update', phase: 'generating', initialPages, baseGitHead, plan: { pages: [{ path: '/openwiki/architecture map.md', status: pageStatus, seedPaths: ['README.md#L1-L1'], instructions: [process.env.FAKE_OPENWIKI_PLAN_SECRET || ''] }] } }, null, 2) + '\\n');
if (process.env.FAKE_OPENWIKI_FAIL === '1') {
  process.stderr.write('simulated provider failure\\n');
  process.exit(7);
}
const sleepMs = Number((isRepair ? process.env.FAKE_OPENWIKI_REPAIR_SLEEP_MS : undefined) || process.env.FAKE_OPENWIKI_SLEEP_MS || 0);
if (sleepMs > 0) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepMs);
}
if (process.env.FAKE_OPENWIKI_ASSERT_RUN_OWNER_IGNORE === '1') {
  const ignoreLines = fs.readFileSync(path.join(root, '.openwikiignore'), 'utf8')
    .split(/\\r?\\n/u)
    .map((line) => line.trim());
  if (!ignoreLines.includes('.lee-spec-kit/openwiki-run.json')) {
    process.stderr.write('run owner is visible to OpenWiki source fingerprint\\n');
    process.exit(8);
  }
  const owner = JSON.parse(fs.readFileSync(path.join(root, '.lee-spec-kit', 'openwiki-run.json'), 'utf8'));
  if (owner.runId !== runId) {
    process.stderr.write('lee-spec-kit did not persist the observed OpenWiki run id\\n');
    process.exit(9);
  }
}
const repaired = isRepair && process.env.FAKE_OPENWIKI_REPAIR_SUCCEEDS === '1';
const requestedIndexLink = process.env.FAKE_OPENWIKI_INDEX_LINK || 'architecture%20map.md';
const indexLink = repaired && requestedIndexLink.startsWith('/openwiki/') ? requestedIndexLink.slice('/openwiki/'.length) : requestedIndexLink;
fs.writeFileSync(path.join(wiki, 'index.md'), '---\\nokf_version: "0.2"\\n---\\n# Demo Knowledge\\n\\n[Architecture](' + indexLink + ')\\n');
const citationMode = process.env.FAKE_OPENWIKI_CITATION_MODE || '';
const staleCitation = !repaired && (citationMode === 'stale' || (citationMode === 'stale-first' && updateInvocationCount === 1));
const citation = citationMode ? '\\nEvidence: \`README.md#L1-L' + (staleCitation ? '99' : '1') + '\`\\n' : '';
const sourceLink = !repaired && process.env.FAKE_OPENWIKI_OMIT_SOURCE_LINK === '1'
  ? 'README is the demo entrypoint.'
  : 'The tracked [README](repo://' + ((!repaired && process.env.FAKE_OPENWIKI_SOURCE_LINK_TARGET) || 'README.md#L1-L1') + ') is the demo entrypoint.';
const pageProse = repaired ? '' : process.env.FAKE_OPENWIKI_PAGE_PROSE
  ? process.env.FAKE_OPENWIKI_PAGE_PROSE + '\\n'
  : '';
const brokenLinkMode = process.env.FAKE_OPENWIKI_BROKEN_LINK_MODE || '';
const brokenLink = !repaired && (brokenLinkMode === 'always' ||
  (brokenLinkMode === 'first' && updateInvocationCount === 1) ||
  (brokenLinkMode === 'second' && updateInvocationCount === 2))
  ? '\\n<!-- openwiki: broken internal link [/openwiki/missing.md] file "/openwiki/missing.md" does not exist. Fix the href or restore the target, then delete this comment. -->\\n[Missing](/openwiki/missing.md)\\n'
  : repaired && brokenLinkMode ? '\\n[Missing](missing.md)\\n' : '';
const pageContent = '---\\ntype: concept\\n---\\n# Architecture\\n\\n' + pageProse + sourceLink + '\\n' + citation + brokenLink;
fs.writeFileSync(path.join(wiki, 'architecture map.md'), pageContent);
const pageVersion = 'sha256:' + crypto.createHash('sha256').update(Buffer.from(pageContent)).digest('hex');
const claimMode = process.env.FAKE_OPENWIKI_CLAIM_MODE || 'valid';
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const firstLine = (readme.match(/[^\\n]*\\n|[^\\n]+$/gu) || [])[0] || '';
const validHash = crypto.createHash('sha256').update(firstLine).digest('hex');
const staleClaim = claimMode === 'stale' || (claimMode === 'stale-first' && !isRepair && updateInvocationCount === 1);
const evidenceMode = process.env.FAKE_OPENWIKI_EVIDENCE_MODE || 'line';
const evidencePath = process.env.FAKE_OPENWIKI_EVIDENCE_PATH || 'README.md';
let evidenceResource = 'repo://README.md#L1-L1';
let evidenceVersion = 'repo-lines-v1:sha256:' + (staleClaim ? '0'.repeat(64) : validHash) + ':fixture';
if (evidenceMode === 'relocated') {
  const lines = readme.match(/[^\\n]*\\n|[^\\n]+$/gu) || [];
  const index = lines.findIndex(line => line === '# Demo\\n');
  const hash = text => crypto.createHash('sha256').update(text).digest('hex');
  const metadata = { selectedLineCount: 1, firstSelectedLineHash: hash(lines[index]), lastSelectedLineHash: hash(lines[index]), precedingContextLineCount: Math.min(index, 3), precedingContextHash: hash(lines.slice(Math.max(0,index-3),index).join('')), followingContextLineCount: Math.min(lines.length-index-1,3), followingContextHash: hash(lines.slice(index+1,index+4).join('')) };
  evidenceVersion = 'repo-lines-v1:sha256:' + hash(lines[index]) + ':' + Buffer.from(JSON.stringify(metadata)).toString('base64url');
} else if (evidenceMode === 'file' || evidenceMode === 'file-stale') {
  const fileHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, evidencePath))).digest('hex');
  evidenceResource = 'repo://' + evidencePath;
  evidenceVersion = 'repo-file-v1:sha256:' + (evidenceMode === 'file-stale' ? '0'.repeat(64) : fileHash);
} else if (evidenceMode === 'unsupported') {
  evidenceResource = 'repo://README.md';
  evidenceVersion = 'repo-symbol-v1:sha256:' + validHash;
}
const claimRoot = path.join(wiki, '.claims');
fs.mkdirSync(claimRoot, { recursive: true });
fs.writeFileSync(path.join(claimRoot, 'architecture map.json'), JSON.stringify({
  schemaVersion: 1,
  pageVersion,
  claims: [{
    id: 'claim_demo',
    statement: 'README is the entrypoint.',
    evidence: [{
      resource: evidenceResource,
      version: evidenceVersion
    }]
  }]
}, null, 2) + '\\n');
const sourceHead = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const openwikiSourceFingerprint = 'sha256:' + crypto.createHash('sha256').update(sourceHead).digest('hex');
const manifestPages = {
  '/openwiki/architecture map.md': {
    pageVersion,
    completedBy: 'openwiki/0.5.2',
    completedRunId: runId,
    gitHead: sourceHead,
    sourceFingerprint: openwikiSourceFingerprint
  }
};
if (repaired && brokenLinkMode) {
  const restoredContent = '---\\ntype: concept\\n---\\n# Restored topic\\n\\nRead the [README](repo://README.md#L1-L1).\\n';
  fs.writeFileSync(path.join(wiki, 'missing.md'), restoredContent);
  const restoredVersion = 'sha256:' + crypto.createHash('sha256').update(Buffer.from(restoredContent)).digest('hex');
  manifestPages['/openwiki/missing.md'] = { ...manifestPages['/openwiki/architecture map.md'], pageVersion: restoredVersion };
  const restoredClaims = JSON.parse(fs.readFileSync(path.join(claimRoot, 'architecture map.json'), 'utf8'));
  restoredClaims.pageVersion = restoredVersion;
  fs.writeFileSync(path.join(claimRoot, 'missing.json'), JSON.stringify(restoredClaims));
}
if (process.env.FAKE_OPENWIKI_EXTRA_PAGE === '1') {
  const extraDirectory = path.join(wiki, 'operations');
  fs.mkdirSync(extraDirectory, { recursive: true });
  const extraContent = '---\\ntype: concept\\n---\\n# Operations\\n\\nSee the tracked [README](repo://README.md#L1-L1).\\n';
  fs.writeFileSync(path.join(extraDirectory, 'extra.md'), extraContent);
  const extraVersion = 'sha256:' + crypto.createHash('sha256').update(Buffer.from(extraContent)).digest('hex');
  manifestPages['/openwiki/operations/extra.md'] = {
    pageVersion: extraVersion,
    completedBy: 'openwiki/0.5.2',
    completedRunId: 'fake-prior-run',
    gitHead: sourceHead,
    sourceFingerprint: openwikiSourceFingerprint
  };
  const extraClaimDirectory = path.join(claimRoot, 'operations');
  fs.mkdirSync(extraClaimDirectory, { recursive: true });
  fs.writeFileSync(path.join(extraClaimDirectory, 'extra.json'), JSON.stringify({
    schemaVersion: 1,
    pageVersion: extraVersion,
    claims: []
  }, null, 2) + '\\n');
}
fs.writeFileSync(path.join(wiki, '.page-manifest.json'), JSON.stringify({
  schemaVersion: 1,
  pages: manifestPages
}, null, 2) + '\\n');
fs.writeFileSync(path.join(wiki, '.last-update.json'), JSON.stringify({
  updatedAt: new Date().toISOString(),
  command: 'update',
  gitHead: sourceHead,
  model: 'gpt-5.6-terra',
  status: interruptedMode ? 'interrupted' : 'complete',
  language
}, null, 2) + '\\n');
if (process.env.FAKE_OPENWIKI_FAIL_AFTER_PAGE === '1' || process.env.FAKE_OPENWIKI_PAUSE_AFTER_PAGE_MS) {
  const durable = JSON.parse(fs.readFileSync(path.join(wiki, '.run.json'), 'utf8'));
  durable.plan.pages[0].status = 'complete';
  durable.phase = 'finalizing';
  fs.writeFileSync(path.join(wiki, '.run.json'), JSON.stringify(durable));
  const last = JSON.parse(fs.readFileSync(path.join(wiki, '.last-update.json'), 'utf8'));
  last.status = 'interrupted';
  fs.writeFileSync(path.join(wiki, '.last-update.json'), JSON.stringify(last));
  if (process.env.FAKE_OPENWIKI_FAIL_AFTER_PAGE === '1') process.exit(7);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.FAKE_OPENWIKI_PAUSE_AFTER_PAGE_MS));
  last.status = 'complete';
  fs.writeFileSync(path.join(wiki, '.last-update.json'), JSON.stringify(last));
}
fs.unlinkSync(path.join(wiki, '.run.json'));
finalizeEntrypoints();
function finalizeEntrypoints() {
const begin = '<!-- OPENWIKI:START -->';
const end = '<!-- OPENWIKI:END -->';
const block = begin + '\\n## OpenWiki\\n\\nRead openwiki/index.md as derived evidence.\\n' + end;
for (const fileName of ['AGENTS.md', 'CLAUDE.md']) {
  const target = path.join(root, fileName);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const start = current.indexOf(begin);
  const finish = current.indexOf(end);
  const next = start >= 0 && finish > start
    ? current.slice(0, start) + block + current.slice(finish + end.length)
    : current.trimEnd() + (current.trim() ? '\\n\\n' : '') + block + '\\n';
  fs.writeFileSync(target, next);
}
}
if (process.env.FAKE_OPENWIKI_TAMPER_WRITING_SKILL === '1') {
  fs.appendFileSync(path.join(process.env.OPENWIKI_CONFIG_DIR, 'skills', 'lee-spec-kit-technical-writing', 'SKILL.md'), '\\nconcurrent tamper\\n');
}
if (isRepair && process.env.FAKE_OPENWIKI_REPAIR_SOURCE_DRIFT === '1') {
  fs.appendFileSync(path.join(root, 'README.md'), '\\nsource drift during repair\\n');
}
if (process.env.FAKE_OPENWIKI_FAIL_AFTER_FINISH === '1') process.exit(7);
process.stdout.write('updated\\n');
`,
    'utf-8'
  );
  await fs.chmod(scriptPath, 0o755);
  return {
    invocationLog,
    packageJsonPath: path.join(packageRoot, 'package.json'),
    scriptPath,
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      LEE_SPEC_KIT_OPENWIKI_BIN: scriptPath,
      OPENWIKI_CONFIG_DIR: path.join(dir, 'fake-openwiki-config'),
      OPENWIKI_PROVIDER: 'openai',
      OPENWIKI_MODEL_ID: 'gpt-5.6-terra',
      OPENAI_API_KEY: 'fake-openwiki-test-key',
    },
  };
}

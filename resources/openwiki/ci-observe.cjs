// OpenWiki 0.7.2 CI observation only: one CLI invocation, no generation or retries.
// Official state: src/generation/{run-state,page-manifest}.ts and telemetry/senders.ts.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const choose = (value, allowed) =>
  allowed.includes(value) ? value : undefined;
const sha = (value) =>
  typeof value === 'string' && /^[a-f0-9]{40,64}$/u.test(value)
    ? value
    : undefined;
const hash = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const sensitiveValues = () =>
  Object.entries(process.env)
    .filter(
      ([key, value]) =>
        /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/iu.test(key) && value
    )
    .map(([, value]) => value);
const containsSecret = (bytes) =>
  sensitiveValues().some((value) => bytes.includes(value));
const containsDecodedSecret = (value) => {
  if (typeof value === 'string') return containsSecret(Buffer.from(value));
  if (value && typeof value === 'object')
    return Object.values(value).some(containsDecodedSecret);
  return false;
};

// Never follow a symlink, including an intermediate directory. Do not emit paths
// or parse errors, which can contain user data. Bound reads of damaged files.
function read(root, relative) {
  try {
    const parts = relative.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..'))
      return undefined;
    let current = root;
    for (const part of parts) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) return undefined;
    }
    const stat = fs.statSync(current);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) return undefined;
    return fs.readFileSync(current);
  } catch {
    return undefined;
  }
}

function json(root, relative) {
  const bytes = read(root, relative);
  if (!bytes)
    return {
      state: fs.existsSync(path.join(root, relative))
        ? 'unreadable'
        : 'missing',
    };
  try {
    return { state: 'present', value: JSON.parse(bytes) };
  } catch {
    return { state: 'invalid' };
  }
}

function observe(root, sourceSha) {
  const run = json(root, 'openwiki/.run.json');
  const manifest = json(root, 'openwiki/.page-manifest.json');
  const last = json(root, 'openwiki/.last-update.json');
  const pages =
    run.value?.schemaVersion === 1 && Array.isArray(run.value?.plan?.pages)
      ? run.value.plan.pages
      : [];
  return {
    observedAt: new Date().toISOString(),
    runState: run.state,
    phase: choose(run.value?.phase, ['planning', 'generating']) || 'unknown',
    queue: {
      total: pages.length,
      complete: pages.filter((page) => page?.status === 'complete').length,
      pending: pages.filter((page) => page?.status === 'pending').length,
      skipped: pages.filter((page) => page?.status === 'skipped').length,
    },
    manifestState: manifest.state,
    coveredPages:
      manifest.value?.schemaVersion === 1 &&
      manifest.value?.pages &&
      typeof manifest.value.pages === 'object'
        ? Object.keys(manifest.value.pages).length
        : 0,
    lastUpdateState: last.state,
    lastStatus:
      choose(last.value?.status, ['complete', 'interrupted']) || 'unknown',
    sourceMatches: Boolean(sha(sourceSha) && last.value?.gitHead === sourceSha),
    complete: Boolean(
      sha(sourceSha) &&
      last.value?.status === 'complete' &&
      last.value?.gitHead === sourceSha &&
      run.state === 'missing'
    ),
  };
}

const errorDetails = {
  config_error: [
    'missing_credentials',
    'missing_base_url',
    'missing_secret_key',
    'missing_region',
    'invalid_model',
  ],
  filesystem_error: ['not_found', 'permission', 'no_space'],
  provider_error: [
    'auth',
    'rate_limit',
    'overloaded',
    'server_error',
    'timeout',
    'quota_exceeded',
    'content_filter',
  ],
  network_error: ['dns', 'refused', 'reset', 'unreachable'],
  build_error: ['run_context', 'snapshot', 'model', 'agent', 'stream_open'],
  okf_error: [
    'migrate',
    'provenance_snapshot',
    'mermaid',
    'index_sync',
    'link_validation',
    'claims_sources',
    'generated_provenance',
  ],
  checkpointer_error: ['create', 'persist', 'chmod'],
  output_error: ['json_parse', 'schema'],
  context_limit_error: [],
  agent_error: [],
  aborted: [],
  connector_error: [],
  tool_error: [],
};

function telemetry(directory) {
  const record = json(directory, 'telemetry.json');
  const properties = record.value?.event?.properties || {};
  const errorClass = choose(properties.error_class, Object.keys(errorDetails));
  return {
    state: record.state,
    disabled: record.value?.disabled === true,
    outcome: choose(properties.outcome, ['success', 'failure', 'noop']),
    errorClass,
    // Free-form tool/connector ids and agent error names are deliberately omitted.
    errorDetail: choose(
      properties.error_detail,
      errorDetails[errorClass] || []
    ),
    errorStage: choose(properties.error_stage, [
      'config',
      'build',
      'run',
      'finalize',
    ]),
    errorOwner: choose(properties.error_owner, [
      'environment',
      'provider',
      'openwiki',
      'unowned',
      'control',
    ]),
    httpStatus:
      Number.isInteger(properties.http_status) &&
      properties.http_status >= 100 &&
      properties.http_status <= 599
        ? properties.http_status
        : undefined,
  };
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `${name}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporary, path.join(directory, name));
}

// Stage every byte and backup before replacing any retained file. A failed
// write leaves the old Markdown/Claims/ledger together; recoverable rename
// errors restore that set. Staging is outside both artifact upload paths.
function replaceCheckpointFiles(directory, files) {
  fs.mkdirSync(directory, { recursive: true });
  const staging = fs.mkdtempSync(path.join(directory, 'staging-'));
  const target = path.join(directory, 'checkpoint');
  const entries = [];
  const changed = [];
  try {
    for (const [index, [relative, bytes]] of files.entries()) {
      const destination = path.join(target, relative);
      const staged = path.join(staging, `${index}.new`);
      const backup = path.join(staging, `${index}.old`);
      fs.writeFileSync(staged, bytes, { mode: 0o600 });
      const existed = fs.existsSync(destination);
      if (existed) fs.copyFileSync(destination, backup);
      entries.push({ destination, staged, backup, existed });
    }
    for (const entry of entries) {
      fs.mkdirSync(path.dirname(entry.destination), { recursive: true });
      fs.renameSync(entry.staged, entry.destination);
      changed.push(entry);
    }
  } catch (error) {
    for (const entry of changed.reverse()) {
      if (entry.existed) fs.renameSync(entry.backup, entry.destination);
      else fs.rmSync(entry.destination, { force: true });
    }
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// Retain only pages already recorded in OpenWiki's durable manifest, with the
// exact Markdown and verified Claims hash. This is an export, not a replacement
// validator or resumable queue. Never export INSTRUCTIONS, .run, logs or config.
function checkpoint(root, directory, maxBytes = 64 * 1024 * 1024) {
  const manifest = json(root, 'openwiki/.page-manifest.json').value;
  const target = path.join(directory, 'checkpoint');
  const exported = json(target, 'openwiki/.page-manifest.json').value;
  const kept =
    exported?.schemaVersion === 1 && exported.pages ? exported.pages : {};
  let excluded = 0;
  let size = 0;
  if (
    manifest?.schemaVersion === 1 &&
    manifest.pages &&
    typeof manifest.pages === 'object'
  ) {
    for (const [page, entry] of Object.entries(manifest.pages)) {
      if (
        !page.startsWith('/openwiki/') ||
        !page.endsWith('.md') ||
        containsSecret(Buffer.from(page)) ||
        page
          .split('/')
          .slice(2)
          .some(
            (part) =>
              !part ||
              part.startsWith('.') ||
              /^(?:instructions|log)\.md$/iu.test(part)
          )
      ) {
        excluded++;
        continue;
      }
      const relative = page.slice(1);
      const claimsPath = relative
        .replace(/^openwiki\//u, 'openwiki/.claims/')
        .replace(/\.md$/u, '.json');
      const markdown = read(root, relative);
      const claims = read(root, claimsPath);
      let sidecar;
      try {
        sidecar = JSON.parse(claims);
      } catch {
        /* Exclude unverified or partial pages. */
      }
      if (
        !markdown ||
        !claims ||
        !entry ||
        hash(markdown) !== entry.pageVersion ||
        sidecar?.schemaVersion !== 1 ||
        sidecar?.pageVersion !== entry.pageVersion ||
        !sidecar?.verification ||
        !Array.isArray(sidecar.claims) ||
        typeof sidecar.verification.by !== 'string' ||
        typeof sidecar.verification.at !== 'string' ||
        containsSecret(markdown) ||
        containsSecret(claims) ||
        containsDecodedSecret(sidecar) ||
        size + markdown.length + claims.length > maxBytes
      ) {
        excluded++;
        continue;
      }
      if (
        sidecar.claims.some(
          (claim) =>
            typeof claim?.id !== 'string' ||
            typeof claim?.statement !== 'string' ||
            !Array.isArray(claim?.evidence) ||
            claim.evidence.some(
              (evidence) =>
                typeof evidence?.resource !== 'string' ||
                typeof evidence?.version !== 'string'
            )
        )
      ) {
        excluded++;
        continue;
      }
      const safeClaims = Buffer.from(
        JSON.stringify(
          {
            schemaVersion: 1,
            pageVersion: sidecar.pageVersion,
            claims: sidecar.claims.map((claim) => ({
              id: claim.id,
              statement: claim.statement,
              evidence: claim.evidence.map((evidence) => ({
                resource: evidence.resource,
                version: evidence.version,
              })),
            })),
            verification: {
              by: sidecar.verification.by,
              at: sidecar.verification.at,
            },
          },
          null,
          2
        ) + '\n'
      );
      if (size + markdown.length + safeClaims.length > maxBytes) {
        excluded++;
        continue;
      }
      if (containsSecret(safeClaims)) {
        excluded++;
        continue;
      }
      const coverage = {
        pageVersion: entry.pageVersion,
        gitHead: sha(entry.gitHead),
        sourceFingerprint:
          typeof entry.sourceFingerprint === 'string' &&
          /^sha256:[a-f0-9]{64}$/u.test(entry.sourceFingerprint)
            ? entry.sourceFingerprint
            : undefined,
      };
      const ledger = { schemaVersion: 1, pages: { ...kept, [page]: coverage } };
      replaceCheckpointFiles(directory, [
        [relative, markdown],
        [claimsPath, safeClaims],
        [
          'openwiki/.page-manifest.json',
          Buffer.from(JSON.stringify(ledger, null, 2) + '\n'),
        ],
      ]);
      kept[page] = coverage;
      size += markdown.length + safeClaims.length;
    }
  }
  if (!fs.existsSync(path.join(target, 'openwiki/.page-manifest.json')))
    writeJson(path.join(target, 'openwiki'), '.page-manifest.json', {
      schemaVersion: 1,
      pages: kept,
    });
  // Never forge successful whole-run metadata for a limited page export.
  // Structural indexes can mention pending pages and are deliberately excluded.
  return {
    retainedPages: Object.keys(kept).length,
    excludedFilesOrPages: excluded,
  };
}

async function run(
  command,
  { root, directory, sourceSha, intervalMs = 30000 }
) {
  const started = Date.now();
  const diagnostics = path.join(directory, 'diagnostics');
  let signal;
  let spawnFailed = false;
  let observationFailed = false;
  let killTimer;
  function sample(exitCode) {
    const state = observe(root, sourceSha);
    const result = {
      ...state,
      elapsedSeconds: Math.floor((Date.now() - started) / 1000),
      sourceSha: sha(sourceSha),
      signal,
      exitCode,
      spawnFailed,
      observationFailed,
      telemetry: telemetry(directory),
      checkpoint: checkpoint(root, directory),
    };
    writeJson(diagnostics, 'status.json', result);
    // Fixed enums and numeric counts only; no page names, prompts or raw errors.
    const line = `[OpenWiki] ${result.elapsedSeconds}s phase=${state.phase} complete=${state.queue.complete}/${state.queue.total} pending=${state.queue.pending} skipped=${state.queue.skipped} covered=${state.coveredPages} status=${state.lastStatus}`;
    process.stdout.write(`${line}\n`);
    fs.appendFileSync(
      path.join(diagnostics, 'progress.ndjson'),
      `${JSON.stringify(result)}\n`,
      { mode: 0o600 }
    );
    return result;
  }
  function sampleSafely(exitCode) {
    try {
      return sample(exitCode);
    } catch {
      observationFailed = true;
      process.stderr.write('OpenWiki observation could not retain a sample.\n');
      return undefined;
    }
  }
  // One child, inheriting the caller's provider configuration unchanged. Raw CLI
  // output is discarded: provider errors may echo credentials or prompt bodies.
  const child = spawn(command[0], command.slice(1), {
    cwd: root,
    env: process.env,
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });
  const forward = (nextSignal) => {
    if (signal) return;
    signal = nextSignal;
    const kill = (value) => {
      try {
        if (process.platform !== 'win32' && child.pid)
          process.kill(-child.pid, value);
        else child.kill(value);
      } catch {
        /* Child may already have exited. */
      }
    };
    kill(nextSignal);
    killTimer = setTimeout(() => kill('SIGKILL'), 6000);
  };
  const onInt = () => forward('SIGINT');
  const onTerm = () => forward('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  sampleSafely();
  const timer = setInterval(() => sampleSafely(), intervalMs);
  const outcome = await new Promise((resolve) => {
    child.on('error', () => {
      spawnFailed = true;
    });
    child.on('close', (code, childSignal) => resolve({ code, childSignal }));
  });
  clearInterval(timer);
  clearTimeout(killTimer);
  process.off('SIGINT', onInt);
  process.off('SIGTERM', onTerm);
  const code =
    signal === 'SIGINT'
      ? 130
      : signal === 'SIGTERM'
        ? 143
        : (outcome.code ?? 1);
  sampleSafely(code);
  return code === 0 && observationFailed ? 1 : code;
}

function collect(root, directory, sourceSha) {
  // A forced kill can bypass the final sample. Re-observe before CI removes
  // .run.json; retain previous safe exports, never copy raw execution context.
  const state = observe(root, sourceSha);
  // Provider secrets are scoped to the generation step. A later step cannot
  // safely export fresh prose without that secret filter; use captured exports.
  const savedPages = json(
    path.join(directory, 'checkpoint'),
    'openwiki/.page-manifest.json'
  ).value?.pages;
  const saved = {
    retainedPages: savedPages ? Object.keys(savedPages).length : 0,
  };
  writeJson(path.join(directory, 'diagnostics'), 'collection.json', {
    ...state,
    generation: choose(process.env.OPENWIKI_OUTCOME, [
      'success',
      'failure',
      'cancelled',
      'skipped',
    ]),
    cancelled: process.env.OPENWIKI_CANCELLED === 'true',
    telemetry: telemetry(directory),
    checkpoint: saved,
  });
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### OpenWiki observation\n\nGeneration: ${choose(process.env.OPENWIKI_OUTCOME, ['success', 'failure', 'cancelled', 'skipped']) || 'unknown'}; cancelled: ${process.env.OPENWIKI_CANCELLED === 'true'}.\n\nDurable queue: ${state.queue.complete}/${state.queue.total} complete, ${state.queue.skipped} skipped. Manifest: ${state.coveredPages} covered pages. See the safe observation artifact and draft Knowledge PR. Forced termination or runner loss can prevent final collection, upload and publication. Checkpoint exports exclude raw run context and require reviewed recovery with OpenWiki.\n`
    );
}

module.exports = { observe, telemetry, checkpoint, run, collect };
if (require.main === module) {
  const directory = process.env.OPENWIKI_CI_DIR;
  if (!directory) throw new Error('OPENWIKI_CI_DIR is required');
  const mode = process.argv[2];
  const root = process.cwd();
  if (mode === 'collect') collect(root, directory, process.env.SOURCE_SHA);
  else if (mode === 'run' && process.argv[3] === '--' && process.argv[4]) {
    run(process.argv.slice(4), {
      root,
      directory,
      sourceSha: process.env.SOURCE_SHA,
    })
      .then((code) => {
        process.exitCode = code;
      })
      .catch(() => {
        process.stderr.write(
          'OpenWiki observation failed; inspect the workflow state.\n'
        );
        process.exitCode = 1;
      });
  } else throw new Error('Expected run -- <command> or collect');
}

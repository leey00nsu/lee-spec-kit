import path from 'path';
import fs from 'fs-extra';
import { createHash, randomUUID } from 'crypto';
import {
  getApprovalTicketStorePath,
  getDocsLockPath,
  withFileLock,
} from '../lock.js';
import { createCliError } from '../cli-error.js';

export interface ApprovalTicketRecord {
  token: string;
  sessionId: string;
  contextVersion: string;
  actionHash: string;
  label: string;
  featureRef: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

interface ApprovalTicketStore {
  tickets: ApprovalTicketRecord[];
}

interface ApprovalTicketConfig {
  docsDir: string;
}

const LEGACY_APPROVAL_TICKET_FILENAME = '.lee-spec-kit.approval-tickets.json';
const APPROVAL_TICKET_TTL_MS = 5 * 60 * 1000;

function getApprovalSessionId(): string {
  const explicit = (process.env.LEE_SPEC_KIT_SESSION_ID || '').trim();
  if (explicit) return explicit;
  const terminalSession = (
    process.env.TERM_SESSION_ID ||
    process.env.WT_SESSION ||
    process.env.TMUX_PANE ||
    ''
  ).trim();
  if (terminalSession) return terminalSession;
  // Do not bind tickets to transient wrapper PIDs (for example, npx),
  // because split approve/execute commands can run with different parent PIDs.
  return '';
}

function getApprovalTicketPaths(
  config: ApprovalTicketConfig
): { runtimePath: string; legacyPath: string } {
  return {
    runtimePath: getApprovalTicketStorePath(config.docsDir),
    legacyPath: path.join(config.docsDir, LEGACY_APPROVAL_TICKET_FILENAME),
  };
}

async function loadApprovalTicketStore(storePath: string): Promise<ApprovalTicketStore> {
  if (!(await fs.pathExists(storePath))) return { tickets: [] };
  try {
    const parsed = await fs.readJson(storePath);
    if (!parsed || !Array.isArray(parsed.tickets)) return { tickets: [] };
    return { tickets: parsed.tickets as ApprovalTicketRecord[] };
  } catch {
    return { tickets: [] };
  }
}

async function saveApprovalTicketStore(
  storePath: string,
  payload: Record<string, unknown>
): Promise<void> {
  await fs.ensureDir(path.dirname(storePath));
  await fs.writeJson(storePath, payload, { spaces: 2 });
}

function pruneApprovalTickets(
  tickets: ApprovalTicketRecord[],
  nowMs: number
): ApprovalTicketRecord[] {
  return tickets.filter((ticket) => {
    if (ticket.usedAt) return false;
    const expiresAtMs = Date.parse(ticket.expiresAt || '');
    if (!Number.isFinite(expiresAtMs)) return false;
    return expiresAtMs > nowMs;
  });
}

async function resolveApprovalTicketStoreAndPath(
  config: ApprovalTicketConfig,
  nowMs: number
): Promise<{ storePath: string; store: ApprovalTicketStore }> {
  const { runtimePath, legacyPath } = getApprovalTicketPaths(config);
  if (await fs.pathExists(runtimePath)) {
    return {
      storePath: runtimePath,
      store: await loadApprovalTicketStore(runtimePath),
    };
  }

  if (!(await fs.pathExists(legacyPath))) {
    return {
      storePath: runtimePath,
      store: { tickets: [] },
    };
  }

  const legacyStore = await loadApprovalTicketStore(legacyPath);
  const migrated = pruneApprovalTickets(legacyStore.tickets, nowMs);
  await saveApprovalTicketStore(
    runtimePath,
    {
      tickets: migrated,
      updatedAt: new Date(nowMs).toISOString(),
      migratedFrom: legacyPath,
    }
  );
  await fs.remove(legacyPath).catch(() => {
    // Best-effort cleanup of legacy docs-scoped ticket file.
  });

  return {
    storePath: runtimePath,
    store: { tickets: migrated },
  };
}

export function toApprovalActionHash(payload: {
  label: string;
  action: unknown;
}): string {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 24);
}

export async function issueApprovalTicket(
  config: ApprovalTicketConfig,
  payload: Pick<ApprovalTicketRecord, 'contextVersion' | 'actionHash' | 'label' | 'featureRef'>
): Promise<ApprovalTicketRecord> {
  const sessionId = getApprovalSessionId();
  const nowMs = Date.now();
  const record: ApprovalTicketRecord = {
    token: randomUUID().replace(/-/g, ''),
    sessionId,
    contextVersion: payload.contextVersion,
    actionHash: payload.actionHash,
    label: payload.label,
    featureRef: payload.featureRef,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + APPROVAL_TICKET_TTL_MS).toISOString(),
  };
  const lockPath = getDocsLockPath(config.docsDir);
  return withFileLock(
    lockPath,
    async () => {
      const { storePath, store } = await resolveApprovalTicketStoreAndPath(
        config,
        nowMs
      );
      const nextTickets = pruneApprovalTickets(store.tickets, nowMs);
      nextTickets.push(record);
      await saveApprovalTicketStore(
        storePath,
        {
          tickets: nextTickets,
          updatedAt: new Date(nowMs).toISOString(),
        }
      );
      return record;
    },
    { owner: 'context-approval-ticket:issue' }
  );
}

export async function consumeApprovalTicket(
  config: ApprovalTicketConfig,
  token: string,
  expected: Pick<
    ApprovalTicketRecord,
    'contextVersion' | 'actionHash' | 'label' | 'featureRef'
  >
): Promise<ApprovalTicketRecord> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw createCliError(
      'APPROVAL_REQUIRED',
      'Execution requires an approval ticket. Run `context --approve <reply> --json` first and pass `--ticket <token>`.'
    );
  }
  const lockPath = getDocsLockPath(config.docsDir);
  const sessionId = getApprovalSessionId();
  const nowMs = Date.now();

  return withFileLock(
    lockPath,
    async () => {
      const { storePath, store } = await resolveApprovalTicketStoreAndPath(
        config,
        nowMs
      );
      const cleaned = pruneApprovalTickets(store.tickets, nowMs);
      const index = cleaned.findIndex((entry) => entry.token === normalizedToken);
      if (index < 0) {
        await saveApprovalTicketStore(storePath, {
          tickets: cleaned,
          updatedAt: new Date(nowMs).toISOString(),
        });
        throw createCliError(
          'INVALID_APPROVAL',
          'Unknown or expired approval ticket. Re-run `context` and approve again.'
        );
      }

      const record = cleaned[index];
      const expiresAtMs = Date.parse(record.expiresAt || '');
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
        cleaned.splice(index, 1);
        await saveApprovalTicketStore(storePath, {
          tickets: cleaned,
          updatedAt: new Date(nowMs).toISOString(),
        });
        throw createCliError(
          'CONTEXT_STALE',
          'Approval ticket expired. Run `context` again and re-approve.'
        );
      }

      if (record.sessionId && record.sessionId !== sessionId) {
        throw createCliError(
          'INVALID_APPROVAL',
          'Approval ticket session mismatch. Re-run `context` in the current session and approve again.'
        );
      }
      if (record.label !== expected.label) {
        throw createCliError(
          'INVALID_APPROVAL',
          `Approval ticket label mismatch. Ticket=${record.label}, expected=${expected.label}.`
        );
      }
      if (record.contextVersion !== expected.contextVersion) {
        throw createCliError(
          'CONTEXT_STALE',
          'Context changed after approval. Run `context` again and re-approve.'
        );
      }
      if (record.actionHash !== expected.actionHash) {
        throw createCliError(
          'CONTEXT_STALE',
          'Selected action changed after approval. Run `context` again and re-approve.'
        );
      }
      if (record.featureRef !== expected.featureRef) {
        throw createCliError(
          'INVALID_APPROVAL',
          'Approval ticket feature mismatch. Re-run `context` for this feature and approve again.'
        );
      }

      cleaned.splice(index, 1);
      await saveApprovalTicketStore(storePath, {
        tickets: cleaned,
        updatedAt: new Date(nowMs).toISOString(),
      });
      return record;
    },
    { owner: 'context-approval-ticket:consume' }
  );
}

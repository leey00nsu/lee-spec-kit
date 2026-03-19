import path from 'path';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import { createCliError } from './cli-error.js';
import { getRuntimeStateDir, withFileLock } from './lock.js';

export type FlowRunStatus = 'running' | 'paused' | 'completed' | 'failed';

export interface FlowRunSelection {
  component?: string;
  all?: boolean;
  done?: boolean;
}

export interface FlowRunAutoConfig {
  untilCategories: string[];
  requestText?: string;
  requestPending: boolean;
  preset?: string | null;
  source?: string | null;
}

export interface FlowRunRecord {
  runId: string;
  featureName: string;
  selection: FlowRunSelection;
  auto: FlowRunAutoConfig;
  status: FlowRunStatus;
  createdAt: string;
  updatedAt: string;
  lastAutoStatus?: string;
  lastReasonCode?: string;
  lastError?: string;
  lastDelegatedHandoff?: {
    label: string;
    category?: string;
    detail: string;
    nextMainState?: string;
  } | null;
}

interface FlowRunCreateInput {
  featureName: string;
  selection: FlowRunSelection;
  auto: FlowRunAutoConfig;
}

function normalizeRunId(raw: string): string {
  const value = raw.trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(value)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      'Invalid flow run id format. Use an id returned by `flow --start-auto --json`.'
    );
  }
  return value;
}

function getFlowRunBaseDir(cwd: string): string {
  return path.join(getRuntimeStateDir(cwd), 'flow-runs');
}

function getFlowRunPath(cwd: string, runId: string): string {
  return path.join(getFlowRunBaseDir(cwd), `${runId}.json`);
}

function getFlowRunLockPath(cwd: string, runId: string): string {
  return path.join(getRuntimeStateDir(cwd), 'locks', `flow-run-${runId}.lock`);
}

async function readFlowRunRecordUnsafe(
  cwd: string,
  runId: string
): Promise<FlowRunRecord> {
  const normalized = normalizeRunId(runId);
  const filePath = getFlowRunPath(cwd, normalized);
  if (!(await fs.pathExists(filePath))) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Unknown flow run id: ${normalized}. Start with \`flow <feature> --auto-... --start-auto\`.`
    );
  }
  try {
    const parsed = (await fs.readJson(filePath)) as FlowRunRecord;
    if (!parsed || typeof parsed !== 'object' || parsed.runId !== normalized) {
      throw new Error('invalid payload');
    }
    return parsed;
  } catch {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Cannot load flow run record: ${normalized}`
    );
  }
}

async function writeFlowRunRecord(
  cwd: string,
  record: FlowRunRecord
): Promise<void> {
  const filePath = getFlowRunPath(cwd, record.runId);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, record, { spaces: 2 });
}

export async function createFlowRunRecord(
  cwd: string,
  input: FlowRunCreateInput
): Promise<FlowRunRecord> {
  const runId = randomUUID().replace(/-/g, '').slice(0, 16);
  const nowIso = new Date().toISOString();
  const record: FlowRunRecord = {
    runId,
    featureName: input.featureName,
    selection: {
      component: input.selection.component || undefined,
      all: !!input.selection.all,
      done: !!input.selection.done,
    },
    auto: {
      untilCategories: [...input.auto.untilCategories],
      requestText: input.auto.requestText?.trim() || undefined,
      requestPending: input.auto.requestPending,
      preset: input.auto.preset ?? null,
      source: input.auto.source ?? null,
    },
    status: 'running',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const lockPath = getFlowRunLockPath(cwd, runId);
  return withFileLock(
    lockPath,
    async () => {
      await writeFlowRunRecord(cwd, record);
      return record;
    },
    { owner: 'flow-run:create' }
  );
}

export async function getFlowRunRecord(
  cwd: string,
  runId: string
): Promise<FlowRunRecord> {
  const normalized = normalizeRunId(runId);
  return readFlowRunRecordUnsafe(cwd, normalized);
}

export async function updateFlowRunRecord(
  cwd: string,
  runId: string,
  updater: (current: FlowRunRecord) => FlowRunRecord
): Promise<FlowRunRecord> {
  const normalized = normalizeRunId(runId);
  const lockPath = getFlowRunLockPath(cwd, normalized);
  return withFileLock(
    lockPath,
    async () => {
      const current = await readFlowRunRecordUnsafe(cwd, normalized);
      const next = updater(current);
      const updated: FlowRunRecord = {
        ...next,
        runId: normalized,
        updatedAt: new Date().toISOString(),
      };
      await writeFlowRunRecord(cwd, updated);
      return updated;
    },
    { owner: 'flow-run:update' }
  );
}

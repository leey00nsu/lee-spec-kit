import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createCliError } from './cli-error.js';

/** Persist toolkit observations only, never provider output or repair prompts. */
export function safeKnowledgeText(value: string): string {
  let text = [...value]
    .map((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        ? ' '
        : character
    )
    .join('');
  for (const [name, secret] of Object.entries(process.env)) {
    if (
      /token|secret|password|credential|api.?key/iu.test(name) &&
      secret &&
      secret.length >= 4
    ) {
      text = text.split(secret).join('[REDACTED]');
    }
  }
  return text
    .replace(
      /\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]+/gu,
      '[REDACTED]'
    )
    .replace(
      /(?:Bearer\s+|(?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/giu,
      '[REDACTED]'
    )
    .replace(/https?:\/\/[^\s]+/gu, '[URL REDACTED]')
    .slice(0, 8000);
}

export interface KnowledgeExecutionEvent {
  stage: string;
  attempt: number;
  runId?: string;
  elapsedMs: number;
  at: string;
  code?: string;
  message?: string;
  paths?: string[];
  phase?: string;
  currentPage?: string;
  completedPages?: number;
  totalPages?: number;
  retryReason?: string;
  snapshotPath?: string;
  diagnosticsPath?: string;
  baselineSourceHead?: string;
  pageElapsedMs?: number;
  observedOutputChunks?: number;
  pagePlan?: Array<{ path: string; action: string; sourcePaths: string[] }>;
  preservedPages?: string[];
}

export class KnowledgeExecution {
  readonly directory: string;
  readonly diagnosticsPath: string;
  attempt = 0;
  runId?: string;
  constructor(
    root: string,
    readonly startedAt: number,
    readonly budgetMs: number | undefined,
    private readonly onEvent?: (event: KnowledgeExecutionEvent) => void,
    readonly signal?: globalThis.AbortSignal
  ) {
    this.directory = path.join(root, 'knowledge-executions', randomUUID());
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.diagnosticsPath = path.join(this.directory, 'events.jsonl');
    this.event('starting');
  }
  remaining(): number {
    if (this.signal?.aborted) {
      throw createCliError(
        'OPENWIKI_SYNC_INTERRUPTED',
        'Knowledge execution was interrupted. Existing output and diagnostics were preserved.',
        { diagnosticsPath: this.diagnosticsPath, partialStatePreserved: true }
      );
    }
    const remaining =
      this.budgetMs === undefined
        ? Infinity
        : this.startedAt + this.budgetMs - Date.now();
    if (remaining <= 0) {
      throw createCliError(
        'OPENWIKI_ABSOLUTE_TIMEOUT',
        'The total Knowledge execution budget, including verification and retries, was exhausted. Existing output and diagnostics were preserved.',
        {
          diagnosticsPath: this.diagnosticsPath,
          elapsedMs: Date.now() - this.startedAt,
          timeout: { absoluteTimeoutMs: this.budgetMs },
          partialStatePreserved: true,
        }
      );
    }
    return remaining;
  }
  event(stage: string, fields: Partial<KnowledgeExecutionEvent> = {}): void {
    const event = {
      ...fields,
      diagnosticsPath: this.diagnosticsPath,
      stage,
      attempt: this.attempt,
      runId: this.runId,
      elapsedMs: Date.now() - this.startedAt,
      at: new Date().toISOString(),
    };
    // All callers supply toolkit-owned summaries and narrowly selected paths.
    const safe = JSON.parse(
      JSON.stringify(event, (_key, value) =>
        typeof value === 'string' ? safeKnowledgeText(value) : value
      )
    ) as KnowledgeExecutionEvent;
    fs.appendFileSync(this.diagnosticsPath, JSON.stringify(safe) + '\n', {
      mode: 0o600,
    });
    this.onEvent?.(safe);
  }
}

/** Strip prose excerpts and arbitrary payload fields from validator diagnostics. */
export function describeKnowledgeValidation(error: unknown): {
  message: string;
  paths: string[];
} {
  const messages: string[] = [];
  const paths = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (
      !value ||
      typeof value !== 'object' ||
      depth > 3 ||
      messages.length >= 128
    )
      return;
    const item = value as {
      message?: unknown;
      details?: Record<string, unknown>;
    };
    const details = item.details || {};
    if (Array.isArray(details.paths)) {
      for (const entry of details.paths.slice(0, 128)) {
        if (typeof entry === 'string') paths.add(safeKnowledgeText(entry));
      }
    }
    if (
      details.validation === 'document_repair' &&
      Array.isArray(details.diagnostics)
    ) {
      for (const diagnostic of details.diagnostics)
        visit(diagnostic, depth + 1);
    } else if (
      details.validation === 'writing_style' &&
      Array.isArray(details.violations)
    ) {
      for (const violation of details.violations.slice(0, 128)) {
        if (typeof violation.path === 'string') {
          paths.add(safeKnowledgeText(violation.path));
          messages.push(
            `${safeKnowledgeText(violation.path)}:${Number(violation.line) || 0} failed writing style validation.`
          );
        }
      }
    } else if (typeof item.message === 'string') {
      // Toolkit validation errors contain file/line diagnostics. Do not pass
      // provider errors, stdout, stderr, prompts, or arbitrary details here.
      messages.push(safeKnowledgeText(item.message));
      if (Array.isArray(details.diagnostics)) {
        for (const diagnostic of details.diagnostics) {
          if (typeof diagnostic !== 'string') continue;
          const claim = diagnostic.match(
            /^(\.claims\/.+?) (?:has|references|contains|exceeds)/u
          );
          if (claim) paths.add(safeKnowledgeText(`openwiki/${claim[1]}`));
        }
      }
    }
    if (Array.isArray(details.repairTargets)) {
      for (const target of details.repairTargets.slice(0, 128)) {
        if (typeof target?.target === 'string')
          paths.add(safeKnowledgeText(target.target));
        for (const reference of Array.isArray(target?.references)
          ? target.references
          : []) {
          if (typeof reference?.page === 'string')
            paths.add(safeKnowledgeText(reference.page));
        }
      }
    }
  };
  visit(error);
  return {
    message:
      messages.join('; ').slice(0, 8000) ||
      'Generated output validation failed.',
    paths: [...paths].slice(0, 128),
  };
}

import path from 'path';
import { CliContext } from '../utils/cli-context.js';
import { createCliError } from '../utils/cli-error.js';
import fs from 'fs-extra';

export interface PrePrReviewEvidence {
  summary: string;
  featureIntentSummary: string;
  implementationFit: string;
  missingCases: string;
  specAlignmentChecked: boolean;
  findingCount: number;
  blockingFindings: number;
  files: Array<{
    path: string;
    review: {
      risk: string;
      security: string;
      perf: string;
      maintainability: string;
      fileLine: string;
    };
  }>;
  residualRisks: string;
  commandsExecuted: string[];
}

export interface PrePrReviewScope {
  baseRef: string;
  mergeBase: string | null;
  mainRange: string;
  mainChangedFiles: string[];
  worktreeChangedFiles: string[];
}

export interface PrePrReviewValidationResult {
  evidence: PrePrReviewEvidence;
  scope: PrePrReviewScope;
}

function asNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function asRequiredNonEmptyString(value: unknown, field: string): string {
  const normalized = asNonEmptyString(value, '');
  if (normalized) return normalized;
  throw createCliError(
    'VALIDATION_FAILED',
    `Evidence JSON ${field} is required.`
  );
}

function asRequiredBoolean(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value;
  throw createCliError(
    'VALIDATION_FAILED',
    `Evidence JSON ${field} must be a boolean.`
  );
}

function asRequiredNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  throw createCliError(
    'VALIDATION_FAILED',
    `Evidence JSON ${field} must be a non-negative integer.`
  );
}

function normalizeCommandsExecuted(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function normalizeGitPath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

function parseGitPathList(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((entry) => normalizeGitPath(entry))
    .filter(Boolean);
}

function uniquePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeEvidenceFiles(value: unknown): PrePrReviewEvidence['files'] {
  if (!Array.isArray(value)) {
    throw createCliError(
      'VALIDATION_FAILED',
      'Evidence JSON is missing a required "files" array.'
    );
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw createCliError(
        'VALIDATION_FAILED',
        `Evidence JSON files[${index}] must be an object.`
      );
    }
    const file = entry as {
      path?: unknown;
      review?: {
        risk?: unknown;
        security?: unknown;
        perf?: unknown;
        maintainability?: unknown;
        fileLine?: unknown;
      };
    };
    const filePath = asNonEmptyString(file.path, '');
    if (!filePath) {
      throw createCliError(
        'VALIDATION_FAILED',
        `Evidence JSON files[${index}].path is required.`
      );
    }
    const review = file.review || {};
    return {
      path: filePath,
      review: {
        risk: asNonEmptyString(review.risk, 'not specified'),
        security: asNonEmptyString(review.security, 'not specified'),
        perf: asNonEmptyString(review.perf, 'not specified'),
        maintainability: asNonEmptyString(
          review.maintainability,
          'not specified'
        ),
        fileLine: asNonEmptyString(review.fileLine, '-'),
      },
    };
  });
}

export class PrePrReviewValidator {
  constructor(private readonly ctx: CliContext) {}

  async validateEvidence(
    evidencePath: string,
    projectRoot: string
  ): Promise<PrePrReviewEvidence> {
    const result = await this.validateEvidenceWithScope(evidencePath, projectRoot);
    return result.evidence;
  }

  async validateEvidenceWithScope(
    evidencePath: string,
    projectRoot: string
  ): Promise<PrePrReviewValidationResult> {
    const fullPath = path.resolve(evidencePath);
    if (!(await fs.pathExists(fullPath))) {
      throw createCliError(
        'INVALID_ARGUMENT',
        `Evidence file not found at ${evidencePath}. Please generate review-trace.json.`
      );
    }

    let evidence: Record<string, unknown>;
    try {
      evidence = await fs.readJson(fullPath);
    } catch (e: unknown) {
      throw createCliError(
        'INVALID_ARGUMENT',
        `Evidence file is not a valid JSON: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const normalizedEvidence: PrePrReviewEvidence = {
      summary: asRequiredNonEmptyString(evidence.summary, '"summary"'),
      featureIntentSummary: asRequiredNonEmptyString(
        evidence.featureIntentSummary,
        '"featureIntentSummary"'
      ),
      implementationFit: asRequiredNonEmptyString(
        evidence.implementationFit,
        '"implementationFit"'
      ),
      missingCases: asRequiredNonEmptyString(
        evidence.missingCases,
        '"missingCases"'
      ),
      specAlignmentChecked: asRequiredBoolean(
        evidence.specAlignmentChecked,
        '"specAlignmentChecked"'
      ),
      findingCount: asRequiredNonNegativeInteger(
        evidence.findingCount,
        '"findingCount"'
      ),
      blockingFindings: asRequiredNonNegativeInteger(
        evidence.blockingFindings,
        '"blockingFindings"'
      ),
      files: normalizeEvidenceFiles(evidence.files),
      residualRisks: asNonEmptyString(evidence.residualRisks, 'Not specified'),
      commandsExecuted: normalizeCommandsExecuted(evidence.commandsExecuted),
    };

    if (normalizedEvidence.blockingFindings > normalizedEvidence.findingCount) {
      throw createCliError(
        'VALIDATION_FAILED',
        'Evidence JSON "blockingFindings" cannot be greater than "findingCount".'
      );
    }

    // Check placeholder texts
    const contentString = JSON.stringify(normalizedEvidence).toLowerCase();
    if (
      contentString.includes('todo') ||
      contentString.includes('0 findings')
    ) {
      // Only flag "0 findings" if it refers to the whole document, but let's strictly block TODOs.
      if (contentString.includes('todo:')) {
        throw createCliError(
          'VALIDATION_FAILED',
          'Evidence JSON contains placeholder text "TODO". Provide actual findings.'
        );
      }
      if (
        !normalizedEvidence.files.some((f: unknown) =>
          JSON.stringify(f).toLowerCase().includes('0 findings')
        ) &&
        contentString.includes('0 findings')
      ) {
        throw createCliError(
          'VALIDATION_FAILED',
          'Isolated "0 findings" placeholder detected. Do not copy templates directly.'
        );
      }
    }

    // Verify against changed files (main range + worktree range).
    const scope = await this.collectReviewScope(projectRoot);
    const changedFiles = uniquePaths([
      ...scope.mainChangedFiles,
      ...scope.worktreeChangedFiles,
    ]);
    const reviewedFiles = new Set(
      normalizedEvidence.files
        .map((f: unknown) =>
          path.relative(
            projectRoot,
            path.resolve(projectRoot, (f as { path: string }).path)
          )
        )
        .map((entry) => normalizeGitPath(entry))
        .filter(Boolean)
    );

    const missingFiles = changedFiles.filter((f) => !reviewedFiles.has(f));
    if (missingFiles.length > 0) {
      throw createCliError(
        'VALIDATION_FAILED',
        `Evidence is missing reviews for the following changed files:\n${missingFiles.map((f) => `- ${f}`).join('\n')}`
      );
    }

    return {
      evidence: normalizedEvidence,
      scope,
    };
  }

  async collectReviewScope(cwd: string): Promise<PrePrReviewScope> {
    const baseRef = await this.resolveBaseRef(cwd);
    const mergeBase = await this.resolveMergeBase(cwd, baseRef);
    const mainDiff = await this.getMainChangedFiles(cwd, mergeBase);
    const worktreeDiff = await this.getWorktreeChangedFiles(cwd);

    if (!mainDiff.ok && !worktreeDiff.ok) {
      throw createCliError(
        'VALIDATION_FAILED',
        'Unable to determine changed files from git diff. Ensure this is a git repository with accessible history.'
      );
    }

    return {
      baseRef,
      mergeBase,
      mainRange: mainDiff.rangeLabel,
      mainChangedFiles: mainDiff.files,
      worktreeChangedFiles: worktreeDiff.files,
    };
  }

  private async resolveBaseRef(cwd: string): Promise<string> {
    try {
      const result = await this.ctx.cmd.runAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'origin/HEAD'],
        { cwd }
      );
      if (result.code === 0) {
        const value = result.stdout.trim();
        if (value && value !== 'origin/HEAD') {
          return value;
        }
      }
    } catch {
      // ignore
    }
    return 'origin/main';
  }

  private async resolveMergeBase(
    cwd: string,
    baseRef: string
  ): Promise<string | null> {
    const candidates = uniquePaths([
      baseRef,
      baseRef.replace(/^origin\//, ''),
      'origin/main',
      'main',
    ]);
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const result = await this.ctx.cmd.runAsync(
          'git',
          ['merge-base', 'HEAD', candidate],
          { cwd }
        );
        if (result.code !== 0) continue;
        const mergeBase = normalizeGitPath(result.stdout);
        if (mergeBase) return mergeBase;
      } catch {
        // ignore
      }
    }
    return null;
  }

  private async getMainChangedFiles(
    cwd: string,
    mergeBase: string | null
  ): Promise<{ ok: boolean; rangeLabel: string; files: string[] }> {
    const ranges = uniquePaths([
      mergeBase ? `${mergeBase}..HEAD` : '',
      'HEAD~1..HEAD',
      'HEAD^..HEAD',
    ]);
    for (const range of ranges) {
      if (!range) continue;
      try {
        const result = await this.ctx.cmd.runAsync(
          'git',
          ['diff', '--name-only', range],
          { cwd }
        );
        if (result.code !== 0) continue;
        return {
          ok: true,
          rangeLabel: range,
          files: uniquePaths(parseGitPathList(result.stdout)),
        };
      } catch {
        // ignore
      }
    }
    return {
      ok: false,
      rangeLabel: mergeBase ? `${mergeBase}..HEAD` : 'HEAD~1..HEAD',
      files: [],
    };
  }

  private async getWorktreeChangedFiles(
    cwd: string
  ): Promise<{ ok: boolean; files: string[] }> {
    let hasSuccessfulCommand = false;
    const files: string[] = [];

    const commands: string[][] = [
      ['diff', '--name-only'],
      ['diff', '--name-only', '--cached'],
      ['ls-files', '--others', '--exclude-standard'],
    ];

    for (const args of commands) {
      try {
        const result = await this.ctx.cmd.runAsync('git', args, { cwd });
        if (result.code !== 0) continue;
        hasSuccessfulCommand = true;
        files.push(...parseGitPathList(result.stdout));
      } catch {
        // ignore
      }
    }

    return {
      ok: hasSuccessfulCommand,
      files: uniquePaths(files),
    };
  }
}

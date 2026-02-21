import path from 'path';
import { CliContext } from '../utils/cli-context.js';
import { createCliError } from '../utils/cli-error.js';
import fs from 'fs-extra';

export interface PrePrReviewEvidence {
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

function asNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeCommandsExecuted(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
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
      files: normalizeEvidenceFiles(evidence.files),
      residualRisks: asNonEmptyString(evidence.residualRisks, 'Not specified'),
      commandsExecuted: normalizeCommandsExecuted(evidence.commandsExecuted),
    };

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

    // Verify against changed files
    const changedFiles = await this.getChangedFiles(projectRoot);
    const reviewedFiles = new Set(
      normalizedEvidence.files.map((f: unknown) =>
        path.relative(
          projectRoot,
          path.resolve(projectRoot, (f as { path: string }).path)
        )
      )
    );

    const missingFiles = changedFiles.filter((f) => !reviewedFiles.has(f));
    if (missingFiles.length > 0) {
      throw createCliError(
        'VALIDATION_FAILED',
        `Evidence is missing reviews for the following changed files:\n${missingFiles.map((f) => `- ${f}`).join('\n')}`
      );
    }

    return normalizedEvidence;
  }

  private async getChangedFiles(cwd: string): Promise<string[]> {
    const branchResult = await this.ctx.cmd
      .runAsync('git', ['rev-parse', '--abbrev-ref', 'origin/HEAD'], { cwd })
      .catch(() => null);
    let baseBranch = 'origin/main';
    if (branchResult && branchResult.code === 0 && branchResult.stdout.trim()) {
      baseBranch = branchResult.stdout.trim().replace(/^origin\//, '');
    }

    let diffTarget = 'HEAD~1';
    try {
      const mergeBaseRes = await this.ctx.cmd.runAsync(
        'git',
        ['merge-base', 'HEAD', baseBranch],
        { cwd }
      );
      if (mergeBaseRes.code === 0 && mergeBaseRes.stdout.trim()) {
        diffTarget = mergeBaseRes.stdout.trim();
      }
    } catch {
      // ignore
    }

    const targets = [diffTarget, 'HEAD~1', ''];
    const seen = new Set<string>();
    for (const target of targets) {
      if (seen.has(target)) continue;
      seen.add(target);
      const args = target
        ? ['diff', '--name-only', target]
        : ['diff', '--name-only'];
      const diffResult = await this.ctx.cmd.runAsync('git', args, { cwd });
      if (diffResult.code !== 0) continue;
      return diffResult.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    throw createCliError(
      'VALIDATION_FAILED',
      'Unable to determine changed files from git diff. Ensure this is a git repository with accessible history.'
    );
  }
}

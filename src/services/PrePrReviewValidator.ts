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

    if (!evidence.files || !Array.isArray(evidence.files)) {
      throw createCliError(
        'VALIDATION_FAILED',
        'Evidence JSON is missing a required "files" array.'
      );
    }

    // Check placeholder texts
    const contentString = JSON.stringify(evidence).toLowerCase();
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
        !evidence.files.some((f: unknown) =>
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
      evidence.files.map((f: unknown) =>
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

    return evidence as unknown as PrePrReviewEvidence;
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

    const diffResult = await this.ctx.cmd.runAsync(
      'git',
      ['diff', '--name-only', diffTarget],
      { cwd }
    );
    if (diffResult.code !== 0) {
      return [];
    }

    return diffResult.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

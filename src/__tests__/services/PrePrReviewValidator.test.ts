/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrePrReviewValidator } from '../../services/PrePrReviewValidator.js';
import { CliContext } from '../../utils/cli-context.js';
import fs from 'fs-extra';

vi.mock('fs-extra');

describe('PrePrReviewValidator', () => {
  let mockCtx: { cmd: { runAsync: import('vitest').Mock<any> } };
  let validator: PrePrReviewValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = {
      cmd: {
        runAsync: vi.fn(),
      },
    };
    validator = new PrePrReviewValidator(mockCtx as unknown as CliContext);
  });

  function setupGitScopeMock(options?: {
    baseRef?: string;
    mergeBase?: string;
    mainDiff?: string;
    worktreeDiff?: string;
    cachedDiff?: string;
    untrackedDiff?: string;
  }): void {
    const {
      baseRef = 'origin/main',
      mergeBase = 'abc123',
      mainDiff = '',
      worktreeDiff = '',
      cachedDiff = '',
      untrackedDiff = '',
    } = options || {};
    const localBaseRef = baseRef.replace(/^origin\//, '');
    mockCtx.cmd.runAsync.mockImplementation(async (...callArgs: unknown[]) => {
      const args = Array.isArray(callArgs[1])
        ? callArgs[1].map((entry) => String(entry))
        : [];
      const key = args.join(' ');
        if (key === 'rev-parse --abbrev-ref origin/HEAD') {
          return { code: 0, stdout: `${baseRef}\n` };
        }
        if (key === `merge-base HEAD ${baseRef}`) {
          return { code: 0, stdout: `${mergeBase}\n` };
        }
        if (key === `merge-base HEAD ${localBaseRef}`) {
          return { code: 0, stdout: `${mergeBase}\n` };
        }
        if (key === `diff --name-only ${mergeBase}..HEAD`) {
          return { code: 0, stdout: mainDiff };
        }
        if (key === 'diff --name-only HEAD~1..HEAD') {
          return { code: 0, stdout: mainDiff };
        }
        if (key === 'diff --name-only HEAD^..HEAD') {
          return { code: 0, stdout: mainDiff };
        }
        if (key === 'diff --name-only') {
          return { code: 0, stdout: worktreeDiff };
        }
        if (key === 'diff --name-only --cached') {
          return { code: 0, stdout: cachedDiff };
        }
        if (key === 'ls-files --others --exclude-standard') {
          return { code: 0, stdout: untrackedDiff };
        }
        return { code: 1, stdout: '' };
      });
  }

  function buildEvidenceFields(
    overrides: Partial<Record<string, unknown>> = {}
  ): Record<string, unknown> {
    return {
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'no significant missing cases identified',
      specAlignmentChecked: true,
      findingCount: 0,
      blockingFindings: 0,
      ...overrides,
    };
  }

  function buildFileReview(
    overrides: Partial<Record<string, unknown>> = {}
  ): Record<string, unknown> {
    return {
      risk: 'low',
      security: 'none',
      perf: 'n/a',
      maintainability: 'clear',
      fileLine: '1-10',
      ...overrides,
    };
  }

  it('throws INVALID_ARGUMENT when evidence file does not exist', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/Evidence file not found/);
  });

  it('throws VALIDATION_FAILED when files array is missing', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue(buildEvidenceFields() as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/missing a required "files" array/);
  });

  it('throws VALIDATION_FAILED for TODO placeholder', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields(),
      files: [{ path: 'a.ts', review: buildFileReview({ risk: 'TODO: fill this' }) }],
      residualRisks: ['none'],
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/contains placeholder text "TODO"/);
  });

  it('throws VALIDATION_FAILED for isolated 0 findings placeholder', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields(),
      files: [{ path: 'a.ts', review: buildFileReview({ risk: 'high' }) }],
      residualRisks: '0 findings',
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/Isolated "0 findings" placeholder/);
  });

  it('throws VALIDATION_FAILED when quality review summary fields are missing', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      files: [{ path: 'a.ts', review: buildFileReview() }],
      residualRisks: ['no residual risks found in reviewed scope'],
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/"summary" is required/i);
  });

  it('allows 0 findings if properly formatted inside files array', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields(),
      files: [{ path: 'a.ts', review: buildFileReview({ risk: '0 findings' }) }],
      residualRisks: ['none'],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\n' });
    const result = await validator.validateEvidence('dummy.json', '/root');
    expect(result.files).toHaveLength(1);
  });

  it('throws VALIDATION_FAILED if changed files are missing from evidence', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields({
        missingCases: 'session timeout handling is not fully covered',
      }),
      files: [{ path: 'a.ts', review: buildFileReview() }],
      residualRisks: ['none'],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\nb.ts\n' });
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(
      /missing reviews for the following changed files:\n- b.ts/
    );
  });

  it('passes validation when evidence covers all changed files without placeholders', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields({
        findingCount: 2,
      }),
      files: [
        { path: 'a.ts', review: buildFileReview() },
        { path: 'b.ts', review: buildFileReview() },
      ],
      residualRisks: ['none'],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\nb.ts\n' });
    const result = await validator.validateEvidence('dummy.json', '/root');
    expect(result.files).toHaveLength(2);
  });

  it('normalizes optional evidence fields when omitted', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields(),
      files: [{ path: 'a.ts', review: buildFileReview() }],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\n' });

    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/residualRisks/i);
  });

  it('accepts flat file review entries and residual risk arrays', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields({
        findingCount: 1,
      }),
      files: [
        {
          path: 'a.ts',
          risk: 'medium',
          security: 'none',
          performance: 'low overhead',
          maintainability: 'clear follow-up note',
          fileLine: 88,
        },
      ],
      residualRisks: ['manual fallback path still depends on browser retry'],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\n' });

    const result = await validator.validateEvidence('dummy.json', '/root');
    expect(result.files).toEqual([
      {
        path: 'a.ts',
        review: {
          risk: 'medium',
          security: 'none',
          perf: 'low overhead',
          maintainability: 'clear follow-up note',
          fileLine: '88',
        },
      },
    ]);
    expect(result.residualRisks).toEqual([
      'manual fallback path still depends on browser retry',
    ]);
  });

  it('throws VALIDATION_FAILED when file review fields would otherwise be coerced to placeholders', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields(),
      files: [{ path: 'a.ts', review: { risk: 'low' } }],
      residualRisks: ['none'],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\n' });

    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/files\[0\]\.security/i);
  });

  it('throws VALIDATION_FAILED when summary uses draft placeholder text', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields({
        summary: 'TBD',
      }),
      files: [{ path: 'a.ts', review: buildFileReview() }],
      residualRisks: ['none'],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\n' });

    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/summary.*placeholder/i);
  });

  it('throws VALIDATION_FAILED when fileLine is not parser-friendly', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields({
        findingCount: 1,
      }),
      files: [
        {
          path: 'a.ts',
          review: buildFileReview({ fileLine: 'TBD' }),
        },
      ],
      residualRisks: ['none'],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\n' });

    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/fileLine.*numeric line reference/i);
  });

  it('returns separated main/worktree review scope', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields({
        findingCount: 2,
      }),
      files: [
        { path: 'a.ts', review: buildFileReview() },
        { path: 'b.ts', review: buildFileReview() },
      ],
      residualRisks: ['none'],
    } as never);
    setupGitScopeMock({
      baseRef: 'origin/main',
      mergeBase: 'deadbeef',
      mainDiff: 'a.ts\n',
      worktreeDiff: 'b.ts\n',
    });

    const result = await validator.validateEvidenceWithScope(
      'dummy.json',
      '/root'
    );
    expect(result.scope.baseRef).toBe('origin/main');
    expect(result.scope.mergeBase).toBe('deadbeef');
    expect(result.scope.mainRange).toBe('deadbeef..HEAD');
    expect(result.scope.mainChangedFiles).toEqual(['a.ts']);
    expect(result.scope.worktreeChangedFiles).toEqual(['b.ts']);
  });

  it('throws VALIDATION_FAILED when changed files cannot be determined', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields(),
      files: [{ path: 'a.ts', review: buildFileReview() }],
      residualRisks: ['none'],
    } as never);
    mockCtx.cmd.runAsync.mockResolvedValue({ code: 1, stdout: '' });

    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/Unable to determine changed files/);
  });

  it('throws VALIDATION_FAILED when blockingFindings exceeds findingCount', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      ...buildEvidenceFields({
        findingCount: 1,
        blockingFindings: 2,
      }),
      files: [{ path: 'a.ts', review: buildFileReview({ risk: 'high' }) }],
      residualRisks: ['none'],
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/blockingFindings.*findingCount/i);
  });
});

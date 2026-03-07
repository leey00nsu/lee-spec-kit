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

  it('throws INVALID_ARGUMENT when evidence file does not exist', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/Evidence file not found/);
  });

  it('throws VALIDATION_FAILED when files array is missing', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'no significant missing cases identified',
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/missing a required "files" array/);
  });

  it('throws VALIDATION_FAILED for TODO placeholder', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'no significant missing cases identified',
      files: [{ path: 'a.ts', review: { risk: 'TODO: fill this' } }],
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/contains placeholder text "TODO"/);
  });

  it('throws VALIDATION_FAILED for isolated 0 findings placeholder', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'no significant missing cases identified',
      files: [{ path: 'a.ts', review: { risk: 'high' } }],
      residualRisks: '0 findings',
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/Isolated "0 findings" placeholder/);
  });

  it('throws VALIDATION_FAILED when quality review summary fields are missing', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      files: [{ path: 'a.ts', review: { risk: 'low' } }],
      residualRisks: 'no residual risks found in reviewed scope',
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/"summary" is required/i);
  });

  it('allows 0 findings if properly formatted inside files array', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'no significant missing cases identified',
      files: [{ path: 'a.ts', review: { risk: '0 findings' } }],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\n' });
    const result = await validator.validateEvidence('dummy.json', '/root');
    expect(result.files).toHaveLength(1);
  });

  it('throws VALIDATION_FAILED if changed files are missing from evidence', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'session timeout handling is not fully covered',
      files: [{ path: 'a.ts', review: { risk: 'low' } }],
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
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'no significant missing cases identified',
      files: [
        { path: 'a.ts', review: { risk: 'low' } },
        { path: 'b.ts', review: { risk: 'low' } },
      ],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\nb.ts\n' });
    const result = await validator.validateEvidence('dummy.json', '/root');
    expect(result.files).toHaveLength(2);
  });

  it('normalizes optional evidence fields when omitted', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'no significant missing cases identified',
      files: [{ path: 'a.ts', review: { risk: 'low' } }],
    } as never);
    setupGitScopeMock({ mainDiff: 'a.ts\n' });

    const result = await validator.validateEvidence('dummy.json', '/root');
    expect(result.residualRisks).toBe('Not specified');
    expect(result.commandsExecuted).toEqual([]);
  });

  it('returns separated main/worktree review scope', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'no significant missing cases identified',
      files: [
        { path: 'a.ts', review: { risk: 'low' } },
        { path: 'b.ts', review: { risk: 'low' } },
      ],
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
      summary: 'implementation quality review completed',
      featureIntentSummary: 'feature intent matches docs',
      implementationFit: 'implementation fits the approved scope',
      missingCases: 'no significant missing cases identified',
      files: [{ path: 'a.ts', review: { risk: 'low' } }],
    } as never);
    mockCtx.cmd.runAsync.mockResolvedValue({ code: 1, stdout: '' });

    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/Unable to determine changed files/);
  });
});

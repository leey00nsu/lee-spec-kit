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

  it('throws INVALID_ARGUMENT when evidence file does not exist', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/Evidence file not found/);
  });

  it('throws VALIDATION_FAILED when files array is missing', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({} as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/missing a required "files" array/);
  });

  it('throws VALIDATION_FAILED for TODO placeholder', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      files: [{ path: 'a.ts', review: { risk: 'TODO: fill this' } }],
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/contains placeholder text "TODO"/);
  });

  it('throws VALIDATION_FAILED for isolated 0 findings placeholder', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      files: [{ path: 'a.ts', review: { risk: 'high' } }],
      residualRisks: '0 findings',
    } as never);
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(/Isolated "0 findings" placeholder/);
  });

  it('allows 0 findings if properly formatted inside files array', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      files: [{ path: 'a.ts', review: { risk: '0 findings' } }],
    } as never);
    mockCtx.cmd.runAsync.mockResolvedValue({ code: 0, stdout: 'a.ts\n' });
    const result = await validator.validateEvidence('dummy.json', '/root');
    expect(result.files).toHaveLength(1);
  });

  it('throws VALIDATION_FAILED if changed files are missing from evidence', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      files: [{ path: 'a.ts', review: { risk: 'low' } }],
    } as never);
    mockCtx.cmd.runAsync.mockResolvedValue({ code: 0, stdout: 'a.ts\nb.ts\n' });
    await expect(
      validator.validateEvidence('dummy.json', '/root')
    ).rejects.toThrow(
      /missing reviews for the following changed files:\n- b.ts/
    );
  });

  it('passes validation when evidence covers all changed files without placeholders', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      files: [
        { path: 'a.ts', review: { risk: 'low' } },
        { path: 'b.ts', review: { risk: 'low' } },
      ],
    } as never);
    mockCtx.cmd.runAsync.mockResolvedValue({ code: 0, stdout: 'a.ts\nb.ts\n' });
    const result = await validator.validateEvidence('dummy.json', '/root');
    expect(result.files).toHaveLength(2);
  });
});

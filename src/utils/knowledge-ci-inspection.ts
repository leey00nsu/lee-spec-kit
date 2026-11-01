import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';

const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const normalize = (text: string) => text.replaceAll('\r\n', '\n').trimEnd();

async function readOwnedFile(root: string, relative: string) {
  let target = root;
  for (const part of relative.split('/')) {
    target = path.join(target, part);
    try {
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink()) return { state: 'manual_review' as const };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT')
        return { state: 'missing' as const };
      throw error;
    }
  }
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size > 1024 * 1024)
    return { state: 'manual_review' as const };
  return {
    state: 'present' as const,
    content: await fs.readFile(target, 'utf8'),
  };
}

/** Read-only, content-safe migration preview. Never echo project prose or YAML:
 * these files may contain private instructions or literal credentials. Only
 * hashes, classifications and the public bundled policy leave this function.
 */
export async function inspectKnowledgeCi(
  root: string,
  workflowContent: string,
  defaultInstructions: string,
  preview: boolean
) {
  const workflowPath = '.github/workflows/lee-spec-kit-knowledge.yml';
  const instructionsPath = 'openwiki/INSTRUCTIONS.md';
  const [workflow, instructions] = await Promise.all([
    readOwnedFile(root, workflowPath),
    readOwnedFile(root, instructionsPath),
  ]);
  const legacy = defaultInstructions
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('- For each planned page,') &&
        !line.startsWith('- On routine updates,')
    )
    .map((line) =>
      line.startsWith('- Use page-relative Markdown links')
        ? '- Use page-relative Markdown links between Knowledge pages and keep the exact `.md` suffix.'
        : line
    )
    .join('\n');
  const defaultLines = defaultInstructions.split('\n');
  const currentLines = new Set(
    normalize(instructions.content || '').split('\n')
  );
  const missingGuidance = defaultLines.flatMap((line, index) =>
    instructions.state !== 'manual_review' &&
    line.startsWith('- ') &&
    !currentLines.has(line)
      ? [{ defaultLine: index + 1, guidance: line }]
      : []
  );
  const instructionsState =
    instructions.state !== 'present'
      ? instructions.state
      : normalize(instructions.content || '') === normalize(defaultInstructions)
        ? 'current'
        : normalize(instructions.content || '') === normalize(legacy)
          ? 'known_legacy'
          : 'customized';
  const workflowState =
    workflow.state !== 'present'
      ? workflow.state
      : workflow.content === workflowContent
        ? 'current'
        : workflow.content?.includes('lee-spec-kit knowledge update --ci')
          ? 'legacy_adapter'
          : 'different';
  return {
    dryRun: preview,
    projectRoot: root,
    changed: [] as string[],
    workflow: {
      path: path.join(root, workflowPath),
      state: workflowState,
      currentHash:
        workflow.content === undefined ? undefined : digest(workflow.content),
      defaultHash: digest(workflowContent),
      ...(preview ? { defaultPreview: workflowContent } : {}),
      migration:
        'Manually integrate observation and recovery steps. Preserve provider/model settings, secret references, schedule/dispatch inputs, concurrency and auto-merge policy. This default preview is not a replacement for customized YAML.',
    },
    instructions: {
      path: path.join(root, instructionsPath),
      state: instructionsState,
      currentHash:
        instructions.content === undefined
          ? undefined
          : digest(instructions.content),
      defaultHash: digest(defaultInstructions),
      missingDefaultGuidance: missingGuidance,
      comparison:
        'Literal default-guidance comparison; customized equivalent prose may already implement it. No claim of semantic compliance.',
      ...(preview
        ? {
            defaultPreview: defaultInstructions,
            proposedAdditions: missingGuidance.map((entry) => entry.guidance),
            proposedDeletions: [],
          }
        : {}),
      migration:
        'Review and merge missing guidance manually. Preserve project-specific prose; a package update does not update this file. Writing-policy changes alone do not request a full wiki rewrite.',
    },
  };
}

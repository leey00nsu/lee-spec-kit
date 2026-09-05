import { createHash, randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { createCliError } from './cli-error.js';
import { withFileLock } from './lock.js';
import { getResourcesDir } from './paths.js';

export const OPENWIKI_WRITING_POLICY_BEGIN =
  '<!-- lee-spec-kit:writing-policy:begin -->';
export const OPENWIKI_WRITING_POLICY_END =
  '<!-- lee-spec-kit:writing-policy:end -->';

const SKILL_OWNER_FILE = '.lee-spec-kit-skill.json';

export interface OpenWikiWritingPolicyReceipt {
  adapterId: string;
  adapterVersion: string;
  skillName: string;
  skillHash: string;
  instructionHash: string;
}

interface OpenWikiWritingAdapter {
  id: string;
  version: string;
  skillName: string;
  bundleDirectory: string;
  renderPlannerInstructions(language: 'ko' | 'en'): string[];
  renderPageInstructions(language: 'ko' | 'en'): string[];
  inspectMarkdown(
    language: 'ko' | 'en',
    content: string
  ): OpenWikiWritingStyleViolation[];
}

export interface OpenWikiWritingStyleViolation {
  rule: 'ko_reader_voice';
  line: number;
  excerpt: string;
}

export interface ResolvedOpenWikiWritingPolicy {
  receipt: OpenWikiWritingPolicyReceipt;
  policyHash: string;
  managedBlock: string;
  bundlePath: string;
  inspectMarkdown(content: string): OpenWikiWritingStyleViolation[];
}

const DEFAULT_WRITING_ADAPTER: OpenWikiWritingAdapter = {
  id: 'lee-spec-kit.technical-writing',
  version: '1.5.0',
  skillName: 'lee-spec-kit-technical-writing',
  bundleDirectory: 'lee-spec-kit-technical-writing',
  renderPlannerInstructions() {
    return [
      'Read and follow the installed writing skill before planning the Knowledge route.',
      "Plan the smallest complete route around a new developer's goals. Classify pages as tutorials, how-to guides, explanations, or references instead of mirroring the source tree or targeting a fixed page count.",
      "For each page, put its reader question and document type (tutorial, how-to, explanation, or reference) in the job's purpose and instructions. Split different reader tasks instead of combining setup, runtime theory, and lookup contracts in one page. Choose paths after identifying those goals.",
      'OpenWiki owns generated index pages; do not schedule or author them. Use quickstart as the human entrypoint with links grouped by reader purpose. Preserve the quickstart required by the generator.',
      "Copy every bullet under **Page-worker contract** into every page job's `instructions`. Page workers do not inherit this file automatically.",
    ];
  },
  renderPageInstructions(language) {
    const outputLanguage = language === 'ko' ? 'Korean' : 'English';
    return [
      `Before drafting or revising a reader-facing page, read and follow \`/skills/${this.skillName}/SKILL.md\` and its reference matching the assigned page type.`,
      `Write reader-facing content in ${outputLanguage}. Keep code identifiers, commands, paths, and public API names exact.`,
      ...(language === 'ko'
        ? [
            'Write Korean explanations consistently in reader-friendly `해요체` and reader actions with `-하세요`. Do not use declarative `-다` or formal `-습니다` prose, except inside exact identifiers, code, or quoted runtime text.',
            'Use natural Korean for ordinary explanatory terms: worker → 워커, ownership → 소유권, lifecycle → 수명 주기, focused test → 변경 범위 테스트. Preserve actual code identifiers, product names, and commands; introduce unfamiliar terms once instead of mixing English into every sentence.',
          ]
        : [
            'Use direct, reader-focused English with a clear result, conclusion, or next action first.',
          ]),
      "Put the reader's result, conclusion, or next action first and keep one primary goal on the page.",
      'Use three stages inside each page job: (1) draft an evidence-backed answer to the assigned reader question; (2) edit the complete draft for one dominant document type, one point per paragraph, consistent natural terminology, and no repeated summaries; (3) reconcile commands, conditions, exceptions, source links and Claims with the edited text, then call submit_page. Do not submit the first draft. Perform the edit within this job without a separate model, score, or review artifact.',
      'Repository evidence and technical accuracy outrank writing style. Never smooth over uncertainty or invent missing facts.',
      'Input visibility is not repository existence. A failed read or absence from the generation input may mean exclusion or access restrictions, not a missing file. Verify existence only with available authoritative tracked-file metadata; otherwise say the file was not available in the generation input. Never read excluded secrets or relax ignore rules to resolve uncertainty.',
      'Every generated reader-facing page except the index must include at least one descriptive Markdown link to a tracked source file using `repo://path` or `repo://path#Lx-Ly`. Reserve `repo://` for source files included in the repository fingerprint. Link Knowledge pages with page-relative Markdown paths, never `/openwiki/...` or `repo://openwiki/...` hrefs. Claim sidecars and inline code citations do not replace this reader navigation link.',
      'Before submitting, check every repo:// target is a regular tracked source file, not a directory or symlink. For a directory, use plain code notation or link a relevant file inside it; never invent a file or line range.',
      'Resolve each Knowledge cross-link to the exact planned page path, including `.md`, but express its Markdown href relative to the current page directory. For example, from /openwiki/architecture/system.md to /openwiki/operations/workers.md use ../operations/workers.md. Keep canonical /openwiki/... identifiers in plans and metadata, not Markdown hrefs. Preserve meaningful navigation; do not add unrelated links merely to connect the graph.',
      'Write Markdown URL targets with literal forward slashes. Never insert backslashes before forward slashes.',
    ];
  },
  inspectMarkdown(language, content) {
    return language === 'ko' ? inspectKoreanReaderVoice(content) : [];
  },
};

function renderManagedInstructions(
  adapter: OpenWikiWritingAdapter,
  language: 'ko' | 'en'
): string {
  const plannerInstructions = adapter
    .renderPlannerInstructions(language)
    .map((instruction) => `- ${instruction}`)
    .join('\n');
  const pageInstructions = adapter
    .renderPageInstructions(language)
    .map((instruction) => `- ${instruction}`)
    .join('\n');
  return `${OPENWIKI_WRITING_POLICY_BEGIN}
## Writing policy managed by lee-spec-kit

### Planner contract

${plannerInstructions}

### Page-worker contract

${pageInstructions}

### Managed boundary

- This block is managed by lee-spec-kit. Put project-specific writing instructions outside the managed markers.
${OPENWIKI_WRITING_POLICY_END}`;
}

export function resolveOpenWikiConfigDir(
  baseDirectory = process.cwd(),
  configuredValue = process.env.OPENWIKI_CONFIG_DIR
): string {
  const configured = configuredValue?.trim();
  const resolved = configured
    ? path.resolve(baseDirectory, expandHome(configured))
    : path.join(os.homedir(), '.openwiki');
  return resolvePhysicalPath(resolved);
}

export async function resolveOpenWikiWritingPolicy(
  language: 'ko' | 'en'
): Promise<ResolvedOpenWikiWritingPolicy> {
  const adapter = DEFAULT_WRITING_ADAPTER;
  const bundlePath = path.join(
    getResourcesDir(),
    'openwiki-skills',
    adapter.bundleDirectory
  );
  const skillHash = await hashDirectory(bundlePath);
  const managedBlock = renderManagedInstructions(adapter, language);
  const receipt: OpenWikiWritingPolicyReceipt = {
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    skillName: adapter.skillName,
    skillHash,
    instructionHash: hashText(managedBlock),
  };
  return {
    bundlePath,
    managedBlock,
    receipt,
    inspectMarkdown(content) {
      return adapter.inspectMarkdown(language, content);
    },
    policyHash: hashText(
      [
        receipt.adapterId,
        receipt.adapterVersion,
        receipt.skillName,
        receipt.skillHash,
        receipt.instructionHash,
      ].join('\0')
    ),
  };
}

export function inspectOpenWikiMarkdownStyle(
  language: 'ko' | 'en',
  content: string
): OpenWikiWritingStyleViolation[] {
  return DEFAULT_WRITING_ADAPTER.inspectMarkdown(language, content);
}

function inspectKoreanReaderVoice(
  content: string
): OpenWikiWritingStyleViolation[] {
  const violations: OpenWikiWritingStyleViolation[] = [];
  const lines = content.split(/\r?\n/u);
  let frontmatter = lines[0]?.trim() === '---';
  let fencedBy: '`' | '~' | null = null;
  let fenceLength = 0;
  let inHtmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] || '';
    const trimmed = rawLine.trim();

    if (index === 0 && frontmatter) continue;
    if (frontmatter) {
      if (trimmed === '---') {
        frontmatter = false;
        continue;
      }
      const description = rawLine.match(
        /^\s*(?:description|summary):\s*(.*)$/u
      );
      if (description) {
        recordKoreanVoiceViolation(description[1] || '', index, violations);
      }
      continue;
    }

    const fence = rawLine.match(/^\s{0,3}(`{3,}|~{3,})/u)?.[1];
    if (fence) {
      const marker = fence[0] as '`' | '~';
      if (!fencedBy) {
        fencedBy = marker;
        fenceLength = fence.length;
      } else if (marker === fencedBy && fence.length >= fenceLength) {
        fencedBy = null;
        fenceLength = 0;
      }
      continue;
    }
    if (fencedBy || /^\s*>/u.test(rawLine)) continue;

    let prose = rawLine;
    if (inHtmlComment) {
      const commentEnd = prose.indexOf('-->');
      if (commentEnd < 0) continue;
      prose = prose.slice(commentEnd + 3);
      inHtmlComment = false;
    }
    while (prose.includes('<!--')) {
      const commentStart = prose.indexOf('<!--');
      const commentEnd = prose.indexOf('-->', commentStart + 4);
      if (commentEnd < 0) {
        prose = prose.slice(0, commentStart);
        inHtmlComment = true;
        break;
      }
      prose = `${prose.slice(0, commentStart)} ${prose.slice(commentEnd + 3)}`;
    }

    prose = prose
      .replace(/`+[^`]*`+/gu, ' ')
      .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/gu, '$1')
      .replace(/"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’/gu, ' ')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/[*_~]/gu, '');
    recordKoreanVoiceViolation(prose, index, violations);
  }

  return violations;
}

function recordKoreanVoiceViolation(
  prose: string,
  zeroBasedLine: number,
  violations: OpenWikiWritingStyleViolation[]
): void {
  let disallowed = false;
  for (const match of prose.matchAll(/([가-힣]+)(?=(?:[.!?…|]|[)}\]]|$))/gu)) {
    if (isDisallowedKoreanEnding(match[1] || '')) {
      disallowed = true;
      break;
    }
  }
  if (!disallowed) return;
  violations.push({
    rule: 'ko_reader_voice',
    line: zeroBasedLine + 1,
    excerpt: prose.trim().replace(/\s+/gu, ' ').slice(0, 160),
  });
}

function isDisallowedKoreanEnding(word: string): boolean {
  if (/니다$/u.test(word)) return true;
  if (
    /(?:는다|한다|된다|이다|아니다|있다|없다|않다|같다|싶다|하다|되다)$/u.test(
      word
    )
  ) {
    return true;
  }
  if (!word.endsWith('다') || word.length < 2) return false;
  const preceding = word.charCodeAt(word.length - 2);
  if (preceding < 0xac00 || preceding > 0xd7a3) return false;
  return (preceding - 0xac00) % 28 === 4;
}

export async function installOpenWikiWritingSkill(
  policy: ResolvedOpenWikiWritingPolicy,
  configDir: string,
  lockTimeoutMs: number
): Promise<void> {
  const skillsDir = path.join(configDir, 'skills');
  const target = path.join(skillsDir, policy.receipt.skillName);
  const lockPath = path.join(configDir, '.lee-spec-kit-writing-skill.lock');

  await withFileLock(
    lockPath,
    async () => {
      await assertDirectoryOrMissing(skillsDir, 'OpenWiki skills directory');
      await fs.ensureDir(skillsDir);
      await assertDirectoryOrMissing(skillsDir, 'OpenWiki skills directory');

      const initialTarget = await lstatOrNull(target);
      let previousHash: string | null = null;
      if (initialTarget) {
        await assertOwnedSkillDirectory(target, policy.receipt);
        previousHash = await hashDirectory(target);
        if (previousHash === policy.receipt.skillHash) return;
      }

      const staging = path.join(
        skillsDir,
        `.${policy.receipt.skillName}.${process.pid}.${randomUUID()}.tmp`
      );
      const backup = path.join(
        skillsDir,
        `.${policy.receipt.skillName}.${process.pid}.${randomUUID()}.bak`
      );
      let movedExisting = false;
      try {
        await fs.copy(policy.bundlePath, staging, {
          dereference: false,
          errorOnExist: true,
        });
        if ((await hashDirectory(staging)) !== policy.receipt.skillHash) {
          throw createCliError(
            'OPENWIKI_WRITING_SKILL_UNAVAILABLE',
            'The bundled OpenWiki writing skill changed while it was being installed.'
          );
        }
        const currentTarget = await lstatOrNull(target);
        if (previousHash === null && currentTarget) {
          throw skillConflictError(target);
        }
        if (previousHash !== null) {
          if (!currentTarget) {
            throw createCliError(
              'OPENWIKI_WRITING_SKILL_CONFLICT',
              `The lee-spec-kit-owned OpenWiki skill changed while an update was being prepared: ${target}`
            );
          }
          await assertOwnedSkillDirectory(target, policy.receipt);
          if ((await hashDirectory(target)) !== previousHash) {
            throw createCliError(
              'OPENWIKI_WRITING_SKILL_CONFLICT',
              `The lee-spec-kit-owned OpenWiki skill changed while an update was being prepared: ${target}`
            );
          }
          await fs.rename(target, backup);
          movedExisting = true;
        }
        await fs.rename(staging, target);
        await verifyOpenWikiWritingSkillInstallation(policy, configDir);
        if (movedExisting) await fs.remove(backup).catch(() => undefined);
      } catch (error) {
        await fs.remove(staging).catch(() => undefined);
        if (movedExisting && !(await lstatOrNull(target))) {
          try {
            await fs.rename(backup, target);
          } catch {
            throw createCliError(
              'OPENWIKI_WRITING_SKILL_UNAVAILABLE',
              `Writing-skill installation failed and the previous lee-spec-kit-owned copy was preserved at: ${backup}`
            );
          }
        }
        throw error;
      } finally {
        await fs.remove(staging).catch(() => undefined);
      }
    },
    {
      owner: `openwiki-writing:${policy.receipt.skillName}`,
      timeoutMs: lockTimeoutMs,
    }
  );
}

export async function verifyOpenWikiWritingSkillInstallation(
  policy: ResolvedOpenWikiWritingPolicy,
  configDir: string
): Promise<void> {
  const target = path.join(configDir, 'skills', policy.receipt.skillName);
  if (!(await lstatOrNull(target))) {
    throw createCliError(
      'OPENWIKI_WRITING_SKILL_UNAVAILABLE',
      `The managed OpenWiki writing skill is missing: ${target}`
    );
  }
  await assertOwnedSkillDirectory(target, policy.receipt);
  if ((await hashDirectory(target)) !== policy.receipt.skillHash) {
    throw createCliError(
      'OPENWIKI_WRITING_SKILL_UNAVAILABLE',
      `The managed OpenWiki writing skill does not match the bundled policy: ${target}`
    );
  }
}

export async function ensureOpenWikiWritingInstructions(
  instructionsPath: string,
  defaultInstructions: string,
  policy: ResolvedOpenWikiWritingPolicy
): Promise<void> {
  let current = defaultInstructions;
  const original = await readRegularTextOrMissing(instructionsPath);
  if (original !== null) current = original;
  const next = replaceManagedBlock(current, policy.managedBlock);
  if (next === current) return;
  await writeExternalFileAtomic(instructionsPath, next, original);
}

export async function inspectOpenWikiWritingPolicy(
  instructionsPath: string,
  expected: ResolvedOpenWikiWritingPolicy,
  recorded?: OpenWikiWritingPolicyReceipt
): Promise<{ current: boolean; detail?: string }> {
  if (!recorded || !sameReceipt(recorded, expected.receipt)) {
    return {
      current: false,
      detail:
        'The OpenWiki receipt predates the current writing policy or records a different writing adapter.',
    };
  }
  let instructions: string;
  try {
    instructions = await fs.readFile(instructionsPath, 'utf-8');
  } catch {
    return {
      current: false,
      detail: '`openwiki/INSTRUCTIONS.md` is missing or unreadable.',
    };
  }
  try {
    const block = extractManagedBlock(instructions);
    if (block !== expected.managedBlock) {
      return {
        current: false,
        detail:
          'The managed writing-policy block in `openwiki/INSTRUCTIONS.md` is missing or stale.',
      };
    }
  } catch (error) {
    return {
      current: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  return { current: true };
}

function replaceManagedBlock(content: string, block: string): string {
  const existing = extractManagedBlock(content);
  if (existing) return content.replace(existing, block);
  if (
    content.includes(OPENWIKI_WRITING_POLICY_BEGIN) ||
    content.includes(OPENWIKI_WRITING_POLICY_END)
  ) {
    throw malformedManagedBlockError();
  }
  const separator = !content
    ? ''
    : content.endsWith('\n\n')
      ? ''
      : content.endsWith('\n')
        ? '\n'
        : '\n\n';
  return `${content}${separator}${block}\n`;
}

function extractManagedBlock(content: string): string | null {
  const start = content.indexOf(OPENWIKI_WRITING_POLICY_BEGIN);
  const end = content.indexOf(OPENWIKI_WRITING_POLICY_END);
  if (start < 0 && end < 0) return null;
  if (
    start < 0 ||
    end < start ||
    start !== content.lastIndexOf(OPENWIKI_WRITING_POLICY_BEGIN) ||
    end !== content.lastIndexOf(OPENWIKI_WRITING_POLICY_END)
  ) {
    throw malformedManagedBlockError();
  }
  return content.slice(start, end + OPENWIKI_WRITING_POLICY_END.length);
}

function malformedManagedBlockError(): Error {
  return createCliError(
    'OPENWIKI_PROTECTED_CONTENT_CHANGED',
    'The lee-spec-kit writing-policy markers in `openwiki/INSTRUCTIONS.md` are malformed or duplicated.'
  );
}

function sameReceipt(
  left: OpenWikiWritingPolicyReceipt,
  right: OpenWikiWritingPolicyReceipt
): boolean {
  return (
    left.adapterId === right.adapterId &&
    left.adapterVersion === right.adapterVersion &&
    left.skillName === right.skillName &&
    left.skillHash === right.skillHash &&
    left.instructionHash === right.instructionHash
  );
}

async function assertOwnedSkillDirectory(
  target: string,
  expected: OpenWikiWritingPolicyReceipt
): Promise<void> {
  const stat = await fs.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw skillConflictError(target);
  }
  const ownerPath = path.join(target, SKILL_OWNER_FILE);
  try {
    const ownerStat = await fs.lstat(ownerPath);
    if (!ownerStat.isFile() || ownerStat.isSymbolicLink()) {
      throw skillConflictError(target);
    }
    const owner = await fs.readJson(ownerPath);
    if (
      owner?.schemaVersion !== 1 ||
      owner?.owner !== 'lee-spec-kit' ||
      owner?.adapterId !== expected.adapterId ||
      owner?.skillName !== expected.skillName
    ) {
      throw skillConflictError(target);
    }
  } catch (error) {
    if (
      (error as { code?: string }).code === 'OPENWIKI_WRITING_SKILL_CONFLICT'
    ) {
      throw error;
    }
    throw skillConflictError(target);
  }
}

function skillConflictError(target: string): Error {
  return createCliError(
    'OPENWIKI_WRITING_SKILL_CONFLICT',
    `OpenWiki skill path is not owned by lee-spec-kit and will not be overwritten: ${target}`
  );
}

async function assertDirectoryOrMissing(
  target: string,
  label: string
): Promise<void> {
  try {
    const stat = await fs.lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw createCliError(
        'OPENWIKI_WRITING_SKILL_UNAVAILABLE',
        `${label} must be a directory: ${target}`
      );
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return;
    throw error;
  }
}

async function lstatOrNull(target: string): Promise<Stats | null> {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return null;
    throw error;
  }
}

async function readRegularTextOrMissing(
  target: string
): Promise<string | null> {
  const stat = await lstatOrNull(target);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw createCliError(
      'OPENWIKI_PROTECTED_CONTENT_CHANGED',
      '`openwiki/INSTRUCTIONS.md` must be a regular file.'
    );
  }
  return fs.readFile(target, 'utf-8');
}

async function hashDirectory(root: string): Promise<string> {
  let rootStat;
  try {
    rootStat = await fs.lstat(root);
  } catch {
    throw createCliError(
      'OPENWIKI_WRITING_SKILL_UNAVAILABLE',
      `Bundled OpenWiki writing skill is missing: ${root}`
    );
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw createCliError(
      'OPENWIKI_WRITING_SKILL_UNAVAILABLE',
      `Bundled OpenWiki writing skill must be a regular directory: ${root}`
    );
  }

  const entries: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    const children = await fs.readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolute = path.join(directory, child.name);
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) {
        throw createCliError(
          'OPENWIKI_WRITING_SKILL_UNAVAILABLE',
          `Bundled OpenWiki writing skill must not contain symlinks: ${absolute}`
        );
      }
      if (stat.isDirectory()) {
        await walk(absolute);
      } else if (stat.isFile()) {
        const relative = path
          .relative(root, absolute)
          .split(path.sep)
          .join('/');
        const contentHash = createHash('sha256')
          .update(await fs.readFile(absolute))
          .digest('hex');
        entries.push(`${relative}\0${contentHash}`);
      }
    }
  };
  await walk(root);
  return `sha256:${createHash('sha256').update(entries.join('\n')).digest('hex')}`;
}

async function writeExternalFileAtomic(
  target: string,
  content: string,
  expectedCurrent: string | null
): Promise<void> {
  await fs.ensureDir(path.dirname(target));
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    await fs.writeFile(temporary, content, { encoding: 'utf-8', flag: 'wx' });
    const current = await readRegularTextOrMissing(target);
    if (current !== expectedCurrent) {
      throw createCliError(
        'OPENWIKI_PROTECTED_CONTENT_CHANGED',
        '`openwiki/INSTRUCTIONS.md` changed while lee-spec-kit was preparing its managed writing-policy block. The concurrent edit was preserved; rerun Knowledge sync.'
      );
    }
    await fs.rename(temporary, target);
  } finally {
    await fs.remove(temporary).catch(() => undefined);
  }
}

function hashText(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function resolvePhysicalPath(target: string): string {
  let current = path.resolve(target);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return path.join(fs.realpathSync(current), ...missingSegments);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT')
        return path.resolve(target);
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      missingSegments.unshift(path.basename(current));
      current = parent;
    }
  }
}

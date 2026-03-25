import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { createCliContext } from '../utils/cli-context.js';
import { scanFeatures } from '../utils/context.js';
import { DEFAULT_LANG, tr } from '../utils/i18n.js';
import { createCliError, toCliError } from '../utils/cli-error.js';
import {
  isNonPrdTag,
  isPrdRequirementId,
  parseTaskLines,
  scanPrdRequirements,
} from '../utils/requirements.js';

interface RequirementsOptions {
  json?: boolean;
  write?: boolean;
  strict?: boolean;
}

type RequirementState = 'UNTRACKED' | 'TODO' | 'DOING' | 'DONE';

interface RequirementEntry {
  id: string;
  title?: string;
  defined: boolean;
  definedAt?: { file: string; line: number };
  tasks: { total: number; todo: number; doing: number; done: number };
  state: RequirementState;
  features: string[];
}

function getRequirementState(tasks: RequirementEntry['tasks']): RequirementState {
  if (tasks.total === 0) return 'UNTRACKED';
  if (tasks.done === tasks.total) return 'DONE';
  if (tasks.doing > 0) return 'DOING';
  return 'TODO';
}

function parseSortKey(id: string): { type: string; num: number } | null {
  const match = id.toUpperCase().match(/^PRD-(FR|US|NFR)-(\d+)$/);
  if (!match) return null;
  return { type: match[1] || '', num: Number(match[2] || '0') };
}

function compareRequirementId(a: string, b: string): number {
  const ka = parseSortKey(a);
  const kb = parseSortKey(b);
  if (!ka || !kb) return a.localeCompare(b);
  if (ka.type !== kb.type) return ka.type.localeCompare(kb.type);
  return ka.num - kb.num;
}

export function requirementsCommand(program: Command): void {
  program
    .command('requirements')
    .description('Show PRD requirement coverage from feature tasks')
    .option('--json', 'Output in JSON format for agents')
    .option('-w, --write', 'Write docs/prd/status.md report')
    .option('-s, --strict', 'Exit non-zero when issues are found')
    .action(async (options: RequirementsOptions) => {
      try {
        await runRequirements(options);
      } catch (error) {
        const ctx = await createCliContext();
        const lang = ctx?.config?.lang ?? DEFAULT_LANG;
        const cliError = toCliError(error);
        console.error(
          chalk.red(tr(lang, 'cli', 'common.errorLabel')),
          chalk.red(`[${cliError.code}] ${cliError.message}`)
        );
        process.exitCode = 1;
      }
    });
}

async function runRequirements(options: RequirementsOptions): Promise<void> {
  const ctx = await createCliContext();
  if (!ctx || !ctx.config) {
    throw createCliError(
      'CONFIG_NOT_FOUND',
      tr(DEFAULT_LANG, 'cli', 'common.configNotFound')
    );
  }

  const { docsDir, lang } = ctx.config;

  const { definitions } = await scanPrdRequirements(ctx.fs, docsDir);

  const scan = await scanFeatures(ctx);

  const entries = new Map<string, RequirementEntry>();
  const unknownReferences = new Set<string>();
  const unmappedTasks: Array<{
    feature: string;
    status: string;
    title: string;
    line: number;
  }> = [];

  // Seed with PRD-defined requirements so UNTRACKED items appear in report.
  for (const def of definitions.values()) {
    entries.set(def.id, {
      id: def.id,
      title: def.title,
      defined: true,
      definedAt: { file: def.file, line: def.line },
      tasks: { total: 0, todo: 0, doing: 0, done: 0 },
      state: 'UNTRACKED',
      features: [],
    });
  }

  for (const feature of scan.features) {
    if (!feature.docs.tasksExists) continue;

    const tasksPath = path.join(feature.path, 'tasks.md');
    let tasksContent = '';
    try {
      tasksContent = await ctx.fs.readFile(tasksPath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = parseTaskLines(tasksContent);
    for (const task of parsed) {
      const requirementTags = task.tags
        .filter((tag) => isPrdRequirementId(tag))
        .map((tag) => tag.trim().toUpperCase());
      const nonPrd = task.tags.some((tag) => isNonPrdTag(tag));

      if (requirementTags.length === 0 && !nonPrd) {
        unmappedTasks.push({
          feature: feature.folderName,
          status: task.status,
          title: task.title,
          line: task.line,
        });
        continue;
      }

      if (requirementTags.length > 0 && nonPrd) {
        // Conflicting tagging: treat as unmapped so users fix it explicitly.
        unmappedTasks.push({
          feature: feature.folderName,
          status: task.status,
          title: `${task.title} (conflicting tags: PRD + NON-PRD)`,
          line: task.line,
        });
        continue;
      }

      for (const requirementId of requirementTags) {
        const def = definitions.get(requirementId);
        const entry =
          entries.get(requirementId) ||
          ({
            id: requirementId,
            title: def?.title,
            defined: !!def,
            definedAt: def ? { file: def.file, line: def.line } : undefined,
            tasks: { total: 0, todo: 0, doing: 0, done: 0 },
            state: 'UNTRACKED',
            features: [],
          } satisfies RequirementEntry);

        entry.tasks.total += 1;
        if (task.status === 'DONE') entry.tasks.done += 1;
        else if (task.status === 'DOING' || task.status === 'REVIEW')
          entry.tasks.doing += 1;
        else if (task.status === 'TODO') entry.tasks.todo += 1;

        if (!entry.features.includes(feature.folderName)) {
          entry.features.push(feature.folderName);
        }

        if (!def) unknownReferences.add(requirementId);

        entries.set(requirementId, entry);
      }
    }
  }

  const requirements = [...entries.values()]
    .map((entry) => {
      const def = definitions.get(entry.id);
      const next: RequirementEntry = {
        ...entry,
        title: entry.title || def?.title,
        defined: entry.defined || !!def,
        definedAt: entry.definedAt || (def ? { file: def.file, line: def.line } : undefined),
        features: [...entry.features].sort(),
      };
      next.state = getRequirementState(next.tasks);
      return next;
    })
    .sort((a, b) => compareRequirementId(a.id, b.id));

  const definedCount = definitions.size;
  const referencedCount = requirements.filter((r) => r.tasks.total > 0).length;
  const untrackedCount = requirements.filter(
    (r) => r.defined && r.tasks.total === 0
  ).length;
  const unknownCount = unknownReferences.size;
  const unmappedCount = unmappedTasks.length;

  const issuesFound = untrackedCount > 0 || unknownCount > 0 || unmappedCount > 0;
  const reasonCode = issuesFound
    ? 'REQUIREMENTS_ISSUES_FOUND'
    : 'REQUIREMENTS_REPORTED';

  if (options.json) {
    const payload = {
      status: 'ok',
      reasonCode,
      docsDir,
      counts: {
        defined: definedCount,
        referenced: referencedCount,
        untracked: untrackedCount,
        unknownReferences: unknownCount,
        unmappedTasks: unmappedCount,
      },
      requirements,
      unknownReferences: [...unknownReferences].sort(compareRequirementId),
      unmappedTasks,
    };
    console.log(JSON.stringify(payload, null, 2));
    if (options.strict && issuesFound) process.exitCode = 1;
    return;
  }

  const header =
    lang === 'ko'
      ? '# PRD 요구사항 커버리지'
      : '# PRD Requirements Coverage';

  const lines: string[] = [];
  lines.push(header);
  lines.push('');
  lines.push(`- Docs: ${docsDir}`);
  lines.push(
    `- Requirements: defined ${definedCount}, referenced ${referencedCount}, untracked ${untrackedCount}`
  );
  if (unknownCount > 0) lines.push(`- Unknown references: ${unknownCount}`);
  if (unmappedCount > 0) lines.push(`- Unmapped tasks: ${unmappedCount}`);
  lines.push('');
  lines.push('| ID | Title | State | Progress | Features |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of requirements) {
    const progress = `${r.tasks.done}/${r.tasks.total}`;
    const title = r.title ? r.title.replace(/\|/g, '\\|') : '';
    lines.push(
      `| ${r.id} | ${title} | ${r.state} | ${progress} | ${r.features.join(', ')} |`
    );
  }
  lines.push('');

  if (unknownCount > 0) {
    lines.push(lang === 'ko' ? '## 알 수 없는 참조' : '## Unknown References');
    lines.push('');
    for (const id of [...unknownReferences].sort(compareRequirementId)) {
      lines.push(`- ${id}`);
    }
    lines.push('');
  }

  if (unmappedCount > 0) {
    lines.push(lang === 'ko' ? '## 매핑 누락 태스크' : '## Unmapped Tasks');
    lines.push('');
    for (const task of unmappedTasks) {
      lines.push(`- ${task.feature}:${task.line} [${task.status}] ${task.title}`);
    }
    lines.push('');
  }

  // Print to terminal
  process.stdout.write(`${lines.join('\n')}\n`);

  if (options.write) {
    const outputPath = path.join(docsDir, 'prd', 'status.md');
    await ctx.fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf-8');
    console.log(chalk.green(`✅ wrote: ${outputPath}`));
  }

  if (options.strict && issuesFound) process.exitCode = 1;
}

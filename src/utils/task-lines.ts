export type TaskStatus = 'TODO' | 'DOING' | 'DONE' | 'REVIEW';

export interface TaskChecklistSummary {
  total: number;
  checked: number;
  unchecked: number;
  placeholderCount: number;
}

export interface TaskSectionSummary {
  items: string[];
  placeholderCount: number;
}

export interface ParsedTaskLine {
  index: number;
  raw: string;
  status: TaskStatus;
  tags: string[];
  taskId: string;
  title: string;
}

export function parseTaskLine(
  line: string,
  index = -1
): ParsedTaskLine | null {
  const match = line.match(
    /^\s*-\s*\[(TODO|DOING|DONE|REVIEW)\]((?:\[[^\]]+\])*)\s+(T-[A-Za-z0-9-]+)\s+(.+?)\s*$/
  );
  if (!match) return null;

  const tags = [...(match[2] || '').matchAll(/\[([^\]]+)\]/g)]
    .map((entry) => (entry[1] || '').trim())
    .filter(Boolean);

  return {
    index,
    raw: line,
    status: match[1] as TaskStatus,
    tags,
    taskId: match[3],
    title: match[4],
  };
}

function countLeadingSpaces(line: string): number {
  const match = line.match(/^(\s*)/);
  return match?.[1]?.length ?? 0;
}

function findTaskBlockEnd(lines: string[], taskLineIndex: number): number {
  let endIndex = lines.length;
  for (let index = taskLineIndex + 1; index < lines.length; index++) {
    if (parseTaskLine(lines[index]) || /^\s*##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }
  return endIndex;
}

function isPlaceholderTaskItem(text: string): boolean {
  const normalized = text.trim();
  return normalized === '' || normalized === '-' || /^todo$/i.test(normalized);
}

function parseTaskSectionItems(
  lines: string[],
  taskLineIndex: number,
  headingPattern: RegExp
): TaskSectionSummary | undefined {
  if (taskLineIndex < 0 || taskLineIndex >= lines.length) return undefined;

  const endIndex = findTaskBlockEnd(lines, taskLineIndex);
  let sectionHeaderIndex = -1;
  let sectionHeaderIndent = 0;
  for (let index = taskLineIndex + 1; index < endIndex; index++) {
    if (headingPattern.test(lines[index])) {
      sectionHeaderIndex = index;
      sectionHeaderIndent = countLeadingSpaces(lines[index]);
      break;
    }
  }

  if (sectionHeaderIndex === -1) return undefined;

  const items: string[] = [];
  let placeholderCount = 0;

  for (let index = sectionHeaderIndex + 1; index < endIndex; index++) {
    const line = lines[index];
    if (!line.trim()) continue;

    const indent = countLeadingSpaces(line);
    if (indent <= sectionHeaderIndent && /^\s*-\s+/.test(line)) {
      break;
    }

    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (!match) continue;

    const text = match[1].trim();
    items.push(text);
    if (isPlaceholderTaskItem(text)) placeholderCount++;
  }

  if (items.length === 0) return undefined;
  return { items, placeholderCount };
}

export function parseTaskAcceptance(
  lines: string[],
  taskLineIndex: number
): TaskSectionSummary | undefined {
  return parseTaskSectionItems(lines, taskLineIndex, /^\s*-\s+Acceptance:\s*$/);
}

export function parseTaskChecklist(
  lines: string[],
  taskLineIndex: number
): TaskChecklistSummary | undefined {
  if (taskLineIndex < 0 || taskLineIndex >= lines.length) return undefined;

  const endIndex = findTaskBlockEnd(lines, taskLineIndex);

  let checklistHeaderIndex = -1;
  let checklistHeaderIndent = 0;
  for (let index = taskLineIndex + 1; index < endIndex; index++) {
    if (/^\s*-\s+Checklist:\s*$/.test(lines[index])) {
      checklistHeaderIndex = index;
      checklistHeaderIndent = countLeadingSpaces(lines[index]);
      break;
    }
  }

  if (checklistHeaderIndex === -1) return undefined;

  let total = 0;
  let checked = 0;
  let placeholderCount = 0;

  for (let index = checklistHeaderIndex + 1; index < endIndex; index++) {
    const line = lines[index];
    if (!line.trim()) continue;

    const indent = countLeadingSpaces(line);
    if (indent <= checklistHeaderIndent && /^\s*-\s+/.test(line)) {
      break;
    }

    const match = line.match(/^\s*-\s*\[([ xX])\]\s+/);
    if (!match) continue;

    total++;
    if (match[1].toLowerCase() === 'x') checked++;
    const text = line.replace(/^\s*-\s*\[[ xX]\]\s+/, '').trim();
    if (isPlaceholderTaskItem(text)) placeholderCount++;
  }

  if (total === 0) return undefined;
  return { total, checked, unchecked: total - checked, placeholderCount };
}

export type TaskStatus = 'TODO' | 'DOING' | 'DONE' | 'REVIEW';

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

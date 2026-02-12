export type ProjectType = 'single' | 'multi';
export type RawProjectType = ProjectType | 'fullstack';

export function normalizeProjectType(input: string): ProjectType {
  if (input === 'fullstack') return 'multi';
  if (input === 'multi') return 'multi';
  return 'single';
}

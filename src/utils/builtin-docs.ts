import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs-extra';
import { Lang } from './i18n.js';
import { ProjectType } from './project-type.js';
import { getTemplatesDir } from './paths.js';

export type BuiltinDocId =
  | 'agents'
  | 'git-workflow'
  | 'issue-doc'
  | 'pr-doc'
  | 'create-feature'
  | 'execute-task'
  | 'create-issue'
  | 'create-pr'
  | 'split-feature';

interface BuiltinDocDefinition {
  id: BuiltinDocId;
  title: Record<Lang, string>;
  relativePath: (projectType: ProjectType, lang: Lang) => string;
}

export interface BuiltinDocEntry {
  id: BuiltinDocId;
  title: string;
  relativePath: string;
  absolutePath: string;
}

const BUILTIN_DOC_DEFINITIONS: ReadonlyArray<BuiltinDocDefinition> = [
  {
    id: 'agents',
    title: { ko: '에이전트 운영 규칙', en: 'Agent Operating Rules' },
    relativePath: (_, lang) => path.join(lang, 'common', 'agents', 'agents.md'),
  },
  {
    id: 'git-workflow',
    title: { ko: 'Git 워크플로우', en: 'Git Workflow' },
    relativePath: (_, lang) => path.join(lang, 'common', 'agents', 'git-workflow.md'),
  },
  {
    id: 'issue-doc',
    title: { ko: 'Issue 문서 템플릿', en: 'Issue Document Template' },
    relativePath: (_, lang) =>
      path.join(lang, 'common', 'features', 'feature-base', 'issue.md'),
  },
  {
    id: 'pr-doc',
    title: { ko: 'PR 문서 템플릿', en: 'PR Document Template' },
    relativePath: (_, lang) =>
      path.join(lang, 'common', 'features', 'feature-base', 'pr.md'),
  },
  {
    id: 'create-feature',
    title: { ko: 'create-feature 스킬', en: 'create-feature skill' },
    relativePath: (_, lang) =>
      path.join(lang, 'common', 'agents', 'skills', 'create-feature.md'),
  },
  {
    id: 'execute-task',
    title: { ko: 'execute-task 스킬', en: 'execute-task skill' },
    relativePath: (_, lang) =>
      path.join(lang, 'common', 'agents', 'skills', 'execute-task.md'),
  },
  {
    id: 'create-issue',
    title: { ko: 'create-issue 스킬', en: 'create-issue skill' },
    relativePath: (_, lang) =>
      path.join(lang, 'common', 'agents', 'skills', 'create-issue.md'),
  },
  {
    id: 'create-pr',
    title: { ko: 'create-pr 스킬', en: 'create-pr skill' },
    relativePath: (_, lang) =>
      path.join(lang, 'common', 'agents', 'skills', 'create-pr.md'),
  },
  {
    id: 'split-feature',
    title: { ko: 'feature 분할 가이드', en: 'feature split guide' },
    relativePath: (_, lang) =>
      path.join(lang, 'common', 'agents', 'skills', 'split-feature.md'),
  },
];

const DOC_FOLLOWUPS: Readonly<Record<BuiltinDocId, BuiltinDocId[]>> = {
  agents: [
    'create-feature',
    'execute-task',
    'split-feature',
    'git-workflow',
    'create-issue',
    'issue-doc',
    'create-pr',
    'pr-doc',
  ],
  'git-workflow': [],
  'issue-doc': [],
  'pr-doc': [],
  'create-feature': ['execute-task'],
  'execute-task': ['git-workflow', 'split-feature'],
  'create-issue': ['issue-doc'],
  'create-pr': ['pr-doc'],
  'split-feature': [],
};

const CATEGORY_DOC_MAP: Readonly<Record<string, BuiltinDocId[]>> = {
  spec_write: ['agents'],
  spec_approve: ['agents'],
  plan_write: ['agents'],
  plan_approve: ['agents'],
  tasks_write: ['agents', 'execute-task'],
  tasks_approve: ['execute-task'],
  task_execute: ['execute-task', 'git-workflow'],
  implementation_approve: ['execute-task'],
  review_fix_commit: ['create-pr', 'git-workflow'],
  docs_commit: ['git-workflow'],
  branch_create: ['git-workflow'],
  issue_create: ['create-issue', 'issue-doc', 'git-workflow'],
  pre_pr_review_run: ['create-pr'],
  pre_pr_review_record: ['create-pr'],
  pr_create: ['create-pr', 'pr-doc', 'git-workflow'],
  pr_status_update: ['create-pr'],
  code_review_run: ['create-pr'],
  code_review: ['create-pr'],
  feature_scope_split: ['split-feature', 'execute-task'],
  worktree_cleanup: ['git-workflow'],
  user_request_replan: ['agents', 'execute-task'],
};

export function getBuiltinDocIds(): BuiltinDocId[] {
  return BUILTIN_DOC_DEFINITIONS.map((doc) => doc.id);
}

export function normalizeBuiltinDocId(input: string): BuiltinDocId | null {
  const normalized = input.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'git-workflow') return 'git-workflow';
  if (normalized === 'issue-doc' || normalized === 'issue-md') return 'issue-doc';
  if (normalized === 'pr-doc' || normalized === 'pr-md') return 'pr-doc';
  // Backward-compat aliases (deprecated)
  if (normalized === 'issue-template') return 'issue-doc';
  if (normalized === 'pr-template') return 'pr-doc';
  if (normalized === 'create-feature') return 'create-feature';
  if (normalized === 'execute-task') return 'execute-task';
  if (normalized === 'create-issue') return 'create-issue';
  if (normalized === 'create-pr') return 'create-pr';
  if (normalized === 'split-feature' || normalized === 'feature-split') {
    return 'split-feature';
  }
  if (normalized === 'agents') return 'agents';
  return null;
}

export function toBuiltinDocCommand(docId: BuiltinDocId): string {
  return `npx lee-spec-kit docs get ${docId} --json`;
}

function uniqDocIds(ids: BuiltinDocId[]): BuiltinDocId[] {
  const seen = new Set<BuiltinDocId>();
  const ordered: BuiltinDocId[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

export function getFollowupDocIds(docId: BuiltinDocId): BuiltinDocId[] {
  return [...(DOC_FOLLOWUPS[docId] || [])];
}

export function getRecommendedDocIdsForCategories(
  categories: Array<string | undefined>
): BuiltinDocId[] {
  const ids: BuiltinDocId[] = [];
  for (const category of categories) {
    if (!category) continue;
    ids.push(...(CATEGORY_DOC_MAP[category] || []));
  }
  return uniqDocIds(ids);
}

export function listBuiltinDocs(
  projectType: ProjectType,
  lang: Lang
): BuiltinDocEntry[] {
  const templatesDir = getTemplatesDir();
  return BUILTIN_DOC_DEFINITIONS.map((doc) => {
    const relativePath = doc.relativePath(projectType, lang);
    return {
      id: doc.id,
      title: doc.title[lang],
      relativePath,
      absolutePath: path.join(templatesDir, relativePath),
    };
  });
}

export async function getBuiltinDoc(
  docId: BuiltinDocId,
  projectType: ProjectType,
  lang: Lang
): Promise<{
  entry: BuiltinDocEntry;
  content: string;
  hash: string;
  followups: BuiltinDocId[];
}> {
  const entry = listBuiltinDocs(projectType, lang).find((doc) => doc.id === docId);
  if (!entry) {
    throw new Error(`Unknown builtin doc: ${docId}`);
  }
  const content = await fs.readFile(entry.absolutePath, 'utf-8');
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
  return {
    entry,
    content,
    hash,
    followups: getFollowupDocIds(docId),
  };
}

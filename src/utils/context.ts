import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';
import { ProjectConfig } from './config.js';

type RepoType = 'single' | 'fe' | 'be';
type DocStatus = 'Draft' | 'Review' | 'Approved';

export type ActionScope = 'project' | 'docs';

export type NextAction =
  | {
      type: 'command';
      scope: ActionScope;
      cwd: string;
      cmd: string;
    }
  | {
      type: 'instruction';
      message: string;
    };

export interface TaskRef {
  status: 'TODO' | 'DOING' | 'DONE' | 'REVIEW';
  title: string;
}

export interface CompletionChecklistSummary {
  total: number;
  checked: number;
}

export interface FeatureState {
  id?: string;
  slug: string;
  folderName: string;
  type: RepoType;
  path: string;
  issueNumber?: string;
  specStatus?: DocStatus;
  planStatus?: DocStatus;
  tasks: {
    total: number;
    todo: number;
    doing: number;
    done: number;
  };
  activeTask?: TaskRef;
  nextTodoTask?: TaskRef;
  completionChecklist?: CompletionChecklistSummary;
  git: {
    docsBranch: string;
    projectBranch: string;
    projectBranchAvailable: boolean;
    docsGitCwd: string;
    projectGitCwd?: string;
    onExpectedBranch: boolean;
    docsHasUncommittedChanges: boolean;
  };
  docs: {
    featurePathFromDocs: string;
    specExists: boolean;
    planExists: boolean;
    tasksExists: boolean;
  };
}

export interface StepDefinition {
  step: number;
  name: string;
  checklist: {
    done: (feature: FeatureState) => boolean;
    detail?: (feature: FeatureState) => string;
  };
  current?: {
    when: (feature: FeatureState) => boolean;
    actions: (feature: FeatureState) => NextAction[];
  };
}

function isCompletionChecklistDone(feature: FeatureState): boolean {
  return (
    !!feature.completionChecklist &&
    feature.completionChecklist.total > 0 &&
    feature.completionChecklist.checked === feature.completionChecklist.total
  );
}

export const STEP_DEFINITIONS: StepDefinition[] = [
  {
    step: 1,
    name: 'Feature 폴더 생성',
    checklist: { done: () => true },
  },
  {
    step: 2,
    name: 'spec.md 작성',
    checklist: { done: (f) => f.specStatus === 'Review' || f.specStatus === 'Approved' },
    current: {
      when: (f) => !f.docs.specExists || !f.specStatus || f.specStatus === 'Draft',
      actions: (f) => [
        {
          type: 'instruction',
          message: !f.docs.specExists
            ? 'spec.md 파일을 작성하세요. (상태: Draft부터 시작)'
            : 'spec.md를 작성/보완하고, Status를 Review로 변경한 뒤 사용자 리뷰를 요청하세요.',
        },
      ],
    },
  },
  {
    step: 3,
    name: 'spec.md 승인',
    checklist: { done: (f) => f.specStatus === 'Approved' },
    current: {
      when: (f) => f.specStatus === 'Review',
      actions: () => [
        {
          type: 'instruction',
          message: '사용자에게 spec.md를 공유하고 명시적 승인(Approved)을 받으세요.',
        },
      ],
    },
  },
  {
    step: 4,
    name: 'GitHub Issue 생성',
    checklist: { done: (f) => !!f.issueNumber },
    current: {
      when: (f) => f.specStatus === 'Approved' && !f.issueNumber,
      actions: () => [
        {
          type: 'instruction',
          message:
            'GitHub Issue를 생성하고 spec.md의 **이슈 번호**에 #번호를 기입하세요.',
        },
      ],
    },
  },
  {
    step: 5,
    name: '브랜치 생성',
    checklist: { done: (f) => f.git.onExpectedBranch },
    current: {
      when: (f) =>
        !!f.issueNumber &&
        (!f.git.projectBranchAvailable || !f.git.onExpectedBranch),
      actions: (f) => {
        if (!f.git.projectBranchAvailable || !f.git.projectGitCwd) {
          return [
            {
              type: 'instruction',
              message:
                'standalone 모드라면 projectRoot를 설정한 뒤 다시 context를 확인하세요. (npx lee-spec-kit config --project-root ...)',
            },
          ];
        }

        return [
          {
            type: 'command',
            scope: 'project',
            cwd: f.git.projectGitCwd,
            cmd: `git -C "${f.git.projectGitCwd}" checkout -b feat/${f.issueNumber}-${f.slug}`,
          },
        ];
      },
    },
  },
  {
    step: 6,
    name: 'plan.md 작성',
    checklist: { done: (f) => f.planStatus === 'Review' || f.planStatus === 'Approved' },
    current: {
      when: (f) =>
        f.git.onExpectedBranch &&
        (!f.docs.planExists || !f.planStatus || f.planStatus === 'Draft'),
      actions: (f) => [
        {
          type: 'instruction',
          message: !f.docs.planExists
            ? 'plan.md를 작성하세요. (상태: Draft부터 시작)'
            : 'plan.md를 작성/보완하고, Status를 Review로 변경한 뒤 사용자 리뷰를 요청하세요.',
        },
      ],
    },
  },
  {
    step: 7,
    name: 'plan.md 승인',
    checklist: { done: (f) => f.planStatus === 'Approved' },
    current: {
      when: (f) => f.planStatus === 'Review',
      actions: () => [
        {
          type: 'instruction',
          message: '사용자에게 plan.md를 공유하고 명시적 승인(Approved)을 받으세요.',
        },
      ],
    },
  },
  {
    step: 8,
    name: 'tasks.md 작성/실행',
    checklist: {
      done: (f) =>
        f.docs.tasksExists && f.tasks.total > 0 && f.tasks.total === f.tasks.done,
      detail: (f) => (f.tasks.total > 0 ? `(${f.tasks.done}/${f.tasks.total})` : ''),
    },
    current: {
      when: (f) =>
        f.planStatus === 'Approved' &&
        (!f.docs.tasksExists || f.tasks.total === 0 || f.tasks.done < f.tasks.total),
      actions: (f) => {
        let message = '';
        if (!f.docs.tasksExists) {
          message = 'tasks.md를 작성하세요. (각 태스크 상태: [TODO])';
          return [{ type: 'instruction', message }];
        }
        if (f.tasks.total === 0) {
          message = 'tasks.md에 최소 1개 이상의 태스크를 작성하세요.';
          return [{ type: 'instruction', message }];
        }
        if (f.activeTask) {
          message = `[DOING] 태스크를 완료하세요: ${f.activeTask.title} (진행률: ${f.tasks.done}/${f.tasks.total})`;
          return [{ type: 'instruction', message }];
        }
        if (f.nextTodoTask) {
          message = `다음 태스크를 [DOING]으로 변경하고 시작하세요: ${f.nextTodoTask.title} (진행률: ${f.tasks.done}/${f.tasks.total})`;
          return [{ type: 'instruction', message }];
        }
        message = `tasks.md의 태스크 상태([TODO]/[DOING]/[DONE])를 확인하세요. (진행률: ${f.tasks.done}/${f.tasks.total})`;
        return [{ type: 'instruction', message }];
      },
    },
  },
  {
    step: 9,
    name: '문서 커밋 전 확인',
    checklist: {
      done: (f) => isCompletionChecklistDone(f),
      detail: (f) =>
        f.completionChecklist
          ? `(${f.completionChecklist.checked}/${f.completionChecklist.total})`
          : '',
    },
    current: {
      when: (f) =>
        f.docs.tasksExists &&
        f.tasks.total > 0 &&
        f.tasks.total === f.tasks.done &&
        !isCompletionChecklistDone(f),
      actions: (f) => [
        {
          type: 'instruction',
          message: !f.completionChecklist
            ? '모든 태스크가 완료되었습니다. tasks.md에 "완료 조건" 체크리스트를 추가/확인한 뒤 진행하세요.'
            : `문서 커밋 전 체크리스트(완료 조건)를 실제로 확인하고 체크하세요. (${f.completionChecklist.checked}/${f.completionChecklist.total})`,
        },
      ],
    },
  },
  {
    step: 10,
    name: '문서 커밋',
    checklist: {
      done: (f) => isCompletionChecklistDone(f) && !f.git.docsHasUncommittedChanges,
    },
    current: {
      when: (f) => isCompletionChecklistDone(f),
      actions: (f) =>
        f.git.docsHasUncommittedChanges
          ? [
              {
                type: 'command',
                scope: 'docs',
                cwd: f.git.docsGitCwd,
                cmd: `git -C "${f.git.docsGitCwd}" add "${f.docs.featurePathFromDocs}" && git -C "${f.git.docsGitCwd}" commit -m "docs(#${f.issueNumber ?? '<issue>'}): ${f.folderName} 문서 업데이트"`,
              },
            ]
          : [
              {
                type: 'instruction',
                message: '문서 커밋이 완료되었습니다. 다음 Feature로 이동하세요.',
              },
            ],
    },
  },
];

// 10단계 이름 맵 (SSOT: STEP_DEFINITIONS)
export const STEPS: Record<number, string> = Object.fromEntries(
  STEP_DEFINITIONS.map((d) => [d.step, d.name])
);

export function resolveFeatureProgress(feature: FeatureState): {
  currentStep: number;
  actions: NextAction[];
  nextAction: string;
} {
  const ordered = [...STEP_DEFINITIONS].sort((a, b) => a.step - b.step);
  for (const definition of ordered) {
    if (!definition.current) continue;
    if (definition.current.when(feature)) {
      const actions = definition.current.actions(feature);
      return {
        currentStep: definition.step,
        actions,
        nextAction: actions
          .map((a) => (a.type === 'command' ? a.cmd : a.message))
          .join('\n'),
      };
    }
  }

  // 예상치 못한 상태: 마지막 step로 폴백
  const lastStep = ordered[ordered.length - 1];
  return {
    currentStep: lastStep?.step ?? 10,
    actions: [
      { type: 'instruction', message: 'npx lee-spec-kit context로 상태를 다시 확인하세요.' },
    ],
    nextAction: 'npx lee-spec-kit context로 상태를 다시 확인하세요.',
  };
}

export interface FeatureContext extends FeatureState {
  currentStep: number;
  actions: NextAction[];
  nextAction: string;
  warnings: string[];
}

// Git 브랜치 이름 가져오기
export function getCurrentBranch(cwd: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSpecValue(content: string, key: string): string | undefined {
  const regex = new RegExp(
    `^\\s*-\\s*\\*\\*${escapeRegExp(key)}\\*\\*\\s*:\\s*(.*)$`,
    'm'
  );
  const match = content.match(regex);
  return match ? match[1].trim() : undefined;
}

function extractFirstSpecValue(
  content: string,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = extractSpecValue(content, key);
    if (value) return value;
  }
  return undefined;
}

function parseDocStatus(value: string | undefined): DocStatus | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  // 템플릿 기본값 "Draft | Review | Approved" 같은 placeholder는 미선택으로 처리
  if (trimmed.includes('|')) return undefined;

  const match = trimmed.match(/\b(Draft|Review|Approved)\b/i);
  if (!match) return undefined;
  const normalized = match[1].toLowerCase();
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'review') return 'Review';
  return 'Approved';
}

function parseIssueNumber(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/#?(\d+)/);
  return match ? match[1] : undefined;
}

function parseTasks(content: string): {
  summary: FeatureState['tasks'];
  activeTask?: TaskRef;
  nextTodoTask?: TaskRef;
} {
  const summary = { total: 0, todo: 0, doing: 0, done: 0 };
  let activeTask: TaskRef | undefined;
  let nextTodoTask: TaskRef | undefined;

  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(
      /^\s*-\s*\[([A-Z]+)\]((?:\[[^\]]+\])*)\s*(.+?)\s*$/
    );
    if (!match) continue;

    const status = match[1].toUpperCase();
    const title = match[3].trim();

    summary.total++;
    if (status === 'DONE') summary.done++;
    else if (status === 'DOING' || status === 'REVIEW') summary.doing++;
    else if (status === 'TODO') summary.todo++;

    if (!activeTask && (status === 'DOING' || status === 'REVIEW')) {
      activeTask = { status: status as TaskRef['status'], title };
    }
    if (!nextTodoTask && status === 'TODO') {
      nextTodoTask = { status: 'TODO', title };
    }
  }

  return { summary, activeTask, nextTodoTask };
}

function parseCompletionChecklist(
  content: string
): CompletionChecklistSummary | undefined {
  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) =>
    /^\s*##\s+(완료 조건|Completion Criteria)\s*$/.test(line)
  );
  if (startIndex === -1) return undefined;

  let total = 0;
  let checked = 0;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*##\s+/.test(line)) break; // 다음 섹션 시작

    const match = line.match(/^\s*-\s*\[([ xX])\]\s+/);
    if (!match) continue;
    total++;
    if (match[1].toLowerCase() === 'x') checked++;
  }

  return total > 0 ? { total, checked } : undefined;
}

function getGitStatusPorcelain(
  cwd: string,
  relativePaths: string[]
): string | undefined {
  try {
    const args =
      relativePaths.length > 0
        ? ` -- ${relativePaths.map((p) => `"${p}"`).join(' ')}`
        : '';
    return execSync(`git status --porcelain=v1${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return undefined;
  }
}

function getGitTopLevel(cwd: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function resolveProjectGitCwd(
  config: ProjectConfig,
  repo: RepoType
): { cwd: string | null; warning?: string } {
  const docsRepo = config.docsRepo;
  if (docsRepo !== 'standalone') {
    const topLevel = getGitTopLevel(process.cwd());
    return { cwd: topLevel || process.cwd() };
  }

  if (!config.projectRoot) {
    return {
      cwd: null,
      warning:
        'standalone 모드입니다. projectRoot가 설정되지 않아 프로젝트 브랜치 확인이 불가능합니다. (npx lee-spec-kit config --project-root ...)',
    };
  }

  if (config.projectType === 'fullstack') {
    if (typeof config.projectRoot === 'string') {
      return {
        cwd: null,
        warning:
          'fullstack standalone 모드인데 projectRoot 형태가 올바르지 않습니다. (예: { "fe": "...", "be": "..." })',
      };
    }
    const root = config.projectRoot[repo as 'fe' | 'be'];
    if (!root) {
      return {
        cwd: null,
        warning: `projectRoot.${repo}가 비어있습니다. (npx lee-spec-kit config --project-root ... --repo ${repo})`,
      };
    }
    return { cwd: getGitTopLevel(root) || root };
  }

  if (typeof config.projectRoot !== 'string') {
    return {
      cwd: null,
      warning:
        'single standalone 모드인데 projectRoot 형태가 올바르지 않습니다. (예: "/path/to/project")',
    };
  }
  return { cwd: getGitTopLevel(config.projectRoot) || config.projectRoot };
}

function isExpectedFeatureBranch(
  branchName: string,
  issueNumber: string | undefined,
  slug: string,
  folderName: string
): boolean {
  if (!branchName || !issueNumber) return false;
  const match = branchName.match(new RegExp(`^feat\\/${issueNumber}-(.+)$`));
  if (!match) return false;
  const rest = match[1];
  return rest === slug || rest === folderName;
}

// Feature 상태 파싱
export async function parseFeature(
  featurePath: string,
  type: RepoType,
  context: {
    projectBranch: string;
    docsBranch: string;
    docsGitCwd: string;
    projectGitCwd?: string;
    docsDir: string;
    projectBranchAvailable: boolean;
  }
): Promise<FeatureContext> {
  const folderName = path.basename(featurePath);
  const match = folderName.match(/^(F\d+)-(.+)$/);
  const id = match?.[1];
  const slug = match?.[2] || folderName;

  const specPath = path.join(featurePath, 'spec.md');
  const planPath = path.join(featurePath, 'plan.md');
  const tasksPath = path.join(featurePath, 'tasks.md');

  // 1. Spec 파싱
  let specStatus: DocStatus | undefined;
  let issueNumber: string | undefined;
  const specExists = await fs.pathExists(specPath);

  if (specExists) {
    const content = await fs.readFile(specPath, 'utf-8');
    const statusValue = extractFirstSpecValue(content, ['상태', 'Status']);
    specStatus = parseDocStatus(statusValue);

    const issueValue = extractFirstSpecValue(content, [
      '이슈 번호',
      'Issue Number',
      'Issue',
    ]);
    issueNumber = parseIssueNumber(issueValue);
  }

  // 2. Plan 파싱
  let planStatus: DocStatus | undefined;
  const planExists = await fs.pathExists(planPath);

  if (planExists) {
    const content = await fs.readFile(planPath, 'utf-8');
    const statusValue = extractFirstSpecValue(content, ['상태', 'Status']);
    planStatus = parseDocStatus(statusValue);
  }

  // 3. Tasks 파싱
  const tasksExists = await fs.pathExists(tasksPath);
  const tasksSummary = { total: 0, todo: 0, doing: 0, done: 0 };
  let activeTask: TaskRef | undefined;
  let nextTodoTask: TaskRef | undefined;
  let completionChecklist: CompletionChecklistSummary | undefined;

  if (tasksExists) {
    const content = await fs.readFile(tasksPath, 'utf-8');
    const { summary, activeTask: active, nextTodoTask: nextTodo } =
      parseTasks(content);
    tasksSummary.total = summary.total;
    tasksSummary.todo = summary.todo;
    tasksSummary.doing = summary.doing;
    tasksSummary.done = summary.done;
    activeTask = active;
    nextTodoTask = nextTodo;
    completionChecklist = parseCompletionChecklist(content);
  }

  const warnings: string[] = [];
  if (context.projectBranchAvailable === false) {
    warnings.push(
      '프로젝트 브랜치를 확인할 수 없습니다. (standalone 모드라면 projectRoot 설정이 필요합니다.)'
    );
  }

  const onExpectedBranch = isExpectedFeatureBranch(
    context.projectBranch,
    issueNumber,
    slug,
    folderName
  );

  const relativeFeaturePathFromDocs = path.relative(context.docsDir, featurePath);
  const docsStatus = getGitStatusPorcelain(context.docsGitCwd, [
    relativeFeaturePathFromDocs,
  ]);
  const docsHasUncommittedChanges =
    docsStatus === undefined ? true : docsStatus.trim().length > 0;
  if (docsStatus === undefined) {
    warnings.push(
      'docs 레포에서 git 상태를 확인할 수 없습니다. (git 초기화/레포 위치를 확인하세요.)'
    );
  }

  const featureState: FeatureState = {
    id,
    slug,
    folderName,
    type,
    path: featurePath,
    issueNumber,
    specStatus,
    planStatus,
    tasks: tasksSummary,
    activeTask,
    nextTodoTask,
    completionChecklist,
    git: {
      docsBranch: context.docsBranch,
      projectBranch: context.projectBranch,
      projectBranchAvailable: context.projectBranchAvailable,
      docsGitCwd: context.docsGitCwd,
      projectGitCwd: context.projectGitCwd,
      onExpectedBranch,
      docsHasUncommittedChanges,
    },
    docs: {
      featurePathFromDocs: relativeFeaturePathFromDocs,
      specExists,
      planExists,
      tasksExists,
    },
  };

  const { currentStep, actions, nextAction } = resolveFeatureProgress(featureState);

  return {
    ...featureState,
    currentStep,
    actions,
    nextAction,
    warnings,
  };
}

// 전체 Feature 스캔
export async function scanFeatures(config: ProjectConfig): Promise<{
  features: FeatureContext[];
  branches: {
    docs: string;
    project: { single?: string; fe?: string; be?: string };
  };
  warnings: string[];
}> {
  const features: FeatureContext[] = [];
  const warnings: string[] = [];

  const docsBranch = getCurrentBranch(config.docsDir);

  const projectBranches: { single: string; fe: string; be: string } = {
    single: '',
    fe: '',
    be: '',
  };
  let singleProject: { cwd: string | null; warning?: string } | undefined;
  let feProject: { cwd: string | null; warning?: string } | undefined;
  let beProject: { cwd: string | null; warning?: string } | undefined;

  if (config.projectType === 'single') {
    singleProject = resolveProjectGitCwd(config, 'single');
    if (singleProject.warning) warnings.push(singleProject.warning);
    projectBranches.single = singleProject.cwd
      ? getCurrentBranch(singleProject.cwd)
      : '';
  } else {
    feProject = resolveProjectGitCwd(config, 'fe');
    beProject = resolveProjectGitCwd(config, 'be');
    if (feProject.warning) warnings.push(feProject.warning);
    if (beProject.warning) warnings.push(beProject.warning);
    projectBranches.fe = feProject.cwd ? getCurrentBranch(feProject.cwd) : '';
    projectBranches.be = beProject.cwd ? getCurrentBranch(beProject.cwd) : '';
  }

  if (config.projectType === 'single') {
    // Single: docs/features/*
    const featureDirs = await glob('features/*/', {
      cwd: config.docsDir,
      absolute: true,
      ignore: ['**/feature-base/**'],
    });

    for (const dir of featureDirs) {
      if ((await fs.stat(dir)).isDirectory()) {
        features.push(
          await parseFeature(dir, 'single', {
            projectBranch: projectBranches.single,
            docsBranch,
            docsGitCwd: config.docsDir,
            projectGitCwd: singleProject?.cwd ?? undefined,
            docsDir: config.docsDir,
            projectBranchAvailable: Boolean(singleProject?.cwd),
          })
        );
      }
    }
  } else {
    // Fullstack: docs/features/{fe,be}/*
    const feDirs = await glob('features/fe/*/', {
      cwd: config.docsDir,
      absolute: true,
    });
    const beDirs = await glob('features/be/*/', {
      cwd: config.docsDir,
      absolute: true,
    });

    for (const dir of feDirs) {
      if ((await fs.stat(dir)).isDirectory()) {
        features.push(
          await parseFeature(dir, 'fe', {
            projectBranch: projectBranches.fe,
            docsBranch,
            docsGitCwd: config.docsDir,
            projectGitCwd: feProject?.cwd ?? undefined,
            docsDir: config.docsDir,
            projectBranchAvailable: Boolean(feProject?.cwd),
          })
        );
      }
    }
    for (const dir of beDirs) {
      if ((await fs.stat(dir)).isDirectory()) {
        features.push(
          await parseFeature(dir, 'be', {
            projectBranch: projectBranches.be,
            docsBranch,
            docsGitCwd: config.docsDir,
            projectGitCwd: beProject?.cwd ?? undefined,
            docsDir: config.docsDir,
            projectBranchAvailable: Boolean(beProject?.cwd),
          })
        );
      }
    }
  }

  return {
    features,
    branches: {
      docs: docsBranch,
      project: {
        ...(config.projectType === 'single'
          ? { single: projectBranches.single }
          : { fe: projectBranches.fe, be: projectBranches.be }),
      },
    },
    warnings,
  };
}

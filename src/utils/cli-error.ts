import { DEFAULT_LANG, normalizeLang, type Lang } from './i18n.js';

export type CliReasonCode =
  | 'PROMPT_BLOCKED'
  | 'CONFIG_NOT_FOUND'
  | 'DOCS_NOT_FOUND'
  | 'LOCK_WAIT_TIMEOUT'
  | 'LOCK_ACQUIRE_TIMEOUT'
  | 'PRECONDITION_FAILED'
  | 'INVALID_ARGUMENT'
  | 'DUPLICATE_FEATURE_ID'
  | 'MISSING_FEATURE_ID'
  | 'INVALID_APPROVAL'
  | 'APPROVAL_REQUIRED'
  | 'CONTEXT_SELECTION_REQUIRED'
  | 'NO_ACTION_OPTIONS'
  | 'CONTEXT_STALE'
  | 'ACTION_NOT_AVAILABLE'
  | 'EXECUTION_NOT_COMMAND'
  | 'EXECUTION_FAILED'
  | 'UNKNOWN_ERROR';

export interface CliSuggestion {
  label: string;
  title: string;
  command?: string;
}

export class CliError extends Error {
  readonly code: CliReasonCode;

  constructor(code: CliReasonCode, message: string) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

export function createCliError(code: CliReasonCode, message: string): CliError {
  return new CliError(code, message);
}

export function toCliError(
  error: unknown,
  fallbackCode: CliReasonCode = 'UNKNOWN_ERROR'
): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof Error) return new CliError(fallbackCode, error.message);
  return new CliError(fallbackCode, String(error));
}

type SuggestionSeed = {
  title: { ko: string; en: string };
  command?: string;
};

function withLabels(seeds: SuggestionSeed[], lang: Lang): CliSuggestion[] {
  return seeds.map((seed, index) => ({
    label: String.fromCharCode(65 + index),
    title: seed.title[lang],
    command: seed.command,
  }));
}

export function getCliErrorSuggestions(
  code: CliReasonCode,
  lang: Lang = DEFAULT_LANG
): CliSuggestion[] {
  const resolvedLang = normalizeLang(lang);
  switch (code) {
    case 'PROMPT_BLOCKED':
      return withLabels(
        [
        {
            title: {
              ko: '--non-interactive 없이 같은 명령을 다시 실행하세요.',
              en: 'Run the same command without --non-interactive.',
            },
        },
        {
            title: {
              ko: '필수 플래그를 모두 명시하거나(`--force` 포함) 다시 실행하세요.',
              en: 'Pass all required flags (including `--force` when needed), then run again.',
            },
        },
        {
            title: {
              ko: '필수 옵션을 먼저 확인하세요.',
              en: 'Check required options first.',
            },
            command: 'npx lee-spec-kit <command> --help',
        },
      ],
        resolvedLang
      );
    case 'CONFIG_NOT_FOUND':
    case 'DOCS_NOT_FOUND':
      return withLabels(
        [
        {
            title: {
              ko: '현재 워크스페이스에서 docs를 초기화하세요.',
              en: 'Initialize docs in the current workspace.',
            },
            command: 'npx lee-spec-kit init',
        },
        {
            title: {
              ko: 'docs 위치와 설정을 점검하세요.',
              en: 'Verify docs location and configuration.',
            },
            command: 'npx lee-spec-kit doctor --json',
        },
        {
            title: {
              ko: 'docs/가 있는 디렉터리에서 명령을 실행하세요.',
              en: 'Run command from the directory that contains docs/.',
            },
        },
      ],
        resolvedLang
      );
    case 'LOCK_WAIT_TIMEOUT':
    case 'LOCK_ACQUIRE_TIMEOUT':
      return withLabels(
        [
        {
            title: {
              ko: '잠시 기다린 뒤 같은 명령을 다시 실행하세요.',
              en: 'Wait briefly, then retry the same command.',
            },
        },
        {
            title: {
              ko: '다른 lee-spec-kit 프로세스가 실행 중인지 확인하세요.',
              en: 'Check whether another lee-spec-kit process is still running.',
            },
        },
        {
            title: {
              ko: '락 파일(`docs/.lee-spec-kit.lock` 또는 상위 경로 `.lee-spec-kit.<docsDir>.lock`)을 확인하세요.',
              en: 'Inspect lock files (`docs/.lee-spec-kit.lock` or parent `.lee-spec-kit.<docsDir>.lock`).',
            },
        },
      ],
        resolvedLang
      );
    case 'INVALID_ARGUMENT':
      return withLabels(
        [
        {
            title: {
              ko: '명령 사용법과 유효한 플래그를 확인하세요.',
              en: 'Review command usage and valid flags.',
            },
            command: 'npx lee-spec-kit <command> --help',
        },
        {
            title: {
              ko: '잘못된 값을 수정한 뒤 다시 실행하세요.',
              en: 'Fix invalid value(s) and retry.',
            },
        },
        {
            title: {
              ko: '자동화 환경이라면 CLI 호출 전에 인자를 검증하세요.',
              en: 'If using automation, validate arguments before invoking CLI.',
            },
        },
      ],
        resolvedLang
      );
    case 'PRECONDITION_FAILED':
      return withLabels(
        [
          {
            title: {
              ko: '실행 전제조건을 만족하도록 환경/작업트리를 먼저 정리하세요.',
              en: 'Satisfy the command preconditions first (environment/worktree).',
            },
          },
          {
            title: {
              ko: '워크스페이스 진단으로 현재 상태를 확인하세요.',
              en: 'Run workspace diagnostics to inspect current state.',
            },
            command: 'npx lee-spec-kit doctor --json',
          },
          {
            title: {
              ko: '의도한 덮어쓰기라면 강제 옵션 사용을 검토하세요.',
              en: 'If overwrite is intentional, consider the force flag.',
            },
          },
        ],
        resolvedLang
      );
    case 'DUPLICATE_FEATURE_ID':
      return withLabels(
        [
          {
            title: {
              ko: '중복된 Feature ID를 정리한 뒤 다시 실행하세요.',
              en: 'Resolve duplicate Feature IDs, then run again.',
            },
          },
          {
            title: {
              ko: '각 Feature 폴더명이 고유한 `F###-slug` 형식인지 확인하세요.',
              en: 'Ensure each feature folder has a unique `F###-slug` name.',
            },
          },
          {
            title: {
              ko: '중복 여부를 JSON 진단으로 확인하세요.',
              en: 'Inspect duplicates via JSON diagnostics.',
            },
            command: 'npx lee-spec-kit doctor --json',
          },
        ],
        resolvedLang
      );
    case 'MISSING_FEATURE_ID':
      return withLabels(
        [
          {
            title: {
              ko: 'ID가 없는 Feature 폴더를 `F###-slug` 형식으로 변경하세요.',
              en: 'Rename feature folders without IDs to `F###-slug` format.',
            },
          },
          {
            title: {
              ko: 'spec/tasks 문서의 Feature ID도 함께 정리하세요.',
              en: 'Align Feature IDs in spec/tasks docs after renaming.',
            },
          },
          {
            title: {
              ko: '누락 항목을 JSON 진단으로 확인하세요.',
              en: 'Inspect missing IDs via JSON diagnostics.',
            },
            command: 'npx lee-spec-kit doctor --json',
          },
        ],
        resolvedLang
      );
    case 'INVALID_APPROVAL':
      return withLabels(
        [
        {
            title: {
              ko: '먼저 최신 옵션을 다시 조회하세요.',
              en: 'Fetch latest options first.',
            },
            command: 'npx lee-spec-kit context',
        },
        {
            title: {
              ko: '유효한 라벨(또는 `<라벨> OK`)만 응답하세요. 예: A',
              en: 'Reply with a valid label only (or "<label> OK"), e.g. A.',
            },
        },
        {
            title: {
              ko: '한 번에 라벨 1개만 선택하세요.',
              en: 'Use one label at a time.',
            },
        },
      ],
        resolvedLang
      );
    case 'APPROVAL_REQUIRED':
      return withLabels(
        [
        {
            title: {
              ko: '--approve <라벨>과 함께 다시 실행하세요.',
              en: 'Re-run with --approve <label>.',
            },
            command: 'npx lee-spec-kit context --approve A',
        },
        {
            title: {
              ko: '승인된 옵션이 command일 때만 --execute를 사용하세요.',
              en: 'Add --execute only when the approved option is a command.',
            },
        },
        {
            title: {
              ko: '먼저 옵션을 조회한 뒤 라벨 1개를 선택하세요.',
              en: 'List options first, then choose one label.',
            },
            command: 'npx lee-spec-kit context',
        },
      ],
        resolvedLang
      );
    case 'CONTEXT_SELECTION_REQUIRED':
      return withLabels(
        [
        {
            title: {
              ko: '단일 Feature selector를 명시하세요.',
              en: 'Specify one feature selector explicitly.',
            },
            command: 'npx lee-spec-kit context <slug|F001|F001-slug>',
        },
        {
            title: {
              ko: 'fullstack 모드에서는 --repo로 범위를 좁히세요.',
              en: 'Narrow by repository in fullstack mode.',
            },
            command: 'npx lee-spec-kit context --repo fe',
        },
        {
            title: {
              ko: '먼저 전체 후보를 확인하세요.',
              en: 'Inspect all candidates first.',
            },
            command: 'npx lee-spec-kit context --all',
        },
      ],
        resolvedLang
      );
    case 'NO_ACTION_OPTIONS':
      return withLabels(
        [
        {
            title: {
              ko: '현재 상태를 보기 위해 context를 새로 조회하세요.',
              en: 'Refresh context to see current state.',
            },
            command: 'npx lee-spec-kit context',
        },
        {
            title: {
              ko: 'Feature 문서를 열어 누락된 체크 항목을 완료하세요.',
              en: 'Open feature docs and complete the missing checklist item.',
            },
        },
        {
            title: {
              ko: '실행 가능한 옵션이 있는 Feature를 찾기 위해 전체를 조회하세요.',
              en: 'List all features to find one with actionable options.',
            },
            command: 'npx lee-spec-kit context --all',
        },
      ],
        resolvedLang
      );
    case 'CONTEXT_STALE':
    case 'ACTION_NOT_AVAILABLE':
      return withLabels(
        [
        {
            title: {
              ko: '승인 전에 최신 context를 다시 조회하세요.',
              en: 'Get fresh context before approving.',
            },
            command: 'npx lee-spec-kit context',
        },
        {
            title: {
              ko: '최신 출력의 라벨로 다시 승인하세요.',
              en: 'Approve again using a label from the latest output.',
            },
            command: 'npx lee-spec-kit context --approve A',
        },
        {
            title: {
              ko: '최신 라벨 재승인 후에만 실행하세요.',
              en: 'Execute only after re-approval of the fresh label.',
            },
            command: 'npx lee-spec-kit context --approve A --execute',
        },
      ],
        resolvedLang
      );
    case 'EXECUTION_FAILED':
    case 'EXECUTION_NOT_COMMAND':
      return withLabels(
        [
        {
            title: {
              ko:
                code === 'EXECUTION_NOT_COMMAND'
                  ? '승인 라벨이 command인지 먼저 확인하세요.'
                  : '실패한 명령의 출력과 선행 조건을 확인하세요.',
              en:
                code === 'EXECUTION_NOT_COMMAND'
                  ? 'Check whether the approved label points to a command action.'
                  : 'Review the failed command output and fix prerequisites.',
            },
        },
        {
            title: {
              ko: 'context를 다시 조회하고 최신 라벨 1개를 실행하세요.',
              en: 'Re-run context and execute one fresh label.',
            },
            command: 'npx lee-spec-kit context --approve A --execute',
        },
        {
            title: {
              ko: '환경 문제 분리를 위해 명령을 수동 실행해보세요.',
              en: 'Run the command manually to isolate environment issues.',
            },
        },
      ],
        resolvedLang
      );
    case 'UNKNOWN_ERROR':
    default:
      return withLabels(
        [
        {
            title: {
              ko: '같은 입력으로 재실행하고 전체 오류 로그를 수집하세요.',
              en: 'Re-run with the same input and capture full error logs.',
            },
        },
        {
            title: {
              ko: '워크스페이스 상태를 진단하세요.',
              en: 'Run diagnostics for workspace state.',
            },
            command: 'npx lee-spec-kit doctor --json',
        },
        {
            title: {
              ko: 'reasonCode와 로그를 유지보수자에게 전달하세요.',
              en: 'Report the reasonCode and logs to maintainers.',
            },
        },
      ],
        resolvedLang
      );
  }
}

export function printCliErrorSuggestions(
  suggestions: CliSuggestion[],
  lang: Lang = DEFAULT_LANG
): void {
  if (suggestions.length === 0) return;
  const resolvedLang = normalizeLang(lang);
  const header =
    resolvedLang === 'ko' ? '👉 다음 옵션 (오류):' : '👉 Next Options (Error):';
  console.error(header);
  for (const suggestion of suggestions) {
    if (suggestion.command) {
      console.error(
        `   ${suggestion.label}. ${suggestion.title} (${suggestion.command})`
      );
      continue;
    }
    console.error(`   ${suggestion.label}. ${suggestion.title}`);
  }
}

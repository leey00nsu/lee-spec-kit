/**
 * 입력 검증 및 보안 유틸리티
 */
import { createCliError } from './cli-error.js';
import { DEFAULT_LANG, Lang, tr } from './i18n.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// 허용된 프로젝트 타입
const VALID_PROJECT_TYPES = ['single', 'multi', 'fullstack'] as const;
export type ProjectType = (typeof VALID_PROJECT_TYPES)[number];

// 허용된 언어
const VALID_LANGUAGES = ['ko', 'en'] as const;
export type Language = (typeof VALID_LANGUAGES)[number];

// 허용된 워크플로우 모드
const VALID_WORKFLOW_MODES = ['github', 'local'] as const;
export type WorkflowMode = (typeof VALID_WORKFLOW_MODES)[number];

/**
 * 안전한 이름 검증 (Path Traversal 방지)
 * 허용: 영문, 숫자, 하이픈, 언더스코어
 */
export function validateSafeName(name: string): ValidationResult {
  return validateSafeNameWithLang(name, DEFAULT_LANG);
}

export function validateSafeNameWithLang(name: string, lang: Lang): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: tr(lang, 'cli', 'validation.nameEmpty') };
  }

  if (name.length > 100) {
    return { valid: false, error: tr(lang, 'cli', 'validation.nameTooLong') };
  }

  // Path Traversal 공격 패턴 차단
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return {
      valid: false,
      error: tr(lang, 'cli', 'validation.nameTraversal'),
    };
  }

  // null bytes 차단
  if (name.includes('\0')) {
    return { valid: false, error: tr(lang, 'cli', 'validation.nameNullByte') };
  }

  // 허용된 문자만 사용 (영문, 숫자, 하이픈, 언더스코어, 한글)
  const safePattern = /^[\w가-힣-]+$/;
  if (!safePattern.test(name)) {
    return {
      valid: false,
      error: tr(lang, 'cli', 'validation.nameInvalidChars'),
    };
  }

  // 예약어 차단
  const reservedNames = [
    '.',
    '..',
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'com2',
    'com3',
    'com4',
    'lpt1',
    'lpt2',
    'lpt3',
    'lpt4',
  ];
  if (reservedNames.includes(name.toLowerCase())) {
    return { valid: false, error: tr(lang, 'cli', 'validation.nameReserved') };
  }

  return { valid: true };
}

/**
 * 프로젝트 타입 검증
 */
export function validateProjectType(type: string): ValidationResult {
  return validateProjectTypeWithLang(type, DEFAULT_LANG);
}

export function validateProjectTypeWithLang(type: string, lang: Lang): ValidationResult {
  if (!VALID_PROJECT_TYPES.includes(type as ProjectType)) {
    return {
      valid: false,
      error: tr(lang, 'cli', 'validation.projectTypeInvalid', {
        values: VALID_PROJECT_TYPES.join(', '),
      }),
    };
  }
  return { valid: true };
}

/**
 * 언어 검증
 */
export function validateLanguage(lang: string): ValidationResult {
  return validateLanguageWithLang(lang, DEFAULT_LANG);
}

export function validateLanguageWithLang(value: string, lang: Lang): ValidationResult {
  if (!VALID_LANGUAGES.includes(value as Language)) {
    return {
      valid: false,
      error: tr(lang, 'cli', 'validation.languageInvalid', {
        values: VALID_LANGUAGES.join(', '),
      }),
    };
  }
  return { valid: true };
}

/**
 * 워크플로우 모드 검증
 */
export function validateWorkflowMode(mode: string): ValidationResult {
  return validateWorkflowModeWithLang(mode, DEFAULT_LANG);
}

export function validateWorkflowModeWithLang(
  mode: string,
  lang: Lang
): ValidationResult {
  if (!VALID_WORKFLOW_MODES.includes(mode as WorkflowMode)) {
    return {
      valid: false,
      error: tr(lang, 'cli', 'validation.workflowModeInvalid', {
        values: VALID_WORKFLOW_MODES.join(', '),
      }),
    };
  }
  return { valid: true };
}

/**
 * Feature ID 검증 (F001, F002 형식)
 */
export function validateFeatureId(id: string): ValidationResult {
  return validateFeatureIdWithLang(id, DEFAULT_LANG);
}

export function validateFeatureIdWithLang(id: string, lang: Lang): ValidationResult {
  if (!id || id.trim().length === 0) {
    return { valid: false, error: tr(lang, 'cli', 'validation.featureIdEmpty') };
  }

  const featureIdPattern = /^F\d{3,}$/;
  if (!featureIdPattern.test(id)) {
    return {
      valid: false,
      error: tr(lang, 'cli', 'validation.featureIdFormat'),
    };
  }

  return { valid: true };
}

/**
 * Idea ID 검증 (I001, I002 형식)
 */
export function validateIdeaId(id: string): ValidationResult {
  return validateIdeaIdWithLang(id, DEFAULT_LANG);
}

export function validateIdeaIdWithLang(id: string, lang: Lang): ValidationResult {
  if (!id || id.trim().length === 0) {
    return { valid: false, error: tr(lang, 'cli', 'validation.ideaIdEmpty') };
  }

  const ideaIdPattern = /^I\d{3,}$/;
  if (!ideaIdPattern.test(id)) {
    return {
      valid: false,
      error: tr(lang, 'cli', 'validation.ideaIdFormat'),
    };
  }

  return { valid: true };
}

/**
 * 경로 검증 및 정규화
 */
export function validatePath(inputPath: string): ValidationResult {
  return validatePathWithLang(inputPath, DEFAULT_LANG);
}

export function validatePathWithLang(inputPath: string, lang: Lang): ValidationResult {
  if (!inputPath || inputPath.trim().length === 0) {
    return { valid: false, error: tr(lang, 'cli', 'validation.pathEmpty') };
  }

  // null bytes 차단
  if (inputPath.includes('\0')) {
    return { valid: false, error: tr(lang, 'cli', 'validation.pathNullByte') };
  }

  return { valid: true };
}

/**
 * 검증 실패 시 에러 출력 헬퍼
 */
export function assertValid(
  result: ValidationResult,
  context?: string,
  lang: Lang = DEFAULT_LANG
): void {
  if (!result.valid) {
    const message = context
      ? `${context}: ${result.error}`
      : (result.error ?? tr(lang, 'cli', 'validation.genericFailed'));
    throw createCliError('INVALID_ARGUMENT', message);
  }
}

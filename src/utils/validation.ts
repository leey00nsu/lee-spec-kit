/**
 * 입력 검증 및 보안 유틸리티
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// 허용된 프로젝트 타입
const VALID_PROJECT_TYPES = ['single', 'fullstack'] as const;
export type ProjectType = (typeof VALID_PROJECT_TYPES)[number];

// 허용된 언어
const VALID_LANGUAGES = ['ko', 'en'] as const;
export type Language = (typeof VALID_LANGUAGES)[number];

// 허용된 레포지토리 타입
const VALID_REPO_TYPES = ['be', 'fe'] as const;
export type RepoType = (typeof VALID_REPO_TYPES)[number];

/**
 * 안전한 이름 검증 (Path Traversal 방지)
 * 허용: 영문, 숫자, 하이픈, 언더스코어
 */
export function validateSafeName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: '이름은 비어있을 수 없습니다.' };
  }

  if (name.length > 100) {
    return { valid: false, error: '이름은 100자를 초과할 수 없습니다.' };
  }

  // Path Traversal 공격 패턴 차단
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return {
      valid: false,
      error: "이름에 '..' 또는 경로 구분자를 사용할 수 없습니다.",
    };
  }

  // null bytes 차단
  if (name.includes('\0')) {
    return { valid: false, error: '이름에 null 문자를 사용할 수 없습니다.' };
  }

  // 허용된 문자만 사용 (영문, 숫자, 하이픈, 언더스코어, 한글)
  const safePattern = /^[\w가-힣\-]+$/;
  if (!safePattern.test(name)) {
    return {
      valid: false,
      error:
        '이름에는 영문, 숫자, 하이픈, 언더스코어, 한글만 사용할 수 있습니다.',
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
    return { valid: false, error: '예약된 이름은 사용할 수 없습니다.' };
  }

  return { valid: true };
}

/**
 * 프로젝트 타입 검증
 */
export function validateProjectType(type: string): ValidationResult {
  if (!VALID_PROJECT_TYPES.includes(type as ProjectType)) {
    return {
      valid: false,
      error: `프로젝트 타입은 ${VALID_PROJECT_TYPES.join(', ')} 중 하나여야 합니다.`,
    };
  }
  return { valid: true };
}

/**
 * 언어 검증
 */
export function validateLanguage(lang: string): ValidationResult {
  if (!VALID_LANGUAGES.includes(lang as Language)) {
    return {
      valid: false,
      error: `언어는 ${VALID_LANGUAGES.join(', ')} 중 하나여야 합니다.`,
    };
  }
  return { valid: true };
}

/**
 * 레포지토리 타입 검증
 */
export function validateRepoType(repo: string): ValidationResult {
  if (!VALID_REPO_TYPES.includes(repo as RepoType)) {
    return {
      valid: false,
      error: `레포지토리 타입은 ${VALID_REPO_TYPES.join(', ')} 중 하나여야 합니다.`,
    };
  }
  return { valid: true };
}

/**
 * Feature ID 검증 (F001, F002 형식)
 */
export function validateFeatureId(id: string): ValidationResult {
  if (!id || id.trim().length === 0) {
    return { valid: false, error: 'Feature ID는 비어있을 수 없습니다.' };
  }

  const featureIdPattern = /^F\d{3,}$/;
  if (!featureIdPattern.test(id)) {
    return {
      valid: false,
      error: "Feature ID는 'F' + 숫자 형식이어야 합니다 (예: F001).",
    };
  }

  return { valid: true };
}

/**
 * 경로 검증 및 정규화
 */
export function validatePath(inputPath: string): ValidationResult {
  if (!inputPath || inputPath.trim().length === 0) {
    return { valid: false, error: '경로는 비어있을 수 없습니다.' };
  }

  // null bytes 차단
  if (inputPath.includes('\0')) {
    return { valid: false, error: '경로에 null 문자를 사용할 수 없습니다.' };
  }

  return { valid: true };
}

/**
 * 검증 실패 시 에러 출력 헬퍼
 */
export function assertValid(result: ValidationResult, context?: string): void {
  if (!result.valid) {
    const message = context
      ? `${context}: ${result.error}`
      : (result.error ?? '검증 실패');
    throw new Error(message);
  }
}

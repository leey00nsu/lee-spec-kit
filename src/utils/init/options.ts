import { createCliError } from '../cli-error.js';
import { assertValidComponentId } from '../components.js';
import { Lang, tr } from '../i18n.js';

export function parseStandaloneMultiProjectRootJson(
  raw: string
): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--project-root` for standalone multi must be a JSON object. Example: {"app":"/path/app","api":"/path/api"}'
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--project-root` for standalone multi must be a JSON object.'
    );
  }

  const out: Record<string, string> = {};
  for (const [component, value] of Object.entries(parsed as Record<string, unknown>)) {
    const normalizedComponent = component.trim().toLowerCase();
    const normalizedRoot = String(value || '').trim();
    if (!normalizedComponent || !normalizedRoot) continue;
    assertValidComponentId(normalizedComponent);
    out[normalizedComponent] = normalizedRoot;
  }

  return out;
}

export function parseComponentProjectRootsOption(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw createCliError(
      'INVALID_ARGUMENT',
      '`--component-project-roots` requires at least one `component=/path` pair.'
    );
  }

  for (const entry of entries) {
    const eqIndex = entry.indexOf('=');
    if (eqIndex <= 0 || eqIndex === entry.length - 1) {
      throw createCliError(
        'INVALID_ARGUMENT',
        `Invalid component project root entry: ${entry}. Use \`component=/absolute/or/relative/path\`.`
      );
    }
    const component = entry.slice(0, eqIndex).trim().toLowerCase();
    const root = entry.slice(eqIndex + 1).trim();
    if (!component || !root) {
      throw createCliError(
        'INVALID_ARGUMENT',
        `Invalid component project root entry: ${entry}.`
      );
    }
    assertValidComponentId(component);
    out[component] = root;
  }

  return out;
}

export function getComponentFeaturesReadme(lang: Lang, component: string): string {
  if (lang === 'ko') {
    return `# ${component} Feature 목록

이 폴더는 \`${component}\` 컴포넌트의 Feature 문서를 보관합니다.

- 새 Feature 생성: \`npx lee-spec-kit feature <name> --component ${component}\`
- 상태 점검: \`npx lee-spec-kit status\`
- 컨텍스트 확인: \`npx lee-spec-kit context --component ${component}\`
`;
  }

  return `# ${component} Features

This directory stores feature documents for the \`${component}\` component.

- Create a new feature: \`npx lee-spec-kit feature <name> --component ${component}\`
- Check status: \`npx lee-spec-kit status\`
- Show context: \`npx lee-spec-kit context --component ${component}\`
`;
}

export function validatePromptPathValue(
  value: string,
  lang: Lang
): true | string {
  return value.trim() ? true : tr(lang, 'cli', 'init.validation.enterPath');
}

export function validatePromptUrlValue(
  value: string,
  lang: Lang
): true | string {
  return value.trim() ? true : tr(lang, 'cli', 'init.validation.enterUrl');
}

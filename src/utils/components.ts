import { createCliError } from './cli-error.js';

export const DEFAULT_MULTI_COMPONENTS = ['app'] as const;

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function parseComponentsOption(raw?: string): string[] {
  if (!raw) return [];
  return unique(
    raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function normalizeComponentList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const normalized = input
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);

  return unique(normalized);
}

export function isValidComponentId(value: string): boolean {
  return /^[a-z][a-z0-9-]{0,39}$/.test(value);
}

export function assertValidComponentId(value: string): void {
  if (!isValidComponentId(value)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Invalid component "${value}". Use lowercase letters, numbers, and hyphens (max 40 chars).`
    );
  }
}

export function resolveProjectComponents(
  projectType: 'single' | 'multi',
  configured: unknown
): string[] {
  if (projectType === 'single') return [];

  const normalized = normalizeComponentList(configured);
  if (normalized.length > 0) return normalized;
  return [...DEFAULT_MULTI_COMPONENTS];
}

export function assertAllowedComponent(
  component: string,
  allowed: string[]
): void {
  if (!allowed.includes(component)) {
    throw createCliError(
      'INVALID_ARGUMENT',
      `Unknown component "${component}". Allowed: ${allowed.join(', ')}`
    );
  }
}

export function resolveComponentOption(
  value: string | undefined
): string | undefined {
  const component = (value || '').trim().toLowerCase();
  return component || undefined;
}

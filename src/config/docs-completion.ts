import type { ProjectConfig } from './types.js';
import { createCliError } from '../utils/cli-error.js';

export type EffectiveDocsCompletionStrategy =
  | 'local-ff'
  | 'local-squash'
  | 'none';

export function resolveDocsCompletionStrategy(
  config: ProjectConfig
): EffectiveDocsCompletionStrategy {
  const override = config.workflow?.docsCompletionStrategy ?? 'inherit';
  if (override !== 'inherit') return override;
  const mode =
    config.workflow?.mode ??
    (config.workflow?.preset === 'local' ? 'local' : 'github');
  // GitHub integrates code remotely; retain its existing docs ff behavior.
  if (mode === 'github') return 'local-ff';
  const code = config.workflow?.completionStrategy;
  return code === 'local-ff' || code === 'local-squash' ? code : 'none';
}

export function assertValidDocsCompletionConfig(config: ProjectConfig): void {
  const strategy = config.workflow?.docsCompletionStrategy;
  if (strategy === undefined || strategy === 'inherit') return;
  if (strategy !== 'local-ff' && strategy !== 'local-squash') {
    throw createCliError(
      'INVALID_CONFIG',
      '`workflow.docsCompletionStrategy` must be inherit, local-ff, or local-squash. Missing values mean inherit.'
    );
  }
  if (config.docsRepo !== 'standalone') {
    throw createCliError(
      'INVALID_CONFIG',
      'A docs completion override requires docsRepo=standalone; embedded docs use the code integration.'
    );
  }
  const mode =
    config.workflow?.mode ??
    (config.workflow?.preset === 'local' ? 'local' : 'github');
  if (mode === 'github' && strategy === 'local-squash') {
    throw createCliError(
      'INVALID_CONFIG',
      'GitHub docs integration supports inherit or local-ff; local-squash requires workflow.mode=local and verified local code integration.'
    );
  }
  if (
    mode === 'local' &&
    !['local-ff', 'local-squash'].includes(
      config.workflow?.completionStrategy ?? 'none'
    )
  ) {
    throw createCliError(
      'INVALID_CONFIG',
      'An explicit docs completion override requires code completionStrategy=local-ff or local-squash; code strategy none disables managed integration.'
    );
  }
}

export const AGENT_AUTOMATION_OPT_IN_INIT_DATE = '2026-08-27';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function matchesGeneratedAgentRuntime(
  value: unknown,
  options: { enabled?: boolean } = {}
): boolean {
  if (!isPlainRecord(value)) return false;
  const expectedKeys = [
    ...(typeof options.enabled === 'boolean' ? ['enabled'] : []),
    'model',
    'onUnavailable',
    'reasoningEffort',
    'type',
  ].sort();
  if (
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)
  ) {
    return false;
  }
  return (
    (typeof options.enabled !== 'boolean' ||
      value.enabled === options.enabled) &&
    value.type === 'subagent' &&
    value.model === 'inherit' &&
    value.reasoningEffort === 'high' &&
    value.onUnavailable === 'inherit'
  );
}

function matchesGeneratedReviewPhase(
  value: unknown,
  enabled: boolean
): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify(['enabled', 'evidenceMode', 'reviewer'])
  ) {
    return false;
  }
  return (
    value.enabled === enabled &&
    value.evidenceMode === 'path_required' &&
    matchesGeneratedAgentRuntime(value.reviewer)
  );
}

export interface LegacyBackfilledAgentAutomation {
  taskExecution: boolean;
  planReview: boolean;
}

export function resolveLegacyBackfilledAgentAutomation(config: {
  createdAt?: unknown;
  workflow?: unknown;
}): LegacyBackfilledAgentAutomation {
  const none = { taskExecution: false, planReview: false };
  if (!isPlainRecord(config.workflow)) return none;
  const workflow = config.workflow;
  if (workflow.agentAutomationConfigured === true) return none;
  const createdAt =
    typeof config.createdAt === 'string' ? config.createdAt.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(createdAt)) return none;
  if (createdAt >= AGENT_AUTOMATION_OPT_IN_INIT_DATE) return none;

  const taskExecution = isPlainRecord(workflow.agentExecution)
    ? workflow.agentExecution.task
    : null;
  const planReview = isPlainRecord(workflow.agentReview)
    ? workflow.agentReview.plan
    : null;
  return {
    taskExecution: matchesGeneratedAgentRuntime(taskExecution, {
      enabled: true,
    }),
    planReview: matchesGeneratedReviewPhase(planReview, true),
  };
}

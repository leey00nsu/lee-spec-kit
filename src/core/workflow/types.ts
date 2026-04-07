export type AutoRunReasonCode =
  | 'AVAILABLE'
  | 'MANUAL_BOUNDARY'
  | 'NOT_SINGLE_MATCHED'
  | 'NO_ACTION_OPTIONS'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_MODE_NOT_CATEGORY'
  | 'DEFAULT_NOT_SKIP'
  | 'NO_REQUIRE_CHECK_CATEGORIES';

export interface AutoRunManualBoundary {
  label: string;
  category?: string;
  detail: string;
}

export interface AutoRunPlan {
  available: boolean;
  policyEligible: boolean;
  executableNow: boolean;
  reasonCode: AutoRunReasonCode;
  summary: string;
  command: string;
  untilCategories: string[];
  unknownCategories: string[];
  manualBoundary: AutoRunManualBoundary | null;
}

export interface HandoffVerifyPolicy {
  runOncePerSession: true;
  cacheKey: string;
  expectedCwd: string;
  commands: string[];
  onMismatch: 'stop_and_report';
  collectDetailedLogsOnMismatchOnly: true;
}

export interface SubAgentHandoffPolicy {
  required: boolean;
  mode: 'command' | 'auto_run' | null;
  featureRef: string | null;
  category: string | null;
  cwd: string | null;
  cmd: string | null;
  verify: HandoffVerifyPolicy | null;
}

export interface AgentOrchestrationPolicy {
  mode: 'main_orchestrates_subagent_execution';
  mainAgentResponsibilities: string[];
  subAgentResponsibilities: string[];
  pauseAndReportWhen: string[];
  resumePriority?: string[];
  subAgentHandoff: SubAgentHandoffPolicy;
}

export interface ActionExecutionMetadata {
  handoffOnly: boolean;
  advancesWorkflow: boolean;
  nextMainState?: string;
}

export interface DelegatedActionContract {
  required: boolean;
  mode: 'command';
  category: string;
  currentSubstateId: string;
  delegatedWorkRequired: boolean;
  handoffOnly: boolean;
  advancesWorkflow: boolean;
  doNotReapproveSameLabel: boolean;
  nextMainState: string;
  reuseKey: string;
  guidance: string;
  evidenceFile?: string;
  nextStepRequirement?: string;
  recordCommands?: {
    changesRequested: string;
    approve: string;
  };
}

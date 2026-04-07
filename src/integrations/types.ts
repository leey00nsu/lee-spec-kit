export interface AgentIntegrationDescriptor {
  id: string;
  kind: 'bootstrap' | 'helper';
  summary: string;
  optional: true;
}

export type Agent = string;

export interface AgentDetectOptions {
  includeVersion?: boolean;
  refresh?: boolean;
  versionTimeoutMs?: number;
}

export interface CodexCumulativeUsage {
  input: number;
  output: number;
  cached: number;
}

export interface CodexTurnControl {
  threadId: string;
  turnId: string;
  steer: (prompt: string, attachments?: string[]) => Promise<boolean>;
}

export interface AgentInteractionOption {
  label: string;
  description?: string | null;
  value: string;
}

export interface AgentInteractionQuestion {
  id: string;
  header: string;
  prompt: string;
  options?: AgentInteractionOption[] | null;
  allowFreeform?: boolean;
  secret?: boolean;
  allowEmpty?: boolean;
}

export interface AgentInteraction {
  kind: 'user-input' | 'permission' | 'confirmation';
  id: string;
  title: string;
  hint?: string | null;
  questions: AgentInteractionQuestion[];
  resolveWith: (answers: Record<string, string[]>) => Record<string, any> | null;
}

export interface StreamToolCall {
  id: string;
  name: string;
  summary: string;
  input?: string | null;
  result?: string | null;
  status: 'running' | 'done' | 'failed';
}

export interface StreamPreviewMeta {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  contextUsedTokens?: number | null;
  contextPercent: number | null;
  turnOutputTokens?: number | null;
  subAgents?: StreamSubAgent[];
  toolCalls?: StreamToolCall[];
  providerName?: string | null;
  profileName?: string | null;
  generatingImages?: number;
}

export interface StreamPreviewPlanStep {
  step: string;
  status: 'pending' | 'inProgress' | 'completed';
}

export interface StreamPreviewPlan {
  explanation: string | null;
  steps: StreamPreviewPlanStep[];
}

export interface StreamSubAgent {
  id: string;
  kind: string | null;
  description: string | null;
  model: string | null;
  tools: Array<{ id: string; name: string; summary: string }>;
  status: 'running' | 'done' | 'failed';
}

export interface StreamOpts {
  agent: Agent;
  prompt: string;
  workdir: string;
  timeout: number;
  sessionId: string | null;
  model: string | null;
  profileId?: string | null;
  accountId?: string | null;
  thinkingEffort: string;
  onText: (
    text: string,
    thinking: string,
    activity?: string,
    meta?: StreamPreviewMeta,
    plan?: StreamPreviewPlan | null,
  ) => void;
  onSessionId?: (sessionId: string) => void;
  attachments?: string[];
  codexModel?: string;
  codexFullAccess?: boolean;
  codexDeveloperInstructions?: string;
  codexExtraArgs?: string[];
  codexPrevCumulative?: CodexCumulativeUsage;
  claudeModel?: string;
  claudePermissionMode?: string;
  claudeAppendSystemPrompt?: string;
  claudeExtraArgs?: string[];
  claudeWorkflowEnabled?: boolean;
  claudeAccessMode?: 'subscription' | 'api';

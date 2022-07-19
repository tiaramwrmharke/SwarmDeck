export const PROTOCOL_VERSION = 1 as const;

export type SessionPhase = 'idle' | 'queued' | 'streaming' | 'done';

export interface UniversalPlanStep {
  text: string;
  status: 'pending' | 'inProgress' | 'completed';
}

export interface UniversalPlan {
  explanation: string | null;
  steps: UniversalPlanStep[];
}

export interface UniversalToolCall {
  id: string;
  name: string;
  summary: string;
  input?: string | null;
  result?: string | null;
  status: 'running' | 'done' | 'failed';
}

export interface UniversalSubAgent {
  id: string;
  kind: string | null;
  description: string | null;
  model: string | null;
  tools: Array<{ id: string; name: string; summary: string }>;
  status: 'running' | 'done' | 'failed';
}

export interface UniversalUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  contextUsedTokens?: number | null;
  contextPercent: number | null;
  turnOutputTokens?: number | null;
  providerName?: string | null;
  generatingImages?: number;
}

export interface UniversalQueuedTask {
  taskId: string;
  prompt: string;
}

export interface UniversalArtifact {
  url: string;
  fileName: string;
  fileSize: number;
  mime: string;
  kind: 'photo' | 'document';
  caption?: string;
}

export interface UniversalInteraction {
  promptId: string;
  kind: 'user-input' | 'permission' | 'confirmation';
  title: string;

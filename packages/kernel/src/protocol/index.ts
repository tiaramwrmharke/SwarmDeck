// The wire vocabulary shared by the kernel runtime and every transport/terminal.
// This is the SSOT shape: a driver-agnostic, accumulating snapshot of one session,
// plus a small set of control verbs. Ported from swarmdeck's pikichannel protocol.

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
  /** The task prompt the sub-agent was launched with (truncated), known at spawn. */
  prompt?: string;
  /** Final report (truncated): a sync sub's tool_result text, or an async sub's
   *  task-notification `<result>` payload. */
  report?: string;
  /** Wall-clock duration. Sync subs: the CLI sidecar's totalDurationMs; async subs:
   *  first→last record timestamps of the sub's own transcript. */
  durationMs?: number;
  /** Total tokens. Sync subs: the CLI sidecar's totalTokens; async subs: Σ output
   *  tokens + peak context occupancy read from the sub's own transcript. */
  totalTokens?: number;
}

export interface UniversalUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  contextUsedTokens?: number | null;

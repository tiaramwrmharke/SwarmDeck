import type { Agent, HandoverRef, TailMessage } from './types.js';
import { getSessionMessages } from './session.js';
import { claudeContextWindowFromModel } from './drivers/claude.js';

const DEFAULT_AGENT_WINDOW_TOKENS: Record<string, number> = {
  claude: 200_000,
  codex: 256_000,
  gemini: 1_000_000,
  hermes: 128_000,
};

// Claude windows come from the driver's per-model table, never a second regex here: the
// generations differ (haiku 200k, opus/sonnet/fable 1M), so a local copy silently rots the
// moment a model lands — which is how every Claude model once fell through to the 200k default.
function agentWindowTokens(agent: string, model?: string | null): number {
  const m = (model || '').toLowerCase();
  if (agent === 'gemini' && /(^|-)(2\.5|3|3\.1)/.test(m)) return 1_000_000;
  if (agent === 'claude') return claudeContextWindowFromModel(m) ?? DEFAULT_AGENT_WINDOW_TOKENS.claude;
  return DEFAULT_AGENT_WINDOW_TOKENS[agent] ?? 128_000;
}

const HANDOVER_WINDOW_FRACTION = 0.5;

const CHARS_PER_TOKEN = 4;

export type HandoverMode = 'verbatim' | 'tail' | 'empty';

export interface CompactForHandoverOpts {
  fromAgent: Agent;
  fromSessionId: string;
  workdir: string;
  toAgent: Agent;
  toModel?: string | null;
}

export interface HandoverResult {
  ok: boolean;
  seed: string;
  mode: HandoverMode;
  messagesIncluded: number;
  messagesTotal: number;
  turnsTotal: number;
  charsIncluded: number;
  budgetChars: number;

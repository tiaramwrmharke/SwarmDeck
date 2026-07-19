import type { Agent } from '../../agent/index.js';
import { normalizeClaudeModelId } from '../../agent/index.js';
import type { UserConfig } from './user-config.js';

/** Account-scoped GPT-5.6 variants the Codex model catalog currently advertises. */
export const CODEX_56_MODEL_IDS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
] as const;

export const DEFAULT_AGENT_MODELS: Record<Agent, string> = {
  claude: 'claude-opus-5',
  codex: CODEX_56_MODEL_IDS[0],
  gemini: 'gemini-3.1-pro-preview',
  hermes: 'anthropic/claude-sonnet-4',
};

export const DEFAULT_AGENT_EFFORTS: Partial<Record<Agent, string>> = {
  claude: 'high',
  codex: 'xhigh',
  gemini: 'high',
  hermes: 'medium',
};

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBoolish(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes' || v === 'enabled') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no' || v === 'disabled') return false;
  return null;
}

export function agentModelEnv(agent: Agent, env: Record<string, string | undefined> = process.env): string {
  switch (agent) {
    case 'claude': return trimmed(env.CLAUDE_MODEL);
    case 'codex': return trimmed(env.CODEX_MODEL);
    case 'gemini': return trimmed(env.GEMINI_MODEL);
    case 'hermes': return trimmed(env.HERMES_MODEL);
  }
  return '';
}

export function agentEffortEnv(agent: Agent, env: Record<string, string | undefined> = process.env): string {
  switch (agent) {
    case 'claude': return trimmed(env.CLAUDE_REASONING_EFFORT).toLowerCase();
    case 'codex': return trimmed(env.CODEX_REASONING_EFFORT).toLowerCase();
    case 'gemini': return trimmed(env.GEMINI_REASONING_EFFORT).toLowerCase();
    case 'hermes': return trimmed(env.HERMES_REASONING_EFFORT).toLowerCase();
  }
  return '';
}

export function resolveAgentModel(config: Partial<UserConfig> | Record<string, any>, agent: Agent): string {
  let value = '';
  switch (agent) {
    case 'claude':
      value = trimmed((config as Partial<UserConfig>).claudeModel || agentModelEnv('claude') || DEFAULT_AGENT_MODELS.claude);
      return normalizeClaudeModelId(value);

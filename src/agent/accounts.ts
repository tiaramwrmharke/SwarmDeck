// Multi-account store (app layer): local subscription accounts for an agent, switched by
// injecting a long-lived auth token at spawn. Each account = a user-named token (minted via
// `claude setup-token`), stored in the credential vault (not plaintext). The agent keeps
// using its normal single config home; only CLAUDE_CODE_OAUTH_TOKEN changes.
//
// claude only for now — codex has no token-based switch (see kernel accounts.ts).

import { randomUUID } from 'node:crypto';
import { loadUserConfig, saveUserConfig } from '../core/config/user-config.js';
import { persistSecret, forgetSecret, resolveCredential, isCredentialRef, type CredentialRef } from '../core/secrets/index.js';
import { loadKernel } from './kernel-bridge.js';
import { claudeUsageForToken, claudeNativeUsage } from './drivers/claude.js';
import type { UsageResult } from './types.js';
import { agentWarn } from './utils.js';

export interface AgentAccountRecord {
  id: string;
  label: string;
  credential: CredentialRef;
  createdAt: string;
  lastUsedAt?: string | null;
}

interface AccountsLayer {
  byAgent?: Record<string, AgentAccountRecord[]>;
  activeByAgent?: Record<string, string | null>;
}

// Agents whose local accounts are switched by a token (kept in sync with the kernel).
const ACCOUNT_AGENTS = new Set(['claude']);
export const MAX_ACCOUNTS_PER_AGENT = 5;
const TOKEN_RE = /^sk-ant-oat/;

export function accountAgentSupported(agent: string): boolean {
  return ACCOUNT_AGENTS.has(agent);
}

function getLayer(): AccountsLayer {
  return (loadUserConfig().accounts as AccountsLayer) || {};
}
function writeLayer(layer: AccountsLayer): void {
  saveUserConfig({ ...loadUserConfig(), accounts: layer });
}

// Only records that carry a resolvable credential are real accounts; this also drops stale
// records from the earlier config-directory implementation (which had no credential).
function validRecords(agent: string): AgentAccountRecord[] {
  return (getLayer().byAgent?.[agent] || []).filter(r => r && isCredentialRef((r as any).credential));
}

export function listAccounts(agent: string): AgentAccountRecord[] {
  return validRecords(agent).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function getAccount(agent: string, id: string): AgentAccountRecord | null {
  return validRecords(agent).find(a => a.id === id) || null;
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AgentInfo } from './index.js';
import { getAgentLabel, getAgentPackage, getAgentBrewCask } from './npm.js';
import type { UserConfig } from '../core/config/user-config.js';
import { AGENT_UPDATE_TIMEOUTS, STATE_DIR_NAME } from '../core/constants.js';

const AGENT_UPDATE_LOCK_STALE_MS = AGENT_UPDATE_TIMEOUTS.lockStale;
const AGENT_UPDATE_COMMAND_TIMEOUT_MS = AGENT_UPDATE_TIMEOUTS.commandTimeout;

type AgentUpdateStrategy =
  | { kind: 'npm'; pkg: string }
  | { kind: 'brew'; cask: string }
  | { kind: 'skip'; reason: string };

export interface AgentUpdateState {
  latestVersion: string | null;
  currentVersion: string | null;
  updateAvailable: boolean;
  status: string;
  detail: string | null;
  checkedAt: number | null;
}

const updateStates = new Map<string, AgentUpdateState>();

function emptyState(): AgentUpdateState {
  return { latestVersion: null, currentVersion: null, updateAvailable: false, status: 'idle', detail: null, checkedAt: null };
}

function setUpdateState(agent: string, patch: Partial<AgentUpdateState>) {
  const current = updateStates.get(agent) || emptyState();
  updateStates.set(agent, { ...current, ...patch });
}

export function getAgentUpdateState(agent: string): AgentUpdateState | null {
  return updateStates.get(agent) || null;
}

export function getAllAgentUpdateStates(): Record<string, AgentUpdateState> {
  const result: Record<string, AgentUpdateState> = {};
  for (const [key, value] of updateStates) result[key] = value;
  return result;
}

export function agentUpdateMarkerPath(agent: string): string {
  return path.join(os.homedir(), STATE_DIR_NAME, `agent-update-${agent}.installing`);
}

function agentReinstallInFlight(agent: string): boolean {
  const marker = agentUpdateMarkerPath(agent);
  let raw: string;
  try {
    raw = fs.readFileSync(marker, 'utf8');
  } catch {
    return false;
  }
  const pid = Number.parseInt(raw.trim(), 10);
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      try { fs.rmSync(marker, { force: true }); } catch {}
      return false;
    }
  }
  try {
    return Date.now() - fs.statSync(marker).mtimeMs <= AGENT_UPDATE_COMMAND_TIMEOUT_MS;
  } catch {
    return false;
  }
}

export async function withAgentUpdateGate<T>(agent: string, install: () => Promise<T>): Promise<T> {
  const id = String(agent || '').trim();
  if (!id) return install();
  const marker = agentUpdateMarkerPath(id);
  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, `${process.pid}\n`);
  } catch {}
  try {
    return await install();
  } finally {
    try { fs.rmSync(marker, { force: true }); } catch {}
  }
}

export async function awaitAgentUpdateIdle(agent: string, timeoutMs: number): Promise<void> {
  const id = String(agent || '').trim();
  if (!id) return;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (agentReinstallInFlight(id)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(AGENT_UPDATE_TIMEOUTS.spawnWaitPoll, remaining)));
  }
}

function updaterLockPath(): string {
  return path.join(os.homedir(), STATE_DIR_NAME, 'agent-auto-update.lock');
}

function normalizeBooleanEnv(value: string | undefined): boolean | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^(1|true|yes|on)$/i.test(text)) return true;
  if (/^(0|false|no|off)$/i.test(text)) return false;

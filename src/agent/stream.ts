import { execSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restartManagedBrowser } from '../browser-supervisor.js';
import { terminateProcessTree } from '../core/process-control.js';
import { AGENT_DETECT_TIMEOUTS, AGENT_STREAM_HARD_KILL_GRACE_MS, AGENT_UPDATE_TIMEOUTS } from '../core/constants.js';
import { awaitAgentUpdateIdle } from './auto-update.js';
import { getDriver, allDrivers, getAcceptedProviderKinds, hasDriver } from './driver.js';
import {
  resolveAgentInjection, getActiveProfile, getActiveProfileId, getProfile, getProvider, updateProfile, listProfiles,
} from '../model/index.js';
import type {
  Agent, AgentDetectOptions, AgentInfo, AgentListResult,
  StreamOpts, StreamResult, CodexCumulativeUsage,
  ModelListOpts, ModelListResult, ModelInfo, UsageOpts, UsageResult,
  SessionListOpts, SessionListResult, SessionTailOpts, SessionTailResult,
  SessionMessagesOpts, SessionMessagesResult,
  StreamPreviewMeta, StreamSubAgent, MessageBlock,
} from './types.js';
import {
  Q, agentLog, agentWarn, agentError, joinErrorMessages, normalizeErrorMessage,
  buildStreamPreviewMeta, computeContext, shortValue, isPendingSessionId, dedupeStrings,
  normalizeStreamPreviewPlan,
} from './utils.js';
import {
  saveSessionRecord, setSessionRunState, applySessionRunResult,
  ensureSessionWorkspace, importFilesIntoWorkspace, syncManagedSessionIdentity,
  summarizePromptTitle, recordFork, resolveCanonicalSessionId,
} from './session.js';
import { clearAwaitResume } from './await-resume.js';
import { collapseSkillPrompt } from './skills.js';
import { shouldUseKernelPipeline, kernelStream } from './kernel-bridge.js';
import { accountAgentSupported, resolveAccountEnv, updateAccount } from './accounts.js';

function trimSessionText(value: unknown, max = 24_000): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

export function _detectBrowserMcpFailure(rawLine: string): string | null {
  if (!rawLine) return null;
  if (rawLine.includes('Frame has been detached')) return 'playwright Frame detached';
  if (rawLine.includes('swarmdeck-browser') && rawLine.includes('Connection closed')) {
    return 'swarmdeck-browser MCP stdio closed';
  }
  return null;
}

const AGENT_DETECT_TTL_MS = AGENT_DETECT_TIMEOUTS.detectTtl;
const AGENT_VERSION_TTL_MS = AGENT_DETECT_TIMEOUTS.versionTtl;
const AGENT_VERSION_TIMEOUT_MS = AGENT_DETECT_TIMEOUTS.versionCommand;

interface AgentDetectCacheEntry {
  detectedAt: number;
  versionAt: number;
  info: AgentInfo;
}

const agentDetectCache = new Map<string, AgentDetectCacheEntry>();

function isExecutableFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform === 'win32') return true;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableCandidates(cmd: string): string[] {
  if (process.platform !== 'win32') return [cmd];
  const ext = path.extname(cmd).toLowerCase();
  if (ext) return [cmd];
  const pathExt = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map(value => value.trim())
    .filter(Boolean);
  return [cmd, ...pathExt.map(value => `${cmd}${value.toLowerCase()}`)];
}

function resolveAgentBinPath(cmd: string): string | null {
  const raw = String(cmd || '').trim();
  if (!raw) return null;

  const hasPathSeparator = raw.includes('/') || raw.includes('\\');
  if (hasPathSeparator) {
    const absolutePath = path.resolve(raw);
    for (const candidate of executableCandidates(absolutePath)) {
      if (isExecutableFile(candidate)) return candidate;
    }
    return null;
  }

  const searchPaths = String(process.env.PATH || '')
    .split(path.delimiter)
    .map(entry => entry.trim())
    .filter(Boolean);

  for (const dir of searchPaths) {
    for (const candidate of executableCandidates(path.join(dir, raw))) {
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

function readAgentVersion(binPath: string, timeoutMs: number): string | null {
  try {
    const devnull = process.platform === 'win32' ? '2>nul' : '2>/dev/null';
    return execSync(`${Q(binPath)} --version ${devnull}`, {
      encoding: 'utf-8',
      timeout: Math.max(250, timeoutMs),
    }).trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

export function detectAgentBin(cmd: string, agent: string, options: AgentDetectOptions = {}): AgentInfo {
  const cacheKey = `${agent}:${cmd}`;
  const now = Date.now();
  const includeVersion = !!options.includeVersion;
  const refresh = !!options.refresh;
  const versionTimeoutMs = options.versionTimeoutMs ?? AGENT_VERSION_TIMEOUT_MS;
  let entry = agentDetectCache.get(cacheKey) || null;

  const shouldRefreshBase = refresh || !entry || now - entry.detectedAt > AGENT_DETECT_TTL_MS;
  if (shouldRefreshBase) {
    const binPath = resolveAgentBinPath(cmd);
    const previousVersion = entry?.info.path === binPath ? entry.info.version ?? null : null;
    const previousVersionAt = entry?.info.path === binPath ? entry.versionAt : 0;
    entry = {
      detectedAt: now,
      versionAt: previousVersionAt,
      info: {
        agent,
        installed: !!binPath,
        path: binPath,
        version: previousVersion,
      },
    };
    agentDetectCache.set(cacheKey, entry);
  }

  if (!entry) {
    return { agent, installed: false, path: null, version: null };
  }

  if (
    includeVersion
    && entry.info.installed
    && entry.info.path
    && (refresh || !entry.versionAt || now - entry.versionAt > AGENT_VERSION_TTL_MS)
  ) {
    entry.info.version = readAgentVersion(entry.info.path, versionTimeoutMs);
    entry.versionAt = now;
    agentDetectCache.set(cacheKey, entry);
  }

  return { ...entry.info };
}

export function listAgents(options: AgentDetectOptions = {}): AgentListResult {
  return { agents: allDrivers().map(d => detectAgentBin(d.cmd, d.id, options)) };
}

export function resolveDefaultAgent(
  preferred: Agent | string | null | undefined,
  agents: AgentInfo[] = listAgents().agents,
): Agent {
  const want = typeof preferred === 'string' ? preferred.trim().toLowerCase() : '';
  const wantValid = !!want && hasDriver(want);
  const installed = agents.filter(a => a.installed).map(a => a.agent);
  if (wantValid && installed.includes(want as Agent)) return want as Agent;
  if (installed.length) return installed[0];
  return wantValid ? (want as Agent) : 'codex';
}

export async function run(
  cmd: string[],
  opts: StreamOpts,
  parseLine: (ev: any, s: any) => void,
  parseStderrLine?: (line: string, s: any) => void,
): Promise<StreamResult> {
  const start = Date.now();
  const deadline = start + opts.timeout * 1000;
  let stderr = '';
  let lineCount = 0;
  let timedOut = false;
  let interrupted = false;
  const byokWindow = opts.byokContextWindow && opts.byokContextWindow > 0
    ? opts.byokContextWindow
    : null;
  const byokProvider = opts.byokProviderName || null;
  const s = {
    sessionId: opts.sessionId, text: '', thinking: '', msgs: [] as string[], thinkParts: [] as string[],
    model: opts.model, thinkingEffort: opts.thinkingEffort, errors: null as unknown[] | null,
    inputTokens: null as number | null, outputTokens: null as number | null, cachedInputTokens: null as number | null,
    cacheCreationInputTokens: null as number | null,
    turnOutputTokensBase: 0 as number,
    contextWindow: byokWindow as number | null,
    byokContextWindow: byokWindow as number | null,
    byokProviderName: byokProvider as string | null,
    byokProfileName: (opts.byokProfileName || null) as string | null,
    contextUsedTokens: null as number | null,
    codexCumulative: null as CodexCumulativeUsage | null,
    stopReason: null as string | null, activity: '',
    recentActivity: [] as string[],
    claudeToolsById: new Map<string, { name: string; summary: string }>(),
    seenClaudeToolIds: new Set<string>(),
    geminiToolsById: new Map<string, { name: string; summary: string }>(),
    subAgents: new Map<string, StreamSubAgent>(),
    imageBlocks: [] as MessageBlock[],
    _emitSessionId: opts.onSessionId ?? null,
  };

  const shellCmd = cmd.map(Q).join(' ');
  agentLog(`[spawn] full command: cd ${Q(opts.workdir)} && ${shellCmd}`);
  agentLog(`[spawn] timeout: ${opts.timeout}s session: ${opts.sessionId || '(new)'}`);
  agentLog(`[spawn] prompt (stdin): "${opts.prompt.slice(0, 300)}${opts.prompt.length > 300 ? '…' : ''}"`);

  const spawnEnv = { ...process.env, ...(opts.extraEnv || {}) };

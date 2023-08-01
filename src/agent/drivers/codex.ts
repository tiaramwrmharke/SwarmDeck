import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { registerDriver, type AgentDriver } from '../driver.js';
import { terminateProcessTree } from '../../core/process-control.js';
import {
  type StreamOpts, type StreamResult,
  type StreamPreviewMeta, type StreamPreviewPlan, type StreamPreviewPlanStep,
  type CodexCumulativeUsage, type AgentInteraction, type AgentInteractionQuestion,
  type SessionListResult, type SessionInfo, type SessionTailOpts, type SessionTailResult,
  type SessionMessagesOpts, type SessionMessagesResult,
  type TailMessage, type RichMessage, type MessageBlock,
  mimeForExt,
  type ModelListOpts, type ModelListResult, type ModelInfo,
  type UsageOpts, type UsageResult, type UsageWindowInfo,
  agentLog, agentWarn,
  buildStreamPreviewMeta, pushRecentActivity, normalizeActivityLine,
  firstNonEmptyLine, shortValue, numberOrNull,
  normalizeStreamPreviewPlan,
  IMAGE_EXTS,
  listSwarmDeckSessions, findSwarmDeckSession, isPendingSessionId,
  mergeManagedAndNativeSessions, managedRecordToSessionInfo,
  stripInjectedPrompts, sanitizeSessionUserPreviewText, computeContext, readTailLines, applyTurnWindow,
  roundPercent, toIsoFromEpochSeconds, labelFromWindowMinutes,
  usageWindowFromRateLimit, parseJsonTail, emptyUsage,
  attachAgentImage, codexHome,
  Q,
} from '../index.js';
import {
  CODEX_APPSERVER_SPAWN_TIMEOUT_MS as _CODEX_APPSERVER_SPAWN_TIMEOUT_MS,
  CODEX_STREAM_HARD_KILL_GRACE_MS,
  SESSION_RUNNING_THRESHOLD_MS,
} from '../../core/constants.js';
import { getHome } from '../../core/platform.js';

const CODEX_APPSERVER_SPAWN_TIMEOUT_MS = _CODEX_APPSERVER_SPAWN_TIMEOUT_MS;

type RpcCallback = (msg: any) => void;
type NotificationHandler = (method: string, params: any) => void;
type RequestHandler = (method: string, params: any, requestId: string) => Promise<any> | any;

export class CodexAppServer {
  private proc: ReturnType<typeof spawn> | null = null;
  private buf = '';
  private nextId = 1;
  private pending = new Map<number, RpcCallback>();
  private notificationHandlers = new Set<NotificationHandler>();
  private requestHandlers = new Set<RequestHandler>();
  private ready = false;
  private startPromise: Promise<boolean> | null = null;
  private configOverrides: string[] = [];
  private extraEnv: Record<string, string> | undefined;

  async ensureRunning(extraConfig?: string[], extraEnv?: Record<string, string>): Promise<boolean> {
    if (this.ready && this.proc && !this.proc.killed) return true;
    if (this.startPromise) return this.startPromise;
    this.configOverrides = extraConfig ?? [];
    this.extraEnv = extraEnv;
    this.startPromise = this._start();
    const ok = await this.startPromise;
    this.startPromise = null;
    return ok;
  }

  private _start(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => { this.kill(); resolve(false); }, CODEX_APPSERVER_SPAWN_TIMEOUT_MS);
      const args = ['app-server'];
      // Do NOT force model_reasoning_summary — reasoning summaries stay OFF by default (respecting
      // ~/.codex/config.toml = original behavior). A caller wanting thinking passes it via configOverrides.
      const overrides = [...this.configOverrides];
      if (!overrides.some(entry => /^features\.goals\s*=/.test(entry))) overrides.push('features.goals=true');
      for (const c of overrides) args.push('-c', c);
      agentLog(`[codex-rpc] spawning: codex ${args.join(' ')}`);
      const proc = spawn('codex', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        detached: process.platform !== 'win32',
        env: this.extraEnv ? { ...process.env, ...this.extraEnv } : process.env,
      });
      this.proc = proc;
      this.buf = '';
      this.nextId = 1;
      this.pending.clear();
      this.ready = false;

      proc.stderr?.on('data', (c: Buffer) => { agentLog(`[codex-rpc][stderr] ${c.toString().trim().slice(0, 200)}`); });
      proc.stdout.on('data', (chunk: Buffer) => {
        this.buf += chunk.toString('utf-8');
        const lines = this.buf.split('\n');
        this.buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: any;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.method && msg.id != null) {
            const handlers = [...this.requestHandlers];
            if (!handlers.length) {
              this.respond(msg.id, {});
              continue;
            }
            const [handler] = handlers;
            Promise.resolve(handler(msg.method, msg.params ?? {}, String(msg.id)))
              .then(result => this.respond(msg.id, result ?? {}))
              .catch(error => {
                agentWarn(`[codex-rpc] request handler error method=${msg.method} error=${error?.message || error}`);
                this.respond(msg.id, {});
              });
            continue;
          }
          if (msg.id != null) {
            const cb = this.pending.get(msg.id);
            if (cb) { this.pending.delete(msg.id); cb(msg); }
          }
          if (msg.method && msg.id == null) {
            for (const handler of [...this.notificationHandlers]) handler(msg.method, msg.params ?? {});
          }
        }
      });

      proc.on('error', () => { clearTimeout(timer); this.ready = false; resolve(false); });
      proc.on('close', () => {
        this.ready = false;
        this.proc = null;
        for (const [id, cb] of this.pending) {
          cb({ error: { message: 'process exited before responding' } });
        }
        this.pending.clear();
      });

      this.call('initialize', {
        clientInfo: { name: 'swarmdeck', version: '0.2.0' },
        capabilities: { experimentalApi: true },
      })
        .then(resp => {
          clearTimeout(timer);
          if (resp.error) { agentWarn(`[codex-rpc] init error: ${resp.error.message}`); resolve(false); return; }
          this.ready = true;
          agentLog(`[codex-rpc] initialized`);
          resolve(true);
        })
        .catch(() => { clearTimeout(timer); resolve(false); });
    });
  }

  call(method: string, params?: any, timeoutMs?: number): Promise<any> {
    return new Promise((resolve) => {
      if (!this.proc || this.proc.killed) { resolve({ error: { message: 'not connected' } }); return; }
      const id = this.nextId++;
      const wrappedResolve = (result: any) => {
        if (timer) clearTimeout(timer);
        this.pending.delete(id);
        resolve(result);
      };
      const timer = timeoutMs ? setTimeout(() => {
        this.pending.delete(id);
        resolve({ error: { message: `RPC call '${method}' timed out after ${timeoutMs}ms` } });
      }, timeoutMs) : null;
      this.pending.set(id, wrappedResolve);
      const msg: any = { jsonrpc: '2.0', id, method };
      if (params !== undefined) msg.params = params;
      try { this.proc.stdin!.write(JSON.stringify(msg) + '\n'); } catch {
        if (timer) clearTimeout(timer);
        this.pending.delete(id);
        resolve({ error: { message: 'write failed' } });
      }
    });
  }

  notify(method: string, params?: any): void {
    if (!this.proc || this.proc.killed) return;
    const msg: any = { jsonrpc: '2.0', method };
    if (params !== undefined) msg.params = params;
    try { this.proc.stdin!.write(JSON.stringify(msg) + '\n'); } catch {}
  }

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => { this.notificationHandlers.delete(handler); };
  }

  offNotification(handler?: NotificationHandler): void {
    if (!handler) { this.notificationHandlers.clear(); return; }
    this.notificationHandlers.delete(handler);
  }

  kill(): void {
    terminateProcessTree(this.proc, { signal: 'SIGTERM', forceSignal: 'SIGKILL', forceAfterMs: 2000 });
    this.proc = null;
    this.ready = false;
    for (const cb of this.pending.values()) cb({ error: { message: 'app-server terminated' } });
    this.pending.clear();
    this.notificationHandlers.clear();
  }

  get isRunning(): boolean { return this.ready && !!this.proc && !this.proc.killed; }

  onRequest(handler: RequestHandler): () => void {
    this.requestHandlers.add(handler);
    return () => { this.requestHandlers.delete(handler); };
  }

  private respond(id: any, result: any): void {
    if (!this.proc || this.proc.killed) return;
    try { this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); } catch {}
  }
}

let _sharedServer: CodexAppServer | null = null;
function getSharedServer(): CodexAppServer {
  if (!_sharedServer) _sharedServer = new CodexAppServer();
  return _sharedServer;
}

export function shutdownCodexServer(): void {
  _sharedServer?.kill();
  _sharedServer = null;
}

export type CodexGoalStatus = 'active' | 'paused' | 'budgetLimited' | 'complete';

export interface CodexThreadGoal {
  threadId: string;
  objective: string;
  status: CodexGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

const CODEX_GOAL_RPC_TIMEOUT_MS = 15_000;

async function ensureSharedServerForGoal(): Promise<CodexAppServer | null> {
  const srv = getSharedServer();
  if (!(await srv.ensureRunning())) return null;
  return srv;
}

function unwrapGoal(raw: any): CodexThreadGoal | null {
  const g = raw?.goal ?? raw;
  if (!g || typeof g !== 'object') return null;
  if (typeof g.threadId !== 'string') return null;
  return {
    threadId: g.threadId,
    objective: String(g.objective ?? ''),
    status: (g.status as CodexGoalStatus) || 'active',
    tokenBudget: typeof g.tokenBudget === 'number' ? g.tokenBudget : null,
    tokensUsed: typeof g.tokensUsed === 'number' ? g.tokensUsed : 0,
    timeUsedSeconds: typeof g.timeUsedSeconds === 'number' ? g.timeUsedSeconds : 0,
    createdAt: typeof g.createdAt === 'number' ? g.createdAt : 0,
    updatedAt: typeof g.updatedAt === 'number' ? g.updatedAt : 0,
  };
}

export async function setCodexGoal(opts: {
  threadId: string;
  objective?: string;
  status?: CodexGoalStatus;
  tokenBudget?: number | null;
}): Promise<{ ok: true; goal: CodexThreadGoal | null } | { ok: false; error: string }> {
  const srv = await ensureSharedServerForGoal();
  if (!srv) return { ok: false, error: 'codex app-server unavailable' };
  const params: Record<string, unknown> = { threadId: opts.threadId };
  if (typeof opts.objective === 'string') params.objective = opts.objective;
  if (opts.status) params.status = opts.status;
  if (opts.tokenBudget !== undefined) params.tokenBudget = opts.tokenBudget;
  const resp = await srv.call('thread/goal/set', params, CODEX_GOAL_RPC_TIMEOUT_MS);
  if (resp?.error) return { ok: false, error: String(resp.error.message || 'thread/goal/set failed') };
  return { ok: true, goal: unwrapGoal(resp?.result) };
}

export async function getCodexGoal(threadId: string): Promise<CodexThreadGoal | null> {
  const srv = await ensureSharedServerForGoal();
  if (!srv) return null;
  const resp = await srv.call('thread/goal/get', { threadId }, CODEX_GOAL_RPC_TIMEOUT_MS);
  if (resp?.error) {
    agentWarn(`[codex-rpc] thread/goal/get error: ${resp.error.message || resp.error}`);
    return null;
  }
  return unwrapGoal(resp?.result);
}

export async function clearCodexGoal(threadId: string): Promise<{ ok: boolean; error?: string }> {
  const srv = await ensureSharedServerForGoal();
  if (!srv) return { ok: false, error: 'codex app-server unavailable' };
  const resp = await srv.call('thread/goal/clear', { threadId }, CODEX_GOAL_RPC_TIMEOUT_MS);
  if (resp?.error) return { ok: false, error: String(resp.error.message || 'thread/goal/clear failed') };
  return { ok: true };
}

export async function pauseCodexGoal(threadId: string) {
  return setCodexGoal({ threadId, status: 'paused' });
}

export async function resumeCodexGoal(threadId: string) {
  return setCodexGoal({ threadId, status: 'active' });
}

// Codex (GPT-5.6+) accepts low / medium / high / xhigh / max / ultra as native reasoning levels,
// so the effort token is forwarded to the app-server verbatim. Only `min` is an alias for the
// CLI's `minimal`. (Historically `max` was folded to `xhigh` because older Codex had no `max`
// rung — that clamp is gone now that 5.6 exposes `max`/`ultra` directly.)
const EFFORT_MAP: Record<string, string> = { min: 'minimal' };
function mapEffort(effort: string): string { return EFFORT_MAP[effort] ?? effort; }

interface CodexActiveToolCall { kind: string; summary: string; }
interface PendingCodexAssistantMessage {
  blocks: MessageBlock[];
  toolNamesByCallId: Map<string, string>;
}

function isCodexToolCallItem(item: any): boolean {
  return item?.type === 'dynamicToolCall' || item?.type === 'mcpToolCall' || item?.type === 'collabAgentToolCall';
}

function codexToolKind(name: unknown): string {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return 'tool';
  const parts = raw.split('.');
  return parts[parts.length - 1] || raw;
}

function codexToolName(item: any): string {
  return typeof item?.tool === 'string' && item.tool.trim()
    ? item.tool.trim()
    : (typeof item?.name === 'string' ? item.name.trim() : '');
}

function codexToolArgs(item: any): unknown {
  return item?.arguments ?? item?.input ?? item?.args ?? item?.parameters ?? item?.params ?? item?.call?.arguments ?? null;
}

function commandPreview(command: unknown, max = 160): string {
  const raw = typeof command === 'string' ? command.trim() : '';
  if (!raw) return '';
  const oneLine = raw.split('\n').map(line => line.trim()).find(Boolean) || raw;
  return shortValue(oneLine, max);
}

function summarizeCodexCommand(command: unknown): string {
  const preview = commandPreview(command);
  return preview ? `Bash: ${preview}` : 'Bash';
}

function compactPathTarget(value: unknown, max = 80): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const normalized = raw.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const compact = parts.length >= 2 ? parts.slice(-2).join('/') : normalized;
  if (compact.length <= max) return compact;
  return `...${compact.slice(-(max - 3))}`;
}

function summarizeCodexToolCall(item: any): CodexActiveToolCall | null {
  const rawName = codexToolName(item);
  const kind = codexToolKind(rawName);
  const args = parseCodexArguments(codexToolArgs(item));
  switch (kind) {
    case 'apply_patch': return { kind, summary: 'Edit files' };
    case 'exec_command': {
      const command = args && typeof args === 'object' && !Array.isArray(args) ? (args as any).cmd : null;
      const preview = commandPreview(command);
      return { kind, summary: preview ? `Bash: ${preview}` : 'Bash' };
    }

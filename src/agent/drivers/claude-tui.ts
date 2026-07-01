import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import type { StreamOpts, StreamResult } from '../types.js';
import {
  Q, agentLog, agentWarn, agentError,
  buildStreamPreviewMeta, computeContext, joinErrorMessages,
  emitSessionIdUpdate, normalizeClaudeModelId,
  pushRecentActivity, summarizeClaudeToolUse, summarizeClaudeToolResult,
  previewToolCallInput, previewToolCallResult,
  detectClaudeApiError, detectClaudeModelError, claudeModelErrorMessage,
} from '../utils.js';
import { encodePathAsDirName, getHome, whichSync } from '../../core/platform.js';
import { createRetainedLogSink } from '../../core/logging.js';
import { stripAnsiEscapes } from '../../core/utils.js';
import {
  AGENT_STREAM_HARD_KILL_GRACE_MS,
  CLAUDE_TUI_STALL_QUIET_MS, CLAUDE_TUI_STALL_PENDING_TOOL_MS,
  CLAUDE_TUI_STALL_PTY_DEAD_MS, CLAUDE_TUI_STOP_HOLD_QUIET_TTL_MS,
  CLAUDE_TUI_MODEL_ERROR_SETTLE_MS,
} from '../../core/constants.js';
import {
  claudeParse, createClaudeStreamState,
  claudeContextWindowFromModel, claudeEffectiveContextWindow,
  registerClaudeBackgroundAgentLaunch, pendingClaudeBackgroundAgentCount,
  registerClaudeBackgroundBashLaunch, pendingClaudeBackgroundBashCount,
  extractClaudeBackgroundTaskId, extractClaudeWorkflowRunId,
  claudeEffortAndWorkflowArgs, scrubClaudeSessionContextEnv,
} from './claude.js';

const STALL_DIAG_QUIET_THRESHOLD_MS = 45_000;
const STALL_DIAG_HEARTBEAT_INTERVAL_MS = 30_000;

let stallDiagSink: ((chunk: string) => void) | null | undefined;
function writeStallDiag(record: Record<string, unknown>): void {
  if (stallDiagSink === null) return;
  try {
    if (stallDiagSink === undefined) {
      const file = path.join(getHome(), '.swarmdeck', 'diagnostics', 'claude-tui-stall.jsonl');
      stallDiagSink = createRetainedLogSink(file, {
        maxLines: 50_000,
        maxAgeMs: 14 * 24 * 60 * 60_000,
        trimEveryWrites: 500,
      });
      agentLog(`[claude-tui] stall diagnostics → ${file}`);
    }
    stallDiagSink(JSON.stringify({ ts: Date.now(), ...record }) + '\n');
  } catch {
    stallDiagSink = null;
  }
}

export function classifyClaudeJsonlEvent(ev: any): string {
  const type = typeof ev?.type === 'string' ? ev.type : 'unknown';
  const content = ev?.message?.content;
  if (Array.isArray(content)) {
    if (content.some((b: any) => b?.type === 'tool_use')) return `${type}:tool_use`;
    if (content.some((b: any) => b?.type === 'tool_result')) return `${type}:tool_result`;
    if (content.some((b: any) => b?.type === 'thinking')) return `${type}:thinking`;
    if (content.some((b: any) => b?.type === 'text')) return `${type}:text`;
  }
  return type;
}

interface PtyProcess {
  pid: number;
  onData(cb: (data: string) => void): { dispose(): void };
  onExit(cb: (event: { exitCode: number; signal?: number | null }) => void): { dispose(): void };
  write(data: string): void;
  kill(signal?: string): void;
  resize(cols: number, rows: number): void;
}

interface PtyModule {
  spawn(file: string, args: string[], options: {
    cwd?: string;
    env?: { [key: string]: string };
    cols?: number;
    rows?: number;
    name?: string;
    encoding?: string | null;
  }): PtyProcess;
}

async function loadPty(): Promise<PtyModule> {
  const specifier = 'node-pty';
  const mod: any = await import(/* @vite-ignore */ specifier);
  const api = mod?.default ?? mod;
  if (!api?.spawn) throw new Error('node-pty loaded but spawn() is missing');
  await preflightSpawnHelper();
  return api as PtyModule;
}

let spawnHelperPreflightDone = false;
async function preflightSpawnHelper(): Promise<void> {
  if (spawnHelperPreflightDone || process.platform === 'win32') {
    spawnHelperPreflightDone = true;
    return;
  }
  spawnHelperPreflightDone = true;
  try {
    const ptyRoot = await locatePtyPackageRoot();
    if (!ptyRoot) return;
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
    const helper = path.join(ptyRoot, 'prebuilds', `${platform}-${arch}`, 'spawn-helper');
    if (!fs.existsSync(helper)) return;
    const stat = fs.statSync(helper);
    if ((stat.mode & 0o111) === 0) {
      fs.chmodSync(helper, stat.mode | 0o755);
      agentLog(`[claude-tui] restored executable bit on ${helper}`);
    }
  } catch (e: any) {
    agentWarn(`[claude-tui] spawn-helper preflight skipped: ${e?.message || e}`);
  }
}

async function locatePtyPackageRoot(): Promise<string | null> {
  let dir = path.dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'node_modules', 'node-pty');
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const HOOK_SCRIPT = `#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const event = process.argv[2] || "";
const stateFile = process.argv[3] || "";
const toolEventsFile = process.argv[4] || "";
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { stdin += d; });
process.stdin.on("end", () => {
  let payload = {};
  try { payload = stdin ? JSON.parse(stdin) : {}; } catch (_) {}
  // Tool events go to an append-only JSONL. Sequential lifecycle events
  // (SessionStart / UserPromptSubmit / Stop) still use the state file —
  // they fire once each so the read-modify-write race is benign there.
  if ((event === "PreToolUse" || event === "PostToolUse") && toolEventsFile) {
    const line = JSON.stringify({
      event,
      at: Date.now(),
      tool_use_id: typeof payload.tool_use_id === "string" ? payload.tool_use_id : null,
      tool_name: typeof payload.tool_name === "string" ? payload.tool_name : null,
      tool_input: payload.tool_input || null,
      tool_response: payload.tool_response || null,
      // Claude Code tags sub-agent tool calls with agent_id so the parent can
      // tell them apart from main-thread calls. Forwarding it lets the driver
      // route the hook to the right sub-agent card instead of the parent's
      // 执行 list.
      agent_id: typeof payload.agent_id === "string" ? payload.agent_id : null,
    }) + "\\n";
    try { fs.appendFileSync(toolEventsFile, line); } catch (_) {}
    process.stdout.write(JSON.stringify({ continue: true }) + "\\n");
    return;
  }
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch (_) {}
  state.events = Array.isArray(state.events) ? state.events : [];
  state.events.push({ event, at: Date.now() });
  const sid = typeof payload.session_id === "string" ? payload.session_id : null;
  const tpath = typeof payload.transcript_path === "string" ? payload.transcript_path : null;
  if (sid) state.sessionId = sid;
  if (tpath) state.transcriptPath = tpath;
  if (event === "SessionStart") state.sessionStartedAt = Date.now();
  else if (event === "UserPromptSubmit") state.promptSubmittedAt = Date.now();
  else if (event === "Stop") state.stoppedAt = Date.now();
  try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch (_) {}
  process.stdout.write(JSON.stringify({ continue: true }) + "\\n");
});
process.stdin.on("error", () => {
  try { process.stdout.write(JSON.stringify({ continue: true }) + "\\n"); } catch (_) {}
});
`;

interface HookState {
  events?: Array<{ event: string; at: number }>;
  sessionId?: string;
  transcriptPath?: string;
  sessionStartedAt?: number;
  promptSubmittedAt?: number;
  stoppedAt?: number;
}

function readHookState(statePath: string): HookState {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')) as HookState; }
  catch { return {}; }
}

function readJsonlIncrement(filePath: string, fromOffset: number): { offset: number; lines: string[] } {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= fromOffset) return { offset: fromOffset, lines: [] };
    const len = stat.size - fromOffset;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, fromOffset);
    fs.closeSync(fd);
    const chunk = buf.toString('utf8');
    if (!chunk) return { offset: fromOffset, lines: [] };
    const endsWithNewline = chunk[chunk.length - 1] === '\n';
    const segments = chunk.split('\n');
    if (endsWithNewline) {
      segments.pop();
      return { offset: stat.size, lines: segments };
    }
    const lastLine = segments.pop() || '';
    const consumed = stat.size - Buffer.byteLength(lastLine, 'utf8');
    return { offset: consumed, lines: segments };
  } catch { return { offset: fromOffset, lines: [] }; }
}

interface TuiStreamBuffer {
  trueText: string;
  displayedLen: number;
  timer: NodeJS.Timeout | null;
}

const TUI_STREAM_CHUNK_CHARS = 20;
const TUI_STREAM_CHUNK_INTERVAL_MS = 20;

function makeTuiStreamBuffer(): TuiStreamBuffer {
  return { trueText: '', displayedLen: 0, timer: null };
}

function extractTextBlocks(content: any): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
    .map((block: any) => block.text)
    .join('\n')
    .trim();
}

function normalizedNoticeLines(text: string): string[] {
  return stripAnsiEscapes(text)
    .split(/\r?\n/)
    .map(line => line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''))
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function limitNoticeFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const patterns = [
    /you(?:'|’)ve hit your (?:session|usage) limit/i,
    /you have hit your (?:session|usage) limit/i,
    /(?:session|usage) limit (?:reached|exceeded)/i,
    /(?:session|usage) limit.{0,100}resets?/i,
    /(?:rate limit|rate limited).{0,100}(?:try again|resets?|later)/i,
    /(?:try again|resets?|later).{0,100}(?:rate limit|rate limited)/i,
  ];
  for (const line of normalizedNoticeLines(text)) {
    if (patterns.some(pattern => pattern.test(line))) return line.slice(0, 240);
  }
  return null;
}

export function detectClaudeTuiTerminalLimitNotice(msgOrText: any): string | null {
  if (typeof msgOrText === 'string') return limitNoticeFromText(msgOrText);
  if (!msgOrText || msgOrText.model !== '<synthetic>') return null;
  return limitNoticeFromText(extractTextBlocks(msgOrText.content));
}

export function resolveClaudeTuiLimitOutcome(input: {
  noticeText: string | null;
  noticeAt: number;
  lastSubstantiveEventAt: number;
  hasOutputText: boolean;
}): 'none' | 'info' | 'fatal' {
  if (!input.noticeText) return 'none';
  if (input.hasOutputText || input.lastSubstantiveEventAt > input.noticeAt) return 'info';
  return 'fatal';
}

export function detectClaudeBypassPrompt(screen: any): boolean {
  if (typeof screen !== 'string' || !screen) return false;
  const t = stripAnsiEscapes(screen).replace(/\s+/g, '').toLowerCase();
  return t.includes('bypasspermissionsmode')
    && t.includes('yes,iaccept')
    && t.includes('no,exit');
}

export function detectClaudeProceedPrompt(screen: any): boolean {
  return classifyClaudeScreen(screen).state === 'confirm-prompt';
}

export type ClaudeScreenState =
  | 'confirm-prompt'
  | 'plan-approval'
  | 'bypass-startup'
  | 'idle-repl'
  | 'model-error'
  | 'unknown';

export interface ClaudeScreenInfo {
  state: ClaudeScreenState;
  affirmativeKey: string | null;
  sample: string;
}

/**
 * Read what determinate state Claude's TUI is in from a slice of (ANSI-stripped) PTY screen
 * output. This is the single source of truth consumed by BOTH the in-flight auto-answer (onData)
 * and the stall watchdog: when a turn goes quiet we cannot tell from timing alone whether the TUI
 * is (a) frozen mid-turn (the known CLI freeze — PTY dead), (b) thinking for a long time (PTY
 * repaints a spinner), (c) blocked on an interactive confirm bypass mode does NOT suppress
 * (ask-rule "Do you want to proceed?", trust-a-new-folder), (d) sitting back at the idle REPL
 * (turn finished but the Stop hook was missed/held), or (e) showing a model-unavailable banner.
 *
 * Keys on STRUCTURAL invariants, not exact footers — Claude lays words out with cursor-move
 * escapes so the despaced screen runs together ("doyouwanttoproceed"), and footers TRUNCATE at the
 * 200-col edge ("Esc to cancel" → "sctocancel"). So the footer is corroborating, never required;
 * the load-bearing signals are the cursor'd numbered select (`❯`+`1.`) plus the proceed/confirm
 * question, and the persistent idle mode-line. Robust to claude version churn for the same reason.
 *
 * Default-deny: anything not high-confidence returns 'unknown', because mislabelling a real freeze
 * as a clearable/idle state would convert a self-healing stall (auto-resume) into a silently
 * dropped turn — ambiguity must bias to the freeze path.
 */
export function classifyClaudeScreen(screen: any): ClaudeScreenInfo {
  if (typeof screen !== 'string' || !screen) return { state: 'unknown', affirmativeKey: null, sample: '' };
  const stripped = stripAnsiEscapes(screen);
  const sample = stripped.replace(/\s+/g, ' ').trim().slice(-400);
  const ds = stripped.replace(/\s+/g, '').toLowerCase();

  if (ds.includes('bypasspermissionsmode') && ds.includes('yes,iaccept') && ds.includes('no,exit')) {
    return { state: 'bypass-startup', affirmativeKey: '2', sample };
  }

  if (detectClaudeModelError(ds)) return { state: 'model-error', affirmativeKey: null, sample };

  const asksProceed = ds.includes('doyouwanttoproceed') || ds.includes('wouldyouliketoproceed');
  const hasCursorSelect = ds.includes('❯') && ds.includes('1.');

  if ((asksProceed || ds.includes('readytoexecute'))
      && (ds.includes('manuallyapproveedits') || ds.includes('yes,andbypasspermissions'))) {
    return { state: 'plan-approval', affirmativeKey: null, sample };

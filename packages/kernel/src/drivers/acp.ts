import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  AgentDriver, AgentTurnInput, DriverContext, DriverResult, DriverEvent, McpServerSpec,
} from '../contracts/driver.js';
import type { UniversalUsage, UniversalPlan, UniversalInteraction } from '../protocol/index.js';
import { RpcError, StdioRpcClient } from './rpc.js';
import { attachedFileNote, contextPercent, imageMimeForFile, wireAbort } from './shared.js';

// ── Generic ACP (Agent Client Protocol) driver ────────────────────────────────
// Speaks the ACP ndjson JSON-RPC wire to ANY ACP-compatible agent CLI — OpenCode,
// Gemini, Hermes, claude-code-acp, … . One AcpDriver instance = one agent binary.
//
// Full client surface (vs. the previous hermes-only minimal client):
//   - MCP forwarding            session/new + session/load carry input.extraMcpServers
//   - HITL permissions          session/request_permission -> ctx.askUser (the kernel HITL seam)
//   - filesystem bridge         fs/read_text_file + fs/write_text_file served from disk
//   - model / mode selection    session/set_model + session/set_mode
//   - multimodal prompts        text + base64 image blocks
//   - usage + plan projection   usage_update -> context%, plan -> UniversalPlan
//   - cooperative cancel        session/cancel on abort, then kill
//
// It owns nothing above the agent axis (no IM/web/queue/persistence) — same contract as
// the Claude/Codex/Gemini drivers, so it plugs into createLoom({ drivers }) / registerDriver.

export interface AcpDriverConfig {
  id: string;                                          // swarmdeck agent id (e.g. 'opencode', 'hermes')
  command: string;                                     // binary to spawn
  args?: string[];                                     // subcommand/flags (default ['acp'])
  env?: Record<string, string>;                        // static env, merged UNDER input.env (BYOK wins)
  fsAccess?: boolean;                                  // advertise + serve fs/read|write_text_file (default true)
  permissionFallback?: 'allow' | 'reject' | 'cancel';  // decision when no terminal answers HITL (default 'allow')
  protocolVersion?: number;                            // ACP initialize protocolVersion (default 1)
  promptTimeoutMs?: number;                            // session/prompt timeout (default 2h)
  capabilities?: AgentDriver['capabilities'];
}

// ── swarmdeck McpServerSpec[] -> ACP mcpServers[] ───────────────────────────────
export function toAcpMcpServers(servers?: McpServerSpec[]): any[] {
  if (!servers || !servers.length) return [];
  const out: any[] = [];
  for (const s of servers) {
    if (!s || !s.name) continue;
    if (s.type === 'http' && s.url) {
      out.push({ type: 'http', name: s.name, url: s.url, headers: Object.entries(s.headers || {}).map(([name, value]) => ({ name, value: String(value) })) });
      continue;
    }
    if (s.command) {
      out.push({ name: s.name, command: s.command, args: Array.isArray(s.args) ? s.args.map(String) : [], env: Object.entries(s.env || {}).map(([name, value]) => ({ name, value: String(value) })) });
    }
  }
  return out;
}

// ACP prompt content blocks: text + inline base64 images; other attachments noted as text.
export function buildAcpPromptBlocks(prompt: string, attachments: string[]): any[] {
  const blocks: any[] = [];
  for (const f of attachments) {
    const mime = imageMimeForFile(f);
    if (mime) {
      try { blocks.push({ type: 'image', mimeType: mime, data: readFileSync(f).toString('base64') }); continue; }
      catch { /* fall through to a text note */ }
    }
    blocks.push({ type: 'text', text: attachedFileNote(f) });
  }
  blocks.push({ type: 'text', text: prompt });
  return blocks;
}

function acpContentText(content: any): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(acpContentText).filter(Boolean).join('\n');
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (content.type === 'content' && content.content) return acpContentText(content.content);
    if (content.type === 'diff' && typeof content.path === 'string') return `[diff ${content.path}]`;
  }
  return '';
}

function acpToolStatus(status: any, dflt: 'running' | 'done' | 'failed'): 'running' | 'done' | 'failed' {
  if (status === 'completed') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'pending' || status === 'in_progress') return 'running';
  return dflt;
}

function safeJson(v: any): string | null {
  try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { return null; }
}
function truncate(s: string, n: number): string { return s.length > n ? s.slice(0, n) + '…' : s; }

// session/update -> normalized DriverEvents. Exported (and aliased as applyHermesUpdate)
// so it can be unit-tested against the raw ACP wire without spawning a process.
export function applyAcpUpdate(update: any, s: any, tools: Set<string>, emit: (e: DriverEvent) => void): void {
  if (!update) return;
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      const t = acpContentText(update.content);
      if (t) { s.text = (s.text || '') + t; emit({ type: 'text', delta: t }); }
      return;
    }
    case 'agent_thought_chunk': {
      const t = acpContentText(update.content);

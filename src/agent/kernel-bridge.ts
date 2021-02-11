import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { StreamOpts, StreamResult, StreamPreviewMeta, StreamToolCall, StreamPreviewPlan } from './types.js';
import { agentLog, agentWarn } from './utils.js';
import { normalizeClaudeSessionEntrypoint } from './drivers/claude.js';
import { humanizeCodexError } from './drivers/codex.js';

// ── The cutover seam: route an agent turn through @swarmdeck/kernel ──────────────
//
// DEFAULT: ON — claude/codex/gemini/hermes turns run on the kernel drivers (via runTurn).
// Escape hatches to the legacy driver path:
//   LOOM_KERNEL_PIPELINE=0             (env; force legacy at startup; survives dev.sh scrub)
//   ~/.swarmdeck/dev/kernel-legacy.on   (file; hot-toggle legacy without restart)
//   LOOM_KERNEL_PIPELINE=1             (env; force kernel, overriding the file)
// Tests always run legacy (the unit suite asserts legacy driver behavior). The bridge
// re-applies app-level parity the pure kernel must not own (claude jsonl entrypoint, codex humanize).

const KERNEL_AGENTS = new Set(['claude', 'codex', 'gemini', 'hermes']);

// Generic ACP agents the kernel can drive via @swarmdeck/kernel's AcpDriver. Hermes is its
// own built-in preset; this registry is for ANY other ACP CLI (OpenCode, Zed, …). Extend
// without a code edit via PIKILOOM_ACP_AGENTS='{"zed":{"command":"zed","args":["--acp"]}}'.
const DEFAULT_ACP_AGENTS: Record<string, { command: string; args: string[] }> = {
  opencode: { command: 'opencode', args: ['acp'] },
};
export function acpAgentConfig(agent: string): { command: string; args: string[] } | null {
  if (DEFAULT_ACP_AGENTS[agent]) return DEFAULT_ACP_AGENTS[agent];
  try {
    const extra = process.env.PIKILOOM_ACP_AGENTS ? JSON.parse(process.env.PIKILOOM_ACP_AGENTS) : null;
    const c = extra?.[agent];
    if (c && (c.command || agent)) return { command: String(c.command || agent), args: Array.isArray(c.args) ? c.args.map(String) : ['acp'] };
  } catch { /* malformed env → ignore */ }
  return null;
}

// swarmdeck's mcpServers (Record) -> kernel McpServerSpec[] for ACP session/new forwarding.
function mcpRecordToKernelSpecs(servers?: Record<string, any>): any[] {
  if (!servers) return [];
  const out: any[] = [];
  for (const [name, cfg] of Object.entries(servers)) {
    if (!cfg || typeof cfg !== 'object') continue;
    const type = String(cfg.type || '').toLowerCase();
    if ((type === 'http' || type === 'sse') && cfg.url) { out.push({ name, type: 'http', url: String(cfg.url), headers: cfg.headers || {} }); continue; }
    if (cfg.command) out.push({ name, type: 'stdio', command: String(cfg.command), args: Array.isArray(cfg.args) ? cfg.args.map(String) : [], env: cfg.env || {} });
  }
  return out;
}

export function shouldUseKernelPipeline(agent: string): boolean {
  if (!KERNEL_AGENTS.has(agent) && !acpAgentConfig(agent)) return false;
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return false;   // tests assert legacy
  if (process.env.LOOM_KERNEL_PIPELINE === '0') return false;                 // explicit legacy
  if (process.env.LOOM_KERNEL_PIPELINE === '1') return true;                  // explicit kernel
  try { if (fs.existsSync(path.join(os.homedir(), '.swarmdeck', 'dev', 'kernel-legacy.on'))) return false; } catch { /* ignore */ }
  return true;                                                                // default: kernel
}

// Build the kernel driver instance + the per-agent AgentTurnInput from swarmdeck StreamOpts.
function buildKernelDriver(kernel: any, opts: StreamOpts): { driver: any; input: any } {
  const common = {
    prompt: opts.prompt,
    workdir: opts.workdir,
    sessionId: opts.sessionId ?? null,
    attachments: opts.attachments,
    effort: opts.thinkingEffort,
    env: opts.extraEnv,
    mcpConfigPath: opts.mcpConfigPath ?? null,
    // Consumed by the ACP path (Hermes + generic AcpDriver) for session/new forwarding;
    // ignored by claude/codex/gemini (they carry MCP via config file / native registration).
    extraMcpServers: mcpRecordToKernelSpecs(opts.mcpServers),
  };

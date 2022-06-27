import path from 'node:path';
import { createRetainedLogSink, writeScopedLog, type LogLevel } from '../../core/logging.js';
import type { McpToolModule, ToolContext } from './tools/types.js';
import { workspaceTools } from './tools/workspace.js';
import { goalTools } from './tools/goal.js';
import { awaitResumeTools } from './tools/await-resume.js';
import { askUserTools } from './tools/ask-user.js';

const _logSink = (() => {
  try {
    const ws = process.env.MCP_WORKSPACE_PATH || '';
    if (!ws) return null;
    const dir = path.dirname(ws);
    return createRetainedLogSink(path.join(dir, 'mcp-server.log'));
  } catch { return null; }
})();

function log(msg: string, level: LogLevel = 'debug') {
  if (!writeScopedLog('mcp-server', msg, { level, stream: 'stderr' })) return;
  _logSink?.(`[mcp-server ${new Date().toTimeString().slice(0, 8)}] ${msg}\n`);
}

function summarizeArgs(args: unknown, max = 200): string {
  let text = '';
  try {
    text = JSON.stringify(args);
  } catch {
    text = String(args);
  }
  if (!text) return '{}';
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

const ctx: ToolContext = {
  workspace: process.env.MCP_WORKSPACE_PATH || '',
  workdir: process.env.MCP_WORKDIR || undefined,
  stagedFiles: (() => {
    try { return JSON.parse(process.env.MCP_STAGED_FILES || '[]'); } catch { return []; }
  })(),
  callbackUrl: process.env.MCP_CALLBACK_URL || '',
};

log(`started workspace=${ctx.workspace} stagedFiles=${ctx.stagedFiles.length} callbackUrl=${ctx.callbackUrl ? 'set' : 'MISSING'}`);

const AVAILABLE = new Set(
  (process.env.MCP_TOOLS_AVAILABLE || '').split(',').map(s => s.trim()).filter(Boolean),
);
const IS_CODEX = process.env.MCP_AGENT === 'codex';

const TOOL_MODULES: McpToolModule[] = [
  ...(AVAILABLE.has('workspace') ? [workspaceTools] : []),
  ...(IS_CODEX ? [] : [goalTools]),
  ...(IS_CODEX ? [] : [awaitResumeTools]),
  ...(AVAILABLE.has('ask-user') ? [askUserTools] : []),
];

const ALL_TOOLS = TOOL_MODULES.flatMap(m => m.tools);

const TOOL_HANDLERS = new Map<string, McpToolModule>();
for (const mod of TOOL_MODULES) {
  for (const t of mod.tools) {

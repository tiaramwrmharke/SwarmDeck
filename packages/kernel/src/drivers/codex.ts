import type {
  AgentDriver, AgentTurnInput, DriverContext, DriverEvent, DriverResult, TuiInput, TuiSpec, NativeSessionInfo,
} from '../contracts/driver.js';
import type { UniversalPlan, UniversalUsage, UniversalInteraction, UniversalToolCall } from '../protocol/index.js';
import { codexRolloutTailAnchor, discoverCodexNativeSessions } from './native.js';
import { StdioRpcClient } from './rpc.js';
import { attachedFileNote, contextPercent, imageMimeForFile, wireAbort } from './shared.js';

function planFromUpdate(params: any): UniversalPlan | null {
  const rawSteps = Array.isArray(params?.plan?.steps) ? params.plan.steps : Array.isArray(params?.steps) ? params.steps : Array.isArray(params?.plan) ? params.plan : [];
  const steps = rawSteps.map((st: any) => {
    const text = typeof st?.step === 'string' ? st.step : typeof st?.text === 'string' ? st.text : '';
    const raw = String(st?.status || 'pending');
    const status = raw === 'completed' ? 'completed' : (raw === 'in_progress' || raw === 'inProgress') ? 'inProgress' : 'pending';
    return text ? { text, status } : null;
  }).filter(Boolean) as UniversalPlan['steps'];
  return steps.length ? { explanation: typeof params?.explanation === 'string' ? params.explanation : null, steps } : null;
}

function codexCommandPreview(command: any): string {
  const text = (Array.isArray(command) ? command.join(' ') : typeof command === 'string' ? command : '').replace(/\s+/g, ' ').trim();
  return text.length > 120 ? text.slice(0, 119).trimEnd() + '…' : text;
}

function codexFileChangeSummary(item: any): string {
  const changes = Array.isArray(item?.changes) ? item.changes : [];
  const paths = changes.map((c: any) => (typeof c?.path === 'string' ? c.path.split('/').filter(Boolean).slice(-2).join('/') : '')).filter(Boolean);
  if (paths.length === 1) return `Edit ${paths[0]}`;
  if (paths.length > 1) return `Edit ${paths.length} files`;
  return 'Edit files';
}

// Normalize a codex app-server item -> {id, name, summary}. The summary mirrors swarmdeck's
// vocabulary ("Run shell: <cmd>", "Edit <path>") so the activity projection reads naturally.
// Only ACTUAL tool calls become Activity rows. agentMessage (the answer text) and reasoning
// (thinking) are CONTENT — they render below as message text / thinking, never as tools. The old
// fallback to `item.type` wrongly turned every item (incl. agentMessage/reasoning) into a bogus
// "tool" in the Activity card. Mirrors the legacy driver's isCodexToolCallItem whitelist.
const CODEX_TOOL_CALL_TYPES = new Set(['dynamicToolCall', 'mcpToolCall', 'collabAgentToolCall']);
// Field-less placeholder summaries — a completed item with only one of these never overrides
// a more specific summary cached at item/started.
const CODEX_GENERIC_TOOL_SUMMARIES = new Set(['Search web', 'Run shell command', 'Edit files', 'Use tool']);
const CODEX_TOOL_INPUT_MAX = 4 * 1024;
const CODEX_TOOL_RESULT_MAX = 12 * 1024;

function codexToolText(value: unknown, max: number): string | null {
  if (value == null) return null;
  let text: string;
  if (typeof value === 'string') text = value;
  else {
    try { text = JSON.stringify(value, null, 2); }
    catch { text = String(value); }
  }
  text = text.replace(/\r\n/g, '\n').trim();
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}\n… (truncated)`;
}

function codexToolInput(item: any): string | null {
  switch (item?.type) {
    case 'commandExecution': {
      const command = Array.isArray(item.command) ? item.command.join(' ') : item.command;
      if (!command) return null;
      const detail: Record<string, unknown> = { command };
      if (typeof item.cwd === 'string' && item.cwd.trim()) detail.cwd = item.cwd;
      return codexToolText(detail, CODEX_TOOL_INPUT_MAX);
    }
    case 'fileChange':
    case 'patch':
      return codexToolText(item.changes ?? item.patch ?? item.diff, CODEX_TOOL_INPUT_MAX);
    case 'mcpToolCall':
    case 'dynamicToolCall':
      return codexToolText(item.arguments ?? item.input, CODEX_TOOL_INPUT_MAX);
    case 'collabAgentToolCall':
      return codexToolText({
        prompt: item.prompt ?? undefined,
        model: item.model ?? undefined,
        reasoningEffort: item.reasoningEffort ?? item.reasoning_effort ?? undefined,
        receiverThreadIds: item.receiverThreadIds ?? item.receiver_thread_ids ?? undefined,
      }, CODEX_TOOL_INPUT_MAX);
    case 'webSearch':
      return codexToolText(item.action ?? item.query, CODEX_TOOL_INPUT_MAX);
    default:
      return null;
  }
}

function codexToolResult(item: any): string | null {
  if (item?.type === 'commandExecution') {
    const output = codexToolText(item.aggregatedOutput ?? item.aggregated_output, CODEX_TOOL_RESULT_MAX);
    const exitCode = item.exitCode ?? item.exit_code;
    if (output && typeof exitCode === 'number' && exitCode !== 0) return `${output}\n\n(exit code ${exitCode})`;
    if (output) return output;
    return typeof exitCode === 'number' && exitCode !== 0 ? `exit code ${exitCode}` : null;
  }
  if (item?.type === 'mcpToolCall') {
    const error = item.error?.message ?? item.error;
    if (error) return codexToolText(error, CODEX_TOOL_RESULT_MAX);
    return codexToolText(item.result, CODEX_TOOL_RESULT_MAX);
  }
  if (item?.type === 'dynamicToolCall') {
    return codexToolText(item.contentItems ?? item.content_items, CODEX_TOOL_RESULT_MAX);
  }
  if (item?.type === 'collabAgentToolCall') {
    return codexToolText(item.agentsStates ?? item.agents_states, CODEX_TOOL_RESULT_MAX);
  }
  return null;
}

function codexToolStatus(item: any, fallback: UniversalToolCall['status']): UniversalToolCall['status'] {
  const raw = String(item?.status || '').toLowerCase();
  if (raw === 'failed' || raw === 'declined' || item?.success === false || item?.error) return 'failed';
  if (raw === 'completed' || raw === 'done' || item?.success === true) return 'done';
  return fallback;
}

export function codexToolSummary(item: any): { id: string; name: string; summary: string } | null {
  const id = String(item?.id || '');
  if (!id) return null;
  if (item.type === 'commandExecution') { const c = codexCommandPreview(item.command); return { id, name: 'shell', summary: c ? `Run shell: ${c}` : 'Run shell command' }; }
  if (item.type === 'fileChange' || item.type === 'patch') return { id, name: 'edit', summary: codexFileChangeSummary(item) };
  if (item.type === 'webSearch') {
    // v2 webSearch items carry the query at top level and (on newer servers) an action
    // (search / openPage / findInPage, snake_case on older ones). The query is often only
    // known at item/completed — item/started may arrive query-less.
    const action = item.action || {};
    const kind = String(action.type || '');
    const url = codexCommandPreview(action.url);
    if ((kind === 'openPage' || kind === 'open_page') && url) return { id, name: 'web_search', summary: `Open ${url}` };
    if ((kind === 'findInPage' || kind === 'find_in_page') && url) return { id, name: 'web_search', summary: `Find in ${url}` };
    const query = codexCommandPreview(typeof item.query === 'string' && item.query.trim() ? item.query : action.query);
    return { id, name: 'web_search', summary: query ? `Search web: ${query}` : 'Search web' };
  }
  if (CODEX_TOOL_CALL_TYPES.has(item.type)) {
    const raw = typeof item.tool === 'string' && item.tool.trim() ? item.tool.trim()
      : typeof item.name === 'string' && item.name.trim() ? item.name.trim() : '';

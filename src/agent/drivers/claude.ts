import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { registerDriver, type AgentDriver } from '../driver.js';
import {
  type StreamOpts, type StreamResult, type StreamPreviewPlan, type StreamPreviewPlanStep, type StreamPreviewMeta, type StreamSubAgent,
  type SessionListResult, type SessionTailOpts, type SessionTailResult,
  type SessionMessagesOpts, type SessionMessagesResult,
  type TailMessage, type RichMessage, type MessageBlock,
  type ModelListOpts, type ModelListResult, type ModelInfo,
  type UsageOpts, type UsageResult, type UsageWindowInfo,
  type SessionInfo,
  Q, run, agentError, agentLog, agentWarn,
  appendSystemPrompt, buildStreamPreviewMeta, computeContext, pushRecentActivity,
  summarizeClaudeToolUse, summarizeClaudeToolResult, joinErrorMessages, parseTodoWriteAsPlan,
  applyClaudeTaskUpdateToPlan,
  previewToolCallInput, previewToolCallResult,
  detectClaudeApiError, isRetryableClaudeApiError,
  detectClaudeModelError, claudeModelErrorMessage,
  emitSessionIdUpdate,
  IMAGE_EXTS, mimeForExt,
  listSwarmDeckSessions, findSwarmDeckSession, isPendingSessionId,
  mergeManagedAndNativeSessions, managedRecordToSessionInfo,
  readTailLines, stripInjectedPrompts, sanitizeSessionUserPreviewText, isSystemInjectedUserText, SESSION_PREVIEW_IMAGE_PLACEHOLDER_RE,
  CLAUDE_AT_MENTION_IMAGE_RE, extractClaudeAtMentionImagePaths, stripClaudeAtMentionImages,
  attachAgentImage,
  applyTurnWindow, shortValue,
  roundPercent, toIsoFromEpochSeconds, modelFamily, normalizeClaudeModelId, emptyUsage, normalizeUsageStatus,
  collapseSkillPrompt,
} from '../index.js';
import { AGENT_STREAM_HARD_KILL_GRACE_MS, AGENT_GRACEFUL_ABORT_GRACE_MS, SESSION_RUNNING_THRESHOLD_MS } from '../../core/constants.js';
import { terminateProcessTree } from '../../core/process-control.js';
import { getHome, IS_MAC, encodePathAsDirName } from '../../core/platform.js';
import { loadDeliveredTurns, buildRecoveryQueue, normalizeSnapshotPrompt } from '../turn-snapshot.js';

function buildClaudeUserMessage(prompt: string, attachments: string[]): string {
  const content: any[] = [];
  for (const filePath of attachments) {
    const ext = path.extname(filePath).toLowerCase();
    if (IMAGE_EXTS.has(ext)) {
      try {
        const data = fs.readFileSync(filePath);
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: mimeForExt(ext), data: data.toString('base64') },
        });
      } catch (e: any) {
        agentWarn(`[attach] failed to read image ${filePath}: ${e.message}`);
      }
    } else {
      content.push({ type: 'text', text: `[Attached file: ${filePath}]` });
    }
  }
  content.push({ type: 'text', text: prompt });
  return JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';
}

function claudeUsesStreamJsonInput(o: StreamOpts): boolean {
  return !!o.attachments?.length || !!o.onSteerReady;
}

const CLAUDE_STEER_IDLE_CLOSE_MS = 1200;

export function claudeEffortAndWorkflowArgs(
  o: Pick<StreamOpts, 'thinkingEffort' | 'claudeWorkflowEnabled'>,
): string[] {
  const args: string[] = [];
  const ultraEffort = o.thinkingEffort === 'ultra';
  if (o.thinkingEffort) args.push('--effort', ultraEffort ? 'max' : o.thinkingEffort);
  if (!o.claudeWorkflowEnabled && !ultraEffort) args.push('--disallowed-tools', 'Workflow');
  return args;
}

const CLAUDE_SESSION_CONTEXT_ENV_KEYS = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_EFFORT',
  'CLAUDE_PERMISSION_MODE',
];

export function scrubClaudeSessionContextEnv(env: Record<string, string | undefined>): void {
  for (const key of CLAUDE_SESSION_CONTEXT_ENV_KEYS) delete env[key];
}

function claudeCmd(o: StreamOpts): string[] {
  const args = ['claude', '-p', '--verbose', '--output-format', 'stream-json', '--include-partial-messages'];
  const model = normalizeClaudeModelId(o.claudeModel);
  if (model) args.push('--model', model);
  if (o.claudePermissionMode) args.push('--permission-mode', o.claudePermissionMode);
  if (o.forkOf) {
    args.push('--resume', o.forkOf.parentSessionId, '--fork-session');
  } else if (o.sessionId) {
    args.push('--resume', o.sessionId);
  }
  if (claudeUsesStreamJsonInput(o)) {
    args.push('--input-format', 'stream-json');
    if (o.onSteerReady) args.push('--replay-user-messages');
    if (o.attachments?.length) o._stdinOverride = buildClaudeUserMessage(o.prompt, o.attachments);
  }
  args.push(...claudeEffortAndWorkflowArgs(o));
  if (o.claudeAppendSystemPrompt) args.push('--append-system-prompt', o.claudeAppendSystemPrompt);
  if (o.mcpConfigPath) args.push('--mcp-config', o.mcpConfigPath);
  if (o.claudeExtraArgs?.length) args.push(...o.claudeExtraArgs);
  return args;
}

function routeClaudeSubAgentEvent(ev: any, t: string, parentToolUseId: string, s: any): void {
  const sub: StreamSubAgent | undefined = s.subAgents.get(parentToolUseId);
  if (!sub) return;

  if (t === 'system' || t === 'assistant') {
    const model = ev.model ?? ev.message?.model;
    if (typeof model === 'string' && model.trim()) sub.model = model;
  }
  if (t === 'assistant') {
    const contents = ev.message?.content || [];
    for (const block of contents) {
      if (block?.type !== 'tool_use') continue;
      const toolId = String(block?.id || '').trim();
      if (!toolId || s.seenClaudeToolIds.has(toolId)) continue;
      const toolName = String(block?.name || 'Tool').trim() || 'Tool';
      const summary = toolName === 'TodoWrite' ? 'Update plan' : summarizeClaudeToolUse(block?.name, block?.input || {});
      s.seenClaudeToolIds.add(toolId);
      s.claudeToolsById.set(toolId, { name: toolName, summary });
      sub.tools.push({ id: toolId, name: toolName, summary });
    }
  }
}

function buildClaudeTurnUsage(
  u: { input: number | null; output: number | null; cacheRead: number | null; cacheCreation: number | null; model: string | null },
  turnOutput?: number,
): StreamPreviewMeta | null {
  if (u.input == null && u.output == null && u.cacheRead == null && u.cacheCreation == null) return null;
  const ctxWindow = claudeEffectiveContextWindow(claudeContextWindowFromModel(u.model));
  const used = claudeContextUsedFromUsage({
    input: u.input, cached: u.cacheRead, cacheCreation: u.cacheCreation, output: u.output,
  });
  const contextPercent = ctxWindow && used > 0
    ? Math.min(99.9, Math.round(used / ctxWindow * 1000) / 10)
    : null;
  const meta: StreamPreviewMeta = {
    inputTokens: u.input,
    outputTokens: u.output,
    cachedInputTokens: u.cacheRead,
    contextUsedTokens: used > 0 ? used : null,
    contextPercent,
  };
  if (turnOutput && turnOutput > 0) meta.turnOutputTokens = turnOutput;
  return meta;
}

const CLAUDE_NATIVE_RUNNING_HARD_CAP_MS = 5 * 60 * 1000;

const CLAUDE_TURN_TERMINAL_STOP_REASONS = new Set(['end_turn', 'stop_sequence', 'max_tokens', 'refusal']);

function isClaudeNativeSessionRunning(filePath: string, mtimeMs: number): boolean {
  const age = Date.now() - mtimeMs;
  if (age < SESSION_RUNNING_THRESHOLD_MS) return true;
  if (age > CLAUDE_NATIVE_RUNNING_HARD_CAP_MS) return false;
  const tailLines = readTailLines(filePath, 64 * 1024);
  for (let i = tailLines.length - 1; i >= 0; i--) {
    const line = tailLines[i];
    if (!line || line[0] !== '{') continue;
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    const t = ev?.type;
    if (t === 'ai-title' || t === 'system') continue;
    if (t === 'user') return true;
    if (t === 'assistant') {
      const stop = ev?.message?.stop_reason;
      return stop != null ? !CLAUDE_TURN_TERMINAL_STOP_REASONS.has(stop) : true;
    }
    return false;
  }
  return false;
}

export function claudeContextWindowFromModel(model: unknown): number | null {
  const id = normalizeClaudeModelId(model).toLowerCase();
  if (!id) return null;
  if (id === 'haiku' || /^claude-haiku-/.test(id)) return 200_000;
  if (id === 'opus' || id === 'sonnet' || id === 'fable') return 1_000_000;
  if (/^claude-(opus|sonnet)-/.test(id) || /^claude-fable-/.test(id)) return 1_000_000;
  return null;
}

const CLAUDE_MAX_OUTPUT_RESERVE = 20_000;
const CLAUDE_AUTOCOMPACT_BUFFER = 13_000;
const CLAUDE_USABLE_WINDOW_RESERVE = CLAUDE_MAX_OUTPUT_RESERVE + CLAUDE_AUTOCOMPACT_BUFFER;

export function claudeEffectiveContextWindow(advertised: number | null): number | null {
  if (advertised == null) return null;
  if (advertised <= CLAUDE_USABLE_WINDOW_RESERVE) return advertised;
  return advertised - CLAUDE_USABLE_WINDOW_RESERVE;
}

function claudeContextUsedFromUsage(u: {
  input?: number | null;
  cached?: number | null;
  cacheCreation?: number | null;
  output?: number | null;
}): number {
  return (u.input ?? 0) + (u.cached ?? 0) + (u.cacheCreation ?? 0) + (u.output ?? 0);
}

function recomputeClaudeContextUsed(s: any): void {
  const total = claudeContextUsedFromUsage({
    input: s.inputTokens,
    cached: s.cachedInputTokens,
    cacheCreation: s.cacheCreationInputTokens,
    // While a message is still streaming, the CLI's live thinking estimate is often the only
    // output signal (subscription accounts stream no plaintext thinking and no usage until the
    // message settles); the real output_tokens supersedes it at message_delta.
    output: Math.max(s.outputTokens ?? 0, s.thinkingEstTokens ?? 0),
  });
  s.contextUsedTokens = total > 0 ? total : null;
}

// Accumulate the CLI's live thinking-token estimate (system/thinking_tokens events). Prefer the
// per-event delta (correct whether the CLI's running total is per-message or per-turn); fall back
// to a monotonic max of the running total.
function applyClaudeThinkingEstimate(s: any, ev: any): void {
  const prev = s.thinkingEstTokens ?? 0;
  const delta = Number(ev?.estimated_tokens_delta);
  const total = Number(ev?.estimated_tokens);
  if (Number.isFinite(delta) && delta > 0) s.thinkingEstTokens = prev + delta;
  else if (Number.isFinite(total)) s.thinkingEstTokens = Math.max(prev, total);
}

const CLAUDE_FILE_READING_TOOLS = new Set(['Read']);

function isClaudeFileReadingTool(toolName: string | null | undefined): boolean {
  return !!toolName && CLAUDE_FILE_READING_TOOLS.has(toolName);
}

function accumulateClaudeImagesFromContent(content: any, s: any): void {
  if (!Array.isArray(content)) return;
  for (const entry of content) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'image') {
      const block = claudeImageBlockFromEntry(entry);
      if (!block) continue;
      const key = (entry.source?.data || '').slice(0, 64);
      if (key && s.seenImageKeys?.has(key)) continue;
      if (key) s.seenImageKeys?.add(key);
      s.imageBlocks?.push(block);
    } else if (entry.type === 'tool_result' && Array.isArray(entry.content)) {
      const toolName = entry.tool_use_id ? s.claudeToolsById?.get(entry.tool_use_id)?.name : null;
      if (isClaudeFileReadingTool(toolName)) continue;
      accumulateClaudeImagesFromContent(entry.content, s);
    }
  }
}

function readClaudeTaskCreateId(ev: any, block: any): string | null {
  const structured = ev?.toolUseResult?.task?.id;
  if (structured != null && String(structured).trim()) return String(structured).trim();
  const content = block?.content;
  if (typeof content === 'string') {
    const match = content.match(/Task #(\d+)/);
    if (match) return match[1];
  }
  return null;
}

function rebuildClaudePlanFromTasks(s: any): void {
  if (!s.claudeTaskOrder?.length) {
    return;
  }
  const steps: StreamPreviewPlanStep[] = [];
  for (const id of s.claudeTaskOrder) {
    const task = s.claudeTaskList.get(id);
    if (!task) continue;
    const lowered = String(task.status || '').toLowerCase();
    const status = lowered === 'completed' ? 'completed'
      : lowered === 'in_progress' || lowered === 'inprogress' ? 'inProgress'
      : 'pending';
    steps.push({ step: task.subject, status });
  }
  s.plan = { explanation: null, steps };
}

export interface ClaudeTaskNotification {
  taskId: string | null;
  toolUseId: string | null;
  status: string | null;
}

function ensureClaudeBgAgentState(s: any): void {
  if (!s.bgAgentLaunchedToolUseIds) s.bgAgentLaunchedToolUseIds = new Set<string>();
  if (!s.bgAgentCompletedToolUseIds) s.bgAgentCompletedToolUseIds = new Set<string>();
  if (!s.bgBashToolUseIds) s.bgBashToolUseIds = new Set<string>();
  if (!s.bgTaskIdToToolUse) s.bgTaskIdToToolUse = new Map<string, string>();
  if (typeof s.lastTaskNotificationAt !== 'number') s.lastTaskNotificationAt = 0;
}

export function registerClaudeBackgroundAgentLaunch(s: any, toolUseId: string): void {
  const id = String(toolUseId || '').trim();
  if (!id) return;
  ensureClaudeBgAgentState(s);
  s.bgAgentLaunchedToolUseIds.add(id);
}

export function registerClaudeBackgroundBashLaunch(s: any, toolUseId: string): void {
  const id = String(toolUseId || '').trim();
  if (!id) return;
  ensureClaudeBgAgentState(s);
  s.bgAgentLaunchedToolUseIds.add(id);
  s.bgBashToolUseIds.add(id);
}

export function pendingClaudeBackgroundAgentCount(s: any): number {
  const launched: Set<string> | undefined = s?.bgAgentLaunchedToolUseIds;
  if (!launched?.size) return 0;
  const completed: Set<string> | undefined = s?.bgAgentCompletedToolUseIds;
  let pending = 0;
  for (const id of launched) {
    if (!completed?.has(id)) pending++;
  }
  return pending;
}

export function pendingClaudeBackgroundBashCount(s: any): number {
  const bash: Set<string> | undefined = s?.bgBashToolUseIds;
  if (!bash?.size) return 0;
  const completed: Set<string> | undefined = s?.bgAgentCompletedToolUseIds;
  let pending = 0;
  for (const id of bash) {
    if (!completed?.has(id)) pending++;
  }
  return pending;
}

export function extractClaudeBackgroundTaskId(content: any): string | null {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    text = content
      .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('\n');
  } else if (content && typeof content === 'object') {
    try { text = JSON.stringify(content); } catch { return null; }
  }
  if (!text || !/background/i.test(text)) return null;
  const m = text.match(/\b(?:ID|id)\s*[:：]?\s*[`"']?([A-Za-z0-9][A-Za-z0-9_-]{1,63})/);
  return m ? m[1] : null;
}

export function extractClaudeWorkflowRunId(content: any): string | null {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    text = content
      .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('\n');
  } else if (content && typeof content === 'object') {
    try { text = JSON.stringify(content); } catch { return null; }
  }
  if (!text) return null;
  const m = text.match(/\bwf_[a-z0-9][a-z0-9-]{4,}\b/i);
  return m ? m[0] : null;
}

export function extractClaudeTaskNotification(content: any): ClaudeTaskNotification | null {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    text = content
      .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('\n');
  }
  if (!text || !text.includes('<task-notification>')) return null;
  const tag = (name: string): string | null => {
    const m = text.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`));
    return m ? (m[1].trim() || null) : null;
  };
  return { taskId: tag('task-id'), toolUseId: tag('tool-use-id'), status: tag('status') };
}

export function applyClaudeTaskNotification(s: any, notification: ClaudeTaskNotification, eventAtMs?: number | null): void {
  ensureClaudeBgAgentState(s);
  s.lastTaskNotificationAt = eventAtMs && Number.isFinite(eventAtMs) ? eventAtMs : Date.now();
  const toolUseId = notification.toolUseId
    || (notification.taskId ? s.bgTaskIdToToolUse.get(notification.taskId) : undefined)
    || null;
  if (!toolUseId) return;
  if (!s.bgAgentLaunchedToolUseIds.has(toolUseId) || s.bgAgentCompletedToolUseIds.has(toolUseId)) return;
  s.bgAgentCompletedToolUseIds.add(toolUseId);
  const sub = s.subAgents?.get(toolUseId);
  if (sub && sub.status === 'running') {
    const failed = /^(fail|kill|cancel|stop|abort|error)/i.test(notification.status || '');
    sub.status = failed ? 'failed' : 'done';
  }
  const left = pendingClaudeBackgroundAgentCount(s);
  pushRecentActivity(s.recentActivity, left > 0
    ? `Background agent finished (${left} still running)`
    : 'All background agents finished');
  s.activity = s.recentActivity.join('\n');
}

export function claudeParse(ev: any, s: any) {
  const t = ev.type || '';
  const parentToolUseId: string | null = (typeof ev.parent_tool_use_id === 'string' && ev.parent_tool_use_id)
    ? ev.parent_tool_use_id : null;
  if (parentToolUseId) {
    routeClaudeSubAgentEvent(ev, t, parentToolUseId, s);
    return;
  }
  if (t === 'system') {
    emitSessionIdUpdate(s, ev.session_id);
    s.model = ev.model ?? s.model;
    s.thinkingEffort = ev.thinking_level ?? s.thinkingEffort;
    if (!s.byokContextWindow) {
      const advertised = claudeContextWindowFromModel(s.model);
      s.contextWindow = claudeEffectiveContextWindow(advertised) ?? s.contextWindow;
    }
    // Live thinking progress: during extended thinking a subscription account streams no
    // plaintext (signature_delta only) and no usage until the message settles — these estimates
    // are the only sign the model is working.
    if (ev.subtype === 'thinking_tokens') {
      applyClaudeThinkingEstimate(s, ev);
      recomputeClaudeContextUsed(s);
    }
  }

  if (t === 'stream_event') {
    const inner = ev.event || {};
    if (inner.type === 'message_start') {
      const u = inner.message?.usage;
      // A message that never delivered real output_tokens keeps its thinking estimate as the carry.
      s.turnOutputTokensBase = (s.turnOutputTokensBase ?? 0) + Math.max(s.outputTokens ?? 0, s.thinkingEstTokens ?? 0);
      s.inputTokens = u?.input_tokens ?? 0;
      s.cachedInputTokens = u?.cache_read_input_tokens ?? 0;
      s.cacheCreationInputTokens = u?.cache_creation_input_tokens ?? 0;
      s.outputTokens = 0;
      s.thinkingEstTokens = 0;
      recomputeClaudeContextUsed(s);
    }
    if (inner.type === 'content_block_start') {
      const blockType = inner.content_block?.type;
      if (blockType === 'text' && s.text && !s.text.endsWith('\n\n')) {
        s.text += s.text.endsWith('\n') ? '\n' : '\n\n';
      } else if (blockType === 'thinking' && s.thinking && !s.thinking.endsWith('\n\n')) {
        s.thinking += s.thinking.endsWith('\n') ? '\n' : '\n\n';
      }
    }
    if (inner.type === 'content_block_delta') {
      const d = inner.delta || {};
      if (d.type === 'thinking_delta') s.thinking += d.thinking || '';
      else if (d.type === 'text_delta') s.text += d.text || '';
    }
    if (inner.type === 'message_delta') {
      const d = inner.delta || {};
      s.stopReason = d.stop_reason ?? s.stopReason;
      const u = inner.usage;
      if (u) {
        if (u.input_tokens != null) s.inputTokens = u.input_tokens;
        if (u.cache_read_input_tokens != null) s.cachedInputTokens = u.cache_read_input_tokens;
        if (u.cache_creation_input_tokens != null) s.cacheCreationInputTokens = u.cache_creation_input_tokens;
        // Real reported output supersedes the live thinking estimate for this message.
        if (u.output_tokens != null) { s.outputTokens = u.output_tokens; s.thinkingEstTokens = 0; }
        recomputeClaudeContextUsed(s);
      }
    }
    emitSessionIdUpdate(s, ev.session_id);
    s.model = ev.model ?? s.model;
    if (!s.byokContextWindow) {
      const advertised = claudeContextWindowFromModel(s.model);
      s.contextWindow = claudeEffectiveContextWindow(advertised) ?? s.contextWindow;
    }
  }

  if (t === 'assistant') {
    const msg = ev.message || {};
    if (msg.model === '<synthetic>') {
      if (!s.errors) {
        const synthText = (msg.content || [])
          .filter((b: any) => b?.type === 'text').map((b: any) => b.text || '').join(' ');
        if (ev.error === 'model_not_found' || detectClaudeModelError(synthText)) {
          s.stopReason = 'model_error';
          s.errors = [claudeModelErrorMessage(s.model)];
        }
      }
      return;
    }
    const contents = msg.content || [];
    const th = contents.filter((b: any) => b?.type === 'thinking').map((b: any) => b.thinking || '').join('\n\n');
    const tx = contents.filter((b: any) => b?.type === 'text').map((b: any) => b.text || '').join('\n\n');
    const toolUses = contents.filter((b: any) => b?.type === 'tool_use');
    accumulateClaudeImagesFromContent(contents, s);
    if (th && !s.thinking.trim()) s.thinking = th;
    if (tx && !s.text.trim()) s.text = tx;
    for (const block of toolUses) {
      const toolId = String(block?.id || '').trim();
      if (!toolId || s.seenClaudeToolIds.has(toolId)) continue;
      const toolName = String(block?.name || 'Tool').trim() || 'Tool';
      if (toolName === 'TodoWrite') {
        const plan = parseTodoWriteAsPlan(block?.input);
        if (plan) { s.plan = plan; s.claudeTodoPlan = plan; }
        s.seenClaudeToolIds.add(toolId);
        s.claudeToolsById.set(toolId, { name: toolName, summary: 'Update plan' });
        pushRecentActivity(s.recentActivity, 'Update plan');
        continue;
      }
      if (toolName === 'TaskCreate') {
        const subject = typeof block?.input?.subject === 'string' ? block.input.subject.trim() : '';
        if (subject) s.pendingClaudeTaskCreates.set(toolId, { subject });
        s.seenClaudeToolIds.add(toolId);
        const createSummary = subject ? `Create task: ${subject}` : 'Create task';
        s.claudeToolsById.set(toolId, { name: toolName, summary: createSummary });
        pushRecentActivity(s.recentActivity, createSummary);
        continue;
      }
      if (toolName === 'TaskUpdate') {
        const taskId = String(block?.input?.taskId ?? '').trim();
        const rawStatus = String(block?.input?.status ?? '').trim().toLowerCase();
        // Chronological: the plan reflects the state AFTER this update. An id known to the
        // TaskCreate store lands there; otherwise it lands positionally on the latest
        // TodoWrite list (ids are 1-based positions when the todo panel owns the list).
        if (taskId && s.claudeTaskList.has(taskId)) {
          if (rawStatus === 'deleted') {
            s.claudeTaskList.delete(taskId);

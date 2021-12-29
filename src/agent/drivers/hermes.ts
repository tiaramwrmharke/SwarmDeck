import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, extname } from 'node:path';
import { resolve as resolvePath } from 'node:path';
import { registerDriver, type AgentDriver, type AgentNativeConfig } from '../driver.js';
import { AcpClient, toAcpMcpServers } from '../acp-client.js';
import {
  type StreamOpts, type StreamResult,
  type SessionListResult, type SessionTailOpts, type SessionTailResult,
  type SessionMessagesOpts, type SessionMessagesResult,
  type ModelListOpts, type ModelListResult, type ModelInfo,
  type UsageOpts, type UsageResult, type UsageWindowInfo,
  type TailMessage, type RichMessage, type MessageBlock,
  agentLog, agentWarn, emptyUsage, normalizeErrorMessage,
  listSwarmDeckSessions, managedRecordToSessionInfo, findSwarmDeckSession,
  buildStreamPreviewMeta, applyTurnWindow, pushRecentActivity,
  IMAGE_EXTS, mimeForExt,
} from '../index.js';

function buildHermesPromptBlocks(prompt: string, attachments: string[]): any[] {
  const blocks: any[] = [];
  for (const filePath of attachments) {
    const ext = extname(filePath).toLowerCase();
    if (IMAGE_EXTS.has(ext)) {
      try {
        const data = readFileSync(filePath);
        blocks.push({
          type: 'image',
          data: data.toString('base64'),
          mimeType: mimeForExt(ext),
        });
        continue;
      } catch (e: any) {
        agentWarn(`[hermes] failed to read image ${filePath}: ${e?.message || e}`);
      }
    }
    blocks.push({ type: 'text', text: `[Attached file: ${filePath}]` });
  }
  blocks.push({ type: 'text', text: prompt });
  return blocks;
}

interface StreamState {
  text: string;
  thinking: string;
  activity: string;
  recentActivity: string[];
  toolsById: Map<string, { title: string }>;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  contextWindow: number | null;
  contextUsedTokens: number | null;
}

function makeStreamState(): StreamState {
  return {
    text: '', thinking: '', activity: '',
    recentActivity: [],
    toolsById: new Map(),
    inputTokens: null, outputTokens: null, cachedInputTokens: null,
    contextWindow: null, contextUsedTokens: null,
  };
}

function applySessionUpdate(state: StreamState, update: any): boolean {
  if (!update) return false;
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      const t = update.content?.text;
      if (typeof t === 'string') { state.text += t; return true; }
      return false;
    }
    case 'agent_thought_chunk': {
      const t = update.content?.text;
      if (typeof t === 'string') { state.thinking += t; return true; }
      return false;
    }
    case 'tool_call': {
      const id = typeof update.toolCallId === 'string' ? update.toolCallId : '';
      const title = (typeof update.title === 'string' && update.title.trim()) || 'tool';
      if (id) state.toolsById.set(id, { title });
      pushRecentActivity(state.recentActivity, title);
      state.activity = state.recentActivity.join('\n');
      return true;
    }
    case 'tool_call_update': {
      const id = typeof update.toolCallId === 'string' ? update.toolCallId : '';
      const known = id ? state.toolsById.get(id) : null;
      const title = (typeof update.title === 'string' && update.title.trim()) || known?.title || 'tool';
      if (id && typeof update.title === 'string' && update.title.trim()) {
        state.toolsById.set(id, { title });
      }
      if (update.status === 'completed') {
        pushRecentActivity(state.recentActivity, `${title} done`);
        state.activity = state.recentActivity.join('\n');
      } else if (update.status === 'failed') {
        pushRecentActivity(state.recentActivity, `${title} failed`);
        state.activity = state.recentActivity.join('\n');
      }
      return true;
    }
    case 'usage_update': {
      if (typeof update.size === 'number') state.contextWindow = update.size;
      if (typeof update.used === 'number') state.contextUsedTokens = update.used;
      return true;
    }

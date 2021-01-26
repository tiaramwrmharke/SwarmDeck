import { registerDriver, type AgentDriver } from '../driver.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { GEMINI_USAGE_TIMEOUTS, SESSION_RUNNING_THRESHOLD_MS } from '../../core/constants.js';
import {
  type StreamOpts, type StreamResult,
  type SessionListResult, type SessionInfo, type SessionTailOpts, type SessionTailResult,
  type SessionMessagesOpts, type SessionMessagesResult,
  type TailMessage, type RichMessage, type MessageBlock,
  type ModelListOpts, type ModelListResult,
  type UsageOpts, type UsageResult, type UsageWindowInfo,
  run, agentLog, buildStreamPreviewMeta,
  appendSystemPrompt, pushRecentActivity, firstNonEmptyLine, shortValue, normalizeErrorMessage,
  sanitizeSessionUserPreviewText, emitSessionIdUpdate,
  listSwarmDeckSessions, findSwarmDeckSession, isPendingSessionId,
  mergeManagedAndNativeSessions, managedRecordToSessionInfo, applyTurnWindow,
  stripInjectedPrompts, attachAgentImage,
  roundPercent, emptyUsage, Q,
} from '../index.js';
import { getHome } from '../../core/platform.js';

function hasGeminiFlag(args: string[] | undefined, names: string[]): boolean {
  if (!args?.length) return false;
  return args.some(arg => {
    const trimmed = String(arg || '').trim();
    if (!trimmed.startsWith('-')) return false;
    return names.some(name => trimmed === name || trimmed.startsWith(`${name}=`));
  });
}

export function buildGeminiPromptText(prompt: string, attachments: string[]): string {
  if (!attachments.length) return prompt;
  const refs = attachments.map(p => /\s/.test(p) ? `@"${p}"` : `@${p}`).join(' ');
  return prompt ? `${refs}\n\n${prompt}` : refs;
}

function geminiCmd(o: StreamOpts): string[] {
  const approvalMode = o.geminiApprovalMode || 'yolo';
  const sandbox = typeof o.geminiSandbox === 'boolean' ? o.geminiSandbox : false;
  const args = ['gemini', '--output-format', 'stream-json'];
  if (o.geminiModel) args.push('--model', o.geminiModel);
  if (o.sessionId) args.push('--resume', o.sessionId);
  if (!hasGeminiFlag(o.geminiExtraArgs, ['--approval-mode', '--yolo', '-y'])) {
    args.push('--approval-mode', approvalMode);
  }
  if (!hasGeminiFlag(o.geminiExtraArgs, ['--sandbox', '-s'])) {
    args.push('--sandbox', String(sandbox));
  }
  if (o.geminiExtraArgs?.length) args.push(...o.geminiExtraArgs);
  const userPrompt = buildGeminiPromptText(o.prompt, o.attachments || []);
  const promptText = o.geminiSystemInstruction
    ? appendSystemPrompt(o.geminiSystemInstruction, userPrompt)
    : userPrompt;
  args.push('-p', promptText);
  return args;
}

function geminiContextWindowFromModel(model: unknown): number | null {
  const id = typeof model === 'string' ? model.trim().toLowerCase() : '';
  if (!id) return null;
  if (/^(auto-gemini-(2\.5|3)|gemini-(2\.5|3|3\.1)-)/.test(id)) return 1_048_576;
  return null;
}

function geminiToolName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  return name || 'tool';
}

function geminiToolLabel(name: string): string {
  return name
    .replace(/^mcp_/, '')
    .replace(/^discovered_tool_/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'tool';
}

function geminiToolSummary(name: unknown, parameters: any): string {
  const tool = geminiToolName(name);
  const params = parameters && typeof parameters === 'object' ? parameters : {};
  switch (tool) {
    case 'read_file': {
      const target = shortValue(params.file_path || params.path, 140);
      return target ? `Read ${target}` : 'Read file';
    }
    case 'read_many_files': {
      const include = shortValue(params.include || params.pattern, 120);
      return include ? `Read files: ${include}` : 'Read files';
    }
    case 'write_file': {
      const target = shortValue(params.file_path || params.path, 140);
      return target ? `Write ${target}` : 'Write file';
    }
    case 'replace': {
      const target = shortValue(params.file_path || params.path, 140);
      return target ? `Edit ${target}` : 'Edit file';
    }
    case 'list_directory': {
      const dir = shortValue(params.dir_path || params.path, 120);
      return dir ? `List files: ${dir}` : 'List files';
    }
    case 'glob': {
      const pattern = shortValue(params.pattern || params.glob, 120);
      return pattern ? `Find files: ${pattern}` : 'Find files';
    }
    case 'grep_search':
    case 'search_file_content': {
      const pattern = shortValue(params.pattern || params.query, 120);
      return pattern ? `Search text: ${pattern}` : 'Search text';
    }
    case 'run_shell_command': {
      const command = shortValue(params.command, 120);
      return command ? `Run shell: ${command}` : 'Run shell';
    }
    case 'web_fetch': {
      const target = shortValue(params.url || params.prompt, 120);
      return target ? `Fetch ${target}` : 'Fetch web page';
    }
    case 'google_web_search': {
      const query = shortValue(params.query, 120);
      return query ? `Search web: ${query}` : 'Search web';
    }
    case 'write_todos': return 'Update todo list';
    case 'save_memory': return 'Save memory';
    case 'ask_user': return 'Request user input';
    case 'activate_skill': {
      const skill = shortValue(params.name, 80);
      return skill ? `Activate skill: ${skill}` : 'Activate skill';
    }
    case 'get_internal_docs': {
      const target = shortValue(params.path, 120);
      return target ? `Read docs: ${target}` : 'Read docs';
    }
    case 'enter_plan_mode': return 'Enter plan mode';
    case 'exit_plan_mode': return 'Exit plan mode';
    default: {
      const detail = shortValue(
        params.file_path
        || params.path
        || params.dir_path
        || params.pattern
        || params.query
        || params.command
        || params.url
        || params.name,
        120,
      );
      const label = shortValue(geminiToolLabel(tool), 80);
      return detail ? `Use ${label}: ${detail}` : `Use ${label}`;
    }
  }
}

function geminiToolResultSummary(tool: { name: string; summary: string } | undefined, ev: any): string {
  const fallbackSummary = geminiToolSummary(
    tool?.name || ev.tool_name || ev.name || ev.tool,
    ev.parameters || ev.args || ev.input || {},

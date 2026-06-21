import fs from 'node:fs';
import path from 'node:path';
import type { McpToolModule, ToolContext, ToolResult } from './types.js';
import { toolResult, toolLog } from './types.js';

const AWAIT_FILE = 'awaiting.json';
const MAX_REASON_CHARS = 280;

const tools: McpToolModule['tools'] = [
  {
    name: 'await_background',
    description: [
      'Mark this session as waiting on detached background work.',
      'Call this ONLY when you are ending your turn while work you launched keeps running detached from this turn (a daemon, a build/install that must survive a restart, a long external job) and you intend to report back on it in a later turn.',
      'This is a passive status hint for the dashboard — it does NOT change how you run, does NOT keep the turn open, and does NOT wake you when the work finishes. Do not call it for ordinary tool calls or foreground work, and do not call it just because a task is large.',
      'The marker is cleared automatically the next time this session runs, so you never need to clear it yourself.',
    ].join('\n'),
    inputSchema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description:
            'Short, human-readable note on what is still running and what you will report back (e.g. "rebuilding + restarting swarmdeck, will confirm after it comes back up").',
        },
      },

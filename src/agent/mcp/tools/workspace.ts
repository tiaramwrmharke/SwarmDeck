import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import type { McpToolModule, ToolContext, ToolResult } from './types.js';
import { toolResult, toolLog } from './types.js';

const tools: McpToolModule['tools'] = [
  {
    name: 'im_list_files',
    description: 'List files in the session workspace.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        subdirectory: {
          type: 'string',
          description: 'Workspace-relative subdirectory.',
        },
      },
    },
  },
  {
    name: 'im_send_file',
    description: 'Send a file to the user through the active terminal (IM chat or web dashboard). Use this to hand over screenshots, reports, archives, or generated assets — the file is delivered and stays retrievable even when the user is connected remotely. Prefer this over printing a local filesystem path, which a remote user cannot open.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path to send. Supports absolute paths, @workspace/..., @workdir/..., @tmp/..., workspace-relative paths, and unique bare filenames.',
        },
        caption: {
          type: 'string',
          description: 'Caption.',
        },
        kind: {
          type: 'string',
          enum: ['photo', 'document'],
          description: 'Optional file kind.',
        },
      },
      required: ['path', 'caption'],
    },
  },
];

function summarizeSendFileArgs(filePath: string, caption: string, kind?: string): string {
  const text = [
    `path=${JSON.stringify(filePath || '')}`,
    `kind=${JSON.stringify(kind || 'auto')}`,
    `caption=${JSON.stringify(caption || '')}`,

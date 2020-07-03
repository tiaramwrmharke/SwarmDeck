import fs from 'node:fs';
import path from 'node:path';
import type { McpToolModule, ToolContext, ToolResult } from './types.js';
import { toolResult, toolLog } from './types.js';

const tools: McpToolModule['tools'] = [
  {
    name: 'goal_get',
    description:
      'Get the current goal for this session, including objective, status, token and elapsed-time usage, token budget, and tokens remaining.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'goal_update',
    description: [
      'Update the existing goal.',
      'Use this tool only to mark the goal achieved.',
      'Set status to `complete` only when the objective has actually been achieved and no required work remains.',
      'Do not mark a goal complete merely because its budget is nearly exhausted or because you are stopping work.',
      'You cannot use this tool to pause, resume, or budget-limit a goal; those status changes are controlled by the user or system.',
      'When marking a budgeted goal achieved with status `complete`, report the final token usage from the tool result to the user.',
    ].join('\n'),
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['complete'],
          description:
            'Required. Set to "complete" only when the objective is achieved and no required work remains.',
        },
      },
      required: ['status'],
    },
  },
];

function sessionRootFromCtx(ctx: ToolContext): string {
  const workspace = path.resolve(ctx.workspace || '');
  if (!workspace) return '';
  return path.basename(workspace) === 'workspace' ? path.dirname(workspace) : workspace;
}

function goalPathFromCtx(ctx: ToolContext): string {
  const root = sessionRootFromCtx(ctx);
  if (!root) return '';
  return path.join(root, 'goal.json');

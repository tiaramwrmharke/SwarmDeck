import http from 'node:http';
import type { McpToolModule, ToolContext, ToolResult } from './types.js';
import { toolResult, toolLog } from './types.js';

interface AskUserOption { label: string; description?: string; value?: string }

const tools: McpToolModule['tools'] = [
  {
    name: 'im_ask_user',
    description:
      'Ask the user a question and block until they reply. Equivalent to '
      + '`AskUserQuestion`, routed through the IM channel or dashboard. '
      + 'Supply `options` whenever the answer is enumerable so the user can '
      + 'tap a choice. Use only when you genuinely need user input to '
      + 'proceed; for routine clarifications, pick a sensible default and '
      + 'continue.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'Question text shown to the user.' },
        header: { type: 'string', description: 'Optional short header (≤ 24 chars).' },
        hint: { type: 'string', description: 'Optional helper text shown alongside the question.' },
        options: {
          type: 'array',
          description: 'Predefined choices. Omit for a freeform answer.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Option label, returned verbatim if selected.' },
              description: { type: 'string', description: 'Optional secondary description.' },
            },
            required: ['label'],
          },
        },
        allow_freeform: {
          type: 'boolean',
          description: 'When options are supplied, also accept freeform text (default true).',
        },
      },
      required: ['question'],
    },

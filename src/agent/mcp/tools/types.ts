import { writeScopedLog } from '../../../core/logging.js';

export type ToolContent = { type: 'text'; text: string };

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolModule {
  tools: McpToolDef[];
  handle(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> | ToolResult;
}


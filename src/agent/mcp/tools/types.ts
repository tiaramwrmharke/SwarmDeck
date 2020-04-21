import { writeScopedLog } from '../../../core/logging.js';

export type ToolContent = { type: 'text'; text: string };

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export interface McpToolDef {
  name: string;

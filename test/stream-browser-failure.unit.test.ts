import { describe, expect, it } from 'vitest';
import { _detectBrowserMcpFailure } from '../src/agent/stream.ts';

describe('_detectBrowserMcpFailure', () => {
  it('detects known failure patterns and ignores benign chunks', () => {
    const frameLine = '{"type":"user","message":{"content":[{"type":"tool_result","content":"### Error\\nError: browserBackend.callTool: Frame has been detached.\\n"}]}}';
    expect(_detectBrowserMcpFailure(frameLine)).toBe('playwright Frame detached');

    const mcpLine = '{"type":"user","message":{"content":[{"type":"tool_result","content":"mcp__swarmdeck-browser__browser_navigate: http://x failed: MCP error -32000: Connection closed"}]}}';
    expect(_detectBrowserMcpFailure(mcpLine)).toBe('swarmdeck-browser MCP stdio closed');


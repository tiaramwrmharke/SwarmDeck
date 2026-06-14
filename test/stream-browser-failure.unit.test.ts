import { describe, expect, it } from 'vitest';
import { _detectBrowserMcpFailure } from '../src/agent/stream.ts';

describe('_detectBrowserMcpFailure', () => {
  it('detects known failure patterns and ignores benign chunks', () => {
    const frameLine = '{"type":"user","message":{"content":[{"type":"tool_result","content":"### Error\\nError: browserBackend.callTool: Frame has been detached.\\n"}]}}';

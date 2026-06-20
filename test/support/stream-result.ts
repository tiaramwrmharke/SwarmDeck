import type { Agent, StreamResult } from '../../src/agent/index.ts';

export function makeStreamResult(
  agent: Agent,
  overrides: Partial<StreamResult> = {},
): StreamResult {
  return {
    ok: true,
    message: 'ok',
    thinking: null,
    plan: null,
    sessionId: 'sess-1',
    workspacePath: null,

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CodexDriver, captureCodexReasoning, captureCodexAgentMessage, codexReasoningItemText,
  codexFinalText, codexFinalReasoning, codexToolCall, codexToolSummary, type CodexContentState,
} from '../src/drivers/codex.js';
import type { DriverContext, DriverEvent } from '../src/contracts/driver.js';

// A fake `codex app-server` speaking the newline-JSON-RPC the driver expects, so the
// codex port is verified end-to-end without the real codex binary / network.
const FAKE_APP_SERVER = `#!/usr/bin/env node
let buf = '';
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc:'2.0', id, result }) + '\\n');
const notify = (method, params) => process.stdout.write(JSON.stringify({ jsonrpc:'2.0', method, params }) + '\\n');
const TID = 'codex-thread-xyz';
process.stdin.on('data', (d) => {
  buf += d; const lines = buf.split('\\n'); buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.method === 'initialize') reply(m.id, {});
    else if (m.method === 'thread/start') reply(m.id, { thread: { id: TID } });
    else if (m.method === 'turn/start') {
      reply(m.id, {});
      notify('turn/started', { threadId: TID, turn: { id: 'turn-1' } });
      notify('item/started', { threadId: TID, item: { type: 'agentMessage', id: 'msg1', phase: 'final_answer' } });
      notify('item/reasoning/textDelta', { threadId: TID, delta: 'thinking...' });
      notify('item/agentMessage/delta', { threadId: TID, itemId: 'msg1', delta: 'CODEX-' });
      notify('item/agentMessage/delta', { threadId: TID, itemId: 'msg1', delta: 'KERNEL-OK' });
      notify('item/started', { threadId: TID, item: { type: 'commandExecution', id: 'cmd1', command: 'ls -la', cwd: '/tmp/work' } });
      notify('item/commandExecution/outputDelta', { threadId: TID, itemId: 'cmd1', delta: 'live output\\n' });
      // Some app-server versions omit aggregatedOutput after streaming outputDelta. The driver
      // must preserve the accumulated live result instead of replacing it with an empty value.
      notify('item/completed', { threadId: TID, item: { type: 'commandExecution', id: 'cmd1', status: 'completed', aggregatedOutput: null, exitCode: 0 } });
      notify('item/completed', { threadId: TID, item: { type: 'webSearch', id: 'ws1', status: 'completed', query: 'swarmdeck rename' } });
      notify('turn/plan/updated', { threadId: TID, plan: { steps: [{ step: 'do the thing', status: 'in_progress' }] } });
      notify('thread/tokenUsage/updated', { threadId: TID, tokenUsage: { input_tokens: 42, output_tokens: 7 } });
      notify('turn/completed', { threadId: TID, turn: { id: 'turn-1', status: 'completed' } });
    }
  }
});
`;

function ctxCollect(): { ctx: DriverContext; events: DriverEvent[] } {
  const events: DriverEvent[] = [];
  const ctx: DriverContext = {
    signal: new AbortController().signal,
    emit: (e) => events.push(e),
    askUser: async () => ({}),
    registerSteer: () => {},
  };
  return { ctx, events };
}

describe('CodexDriver native (app-server JSON-RPC, hermetic via fake server)', () => {
  let tmp: string; let fake: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-codex-'));
    fake = path.join(tmp, 'fake-codex.mjs');
    fs.writeFileSync(fake, FAKE_APP_SERVER);
    fs.chmodSync(fake, 0o755);
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('drives a turn: session id, text, reasoning, tool, plan, usage, completion', async () => {
    const { ctx, events } = ctxCollect();
    const driver = new CodexDriver(fake);
    const result = await driver.run({ prompt: 'hello codex', workdir: tmp, effort: 'high' }, ctx);

    expect(result.ok).toBe(true);
    expect(result.text).toBe('CODEX-KERNEL-OK');
    expect(result.sessionId).toBe('codex-thread-xyz');
    expect(result.usage).toMatchObject({ inputTokens: 42, outputTokens: 7 });

    expect(events.find(e => e.type === 'session')).toMatchObject({ sessionId: 'codex-thread-xyz' });
    expect(events.filter(e => e.type === 'text').map(e => (e as any).delta).join('')).toBe('CODEX-KERNEL-OK');
    expect(events.filter(e => e.type === 'reasoning').map(e => (e as any).delta).join('')).toBe('thinking...');
    const toolStatuses = events.filter(e => e.type === 'tool').map(e => (e as any).call.status);
    expect(toolStatuses).toContain('running');
    expect(toolStatuses).toContain('done');
    const commandCalls = events.filter(e => e.type === 'tool').map(e => (e as any).call).filter(c => c.id === 'cmd1');
    expect(commandCalls[0]).toMatchObject({
      name: 'shell',
      summary: 'Run shell: ls -la',
      status: 'running',
    });
    expect(commandCalls[0].input).toContain('"command": "ls -la"');
    expect(commandCalls[0].input).toContain('"cwd": "/tmp/work"');
    expect(commandCalls.some(c => c.status === 'running' && c.result === 'live output\n')).toBe(true);
    expect(commandCalls.at(-1)).toMatchObject({ status: 'done', result: 'live output\n' });
    // webSearch arrives as a completed-only item (no item/started, query only at completion) —
    // it must still surface as an Activity tool row with its query.
    const ws = events.filter(e => e.type === 'tool').map(e => (e as any).call).find(c => c.id === 'ws1');
    expect(ws).toMatchObject({ name: 'web_search', summary: 'Search web: swarmdeck rename', status: 'done' });
    const plan = events.find(e => e.type === 'plan') as any;
    expect(plan.plan.steps).toEqual([{ text: 'do the thing', status: 'inProgress' }]);
  }, 20_000);

  it('exposes a TUI spec', () => {
    const spec = new CodexDriver().tui({ workdir: '/tmp/x', model: 'gpt-5.5' });
    expect(spec.command).toBe('codex');
    expect(spec.args).toContain('-m');
    expect(spec.args).toContain('gpt-5.5');
  });
});

// Regression: codex (notably Chat→Responses bridged third-party models) can deliver the final
// answer and reasoning as *completed items* with NO preceding deltas. The kernel must still
// surface them — parity with the legacy driver's s.msgs / s.thinkParts + end-of-turn fallback.
const FAKE_COMPLETED_ONLY_SERVER = `#!/usr/bin/env node
let buf = '';
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc:'2.0', id, result }) + '\\n');
const notify = (method, params) => process.stdout.write(JSON.stringify({ jsonrpc:'2.0', method, params }) + '\\n');
const TID = 'codex-thread-completed';
process.stdin.on('data', (d) => {
  buf += d; const lines = buf.split('\\n'); buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.method === 'initialize') reply(m.id, {});
    else if (m.method === 'thread/start') reply(m.id, { thread: { id: TID } });
    else if (m.method === 'turn/start') {
      reply(m.id, {});
      notify('turn/started', { threadId: TID, turn: { id: 'turn-1' } });
      // No agentMessage/reasoning deltas — only completed items.
      notify('rawResponseItem/completed', { threadId: TID, item: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'REASONED-VIA-RAW' }] } });
      notify('item/completed', { threadId: TID, item: { type: 'agentMessage', id: 'msg1', phase: 'final_answer', text: 'FINAL-VIA-COMPLETED' } });
      notify('turn/completed', { threadId: TID, turn: { id: 'turn-1', status: 'completed' } });
    }
  }
});
`;

describe('CodexDriver completed-item fallback (no deltas)', () => {
  let tmp: string; let fake: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-codex-done-'));
    fake = path.join(tmp, 'fake-codex.mjs');
    fs.writeFileSync(fake, FAKE_COMPLETED_ONLY_SERVER);
    fs.chmodSync(fake, 0o755);
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('captures text + reasoning from completed items and streams them live', async () => {
    const { ctx, events } = ctxCollect();
    const result = await new CodexDriver(fake).run({ prompt: 'hi', workdir: tmp }, ctx);

    expect(result.ok).toBe(true);
    expect(result.text).toBe('FINAL-VIA-COMPLETED');
    expect(result.reasoning).toBe('REASONED-VIA-RAW');
    // Streamed live (not just present in the terminal result) so the snapshot fills mid-turn.
    expect(events.filter(e => e.type === 'text').map(e => (e as any).delta).join('')).toBe('FINAL-VIA-COMPLETED');
    expect(events.filter(e => e.type === 'reasoning').map(e => (e as any).delta).join('')).toBe('REASONED-VIA-RAW');

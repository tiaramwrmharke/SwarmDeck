import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AcpDriver, applyAcpUpdate, toAcpMcpServers, buildAcpPromptBlocks,
} from '../src/drivers/acp.js';
import { runTurn } from '../src/index.js';
import type { DriverEvent } from '../src/contracts/driver.js';

// ── A hermetic ACP agent (ndjson JSON-RPC over stdio) used to drive the real AcpDriver
// through a real subprocess: exercises initialize, MCP forwarding, set_model, the
// permission HITL round-trip, the fs/write+read bridge, usage, and stopReason. ──────────
const MOCK_ACP_AGENT = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
let model = '(none)';
let mcpCount = -1;
const pending = new Map();
let permId = 1000;
function send(o) { process.stdout.write(JSON.stringify(o) + '\\n'); }
function note(sessionId, update) { send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } }); }
rl.on('line', async (line) => {
  const t = line.trim(); if (!t) return;
  let m; try { m = JSON.parse(t); } catch { return; }
  // response to our (agent->client) permission request
  if (m.id != null && !m.method) { const cb = pending.get(m.id); if (cb) { pending.delete(m.id); cb(m.result); } return; }
  if (m.method === 'initialize') return send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: 1 } });
  if (m.method === 'session/new') { mcpCount = Array.isArray(m.params.mcpServers) ? m.params.mcpServers.length : 0; return send({ jsonrpc: '2.0', id: m.id, result: { sessionId: 'mock-1' } }); }
  if (m.method === 'session/set_model') { model = m.params.modelId; return send({ jsonrpc: '2.0', id: m.id, result: {} }); }
  if (m.method === 'session/set_mode') return send({ jsonrpc: '2.0', id: m.id, result: {} });
  if (m.method === 'session/prompt') {
    const sid = m.params.sessionId;
    note(sid, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'thinking ' } });
    note(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello ' } });
    // fs bridge: ask the client to write then read a file, prove the round-trip
    const target = m.params.prompt.find(b => b.type === 'text' && b.text.startsWith('FILE:')).text.slice(5);
    await new Promise((res) => { const id = permId++; pending.set(id, res); send({ jsonrpc: '2.0', id, method: 'fs/write_text_file', params: { sessionId: sid, path: target, content: 'written-by-agent' } }); });
    const readBack = await new Promise((res) => { const id = permId++; pending.set(id, res); send({ jsonrpc: '2.0', id, method: 'fs/read_text_file', params: { sessionId: sid, path: target } }); });
    // permission HITL: ask the client; branch the answer into the message
    const outcome = await new Promise((res) => { const id = permId++; pending.set(id, res); send({ jsonrpc: '2.0', id, method: 'session/request_permission', params: { sessionId: sid, toolCall: { title: 'delete everything' }, options: [{ optionId: 'ok', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }] } }); });
    const decision = outcome && outcome.outcome && outcome.outcome.outcome === 'selected' ? outcome.outcome.optionId : 'cancelled';
    note(sid, { sessionUpdate: 'tool_call', toolCallId: 'tc1', title: 'edit', status: 'in_progress' });
    note(sid, { sessionUpdate: 'tool_call_update', toolCallId: 'tc1', status: 'completed' });
    note(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'model=' + model + ' mcp=' + mcpCount + ' perm=' + decision + ' file=' + (readBack && readBack.content) } });
    note(sid, { sessionUpdate: 'usage_update', size: 100000, used: 4242 });

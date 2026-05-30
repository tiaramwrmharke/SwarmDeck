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

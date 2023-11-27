import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClaudeDriver } from '../src/drivers/claude.js';
import { CodexDriver } from '../src/drivers/codex.js';
import type { DriverContext, DriverEvent } from '../src/contracts/driver.js';

const waitFor = async (pred: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!pred()) { if (Date.now() - t0 > ms) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 10)); }
};

// Fake claude in stream-json INPUT mode: echoes each stdin user message's text as a
// text_delta; emits `result` after the 2nd message (the steer). Proves mid-turn steer.
const FAKE_CLAUDE = `#!/usr/bin/env node
let buf = ''; let count = 0;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type:'system', session_id:'cl-steer-1', model:'claude-opus-4-8' });
process.stdin.on('data', (d) => {
  buf += d; const lines = buf.split('\\n'); buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue; let m; try { m = JSON.parse(line); } catch { continue; }
    const text = m?.message?.content?.[0]?.text || '';
    count++;
    out({ type:'stream_event', event:{ type:'content_block_delta', delta:{ type:'text_delta', text:'['+text+']' } } });
    if (count >= 2) out({ type:'result', session_id:'cl-steer-1', is_error:false, stop_reason:'end_turn', usage:{ input_tokens:5, output_tokens:2 } });
  }
});
`;


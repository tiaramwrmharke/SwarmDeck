import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClaudeDriver, claudeProcessFingerprint } from '../src/drivers/claude.js';
import type { AgentTurnInput, DriverContext, DriverEvent } from '../src/contracts/driver.js';

// A fake multi-turn `claude` CLI: stream-json in/out, one full turn per user message,
// stays alive while stdin is open (exactly the real CLI's -p --input-format stream-json
// contract the warm pool builds on). It stamps its pid into the reply so a test can
// tell process reuse from a respawn without OS-level probing.
const FAKE_CLAUDE = `#!/usr/bin/env node
// Like the real CLI, a --fork-session run mints a NEW session id.
const SID = process.argv.includes('--fork-session') ? 'sess-fork-' + process.pid : (process.env.FAKE_SESSION_ID || 'sess-warm-1');
let buf = '';
let turn = 0;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
process.stdin.on('data', (d) => {
  buf += d; const lines = buf.split('\\n'); buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.type !== 'user') continue;
    turn++;
    out({ type: 'system', subtype: 'init', session_id: SID, model: 'fake-model' });
    out({ type: 'stream_event', session_id: SID, event: { type: 'message_start', message: { usage: { input_tokens: 10 } } } });
    out({ type: 'stream_event', session_id: SID, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pid=' + process.pid + ' turn=' + turn } } });
    out({ type: 'result', session_id: SID, result: 'pid=' + process.pid + ' turn=' + turn, usage: { input_tokens: 10, output_tokens: 2 } });
  }
});
process.stdin.on('end', () => process.exit(0));
`;

function ctxCollect(): { ctx: DriverContext; events: DriverEvent[]; abort: AbortController } {
  const abort = new AbortController();

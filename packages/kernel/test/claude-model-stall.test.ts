import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClaudeDriver } from '../src/drivers/claude.js';
import type { AgentTurnInput, DriverContext, DriverEvent } from '../src/contracts/driver.js';

// A fake `claude` CLI whose behaviour after the first user message is chosen by FAKE_MODE:
//   healthy — stream a real reply + result (the model is alive)
//   silent  — emit only `system/init`, then never answer (a severed model connection: the
//             INITIAL model wait that never resolves — the exact "spinner that never ends")
//   apierr  — emit `system/init` + a synthetic API-error assistant message, then go silent
//             (the model is unreachable and the CLI is "retrying" but never recovers)
// In every non-healthy mode it keeps stdin OPEN and stays alive, so the ONLY thing that can
// end the turn is the driver's model-stall watchdog — which is what we are testing.
const FAKE_CLAUDE = `#!/usr/bin/env node
const SID = 'sess-stall-1';
const MODE = process.env.FAKE_MODE || 'healthy';
let buf = '';
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
process.stdin.on('data', (d) => {
  buf += d; const lines = buf.split('\\n'); buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.type !== 'user') continue;
    out({ type: 'system', subtype: 'init', session_id: SID, model: 'fake-model' });
    if (MODE === 'healthy') {
      out({ type: 'stream_event', session_id: SID, event: { type: 'message_start', message: { usage: { input_tokens: 10 } } } });
      out({ type: 'stream_event', session_id: SID, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } } });
      out({ type: 'result', session_id: SID, result: 'answer', usage: { input_tokens: 10, output_tokens: 2 } });
    } else if (MODE === 'apierr') {
      out({ type: 'assistant', session_id: SID, error: 'overloaded_error', message: { model: '<synthetic>', content: [{ type: 'text', text: 'API Error: Unable to connect to API (ConnectionRefused)' }] } });
      // then silent — the watchdog must still fire
    }
    // MODE === 'silent': emit nothing further; stay alive on the open stdin
  }
});
process.stdin.on('end', () => process.exit(0));

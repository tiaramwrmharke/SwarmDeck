import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ClaudeDriver } from '../src/drivers/claude.js';
import { canLeadProcessGroup, reapChild } from '../src/drivers/shared.js';
import type { AgentTurnInput, DriverContext, DriverEvent } from '../src/contracts/driver.js';

// Process-leak regressions for the `claude -p` path. Two defects, both observed in the wild as
// `claude` processes resident for hours at ~400 MB with no session behind them:
//
//  1. A turn that used run_in_background settled through 'quiet-settle', which did NOT park —
//     so it TOOK the session's parked process out of the pool and never put it back. The next
//     turn always cold-spawned (78% of continuations, measured) and the taken process was
//     released unowned with a single fire-and-forget SIGTERM.
//  2. Every teardown site fired at most one signal and dropped its handle, so a CLI that
//     ignored both stdin EOF and SIGTERM could never be killed by anything afterwards.

/** A fake CLI whose turn reports a background task started AND finished, so the driver takes
 *  the 'quiet-settle' branch (sawBackground, pendingBackground 0). Pid-stamped like the
 *  warm-pool fixture so reuse is visible without OS probing. */
const FAKE_BG_CLAUDE = `#!/usr/bin/env node
const SID = process.env.FAKE_SESSION_ID || 'sess-bg-1';
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
    out({ type: 'system', subtype: 'task_started', task_id: 'bg-' + turn, session_id: SID });
    out({ type: 'system', subtype: 'task_notification', task_id: 'bg-' + turn, status: 'completed', session_id: SID });
    out({ type: 'stream_event', session_id: SID, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pid=' + process.pid + ' turn=' + turn } } });
    out({ type: 'result', session_id: SID, result: 'pid=' + process.pid + ' turn=' + turn, usage: { input_tokens: 10, output_tokens: 2 } });
  }
});
process.stdin.on('end', () => process.exit(0));
`;

/** Ignores stdin EOF and SIGTERM entirely, and never emits a `result` — so its turn never
 *  settles. Models a CLI wedged in its post-`result` transcript flush or by an MCP server that
 *  hangs its own shutdown, which is the state only SIGKILL ends. */
const STUBBORN = `#!/usr/bin/env node
require('node:fs').writeFileSync(process.env.PID_FILE, String(process.pid));
process.on('SIGTERM', () => {});
process.stdin.resume();
process.stdin.on('end', () => {});
setInterval(() => {}, 1000);

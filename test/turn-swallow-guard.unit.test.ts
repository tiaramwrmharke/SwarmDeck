import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { writeFileSync, chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeDriver, runTurn } from '../packages/kernel/dist/index.js';
// White-box settle heuristics live at the module path, off the public barrel.
import {
  handleClaudeEvent, claudeTurnEndedDangling,
  claudeTruncatedRecoveryEnabled, CLAUDE_TRUNCATED_RECOVERY_PROMPT,
} from '../packages/kernel/dist/drivers/claude.js';
import { composeKernelFinalPresentation } from '../src/agent/kernel-bridge.js';
import { getSessionMessages } from '../src/agent/index.ts';
import { appendTurnAudit, turnAuditPath } from '../src/core/turn-audit.js';
import { recordDeliveredTurn, loadDeliveredTurns } from '../src/agent/turn-snapshot.ts';
import { withTempHome, makeTmpDir } from './support/env.ts';

// Regression suite for the swallowed-reply family ("吞消息"): a claude turn that ends without
// its closing message must never render as a normal completion.
//  1. driver: an error result with EMPTY errors[] used to settle ok:true — silent.
//  2. driver: a clean result landing on a dangling tool loop (empty final round) used to settle
//     as a plain success; now it self-heals in-process, or settles stopReason 'truncated'.
//  3. bridge: the stalled/truncated note used to show ONLY when the text was empty, so any turn
//     with mid-turn narration swallowed its abnormal ending.
//  4. transcript: the CLI's synthetic resume repair ("No response requested.") was dropped,
//     erasing the only durable marker that a turn was cut off.

// ── driver: pure state helpers ─────────────────────────────────────────────────────────────

describe('claudeTurnEndedDangling', () => {
  it('is false before any tool use, true after a tool_result with no text, false again after text', () => {
    const s: any = { text: '', reasoning: '', streamedText: false, streamedReasoning: false, tools: new Map() };
    const noop = () => {};
    expect(claudeTurnEndedDangling(s)).toBe(false);
    handleClaudeEvent({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } }, s, noop);
    handleClaudeEvent({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }, s, noop);
    expect(claudeTurnEndedDangling(s)).toBe(true);
    handleClaudeEvent({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'done.' } } }, s, noop);
    expect(claudeTurnEndedDangling(s)).toBe(false);
  });

  it('a closing reply delivered only via the result payload also clears the dangling state', () => {
    const s: any = { text: '', reasoning: '', streamedText: false, streamedReasoning: false, tools: new Map() };
    const noop = () => {};
    handleClaudeEvent({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }, s, noop);
    expect(claudeTurnEndedDangling(s)).toBe(true);
    handleClaudeEvent({ type: 'result', subtype: 'success', is_error: false, result: 'final answer' }, s, noop);
    expect(claudeTurnEndedDangling(s)).toBe(false);
    expect(s.text).toBe('final answer');
  });
});

describe('handleClaudeEvent result error derivation', () => {
  const noop = () => {};
  it('derives an error from an is_error result with EMPTY errors[] (used to settle ok silently)', () => {
    const s: any = { text: '', error: null };
    handleClaudeEvent({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: [] }, s, noop);
    expect(s.error).toBeTruthy();
    expect(String(s.error)).toContain('error_during_execution');
  });
  it('prefers the errors[] payload when present', () => {
    const s: any = { text: '', error: null };
    handleClaudeEvent({ type: 'result', is_error: true, errors: ['boom', 'again'] }, s, noop);
    expect(s.error).toBe('boom; again');
  });
  it('treats an error_* subtype as an error even without the is_error flag', () => {
    const s: any = { text: '', error: null };
    handleClaudeEvent({ type: 'result', subtype: 'error_max_turns', errors: [] }, s, noop);
    expect(s.error).toBeTruthy();
    expect(String(s.error)).toContain('error_max_turns');
  });
  it('does not copy an error result payload into the reply text', () => {
    const s: any = { text: '', error: null };
    handleClaudeEvent({ type: 'result', is_error: true, errors: [], result: 'Unable to connect to API' }, s, noop);
    expect(s.text).toBe('');
    expect(String(s.error)).toContain('Unable to connect to API');
  });
});

describe('claudeTruncatedRecoveryEnabled', () => {
  const prev = process.env.PIKILOOM_CLAUDE_TRUNCATED_RECOVERY;
  afterEach(() => {
    if (prev === undefined) delete process.env.PIKILOOM_CLAUDE_TRUNCATED_RECOVERY;
    else process.env.PIKILOOM_CLAUDE_TRUNCATED_RECOVERY = prev;
  });
  it('defaults on; 0/false/off disable it', () => {
    delete process.env.PIKILOOM_CLAUDE_TRUNCATED_RECOVERY;
    expect(claudeTruncatedRecoveryEnabled()).toBe(true);
    for (const v of ['0', 'false', 'off']) {
      process.env.PIKILOOM_CLAUDE_TRUNCATED_RECOVERY = v;
      expect(claudeTruncatedRecoveryEnabled()).toBe(false);
    }
  });
});

// ── driver: integration against a fake claude CLI ──────────────────────────────────────────
// The fake reads stream-json user messages off stdin (like claude -p with stdin held open):
// message #1 runs a tool round then ends the turn WITHOUT a closing reply; what happens next
// is scripted per test via ON_RECOVERY.

function writeFakeClaude(onRecovery: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'kernel-truncated-'));
  const bin = join(dir, 'fake-claude.mjs');
  writeFileSync(bin, `#!/usr/bin/env node
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
emit({ type: 'system', subtype: 'init', session_id: 'sess-truncated', model: 'claude-opus-4-8' });
let msgCount = 0;
let buf = '';
process.stdin.on('data', (c) => {
  buf += c.toString();
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg?.type !== 'user') continue;
    msgCount++;
    if (msgCount === 1) {
      emit({ type: 'stream_event', event: { type: 'message_start', message: { usage: { input_tokens: 10 } } } });
      emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Enabling the setting now:' } } });
      emit({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'gh api -X PATCH' } }], stop_reason: 'tool_use' } });
      emit({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'true' }] } });
      // The model's closing round comes back EMPTY — the swallowed-reply shape.
      emit({ type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn' });
    } else {
      ONRECOVERY(msg);
    }
  }
});
function ONRECOVERY(msg) {
${onRecovery}
}
process.stdin.on('end', () => process.exit(0));
process.stdin.on('close', () => process.exit(0));
`);
  chmodSync(bin, 0o755);
  return bin;
}

describe('truncated-turn self-heal (integration)', () => {

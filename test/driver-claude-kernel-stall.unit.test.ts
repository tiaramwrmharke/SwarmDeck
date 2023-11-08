import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeDriver, runTurn } from '../packages/kernel/dist/index.js';
// White-box settle heuristics live at the module path, off the public barrel.
import { claudeModelStallMs, claudeUserEventHasToolResult } from '../packages/kernel/dist/drivers/claude.js';

// Regression: the kernel claude driver settled a turn ONLY on `result`, abort, or process close.
// `claude -p` (stdin kept open) emits exactly one `result` at end_turn and otherwise stays alive,
// so if the model went silent AFTER a tool_result (a provider stall / rate-limit backoff) the turn
// hung forever — the tools finished but the answer was never delivered ("结果被吞掉了"). The driver
// now arms a post-tool stall watchdog: armed on a tool_result with no background pending, cleared
// the moment the model streams anything, and — if it fires — settles the turn as an INCOMPLETE
// 'stalled' result instead of hanging. It must NEVER arm while a tool or background task is still
// running (those legitimately produce no stream events), which is why arming keys off tool_result.

describe('claudeUserEventHasToolResult', () => {
  it('is true for a user event carrying a tool_result block', () => {
    expect(claudeUserEventHasToolResult({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] },
    })).toBe(true);
  });
  it('is false for a plain user text turn (no control handed back to the model)', () => {
    expect(claudeUserEventHasToolResult({
      type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    })).toBe(false);
  });
  it('is false for malformed / non-array content', () => {
    expect(claudeUserEventHasToolResult({ type: 'user', message: { role: 'user', content: 'hi' } })).toBe(false);
    expect(claudeUserEventHasToolResult({})).toBe(false);
    expect(claudeUserEventHasToolResult(null)).toBe(false);
  });
});

describe('claudeModelStallMs', () => {
  const prev = process.env.PIKILOOM_CLAUDE_MODEL_STALL_MS;
  afterEach(() => {
    if (prev === undefined) delete process.env.PIKILOOM_CLAUDE_MODEL_STALL_MS;
    else process.env.PIKILOOM_CLAUDE_MODEL_STALL_MS = prev;
  });
  // Subscription accounts stream nothing during extended thinking, and at the reasoning rungs a
  // legitimate silent think regularly exceeds 2 minutes — the old 120s default settled LIVE turns
  // as 'stalled' and the leak-guard then killed their still-running tools (mirasim#111). The
  // window is now effort-laddered and errs long (a hung turn showing its spinner longer is the
  // cheap side of the asymmetry).
  it('defaults to 5min for light rungs and 10min for deep-reasoning rungs', () => {
    delete process.env.PIKILOOM_CLAUDE_MODEL_STALL_MS;
    expect(claudeModelStallMs()).toBe(300_000);
    expect(claudeModelStallMs('low')).toBe(300_000);
    expect(claudeModelStallMs('medium')).toBe(300_000);
    for (const effort of ['high', 'xhigh', 'max', 'ultra']) expect(claudeModelStallMs(effort)).toBe(600_000);
  });
  it('honors a positive env override regardless of effort', () => {
    process.env.PIKILOOM_CLAUDE_MODEL_STALL_MS = '5000';

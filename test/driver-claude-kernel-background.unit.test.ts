import { describe, it, expect, afterEach } from 'vitest';
// White-box settle heuristics live at the module path, off the public barrel.
import {
  isTerminalTaskStatus, trackClaudeBackgroundTask, pendingClaudeBackgroundTasks,
  markClaudeTaskNotificationTerminal,
  decideClaudeResultSettle, claudeBgHoldCapMs, claudeBgSettleQuietMs,
} from '../packages/kernel/dist/drivers/claude.js';

// Regression: the kernel claude driver used to end the turn (and hard-SIGTERM the process) at the
// first `result`. But `claude -p`, with stdin kept open, launches detached background work, ends a
// turn with `result`, then wakes itself up to report when the work finishes. Killing on the first
// `result` destroyed the background work and the wake-up (and showed "(no output)"). The driver now
// tracks the run_in_background lifecycle (task_started → terminal task_updated/task_notification)
// and HOLDS the turn while any task is pending, settling on the wake-up's result. These are the pure
// pieces of that decision. Event shapes below are taken verbatim from claude 2.1.196 stream-json.

function freshState() { return { bgStarted: new Set<string>(), bgTerminal: new Set<string>() }; }
function feed(s: any, ...events: any[]) { for (const ev of events) trackClaudeBackgroundTask(ev, s); }

describe('isTerminalTaskStatus', () => {
  it('treats finished/aborted statuses as terminal', () => {
    for (const s of ['completed', 'complete', 'done', 'success', 'succeeded', 'killed', 'failed',
      'fail', 'error', 'stopped', 'stop', 'cancelled', 'canceled', 'aborted', 'timed_out', 'timedout', 'timeout']) {
      expect(isTerminalTaskStatus(s), s).toBe(true);
    }
    expect(isTerminalTaskStatus('COMPLETED')).toBe(true); // case-insensitive
  });
  it('treats in-flight / unknown statuses as NOT terminal', () => {
    for (const s of ['running', 'in_progress', 'pending', 'queued', 'started', 'requesting', '', null, undefined]) {
      expect(isTerminalTaskStatus(s as any), String(s)).toBe(false);
    }
  });
});

describe('background task tracking (trackClaudeBackgroundTask + pendingClaudeBackgroundTasks)', () => {
  it('counts a task pending from task_started', () => {
    const s = freshState();
    feed(s, { type: 'system', subtype: 'task_started', task_id: 't1', tool_use_id: 'toolu_a', description: 'Sleep' });
    expect(pendingClaudeBackgroundTasks(s)).toBe(1);
  });

  it('clears pending on a terminal task_updated', () => {
    const s = freshState();
    feed(s,
      { type: 'system', subtype: 'task_started', task_id: 'blrb1jxuz', tool_use_id: 'toolu_a' },
      { type: 'system', subtype: 'task_updated', task_id: 'blrb1jxuz', patch: { status: 'completed' } });
    expect(pendingClaudeBackgroundTasks(s)).toBe(0);
  });

  it('clears pending on a terminal task_notification', () => {
    const s = freshState();
    feed(s,
      { type: 'system', subtype: 'task_started', task_id: 'bna8ekfwh', tool_use_id: 'toolu_b' },
      { type: 'system', subtype: 'task_notification', task_id: 'bna8ekfwh', status: 'stopped', output_file: '' });
    expect(pendingClaudeBackgroundTasks(s)).toBe(0);
  });

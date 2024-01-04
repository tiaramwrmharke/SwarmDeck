import { describe, it, expect } from 'vitest';
import { handleClaudeEvent, todoWriteToPlan } from '../src/drivers/claude.js';
import type { DriverEvent } from '../src/contracts/driver.js';

function run(events: any[]): DriverEvent[] {
  const out: DriverEvent[] = [];
  const s: any = { text: '', reasoning: '', streamedText: false, sessionId: null, input: null, output: null, cached: null };
  for (const ev of events) handleClaudeEvent(ev, s, (e) => out.push(e));
  return out;
}

describe('claude stream-json parser (kernel ClaudeDriver parity)', () => {
  it('extracts a UniversalPlan from a TodoWrite tool_use (status mapping)', () => {
    const events = run([
      { type: 'assistant', message: { content: [
        { type: 'tool_use', id: 'tw1', name: 'TodoWrite', input: { todos: [
          { content: 'design', status: 'completed' },
          { content: 'implement', status: 'in_progress' },
          { content: 'verify', status: 'pending' },
          { content: '', status: 'pending' }, // skipped (empty)
        ] } },
      ] } },
    ]);
    const planEv = events.find(e => e.type === 'plan');
    expect(planEv, 'a plan event should be emitted').toBeTruthy();
    const plan = (planEv as any).plan;
    expect(plan.steps).toEqual([
      { text: 'design', status: 'completed' },
      { text: 'implement', status: 'inProgress' },
      { text: 'verify', status: 'pending' },
    ]);
    // The command itself surfaces as an Activity row (matching the CLI's own transcript).
    const toolEv = events.find(e => e.type === 'tool' && (e as any).call.name === 'TodoWrite') as any;
    expect(toolEv, 'TodoWrite should surface as an Activity tool row').toBeTruthy();
    expect(toolEv.call.summary).toBe('Update plan');
  });

  it('emits tool events for non-TodoWrite tool_use', () => {
    const events = run([
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: {} }] } },
    ]);
    const tool = events.find(e => e.type === 'tool') as any;
    expect(tool.call).toMatchObject({ id: 'r1', name: 'Read', status: 'running' });
  });

  it('surfaces a compact_boundary system event as a compaction (auto vs manual)', () => {
    const auto = run([{ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 123456 } }]);
    expect(auto.find(e => e.type === 'compaction')).toMatchObject({ type: 'compaction', trigger: 'auto', atTokens: 123456 });

    const manual = run([{ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual' } }]);
    expect(manual.find(e => e.type === 'compaction')).toMatchObject({ type: 'compaction', trigger: 'manual', atTokens: null });

    // A non-boundary system event (e.g. thinking_tokens) emits no compaction.
    const none = run([{ type: 'system', subtype: 'thinking_tokens' }]);
    expect(none.find(e => e.type === 'compaction')).toBeUndefined();
  });

  it('builds a UniversalPlan from TaskCreate/TaskUpdate (current Claude task-list mechanism)', () => {
    const events = run([
      // Two TaskCreate tool_uses (subjects), then their results assign ids "1" and "2".
      { type: 'assistant', message: { content: [
        { type: 'tool_use', id: 'tc1', name: 'TaskCreate', input: { subject: 'design API' } },
        { type: 'tool_use', id: 'tc2', name: 'TaskCreate', input: { subject: 'write tests' } },
      ] } },
      { type: 'user', toolUseResult: { task: { id: '1' } }, message: { content: [{ type: 'tool_result', tool_use_id: 'tc1', content: 'Task #1 created' }] } },
      { type: 'user', toolUseResult: { task: { id: '2' } }, message: { content: [{ type: 'tool_result', tool_use_id: 'tc2', content: 'Task #2 created' }] } },
      // Flip task 1 to in_progress, then completed.
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' } }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu2', name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }] } },
    ]);
    const planEvents = events.filter(e => e.type === 'plan') as any[];
    expect(planEvents.length, 'plan events should be emitted as tasks change').toBeGreaterThan(0);
    // The latest plan reflects task 1 completed, task 2 still pending — keyed by `text` (kernel shape).
    expect(planEvents[planEvents.length - 1].plan.steps).toEqual([
      { text: 'design API', status: 'completed' },
      { text: 'write tests', status: 'pending' },
    ]);
    // The commands surface as Activity rows too (matching the CLI's own transcript).
    const createRow = events.find(e => e.type === 'tool' && (e as any).call.name === 'TaskCreate') as any;
    expect(createRow.call.summary).toBe('Create task: design API');
    const updateRow = events.find(e => e.type === 'tool' && (e as any).call.name === 'TaskUpdate') as any;
    expect(updateRow.call.summary).toBe('Update task 1 → in_progress');
    // TaskCreate results close their Activity row.
    expect(events.some(e => e.type === 'tool' && (e as any).call.id === 'tc1' && (e as any).call.status === 'done')).toBe(true);
  });

  it('chronological: a TaskUpdate AFTER a TodoWrite still applies — store id first', () => {
    const events = run([
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tc1', name: 'TaskCreate', input: { subject: 'store task' } }] } },
      { type: 'user', toolUseResult: { task: { id: '1' } }, message: { content: [{ type: 'tool_result', tool_use_id: 'tc1', content: 'Task #1' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tw1', name: 'TodoWrite', input: { todos: [
        { content: 'fresh todo', status: 'in_progress' },
      ] } }] } },
      // The update's id lives in the TaskCreate store → the plan reflects the store AFTER it.
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }] } },
    ]);
    const planEvents = events.filter(e => e.type === 'plan') as any[];
    expect(planEvents[planEvents.length - 1].plan.steps).toEqual([
      { text: 'store task', status: 'completed' },
    ]);
  });

  it('chronological: a TaskUpdate with an unknown id lands positionally on the latest TodoWrite list', () => {

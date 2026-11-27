import { describe, it, expect } from 'vitest';
import { toHelioPlan } from '../src/agent/kernel-bridge.js';

// Regression: the kernel emits plan steps keyed { text }, but helio's StreamPlan and the whole
// dashboard pipeline (pikichannel adapter -> ws.ts -> PlanProgressCard) key them { step }. The
// bridge must translate at the seam, else the task list renders the progress count but blank rows
// (the codex "0/4 项任务已完成" with empty dots bug).
describe('kernel-bridge toHelioPlan (text -> step)', () => {
  it('maps kernel { text } plan steps to helio { step }', () => {
    const out = toHelioPlan({
      explanation: 'doing work',
      steps: [
        { text: 'read code', status: 'completed' },
        { text: 'apply fix', status: 'inProgress' },
        { text: 'verify', status: 'pending' },
      ],
    });
    expect(out).toEqual({
      explanation: 'doing work',
      steps: [
        { step: 'read code', status: 'completed' },
        { step: 'apply fix', status: 'inProgress' },
        { step: 'verify', status: 'pending' },
      ],
    });
  });

  it('drops empty-text steps and normalizes unknown status to pending', () => {
    const out = toHelioPlan({
      explanation: null,
      steps: [
        { text: 'keep', status: 'weird' },
        { text: '   ', status: 'completed' },
        { text: '', status: 'pending' },
      ],
    });
    expect(out).toEqual({ explanation: null, steps: [{ step: 'keep', status: 'pending' }] });
  });

  it('returns null for missing / empty / all-blank plans', () => {
    expect(toHelioPlan(null)).toBeNull();
    expect(toHelioPlan({ steps: [] })).toBeNull();
    expect(toHelioPlan({ steps: [{ text: '  ', status: 'pending' }] })).toBeNull();
    expect(toHelioPlan({})).toBeNull();
  });

  it('accepts an already-helio-shaped { step } plan idempotently', () => {
    const out = toHelioPlan({ explanation: null, steps: [{ step: 'already', status: 'completed' }] });
    expect(out).toEqual({ explanation: null, steps: [{ step: 'already', status: 'completed' }] });
  });
});

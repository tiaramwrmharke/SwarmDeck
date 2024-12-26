import { describe, it, expect } from 'vitest';
import { toSwarmDeckPlan } from '../src/agent/kernel-bridge.js';

// Regression: the kernel emits plan steps keyed { text }, but swarmdeck's StreamPlan and the whole
// dashboard pipeline (pikichannel adapter -> ws.ts -> PlanProgressCard) key them { step }. The
// bridge must translate at the seam, else the task list renders the progress count but blank rows
// (the codex "0/4 项任务已完成" with empty dots bug).
describe('kernel-bridge toSwarmDeckPlan (text -> step)', () => {
  it('maps kernel { text } plan steps to swarmdeck { step }', () => {
    const out = toSwarmDeckPlan({
      explanation: 'doing work',
      steps: [
        { text: 'read code', status: 'completed' },
        { text: 'apply fix', status: 'inProgress' },
        { text: 'verify', status: 'pending' },
      ],

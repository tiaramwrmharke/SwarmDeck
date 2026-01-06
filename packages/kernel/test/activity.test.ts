import { describe, it, expect } from 'vitest';
import { projectActivity } from '../src/runtime/session-runner.js';
import type { UniversalSnapshot } from '../src/protocol/index.js';

const snap = (over: Partial<UniversalSnapshot>): UniversalSnapshot => ({ phase: 'streaming', updatedAt: 0, ...over });

describe('projectActivity (kernel activity-line contract)', () => {
  it('renders one line per tool call with a status suffix', () => {
    const out = projectActivity(snap({ toolCalls: [
      { id: '1', name: 'Read', summary: 'Read foo.ts', status: 'running' },
      { id: '2', name: 'Edit', summary: 'Edit bar.ts', status: 'done' },
      { id: '3', name: 'Bash', summary: 'Run shell: npm test', status: 'done', result: '12 passing' },
      { id: '4', name: 'Grep', summary: 'Search text: TODO', status: 'failed', result: 'no matches' },
    ] }));
    expect(out.split('\n')).toEqual([

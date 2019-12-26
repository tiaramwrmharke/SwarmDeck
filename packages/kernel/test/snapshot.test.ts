import { describe, it, expect } from 'vitest';
import { diffSnapshot, applySnapshotPatch, emptySnapshot, type UniversalSnapshot } from '../src/protocol/index.js';

describe('snapshot diff/apply', () => {
  it('round-trips append + scalar + struct changes', () => {
    const a: UniversalSnapshot = { phase: 'streaming', text: 'Hello', updatedAt: 1, toolCalls: [] };
    const b: UniversalSnapshot = { phase: 'streaming', text: 'Hello world', updatedAt: 2, toolCalls: [{ id: 't1', name: 'x', summary: 'x', status: 'running' }] };
    const patch = diffSnapshot(a, b);
    expect(patch.appendText).toBe(' world');               // prefix-append, not full resend
    const applied = applySnapshotPatch(a, patch);
    expect(applied.text).toBe('Hello world');
    expect(applied.toolCalls?.[0].id).toBe('t1');
    expect(applied.phase).toBe('streaming');
    expect(applied.updatedAt).toBe(2);
  });

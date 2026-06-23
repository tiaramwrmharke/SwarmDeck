import { describe, expect, it } from 'vitest';
import {
  snapshotGate,
  nextAppliedUpdatedAt,
  filterTombstonedIds,
  pruneTombstones,
  type SnapshotGateInput,
} from '../dashboard/src/pages/sessions/stream-reconcile';

const base: SnapshotGateInput = {
  updatedAt: 100,
  isNull: false,
  source: 'ws',
  lastAppliedUpdatedAt: 0,
  localStreamPending: false,
  holdsActiveState: false,
};

describe('snapshotGate — monotonic version guard', () => {
  it('applies the first snapshot for a fresh session', () => {
    expect(snapshotGate({ ...base, updatedAt: 100, lastAppliedUpdatedAt: 0 })).toBe('apply');
  });

  it('applies a newer snapshot', () => {
    expect(snapshotGate({ ...base, updatedAt: 200, lastAppliedUpdatedAt: 100 })).toBe('apply');
  });

  it('re-applies an equal snapshot (idempotent, WS ordering protects us)', () => {
    expect(snapshotGate({ ...base, updatedAt: 100, lastAppliedUpdatedAt: 100 })).toBe('apply');
  });

  it('rejects an older snapshot regardless of source (stale REST clobber)', () => {
    expect(snapshotGate({ ...base, source: 'seed', updatedAt: 90, lastAppliedUpdatedAt: 100 })).toBe('reject-stale');
    expect(snapshotGate({ ...base, source: 'ws', updatedAt: 90, lastAppliedUpdatedAt: 100 })).toBe('reject-stale');
  });
});

describe('snapshotGate — null is "no info"', () => {
  it('rejects a null while a local send is in flight (symptom: just-sent swallowed)', () => {
    expect(snapshotGate({ ...base, isNull: true, localStreamPending: true })).toBe('reject-null');
  });

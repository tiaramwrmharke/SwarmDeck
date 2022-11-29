import { describe, expect, it } from 'vitest';
import {
  applyLiveSessionState,
  normalizeLiveSessionState,
  sessionDisplayState,
} from '../dashboard/src/utils.ts';

describe('dashboard live session state helpers', () => {
  it('normalizes snapshots, maps phases to UI states, and handles incomplete done', () => {
    const live = normalizeLiveSessionState('codex:pending_123', {
      phase: 'streaming',
      sessionId: 'native-456',
      updatedAt: 123,
    });
    expect(live).toEqual({
      key: 'codex:pending_123',
      resolvedKey: 'codex:native-456',
      phase: 'streaming',
      sessionId: 'native-456',
      updatedAt: 123,
      incomplete: false,
      error: null,
    });

    const base1 = {
      sessionId: 'sess-1',
      agent: 'codex',
      runState: 'completed' as const,
      running: false,
      runUpdatedAt: null,
      runDetail: 'old detail',

import { describe, expect, it } from 'vitest';
import {
  isRemovableWorkspacePath,
  projectSessionForList,
  projectWorkspacesForDashboard,
} from '../src/dashboard/routes/sessions.ts';
import type { SessionInfo } from '../src/agent/types.ts';

const CAP = 2048;

function makeSession(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    sessionId: 's1', agent: 'claude', workdir: '/w', workspacePath: '/w',
    model: 'claude-opus-4-8', createdAt: '2026-06-20T00:00:00Z', title: 'Title',
    running: false, runState: 'completed', runDetail: null, runUpdatedAt: null,
    classification: null, userStatus: 'active', userNote: null,
    lastQuestion: null, lastAnswer: null, lastMessageText: null,
    migratedFrom: null, migratedTo: null, linkedSessions: [], numTurns: 3,
    ...overrides,
  } as SessionInfo;
}

describe('projectSessionForList', () => {
  it('caps oversized preview fields to the preview length', () => {
    const huge = 'x'.repeat(50_000);
    const out = projectSessionForList(makeSession({
      lastQuestion: huge, lastAnswer: huge, lastMessageText: huge, runDetail: huge,
    }) as any);
    expect(out.lastQuestion!.length).toBe(CAP);
    expect(out.lastAnswer!.length).toBe(CAP);
    expect(out.lastMessageText!.length).toBe(CAP);

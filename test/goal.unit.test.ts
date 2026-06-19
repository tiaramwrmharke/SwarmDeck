import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  setGoal, readGoal, pauseGoal, resumeGoal, completeGoal, clearGoal,
  accountTurn, bumpContinuationCount, shouldContinueAfterTurn,
  renderContinuationPrompt, renderBudgetLimitPrompt, sessionGoalPath,
  DEFAULT_MAX_CONTINUATIONS,
} from '../src/agent/goal.ts';
import { makeTmpDir } from './support/env.ts';

const AGENT = 'claude' as const;

let workdir: string;
const sid = 'session_test_001';

beforeEach(() => {
  workdir = makeTmpDir('swarmdeck-goal-');
});

afterEach(() => {
  try { fs.rmSync(workdir, { recursive: true, force: true }); } catch {}
});

describe('goal state CRUD and accountTurn budget enforcement', () => {
  it('persists/validates goal lifecycle and enforces token budgets', () => {
    {
      const goal = setGoal(workdir, AGENT, sid, { objective: 'migrate to v2' });
      expect(goal.objective).toBe('migrate to v2');
      expect(goal.status).toBe('active');
      expect(goal.continuationCount).toBe(0);
      expect(fs.existsSync(sessionGoalPath(workdir, AGENT, sid))).toBe(true);
      const onDisk = readGoal(workdir, AGENT, sid);
      expect(onDisk?.goalId).toBe(goal.goalId);
    }

    expect(() => setGoal(workdir, AGENT, sid, { objective: '   ' })).toThrow();
    expect(() => setGoal(workdir, AGENT, sid, { objective: 'x', tokenBudget: 0 })).toThrow();

    setGoal(workdir, AGENT, sid, { objective: 'do thing' });
    expect(pauseGoal(workdir, AGENT, sid)?.status).toBe('paused');
    expect(resumeGoal(workdir, AGENT, sid)?.status).toBe('active');
    expect(completeGoal(workdir, AGENT, sid)?.status).toBe('complete');
    clearGoal(workdir, AGENT, sid);
    expect(readGoal(workdir, AGENT, sid)).toBeNull();

    setGoal(workdir, AGENT, sid, { objective: 'x' });

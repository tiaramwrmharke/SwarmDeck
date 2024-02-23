import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Agent } from './types.js';

export type GoalStatus = 'active' | 'paused' | 'budget_limited' | 'complete';

export interface ThreadGoal {
  goalId: string;
  objective: string;
  status: GoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  continuationCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: number;
}

const GOAL_FILE = 'goal.json';
const MAX_OBJECTIVE_CHARS = 4000;

export const DEFAULT_MAX_CONTINUATIONS = 50;

export function sessionGoalPath(workdir: string, agent: Agent, sessionId: string): string {
  return path.join(workdir, '.swarmdeck', 'sessions', agent, sessionId, GOAL_FILE);
}

export function readGoal(workdir: string, agent: Agent, sessionId: string): ThreadGoal | null {
  const file = sessionGoalPath(workdir, agent, sessionId);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return normalize(raw);
  } catch {
    return null;
  }
}

export function writeGoal(workdir: string, agent: Agent, sessionId: string, goal: ThreadGoal): ThreadGoal {
  const file = sessionGoalPath(workdir, agent, sessionId);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const next: ThreadGoal = { ...goal, updatedAt: new Date().toISOString() };
  const tmp = `${file}.tmp-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, file);
  return next;
}

export function clearGoal(workdir: string, agent: Agent, sessionId: string): void {
  const file = sessionGoalPath(workdir, agent, sessionId);
  try { fs.rmSync(file, { force: true }); } catch {}
}

export function setGoal(
  workdir: string,
  agent: Agent,
  sessionId: string,
  opts: { objective: string; tokenBudget?: number | null },
): ThreadGoal {
  const objective = sanitizeObjective(opts.objective);
  if (!objective) throw new Error('objective must be non-empty');
  if (objective.length > MAX_OBJECTIVE_CHARS) {
    throw new Error(`objective must be ≤ ${MAX_OBJECTIVE_CHARS} characters`);
  }
  const tokenBudget = normalizeBudget(opts.tokenBudget ?? null);
  const now = new Date().toISOString();
  const goal: ThreadGoal = {
    goalId: `goal_${crypto.randomBytes(6).toString('hex')}`,
    objective,
    status: 'active',
    tokenBudget,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationCount: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: Date.now(),
  };

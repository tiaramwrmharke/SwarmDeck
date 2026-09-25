import { isRunningSessionStale } from '../agent/index.js';
import type { Bot, ChatState, SessionInfo, SessionRuntime } from './bot.js';

type SessionLookupBot = Pick<Bot, 'sessionStates'>;
type SessionLookupChat = Pick<ChatState, 'agent' | 'sessionId' | 'activeSessionKey'>;
type SessionLookupRuntimeBot = Pick<Bot, 'sessionStates' | 'chats'>;
type SessionLookupInfo = Pick<SessionInfo, 'agent' | 'sessionId' | 'running' | 'runState' | 'runUpdatedAt' | 'runPid'>;

const STALE_RUNNING_AGE_MS = 30 * 60_000;

export interface SessionStatusResult {
  runtime: SessionRuntime | null;
  isCurrent: boolean;
  isRunning: boolean;
  isStale: boolean;
}

function getSessionRuntime(bot: SessionLookupBot, session: SessionLookupInfo): SessionRuntime | null {
  const sessionId = session.sessionId || null;
  if (!sessionId) return null;
  return bot.sessionStates.get(`${session.agent}:${sessionId}`) || null;
}

function resolveIsRunning(session: SessionLookupInfo, runtime: SessionRuntime | null): { isRunning: boolean; isStale: boolean } {
  if (runtime?.runningTaskIds.size) return { isRunning: true, isStale: false };
  if (!session.running) return { isRunning: false, isStale: false };
  const stale = isRunningSessionStale(
    {
      runState: session.runState ?? 'running',
      runPid: session.runPid ?? null,

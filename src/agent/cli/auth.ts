import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { detectCli, invalidateCliStatus, currentPlatform, type CliStatus } from './detector.js';
import { getRecommendedCli, type RecommendedCli } from './registry.js';

export type AuthSessionEvent =
  | { type: 'output'; chunk: string }
  | { type: 'status'; status: CliStatus }
  | { type: 'error'; message: string }
  | { type: 'done'; ok: boolean; exitCode: number | null };

export interface AuthSession {
  sessionId: string;
  cliId: string;
  startedAt: number;
  events: EventEmitter;
  done: boolean;
  ok: boolean;
  exitCode: number | null;
  backlog: string[];
}

const SESSIONS = new Map<string, AuthSession>();
const MAX_SESSION_AGE_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const BACKLOG_LINES = 200;

function reapExpiredSessions(): void {
  const now = Date.now();
  for (const [id, s] of SESSIONS) {
    if (s.done && now - s.startedAt > MAX_SESSION_AGE_MS) SESSIONS.delete(id);
  }
}

export function getAuthSession(sessionId: string): AuthSession | undefined {
  reapExpiredSessions();
  return SESSIONS.get(sessionId);
}

export function cancelAuthSession(sessionId: string): boolean {
  const s = SESSIONS.get(sessionId);
  if (!s || s.done) return false;
  (s as any)._child?.kill?.('SIGTERM');
  return true;
}

export interface StartAuthSessionResult {
  ok: true;
  sessionId: string;
}

interface StreamingSessionOpts {
  cli: RecommendedCli;
  argv: string[];
  env: NodeJS.ProcessEnv;
  shell?: boolean;
  pollUntilReady: boolean;
  computeOk: (exitCode: number | null, finalStatus: CliStatus | undefined) => boolean;
}

function startStreamingSession(opts: StreamingSessionOpts): StartAuthSessionResult {
  const { cli, argv, env, shell, pollUntilReady, computeOk } = opts;
  const sessionId = randomUUID();
  const events = new EventEmitter();
  events.setMaxListeners(0);

  const session: AuthSession & { _child?: ChildProcess } = {
    sessionId,
    cliId: cli.id,
    startedAt: Date.now(),
    events,
    done: false,
    ok: false,
    exitCode: null,

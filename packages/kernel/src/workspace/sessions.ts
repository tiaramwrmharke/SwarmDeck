import path from 'node:path';
import type { AgentDriver, NativeSessionInfo } from '../contracts/driver.js';
import type { SessionStore, CoreSessionRecord } from '../contracts/ports.js';
import { makeSessionKey, splitSessionKey } from '../protocol/index.js';
import type { LoomScope } from './paths.js';

// ---- SessionsManager: the unified, searchable session read-model ----
//
// Merges the kernel's MANAGED sessions (SessionStore, scoped per workspace by the cwd they
// ran in) with each agent's NATIVE sessions (driver.listNativeSessions) into one list. This
// is the "全局控制会话列表 + 每个工作区下的会话列表" capability: a global view (all managed,
// any workdir) and a per-workspace view (this folder's managed + the agents' own sessions
// for this folder), plus search across both — all owned by the kernel.

export type SessionSource = 'managed' | 'native';

export interface ManagedSessionInfo {
  sessionKey: string;          // `${agent}:${sessionId}`
  agent: string;
  sessionId: string;
  title: string | null;
  preview: string | null;
  workdir: string | null;
  model: string | null;
  effort: string | null;
  runState: 'running' | 'completed' | 'incomplete' | null;
  running: boolean;
  source: SessionSource;
  createdAt: string | null;
  updatedAt: string | null;
  messageCount?: number | null;
  /** Fork lineage when this session was branched off another (see CoreSessionRecord.forkedFrom). */
  forkedFrom?: { sessionKey: string; taskId?: string | null } | null;
}

export interface ListSessionsOptions {
  /**

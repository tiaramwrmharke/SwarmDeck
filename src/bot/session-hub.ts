import path from 'node:path';
import {
  getSessions as _getSessions,
  getSessionTail as _getSessionTail,
  getSessionMessages as _getSessionMessages,
  classifySession as _classifySession,
  deriveUserStatus as _deriveStatusFromOutcome,
  exportSession as _exportSession,
  importSession as _importSession,
  findSwarmDeckSession,
  updateSessionMeta, resolveCanonicalSessionId, getSessionPromotions,
  deleteAgentSession as _deleteAgentSession,
  type DeleteAgentSessionOpts, type DeleteAgentSessionResult,
  collapseSkillPrompt,
  type Agent, type SessionInfo, type SessionListResult,
  type SessionTailResult, type SessionTailOpts,
  type SessionMessagesOpts, type SessionMessagesResult,
  type SessionClassification, type TailMessage, type RichMessage, type MessageBlock, type StreamResult,
  type ExportSessionOpts, type ExportSessionResult,
  type ImportSessionOpts, type ImportSessionResult,
  type MigrateSessionOpts, type SessionRunState,
} from '../agent/index.js';
import { allDriverIds, hasDriver } from '../agent/driver.js';
import {
  loadWorkspaces, addWorkspace, removeWorkspace, renameWorkspace,
  reorderWorkspaces, updateWorkspace, findWorkspace,
  type WorkspaceEntry,
} from '../core/config/user-config.js';

export type UserStatus = 'inbox' | 'active' | 'review' | 'done' | 'parked';

export interface SessionQueryOpts {
  workdir: string;
  agent?: Agent | Agent[];
  limit?: number;
  userStatus?: UserStatus[];
}

export interface SessionQueryResult {
  ok: boolean;
  workdir: string;
  workspaceName: string;
  sessions: WorkspaceSessionInfo[];
  statusCounts: Record<UserStatus | 'unknown', number>;
  total: number;
  errors: string[];
  promotions: Record<string, string>;
}

export interface WorkspaceSessionInfo extends SessionInfo {
  workspaceName: string;
}

export interface WorkspaceOverview {
  workspace: WorkspaceEntry;
  attentionCount: number;
  agentSummary: Array<{ agent: string; active: number; review: number; total: number }>;
  lastActivityAt: string | null;
}

export interface SessionPatch {
  userStatus?: UserStatus | null;
  userNote?: string | null;
  classification?: SessionClassification;
  migratedFrom?: { agent: Agent; sessionId: string };
  migratedTo?: { agent: Agent; sessionId: string };
  addLink?: { agent: Agent; sessionId: string };
}

export interface MigrateResult {
  ok: boolean;
  contextInjected: string;
  messageCount: number;
  error: string | null;
}

export type {
  Agent, SessionInfo, SessionClassification, TailMessage, RichMessage, MessageBlock,
  SessionTailResult, SessionMessagesOpts, SessionMessagesResult,
  ExportSessionOpts, ExportSessionResult, ImportSessionOpts, ImportSessionResult,
  MigrateSessionOpts, WorkspaceEntry, SessionListResult, SessionRunState,
};

export function resolveUserStatus(session: Pick<SessionInfo, 'userStatus' | 'classification'>): UserStatus {
  if (session.userStatus) return session.userStatus as UserStatus;
  if (session.classification) return _deriveStatusFromOutcome(session.classification.outcome);
  return 'inbox';
}

function normalizeAgents(agent?: Agent | Agent[]): Agent[] {
  if (!agent) return allDriverIds().filter(a => hasDriver(a));
  const list = Array.isArray(agent) ? agent : [agent];
  return list.filter(a => hasDriver(a));
}

export async function querySessions(opts: SessionQueryOpts): Promise<SessionQueryResult> {
  const resolvedWorkdir = path.resolve(opts.workdir);
  const ws = findWorkspace(resolvedWorkdir);
  const workspaceName = ws?.name || path.basename(resolvedWorkdir);
  const agents = normalizeAgents(opts.agent);

  const results = await Promise.all(
    agents.map(agent =>
      _getSessions({ agent, workdir: resolvedWorkdir }).catch((): SessionListResult => ({
        ok: false, sessions: [], error: `Failed to fetch ${agent} sessions`,
      })),
    ),
  );

  let allSessions: WorkspaceSessionInfo[] = [];
  const errors: string[] = [];
  let anyOk = false;

  for (const result of results) {
    if (result.ok) anyOk = true;
    if (result.error) errors.push(result.error);

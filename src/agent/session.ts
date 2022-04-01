import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ManagedSessionRecord,
  SessionRunState,
  SessionClassification,
  SessionInfo,
  StreamResult,
  StreamPreviewPlan,
  Agent,
  SessionMessagesOpts,
  SessionMessagesResult,
  TailMessage,
  RichMessage,
  ExportSessionOpts,
  ExportSessionResult,
  ImportSessionOpts,
  ImportSessionResult,
  StreamOpts,
  EnsureManagedSessionOpts,
  StageSessionFilesOpts,
  StageSessionFilesResult,
  SessionListOpts,
  SessionListResult,
  SessionTailOpts,
  SessionTailResult,
  SessionMessagesWindow,
  HandoverRef,
} from './types.js';
import {
  dedupeStrings,
  shortValue,
  firstNonEmptyLine,
  normalizeErrorMessage,
  normalizeStreamPreviewPlan,
  isPendingSessionId,
  agentLog,
} from './utils.js';
import { getDriver } from './driver.js';
import { collapseSkillPrompt } from './skills.js';
import { SESSION_RUNNING_THRESHOLD_MS } from '../core/constants.js';

function ensureDir(dirPath: string) { fs.mkdirSync(dirPath, { recursive: true }); }

function readJsonFile<T>(filePath: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T; } catch { return fallback; }
}

function writeJsonFile(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function removeFileIfExists(filePath: string) { try { fs.rmSync(filePath, { force: true }); } catch {} }

function trimSessionText(value: unknown, max = 24_000): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

const PIKILOOM_DIR = '.swarmdeck';
const PIKILOOM_SESSIONS_DIR = path.join(PIKILOOM_DIR, 'sessions');
const PIKILOOM_SESSION_INDEX = path.join(PIKILOOM_SESSIONS_DIR, 'index.json');
const PIKILOOM_LEGACY_WORKSPACES_DIR = path.join(PIKILOOM_DIR, 'workspaces');
const SESSION_WORKSPACE_DIR = 'workspace';
const SESSION_META_FILE = 'session.json';

function sessionIndexPath(workdir: string): string { return path.join(workdir, PIKILOOM_SESSION_INDEX); }
function sessionDirPath(workdir: string, agent: Agent, sessionId: string): string { return path.join(workdir, PIKILOOM_SESSIONS_DIR, agent, sessionId); }
function legacySessionWorkspacePath(workdir: string, agent: Agent, sessionId: string): string { return path.join(workdir, PIKILOOM_LEGACY_WORKSPACES_DIR, agent, sessionId); }
function sessionWorkspacePath(workdir: string, agent: Agent, sessionId: string): string { return path.join(sessionDirPath(workdir, agent, sessionId), SESSION_WORKSPACE_DIR); }
function sessionRootFromWorkspacePath(workspacePath: string): string {
  const resolved = path.resolve(workspacePath);
  return path.basename(resolved) === SESSION_WORKSPACE_DIR ? path.dirname(resolved) : resolved;
}
function sessionMetaPath(workspacePath: string): string { return path.join(sessionRootFromWorkspacePath(workspacePath), SESSION_META_FILE); }
function legacySessionMetaPath(workspacePath: string): string { return path.join(workspacePath, PIKILOOM_DIR, SESSION_META_FILE); }

function nextPendingSessionId(): string { return `pending_${crypto.randomBytes(6).toString('hex')}`; }
function nextThreadId(): string { return `thread_${crypto.randomBytes(6).toString('hex')}`; }
function legacyThreadId(agent: Agent, sessionId: string): string { return `legacy:${agent}:${sessionId}`; }
function normalizeThreadId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeSessionRunState(rawState: unknown): SessionRunState {
  const state = typeof rawState === 'string' ? rawState.trim().toLowerCase() : '';
  if (state === 'completed' || state === 'incomplete' || state === 'running') return state;
  return 'completed';
}

function normalizeSessionRunDetail(_rawState: unknown, rawDetail: unknown): string | null {
  const detail = typeof rawDetail === 'string' ? rawDetail.trim() : '';
  if (detail) return shortValue(detail, 180);
  return null;
}

function normalizeSessionRunUpdatedAt(rawUpdatedAt: unknown, fallback: string): string {
  return typeof rawUpdatedAt === 'string' && rawUpdatedAt.trim() ? rawUpdatedAt : fallback;
}

export function setSessionRunState(record: ManagedSessionRecord, runState: SessionRunState, runDetail: string | null, runUpdatedAt?: string) {
  record.runState = runState;
  record.runDetail = runDetail ? shortValue(runDetail, 180) : null;
  record.runUpdatedAt = runUpdatedAt || new Date().toISOString();
  record.runPid = runState === 'running' ? process.pid : null;
}

function incompleteRunDetail(result: Pick<StreamResult, 'error' | 'stopReason' | 'message'>): string | null {
  if (result.stopReason === 'interrupted') return 'Interrupted by user.';
  if (result.stopReason === 'timeout') return 'Timed out before completion.';
  if (result.stopReason === 'max_tokens') return 'Stopped before completion: max tokens reached.';
  const error = normalizeErrorMessage(result.error);
  if (error) return shortValue(error, 180);
  const stopReason = normalizeErrorMessage(result.stopReason);
  if (stopReason) return `Stopped before completion: ${shortValue(stopReason, 120)}`;
  const message = firstNonEmptyLine(result.message || '');
  return message ? shortValue(message, 180) : 'Last run did not complete.';
}

export function isProcessAlive(pid: number | null | undefined): boolean | null {
  if (!pid || !Number.isFinite(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    if (err?.code === 'ESRCH') return false;
    if (err?.code === 'EPERM') return true;
    return null;
  }
}

export function isRunningSessionStale(
  record: Pick<ManagedSessionRecord, 'runState' | 'runPid' | 'runUpdatedAt'>,
  ageThresholdMs: number,
): boolean {
  if (record.runState !== 'running') return false;
  const alive = isProcessAlive(record.runPid ?? null);
  if (alive === false) return true;
  if (alive === true) return false;
  const age = record.runUpdatedAt ? Date.now() - Date.parse(record.runUpdatedAt) : Infinity;
  return age > ageThresholdMs;
}

export function reconcileOrphanedRunningSessions(workdir: string, ageThresholdMs = 30 * 60_000): number {
  const resolvedWorkdir = path.resolve(workdir);
  const index = loadSessionIndex(resolvedWorkdir);
  const downgraded: ManagedSessionRecord[] = [];
  for (const record of index.sessions) {
    if (!isRunningSessionStale(record, ageThresholdMs)) continue;
    setSessionRunState(record, 'incomplete', 'Process exited before reporting completion.');
    downgraded.push(record);
  }
  if (downgraded.length > 0) {
    writeSessionIndex(resolvedWorkdir, index.sessions);
    for (const record of downgraded) {
      try { writeSessionMeta(record); } catch {}
    }
    agentLog(`[sessions] reconciled ${downgraded.length} orphaned running session(s) in ${resolvedWorkdir}`);
  }
  return downgraded.length;
}

export function applySessionRunResult(
  record: ManagedSessionRecord,
  result: Pick<StreamResult, 'ok' | 'incomplete' | 'error' | 'stopReason' | 'message'> & { activity?: string | null },
) {
  if (result.ok && !result.incomplete) {
    setSessionRunState(record, 'completed', null);
  } else {
    setSessionRunState(record, 'incomplete', incompleteRunDetail(result));
  }

  const classification = classifySession({ ...result, activity: result.activity ?? null });
  record.classification = classification;
  if (!record.userStatus) {
    record.userStatus = deriveUserStatus(classification.outcome);
  }
}

interface SessionIndexData {
  version: number;
  sessions: ManagedSessionRecord[];
  promotions: Record<string, string>;
}

interface EnsureSessionWorkspaceOpts {
  agent: Agent;
  workdir: string;
  sessionId?: string | null;
  title?: string | null;
  threadId?: string | null;
  handoverFrom?: HandoverRef | null;
}

function normalizeHandoverRef(value: unknown): HandoverRef | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { agent?: unknown; sessionId?: unknown };
  const agent = typeof v.agent === 'string' ? v.agent.trim() : '';
  const sessionId = typeof v.sessionId === 'string' ? v.sessionId.trim() : '';
  if (!agent || !sessionId) return null;
  return { agent: agent as Agent, sessionId };
}

interface SessionWorkspaceInfo {
  sessionId: string;
  workspacePath: string;
  record: ManagedSessionRecord;
}

function normalizeSessionRecord(raw: any, workdir: string): ManagedSessionRecord | null {
  const sessionId = typeof raw?.sessionId === 'string' ? raw.sessionId.trim()
    : typeof raw?.engineSessionId === 'string' && raw.engineSessionId.trim() ? raw.engineSessionId.trim()
    : typeof raw?.localSessionId === 'string' ? raw.localSessionId.trim()
    : '';
  const agent = typeof raw?.agent === 'string' ? raw.agent.trim() : null;
  if (!sessionId || !agent) return null;
  const workspacePath = typeof raw?.workspacePath === 'string' && raw.workspacePath.trim()
    ? path.resolve(raw.workspacePath)
    : sessionWorkspacePath(workdir, agent, sessionId);
  return {
    sessionId, agent, workdir,
    workspacePath,
    threadId: normalizeThreadId(raw?.threadId) || legacyThreadId(agent, sessionId),
    createdAt: typeof raw?.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw?.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt : new Date().toISOString(),
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : null,
    model: typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : null,
    thinkingEffort: typeof raw?.thinkingEffort === 'string' && raw.thinkingEffort.trim() ? raw.thinkingEffort.trim() : null,
    workflowEnabled: typeof raw?.workflowEnabled === 'boolean' ? raw.workflowEnabled : null,
    profileId: typeof raw?.profileId === 'string' && raw.profileId.trim() ? raw.profileId.trim() : null,
    accountId: typeof raw?.accountId === 'string' && raw.accountId.trim() ? raw.accountId.trim() : null,
    stagedFiles: Array.isArray(raw?.stagedFiles) ? dedupeStrings(raw.stagedFiles.filter((v: unknown) => typeof v === 'string')) : [],
    lastUserAttachments: Array.isArray(raw?.lastUserAttachments)
      ? dedupeStrings(raw.lastUserAttachments.filter((v: unknown) => typeof v === 'string'))
      : [],
    runState: normalizeSessionRunState(raw?.runState),
    runDetail: normalizeSessionRunDetail(raw?.runState, raw?.runDetail),
    runUpdatedAt: normalizeSessionRunUpdatedAt(raw?.runUpdatedAt, typeof raw?.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt : new Date().toISOString()),
    runPid: typeof raw?.runPid === 'number' && Number.isFinite(raw.runPid) ? raw.runPid : null,
    classification: raw?.classification ?? null,
    userStatus: raw?.userStatus ?? null,
    userNote: typeof raw?.userNote === 'string' ? raw.userNote : null,
    lastQuestion: typeof raw?.lastQuestion === 'string' ? raw.lastQuestion : null,
    lastAnswer: typeof raw?.lastAnswer === 'string' ? raw.lastAnswer : null,
    lastMessageText: typeof raw?.lastMessageText === 'string' ? raw.lastMessageText : null,
    lastThinking: trimSessionText(raw?.lastThinking),
    lastPlan: normalizeStreamPreviewPlan(raw?.lastPlan),
    migratedFrom: raw?.migratedFrom ?? null,
    migratedTo: raw?.migratedTo ?? null,
    linkedSessions: Array.isArray(raw?.linkedSessions) ? raw.linkedSessions : [],
    handoverFrom: normalizeHandoverRef(raw?.handoverFrom),
  };
}

const sessionIndexCache = new Map<string, { mtimeMs: number; size: number; data: SessionIndexData }>();

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(records: T[]): T[] {
  const at = new Map<T, number>(records.map(r => [r, Date.parse(r.updatedAt) || 0]));
  return records.sort((a, b) => at.get(b)! - at.get(a)!);
}

function loadSessionIndex(workdir: string): SessionIndexData {
  const filePath = sessionIndexPath(workdir);
  let stat: fs.Stats | null = null;
  try { stat = fs.statSync(filePath); } catch {}
  if (stat) {
    const cached = sessionIndexCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.data;
  }
  const parsed = readJsonFile<any>(filePath, { version: 1, sessions: [] });
  const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
  const promotions: Record<string, string> = {};
  if (parsed?.promotions && typeof parsed.promotions === 'object') {
    for (const [k, v] of Object.entries(parsed.promotions)) {
      if (typeof k === 'string' && k && typeof v === 'string' && v && k !== v) promotions[k] = v;
    }
  }
  const data: SessionIndexData = {
    version: 1,
    sessions: sessions

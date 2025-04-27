import { Hono } from 'hono';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { loadUserConfig } from '../../core/config/user-config.js';
import {
  listAgents, listSkills,
  decodeAttachmentPathParam, resolveAllowedAttachmentPath, rewriteAttachmentBlocksForTransport,
  tailDeliveredBlocks, mimeForArtifact,
  type Agent, type SessionInfo, type SessionMessagesResult, type RichMessage, type MessageBlock,
} from '../../agent/index.js';
import { getSessionStatusForBot } from '../../bot/session-status.js';
import { findSwarmDeckSession } from '../../agent/session.js';
import { readAwaitResume } from '../../agent/await-resume.js';
import {
  cancelSessionTask,
  stopSessionTasks,
  getSessionStreamState,
  queueDashboardSessionTask,
  forkDashboardSessionTask,
  steerSessionTask,
  interactionSelectOption,
  interactionSubmitText,
  interactionSkip,
  interactionCancel,
  getInteractionPrompt,
} from '../session-control.js';
import {
  querySessions, querySessionTail, querySessionMessages,
  getWorkspaceOverviews,
  updateSession, linkSessions,
  buildMigrationContext,
  exportSession, importSession,
  deleteSession,
  loadWorkspaces, addWorkspace, removeWorkspace, updateWorkspace,
  resolveUserStatus,
  type UserStatus, type SessionQueryResult,
} from '../../bot/session-hub.js';
import { DASHBOARD_PAGINATION } from '../../core/constants.js';
import { runtime } from '../runtime.js';
import type { Bot } from '../../bot/bot.js';

const DEFAULT_SESSION_PAGE_SIZE = DASHBOARD_PAGINATION.defaultPageSize;
const MAX_SESSION_PAGE_SIZE = DASHBOARD_PAGINATION.maxPageSize;

function parsePageNumber(value: string | null | undefined, fallback = 0): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parsePageSize(value: string | null | undefined, fallback = DEFAULT_SESSION_PAGE_SIZE): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_SESSION_PAGE_SIZE);
}

type DashboardSessionInfo = SessionInfo & { isCurrent?: boolean; workspaceName?: string };
type DashboardWorkspaceInfo = ReturnType<typeof loadWorkspaces>[number] & {
  isDefault?: boolean;
  removable?: boolean;
};

function sameWorkspacePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return path.resolve(a) === path.resolve(b);
}

export function isRemovableWorkspacePath(
  workspacePath: string | null | undefined,
  runtimeWorkdir: string | null | undefined,
): boolean {
  return !!workspacePath && !sameWorkspacePath(workspacePath, runtimeWorkdir);
}

export function projectWorkspacesForDashboard(
  workspaces: ReturnType<typeof loadWorkspaces>,
  runtimeWorkdir: string | null | undefined,
  nowIso = new Date().toISOString(),
): DashboardWorkspaceInfo[] {
  const runtimePath = runtimeWorkdir ? path.resolve(runtimeWorkdir) : '';
  const projected = workspaces.map(workspace => sameWorkspacePath(workspace.path, runtimePath)
    ? { ...workspace, isDefault: true, removable: false }
    : { ...workspace, removable: true });

  if (runtimePath && !projected.some(workspace => sameWorkspacePath(workspace.path, runtimePath))) {
    projected.unshift({
      path: runtimePath,
      name: path.basename(runtimePath),
      order: -1,
      addedAt: nowIso,
      isDefault: true,
      removable: false,
    });
  }
  return projected;
}

function paginateSessionResult<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * limit;
  return {
    sessions: items.slice(start, start + limit),
    page: safePage,
    limit,
    total,
    totalPages,
    hasMore: safePage + 1 < totalPages,
  };
}

function enrichWithRuntimeStatus(sessions: SessionInfo[], bot: Bot | null): DashboardSessionInfo[] {
  return sessions.map(session => {
    const status = bot ? getSessionStatusForBot(bot, session) : null;
    const isRunning = status ? status.isRunning : !!session.running;
    const awaiting = !isRunning && session.workdir && session.sessionId
      ? readAwaitResume(session.workdir, session.agent, session.sessionId)
      : null;
    return {
      ...session,
      running: isRunning,
      runState: isRunning ? 'running' as const : (session.runState === 'running' ? 'incomplete' : session.runState),
      awaiting,
      isCurrent: status?.isCurrent ?? false,
    };
  });
}

const LIST_PREVIEW_FIELD_CAP = 2048;

function capPreviewField<T extends string | null | undefined>(value: T): T | string {
  return typeof value === 'string' && value.length > LIST_PREVIEW_FIELD_CAP
    ? value.slice(0, LIST_PREVIEW_FIELD_CAP)
    : value;
}

export function projectSessionForList(session: DashboardSessionInfo): DashboardSessionInfo {
  return {
    ...session,
    lastQuestion: capPreviewField(session.lastQuestion),
    lastAnswer: capPreviewField(session.lastAnswer),
    lastMessageText: capPreviewField(session.lastMessageText),
    runDetail: capPreviewField(session.runDetail),
  };
}

function readStringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUploadFile(value: unknown): value is {
  name?: string;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
} {
  return !!value
    && typeof value === 'object'
    && typeof (value as any).arrayBuffer === 'function';
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/png': return '.png';
    case 'image/jpeg': return '.jpg';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/svg+xml': return '.svg';
    default: return '';
  }
}

function sanitizeUploadFileName(rawName: string, mimeType: string, index: number): string {
  const baseName = path.basename(rawName || `attachment-${index + 1}`);
  const parsed = path.parse(baseName);
  const safeStem = (parsed.name || `attachment-${index + 1}`)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `attachment-${index + 1}`;
  const ext = parsed.ext || extensionForMimeType(mimeType) || '.bin';
  return `${safeStem}${ext.toLowerCase()}`;
}

export function reserveUploadFileName(rawName: string, mimeType: string, index: number, usedNames: Set<string>): string {
  const desired = sanitizeUploadFileName(rawName, mimeType, index);
  const parsed = path.parse(desired);
  const stem = parsed.name || `attachment-${index + 1}`;
  const ext = parsed.ext;
  let candidate = desired;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${suffix}${ext}`;
    suffix++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function materializeUploadedFiles(entries: unknown[]): Promise<{ attachments: string[]; cleanup: () => Promise<void> }> {
  const files = entries.filter(isUploadFile);
  if (!files.length) {
    return { attachments: [], cleanup: async () => {} };
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'swarmdeck-dashboard-upload-'));
  try {
    const attachments: string[] = [];
    const usedNames = new Set<string>();
    for (const [index, file] of files.entries()) {
      const filename = reserveUploadFileName(String(file.name || ''), String(file.type || ''), index, usedNames);
      const filePath = path.join(tempDir, filename);
      await fs.promises.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
      attachments.push(filePath);
    }
    return {
      attachments,
      cleanup: async () => {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      },
    };
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function parseSessionSendRequest(c: any): Promise<{
  workdir: string;
  agent: string;
  sessionId: string;
  prompt: string;
  model: string;
  profileId: string | null | undefined;
  effort: string;
  workflow: boolean;
  attachments: string[];
  previousAgent: string;
  previousSessionId: string;
  cleanup: () => Promise<void>;
}> {
  const contentType = String(c.req.header('content-type') || '').toLowerCase();
  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const uploads = await materializeUploadedFiles(form.getAll('attachments'));
    return {
      workdir: readStringField(form.get('workdir')),
      agent: readStringField(form.get('agent')),
      sessionId: readStringField(form.get('sessionId')),

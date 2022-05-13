import fs from 'node:fs';
import path from 'node:path';
import { sessionAttachmentsDir } from './images.js';
import { agentWarn } from './utils.js';
import type { Agent, MessageBlock } from './types.js';

export type ArtifactKind = 'photo' | 'document';

export interface DeliveredArtifact {
  ts: number;
  taskId?: string;
  path: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
  kind: ArtifactKind;
  caption?: string;
}

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml',
  '.html': 'text/html; charset=utf-8', '.zip': 'application/zip', '.gz': 'application/gzip',
  '.tar': 'application/x-tar', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.log': 'text/plain; charset=utf-8',
};

export function mimeForArtifact(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function manifestPath(agent: Agent, sessionId: string): string {
  return path.join(sessionAttachmentsDir(agent, sessionId), 'delivered.jsonl');
}

function deliveredDir(agent: Agent, sessionId: string): string {
  return path.join(sessionAttachmentsDir(agent, sessionId), 'delivered');
}

function sanitizeName(name: string): string {

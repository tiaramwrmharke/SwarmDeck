import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getHome } from '../core/platform.js';
import { agentLog, agentWarn } from './utils.js';
import { mimeForExt } from './utils.js';
import type { Agent, MessageBlock } from './types.js';

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

const INLINE_THRESHOLD_BYTES = 256 * 1024;

const IMAGE_MIME_PREFIX = 'image/';

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

export function codexHome(): string {
  return process.env.CODEX_HOME || path.join(getHome(), '.codex');
}

export function sessionAttachmentsDir(agent: Agent, sessionId: string): string {
  return path.join(getHome(), '.swarmdeck', 'attachments', agent, sessionId);
}

export function allowedAttachmentRoots(workdir?: string | readonly string[] | null): string[] {
  const home = getHome();
  const roots: string[] = [
    path.join(codexHome(), 'generated_images'),
    path.join(codexHome(), 'sessions'),
    path.join(home, '.claude', 'projects'),
    path.join(home, '.gemini'),
    path.join(home, '.swarmdeck', 'attachments'),
    os.tmpdir(),
  ];
  const workdirs = typeof workdir === 'string' ? [workdir] : (workdir ?? []);
  for (const wd of workdirs) {
    if (wd && wd.trim()) roots.push(path.resolve(wd));
  }
  return roots;
}

export function resolveAllowedAttachmentPath(
  requested: string,
  workdir?: string | readonly string[] | null,
): string | null {
  if (!requested) return null;
  let real: string;
  try { real = fs.realpathSync(requested); } catch { return null; }
  for (const root of allowedAttachmentRoots(workdir)) {
    let realRoot: string;
    try { realRoot = fs.realpathSync(root); } catch { continue; }
    const rel = path.relative(realRoot, real);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return real;
    if (rel === '') return real;
  }
  return null;
}

function mimeFromPath(filePath: string): string {
  return mimeForExt(path.extname(filePath).toLowerCase());
}

function extFromMime(mime: string): string {
  return IMAGE_EXT_BY_MIME[mime.toLowerCase()] || '.bin';
}

function isImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith(IMAGE_MIME_PREFIX);
}

export interface AttachAgentImageOpts {
  imagePath: string;
  mime?: string;
  caption?: string;
  captionKind?: 'prompt' | 'caption';
  phase?: 'commentary' | 'final_answer';
  inlineThresholdBytes?: number;
}

export function attachAgentImage(opts: AttachAgentImageOpts): MessageBlock | null {
  const abs = path.resolve(opts.imagePath);
  let stat: fs.Stats;
  try { stat = fs.statSync(abs); } catch (err: any) {
    agentLog(`[images] attachAgentImage: stat failed for ${abs}: ${err?.message || err}`);
    return null;
  }
  if (!stat.isFile()) return null;
  if (stat.size > MAX_IMAGE_BYTES) {
    agentWarn(`[images] attachAgentImage: ${abs} too large (${stat.size} bytes > ${MAX_IMAGE_BYTES})`);
    return null;
  }

  const mime = (opts.mime || mimeFromPath(abs)).toLowerCase();
  if (!isImageMime(mime)) return null;

  const threshold = opts.inlineThresholdBytes ?? INLINE_THRESHOLD_BYTES;
  let content: string;

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import {
  Channel,
  type BotInfo,
  DEFAULT_CHANNEL_CAPABILITIES,
  type MenuCommand,
  type SendOpts,
  splitText,
  sleep,
} from '../base.js';
import { TELEGRAM_LIMITS } from '../../core/constants.js';
import { ChannelHealth } from '../health.js';
import { formatScopedLogLine, shouldLog, writeScopedLog, type LogLevel } from '../../core/logging.js';
import { recordKnownChatId } from '../../core/config/user-config.js';

setGlobalDispatcher(new EnvHttpProxyAgent());

export { TelegramChannel };

export interface TgMessage {
  text: string;
  files: string[];
}

export interface TgFrom {
  id: number;
  username?: string;
  firstName?: string;
}

export interface TgContext {
  chatId: number;
  messageId: number;
  from: TgFrom;
  reply: (text: string, opts?: SendOpts) => Promise<number | null>;
  editReply: (msgId: number, text: string, opts?: SendOpts) => Promise<void>;
  answerCallback: (text?: string) => Promise<void>;
  channel: TelegramChannel;
  raw: any;
}

export interface TgCallbackContext extends TgContext {
  callbackId: string;
}

export type CommandHandler  = (cmd: string, args: string, ctx: TgContext) => Promise<any> | any;
export type MessageHandler  = (msg: TgMessage, ctx: TgContext) => Promise<any> | any;
export type CallbackHandler = (data: string, ctx: TgCallbackContext) => Promise<any> | any;
export type ErrorHandler    = (err: Error) => void;

export interface TelegramOpts {
  token: string;
  workdir?: string;
  pollTimeout?: number;
  apiTimeout?: number;
  allowedChatIds?: Set<number>;
  botUsername?: string;
  requireMentionInGroup?: boolean;
}

interface ThreadedOpts {
  messageThreadId?: number;
}

const TG_MAX = TELEGRAM_LIMITS.maxMessageLength;
const FILE_MAX_BYTES = TELEGRAM_LIMITS.fileMaxBytes;
const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function previewText(value: string, max = 280): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '(empty)';
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function addErrorMetadata(parts: string[], err: any) {
  for (const key of ['code', 'errno', 'syscall', 'address', 'port', 'host', 'hostname', 'path']) {
    const value = err?.[key];
    if (value != null && value !== '') parts.push(`${key}=${value}`);
  }
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err ?? 'unknown error');

  const parts = [`${err.name}: ${err.message}`];
  addErrorMetadata(parts, err);

  if (err instanceof AggregateError && Array.isArray(err.errors) && err.errors.length) {
    parts.push(`errors=[${err.errors.slice(0, 3).map(item => describeError(item)).join(' | ')}]`);
  }

  const cause = (err as any).cause;
  if (cause && cause !== err) {
    parts.push(`cause=${describeError(cause)}`);
  }

  return parts.join(' | ');
}

function isRetryableRequestError(err: unknown): boolean {
  const text = describeError(err).toLowerCase();
  return [
    'fetch failed',
    'econnreset',
    'etimedout',
    'enotfound',
    'eai_again',
    'econnrefused',
    'socket hang up',
    'http 502',
    'http 503',
    'http 504',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
  ].some(token => text.includes(token));
}

function isParseModeError(err: unknown): boolean {
  const text = describeError(err).toLowerCase();
  return text.includes("can't parse")
    || text.includes('parse entities')
    || text.includes('unsupported start tag')
    || text.includes('unsupported tag');
}

function wrapSendError(err: unknown): Error {
  return new Error(`sendMessage failed: ${describeError(err)}`, {
    cause: err instanceof Error ? err : undefined,
  });
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true;
  const cause = (err as any)?.cause;
  if (cause && cause !== err) return isAbortError(cause);
  return false;
}

async function parseJsonResponse(resp: Response, label: string): Promise<any> {
  const raw = await resp.text();
  const bodyPreview = previewText(raw);

  let data: any = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `${label} returned invalid JSON: HTTP ${resp.status} ${resp.statusText || ''}`.trim() +
        `; body=${bodyPreview}; parse=${describeError(err)}`,
      );
    }
  }

  if (!resp.ok) {
    const detail = data != null ? previewText(JSON.stringify(data)) : bodyPreview;
    throw new Error(`${label} failed: HTTP ${resp.status} ${resp.statusText || ''}`.trim() + `; body=${detail}`);
  }

  return data;
}

function mimeTypeForFilename(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg';
  }
}

function extForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/jpeg':
    case 'image/jpg': return '.jpg';
    default: return '.bin';
  }
}

function isPollingConflictError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.startsWith('Telegram polling conflict:');
}

class TelegramChannel extends Channel {
  override readonly capabilities = {
    ...DEFAULT_CHANNEL_CAPABILITIES,
    editMessages: true,
    typingIndicators: true,
    commandMenu: true,
    messageReactions: true,

import * as lark from '@larksuiteoapi/node-sdk';
import fs from 'node:fs';
import path from 'node:path';
import {
  Channel,
  type BotInfo,
  type MenuCommand,
  DEFAULT_CHANNEL_CAPABILITIES,
  type SendOpts,
  sleep,
} from '../base.js';
import { FEISHU_LIMITS } from '../../core/constants.js';
import { ChannelHealth } from '../health.js';
import { adaptMarkdownForFeishu } from './markdown.js';
import { writeScopedLog, shouldLog, type LogLevel } from '../../core/logging.js';
import { recordKnownChatId } from '../../core/config/user-config.js';

export { FeishuChannel };
export type FeishuCardActionItem = lark.InteractiveCardActionItem;
type FeishuCardTemplate =
  | 'blue'
  | 'wathet'
  | 'turquoise'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'carmine'
  | 'violet'
  | 'purple'
  | 'indigo'
  | 'grey';
export interface FeishuCardActionRow {
  actions: FeishuCardActionItem[];
  layout?: 'bisected' | 'trisection' | 'flow';
}
export interface FeishuCardView {
  markdown: string;
  title?: string;
  template?: FeishuCardTemplate;
  rows?: FeishuCardActionRow[];
}

export interface FeishuMessage {
  text: string;
  files: string[];
}

export interface FeishuFrom {
  openId: string;
  userId?: string;
  name?: string;
}

export interface FeishuContext {
  chatId: string;
  messageId: string;
  from: FeishuFrom;
  chatType: 'p2p' | 'group';
  replyToMessageId: string | null;
  reply: (text: string, opts?: SendOpts) => Promise<string | null>;
  editReply: (msgId: string, text: string, opts?: SendOpts) => Promise<void>;
  channel: FeishuChannel;
  raw: any;
}

export type FeishuCommandHandler = (cmd: string, args: string, ctx: FeishuContext) => Promise<any> | any;
export type FeishuMessageHandler = (msg: FeishuMessage, ctx: FeishuContext) => Promise<any> | any;
export type FeishuErrorHandler = (err: Error) => void;

export interface FeishuCallbackContext {
  chatId: string;
  messageId: string;
  from: FeishuFrom;
  editReply: (msgId: string, text: string, opts?: SendOpts) => Promise<void>;
  channel: FeishuChannel;
  raw: any;
}

export type FeishuCallbackHandler = (data: string, ctx: FeishuCallbackContext) => Promise<any> | any;
export type FeishuRecallHandler = (messageId: string, chatId: string, raw: any) => Promise<any> | any;

export interface FeishuOpts {
  appId: string;
  appSecret: string;
  domain?: string;
  workdir?: string;
  allowedChatIds?: Set<string>;
  apiTimeout?: number;
}

const FEISHU_CARD_MAX = FEISHU_LIMITS.cardMax;
const FILE_MAX_BYTES = FEISHU_LIMITS.fileMaxBytes;
const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const FEISHU_WS_START_RETRY_MAX_DELAY_MS = FEISHU_LIMITS.wsStartRetryMaxDelay;

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err ?? 'unknown error');
  const parts = [`${err.name}: ${err.message}`];
  for (const key of ['code', 'errno', 'syscall', 'address', 'port', 'host', 'hostname']) {
    const value = (err as any)?.[key];
    if (value != null && value !== '') parts.push(`${key}=${value}`);
  }
  return parts.join(' | ');
}

function isRetryableWsStartError(err: unknown): boolean {
  const text = describeError(err).toLowerCase();
  return [
    'socket hang up',
    'econnreset',
    'etimedout',
    'econnrefused',
    'enotfound',
    'eai_again',
    'fetch failed',
    'timeout',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
  ].some(token => text.includes(token));
}

function isRetryableUploadError(err: unknown): boolean {
  const text = describeError(err).toLowerCase();
  return [
    'socket hang up',
    'econnreset',
    'etimedout',
    'econnrefused',
    'enotfound',
    'eai_again',
    'fetch failed',
    'timeout',
    'temporarily unavailable',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
  ].some(token => text.includes(token));
}

function requireMessageId(resp: any, action: string): string {
  const messageId = resp?.data?.message_id;
  if (messageId) return String(messageId);
  const code = resp?.code;
  const msg = resp?.msg || resp?.message || 'no message_id returned';
  throw new Error(`${action} failed: code=${code ?? '?'} msg=${msg}`);
}

function isFeishuNotModifiedMessage(msg: string): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return lower.includes('not modified')
    || lower.includes('not modify')
    || lower.includes('content not change')
    || lower.includes('same content')
    || lower.includes('same as before')
    || lower.includes('no change');
}

function buildPostContent(paragraphs: Array<Array<Record<string, unknown>>>, title = ''): string {
  return JSON.stringify({
    zh_cn: {
      title,
      content: paragraphs,
    },
  });
}

function inferActionLayout(actions: FeishuCardActionItem[]): FeishuCardActionRow['layout'] | undefined {
  if (actions.length >= 3) return 'trisection';
  if (actions.length === 2) return 'bisected';
  return undefined;
}

function chunkActionRows(actions: FeishuCardActionItem[], size = 3): FeishuCardActionRow[] {
  const rows: FeishuCardActionRow[] = [];
  for (let i = 0; i < actions.length; i += size) {
    const rowActions = actions.slice(i, i + size).filter(Boolean);
    if (!rowActions.length) continue;
    rows.push({ actions: rowActions, layout: inferActionLayout(rowActions) });
  }
  return rows;
}

function keyboardToRows(keyboard: any): FeishuCardActionRow[] {
  const explicitRows = Array.isArray(keyboard?.rows)
    ? keyboard.rows
      .filter((row: any) => Array.isArray(row?.actions) && row.actions.length)
      .map((row: any) => ({
        actions: row.actions.filter(Boolean),
        layout: row.layout || inferActionLayout(row.actions),
      }))
    : [];
  if (explicitRows.length) return explicitRows;

  const actions = Array.isArray(keyboard?.actions)
    ? keyboard.actions.filter(Boolean)
    : [];
  return chunkActionRows(actions);
}

function buildCardFromView(view: FeishuCardView): Record<string, unknown> {
  const adapted = adaptMarkdownForFeishu(view.markdown);
  const content = adapted.length > FEISHU_CARD_MAX
    ? adapted.slice(0, FEISHU_CARD_MAX) + '\n\n...(truncated)'
    : adapted;

  const actionElements: unknown[] = [];
  for (const row of view.rows || []) {
    const actions = row.actions.filter(Boolean);
    if (!actions.length) continue;
    const element: Record<string, unknown> = { tag: 'action', actions };
    const layout = row.layout || inferActionLayout(actions);
    if (layout) element.layout = layout;
    actionElements.push(element);
  }

  if (actionElements.length) {
    const card: Record<string, unknown> = {
      config: { wide_screen_mode: true, update_multi: true },
      elements: [{ tag: 'markdown', content }, ...actionElements],
    };
    if (view.title) {
      card.header = {
        template: view.template || 'blue',
        title: { content: view.title, tag: 'plain_text' },
      };
    }
    return card;
  }

  const card: Record<string, unknown> = {
    schema: '2.0',
    config: { update_multi: true },
    body: { elements: [{ tag: 'markdown', content }] },
  };
  if (view.title) {
    card.header = {
      template: view.template || 'blue',
      title: { content: view.title, tag: 'plain_text' },
    };
  }
  return card;
}

class FeishuChannel extends Channel {
  override readonly capabilities = {
    ...DEFAULT_CHANNEL_CAPABILITIES,
    editMessages: true,
    commandMenu: true,
    messageReactions: true,
    sendImage: true,
  };

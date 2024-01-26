import {
  Channel,
  DEFAULT_CHANNEL_CAPABILITIES,
  type BotInfo,
  type SendOpts,
  splitText,
  sleep,
} from '../base.js';
import { WEIXIN_LIMITS } from '../../core/constants.js';
import { ChannelHealth, type ChannelHealthLogLevel } from '../health.js';
import {
  extractWeixinTextBody,
  markdownToWeixinPlainText,
  normalizeWeixinBaseUrl,
  WeixinMessageType,
  type WeixinMessage,
  weixinGetConfig,
  weixinGetUpdates,
  weixinSendTextMessage,
  weixinSendTyping,
} from './api.js';

export interface WeixinOpts {
  token: string;
  accountId: string;
  baseUrl?: string;
  pollTimeout?: number;
  allowedChatIds?: Set<string>;
}

export interface WeixinMessagePayload {
  text: string;
  files: string[];
}

export interface WeixinFrom {
  userId: string;
}

export interface WeixinContext {
  chatId: string;
  messageId: string;
  from: WeixinFrom;
  reply: (text: string, opts?: SendOpts) => Promise<string | null>;
  editReply: (msgId: string, text: string, opts?: SendOpts) => Promise<void>;
  sendTyping: () => Promise<void>;
  channel: WeixinChannel;
  raw: WeixinMessage;
}

export type WeixinMessageHandler = (msg: WeixinMessagePayload, ctx: WeixinContext) => Promise<any> | any;
export type WeixinErrorHandler = (err: Error) => void;
export type WeixinLogLevel = ChannelHealthLogLevel;
export type WeixinLogHandler = (msg: string, level: WeixinLogLevel) => void;

interface WeixinChatMeta {
  userId: string;
  contextToken: string;
  typingTicket?: string;
}

const WEIXIN_MAX_MESSAGE_LENGTH = WEIXIN_LIMITS.maxMessageLength;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export class WeixinChannel extends Channel {
  readonly capabilities = {
    ...DEFAULT_CHANNEL_CAPABILITIES,
    typingIndicators: true,
  };

  readonly knownChats = new Set<string>();


import { DWClient, TOPIC_ROBOT, type DWClientDownStream, EventAck, type RobotTextMessage } from 'dingtalk-stream';
import {
  Channel,
  type BotInfo,
  DEFAULT_CHANNEL_CAPABILITIES,
  type SendOpts,
  splitText,
  sleep,
} from '../base.js';
import { DINGTALK_LIMITS } from '../../core/constants.js';
import { ChannelHealth } from '../health.js';
import { writeScopedLog, type LogLevel } from '../../core/logging.js';

export interface DingtalkOpts {
  clientId: string;
  clientSecret: string;
  workdir?: string;
  allowedChatIds?: Set<string>;
}

export interface DingtalkMessagePayload {
  text: string;
  files: string[];
}

export interface DingtalkFrom {
  userId: string;
  displayName?: string;
}

export interface DingtalkContext {
  chatId: string;
  messageId: string;
  conversationType: string;
  from: DingtalkFrom;
  reply: (text: string, opts?: SendOpts) => Promise<string | null>;
  editReply: (msgId: string, text: string, opts?: SendOpts) => Promise<void>;
  channel: DingtalkChannel;
  raw: RobotTextMessage;
}

export type DingtalkMessageHandler = (msg: DingtalkMessagePayload, ctx: DingtalkContext) => Promise<any> | any;
export type DingtalkErrorHandler = (err: Error) => void;

const DT_MAX = DINGTALK_LIMITS.maxMessageLength;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'unknown error');
}

function previewText(value: string, max = 200): string {
  const t = value.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}...` : t || '(empty)';
}

interface ChatMeta {
  sessionWebhook: string;
  sessionWebhookExpiredAt: number;
}

export class DingtalkChannel extends Channel {
  override readonly capabilities = {
    ...DEFAULT_CHANNEL_CAPABILITIES,
  };

  readonly knownChats = new Set<string>();

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly allowedChatIds?: Set<string>;


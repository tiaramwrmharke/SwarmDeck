import { SocketModeClient } from '@slack/socket-mode';
import { WebClient, type WebAPICallResult } from '@slack/web-api';
import {
  Channel,
  type BotInfo,
  DEFAULT_CHANNEL_CAPABILITIES,
  type SendOpts,
  splitText,
  sleep,
} from '../base.js';
import { SLACK_LIMITS } from '../../core/constants.js';
import { writeScopedLog, type LogLevel } from '../../core/logging.js';
import { ChannelHealth } from '../health.js';

export interface SlackOpts {
  botToken: string;
  appToken: string;
  workdir?: string;
  allowedChatIds?: Set<string>;
  requireMentionInChannel?: boolean;
}

export interface SlackMessagePayload {
  text: string;
  files: string[];
}

export interface SlackFrom {
  userId: string;
  username?: string;
}

export interface SlackContext {
  chatId: string;
  messageId: string;
  threadTs: string | null;
  from: SlackFrom;
  reply: (text: string, opts?: SendOpts) => Promise<string | null>;
  editReply: (msgId: string, text: string, opts?: SendOpts) => Promise<void>;
  channel: SlackChannel;
  raw: any;
}

export type SlackMessageHandler = (msg: SlackMessagePayload, ctx: SlackContext) => Promise<any> | any;
export type SlackErrorHandler = (err: Error) => void;

const SLACK_MAX = SLACK_LIMITS.maxMessageLength;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'unknown error');
}

export class SlackChannel extends Channel {
  override readonly capabilities = {
    ...DEFAULT_CHANNEL_CAPABILITIES,
    editMessages: true,
    typingIndicators: false,
  };

  readonly knownChats = new Set<string>();

  private readonly botToken: string;
  private readonly appToken: string;
  private readonly allowedChatIds?: Set<string>;
  private readonly requireMention: boolean;

  private webClient!: WebClient;
  private socketClient: SocketModeClient | null = null;
  private botUserId: string | null = null;
  private running = false;
  private listenResolve: (() => void) | null = null;


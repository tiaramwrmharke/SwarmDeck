import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
  type TextBasedChannel,
} from 'discord.js';
import {
  Channel,
  type BotInfo,
  DEFAULT_CHANNEL_CAPABILITIES,
  type SendOpts,
  splitText,
  sleep,
} from '../base.js';
import { DISCORD_LIMITS } from '../../core/constants.js';
import { writeScopedLog, type LogLevel } from '../../core/logging.js';

export interface DiscordOpts {
  botToken: string;
  workdir?: string;
  allowedChatIds?: Set<string>;
  requireMentionInChannel?: boolean;
}

export interface DiscordMessagePayload {
  text: string;
  files: string[];
}

export interface DiscordFrom {
  userId: string;
  username?: string;
}

export interface DiscordContext {
  chatId: string;
  messageId: string;
  from: DiscordFrom;
  reply: (text: string, opts?: SendOpts) => Promise<string | null>;
  editReply: (msgId: string, text: string, opts?: SendOpts) => Promise<void>;
  channel: DiscordChannel;
  raw: Message;
}

export type DiscordMessageHandler = (msg: DiscordMessagePayload, ctx: DiscordContext) => Promise<any> | any;
export type DiscordErrorHandler = (err: Error) => void;

const DISCORD_MAX = DISCORD_LIMITS.maxMessageLength;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'unknown error');
}

export class DiscordChannel extends Channel {
  override readonly capabilities = {
    ...DEFAULT_CHANNEL_CAPABILITIES,
    editMessages: true,

import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import {
  Channel,
  type BotInfo,
  DEFAULT_CHANNEL_CAPABILITIES,
  type SendOpts,
  splitText,
  sleep,
} from '../base.js';
import { WECOM_LIMITS } from '../../core/constants.js';
import { writeScopedLog, type LogLevel } from '../../core/logging.js';
import { ChannelHealth } from '../health.js';

export interface WeComOpts {
  botId: string;
  botSecret: string;
  endpoint?: string;
  workdir?: string;
  allowedUserIds?: Set<string>;
}

export interface WeComMessagePayload {
  text: string;
  files: string[];
}

export interface WeComFrom {
  userId: string;
}

export interface WeComContext {
  chatId: string;
  messageId: string;
  chatType: 'single' | 'group' | string;
  from: WeComFrom;
  reqId: string;
  reply: (text: string, opts?: SendOpts) => Promise<string | null>;
  editReply: (msgId: string, text: string, opts?: SendOpts) => Promise<void>;
  channel: WeComChannel;
  raw: any;
}

export type WeComMessageHandler = (msg: WeComMessagePayload, ctx: WeComContext) => Promise<any> | any;
export type WeComErrorHandler = (err: Error) => void;

const WC_MAX = WECOM_LIMITS.maxMessageLength;
const WC_HEARTBEAT_MS = WECOM_LIMITS.heartbeatInterval;

interface WsFrame {
  cmd?: string;
  headers?: { req_id?: string };
  body?: any;
  errcode?: number;
  errmsg?: string;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'unknown error');
}

interface ChatMeta {
  pendingReqId: string | null;
}

export class WeComChannel extends Channel {
  override readonly capabilities = {
    ...DEFAULT_CHANNEL_CAPABILITIES,
  };

  readonly knownChats = new Set<string>();

  private readonly botId: string;
  private readonly botSecret: string;
  private readonly endpoint: string;
  private readonly allowedUserIds?: Set<string>;

  private ws: WebSocket | null = null;
  private running = false;
  private listenResolve: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private missedPong = 0;
  private reqSeq = 0;
  private readonly chatMeta = new Map<string, ChatMeta>();

  private readonly pendingAcks = new Map<string, { resolve: () => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  private readonly seenMsgIds = new Set<string>();
  private readonly seenMsgQueue: string[] = [];
  private static readonly SEEN_CAP = 256;

  private subscribeAck: ((err: Error | null) => void) | null = null;

  private readonly internalEmitter = new EventEmitter();
  private readonly messageHandlers = new Set<WeComMessageHandler>();
  private readonly errorHandlers = new Set<WeComErrorHandler>();

  constructor(opts: WeComOpts) {
    super();
    this.botId = opts.botId;
    this.botSecret = opts.botSecret;
    this.endpoint = (opts.endpoint || WECOM_LIMITS.defaultEndpoint).replace(/\/+$/, '/');
    this.allowedUserIds = opts.allowedUserIds;
    this.internalEmitter.setMaxListeners(0);
  }

  onMessage(handler: WeComMessageHandler) { this.messageHandlers.add(handler); return this; }
  onError(handler: WeComErrorHandler) { this.errorHandlers.add(handler); return this; }

  async connect(): Promise<BotInfo> {
    const shortId = this.botId.length > 12 ? `${this.botId.slice(0, 6)}...${this.botId.slice(-4)}` : this.botId;
    this.bot = {
      id: this.botId,
      username: `wecom_${shortId}`,
      displayName: `WeCom ${shortId}`,
    };
    return this.bot;
  }

  async listen(): Promise<void> {
    this.running = true;
    const health = new ChannelHealth({
      label: 'WeCom',
      opAction: 'WS connect',
      initialDelayMs: WECOM_LIMITS.initialRetryDelay,
      maxDelayMs: WECOM_LIMITS.maxRetryDelay,
      sustainedFailureHint: 'verify wecomBotId / wecomBotSecret / wecomEndpoint in setting.json',
      log: (msg, level) => this.log(msg, level),
    });
    while (this.running) {
      const connectedAt = Date.now();
      let connectionErr: unknown = null;
      try {
        await this.runConnection();
      } catch (err) {
        connectionErr = err;
        this.emitError(err instanceof Error ? err : new Error(describeError(err)));
      }
      if (!this.running) break;
      const wasLongLived = Date.now() - connectedAt > 2 * WC_HEARTBEAT_MS;
      const delayMs = wasLongLived
        ? (health.recordSuccess(), WECOM_LIMITS.initialRetryDelay)
        : health.recordFailure(connectionErr ?? new Error('connection dropped'));
      await sleep(delayMs);
    }
  }

  disconnect(): void {
    this.running = false;
    this.stopHeartbeat();
    if (this.ws) {
      try { this.ws.close(); } catch {}

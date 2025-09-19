import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { VALIDATION_TIMEOUTS, WEIXIN_LIMITS } from '../../core/constants.js';

export const WEIXIN_DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const WEIXIN_QR_LOGIN_TTL_MS = 5 * 60_000;
const WEIXIN_DEFAULT_BOT_TYPE = '3';
const WEIXIN_QR_CONTENT_CHECK_TIMEOUT_MS = 5_000;

export const WeixinMessageType = {
  NONE: 0,
  USER: 1,
  BOT: 2,
} as const;

export const WeixinMessageItemType = {
  NONE: 0,
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
} as const;

export const WeixinMessageState = {
  NEW: 0,
  GENERATING: 1,
  FINISH: 2,
} as const;

export const WeixinTypingStatus = {
  TYPING: 1,
  CANCEL: 2,
} as const;

export interface WeixinTextItem {
  text?: string;
}

export interface WeixinVoiceItem {
  text?: string;
}

export interface WeixinMessageItem {
  type?: number;
  text_item?: WeixinTextItem;
  voice_item?: WeixinVoiceItem;
}

export interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  client_id?: string;
  create_time_ms?: number;
  session_id?: string;
  message_type?: number;
  message_state?: number;
  item_list?: WeixinMessageItem[];
  context_token?: string;
}

export interface WeixinGetUpdatesResp {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

export interface WeixinGetConfigResp {
  ret?: number;
  errmsg?: string;
  typing_ticket?: string;
}

export interface WeixinQrStartResult {
  ok: boolean;
  sessionKey: string;
  qrcodeUrl?: string;
  message: string;
  error?: string;
}

export interface WeixinQrWaitResult {
  ok: boolean;
  connected: boolean;
  status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'error';
  message: string;
  qrcodeUrl?: string;
  botToken?: string;
  accountId?: string;
  userId?: string;
  baseUrl?: string;
  error?: string;
}

interface WeixinQrCodeResponse {
  qrcode?: string;
  qrcode_img_content?: string;
}

interface WeixinQrStatusResponse {
  status?: 'wait' | 'scaned' | 'confirmed' | 'expired';
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
}

interface ActiveWeixinQrLogin {
  sessionKey: string;
  qrcode: string;
  qrcodeUrl: string;
  startedAt: number;
}

const activeWeixinQrLogins = new Map<string, ActiveWeixinQrLogin>();

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

function withTimeoutSignal(timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer),
  };
}

function combineAbortSignals(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal; dispose: () => void } {
  const timeout = withTimeoutSignal(timeoutMs);
  if (!external) return timeout;
  if (external.aborted) {
    timeout.dispose();
    return { signal: external, dispose: () => {} };
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  timeout.signal.addEventListener('abort', onAbort, { once: true });
  external.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      timeout.signal.removeEventListener('abort', onAbort);

import * as lark from '@larksuiteoapi/node-sdk';
import { validateTelegramToken, type TelegramBotIdentity } from '../../cli/setup-wizard.js';
import type { ChannelSetupState } from '../../cli/onboarding.js';
import type { UserConfig } from './user-config.js';
import { VALIDATION_TIMEOUTS } from '../constants.js';
import { writeScopedLog } from '../logging.js';
import { normalizeWeixinBaseUrl, weixinGetUpdates } from '../../channels/weixin/api.js';

export interface TelegramConfigCheckResult {
  state: ChannelSetupState;
  bot: TelegramBotIdentity | null;
  normalizedAllowedChatIds: string;
}

export interface FeishuAppIdentity {
  appId: string;
  displayName: string | null;
}

export interface FeishuConfigCheckResult {
  state: ChannelSetupState;
  app: FeishuAppIdentity | null;
}

export interface WeixinConfigIdentity {
  accountId: string;
  baseUrl: string;
}

export interface WeixinConfigCheckResult {
  state: ChannelSetupState;
  account: WeixinConfigIdentity | null;
  normalizedBaseUrl: string;
}

export interface SlackBotIdentity {
  userId: string;
  team: string | null;
  username: string | null;
}

export interface SlackConfigCheckResult {
  state: ChannelSetupState;
  bot: SlackBotIdentity | null;
}

export interface DiscordBotIdentity {
  userId: string;
  username: string;
  applicationId: string | null;
}

export interface DiscordConfigCheckResult {
  state: ChannelSetupState;
  bot: DiscordBotIdentity | null;
}

export interface DingtalkAppIdentity {
  clientId: string;
}

export interface DingtalkConfigCheckResult {
  state: ChannelSetupState;
  app: DingtalkAppIdentity | null;
}

export interface WecomBotIdentity {
  botId: string;
}

export interface WecomConfigCheckResult {
  state: ChannelSetupState;
  bot: WecomBotIdentity | null;
}

interface FeishuValidationOptions {
  timeoutMs?: number;
}

const DEFAULT_FEISHU_VALIDATION_TIMEOUT_MS = VALIDATION_TIMEOUTS.feishuDefault;
const DEFAULT_WEIXIN_VALIDATION_TIMEOUT_MS = VALIDATION_TIMEOUTS.weixinDefault;
const DEFAULT_SLACK_VALIDATION_TIMEOUT_MS = VALIDATION_TIMEOUTS.slackDefault;
const DEFAULT_DISCORD_VALIDATION_TIMEOUT_MS = VALIDATION_TIMEOUTS.discordDefault;
const DEFAULT_DINGTALK_VALIDATION_TIMEOUT_MS = VALIDATION_TIMEOUTS.dingtalkDefault;
const DEFAULT_WECOM_VALIDATION_TIMEOUT_MS = VALIDATION_TIMEOUTS.wecomDefault;

function feishuValidationLog(appId: string, message: string): void {
  writeScopedLog('feishu-validate', `app=${appId} ${message}`, { level: 'debug' });
}

function maskAppId(appId: string): string {
  if (!appId) return '(missing)';
  if (appId.length <= 10) return appId;
  return `${appId.slice(0, 6)}...${appId.slice(-4)}`;
}

class ValidationTimeoutError extends Error {
  constructor(service: string, timeoutMs: number) {
    super(`${service} request timed out after ${timeoutMs}ms.`);
    this.name = 'ValidationTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, service: string, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout?.();
      reject(new ValidationTimeoutError(service, timeoutMs));
    }, timeoutMs);

    promise
      .then(value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function missingChannelState(channel: ChannelSetupState['channel'], detail: string): ChannelSetupState {
  return {
    channel,
    configured: false,
    ready: false,
    validated: false,
    status: 'missing',
    detail,
  };
}

function invalidChannelState(channel: ChannelSetupState['channel'], detail: string): ChannelSetupState {
  return {
    channel,
    configured: true,
    ready: false,
    validated: true,
    status: 'invalid',
    detail,
  };
}

function errorChannelState(channel: ChannelSetupState['channel'], detail: string): ChannelSetupState {

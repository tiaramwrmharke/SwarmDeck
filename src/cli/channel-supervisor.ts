import type { Bot } from '../bot/bot.js';
import type { ChannelName, UserConfig } from '../core/config/user-config.js';
import { loadUserConfig, onUserConfigChange } from '../core/config/user-config.js';
import { resolveConfiguredChannels } from './channels.js';
import type { DashboardServer } from '../dashboard/server.js';

interface RunningBot {
  bot: Bot;
  credSnapshot: string;
  runPromise: Promise<void>;
}

const CHANNEL_AFFECTING_KEYS = new Set<keyof UserConfig>([
  'channels',
  'telegramBotToken',
  'telegramAllowedChatIds',
  'feishuAppId',
  'feishuAppSecret',
  'weixinBaseUrl',
  'weixinBotToken',
  'weixinAccountId',
  'slackBotToken',
  'slackAppToken',
  'discordBotToken',
  'dingtalkClientId',
  'dingtalkClientSecret',
  'wecomBotId',
  'wecomBotSecret',
  'wecomEndpoint',
]);

const CHANNEL_REPLACE_SETTLE_MS: Record<ChannelName, number> = {
  telegram: 0,
  weixin: 0,
  feishu: 5_000,
  slack: 3_000,
  discord: 3_000,
  dingtalk: 3_000,
  wecom: 3_000,
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function snapshotCredsForChannel(channel: ChannelName, config: Partial<UserConfig>): string {
  switch (channel) {
    case 'telegram':
      return JSON.stringify({
        token: String(config.telegramBotToken || '').trim(),
        allowed: String(config.telegramAllowedChatIds || '').trim(),
      });
    case 'feishu':
      return JSON.stringify({
        appId: String(config.feishuAppId || '').trim(),
        appSecret: String(config.feishuAppSecret || '').trim(),
      });
    case 'weixin':
      return JSON.stringify({
        baseUrl: String(config.weixinBaseUrl || '').trim(),
        token: String(config.weixinBotToken || '').trim(),
        accountId: String(config.weixinAccountId || '').trim(),
      });
    case 'slack':
      return JSON.stringify({
        botToken: String(config.slackBotToken || '').trim(),
        appToken: String(config.slackAppToken || '').trim(),
      });
    case 'discord':
      return JSON.stringify({
        botToken: String(config.discordBotToken || '').trim(),
      });
    case 'dingtalk':

import { applyChannelEnvFallback, type ChannelName, type UserConfig } from '../core/config/user-config.js';

export function hasConfiguredChannelToken(
  rawConfig: Partial<UserConfig>,
  channel: ChannelName,
  tokenOverride?: string | null,
): boolean {
  const config = applyChannelEnvFallback(rawConfig);
  switch (channel) {
    case 'telegram':
      return !!(config.telegramBotToken || tokenOverride);
    case 'feishu':
      return !!((config.feishuAppId && config.feishuAppSecret) || tokenOverride);

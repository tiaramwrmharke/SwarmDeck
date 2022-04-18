import { EventEmitter } from 'node:events';
import type { Bot } from '../bot/bot.js';
import type { Agent, AgentDetectOptions } from '../agent/index.js';
import type { UserConfig } from '../core/config/user-config.js';
import type { SetupState } from '../cli/onboarding.js';
import { applyChannelEnvFallback, loadUserConfig, resolveUserWorkdir } from '../core/config/user-config.js';
import { listAgents, resolveDefaultAgent } from '../agent/index.js';
import { collectSetupState } from '../cli/onboarding.js';
import {
  validateDingtalkConfig,
  validateDiscordConfig,
  validateFeishuConfig,
  validateSlackConfig,
  validateTelegramConfig,
  validateWecomConfig,
  validateWeixinConfig,
} from '../core/config/validation.js';
import { shouldCacheChannelStates } from '../channels/states.js';
import { DASHBOARD_TIMEOUTS } from '../core/constants.js';
import { withTimeoutFallback } from '../core/utils.js';
import { writeScopedLog, type LogLevel } from '../core/logging.js';
import {
  DEFAULT_AGENT_EFFORTS,
  DEFAULT_AGENT_MODELS,
  resolveAgentEffort,
  resolveAgentModel,
  resolveAgentWorkflowEnabled,
  resolveClaudeAccessMode,
  setAgentEffortEnv,
  setAgentModelEnv,
  setAgentWorkflowEnv,
  setClaudeAccessModeEnv,
  type ClaudeAccessMode,
} from '../core/config/runtime-config.js';

const CHANNEL_STATUS_VALIDATION_TIMEOUT_MS = DASHBOARD_TIMEOUTS.channelStatusValidation;
const CHANNEL_STATUS_CACHE_TTL_MS = DASHBOARD_TIMEOUTS.channelStatusCacheTtl;

export interface RuntimePrefs {
  defaultAgent?: Agent;
  models: Partial<Record<Agent, string>>;
  efforts: Partial<Record<Agent, string>>;
  workflow: Partial<Record<Agent, boolean>>;
  accessMode: Partial<Record<Agent, ClaudeAccessMode>>;
}

function buildLocalChannelStates(rawConfig: Partial<UserConfig>): NonNullable<SetupState['channels']> {
  const config = applyChannelEnvFallback(rawConfig);
  const weixinBaseUrl = String(config.weixinBaseUrl || '').trim();
  const weixinBotToken = String(config.weixinBotToken || '').trim();
  const weixinAccountId = String(config.weixinAccountId || '').trim();
  const weixinConfigured = !!(weixinBaseUrl || weixinBotToken || weixinAccountId);
  const weixinReady = !!(weixinBaseUrl && weixinBotToken && weixinAccountId);
  const telegramConfigured = !!String(config.telegramBotToken || '').trim();
  const feishuAppId = String(config.feishuAppId || '').trim();
  const feishuSecret = String(config.feishuAppSecret || '').trim();
  const feishuConfigured = !!(feishuAppId || feishuSecret);
  const feishuReady = !!(feishuAppId && feishuSecret);
  const slackBot = String(config.slackBotToken || '').trim();
  const slackApp = String(config.slackAppToken || '').trim();
  const slackConfigured = !!(slackBot || slackApp);
  const slackReady = !!(slackBot && slackApp);
  const discordToken = String(config.discordBotToken || '').trim();
  const discordConfigured = !!discordToken;
  const dingtalkId = String(config.dingtalkClientId || '').trim();
  const dingtalkSecret = String(config.dingtalkClientSecret || '').trim();
  const dingtalkConfigured = !!(dingtalkId || dingtalkSecret);
  const dingtalkReady = !!(dingtalkId && dingtalkSecret);
  const wecomId = String(config.wecomBotId || '').trim();
  const wecomSecret = String(config.wecomBotSecret || '').trim();
  const wecomConfigured = !!(wecomId || wecomSecret);
  const wecomReady = !!(wecomId && wecomSecret);

  return [
    {
      channel: 'weixin',
      configured: weixinConfigured,
      ready: false,
      validated: false,
      status: !weixinConfigured ? 'missing' : weixinReady ? 'checking' : 'invalid',
      detail: !weixinConfigured
        ? 'Weixin is not configured.'
        : weixinReady
          ? 'Validating Weixin credentials...'
          : 'Base URL, Bot Token, and Account ID are required.',
    },
    {
      channel: 'telegram',
      configured: telegramConfigured,
      ready: false,
      validated: false,
      status: telegramConfigured ? 'checking' : 'missing',
      detail: telegramConfigured ? 'Validating Telegram credentials…' : 'Telegram is not configured.',
    },
    {
      channel: 'feishu',
      configured: feishuConfigured,
      ready: false,
      validated: false,
      status: !feishuConfigured ? 'missing' : feishuReady ? 'checking' : 'invalid',
      detail: !feishuConfigured
        ? 'Feishu credentials are not configured.'
        : feishuReady
          ? 'Validating Feishu credentials…'
          : 'Both App ID and App Secret are required.',
    },
    {
      channel: 'slack',
      configured: slackConfigured,
      ready: false,
      validated: false,
      status: !slackConfigured ? 'missing' : slackReady ? 'checking' : 'invalid',
      detail: !slackConfigured
        ? 'Slack is not configured.'
        : slackReady
          ? 'Validating Slack credentials…'
          : 'Both Bot Token (xoxb-) and App-Level Token (xapp-) are required.',
    },
    {
      channel: 'discord',
      configured: discordConfigured,
      ready: false,
      validated: false,
      status: discordConfigured ? 'checking' : 'missing',
      detail: discordConfigured ? 'Validating Discord credentials…' : 'Discord is not configured.',
    },
    {
      channel: 'dingtalk',
      configured: dingtalkConfigured,
      ready: false,
      validated: false,
      status: !dingtalkConfigured ? 'missing' : dingtalkReady ? 'checking' : 'invalid',
      detail: !dingtalkConfigured
        ? 'DingTalk is not configured.'

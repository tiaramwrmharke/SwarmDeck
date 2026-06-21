import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Agent } from '../../agent/index.js';
import { STATE_DIR_NAME, USER_CONFIG_SYNC_DEFAULT_INTERVAL_MS } from '../constants.js';
import { expandTilde } from '../platform.js';

export type ChannelName = 'telegram' | 'feishu' | 'weixin' | 'slack' | 'discord' | 'dingtalk' | 'wecom';

export interface McpServerConfig {
  type?: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  disabled?: boolean;
  catalogId?: string;
}

export interface McpOAuthTokenRecord {
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  resource: string;
  issuer?: string;
}

export interface WorkspaceEntry {
  path: string;
  name: string;
  order?: number;
  preferredAgent?: string;
  addedAt: string;
}

export interface UserConfig {
  version: 1;
  channel?: ChannelName;
  channels?: ChannelName[];
  defaultAgent?: Agent;
  agentAutoUpdate?: boolean;
  claudeModel?: string;
  claudeReasoningEffort?: string;
  claudeWorkflowEnabled?: boolean;
  claudeAccessMode?: 'subscription' | 'api';
  codexModel?: string;
  codexReasoningEffort?: string;
  geminiModel?: string;
  geminiReasoningEffort?: string;
  hermesModel?: string;
  hermesReasoningEffort?: string;
  workdir?: string;
  workspaces?: WorkspaceEntry[];
  telegramBotToken?: string;
  telegramAllowedChatIds?: string;
  telegramKnownChatIds?: string[];
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuKnownChatIds?: string[];
  weixinBaseUrl?: string;
  weixinBotToken?: string;
  weixinAccountId?: string;
  slackBotToken?: string;
  slackAppToken?: string;
  discordBotToken?: string;
  dingtalkClientId?: string;
  dingtalkClientSecret?: string;
  wecomBotId?: string;
  wecomBotSecret?: string;
  wecomEndpoint?: string;
  browserEnabled?: boolean;
  browserHeadless?: boolean;
  peekabooEnabled?: boolean;
  pikichannelToken?: string;
  pikichannelStrictAuth?: boolean;
  pikichannelNodeId?: string;
  pikichannelRendezvous?: string;
  pikichannelPublicHost?: string;
  pikichannelTurnKeyId?: string;
  pikichannelTurnApiToken?: string;
  pikichannelTurnTtl?: number;
  extensions?: {
    mcp?: Record<string, McpServerConfig>;
    mcpTokens?: Record<string, McpOAuthTokenRecord>;
  };
  models?: {
    providers?: Record<string, unknown>;
    profiles?: Record<string, unknown>;
    activeProfileByAgent?: Record<string, string | null>;
  };
  accounts?: {
    byAgent?: Record<string, unknown[]>;
    activeByAgent?: Record<string, string | null>;
  };
}

interface ApplyUserConfigOptions {
  overwrite?: boolean;
  clearMissing?: boolean;
  notify?: boolean;
}

interface SyncUserConfigOptions {
  intervalMs?: number;
  overrides?: Partial<UserConfig>;
  log?: (message: string) => void;
}

type UserConfigChangeListener = (config: Partial<UserConfig>, changedKeys: string[]) => void;

const MANAGED_ENV_KEYS = [
  'PIKILOOM_CHANNEL',

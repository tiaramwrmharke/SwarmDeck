import type { AgentInfo } from '../agent/index.js';
import { getAgentInstallCommand, getAgentLabel } from '../agent/npm.js';

export type ChannelStatus = 'ready' | 'missing' | 'invalid' | 'error' | 'checking';
export type SetupChannel = 'telegram' | 'feishu' | 'weixin' | 'slack' | 'discord' | 'dingtalk' | 'wecom';

export interface AgentSetupState extends AgentInfo {
  label: string;
  installCommand: string;
}

export interface ChannelSetupState {
  channel: SetupChannel;
  configured: boolean;
  ready: boolean;
  validated: boolean;
  status: ChannelStatus;
  detail: string;
}

export interface SetupState {
  channel: string;
  tokenProvided: boolean;
  agents: AgentSetupState[];
  channels?: ChannelSetupState[];
}

function enrichAgent(agent: AgentInfo): AgentSetupState {
  const label = getAgentLabel(agent.agent);
  const installCommand = getAgentInstallCommand(agent.agent) || 'npm install -g <agent-package>';

  return {
    ...agent,
    label,
    installCommand,
  };
}

function defaultChannelState(channel: string, tokenProvided: boolean): ChannelSetupState {
  if (channel === 'telegram') {
    return {
      channel: 'telegram',
      configured: tokenProvided,
      ready: tokenProvided,
      validated: false,
      status: tokenProvided ? 'ready' : 'missing',
      detail: tokenProvided ? 'Telegram credentials are configured.' : 'Telegram is not configured.',
    };
  }
  if (channel === 'feishu') {
    return {
      channel: 'feishu',
      configured: tokenProvided,
      ready: tokenProvided,
      validated: false,
      status: tokenProvided ? 'ready' : 'missing',
      detail: tokenProvided ? 'Feishu credentials are configured.' : 'Feishu is not configured.',
    };
  }
  if (channel === 'weixin') {
    return {
      channel: 'weixin',
      configured: tokenProvided,
      ready: tokenProvided,
      validated: false,
      status: tokenProvided ? 'ready' : 'missing',
      detail: tokenProvided ? 'Weixin credentials are configured.' : 'Weixin is not configured.',
    };
  }
  if (channel === 'slack') {
    return {
      channel: 'slack',
      configured: tokenProvided,
      ready: tokenProvided,
      validated: false,
      status: tokenProvided ? 'ready' : 'missing',
      detail: tokenProvided ? 'Slack credentials are configured.' : 'Slack is not configured.',
    };
  }
  if (channel === 'discord') {
    return {
      channel: 'discord',
      configured: tokenProvided,
      ready: tokenProvided,
      validated: false,

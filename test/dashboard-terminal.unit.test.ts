import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectSetupState, isSetupReady } from '../src/cli/onboarding.ts';
import type { AgentInfo } from '../src/agent/index.ts';
import { captureEnv, makeTmpDir, restoreEnv } from './support/env.ts';

const CHANNEL_ENV_KEYS = [
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_CHAT_IDS',
  'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_ALLOWED_CHAT_IDS',
  'WEIXIN_BASE_URL', 'WEIXIN_BOT_TOKEN', 'WEIXIN_ACCOUNT_ID',
  'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'DISCORD_BOT_TOKEN',
  'DINGTALK_CLIENT_ID', 'DINGTALK_CLIENT_SECRET', 'WECOM_BOT_ID', 'WECOM_BOT_SECRET',
] as const;

const ISOLATION_ENV_KEYS = ['PIKILOOM_CONFIG', 'PIKILOOM_WORKDIR', 'DEFAULT_AGENT', ...CHANNEL_ENV_KEYS] as const;

function isolatedChannellessConfig(): void {
  for (const key of CHANNEL_ENV_KEYS) delete process.env[key];
  const path = `${makeTmpDir('dash-terminal-config-')}/setting.json`;
  fs.writeFileSync(path, JSON.stringify({ version: 1 }));
  process.env.PIKILOOM_CONFIG = path;
  process.env.PIKILOOM_WORKDIR = makeTmpDir('dash-terminal-workdir-');
}

function agent(id: AgentInfo['agent'], installed: boolean): AgentInfo {
  return { agent: id, installed, path: installed ? `/usr/bin/${id}` : null, version: null };
}

const CLAUDE_ONLY = [agent('claude', true), agent('codex', false)];
const NONE = [agent('claude', false), agent('codex', false)];

describe('isSetupReady — dashboard is a first-class terminal', () => {
  it('is ready with an installed agent and NO channel configured', () => {
    const state = collectSetupState({ agents: CLAUDE_ONLY, channel: 'telegram', tokenProvided: false });
    expect(isSetupReady(state)).toBe(true);
  });


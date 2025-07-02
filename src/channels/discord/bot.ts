import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  Bot,
  buildPrompt,
  fmtUptime,
  fmtBytes,
  formatGitStatusLine,
  normalizeAgent,
  parseAllowedChatIds,
  type SessionRuntime,
  type StreamResult,
} from '../../bot/bot.js';
import { BOT_SHUTDOWN_FORCE_EXIT_MS, buildSessionTaskId } from '../../bot/orchestration.js';
import { shutdownAllDrivers } from '../../agent/driver.js';
import { expandTilde } from '../../core/platform.js';
import type { McpSendFileCallback } from '../../agent/mcp/bridge.js';
import {
  registerProcessRuntime,
  requestProcessRestart,
} from '../../core/process-control.js';
import {
  getStatusDataAsync,
  getHostDataSync,
  getAgentsListData,
  getSkillsListData,
  getModelsListData,
  getSessionsPageData,
  getSessionsDigestData,
  formatSessionsDigestText,
  getStartData,
  getWorkspacesData,
} from '../../bot/commands.js';
import { buildUsageOverviewLines } from '../../bot/render-shared.js';
import { DiscordChannel, type DiscordContext, type DiscordMessagePayload } from './channel.js';
import { getActiveUserConfig } from '../../core/config/user-config.js';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

const SHUTDOWN_EXIT_CODE: Record<ShutdownSignal, number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

export class DiscordBot extends Bot {
  private botToken: string;
  private channel!: DiscordChannel;
  private nextTaskId = 1;
  private shutdownInFlight = false;
  private shutdownExitCode: number | null = null;
  private shutdownForceExitTimer: ReturnType<typeof setTimeout> | null = null;
  private signalHandlers: Partial<Record<ShutdownSignal, () => void>> = {};
  private processRuntimeCleanup: (() => void) | null = null;

  constructor() {
    super();
    const config = getActiveUserConfig();
    if (process.env.DISCORD_ALLOWED_CHANNEL_IDS) {
      for (const id of parseAllowedChatIds(process.env.DISCORD_ALLOWED_CHANNEL_IDS)) this.allowedChatIds.add(id);
    }
    this.botToken = String(config.discordBotToken || process.env.DISCORD_BOT_TOKEN || '').trim();
    if (!this.botToken) {
      throw new Error('Missing Discord credentials. Configure discordBotToken.');
    }
  }

  public override requestStop(): void {
    super.requestStop();
    try { this.channel?.disconnect(); } catch {}
  }

  protected override onManagedConfigChange(config: Record<string, any>, opts: { initial?: boolean } = {}) {
    const next = String(config.discordBotToken || process.env.DISCORD_BOT_TOKEN || '').trim();
    if (next && next !== this.botToken) {
      this.botToken = next;
      if (!opts.initial) this.log('discord botToken reloaded from setting.json');
    }
  }

  private installSignalHandlers() {
    this.removeSignalHandlers();
    const onSigint = () => this.beginShutdown('SIGINT');
    const onSigterm = () => this.beginShutdown('SIGTERM');
    this.signalHandlers = { SIGINT: onSigint, SIGTERM: onSigterm };
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
  }

  private removeSignalHandlers() {
    for (const signal of Object.keys(this.signalHandlers) as ShutdownSignal[]) {
      const handler = this.signalHandlers[signal];
      if (handler) process.off(signal, handler);
    }
    this.signalHandlers = {};

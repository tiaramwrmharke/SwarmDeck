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
import { SlackChannel, type SlackContext, type SlackMessagePayload } from './channel.js';
import { getActiveUserConfig } from '../../core/config/user-config.js';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

const SHUTDOWN_EXIT_CODE: Record<ShutdownSignal, number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

export class SlackBot extends Bot {
  private botToken: string;
  private appToken: string;
  private channel!: SlackChannel;
  private nextTaskId = 1;
  private shutdownInFlight = false;
  private shutdownExitCode: number | null = null;
  private shutdownForceExitTimer: ReturnType<typeof setTimeout> | null = null;
  private signalHandlers: Partial<Record<ShutdownSignal, () => void>> = {};
  private processRuntimeCleanup: (() => void) | null = null;

  constructor() {
    super();
    const config = getActiveUserConfig();
    if (process.env.SLACK_ALLOWED_CHANNEL_IDS) {
      for (const id of parseAllowedChatIds(process.env.SLACK_ALLOWED_CHANNEL_IDS)) this.allowedChatIds.add(id);
    }
    this.botToken = String(config.slackBotToken || process.env.SLACK_BOT_TOKEN || '').trim();
    this.appToken = String(config.slackAppToken || process.env.SLACK_APP_TOKEN || '').trim();
    if (!this.botToken || !this.appToken) {
      throw new Error('Missing Slack credentials. Configure slackBotToken and slackAppToken.');
    }
  }

  public override requestStop(): void {
    super.requestStop();
    try { this.channel?.disconnect(); } catch {}
  }

  protected override onManagedConfigChange(config: Record<string, any>, opts: { initial?: boolean } = {}) {
    const nextBotToken = String(config.slackBotToken || process.env.SLACK_BOT_TOKEN || '').trim();
    const nextAppToken = String(config.slackAppToken || process.env.SLACK_APP_TOKEN || '').trim();
    if (nextBotToken && nextBotToken !== this.botToken) {
      this.botToken = nextBotToken;
      if (!opts.initial) this.log('slack botToken reloaded from setting.json');
    }
    if (nextAppToken && nextAppToken !== this.appToken) {
      this.appToken = nextAppToken;
      if (!opts.initial) this.log('slack appToken reloaded from setting.json');
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
  }

  private clearShutdownForceExitTimer() {
    if (!this.shutdownForceExitTimer) return;
    clearTimeout(this.shutdownForceExitTimer);
    this.shutdownForceExitTimer = null;
  }

  private cleanupRuntimeForExit() {
    try { this.channel.disconnect(); } catch {}
    this.stopKeepAlive();
    shutdownAllDrivers();
  }

  private beginShutdown(signal: ShutdownSignal) {
    if (this.shutdownInFlight) return;
    this.shutdownInFlight = true;
    this.shutdownExitCode = SHUTDOWN_EXIT_CODE[signal];
    this.log(`${signal}, shutting down...`);
    this.cleanupRuntimeForExit();
    this.clearShutdownForceExitTimer();
    this.shutdownForceExitTimer = setTimeout(() => {
      this.log(`shutdown still pending after ${Math.floor(BOT_SHUTDOWN_FORCE_EXIT_MS / 1000)}s, forcing exit`);
      process.exit(this.shutdownExitCode ?? 1);
    }, BOT_SHUTDOWN_FORCE_EXIT_MS);
    this.shutdownForceExitTimer.unref?.();
  }

  private resolveSession(chatId: string, title: string, files: string[]): SessionRuntime {
    return this.ensureSessionForChat(chatId, title, files);
  }

  private async handleCommand(text: string, ctx: SlackContext): Promise<boolean> {
    const [rawCommand, ...rest] = text.trim().slice(1).split(/\s+/);
    const command = rawCommand?.toLowerCase() || '';
    const args = rest.join(' ').trim();
    switch (command) {
      case 'help':
        await ctx.reply([
          '/help - Show commands',
          '/new - New session',
          '/status - Session status',
          '/host - Host system info',
          '/agent [codex|claude|gemini] - Switch agent',
          '/models [name|#] - Switch model',
          '/mode [plan|code] - Toggle plan mode (claude only)',
          '/switch [path] - Change workdir',
          '/workspaces [#] - Pick saved workspace',
          '/sessions [new|#] - List/switch sessions',
          '/digest - Recent session digest',
          '/skills - List project skills',
          '/stop - Stop current task',
          '/restart - Restart swarmdeck',
        ].join('\n'));
        return true;
      case 'new': {

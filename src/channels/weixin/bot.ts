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
  type ImTaskPresenter,
  type ImTaskPresenterOpts,
  type SessionRuntime,
  type StreamResult,
} from '../../bot/bot.js';
import {
  currentHumanLoopQuestion,
  type HumanLoopPromptState,
  type ResolvedHumanLoopAnswers,
} from '../../bot/human-loop.js';
import {
  buildAgentsCommandView,
  buildModeCommandView,
  buildModelsCommandView,
  buildSessionsCommandView,
  buildSkillsCommandView,
  decodeCommandAction,
  encodeCommandAction,
  executeCommandAction,
  type CommandActionButton,
  type CommandActionResult,
  type CommandSelectionView,
} from '../../bot/command-ui.js';
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
  handleGoalCommand,
} from '../../bot/commands.js';
import { buildUsageOverviewLines } from '../../bot/render-shared.js';
import { WeixinChannel, type WeixinContext, type WeixinMessagePayload } from './channel.js';
import { getActiveUserConfig } from '../../core/config/user-config.js';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

const SHUTDOWN_EXIT_CODE: Record<ShutdownSignal, number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

function buildInteractionEchoPlain(summary: ResolvedHumanLoopAnswers): string | null {
  if (summary.status === 'cancelled') return '⊘ Prompt cancelled.';
  if (!summary.rows.length) return null;
  if (summary.rows.length === 1) {
    return `✓ Answered · ${summary.rows[0].display}`;
  }
  const lines = ['✓ Answered'];
  for (const row of summary.rows) {
    lines.push(`• ${row.label}: ${row.display}`);
  }
  return lines.join('\n');
}

export class WeixinBot extends Bot {
  private botToken: string;
  private accountId: string;
  private baseUrl: string;
  private channel!: WeixinChannel;
  private nextTaskId = 1;
  private shutdownInFlight = false;
  private shutdownExitCode: number | null = null;
  private shutdownForceExitTimer: ReturnType<typeof setTimeout> | null = null;
  private signalHandlers: Partial<Record<ShutdownSignal, () => void>> = {};
  private processRuntimeCleanup: (() => void) | null = null;

  constructor() {
    super();
    const config = getActiveUserConfig();
    if (process.env.WEIXIN_ALLOWED_USER_IDS) {
      for (const id of parseAllowedChatIds(process.env.WEIXIN_ALLOWED_USER_IDS)) this.allowedChatIds.add(id);
    }
    this.baseUrl = String(config.weixinBaseUrl || process.env.WEIXIN_BASE_URL || '').trim();
    this.botToken = String(config.weixinBotToken || process.env.WEIXIN_BOT_TOKEN || '').trim();
    this.accountId = String(config.weixinAccountId || process.env.WEIXIN_ACCOUNT_ID || '').trim();
    if (!this.baseUrl || !this.botToken || !this.accountId) {
      throw new Error('Missing Weixin credentials. Configure via dashboard QR login first.');
    }
  }

  public override requestStop(): void {
    super.requestStop();
    try { this.channel?.disconnect(); } catch {}
  }

  protected override onManagedConfigChange(config: Record<string, any>, opts: { initial?: boolean } = {}) {
    const nextBaseUrl = String(config.weixinBaseUrl || process.env.WEIXIN_BASE_URL || '').trim();
    const nextBotToken = String(config.weixinBotToken || process.env.WEIXIN_BOT_TOKEN || '').trim();
    const nextAccountId = String(config.weixinAccountId || process.env.WEIXIN_ACCOUNT_ID || '').trim();
    if (nextBaseUrl && nextBaseUrl !== this.baseUrl) {
      this.baseUrl = nextBaseUrl;
      if (!opts.initial) this.log('weixin baseUrl reloaded from setting.json');
    }
    if (nextBotToken && nextBotToken !== this.botToken) {
      this.botToken = nextBotToken;
      if (!opts.initial) this.log('weixin botToken reloaded from setting.json');
    }
    if (nextAccountId && nextAccountId !== this.accountId) {
      this.accountId = nextAccountId;
      if (!opts.initial) this.log('weixin accountId reloaded from setting.json');
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

  private async handleCommand(text: string, ctx: WeixinContext): Promise<boolean> {
    const [rawCommand, ...rest] = text.trim().slice(1).split(/\s+/);
    const command = rawCommand?.toLowerCase() || '';
    const args = rest.join(' ').trim();

    if (command === 'cancel' || command === 'quit') {
      const pending = this.pendingHumanLoopPrompt(ctx.chatId);
      if (pending) {
        this.humanLoopCancel(pending.promptId, 'Cancelled by user.');
      } else {
        await ctx.reply('没有正在等待的交互。');
      }
      return true;
    }

    const pendingPrompt = this.pendingHumanLoopPrompt(ctx.chatId);
    if (pendingPrompt) {
      this.humanLoopCancel(pendingPrompt.promptId, 'Cancelled — new command issued.');
    }

    switch (command) {
      case 'help':
        await ctx.reply([
          '/help - Show commands',
          '/new - New session',
          '/status - Session status',
          '/host - Host system info',
          '/agent [codex|claude|gemini] - Switch agent (interactive when no arg)',
          '/models [name|#] - Switch model (interactive when no arg)',
          '/mode [plan|code] - Toggle plan mode (claude only)',
          '/switch [path] - Change workdir',
          '/workspaces [#] - Pick saved workspace',
          '/sessions [new|#] - List/switch sessions',
          '/digest - Recent session digest',
          '/skills - List & run project skills',
          '/cancel - Cancel an active interactive prompt',
          '/stop - Stop current task',
          '/restart - Restart swarmdeck',
        ].join('\n'));
        return true;
      case 'new': {
        this.resetConversationForChat(ctx.chatId);
        await ctx.reply('Started a new session.');
        return true;
      }
      case 'status':
        await this.cmdStatus(ctx);
        return true;
      case 'host':
        await this.cmdHost(ctx);
        return true;
      case 'agent':
        await this.cmdAgent(ctx, args);
        return true;
      case 'models':
        await this.cmdModels(ctx, args);
        return true;
      case 'mode':
        await this.cmdMode(ctx, args);
        return true;
      case 'switch':
        await this.cmdSwitch(ctx, args);
        return true;
      case 'workspaces':
        await this.cmdWorkspaces(ctx, args);
        return true;
      case 'sessions':
        await this.cmdSessions(ctx, args);
        return true;
      case 'digest':
        await this.cmdDigest(ctx);
        return true;
      case 'skills':
        await this.cmdSkills(ctx);
        return true;
      case 'goal':
        await this.cmdGoal(ctx, args);
        return true;
      case 'stop':
        await this.cmdStop(ctx);
        return true;
      case 'restart':
        await this.cmdRestart(ctx);
        return true;
      case 'start':
        await this.cmdStart(ctx);
        return true;
      default:
        return false;
    }
  }

  private async cmdStart(ctx: WeixinContext) {
    const d = getStartData(this, ctx.chatId);
    const lines = [`swarmdeck v${d.version}`, `Workdir: ${d.workdir}`, '', `Agent: ${d.agent}`];
    for (const a of d.agentDetails) {
      const parts = [`  ${a.agent}: ${a.model}`];
      if (a.effort) parts[0] += ` (effort: ${a.effort})`;
      lines.push(parts[0]);
    }
    lines.push('', 'Ready. Send a message to start.');
    await ctx.reply(lines.join('\n'));
  }

  private async cmdDigest(ctx: WeixinContext) {
    const data = await getSessionsDigestData(this, ctx.chatId);
    await ctx.reply(formatSessionsDigestText(data));
  }

  private async cmdStatus(ctx: WeixinContext) {
    const d = await getStatusDataAsync(this, ctx.chatId);
    const gitLine = formatGitStatusLine(d.git);
    const lines = [
      `swarmdeck v${d.version}`,
      `Uptime: ${fmtUptime(d.uptime)}`,
      `PID: ${d.pid} | RSS: ${fmtBytes(d.memRss)} | Heap: ${fmtBytes(d.memHeap)}`,
      `Workdir: ${d.workdir}`,
      ...(gitLine ? [`Git: ${gitLine}`] : []),
      '',
      `Agent: ${d.agent}`,
      `Model: ${d.model || '-'}`,
      `Session: ${d.sessionId ? d.sessionId.slice(0, 16) : '(new)'}`,
      `Tasks: ${d.activeTasksCount}`,
    ];
    if (d.running) {
      lines.push(`Running: ${fmtUptime(Date.now() - d.running.startedAt)}`);
    }
    for (const line of buildUsageOverviewLines(d.usageOverview)) lines.push(line.text);
    await ctx.reply(lines.join('\n'));
  }

  private async cmdHost(ctx: WeixinContext) {
    const d = getHostDataSync(this);
    const lines = [
      `Host: ${d.hostName}`,
      `CPU: ${d.cpuModel} x${d.cpuCount}`,
    ];
    if (d.cpuUsage) {

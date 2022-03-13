import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  Bot, type Agent, type SessionRuntime, type StreamResult,
  type ImTaskPresenter, type ImTaskPresenterOpts,
  fmtTokens, fmtUptime, fmtBytes, buildPrompt, formatGitStatusLine,
  parseAllowedChatIds,
} from '../../bot/bot.js';
import {
  BOT_SHUTDOWN_FORCE_EXIT_MS,
  SessionMessageRegistry,
  buildBotMenuState,
  buildKnownChatEnv,
  buildSessionTaskId,
} from '../../bot/orchestration.js';
import {
  stageSessionFiles,
} from '../../agent/index.js';
import type { McpSendFileCallback } from '../../agent/mcp/bridge.js';
import { shutdownAllDrivers } from '../../agent/driver.js';
import {
  SKILL_CMD_PREFIX,
} from '../../bot/menu.js';
import {
  getStartData,
  type StartData,
  getStatusDataAsync,
  getHostDataSync,
  getSessionTurnPreviewData,
  getWorkspacesData,
  resolveSkillPrompt,
  summarizePromptForStatus,
  handleGoalCommand,
  getSessionsDigestData,
  formatSessionsDigestText,
} from '../../bot/commands.js';
import {
  buildAgentsCommandView,
  buildModelsCommandView,
  buildModeCommandView,
  buildSessionsCommandView,
  buildSkillsCommandView,
  decodeCommandAction,
  executeCommandAction,
  type CommandActionResult,
  type CommandSelectionView,
} from '../../bot/command-ui.js';
import { buildSwitchWorkdirView, buildWorkspacesView, resolveRegisteredPath } from './directory.js';
import { LivePreview, type LivePreviewRenderer } from './live-preview.js';
import {
  registerProcessRuntime,
  buildRestartCommand,
  requestProcessRestart,
} from '../../core/process-control.js';
import {
  buildInitialPreviewHtml,
  buildHumanLoopPromptHtml,
  buildAnsweredHumanLoopPromptHtml,
  buildStreamPreviewHtml,
  buildFinalReplyRender,
  dispatchImageBlocks,
  escapeHtml,
  formatMenuLines,
  formatUsageOverviewLines,
  renderCommandNoticeHtml,
  renderCommandSelectionHtml,
  renderCommandSelectionKeyboard,
  renderSessionTurnHtml,
  truncateMiddle,
  unpackCallbackData,
} from './render.js';
import { currentHumanLoopQuestion, humanLoopOptionSelected, type HumanLoopPromptState, type ResolvedHumanLoopAnswers } from '../../bot/human-loop.js';
import { TelegramChannel, type TgContext, type TgCallbackContext, type TgMessage } from './channel.js';
import { splitText, supportsChannelCapability } from '../base.js';
import { getActiveUserConfig, loadKnownChatIds } from '../../core/config/user-config.js';
import { VERSION } from '../../core/version.js';

const telegramPreviewRenderer: LivePreviewRenderer = {
  renderInitial: buildInitialPreviewHtml,
  renderStream: buildStreamPreviewHtml,
};

function buildInteractionEchoHtml(summary: ResolvedHumanLoopAnswers): string | null {
  if (summary.status === 'cancelled') {
    return `<i>⊘ Prompt cancelled.</i>`;
  }
  if (!summary.rows.length) return null;
  if (summary.rows.length === 1) {
    return `<b>✓ Answered</b> · ${escapeHtml(summary.rows[0].display)}`;
  }
  const lines = ['<b>✓ Answered</b>'];
  for (const row of summary.rows) {
    lines.push(`• ${escapeHtml(row.label)}: ${escapeHtml(row.display)}`);
  }
  return lines.join('\n');
}

type ShutdownSignal = 'SIGINT' | 'SIGTERM';
type ProcessSignal = ShutdownSignal | 'SIGUSR2';

const SHUTDOWN_EXIT_CODE: Record<ShutdownSignal, number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

export class TelegramBot extends Bot {
  private token: string;
  private channel!: TelegramChannel;
  private sessionMessages = new SessionMessageRegistry<number, number>();
  private nextTaskId = 1;
  private shutdownInFlight = false;
  private shutdownExitCode: number | null = null;
  private shutdownForceExitTimer: ReturnType<typeof setTimeout> | null = null;
  private signalHandlers: Partial<Record<ProcessSignal, () => void>> = {};
  private processRuntimeCleanup: (() => void) | null = null;

  constructor() {
    super();
    const config = getActiveUserConfig();
    if (config.telegramAllowedChatIds) {
      for (const id of parseAllowedChatIds(config.telegramAllowedChatIds)) this.allowedChatIds.add(id);
    }
    this.token = String(config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!this.token) throw new Error('Missing Telegram token. Configure via dashboard or set TELEGRAM_BOT_TOKEN');
  }

  public override requestStop(): void {
    super.requestStop();
    try { this.channel?.disconnect(); } catch {}
  }

  protected override onManagedConfigChange(config: Record<string, any>, opts: { initial?: boolean } = {}) {
    const nextToken = String(config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (nextToken && nextToken !== this.token) {
      this.token = nextToken;
      if (!opts.initial) this.log('telegram token reloaded from setting.json');
    }

    const mergedAllowed = parseAllowedChatIds(process.env.PIKILOOM_ALLOWED_IDS || '');
    for (const id of parseAllowedChatIds(String(config.telegramAllowedChatIds || ''))) mergedAllowed.add(id);
    this.allowedChatIds = mergedAllowed;
  }

  private static readonly SKILL_CMD_PREFIX = SKILL_CMD_PREFIX;

  async setupMenu() {
    if (!supportsChannelCapability((this as any).channel, 'commandMenu')) return;
    const { commands, skillCount } = buildBotMenuState(this);
    await this.channel.setMenu(commands);
    this.log(`menu: ${commands.length} commands (${skillCount} skills)`);
  }

  protected override afterSwitchWorkdir(_oldPath: string, _newPath: string) {
    if (!(this as any).channel) return;
    void this.setupMenu().catch(err => this.log(`menu refresh failed after workdir switch: ${err}`));
  }

  private clearShutdownForceExitTimer() {
    if (!this.shutdownForceExitTimer) return;
    clearTimeout(this.shutdownForceExitTimer);
    this.shutdownForceExitTimer = null;
  }

  private removeSignalHandlers() {
    for (const sig of Object.keys(this.signalHandlers) as ProcessSignal[]) {
      const handler = this.signalHandlers[sig];
      if (handler) process.off(sig, handler);
    }
    this.signalHandlers = {};
  }

  private installSignalHandlers() {
    this.removeSignalHandlers();

    const onSigint = () => this.beginShutdown('SIGINT');
    const onSigterm = () => this.beginShutdown('SIGTERM');
    const onSigusr2 = () => this.performRestart();

    this.signalHandlers = {
      SIGINT: onSigint,
      SIGTERM: onSigterm,
      SIGUSR2: onSigusr2,
    };

    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    process.on('SIGUSR2', onSigusr2);
  }

  private cleanupRuntimeForExit() {
    try { this.channel.disconnect(); } catch {}
    this.stopKeepAlive();
    shutdownAllDrivers();
  }

  private buildRestartEnv(): Record<string, string> {
    return buildKnownChatEnv(this.allowedChatIds, [], 'TELEGRAM_ALLOWED_CHAT_IDS');
  }

  private beginShutdown(sig: ShutdownSignal) {
    if (this.shutdownInFlight) return;

    this.shutdownInFlight = true;
    this.shutdownExitCode = SHUTDOWN_EXIT_CODE[sig];
    this.log(`${sig}, shutting down...`);

    this.cleanupRuntimeForExit();

    this.clearShutdownForceExitTimer();
    this.shutdownForceExitTimer = setTimeout(() => {
      this.log(`shutdown still pending after ${Math.floor(BOT_SHUTDOWN_FORCE_EXIT_MS / 1000)}s, forcing exit`);
      process.exit(this.shutdownExitCode ?? 1);
    }, BOT_SHUTDOWN_FORCE_EXIT_MS);
    this.shutdownForceExitTimer.unref?.();
  }

  private performRestart() {
    this.cleanupRuntimeForExit();
    const { bin, args } = buildRestartCommand(process.argv.slice(2));
    const child = spawn(bin, args, {
      stdio: 'inherit',
      detached: true,
      env: {
        ...process.env,
        npm_config_yes: process.env.npm_config_yes || 'true',
      },
    });
    child.unref();
    process.exit(0);
  }

  private createTaskId(session: SessionRuntime): string {
    return buildSessionTaskId(session, this.nextTaskId++);
  }

  private registerSessionMessage(chatId: number, messageId: number | null | undefined, session: SessionRuntime) {
    this.sessionMessages.register(chatId, messageId, session, session.workdir);
  }

  private registerSessionMessages(chatId: number, messageIds: Array<number | null | undefined>, session: SessionRuntime) {
    this.sessionMessages.registerMany(chatId, messageIds, session, session.workdir);
  }

  private sessionFromMessage(chatId: number, messageId: number | null | undefined): SessionRuntime | null {
    const sessionRef = this.sessionMessages.resolve(chatId, messageId);
    if (!sessionRef) return null;
    return this.getSessionRuntimeByKey(sessionRef.key, { allowAnyWorkdir: true })
      || this.hydrateSessionRuntime(sessionRef);
  }

  private ensureSession(chatId: number, title: string, files: string[]): SessionRuntime {
    return this.ensureSessionForChat(chatId, title, files);
  }

  private resolveIncomingSession(ctx: TgContext, text: string, files: string[]): SessionRuntime {
    const cs = this.chat(ctx.chatId);
    const replyMessageId = typeof ctx.raw?.reply_to_message?.message_id === 'number'
      ? ctx.raw.reply_to_message.message_id
      : null;
    const repliedSession = this.sessionFromMessage(ctx.chatId, replyMessageId);
    if (repliedSession) {
      this.log(`[resolveSession] reply matched session=${repliedSession.sessionId} chat=${ctx.chatId}`);
      this.applySessionSelection(cs, repliedSession);
      return repliedSession;
    }

    const selected = this.getSelectedSession(cs);
    if (selected) return selected;
    return this.ensureSession(ctx.chatId, text, files);
  }

  private async cmdStart(ctx: TgContext) {
    const d = getStartData(this, ctx.chatId);
    await ctx.reply(this.renderStartHtml(d), { parseMode: 'HTML' });
  }

  private renderStartHtml(d: StartData): string {
    const lines = [
      `<b>${escapeHtml(d.title)}</b> v${escapeHtml(d.version)}`,
      escapeHtml(d.subtitle),
      '',
      `<b>Agent:</b> ${escapeHtml(d.agent)}`,
      `<b>Workdir:</b> <code>${escapeHtml(d.workdir)}</code>`,
      '',
      '<b>Agents</b>',
      ...d.agentDetails.map(a => {
        const parts = [`  <b>${escapeHtml(a.agent)}</b>: ${escapeHtml(a.model)}`];
        if (a.effort) parts[0] += ` (effort: ${escapeHtml(a.effort)})`;
        return parts[0];
      }),
      '',
      '<b>Commands</b>',
      ...formatMenuLines(d.commands),
    ];
    return lines.join('\n');
  }

  private async cmdSkills(ctx: TgContext) {
    await this.sendCommandView(ctx, buildSkillsCommandView(this, ctx.chatId));
  }

  private async cmdExt(ctx: TgContext) {
    const { getExtensionSummaryData } = await import('../../bot/commands.js');
    const data = getExtensionSummaryData(this, ctx.chatId);
    const lines: string[] = ['<b>Extensions</b>', ''];

    lines.push(`<b>MCP Servers</b> (${data.mcpCount})`);
    if (data.mcpExtensions.length === 0) {
      lines.push('  <i>No MCP extensions configured</i>');
    } else {
      for (const ext of data.mcpExtensions) {
        const icon = ext.enabled ? '●' : '○';
        const scope = ext.scope === 'global' ? '[G]' : ext.scope === 'workspace' ? '[W]' : '[B]';
        lines.push(`  ${icon} ${scope} <b>${escapeHtml(ext.name)}</b>`);
        if (ext.command) lines.push(`    <code>${escapeHtml(ext.command.slice(0, 80))}</code>`);
      }
    }

    lines.push('');

    lines.push(`<b>Skills</b> (${data.skillCount})`);
    if (data.skills.length === 0) {
      lines.push('  <i>No skills installed</i>');
    } else {
      for (const skill of data.skills) {
        const scope = skill.scope === 'global' ? '[G]' : '[P]';
        lines.push(`  ${scope} <b>${escapeHtml(skill.label)}</b> <i>(${escapeHtml(skill.name)})</i>`);
      }
    }

    lines.push('', '<i>Manage extensions in the Dashboard → Extensions tab.</i>');

    await ctx.reply(lines.join('\n'), { parseMode: 'HTML' });
  }

  private async sendCommandView(ctx: TgContext, view: CommandSelectionView) {
    await ctx.reply(
      renderCommandSelectionHtml(view),
      { parseMode: 'HTML', keyboard: renderCommandSelectionKeyboard(view) },
    );
  }

  private async replyCommandResult(ctx: TgContext, result: CommandActionResult) {
    if (result.kind === 'view') {
      await this.sendCommandView(ctx, result.view);
      return;
    }
    if (result.kind === 'skill') {
      await this.handleMessage({ text: result.prompt, files: [] }, ctx);
      return;
    }
    if (result.kind === 'notice') {
      const sent = await ctx.reply(renderCommandNoticeHtml(result.notice), { parseMode: 'HTML' });
      if (result.session && typeof sent === 'number') this.registerSessionMessage(ctx.chatId, sent, result.session);
      if (result.previewSession) {
        await this.previewCurrentSessionTurn(ctx.chatId, result.previewSession.agent, result.previewSession.sessionId);
      }
      return;
    }
    await ctx.reply(escapeHtml(result.message), { parseMode: 'HTML' });
  }

  private async applyCommandCallbackResult(ctx: TgCallbackContext, result: CommandActionResult) {
    if (result.kind === 'noop') {
      await ctx.answerCallback(result.message);
      return;
    }
    if (result.kind === 'view') {
      await ctx.editReply(
        ctx.messageId,
        renderCommandSelectionHtml(result.view),
        { parseMode: 'HTML', keyboard: renderCommandSelectionKeyboard(result.view) },
      );
      await ctx.answerCallback(result.callbackText ?? undefined);
      return;
    }
    if (result.kind === 'skill') {
      await ctx.answerCallback(result.callbackText ?? undefined);
      await this.handleMessage({ text: result.prompt, files: [] }, ctx);
      return;
    }
    await ctx.answerCallback(result.callbackText ?? undefined);
    await ctx.editReply(ctx.messageId, renderCommandNoticeHtml(result.notice), { parseMode: 'HTML' });
    if (result.session) this.registerSessionMessage(ctx.chatId, ctx.messageId, result.session);
    if (result.previewSession) {
